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

export function teamKey (team) {
  return JSON.stringify(team.members.map(member => [member.charId, member.constellation]).sort((a, b) => {
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]
  }))
}

export function rank (teams, opts = {}) {
  const {
    character = '',
    mainCarry = false,
    constellation = null,
    includeMacro = true,
    macroMode = includeMacro ? 'all' : 'exclude',
    cleanOnly = false,
    lvlOnly = false,
    deduplicate = false,
    topN = 10,
    page = 1
  } = opts

  const filtered = teams.filter(team => {
    const macro = team.tags.includes('宏')
    if (macroMode === 'exclude' && macro) return false
    if (macroMode === 'only' && !macro) return false
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

  let ranked = filtered
  if (deduplicate) {
    const bestByTeam = new Map()
    for (const team of filtered) {
      const key = teamKey(team)
      const previous = bestByTeam.get(key)
      if (!previous || team.damage > previous.damage) bestByTeam.set(key, team)
    }
    ranked = [...bestByTeam.values()]
  }
  ranked = ranked.slice().sort((a, b) => b.damage - a.damage)

  const pageSize = Number.isSafeInteger(topN) && topN > 0 ? topN : 10
  const currentPage = Number.isSafeInteger(page) && page > 0 ? page : 1
  const totalPages = Math.max(1, Math.ceil(ranked.length / pageSize))
  const start = (currentPage - 1) * pageSize
  const limited = ranked.slice(start, start + pageSize)

  const rows = limited.map((team, idx) => {
    const macro = team.tags.includes('宏')
    return {
      rank: start + idx + 1,
      damageLabel: formatDamage(team.damage),
      damageRaw: team.damage,
      costLabel: formatCost(team.cost, team.limitcost, team.normalcost),
      costMainLabel: `${team.cost > 0 ? team.cost : 0} 金`,
      costDetailLabel: [
        team.limitcost > 0 && team.limitcost !== team.cost ? `限 ${team.limitcost}` : null,
        team.normalcost > 0 ? `常 ${team.normalcost}` : null
      ].filter(Boolean).join(' / '),
      statusBadges: [
        {
          className: macro ? 'macro' : 'clean',
          label: macro ? '宏' : '绿',
          title: macro ? '宏' : '绿玩',
          visibilityClass: macro || team.clean ? '' : 'is-empty'
        },
        { className: 'lvl', label: '命星', title: '命星', visibilityClass: team.lvl ? '' : 'is-empty' }
      ],
      tags: team.tags.slice(),
      members: team.members.map(m => ({
        name: m.charId,
        consLabel: `${m.constellation}命`,
        highlight: !!character && m.charId === character
      })),
      videoUrl: team.video_url || '',
      info: team.info || ''
    }
  })

  return {
    matched: filtered.length,
    total: ranked.length,
    shown: rows.length,
    page: currentPage,
    pageSize,
    totalPages,
    deduplicate,
    bestDamage: ranked[0]?.damage || 0,
    rows
  }
}

export function buildViewModel ({ rankResult, title, subtitle, meta, stale }) {
  const fetchedAtLabel = meta && meta.fetchedAt
    ? new Date(meta.fetchedAt).toLocaleString('zh-CN', { hour12: false })
    : '未知'
  const bestDamage = rankResult.bestDamage
  const formatCount = n => n.toLocaleString('zh-CN')
  const singlePage = rankResult.totalPages === 1
  const resultSummaryLabel = rankResult.deduplicate
    ? `匹配 ${formatCount(rankResult.matched)} 条成绩 · 去重后 ${formatCount(rankResult.total)} 组`
    : `共 ${formatCount(rankResult.matched)} 条成绩`
  const countUnit = rankResult.deduplicate ? '组' : '条'

  return {
    title,
    subtitle,
    resultSummaryLabel: rankResult.total > 0 && singlePage
      ? `${resultSummaryLabel} · 已全部展示`
      : `${resultSummaryLabel}${rankResult.deduplicate ? '' : ' · 不去重'}`,
    paginationClass: singlePage ? 'is-hidden' : '',
    pageLabel: `第 ${rankResult.page} / ${rankResult.totalPages} 页`,
    rangeLabel: rankResult.shown > 0
      ? `第 ${rankResult.rows[0].rank}–${rankResult.rows.at(-1).rank} 名 · ${rankResult.shown < rankResult.pageSize ? `本页 ${formatCount(rankResult.shown)} ${countUnit}` : `共 ${formatCount(rankResult.total)} ${countUnit}`}`
      : '暂无匹配成绩',
    bestDamageLabel: formatDamage(bestDamage),
    fetchedAtLabel,
    staleLabel: stale ? '当前为缓存快照，接口暂时不可用' : '',
    rows: rankResult.rows.map(row => ({
      ...row,
      rowClass: row.rank <= 3 ? `top${row.rank}` : '',
      rankLabel: String(row.rank).padStart(2, '0'),
      damagePercent: bestDamage > 0 ? Math.max(0, Math.min(100, row.damageRaw / bestDamage * 100)).toFixed(1) : '0',
      members: row.members.map(member => ({
        ...member,
        initial: Array.from(member.name)[0] || '?',
        highlightClass: member.highlight ? 'highlight' : ''
      }))
    })),
    footer: '数据来源：mhydps.cn · 仅供参考'
  }
}
