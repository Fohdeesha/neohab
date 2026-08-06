/**
 * Is this URL served by the same origin as neohab?
 *
 * There were two of these, same name, opposite answers for a URL that cannot be parsed - each
 * right for its own caller, and together a trap for anyone reading both. The fallback is an
 * argument now, so the answer to "what about a URL we cannot place?" is stated at the call site
 * rather than hidden inside a helper.
 */
export function isSameOrigin(url: string, whenUnparseable: boolean): boolean {
  try {
    return new URL(url, location.href).origin === location.origin
  } catch {
    return whenUnparseable
  }
}
