import plugin from '../../../lib/plugins/plugin.js'
import { getTeams } from '../services/TeamsService.js'
import { buildViewModel } from '../services/RankService.js'
import { QUERY_RULE, buildHelpText, resolveQuery, describeQuery, queryRank } from '../services/QueryService.js'
import { renderRankImage } from '../components/Render.js'
import { loadConfig } from '../components/Config.js'

export default class Dps extends plugin {
  constructor () {
    super({
      name: 'yuanshen-dps-plugin',
      dsc: '原神 DPS 榜单查询（mhydps.cn）',
      event: 'message',
      priority: 2000,
      rule: [
        { reg: '^#[dD][pP][sS]帮助\\s*$', fnc: 'help' },
        { reg: '^#[dD][pP][sS]刷新\\s*$', fnc: 'refresh', permission: 'master' },
        { reg: QUERY_RULE, fnc: 'query' }
      ]
    })
  }

  async help (e) {
    await e.reply(buildHelpText(await loadConfig()))
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

  async query (e) {
    const cfg = await loadConfig()
    let opts
    try {
      opts = resolveQuery(e.msg, cfg)
    } catch (err) {
      await e.reply(`${err.message}\n发送 #dps帮助 查看用法。`)
      return true
    }
    if (!await this.acquireCooldown(e)) return true

    let teamsResult
    try {
      teamsResult = await getTeams({ force: false })
    } catch (err) {
      await e.reply(`榜单获取失败：${err.message}`)
      return true
    }

    let rankResult
    try {
      rankResult = queryRank(teamsResult.teams, opts)
    } catch (err) {
      await e.reply(err.message)
      return true
    }
    const viewModel = buildViewModel({
      rankResult,
      ...describeQuery(opts),
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
