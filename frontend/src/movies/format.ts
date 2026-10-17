import type { CSSProperties } from 'react'
import type { Movie } from './api'

/** Display helpers for Movies metadata. Anything unknown formats to an empty string, never "undefined" or "0". */

export const releaseYear = (date: string) => /^\d{4}/.test(date) ? date.slice(0, 4) : ''

export function formatRuntime(minutes: number) {
  if (!Number.isFinite(minutes) || minutes < 1) return ''
  const total = Math.round(minutes)
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (!hours) return `${rest}m`
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** A full release date when the source has one ("12 March 2024"), otherwise just the year. */
export function formatDate(date: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const parsed = new Date(`${date}T00:00:00Z`)
    if (!Number.isNaN(parsed.getTime())) return dateFormat.format(parsed)
  }
  return releaseYear(date)
}

export const ratingLabel = (rating: number) => Number.isFinite(rating) && rating > 0 ? rating.toFixed(1) : ''

/** HD or 4K when a playable file is known to be that tall. Online streams choose their size at play time. */
export function qualityBadge(movie: Movie) {
  const height = Math.max(0, ...movie.assets.filter(asset => asset.available).map(asset => asset.height || 0))
  return height >= 2160 ? '4K' : height >= 720 ? 'HD' : ''
}

export function seasonsLabel(movie: Movie) {
  const count = movie.seasons.filter(season => season.number > 0).length
  return count ? `${count} season${count === 1 ? '' : 's'}` : ''
}

export const typeLabel = (movie: Movie) => movie.kind === 'show' ? 'Series' : movie.kind === 'episode' ? 'Episode' : 'Film'

/** Year, maturity rating and length, skipping whatever is not known. */
export function metaParts(movie: Movie) {
  return [
    releaseYear(movie.date),
    movie.certification,
    movie.kind === 'show' ? seasonsLabel(movie) : formatRuntime(movie.runtime),
  ].filter(Boolean)
}

/** Free online films come from the curated provider; everything else is a file the user registered. */
export const sourceOf = (movie: Movie): 'free' | 'collection' =>
  movie.online_source || movie.id.startsWith('open:') ? 'free' : 'collection'

export const sourceLabel = (movie: Movie) => sourceOf(movie) === 'free' ? 'Free to watch' : 'In your collection'

/** Hides black bars baked into a picture, using the title's recorded inset (see `object-view-box` in movies.css). */
export function artInset(movie: Movie) {
  return movie.art_inset && /^\d+(\.\d+)?%?( \d+(\.\d+)?%?){0,3}$/.test(movie.art_inset) ? `inset(${movie.art_inset})` : undefined
}

/** The picture's own crop, passed to CSS as --art-inset. */
export function artStyle(movie: Movie) {
  const inset = artInset(movie)
  return inset ? { '--art-inset': inset } as CSSProperties : undefined
}

/** Wide art suits cards and banners; tall posters suit the details page. */
export const artFor = (movie: Movie, shape: 'wide' | 'tall') =>
  (shape === 'wide' ? movie.backdrop ?? movie.poster : movie.poster ?? movie.backdrop) || null

export const isWatchable = (movie: Movie) => movie.watchable ?? movie.playable

export const inProgress = (movie: Movie) => !!movie.progress && !movie.progress.completed && movie.progress.position > 0

export function progressFraction(movie: Movie) {
  const progress = movie.progress
  if (!progress || !(progress.duration > 0)) return 0
  return Math.max(0, Math.min(1, progress.position / progress.duration))
}

/** Where the main action of a title leads: films and episodes play, a series opens its episodes. */
export function actionFor(movie: Movie) {
  if (movie.kind === 'show') return { view: 'details' as const, label: 'Episodes', plays: false }
  return { view: 'watch' as const, label: inProgress(movie) ? 'Resume' : 'Play', plays: true }
}

/** Every word typed must appear somewhere in the title's text, in any order. */
export function matchesQuery(movie: Movie, query: string) {
  const words = query.toLocaleLowerCase('en-GB').split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = [movie.title, movie.description, movie.genres.join(' '), movie.cast.join(' '), movie.crew.join(' ')]
    .join(' ').toLocaleLowerCase('en-GB')
  return words.every(word => text.includes(word))
}

/** One row per genre that has enough titles to be worth a row, biggest first. */
export function genreRows(items: Movie[], minimum = 2) {
  const groups = new Map<string, Movie[]>()
  for (const item of items) for (const genre of new Set(item.genres)) groups.set(genre, [...(groups.get(genre) ?? []), item])
  return [...groups]
    .filter(([, group]) => group.length >= minimum)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'en-GB'))
    .map(([genre, group]) => ({ genre, items: group }))
}

/** The title to feature first: one with artwork, so the banner never looks empty. */
export const pickFeatured = (items: Movie[]) => items.find(item => artFor(item, 'wide')) ?? items[0]
