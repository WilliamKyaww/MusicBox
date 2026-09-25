import { useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/Icons'
import { PLAYBACK_RATES } from './playbackRates'
import type { CaptionTrack, QualityOption } from '../types'

type Panel = 'main' | 'speed' | 'quality' | 'captions'

type PlayerSettingsMenuProps = {
  playbackRate: number
  onPlaybackRateChange: (rate: number) => void
  qualities: QualityOption[]
  qualityId: string | null
  onQualityChange: (qualityId: string) => void
  qualityNote: string | null
  captions: CaptionTrack[]
  captionLang: string | null
  onCaptionChange: (lang: string | null) => void
  loop: boolean
  onLoopChange: (loop: boolean) => void
  canSwitchToEmbed: boolean
  onSwitchToEmbed: () => void
}

function rateLabel(rate: number) {
  return rate === 1 ? 'Normal' : `${rate}`
}

export function PlayerSettingsMenu({
  playbackRate,
  onPlaybackRateChange,
  qualities,
  qualityId,
  onQualityChange,
  qualityNote,
  captions,
  captionLang,
  onCaptionChange,
  loop,
  onLoopChange,
  canSwitchToEmbed,
  onSwitchToEmbed,
}: PlayerSettingsMenuProps) {
  const [panel, setPanel] = useState<Panel>('main')
  const activeCaption = captions.find((track) => track.lang === captionLang)
  const activeQuality = qualities.find((quality) => quality.id === qualityId)

  if (panel === 'speed') {
    return (
      <div className="yt-settings" role="menu">
        <button type="button" className="yt-settings__back" onClick={() => setPanel('main')}>
          <ChevronLeftIcon className="yt-icon" />
          Playback speed
        </button>
        <label className="yt-settings__custom">
          <span>Custom ({playbackRate.toFixed(2)}x)</span>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={playbackRate}
            onChange={(event) => onPlaybackRateChange(Number(event.target.value))}
          />
        </label>
        {PLAYBACK_RATES.map((rate) => (
          <button
            key={rate}
            type="button"
            role="menuitemradio"
            aria-checked={rate === playbackRate}
            className="yt-settings__option"
            onClick={() => {
              onPlaybackRateChange(rate)
              setPanel('main')
            }}
          >
            {rateLabel(rate)}
          </button>
        ))}
      </div>
    )
  }

  if (panel === 'quality') {
    return (
      <div className="yt-settings" role="menu">
        <button type="button" className="yt-settings__back" onClick={() => setPanel('main')}>
          <ChevronLeftIcon className="yt-icon" />
          Quality
        </button>
        {qualities.map((quality) => (
          <button
            key={quality.id}
            type="button"
            role="menuitemradio"
            aria-checked={quality.id === qualityId}
            className="yt-settings__option"
            onClick={() => {
              onQualityChange(quality.id)
              setPanel('main')
            }}
          >
            {quality.label}
            {quality.height >= 720 ? <sup className="yt-settings__hd">HD</sup> : null}
          </button>
        ))}
      </div>
    )
  }

  if (panel === 'captions') {
    return (
      <div className="yt-settings" role="menu">
        <button type="button" className="yt-settings__back" onClick={() => setPanel('main')}>
          <ChevronLeftIcon className="yt-icon" />
          Subtitles/CC
        </button>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={captionLang === null}
          className="yt-settings__option"
          onClick={() => {
            onCaptionChange(null)
            setPanel('main')
          }}
        >
          Off
        </button>
        {captions.map((track) => (
          <button
            key={track.lang}
            type="button"
            role="menuitemradio"
            aria-checked={track.lang === captionLang}
            className="yt-settings__option"
            onClick={() => {
              onCaptionChange(track.lang)
              setPanel('main')
            }}
          >
            {track.name}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="yt-settings" role="menu">
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={loop}
        className="yt-settings__row"
        onClick={() => onLoopChange(!loop)}
      >
        <span>Loop</span>
        <span className={`yt-switch ${loop ? 'yt-switch--on' : ''}`} aria-hidden="true" />
      </button>
      <button type="button" className="yt-settings__row" onClick={() => setPanel('speed')}>
        <span>Playback speed</span>
        <span className="yt-settings__value">
          {rateLabel(playbackRate)}
          <ChevronRightIcon className="yt-icon" />
        </span>
      </button>
      {captions.length > 0 ? (
        <button type="button" className="yt-settings__row" onClick={() => setPanel('captions')}>
          <span>Subtitles/CC</span>
          <span className="yt-settings__value">
            {activeCaption ? activeCaption.name : 'Off'}
            <ChevronRightIcon className="yt-icon" />
          </span>
        </button>
      ) : null}
      {qualities.length > 0 ? (
        <button type="button" className="yt-settings__row" onClick={() => setPanel('quality')}>
          <span>Quality</span>
          <span className="yt-settings__value">
            {activeQuality?.label ?? 'Auto'}
            <ChevronRightIcon className="yt-icon" />
          </span>
        </button>
      ) : qualityNote ? (
        <div className="yt-settings__row yt-settings__row--static">
          <span>Quality</span>
          <span className="yt-settings__value">{qualityNote}</span>
        </div>
      ) : null}
      {canSwitchToEmbed ? (
        <button type="button" className="yt-settings__row" onClick={onSwitchToEmbed}>
          <span>Use YouTube player</span>
          <span className="yt-settings__value">
            <ChevronRightIcon className="yt-icon" />
          </span>
        </button>
      ) : null}
    </div>
  )
}
