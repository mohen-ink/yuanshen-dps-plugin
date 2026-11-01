import plugin from '../../../lib/plugins/plugin.js'
import { getTeams } from '../services/TeamsService.js'
import { rank, buildViewModel } from '../services/RankService.js'
import { renderRankImage } from '../components/Render.js'
import { loadConfig } from '../components/Config.js'

const HELP_TEXT = [
  '原神 DPS 榜（数据：mhydps.cn）',
  '#dps榜 [N]              默认榜单 Top N（默认 10，最多 30）',
  '#dps 角色名             含该角色的队伍 Top N',
  '#dps主c 角色名          仅统计该角色为主C的队伍',
  '#dps 角色名 N命         附加命座过滤，如 "#dps 玛薇卡 6命"',
  '#dps 角色名 >=N命       命座大于等于 N',
  '#dps绿玩 [角色名]       仅绿玩成绩',
  '#dps全部                包含"宏"标签的完整榜单',
  '#dps刷新                主人：强制刷新缓存'
].join('\n')

const SAFE_NAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9·\s]{1,20}$/

function parseArgs (msg) {
  const text = (msg || '').trim()
  const tokens = text.split(/\s+/).slice(1)
  const opts = {
    character: '',
    mainCarry: false,
    constellation: null,
    cleanOnly: false,
    includeMacro: false,
    topN: null
  }

  for (const t of tokens) {
    if (!t) continue
    if (t === '绿玩') { opts.cleanOnly = true; continue }
    if (t === '全部' || t === '宏') { opts.includeMacro = true; continue }

    const consEq = /^(\d)命$/.exec(t)
    if (consEq) { opts.constellation = { op: 'eq', value: Number(consEq[1]) }; continue }

    const consGte = /^>=(\d)命$/.exec(t)
    if (consGte) { opts.constellation = { op: 'gte', value: Number(consGte[1]) }; continue }

    const consLte = /^<=(\d)命$/.exec(t)
    if (consLte) { opts.constellation = { op: 'lte', value: Number(consLte[1]) }; continue }

    if (/^\d{1,2}$/.test(t)) { opts.topN = Number(t); continue }

    if (!opts.character && SAFE_NAME_RE.test(t)) { opts.character = t; continue }
  }

  return opts
}

function decorateRows (rows) {
  return rows.map(r => ({
    ...r,
    rowClass: r.rank === 1 ? 'top1' : r.rank === 2 ? 'top2' : r.rank === 3 ? 'top3' : '',
    rankLabel: r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `#${r.rank}`,
    members: r.members.map(m => ({ ...m, highlightClass: m.highlight ? 'highlight' : '' })),
    badges: r.badges,
    tags: r.tags
  }))
}

export default class Dps extends plugin {
  constructor () {
    super({
      name: 'yuanshen-dps-plugin',
      dsc: '原神 DPS 榜单查询（mhydps.cn）',
      event: 'message',
      priority: 2000,
      rule: [
        { reg: '^#dps帮助$', fnc: 'help' },
        { reg: '^#dps刷新$', fnc: 'refresh', permission: 'master' },
        { reg: '^#dps榜(\\s+\\S+)?$', fnc: 'topBoard' },
        { reg: '^#dps主c\\s+\\S+', fnc: 'queryMainCarry' },
        { reg: '^#dps绿玩(\\s+\\S+)?$', fnc: 'queryClean' },
        { reg: '^#dps全部$', fnc: 'queryAll' },
        { reg: '^#dps\\s+\\S+', fnc: 'queryCharacter' }
      ]
    })
  }

  async help (e) {
    await e.reply(HELP_TEXT)
    return true
  }

