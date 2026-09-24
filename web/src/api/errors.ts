import i18n from '../i18n'
import { NetworkError } from './base'
import { ApiError } from './client'

// a fetch that went through boundedFetch says so itself; one that did not reports a TypeError whose
// wording depends on the browser, and every OTHER TypeError is a bug that must not read as "unreachable"
const FETCH_FAILURE = /failed to fetch|networkerror|load failed|network connection/i

function isNetworkError(err: unknown): boolean {
  if (err instanceof NetworkError) return !err.timedOut
  return err instanceof TypeError && FETCH_FAILURE.test(err.message)
}

function apiErrorText(err: ApiError): string {
  // before the server's own words: openHAB says "Authentication required", which describes the protocol rather
  // than the remedy
  if (err.status === 401 || err.status === 403) {
    return i18n.t('the server refused it - sign in as an openHAB administrator')
  }
  if (err.detail) return err.detail
  if (err.status === 404) return i18n.t('the server does not have that (404)')
  if (err.status >= 500) return i18n.t('the openHAB server could not handle it ({{status}})', { status: err.status })
  return i18n.t('the server refused it ({{status}})', { status: err.status })
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return apiErrorText(err)
  if (err instanceof NetworkError && err.timedOut) return i18n.t('the openHAB server did not answer in time')
  if (isNetworkError(err)) return i18n.t('the openHAB server could not be reached')
  if (err instanceof Error) return err.message
  return String(err)
}
