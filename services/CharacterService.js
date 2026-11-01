const aliasUrl = new URL('../../miao-plugin/resources/meta-gs/character/alias.js', import.meta.url)
let aliasesPromise

export function normalizeCharacterAlias (name) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

function buildCharacterAliases (source) {
  const aliases = new Map()
  for (const name of Object.keys(source)) {
    const key = normalizeCharacterAlias(name)
    if (key) aliases.set(key, new Set([name]))
  }
  const canonicalNames = new Set(aliases.keys())
  for (const [name, list] of Object.entries(source)) {
    if (typeof list !== 'string' || !normalizeCharacterAlias(name)) continue
    for (const item of list.split(',')) {
      const key = normalizeCharacterAlias(item)
      if (!key || canonicalNames.has(key)) continue
      const names = aliases.get(key) || new Set()
      names.add(name)
      aliases.set(key, names)
    }
  }
  return aliases
}

export async function loadCharacterAliases () {
  if (!aliasesPromise) {
    aliasesPromise = import(aliasUrl.href).then(({ alias }) => {
      if (!alias || typeof alias !== 'object' || Array.isArray(alias)) {
        throw new Error('角色别名文件缺少有效的 alias 导出')
      }
      return buildCharacterAliases(alias)
    }).catch(err => {
      globalThis.logger?.warn?.(`[yuanshen-dps-plugin] 读取喵喵角色别名失败，仅支持完整角色名：${err.message}`)
      return new Map()
    })
  }
  return aliasesPromise
}