  async acquireCooldown (e) {
    const cfg = await loadConfig()
    const redis = globalThis.redis
    if (!redis || typeof redis.set !== 'function') return true
    const key = `yuanshen-dps-plugin:v1:cd:${e.self_id || 0}:${e.isGroup ? e.group_id : 'private'}:${e.user_id}`
    try {
      const ok = await redis.set(key, '1', { NX: true, EX: cfg.cooldownSeconds })
      if (ok !== 'OK' && ok !== true && ok !== 1) {
        await e.reply(`查询过于频繁，请 ${cfg.cooldownSeconds} 秒后再试。`)
        return false
      }
    } catch {
      // Redis 异常时不阻断查询
    }
    return true
  }

  async runQuery (e, opts, titleBase) {
    if (!await this.acquireCooldown(e)) return true

    const cfg = await loadConfig()
    const topN = Math.min(Math.max(opts.topN || cfg.defaultTopN, 1), cfg.maxTopN)

    let teamsResult
    try {
      teamsResult = await getTeams({ force: false })
    } catch (err) {
      await e.reply(`榜单获取失败：${err.message}`)
      return true
    }

    const includeMacro = opts.includeMacro || cfg.includeMacroByDefault
    const rankResult = rank(teamsResult.teams, {
      character: opts.character,
      mainCarry: opts.mainCarry,
      constellation: opts.constellation,
      includeMacro,
      cleanOnly: opts.cleanOnly,
      lvlOnly: false,
      topN
    })

    if (rankResult.total === 0 && opts.character) {
      await e.reply(`未匹配到与「${opts.character}」相关的记录，请检查角色名是否为接口原文。`)
      return true
    }

    const subtitleParts = []
    if (opts.character) subtitleParts.push(opts.mainCarry ? `主C：${opts.character}` : `含：${opts.character}`)
    if (opts.constellation) {
      const opLabel = { eq: '', gte: '≥', lte: '≤' }[opts.constellation.op]
      subtitleParts.push(`${opLabel}${opts.constellation.value} 命`)
    }
    if (opts.cleanOnly) subtitleParts.push('仅绿玩')
    subtitleParts.push(includeMacro ? '包含宏' : '已排除宏')

    const viewModel = buildViewModel({
      rankResult: { ...rankResult, rows: decorateRows(rankResult.rows) },
      title: titleBase,
      subtitle: subtitleParts.join(' · '),
      meta: teamsResult.meta,
      stale: !!teamsResult.stale
    })

    try {
      await renderRankImage(e, viewModel)
    } catch (err) {
      await e.reply(`图片渲染失败：${err.message}`)
    }
    return true
  }

  async topBoard (e) {
    const opts = parseArgs(`#dps榜 ${e.msg.split(/\s+/).slice(1).join(' ')}`.trim())
    return await this.runQuery(e, opts, '原神 DPS 榜')
  }

  async queryMainCarry (e) {
    const opts = parseArgs(e.msg)
    if (!opts.character) {
      await e.reply('请提供角色名，例如：#dps主c 玛薇卡')
      return true
    }
    opts.mainCarry = true
    return await this.runQuery(e, opts, `主C · ${opts.character}`)
  }

  async queryClean (e) {
    const opts = parseArgs(e.msg)
    opts.cleanOnly = true
    const title = opts.character ? `绿玩 · ${opts.character}` : '绿玩 DPS 榜'
    return await this.runQuery(e, opts, title)
  }

  async queryAll (e) {
    const opts = parseArgs(e.msg)
    opts.includeMacro = true
    return await this.runQuery(e, opts, '原神 DPS 榜（含宏）')
  }

  async queryCharacter (e) {
    const opts = parseArgs(e.msg)
    if (!opts.character) {
      await e.reply('请提供角色名，例如：#dps 玛薇卡')
      return true
    }
    return await this.runQuery(e, opts, `DPS · ${opts.character}`)
  }

  async refresh (e) {
    if (!e.isMaster) {
      await e.reply('此指令仅限机器人主人使用。')
      return true
    }
    try {
      const result = await getTeams({ force: true })
      await e.reply(`已刷新榜单缓存：${result.teams.length} 条记录。`)
    } catch (err) {
      await e.reply(`刷新失败：${err.message}`)
    }
    return true
  }
}
