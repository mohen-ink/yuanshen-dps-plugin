export async function requestJson (endpoint, options = {}) {
  const url = new URL(endpoint)
  if (url.protocol !== 'https:') {
    throw new Error('接口必须使用 HTTPS')
  }

  const allowedHosts = options.allowedHosts
  if (Array.isArray(allowedHosts) && allowedHosts.length > 0 && !allowedHosts.includes(url.host)) {
    throw new Error(`接口域名不在白名单中：${url.host}`)
  }

  const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 10000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'User-Agent': options.userAgent || 'Mozilla/5.0',
        Referer: options.referer || 'https://www.mhydps.cn/'
      }
    })

    if (!response.ok) {
      const err = new Error(`接口 HTTP 状态异常：${response.status}`)
      err.status = response.status
      throw err
    }

    const ctype = response.headers.get('content-type') || ''
    if (!ctype.toLowerCase().startsWith('application/json')) {
      throw new Error(`接口 Content-Type 异常：${ctype || '未知'}`)
    }

    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}
