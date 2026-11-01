// 本地预览生成器：读取快照 JSON，用 RankService 计算，把 mustache 模板渲染成静态 HTML。
// 仅用于开发预览，不属于插件运行时依赖。
import fs from 'node:fs/promises'
import path from 'node:path'
import { normalizeList } from '../models/normalize.js'
import { rank, buildViewModel } from '../services/RankService.js'

function escapeHtml (s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 极简 mustache 子集：{{var}} / {{#list}}...{{/list}} / {{^list}}...{{/list}} / {{.}}
function render (tpl, ctx) {
  let out = tpl

  // 先处理 section（循环）
  out = out.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, inner) => {
    const val = ctx[key]
    if (!Array.isArray(val) || val.length === 0) return ''
    return val.map(item => {
      const subCtx = typeof item === 'object' && item !== null ? { ...ctx, ...item, '.': item } : { ...ctx, '.': item }
      return render(inner, subCtx)
    }).join('')
  })

  // inverted section
  out = out.replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, inner) => {
    const val = ctx[key]
    if (Array.isArray(val) && val.length > 0) return ''
    if (!val) return render(inner, ctx)
    return ''
  })

  // 变量
  out = out.replace(/\{\{(\.|\w+)\}\}/g, (_, key) => {
    const v = ctx[key]
    if (v === undefined || v === null) return ''
    return escapeHtml(v)
  })

  return out
}

function decorateRows (rows) {
  return rows.map(r => ({
    ...r,
    rowClass: r.rank === 1 ? 'top1' : r.rank === 2 ? 'top2' : r.rank === 3 ? 'top3' : '',
    rankLabel: r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `#${r.rank}`,
    members: r.members.map(m => ({ ...m, highlightClass: m.highlight ? 'highlight' : '' }))
  }))
}

async function buildPreview (snapshotPath, templatePath, outPath, opts, title, subtitleExtra) {
  const raw = JSON.parse(await fs.readFile(snapshotPath, 'utf8'))
  const teams = normalizeList(raw)
  const result = rank(teams, opts)

  const viewModel = buildViewModel({
    rankResult: { ...result, rows: decorateRows(result.rows) },
    title,
    subtitle: subtitleExtra,
    meta: { fetchedAt: Date.now(), count: teams.length },
    stale: false
  })

  const tpl = await fs.readFile(templatePath, 'utf8')
  const html = render(tpl, viewModel)
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, html, 'utf8')
  console.log(`[preview] ${title} → ${outPath}  (rows=${result.rows.length}, total=${result.total})`)
}

const snapshot = 'D:/AgentWorkSpace/mhydps_dps.json'
const template = new URL('../resources/dps/index.html', import.meta.url)
const outDir = 'D:/AgentWorkSpace/tmp/mhydps-preview'

await buildPreview(snapshot, template, path.join(outDir, 'top10.html'),
  { topN: 10, includeMacro: false },
  '原神 DPS 榜',
  '默认榜单 · 已排除宏'
)

await buildPreview(snapshot, template, path.join(outDir, 'mavuika.html'),
  { character: '玛薇卡', topN: 10, includeMacro: false },
  'DPS · 玛薇卡',
  '含：玛薇卡 · 已排除宏'
)

await buildPreview(snapshot, template, path.join(outDir, 'mavuika-c6-main.html'),
  { character: '玛薇卡', mainCarry: true, constellation: { op: 'eq', value: 6 }, topN: 10, includeMacro: false },
  '主C · 玛薇卡',
  '主C：玛薇卡 · 6 命 · 已排除宏'
)

await buildPreview(snapshot, template, path.join(outDir, 'clean.html'),
  { cleanOnly: true, topN: 10, includeMacro: false },
  '绿玩 DPS 榜',
  '仅绿玩 · 已排除宏'
)
