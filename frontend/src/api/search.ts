import { ApiError, apiFetchJson, buildApiUrl } from './client'
import type { SearchFilters, SearchResponse } from '../types'

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  order: 'relevance',
  duration: 'any',
  uploadDate: 'any',
}

export async function searchVideos(
  query: string,
  signal?: AbortSignal,
  options: { pageToken?: string | null; filters?: SearchFilters } = {},
) {
  const filters = options.filters ?? DEFAULT_SEARCH_FILTERS
  const url = new URL(buildApiUrl('/api/search'), window.location.origin)
  url.searchParams.set('q', query)
  url.searchParams.set('max_results', '20')
  url.searchParams.set('order', filters.order)
  url.searchParams.set('duration', filters.duration)
  url.searchParams.set('upload_date', filters.uploadDate)
  if (options.pageToken) {
    url.searchParams.set('page_token', options.pageToken)
  }

  try {
    return await apiFetchJson<SearchResponse>(`${url.pathname}${url.search}`, {
      method: 'GET',
      signal,
    })
  } catch (error) {
    if (error instanceof ApiError) {
      error.name = 'SearchApiError'
    }
    throw error
  }
}
