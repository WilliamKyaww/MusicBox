import { getApiHref } from './client'

export function getStreamUrl(videoId: string) {
  return getApiHref(`/api/stream/${videoId}`)
}
