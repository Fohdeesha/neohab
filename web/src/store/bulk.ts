import i18n from '../i18n'

let running = false

/**
 * One bulk rewrite of the configuration at a time on this device: an import, a restore, a HABPanel
 * import or a generated dashboard set. Two at once would each work from their own read of the server
 * and leave whatever the slower one wrote last.
 */
export async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  if (running) throw new Error(i18n.t('Another import or restore is still running. Try again when it has finished.'))
  running = true
  try {
    return await fn()
  } finally {
    running = false
  }
}
