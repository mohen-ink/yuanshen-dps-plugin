import { rank } from './RankService.js'
import { normalizeCharacterAlias } from './CharacterService.js'

const SAFE_NAME_RE = /^(?=.*\p{L})[\p{L}\p{N}·]{1,20}$/u

export const QUERY_RULE = '^#[dD][pP][sS](?:榜|主[cC]|绿玩|全部)?(?:\\s+[\\s\\S]*)?\\s*$'

export function buildHelpViewModel (cfg) {
  const examplePageSize = Math.min(20, cfg.maxTopN)
  return {
    title: '原神 DPS 使用帮助',
    subtitle: '榜单查询 · 条件筛选 · 分页与去重',
    usage: '#dps [角色] [主c] [命座] [筛选] [数量/分页]',
    defaultsLabel: `默认不去重 · ${cfg.includeMacroByDefault ? '包含宏' : '排除宏'} · 每页 ${cfg.defaultTopN} 条 · 单页最多 ${cfg.maxTopN} 条`,
    sections: [
      {
        title: '查询示例',
        commands: [
          { command: '#dps', description: '查看全角色队伍榜单' },
          { command: '#dps 玛薇卡', description: '查看包含该角色的队伍' },
          { command: '#dps 散兵', description: '支持喵喵别名，自动识别为流浪者' },
          { command: '#dps 玛薇卡 主c 6命', description: '该角色为主C，且恰好6命' },
          { command: '#dps 玛薇卡 >=2命', description: '该角色至少2命，也支持 ≥' },
          { command: '#dps 玛薇卡 <=2命 无宏', description: '该角色至多2命，并排除宏' },
          { command: '#dps 绿玩 命星', description: '同时满足绿玩与命星标记' },
          { command: `#dps ${examplePageSize}条 第2页`, description: `每页${examplePageSize}条，查看第${examplePageSize + 1}–${examplePageSize * 2}名` },
          { command: '#dps 玛薇卡 去重', description: '相同阵容与命座只保留最高成绩' }
        ]
      },
      {
        title: '操作指令',
        commands: [
          { command: '#dps帮助', description: '查看本帮助图片' },
          { command: '#dps刷新', description: '强制刷新榜单缓存，仅限机器人主人' }
        ]
      }
    ],
    notes: [
      '筛选支持：绿玩 / 无宏 / 仅宏 / 命星，可组合使用，参数顺序不限。',
      '去重按同四人及各自命座合并，忽略顺序；也支持显式「不去重」。',
      '支持完整角色名和喵喵角色别名，英文别名忽略大小写；共用别名请改用完整名称。',
      '纯数字别名优先识别角色，如77代表七七；数量建议写「10条」，旧用法可用「#dps榜 10」。',
      '主C按队伍首位角色判断。',
      '每页条数为展示上限，数据不足时只显示实际条数。',
      '红圈宏 / 绿圈绿共用一列，紫圈命星独立显示；无绿标不代表绿玩。',
      '兼容：#dps榜 [N]、#dps主c 角色、#dps绿玩 [角色]、#dps全部'
    ],
    footer: '数据来源：mhydps.cn · 仅供参考'
  }
}

export function buildHelpText (cfg) {
  const help = buildHelpViewModel(cfg)
  return [
    help.title,
    help.usage,
    help.defaultsLabel,
    ...help.sections.flatMap(section => [section.title, ...section.commands.map(item => `${item.command}  ${item.description}`)]),
    ...help.notes,
    help.footer
  ].join('\n')
}

