/**
 * The one path every widget command goes through.
 *
 * openHAB refuses commands it considers invalid (an out-of-range hue, a value a binding won't
 * take) with a 4xx and no server-side log line. Fire-and-forget commands made that silent: the
 * control kept showing a value the device never took, and the rejection surfaced only as an
 * unhandled promise rejection in the console.
 *
 * Never rejects, so widgets that don't care can fire-and-forget without resurrecting that
 * problem; the boolean lets widgets holding an optimistic display value drop it and snap back
 * to the device's real state.
 */
import { sendCommand } from '../../api/items'
import { ApiError } from '../../api/client'
import { notify } from '../../store/notify'
import i18n from '../../i18n'

/** Send a command, reporting failure to the user. Resolves true when the server accepted it. */
export async function commandItem(item: string, command: string): Promise<boolean> {
  try {
    await sendCommand(item, command)
    return true
  } catch (err) {
    if (err instanceof ApiError) {
      notify(i18n.t('{{item}} rejected “{{command}}” ({{status}})', { item, command, status: err.status }))
    } else {
      notify(i18n.t('{{item}}: “{{command}}” could not be sent', { item, command }))
    }
    return false
  }
}
