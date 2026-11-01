import { requestJson } from './Request.js'
import { normalizeList } from '../models/normalize.js'
import { loadConfig } from '../components/Config.js'

const KEY_TEAMS = 'yuanshen-dps-plugin:v1:teams'
const KEY_META = 'yuanshen-dps-plugin:v1:teams:meta'

const inFlight = new Map()

function getRedis () {
  const r = globalThis.redis
  if (!r || typeof r.get !== 'function' || typeof r.set !== 'function') {
    throw new Error('宿主未提供可用的 Redis 客户端')
  }
  return r
}

async function readCache () {
  try {
    const redis = getRedis()
    const [raw, metaRaw] = await Promise.all([redis.get(KEY_TEAMS), redis.get(KEY_META)])
    if (!raw) return null
    const teams = JSON.parse(raw)
    if (!Array.isArray(teams)) return null
    let meta = null
    if (metaRaw) {
      try { meta = JSON.parse(metaRaw) } catch { meta = null }
    }
    return { teams, meta }
  } catch {
    return null
  }
}

async function writeCache (teams, meta) {
  try {
    const redis = getRedis()
    const cfg = await loadConfig()
    const ttl = cfg.cacheTtlSeconds
    await redis.set(KEY_TEAMS, JSON.stringify(teams), { EX: ttl })
    await redis.set(KEY_META, JSON.stringify(meta), { EX: ttl })
  } catch {
    // 缓存写入失败不阻断查询
  }
}

async function fetchRemote () {
  const cfg = await loadConfig()
  const raw = await requestJson(cfg.endpoint, {
    allowedHosts: cfg.allowedHosts,
    timeoutMs: cfg.requestTimeoutMs,
    userAgent: cfg.userAgent,
    referer: cfg.referer
  })
  const teams = normalizeList(raw)
  if (teams.length === 0) {
    throw new Error('接口返回空数据')
  }
  return teams
}

async function fetchWithMerge () {
  if (inFlight.has('teams')) return inFlight.get('teams')
  const p = (async () => {
    const teams = await fetchRemote()
    const meta = { fetchedAt: Date.now(), count: teams.length }
    await writeCache(teams, meta)
    return { teams, meta, fromCache: false }
  })().finally(() => inFlight.delete('teams'))
  inFlight.set('teams', p)
  return p
}

/**
 * 获取榜单数据。优先使用缓存；缓存缺失或过期时拉取；
 * 拉取失败时若有旧缓存则降级返回旧数据（stale=true）。
 */
export async function getTeams ({ force = false } = {}) {
  if (!force) {
    const cached = await readCache()
    if (cached) {
      return { teams: cached.teams, meta: cached.meta, fromCache: true, stale: false }
    }
  }

  try {
    return await fetchWithMerge()
  } catch (err) {
    const cached = await readCache()
    if (cached) {
      return { teams: cached.teams, meta: cached.meta, fromCache: true, stale: true, error: err }
    }
    throw err
  }
}
