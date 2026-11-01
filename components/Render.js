export async function renderRankImage (e, viewModel) {
  if (typeof e?.runtime?.render !== 'function') {
    throw new Error('当前云崽缺少图片渲染接口（e.runtime.render），无法生成榜单图片')
  }
  return await e.runtime.render('yuanshen-dps-plugin', 'dps/index', viewModel)
}
