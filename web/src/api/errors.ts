/**
 * What to put in front of a person when a request failed.
 *
 * Every notice in the app used to interpolate `err.message`, and for an {@link ApiError} that
 * message starts with the request line it came from: "Save failed: PUT
 * /rest/ui/components/neohab:config/dashboard%3Akitchen -> 401: Authentication required". Correct,
 * useful in a log, and unreadable on a dashboard - the person is being shown the plumbing and left
 * to work out that the answer is "sign in".
 *
 * So `message` keeps the technical line (the About screen's report and the console still want it)
 * and this turns an error into the sentence a user can act on: the server's own words where they
 * say something, and a plain description of the status where they do not.
 *
 * Not a hook: notices are raised from stores, handlers and effects, so the translation comes
 * straight from the i18next instance. The strings below are ordinary catalog keys.
 */
import i18n from '../i18n'
import { ApiError } from './client'

/**
 * A browser failing to reach the server at all throws `TypeError: Failed to fetch` (or a
 * localised equivalent), which says nothing about openHAB. Recognised by shape rather than by
 * message text, which differs per browser and per language.
 */
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && !(err instanceof ApiError)
}

function apiErrorText(err: ApiError): string {
  // Before the server's own words: openHAB answers both of these with "Authentication required",
  // which describes the HTTP layer rather than what the reader should do about it.
  if (err.status === 401 || err.status === 403) {
    return i18n.t('the server refused it - sign in as an openHAB administrator')
  }
  if (err.detail) return err.detail
  if (err.status === 404) return i18n.t('the server does not have that (404)')
  if (err.status >= 500) return i18n.t('the openHAB server could not handle it ({{status}})', { status: err.status })
  return i18n.t('the server refused it ({{status}})', { status: err.status })
}

/** One line saying what went wrong, for a toast, a banner or an inline notice. */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) return apiErrorText(err)
  if (isNetworkError(err)) return i18n.t('the openHAB server could not be reached')
  if (err instanceof Error) return err.message
  return String(err)
}
