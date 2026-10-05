const { test } = require('node:test')
const assert = require('node:assert/strict')
const { desktopRequestHeaders, proxyDesktopRequest } = require('../network.cjs')

test('Settings writes forward the guard only to their local endpoint', async () => {
  for (const [route, method, expected] of [
    ['/api/settings', 'PUT', '1'],
    ['/api/settings/youtube-key-check', 'POST', '1'],
    ['/api/settings', 'GET', null],
    ['/api/movies/status', 'GET', null],
    ['/api/stream/test', 'GET', null],
  ]) {
    const request = new Request('musicbox://app' + route, {
      method, headers: { 'X-MusicBox-Settings': '1' },
    })
    await proxyDesktopRequest(request, 'http://127.0.0.1:49152', 'private-token', async (_url, options) => {
      assert.equal(options.headers.get('X-MusicBox-Settings'), expected)
      return new Response('{}')
    })
  }
})

test('Settings guard is not propagated to a redirected endpoint', async () => {
  let calls = 0
  await proxyDesktopRequest(new Request('musicbox://app/api/settings', {
    method: 'PUT', headers: { 'X-MusicBox-Settings': '1' },
  }), 'http://127.0.0.1:49152', 'private-token', async (_url, options) => {
    calls += 1
    assert.equal(options.headers.get('X-MusicBox-Settings'), calls === 1 ? '1' : null)
    return calls === 1 ? new Response(null, { status: 307, headers: { location: '/api/other' } }) : new Response('{}')
  })
  assert.equal(calls, 2)
})

test('YouTube embeds receive the desktop application identity', () => {
  const headers = desktopRequestHeaders('https://www.youtube-nocookie.com/embed/KvMY1uzSC1E', { referer: 'musicbox://app/' }, 'http://127.0.0.1:49152', 'private-token')
  assert.equal(headers.Referer, 'https://com.williamkyaww.musicbox/')
  assert.equal(headers.referer, undefined)
  assert.equal(headers['X-MusicBox-Desktop'], undefined)
  const unrelated = desktopRequestHeaders('https://www.youtube-nocookie.com.evil.example/embed/test', {}, 'http://127.0.0.1:49152', 'private-token')
  assert.equal(unrelated.Referer, undefined)
})

test('desktop credentials are stripped from external requests', () => {
  const headers = desktopRequestHeaders('https://example.com/', { 'x-musicbox-desktop': 'private-token', Accept: 'image/*' }, 'http://127.0.0.1:49152', 'private-token')
  assert.deepEqual(headers, { Accept: 'image/*' })
})

test('media redirects let Chromium load the remote media without proxying its bytes', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    return new Response(null, { status: 302, headers: { location: 'https://media.googlevideo.com/videoplayback?test=1', 'X-MusicBox-Desktop': 'private-token' } })
  }
  const request = new Request('musicbox://app/api/stream/test/split/video', { headers: { Range: 'bytes=0-2', Authorization: 'private', Cookie: 'private' } })
  const response = await proxyDesktopRequest(request, 'http://127.0.0.1:49152', 'private-token', fetchImpl)
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('Location'), 'https://media.googlevideo.com/videoplayback?test=1')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal(response.headers.get('X-MusicBox-Desktop'), null)
  assert.equal(response.body, null)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].options.headers.get('X-MusicBox-Desktop'), 'private-token')
  assert.equal(calls[0].options.headers.get('Authorization'), null)
  assert.equal(calls[0].options.headers.get('Cookie'), null)
  assert.equal(calls[0].options.headers.get('Range'), 'bytes=0-2')
  assert.equal(calls[0].options.signal, request.signal)
  assert.equal(calls[0].options.redirect, 'manual')
})

test('local partial media responses preserve bytes and range headers', async () => {
  const response = await proxyDesktopRequest(new Request('musicbox://app/api/downloads/saved/file', { headers: { Range: 'bytes=10-12', 'If-Range': 'test-etag' } }), 'http://127.0.0.1:49152', 'private-token', async (_url, options) => {
    assert.equal(options.headers.get('Range'), 'bytes=10-12')
    assert.equal(options.headers.get('If-Range'), 'test-etag')
    return new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { 'Content-Range': 'bytes 10-12/50', 'Content-Type': 'audio/mpeg' } })
  })
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('Content-Range'), 'bytes 10-12/50')
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3])
})

test('external media destinations require HTTPS and cannot contain credentials or custom ports', async () => {
  for (const location of [
    'http://media.googlevideo.com/file',
    'https://user:password@media.googlevideo.com/file',
    'https://media.googlevideo.com:444/file',
    'https://googlevideo.com.evil.example/file',
    'http://127.0.0.1:9999/file',
  ]) {
    const response = await proxyDesktopRequest(new Request('musicbox://app/api/stream/test'), 'http://127.0.0.1:49152', 'private-token', async () => new Response(null, { status: 302, headers: { location } }))
    assert.equal(response.status, 502)
  }
})

test('only media GET and HEAD requests can redirect to a media host', async () => {
  for (const [route, method] of [['/api/health', 'GET'], ['/api/stream/test', 'POST']]) {
    const response = await proxyDesktopRequest(new Request('musicbox://app' + route, { method }), 'http://127.0.0.1:49152', 'private-token', async () => new Response(null, { status: 302, headers: { location: 'https://media.googlevideo.com/file' } }))
    assert.equal(response.status, 502)
  }
})

test('local redirect loops are bounded', async () => {
  let calls = 0
  const response = await proxyDesktopRequest(new Request('musicbox://app/api/stream/test'), 'http://127.0.0.1:49152', 'private-token', async () => {
    calls += 1
    return new Response(null, { status: 302, headers: { location: '/api/stream/test' } })
  })
  assert.equal(response.status, 502)
  assert.equal(calls, 6)
})

test('protocol-relative paths cannot escape the backend origin', async () => {
  const response = await proxyDesktopRequest(new Request('musicbox://app//evil.example/file'), 'http://127.0.0.1:49152', 'private-token', async () => assert.fail('Unexpected external request'))
  assert.equal(response.status, 403)
})

test('local media redirects retain authentication', async () => {
  const calls = []
  const response = await proxyDesktopRequest(new Request('musicbox://app/api/stream/test'), 'http://127.0.0.1:49152', 'private-token', async (url, options) => {
    calls.push({ url, options })
    return calls.length === 1 ? new Response(null, { status: 302, headers: { location: '/api/downloads/saved/file' } }) : new Response('local audio')
  })
  assert.equal(await response.text(), 'local audio')
  assert.equal(calls[1].url, 'http://127.0.0.1:49152/api/downloads/saved/file')
  assert.equal(calls[1].options.headers.get('X-MusicBox-Desktop'), 'private-token')
})

test('redirects cannot turn the protocol handler into an arbitrary proxy', async () => {
  let calls = 0
  const response = await proxyDesktopRequest(new Request('musicbox://app/api/stream/test'), 'http://127.0.0.1:49152', 'private-token', async () => {
    calls += 1
    return new Response(null, { status: 302, headers: { location: 'https://googlevideo.com.evil.example/file' } })
  })
  assert.equal(response.status, 502)
  assert.equal(calls, 1)
})
