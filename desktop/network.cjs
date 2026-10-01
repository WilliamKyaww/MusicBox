const APP_ID = 'com.williamkyaww.musicbox'
const APP_ORIGIN = 'musicbox://app'
const FORWARDED_HEADERS = ['accept', 'content-type', 'range', 'if-range', 'if-none-match', 'if-modified-since']
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

function desktopRequestHeaders(url, requestHeaders, backendOrigin, token) {
  const target = new URL(url)
  const headers = { ...requestHeaders }
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === 'x-musicbox-desktop') delete headers[name]
  }
  if (target.origin === backendOrigin) headers['X-MusicBox-Desktop'] = token
  if (target.protocol === 'https:' &&
      ['www.youtube.com', 'www.youtube-nocookie.com'].includes(target.hostname) &&
      target.pathname.startsWith('/embed/')) {
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() === 'referer') delete headers[name]
    }
    // YouTube requires native players to identify their installed application.
    headers.Referer = `https://${APP_ID}/`
  }
  return headers
}

function isYouTubeMediaUrl(url) {
  return url.protocol === 'https:' &&
    url.hostname.endsWith('.googlevideo.com') &&
    !url.username && !url.password && (!url.port || url.port === '443')
}

async function proxyDesktopRequest(request, backendOrigin, token, localFetch) {
  const source = new URL(request.url)
  let target = new URL(source.pathname + source.search, backendOrigin)
  if (target.origin !== backendOrigin) return new Response('Forbidden', { status: 403 })
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer()
  let method = request.method
  const isMediaRequest = source.pathname.startsWith('/api/stream/') && ['GET', 'HEAD'].includes(method)

  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const headers = new Headers()
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name)
      if (value) headers.set(name, value)
    }
    headers.set('X-MusicBox-Desktop', token)
    // Chromium net.fetch cancels manual redirects; Node fetch can inspect them.
    const response = await localFetch(target.href, {
      method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : body,
      redirect: 'manual', signal: request.signal,
    })
    const location = response.headers.get('location')
    if (!REDIRECT_STATUSES.has(response.status) || !location) return response
    const next = new URL(location, target)
    if (next.origin !== backendOrigin && !(isMediaRequest && isYouTubeMediaUrl(next))) {
      await response.body?.cancel()
      return new Response('Unsupported desktop redirect.', { status: 502 })
    }
    await response.body?.cancel()
    if (next.origin !== backendOrigin) {
      // Let Chromium's media loader manage buffering, ranges and cancellation.
      // Relaying the bytes through a JS stream loses the native redirect path.
      return new Response(null, {
        status: response.status,
        headers: { Location: next.href, 'Cache-Control': 'no-store' },
      })
    }
    if (response.status === 303) method = 'GET'
    target = next
  }
  return new Response('Too many desktop redirects.', { status: 502 })
}

module.exports = { APP_ID, APP_ORIGIN, desktopRequestHeaders, proxyDesktopRequest }
