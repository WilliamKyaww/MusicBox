import { useState } from 'react'
import { ModalDialog } from './ModalDialog'
import { formatSectionLabel, parseTimecode } from '../downloadSections'
import { formatClock } from '../format'
import type {
  DownloadDestination,
  DownloadOptions,
  DownloadSection,
  MediaKind,
  VideoQuality,
  VideoSearchResult,
} from '../types'

type DownloadOptionsDialogProps = {
  video: VideoSearchResult
  initialSection?: DownloadSection
  isBusy: boolean
  onConfirm: (video: VideoSearchResult, options: DownloadOptions) => void
  onCancel: () => void
}

type SectionPresetId = 'full' | '5' | '10' | '30' | 'custom'

const MEDIA_KINDS: { id: MediaKind; label: string; hint: string }[] = [
  { id: 'audio', label: 'MP3 audio', hint: 'Audio only, converted to MP3' },
  { id: 'video', label: 'MP4 video', hint: 'Full video with sound' },
]

const VIDEO_QUALITIES: { id: VideoQuality; label: string }[] = [
  { id: 'best', label: 'Best' },
  { id: '2160', label: '4K' },
  { id: '1440', label: '1440p' },
  { id: '1080', label: '1080p' },
  { id: '720', label: '720p' },
  { id: '480', label: '480p' },
  { id: '360', label: '360p' },
]

const DESTINATIONS: { id: DownloadDestination; label: string; hint: string }[] = [
  {
    id: 'library',
    label: 'Save to library',
    hint: 'Queues on the server and appears under Saved Songs',
  },
  {
    id: 'device',
    label: 'Download to this device',
    hint: 'Prepares the file and sends it straight to your downloads folder',
  },
]

const SECTION_PRESETS: { id: SectionPresetId; label: string }[] = [
  { id: 'full', label: 'Whole video' },
  { id: '5', label: 'First 5 min' },
  { id: '10', label: 'First 10 min' },
  { id: '30', label: 'First 30 min' },
  { id: 'custom', label: 'Custom range' },
]

function videoDurationSeconds(video: VideoSearchResult) {
  if (video.duration_seconds) return video.duration_seconds
  return /^\d+(:\d{2}){1,2}$/.test(video.duration_label)
    ? parseTimecode(video.duration_label)
    : null
}

