import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { parseArgs } from 'node:util'
import artTemplate from 'art-template'
import { normalizeList } from '../models/normalize.js'
import { buildViewModel } from '../services/RankService.js'
import { resolveQuery, describeQuery, queryRank } from '../services/QueryService.js'
import { withCharacterAvatars } from '../components/Render.js'
import { loadConfig } from '../components/Config.js'

const { values } = parseArgs({
  options: {
    snapshot: { type: 'string' },
    'avatar-root': { type: 'string' },
    port: { type: 'string', default: '4173' }
  }
})

if (!values.snapshot || !values['avatar-root']) {
  throw new Error('用法：node tools/preview.mjs --snapshot <榜单JSON> --avatar-root <角色图片目录> [--port 4173]')
}

const port = Number(values.port)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口必须为 1–65535 的整数')
const avatarRoot = path.resolve(values['avatar-root'])
await fs.access(avatarRoot)
const snapshotPath = path.resolve(values.snapshot)
const teams = normalizeList(JSON.parse(await fs.readFile(snapshotPath, 'utf8')))
const meta = { fetchedAt: (await fs.stat(snapshotPath)).mtimeMs, count: teams.length }
const templateUrl = new URL('../resources/dps/index.html', import.meta.url)
const cfg = await loadConfig()
const pages = {
  '/': '#dps',
  '/top10.html': '#dps',
  '/mavuika.html': '#dps 玛薇卡',
  '/mavuika-c6-main.html': '#dps 玛薇卡 主c 6命',
  '/clean.html': '#dps 绿玩',
  '/page2.html': '#dps 第2页',
  '/raw.html': '#dps 不去重',
  '/empty.html': '#dps'
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end()
      return
    }
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    const pathname = url.pathname
    if (pathname.startsWith('/avatars/')) {
      const match = /^\/avatars\/([^/]+)\/imgs\/face\.webp$/.exec(pathname)
      const name = match ? decodeURIComponent(match[1]) : ''
      if (!name || name === '.' || name === '..' || /[\\/:\x00-\x1f]/.test(name)) {
        res.writeHead(404).end()
        return
      }
      const image = await fs.readFile(path.join(avatarRoot, name, 'imgs', 'face.webp'))
      res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' })
      res.end(req.method === 'HEAD' ? undefined : image)
      return
    }
    if (!Object.hasOwn(pages, pathname)) {
      res.writeHead(404).end()
      return
    }
    let opts
    let rankResult
    try {
      opts = resolveQuery(url.searchParams.get('q') ?? pages[pathname], cfg)
      rankResult = pathname === '/empty.html' && !url.searchParams.has('q')
        ? queryRank([], resolveQuery('#dps', cfg))
        : queryRank(teams, opts)
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end(err.message)
      return
    }
    const template = await fs.readFile(templateUrl, 'utf8')
    const viewModel = withCharacterAvatars(buildViewModel({ rankResult, ...describeQuery(opts), meta, stale: false }), '/avatars/')
    const html = artTemplate.render(template, viewModel)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(req.method === 'HEAD' ? undefined : html)
  } catch (err) {
    const status = err.code === 'ENOENT' ? 404 : err instanceof URIError ? 400 : 500
    if (status === 500) console.error(err)
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' }).end(status === 404 ? 'Not found' : 'Preview error')
  }
})

server.on('error', err => {
  console.error(`预览服务器启动失败：${err.message}`)
  process.exitCode = 1
})
server.listen(port, '127.0.0.1', () => {
  console.log(`预览地址：http://127.0.0.1:${port}`)
  console.log('页面：/top10.html /mavuika.html /mavuika-c6-main.html /clean.html /empty.html')
  console.log('图片仅由启动参数指定的目录提供，不复制到插件。修改模板后刷新即可。')
})
