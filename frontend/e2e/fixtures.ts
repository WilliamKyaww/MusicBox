import { Buffer } from 'node:buffer'
import type { Page } from '@playwright/test'

export const songs = [
  ['track000000', 'Midnight City', 'M83'],
  ['track000001', 'Sunset Lover', 'Petit Biscuit'],
  ['track000002', 'Something About Us', 'Daft Punk'],
  ['track000003', 'Nights', 'Frank Ocean'],
  ['track000004', 'A Walk', 'Tycho'],
  ['track000005', 'Innerbloom', 'RUFUS DU SOL'],
].map(([id, title, artist]) => ({
  id,
  title,
  channel_title: artist,
  thumbnail_url: `/test-art/${id}.svg`,
  video_url: `https://www.youtube.com/watch?v=${id}`,
  channel_id: `channel-${id}`,
  description: '',
  duration_iso: 'PT20S',
  duration_label: '0:20',
  duration_seconds: 20,
  published_at: '2026-10-03',
}))

function silentWav() {
  const bytes = 8000 * 20 * 2
  const data = Buffer.alloc(44 + bytes)
  data.write('RIFF')
  data.writeUInt32LE(36 + bytes, 4)
  data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(1, 22)
  data.writeUInt32LE(8000, 24)
  data.writeUInt32LE(16000, 28)
  data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34)
  data.write('data', 36)
  data.writeUInt32LE(bytes, 40)
  return data
}

export async function mockLibrary(page: Page) {
  const list = {
    id: 'night-drive',
    name: 'Night drive',
    created_at: '2026-10-03',
    updated_at: '2026-10-03',
    items: songs.map((s, i) => ({
      id: `item-${i}`,
      video_id: s.id,
      title: s.title,
      channel_title: s.channel_title,
      thumbnail_url: s.thumbnail_url,
      source_url: s.video_url,
      duration_label: s.duration_label,
      added_at: '2026-10-03',
      position: i,
    })),
  }
  const state = {
    playlists: [list],
    failRename: false,
    calls: [] as string[],
    presenceDelay: 0,
    presenceActive: false,
    completedPresence: [] as string[],
  }
  const audio = silentWav()
  await page.route('**/test-art/**', (route) => {
    const index = Number(
      new URL(route.request().url()).pathname.match(/(\d)\.svg$/)?.[1] ?? 0,
    )
    const colors = [
      '#647e86',
      '#9d683d',
      '#b55043',
      '#294850',
      '#526b57',
      '#585086',
    ]
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="${colors[index]}"/><circle cx="160" cy="120" r="65" fill="#ffffff44"/><path d="M0 250 100 135 180 220 260 130 320 190V320H0Z" fill="#0005"/><text x="18" y="300" fill="white" font-family="sans-serif" font-size="20">MUSICBOX SESSIONS</text></svg>`,
    })
  })
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      state.calls.push(`${request.method()} ${path}`)
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, json: body })
      if (path.startsWith('/api/stream/'))
        return route.fulfill({
          contentType: 'audio/wav',
          body: audio,
          headers: { 'Accept-Ranges': 'bytes' },
        })
      if (path === '/api/downloads')
        return json({
          runtime: {
            available: true,
            missing_dependencies: [],
            downloads_directory: 'test',
          },
          items: [],
        })
      if (path === '/api/exports') return json({ items: [] })
      if (path === '/api/discord-presence/activity') {
        if (request.method() === 'PUT') {
          await new Promise((resolve) =>
            setTimeout(resolve, state.presenceDelay),
          )
          state.presenceActive = true
        } else if (request.method() === 'DELETE') state.presenceActive = false
        state.completedPresence.push(request.method())
        return json({
          enabled: true,
          configured: true,
          available: true,
          connected: true,
          active: state.presenceActive,
        })
      }
      if (path.startsWith('/api/discord-presence'))
        return json({
          enabled: true,
          configured: true,
          available: true,
          connected: true,
          active: true,
        })
      if (path === '/api/feed/trending')
        return json({ items: songs, channels: [] })
      if (path === '/api/search')
        return json({
          query: 'music',
          total: songs.length,
          items: songs,
          channels: [],
          next_page_token: null,
        })
      if (path === '/api/playlists') {
        if (request.method() === 'POST') {
          const created = {
            ...list,
            id: `new-${state.playlists.length}`,
            name: request.postDataJSON().name,
            items: [],
          }
          state.playlists.push(created)
          return json(created)
        }
        return json({ items: state.playlists })
      }
      if (path.startsWith('/api/playlists/')) {
        const [, , , id, part, itemId] = path.split('/')
        const playlist = state.playlists.find((p) => p.id === id)
        if (!playlist) return json({ detail: 'Not found' }, 404)
        if (part === 'items' && itemId === 'reorder') {
          const order = request.postDataJSON().ordered_item_ids as string[]
          playlist.items = order.map((id, position) => ({
            ...playlist.items.find((i) => i.id === id)!,
            position,
          }))
        } else if (part === 'items' && request.method() === 'DELETE') {
          playlist.items = playlist.items.filter((i) => i.id !== itemId)
        } else if (part === 'items' && request.method() === 'POST') {
          const song = request.postDataJSON()
          playlist.items.push({
            ...song,
            id: `added-${playlist.items.length}`,
            position: playlist.items.length,
            added_at: '2026-10-03',
          })
        } else if (request.method() === 'PATCH') {
          if (state.failRename)
            return json({ detail: 'Rename unavailable. Try again.' }, 503)
          playlist.name = request.postDataJSON().name
        } else if (request.method() === 'DELETE')
          state.playlists = state.playlists.filter((p) => p.id !== id)
        return json(playlist)
      }
      return json({ detail: `Unexpected test API: ${path}` }, 404)
    },
  )
  return state
}
