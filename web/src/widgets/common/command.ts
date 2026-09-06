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

/**
 * Send a command, reporting failure to the user. Resolves true when the server accepted it.
 *
 * The notice names the item and says what happened in words. It used to end in the HTTP status -
 * "nh_switch rejected “ON” (400)" - which tells the person pressing the button nothing they can
 * act on, and reads like a fault in the panel rather than in what it is talking to. The item's
 * NAME stays: a dashboard can carry several widgets on one item, and the name is what its owner
 * configured, so it is the part that says which thing did not move.
 */
export async function commandItem(item: string, command: string): Promise<boolean> {
  try {
    await sendCommand(item, command)
    return true
  } catch (err) {
    notify(commandFailure(item, command, err))
    return false
  }
}

function commandFailure(item: string, command: string, err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return i18n.t('Not allowed to send “{{command}}” to {{item}}', { item, command })
    }
    if (err.status === 404) {
      return i18n.t('{{item}} is not on this openHAB server anymore', { item })
    }
    if (err.status >= 500) {
      return i18n.t('The openHAB server could not send “{{command}}” to {{item}}', { item, command })
    }
    // 400 and friends: openHAB looked at the command and would not take it. Its own words say
    // more than the code does when it bothers to give any.
    return err.detail
      ? i18n.t('{{item}} would not take “{{command}}”: {{detail}}', { item, command, detail: err.detail })
      : i18n.t('{{item}} would not take “{{command}}”', { item, command })
  }
  return i18n.t('“{{command}}” could not be sent to {{item}} - the server did not answer', { item, command })
}
