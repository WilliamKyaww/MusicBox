import { useEffect, useState, type ReactNode } from 'react'
import {
  checkYouTubeKey,
  fetchSettings,
  saveSettings,
  type SettingField,
  type SettingsResponse,
  type SettingValue,
} from '../api/settings'
import { Switch } from '../components/Switch'
import type { Experience } from '../experience'
import { clearHistory, useLibrary } from '../library'
import { SHORTCUTS } from '../music/shortcuts'
import { updateMusicState, useMusicStore } from '../music/store'
import { setTheme, useTheme } from '../theme'

type Status = { tone: 'success' | 'error'; text: string } | null

const SECTIONS = [
  ['connections', 'Connections'],
  ['playback', 'Playback'],
  ['appearance', 'Appearance'],
  ['privacy', 'Privacy and Data'],
  ['shortcuts', 'Keyboard Shortcuts'],
  ['about', 'About'],
] as const

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="settings-section" id={`settings-${id}`} aria-labelledby={`settings-${id}-title`}>
      <h2 id={`settings-${id}-title`}>{title}</h2>
      {intro ? <p className="settings-section__intro">{intro}</p> : null}
      <div className="settings-card">{children}</div>
    </section>
  )
}

function Row({ title, description, control, note }: { title: ReactNode; description?: ReactNode; control?: ReactNode; note?: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row__text">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
        {note ? <p className="settings-row__note">{note}</p> : null}
      </div>
      {control ? <div className="settings-row__control">{control}</div> : null}
    </div>
  )
}