export function DownloadOptionsDialog({
  video,
  initialSection,
  isBusy,
  onConfirm,
  onCancel,
}: DownloadOptionsDialogProps) {
  const hasInitialSection = Boolean(
    initialSection && (initialSection.startSeconds > 0 || initialSection.endSeconds !== null),
  )
  // A section picked on the watch page usually means a video clip.
  const [mediaKind, setMediaKind] = useState<MediaKind>(hasInitialSection ? 'video' : 'audio')
  const [videoQuality, setVideoQuality] = useState<VideoQuality>('best')
  const [destination, setDestination] = useState<DownloadDestination>('library')
  const [sectionPreset, setSectionPreset] = useState<SectionPresetId>(
    hasInitialSection ? 'custom' : 'full',
  )
  const [customStart, setCustomStart] = useState(
    formatClock(hasInitialSection ? initialSection?.startSeconds ?? 0 : 0),
  )
  const [customEnd, setCustomEnd] = useState(
    hasInitialSection && initialSection?.endSeconds != null
      ? formatClock(initialSection.endSeconds)
      : '',
  )
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const durationSeconds = videoDurationSeconds(video)

  type ResolvedSection =
    | { ok: true; section: DownloadSection }
    | { ok: false; error: string }

  function resolveSection(): ResolvedSection {
    if (sectionPreset === 'full') {
      return { ok: true, section: { startSeconds: 0, endSeconds: null } }
    }

    if (sectionPreset !== 'custom') {
      return {
        ok: true,
        section: { startSeconds: 0, endSeconds: Number(sectionPreset) * 60 },
      }
    }

    const startSeconds = customStart.trim() ? parseTimecode(customStart) : 0
    if (startSeconds === null) {
      return { ok: false, error: 'Start time must look like 0:30, 2:15 or 1:02:03.' }
    }

    const endSeconds = customEnd.trim() ? parseTimecode(customEnd) : null
    if (customEnd.trim() && endSeconds === null) {
      return { ok: false, error: 'End time must look like 0:30, 2:15 or 1:02:03.' }
    }

    if (endSeconds !== null && endSeconds <= startSeconds) {
      return { ok: false, error: 'The end time must be later than the start time.' }
    }

    return { ok: true, section: { startSeconds, endSeconds } }
  }

  const resolved = resolveSection()

  function handleConfirm() {
    if (!resolved.ok) {
      setValidationMessage(resolved.error)
      return
    }

    setValidationMessage(null)
    onConfirm(video, {
      mediaKind,
      videoQuality,
      destination,
      section: resolved.section,
    })
  }

  return (
    <ModalDialog
      title="Download options"
      description={video.title}
      confirmLabel={
        destination === 'device' ? 'Download to device' : 'Add to library'
      }
      isBusy={isBusy}
      onConfirm={handleConfirm}
      onCancel={onCancel}
    >
      <div className="download-options">
        <fieldset className="download-options__group">
          <legend className="download-options__legend">Format</legend>
          <div className="download-options__choices">
            {MEDIA_KINDS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`download-options__choice ${
                  mediaKind === option.id ? 'download-options__choice--active' : ''
                }`}
                aria-pressed={mediaKind === option.id}
                onClick={() => setMediaKind(option.id)}
              >
                <span className="download-options__choice-label">{option.label}</span>
                <span className="download-options__choice-hint">{option.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {mediaKind === 'video' ? (
          <fieldset className="download-options__group">
            <legend className="download-options__legend">Video quality</legend>
            <div className="download-options__choices download-options__choices--compact">
              {VIDEO_QUALITIES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`download-options__chip ${
                    videoQuality === option.id ? 'download-options__chip--active' : ''
                  }`}
                  aria-pressed={videoQuality === option.id}
                  onClick={() => setVideoQuality(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="download-options__group">
          <legend className="download-options__legend">Destination</legend>
          <div className="download-options__choices">
            {DESTINATIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`download-options__choice ${
                  destination === option.id ? 'download-options__choice--active' : ''
                }`}
                aria-pressed={destination === option.id}
                onClick={() => setDestination(option.id)}
              >
                <span className="download-options__choice-label">{option.label}</span>
                <span className="download-options__choice-hint">{option.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="download-options__group">
          <legend className="download-options__legend">Section</legend>
          <div className="download-options__choices download-options__choices--compact">
            {SECTION_PRESETS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`download-options__chip ${
                  sectionPreset === option.id ? 'download-options__chip--active' : ''
                }`}
                aria-pressed={sectionPreset === option.id}
                onClick={() => {
                  setSectionPreset(option.id)
                  setValidationMessage(null)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          {sectionPreset === 'custom' ? (
            <div className="download-options__range">
              <label className="download-options__field">
                <span>Start</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={customStart}
                  placeholder="0:00"
                  onChange={(event) => setCustomStart(event.target.value)}
                />
              </label>
              <label className="download-options__field">
                <span>End</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={customEnd}
                  placeholder="End of video"
                  onChange={(event) => setCustomEnd(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          {sectionPreset === 'custom' && durationSeconds ? (
            <RangeSlider
              duration={durationSeconds}
              start={parseTimecode(customStart) ?? 0}
              end={customEnd.trim() ? parseTimecode(customEnd) ?? durationSeconds : durationSeconds}
              onChange={(start, end) => {
                setCustomStart(formatClock(start))
                setCustomEnd(end >= durationSeconds ? '' : formatClock(end))
                setValidationMessage(null)
              }}
            />
          ) : null}

          {resolved.ok ? (
            <p className="download-options__summary">
              Downloading:{' '}
              {formatSectionLabel(
                resolved.section.startSeconds,
                resolved.section.endSeconds,
              )}
              {video.duration_label ? ` of ${video.duration_label}` : ''}
            </p>
          ) : null}
        </fieldset>

        {validationMessage ? (
          <p className="download-options__error" role="alert">
            {validationMessage}
          </p>
        ) : null}

        {destination === 'device' ? (
          <p className="download-options__note">
            The file is prepared on the server first, so a long section can take a
            while before your browser starts saving it.
          </p>
        ) : null}
      </div>
    </ModalDialog>
  )
}

type RangeSliderProps = {
  duration: number
  start: number
  end: number
  onChange: (start: number, end: number) => void
}

/** Two overlapping range inputs acting as one slider with a start and an end handle. */
function RangeSlider({ duration, start, end, onChange }: RangeSliderProps) {
  const clampedStart = Math.min(Math.max(0, start), duration)
  const clampedEnd = Math.min(Math.max(clampedStart, end), duration)

  return (
    <div className="range-slider">
      <div className="range-slider__track">
        <span
          className="range-slider__fill"
          style={{
            left: `${(clampedStart / duration) * 100}%`,
            width: `${((clampedEnd - clampedStart) / duration) * 100}%`,
          }}
        />
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={clampedStart}
          aria-label="Section start"
          onChange={(event) =>
            onChange(Math.min(Number(event.target.value), clampedEnd - 1), clampedEnd)
          }
        />
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={clampedEnd}
          aria-label="Section end"
          onChange={(event) =>
            onChange(clampedStart, Math.max(Number(event.target.value), clampedStart + 1))
          }
        />
      </div>
      <div className="range-slider__labels">
        <span>0:00</span>
        <span>{formatClock(duration)}</span>
      </div>
    </div>
  )
}
