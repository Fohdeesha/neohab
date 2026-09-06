import { sendCommand } from '../../api/items'
import { ApiError } from '../../api/client'
import { notify } from '../../store/notify'
import i18n from '../../i18n'

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
    return err.detail
      ? i18n.t('{{item}} would not take “{{command}}”: {{detail}}', { item, command, detail: err.detail })
      : i18n.t('{{item}} would not take “{{command}}”', { item, command })
  }
  return i18n.t('“{{command}}” could not be sent to {{item}} - the server did not answer', { item, command })
}