/** A write-only secret: it can be added, replaced, checked or removed, but never read back. */
function SecretField({
  field,
  disabled,
  onSave,
}: {
  field: SettingField
  disabled: boolean
  onSave: (value: SettingValue) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [visible, setVisible] = useState(false)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<Status>(null)
  const isYouTube = field.key === 'YOUTUBE_API_KEY'

  function close() {
    setEditing(false)
    setDraft('')
    setVisible(false)
  }

  async function check(candidate?: string) {
    setChecking(true)
    setResult(null)
    try {
      const outcome = await checkYouTubeKey(candidate)
      setResult({ tone: outcome.ok ? 'success' : 'error', text: outcome.message })
    } catch (error) {
      setResult({ tone: 'error', text: error instanceof Error ? error.message : 'The check failed.' })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="settings-secret">
      {editing ? (
        <form
          className="settings-secret__form"
          onSubmit={async (event) => {
            event.preventDefault()
            if (await onSave(draft)) close()
          }}
        >
          <div className="settings-input settings-input--secret">
            <input
              type={visible ? 'text' : 'password'}
              aria-label={field.label}
              value={draft}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder={`Paste your ${field.label}`}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              type="button"
              className="settings-text-button"
              aria-pressed={visible}
              onClick={() => setVisible(!visible)}
            >
              {visible ? 'Hide' : 'Show'}
            </button>
          </div>
          <div className="settings-buttons">
            {isYouTube ? (
              <button
                type="button"
                className="settings-button"
                disabled={!draft.trim() || checking}
                onClick={() => void check(draft.trim())}
              >
                {checking ? 'Checking…' : 'Check key'}
              </button>
            ) : null}
            <button type="button" className="settings-button" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="settings-button settings-button--primary" disabled={!draft.trim()}>
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className="settings-secret__status">
          <span className={`settings-chip ${field.is_set ? 'settings-chip--ok' : ''}`}>
            {field.is_set ? 'Saved' : 'Not set'}
          </span>
          <div className="settings-buttons">
            {isYouTube && field.is_set ? (
              <button type="button" className="settings-button" disabled={checking} onClick={() => void check()}>
                {checking ? 'Checking…' : 'Check key'}
              </button>
            ) : null}
            {field.is_set ? (
              <button
                type="button"
                className="settings-button"
                disabled={disabled}
                onClick={() => {
                  setResult(null)
                  void onSave(null)
                }}
              >
                Remove
              </button>
            ) : null}
            <button
              type="button"
              className="settings-button settings-button--primary"
              disabled={disabled}
              onClick={() => {
                setResult(null)
                setEditing(true)
              }}
            >
              {field.is_set ? 'Replace' : 'Add key'}
            </button>
          </div>
        </div>
      )}
      {result ? (
        <p className={`settings-message settings-message--${result.tone}`} role="status">
          {result.text}
        </p>
      ) : null}
    </div>
  )
}

/** A text or number setting, saved explicitly with its own button. */
function ValueField({
  field,
  disabled,
  onSave,
}: {
  field: SettingField
  disabled: boolean
  onSave: (value: SettingValue) => Promise<boolean>
}) {
  const saved = field.value === null || field.value === undefined ? '' : String(field.value)
  const [draft, setDraft] = useState(saved)
  const [shown, setShown] = useState(saved)
  if (shown !== saved) {
    // A save elsewhere refreshed this field, so show the stored value.
    setShown(saved)
    setDraft(saved)
  }
  const dirty = draft.trim() !== saved
  const isNumber = field.kind === 'integer'
  return (
    <form
      className="settings-value"
      onSubmit={(event) => {
        event.preventDefault()
        void onSave(isNumber ? Number(draft) : draft.trim() || null)
      }}
    >
      <div className="settings-input">
        <input
          type={isNumber ? 'number' : 'text'}
          inputMode={isNumber ? 'numeric' : undefined}
          min={field.minimum ?? undefined}
          max={field.maximum ?? undefined}
          aria-label={field.label}
          value={draft}
          disabled={disabled}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
      {dirty ? (
        <div className="settings-buttons">
          <button type="button" className="settings-button" onClick={() => setDraft(saved)}>
            Cancel
          </button>
          <button
            type="submit"
            className="settings-button settings-button--primary"
            disabled={disabled || (isNumber && draft.trim() === '')}
          >
            Save
          </button>
        </div>
      ) : null}
    </form>
  )
}

function ConnectionSettings() {
  const [data, setData] = useState<SettingsResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchSettings(controller.signal)
      .then((response) => {
        setData(response)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(error instanceof Error ? error.message : 'Settings could not be loaded.')
      })
    return () => controller.abort()
  }, [attempt])

  async function save(field: SettingField, value: SettingValue) {
    setStatus(null)
    try {
      setData(await saveSettings({ [field.key]: value }))
      setStatus({
        tone: 'success',
        text:
          value === null
            ? `${field.label} removed.`
            : field.restart_required
              ? `${field.label} saved. Restart MusicBox for it to take effect.`
              : `${field.label} saved.`,
      })
      return true
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : 'That setting could not be saved.' })
      return false
    }
  }

  if (loadError)
    return (
      <div className="settings-empty">
        <p>
          MusicBox's server isn't responding, so connection settings can't be shown. ({loadError})
        </p>
        <button type="button" className="settings-button" onClick={() => setAttempt(attempt + 1)}>
          Try again
        </button>
      </div>
    )
  if (!data)
    return (
      <p className="settings-empty" role="status">
        Loading settings…
      </p>
    )

  const readOnly = Boolean(data.read_only_reason)
  return (
    <>
      {data.read_only_reason ? (
        <p className="settings-message settings-message--info">{data.read_only_reason}</p>
      ) : null}
      {status ? (
        <p className={`settings-message settings-message--${status.tone}`} role="status">
          {status.text}
        </p>
      ) : null}
      {data.groups.map((group) => {
        const fields = data.fields.filter((field) => field.group === group.id)
        if (!fields.length) return null
        return (
          <div key={group.id} className="settings-group">
            <h3 className="settings-group__title">{group.label}</h3>
            {fields.map((field) => {
              const disabled = readOnly || field.locked
              const note = field.locked
                ? 'Set by an environment variable, so it can only be changed there.'
                : field.restart_required
                  ? 'Takes effect after MusicBox restarts.'
                  : undefined
              return (
                <Row
                  key={field.key}
                  title={field.label}
                  description={field.description}
                  note={note}
                  control={
                    field.kind === 'secret' ? (
                      <SecretField field={field} disabled={disabled} onSave={(value) => save(field, value)} />
                    ) : field.kind === 'boolean' ? (
                      <Switch
                        label={field.label}
                        checked={field.value === true}
                        disabled={disabled}
                        onChange={(checked) => void save(field, checked)}
                      />
                    ) : (
                      <ValueField field={field} disabled={disabled} onSave={(value) => save(field, value)} />
                    )
                  }
                />
              )
            })}
          </div>
        )
      })}
      <p className="settings-footnote">
        Saved on this computer in <code>{data.config_file}</code>. Keys are never shown again after saving.
      </p>
    </>
  )
}

