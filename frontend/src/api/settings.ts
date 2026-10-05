import { apiFetchJson } from './client'

export type SettingKind = 'secret' | 'text' | 'boolean' | 'integer'

export type SettingField = {
  key: string
  label: string
  group: string
  kind: SettingKind
  description: string
  restart_required: boolean
  minimum: number | null
  maximum: number | null
  /** Secrets are write-only: the backend reports `is_set` but never their value. */
  is_set: boolean
  value: string | number | boolean | null
  /** Set by an environment variable, so the Settings page can't change it. */
  locked: boolean
}

export type SettingsResponse = {
  config_file: string
  read_only_reason: string | null
  groups: { id: string; label: string }[]
  fields: SettingField[]
}

export type SettingValue = string | number | boolean | null

// The backend only accepts changes that carry this header, which other
// websites can't add to a request without the backend's permission.
const GUARD = { 'X-MusicBox-Settings': '1' }

export function fetchSettings(signal?: AbortSignal) {
  return apiFetchJson<SettingsResponse>('/api/settings', { signal })
}

export async function saveSettings(values: Record<string, SettingValue>) {
  const result = await apiFetchJson<SettingsResponse>('/api/settings', {
    method: 'PUT',
    headers: GUARD,
    body: JSON.stringify({ values }),
  })
  if (Object.hasOwn(values, 'MOVIES_ENABLED')) {
    window.dispatchEvent(new Event('musicbox-movies-settings-changed'))
  }
  return result
}

export function checkYouTubeKey(apiKey?: string) {
  return apiFetchJson<{ ok: boolean; message: string }>('/api/settings/youtube-key-check', {
    method: 'POST',
    headers: GUARD,
    body: JSON.stringify({ api_key: apiKey || null }),
  })
}
