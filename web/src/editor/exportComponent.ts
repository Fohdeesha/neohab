import { downloadJson } from '../components/download'
import i18n from '../i18n'
import { partialFileName } from '../model/partial'
import { buildComponentExport } from '../store/config'
import { errorText } from '../api/errors'

export async function exportComponent(kind: 'widgetdef' | 'theme', id: string, onNotice: (message: string | null) => void): Promise<void> {
  onNotice(null)
  try {
    const out = await buildComponentExport(kind, id)
    if (!out) {
      onNotice(i18n.t('Export failed: {{error}}', { error: i18n.t('it is no longer there') }))
      return
    }
    downloadJson(partialFileName(kind, id), out.bundle)
    if (out.missing.length > 0) {
      onNotice(
        i18n.t('Exported, but {{count}} referenced items no longer exist and were left out: {{list}}', {
          count: out.missing.length,
          list: out.missing.join(', ')
        })
      )
    }
  } catch (err) {
    onNotice(i18n.t('Export failed: {{error}}', { error: errorText(err) }))
  }
}