export function SettingsPage({ experience }: { experience: Experience }) {
  const music = useMusicStore()
  const theme = useTheme()
  const historyCount = useLibrary((state) => state.history.length)
  const sleepLabel =
    music.sleepAt === 'end'
      ? 'end of track'
      : typeof music.sleepAt === 'number'
        ? new Date(music.sleepAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'off'

  return (
    <div className={`settings-page settings-page--${experience}`}>
      <nav className="settings-nav" aria-label="Settings sections">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#settings-${id}`}
            onClick={(event) => {
              // Section links scroll in place; the app uses the URL hash for routing.
              event.preventDefault()
              document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="settings-content">
        <Section
          id="connections"
          title="Connections"
          intro="Keys and accounts MusicBox uses to reach YouTube, Spotify and Discord."
        >
          <ConnectionSettings />
        </Section>

        <Section id="playback" title="Playback">
          <Row
            title="Autoplay"
            description="When your music ends, keep listening with similar songs found on YouTube."
            control={
              <Switch
                label="Autoplay"
                checked={music.autoplay}
                onChange={(autoplay) => updateMusicState({ autoplay })}
              />
            }
          />
          <Row
            title="Sleep Timer"
            description={`Pause after a set time or when the current song ends. Now: ${sleepLabel}.`}
            control={
              <select
                className="settings-select"
                aria-label="Sleep timer"
                value={music.sleepAt === 'end' ? 'end' : music.sleepAt ? 'active' : 'off'}
                onChange={(event) =>
                  updateMusicState({
                    sleepAt:
                      event.target.value === 'off'
                        ? null
                        : event.target.value === 'end'
                          ? 'end'
                          : Date.now() + Number(event.target.value) * 60000,
                  })
                }
              >
                <option value="off">Off</option>
                {typeof music.sleepAt === 'number' ? <option value="active">Until {sleepLabel}</option> : null}
                <option value="5">5 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">1 hour</option>
                <option value="end">End of track</option>
              </select>
            }
          />
        </Section>

        <Section id="appearance" title="Appearance">
          <Row
            title="Video Theme"
            description="Light or dark for the Video experience. Music always uses its dark theme."
            control={
              <div className="settings-segmented" role="radiogroup" aria-label="Video theme">
                {(['light', 'dark'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={theme === value}
                    onClick={() => setTheme(value)}
                  >
                    {value === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </div>
            }
          />
        </Section>

        <Section id="privacy" title="Privacy and Data">
          <Row
            title="Private Session"
            description="Listen without adding to your history, recent searches, mixes or Discord status. Turns off when you restart MusicBox."
            control={
              <Switch
                label="Private session"
                checked={music.privateSession}
                onChange={(privateSession) => updateMusicState({ privateSession })}
              />
            }
          />
          <Row
            title="Listening and Watch History"
            description={`${historyCount} items. History powers Recently Played, On Repeat, your top artists and Daily Mixes, and never leaves this device.`}
            control={
              <button
                type="button"
                className="settings-button"
                disabled={!historyCount}
                onClick={() => {
                  clearHistory()
                  updateMusicState({ playCounts: {}, recentContexts: [] })
                }}
              >
                Clear history
              </button>
            }
          />
          <Row
            title="Recent Searches"
            description={`${music.recentSearches.length} saved in Music.`}
            control={
              <button
                type="button"
                className="settings-button"
                disabled={!music.recentSearches.length}
                onClick={() => updateMusicState({ recentSearches: [] })}
              >
                Clear searches
              </button>
            }
          />
        </Section>

        <Section id="shortcuts" title="Keyboard Shortcuts" intro="These work in the Music experience.">
          <div className="settings-shortcuts">
            {SHORTCUTS.map((group) => (
              <dl key={group.group}>
                <dt>{group.group}</dt>
                {group.items.map(([keys, action]) => (
                  <dd key={keys}>
                    <span>{action}</span>
                    <kbd>{keys}</kbd>
                  </dd>
                ))}
              </dl>
            ))}
          </div>
        </Section>

        <Section id="about" title="About">
          <div className="settings-about">
            <p>
              MusicBox is a personal player for YouTube and your own downloads, with a YouTube-style Video
              experience and a Spotify-style Music experience. It isn't affiliated with YouTube or Spotify.
            </p>
            <p>
              Crossfade, gapless playback, volume normalisation and an equaliser would need MusicBox to process
              YouTube's audio directly, which browsers block for streamed songs, so they are left out rather
              than shown as switches that do nothing.
            </p>
          </div>
        </Section>
      </div>
    </div>
  )
}