export function parseQuery (msg, characterAliases = new Map()) {
  const match = /^#dps(榜|主c|绿玩|全部)?(?=\s|$)\s*([\s\S]*)$/i.exec(String(msg || '').trim())
  if (!match) throw new Error('指令格式错误，请发送 #dps帮助 查看用法。')
  const alias = (match[1] || '').toLowerCase()
  const opts = {
    character: '',
    mainCarry: alias === '主c',
    constellation: null,
    cleanOnly: alias === '绿玩',
    lvlOnly: false,
    macroMode: alias === '全部' ? 'all' : null,
    deduplicate: false,
    topN: null,
    page: null
  }
  let deduplicateMode = null
  const characterTokens = []

  function setMacroMode (mode) {
    if (opts.macroMode && opts.macroMode !== mode) throw new Error('宏筛选条件冲突，请只选择「全部」「无宏」或「仅宏」之一。')
    opts.macroMode = mode
  }

  function setNumber (key, value, label) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label}必须是正整数。`)
    if (opts[key] !== null && opts[key] !== value) throw new Error(`不能同时指定多个不同的${label}。`)
    opts[key] = value
  }

  for (const token of match[2].split(/\s+/).filter(Boolean)) {
    if (/^主c$/i.test(token)) { opts.mainCarry = true; continue }
    if (token === '绿玩') { opts.cleanOnly = true; continue }
    if (token === '命星') { opts.lvlOnly = true; continue }
    if (token === '去重' || token === '不去重') {
      const value = token === '去重'
      if (deduplicateMode !== null && deduplicateMode !== value) throw new Error('「去重」和「不去重」不能同时使用。')
      opts.deduplicate = value
      deduplicateMode = value
      continue
    }
    if (token === '全部' || token === '宏') { setMacroMode('all'); continue }
    if (token === '无宏') { setMacroMode('exclude'); continue }
    if (token === '仅宏') { setMacroMode('only'); continue }

    const cons = /^(>=|<=|≥|≤|=)?(\d+)命$/.exec(token)
    if (cons) {
      const value = Number(cons[2])
      if (!Number.isInteger(value) || value < 0 || value > 6) throw new Error('角色命座必须在0～6命之间。')
      const op = { '>=': 'gte', '≥': 'gte', '<=': 'lte', '≤': 'lte', '=': 'eq' }[cons[1]] || 'eq'
      if (opts.constellation && (opts.constellation.op !== op || opts.constellation.value !== value)) {
        throw new Error('不能同时指定多个命座条件，请只保留一个。')
      }
      opts.constellation = { op, value }
      continue
    }

    const count = /^(\d+)条?$/.exec(token)
    if (count && (token.endsWith('条') || alias === '榜' || !characterAliases.has(normalizeCharacterAlias(token)))) {
      setNumber('topN', Number(count[1]), '每页条数')
      continue
    }
    const page = /^第(\d+)页$/.exec(token)
    if (page) { setNumber('page', Number(page[1]), '页码'); continue }
    characterTokens.push(token)
  }

  const characterName = characterTokens.join(' ')
  const candidates = characterAliases.get(normalizeCharacterAlias(characterName))
  if (candidates?.size) {
    if (candidates.size > 1) {
      throw new Error(`角色别名「${characterName}」对应多个角色：${[...candidates].join('、')}，请使用完整角色名。`)
    }
    opts.character = candidates.values().next().value
  } else {
    for (const token of characterTokens) {
      if (/(?:命|条|页)$|^[<>=≥≤+\-\d]/.test(token) || !SAFE_NAME_RE.test(token)) {
        throw new Error(`无法识别参数「${token}」。示例：#dps 玛薇卡 主c <=2命 无宏 20条 第2页`)
      }
      if (opts.character) throw new Error(`无法识别多余参数「${token}」；目前一次只能查询一个角色。`)
      opts.character = token
    }
  }

  if (opts.cleanOnly && opts.macroMode === 'only') throw new Error('「绿玩」和「仅宏」不能同时使用。')
  if (!opts.character && (opts.mainCarry || opts.constellation)) throw new Error('主C或命座筛选需要指定角色，例如：#dps 玛薇卡 主c 6命')
  return opts
}

export function resolveQuery (msg, cfg, characterAliases) {
  const opts = parseQuery(msg, characterAliases)
  const topN = opts.topN ?? cfg.defaultTopN
  if (topN > cfg.maxTopN) throw new Error(`单页最多展示${cfg.maxTopN}条，请减少条数或使用「第2页」。`)
  return {
    ...opts,
    topN,
    page: opts.page ?? 1,
    macroMode: opts.macroMode ?? (cfg.includeMacroByDefault ? 'all' : 'exclude')
  }
}

export function describeQuery (opts) {
  const parts = []
  if (opts.character) parts.push(opts.mainCarry ? `主C：${opts.character}` : `含：${opts.character}`)
  else parts.push('全角色队伍排行')
  if (opts.constellation) parts.push(`${{ eq: '', gte: '≥', lte: '≤' }[opts.constellation.op]}${opts.constellation.value}命`)
  if (opts.cleanOnly) parts.push('仅绿玩')
  else parts.push({ all: '包含宏', exclude: '排除宏', only: '仅宏' }[opts.macroMode])
  if (opts.lvlOnly) parts.push('仅命星')
  parts.push(opts.deduplicate ? '阵容去重' : '不去重')
  return {
    title: opts.character ? `${opts.mainCarry ? '主C' : 'DPS'} · ${opts.character}` : opts.cleanOnly ? '绿玩 DPS 榜' : '原神 DPS 榜',
    subtitle: parts.join(' · ')
  }
}

export function queryRank (teams, opts) {
  if (opts.character && !teams.some(team => team.members.some(member => member.charId === opts.character))) {
    throw new Error(`未找到角色「${opts.character}」的记录，请检查角色名称或别名。`)
  }
  const result = rank(teams, opts)
  if (result.total > 0 && result.page > result.totalPages) {
    throw new Error(`当前条件共${result.totalPages}页，每页${result.pageSize}条，请查询第1～${result.totalPages}页。`)
  }
  if (result.total === 0 && result.page > 1) throw new Error('当前条件没有匹配记录，请调整条件或查询第1页。')
  return result
}
