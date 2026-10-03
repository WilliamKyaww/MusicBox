import { clearHistory, useLibrary } from '../../library'
import { MusicIcon } from '../MusicIcon'
import { SHORTCUTS } from '../shortcuts'
import { updateMusicState, useMusicStore } from '../store'
import { Toggle } from '../ui'

export function SettingsView({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const music = useMusicStore()
  const historyCount = useLibrary((state) => state.history.length)
  const sleepLabel =
    music.sleepAt === 'end'
      ? 'end of track'
      : typeof music.sleepAt === 'number'
        ? new Date(music.sleepAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'off'
  return (
    <div className="music-page music-page--padded music-settings">
      <h1>Settings</h1>

      <h2>Playback</h2>
      <section className="music-setting">
        <div>
          <h3>Autoplay</h3>
          <p>When your music ends, keep listening with similar songs found on YouTube.</p>
        </div>
        <Toggle
          label="Autoplay"
          checked={music.autoplay}
          onChange={(autoplay) => updateMusicState({ autoplay })}
        />
      </section>
      <section className="music-setting">
        <div>
          <h3>Sleep timer</h3>
          <p>Pause after a set time or when the current song ends. Now: {sleepLabel}.</p>
        </div>
        <select
          aria-label="Sleep timer"
          value={music.sleepAt === 'end' ? 'end' : music.sleepAt ? 'active' : 'off'}
          onChange={(e) =>
            updateMusicState({
              sleepAt:
                e.target.value === 'off'
                  ? null
                  : e.target.value === 'end'
                    ? 'end'
                    : Date.now() + Number(e.target.value) * 60000,
            })
          }
        >
          <option value="off">Off</option>
          {typeof music.sleepAt === 'number' ? (
            <option value="active">Until {sleepLabel}</option>
          ) : null}
          <option value="5">5 minutes</option>
          <option value="15">15 minutes</option>
          <option value="30">30 minutes</option>
          <option value="45">45 minutes</option>
          <option value="60">1 hour</option>
          <option value="end">End of track</option>
        </select>
      </section>

      <h2>Privacy</h2>
      <section className="music-setting">
        <div>
          <h3>Private session</h3>
          <p>
            Listen without adding to your history, recent searches, mixes or Discord status. Turns
            off when you restart MusicBox.
          </p>
        </div>
        <Toggle
          label="Private session"
          checked={music.privateSession}
          onChange={(privateSession) => updateMusicState({ privateSession })}
        />
      </section>
      <section className="music-setting">
        <div>
          <h3>Listening history</h3>
          <p>
            {historyCount} songs in your history. It powers Recently played, On Repeat, your top
            artists and Daily Mixes, and never leaves this device.
          </p>
        </div>
        <button
          type="button"
          className="music-button"
          disabled={!historyCount}
          onClick={() => {
            clearHistory()
            updateMusicState({ playCounts: {}, recentContexts: [] })
          }}
        >
          Clear history
        </button>
      </section>
      <section className="music-setting">
        <div>
          <h3>Recent searches</h3>
          <p>{music.recentSearches.length} saved.</p>
        </div>
        <button
          type="button"
          className="music-button"
          disabled={!music.recentSearches.length}
          onClick={() => updateMusicState({ recentSearches: [] })}
        >
          Clear searches
        </button>
      </section>

      <h2>Keyboard shortcuts</h2>
      <section className="music-setting music-setting--stack">
        <div className="music-shortcut-columns">
          {SHORTCUTS.map((group) => (
            <dl key={group.group} className="music-shortcut-list">
              <dt>{group.group}</dt>
              {group.items.slice(0, 5).map(([keys, action]) => (
                <dd key={keys}>
                  <span>{action}</span>
                  <kbd>{keys}</kbd>
                </dd>
              ))}
            </dl>
          ))}
        </div>
        <button type="button" className="music-button" onClick={onShowShortcuts}>
          <MusicIcon name="keyboard" />
          All shortcuts
        </button>
      </section>

      <h2>About</h2>
      <section className="music-setting music-setting--stack">
        <div>
          <h3>A Spotify-style player for your MusicBox library</h3>
          <p>
            Songs, artists and lyrics come from YouTube and your own downloads. It is not affiliated
            with Spotify, and Spotify accounts, catalog streaming, Connect, Jam, Blend and the AI DJ
            are not available here.
          </p>
          <p>
            Crossfade, gapless playback, volume normalization and the equalizer would need the app
            to process YouTube's audio directly, which the browser blocks for streamed songs. They
            are left out rather than shown as switches that do nothing.
          </p>
          <a href="https://support.spotify.com/us/" target="_blank" rel="noreferrer">
            Spotify feature reference
          </a>
        </div>
      </section>
    </div>
  )
}
