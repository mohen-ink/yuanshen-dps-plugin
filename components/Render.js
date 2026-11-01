const characterBaseUrl = new URL('../../miao-plugin/resources/meta-gs/character/', import.meta.url).href

export function withCharacterAvatars (viewModel, avatarBaseUrl = characterBaseUrl) {
  const base = avatarBaseUrl.endsWith('/') ? avatarBaseUrl : `${avatarBaseUrl}/`
  return {
    ...viewModel,
    rows: viewModel.rows.map(row => ({
      ...row,
      members: row.members.map(member => ({
        ...member,
        avatarUrl: `${base}${encodeURIComponent(member.name)}/imgs/face.webp`
      }))
    }))
  }
}

async function renderImage (e, template, viewModel) {
  if (typeof e?.runtime?.render !== 'function') {
    throw new Error('当前云崽缺少图片渲染接口（e.runtime.render），无法生成图片')
  }
  return await e.runtime.render('yuanshen-dps-plugin', template, {
    ...viewModel,
    imgType: 'png',
    renderScale: 2
  })
}

export async function renderRankImage (e, viewModel) {
  return await renderImage(e, 'dps/index', withCharacterAvatars(viewModel))
}

export async function renderHelpImage (e, viewModel) {
  return await renderImage(e, 'dps/help', viewModel)
}
