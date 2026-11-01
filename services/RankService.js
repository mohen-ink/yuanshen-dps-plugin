/**
 * 纯函数：筛选、排序、生成 view-model。不依赖 e、Redis、Bot。
 */

export function formatDamage (n) {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`
  if (n >= 1e4) return `${(n / 1e4).toFixed(2)} 万`
  return String(n)
}

export function formatCost (cost, limitcost, normalcost) {
  const parts = []
  if (Number.isInteger(cost) && cost > 0) parts.push(`${cost} 金`)
  if (Number.isInteger(limitcost) && limitcost > 0 && limitcost !== cost) parts.push(`限 ${limitcost}`)
  if (Number.isInteger(normalcost) && normalcost > 0) parts.push(`常 ${normalcost}`)
  return parts.length > 0 ? parts.join(' / ') : '0 金'
}

function matchesConstellation (member, requirement) {
  if (!requirement) return true
  const { op, value } = requirement
  const c = Number.isInteger(member.constellation) ? member.constellation : 0
  if (op === 'eq') return c === value
  if (op === 'gte') return c >= value
  if (op === 'lte') return c <= value
  return true
}

/**
 * @param {Array} teams 归一化后的记录数组（已按 damage 降序）
 * @param {Object} opts
 * @param {string} [opts.character]     角色名（精确匹配）
 * @param {boolean} [opts.mainCarry]    仅统计 members[0]
 * @param {{op:'eq'|'gte'|'lte', value:number}} [opts.constellation]
 * @param {boolean} [opts.includeMacro] 是否包含"宏"标签
 * @param {boolean} [opts.cleanOnly]
 * @param {boolean} [opts.lvlOnly]
 * @param {number} [opts.topN]
 */
export function rank (teams, opts = {}) {
  const {
    character = '',
    mainCarry = false,
    constellation = null,
    includeMacro = false,
    cleanOnly = false,
    lvlOnly = false,
    topN = 10
  } = opts

  const filtered = teams.filter(team => {
    if (!includeMacro && (team.tags || []).includes('宏')) return false
    if (cleanOnly && team.clean !== true) return false
    if (lvlOnly && team.lvl !== true) return false

    if (character) {
      if (mainCarry) {
        const first = team.members[0]
        if (!first || first.charId !== character) return false
        if (!matchesConstellation(first, constellation)) return false
      } else {
        const hit = team.members.some(m => m.charId === character && matchesConstellation(m, constellation))
        if (!hit) return false
      }
    }
    return true
  })

  const limited = filtered.slice(0, Math.max(1, topN))

  const rows = limited.map((team, idx) => ({
    rank: idx + 1,
    damageLabel: formatDamage(team.damage),
    damageRaw: team.damage,
    costLabel: formatCost(team.cost, team.limitcost, team.normalcost),
    badges: [
      team.clean ? '绿玩' : null,
      team.lvl ? '命星' : null
    ].filter(Boolean),
    tags: team.tags.slice(),
    members: team.members.map(m => ({
      name: m.charId,
      consLabel: `${m.constellation} 命`,
      highlight: !!character && m.charId === character
    })),
    videoUrl: team.video_url || '',
    info: team.info || ''
  }))

  return {
    total: filtered.length,
    shown: rows.length,
    rows
  }
}

export function buildViewModel ({ rankResult, title, subtitle, meta, stale }) {
  const fetchedAtLabel = meta && meta.fetchedAt
    ? new Date(meta.fetchedAt).toLocaleString('zh-CN', { hour12: false })
    : '未知'

  return {
    title,
    subtitle,
    totalLabel: `共 ${rankResult.total} 条，展示前 ${rankResult.shown} 条`,
    fetchedAtLabel,
    staleLabel: stale ? '⚠ 当前为缓存快照，接口暂时不可用' : '',
    rows: rankResult.rows,
    footer: '数据来源：mhydps.cn · 仅供参考'
  }
}
