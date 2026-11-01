import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const DEFAULT_URL = new URL('../config/default.json', import.meta.url)
const USER_URL = new URL('../config/user.json', import.meta.url)

const ALLOWED_KEYS = new Set([
  'endpoint',
  'allowedHosts',
  'requestTimeoutMs',
  'cacheTtlSeconds',
  'cooldownSeconds',
  'defaultTopN',
  'maxTopN',
  'includeMacroByDefault',
  'userAgent',
  'referer'
])

let cached = null

async function readJsonIfExists (url) {
  try {
    const raw = await fs.readFile(fileURLToPath(url), 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (err && err.code === 'ENOENT') return null
    throw new Error(`配置文件解析失败 (${url.pathname}): ${err.message}`)
  }
}

function sanitize (input, base) {
  const out = { ...base }
  if (!input || typeof input !== 'object') return out

  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_KEYS.has(key)) continue

    switch (key) {
      case 'endpoint':
      case 'userAgent':
      case 'referer':
        if (typeof value === 'string' && value.length > 0) out[key] = value
        break
      case 'allowedHosts':
        if (Array.isArray(value) && value.every(v => typeof v === 'string')) out[key] = value.slice()
        break
      case 'requestTimeoutMs':
      case 'cacheTtlSeconds':
      case 'cooldownSeconds':
      case 'defaultTopN':
      case 'maxTopN':
        if (Number.isInteger(value) && value > 0) out[key] = value
        break
      case 'includeMacroByDefault':
        if (typeof value === 'boolean') out[key] = value
        break
    }
  }

  return out
}

export async function loadConfig (force = false) {
  if (cached && !force) return cached
  const base = await readJsonIfExists(DEFAULT_URL)
  if (!base) throw new Error('缺少 config/default.json')
  const user = await readJsonIfExists(USER_URL)
  cached = sanitize(user, base)
  return cached
}
