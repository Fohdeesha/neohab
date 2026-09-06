import i18n from '../i18n'
import { ApiError } from './client'

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && !(err instanceof ApiError)
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
  if (isNetworkError(err)) return i18n.t('the openHAB server could not be reached')
  if (err instanceof Error) return err.message
  return String(err)
}
