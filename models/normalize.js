function isPlainObject (v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

export function normalizeRecord (raw) {
  if (!isPlainObject(raw)) return null

  const members = Array.isArray(raw.members)
    ? raw.members
        .filter(isPlainObject)
        .map(m => ({
          charId: typeof m.charId === 'string' ? m.charId : '',
          constellation: Number.isInteger(m.constellation) ? m.constellation : 0
        }))
        .filter(m => m.charId.length > 0)
    : []

  if (members.length === 0) return null

  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    members,
    damage: Number.isInteger(raw.damage) ? raw.damage : 0,
    cost: Number.isInteger(raw.cost) ? raw.cost : 0,
    limitcost: Number.isInteger(raw.limitcost) ? raw.limitcost : 0,
    normalcost: Number.isInteger(raw.normalcost) ? raw.normalcost : 0,
    clean: raw.clean === true,
    lvl: raw.lvl === true,
    confirm: raw.confirm === true,
    tags: Array.isArray(raw.tags) ? raw.tags.filter(t => typeof t === 'string') : [],
    video_url: typeof raw.video_url === 'string' ? raw.video_url : '',
    info: typeof raw.info === 'string' ? raw.info : ''
  }
}

export function normalizeList (raw) {
  if (!Array.isArray(raw)) {
    throw new Error('接口返回结构异常：期望数组')
  }
  const out = []
  for (const item of raw) {
    const rec = normalizeRecord(item)
    if (rec) out.push(rec)
  }
  return out
}
