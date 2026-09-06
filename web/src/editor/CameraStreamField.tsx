/**
 * Camera name field, with optional discovery.
 *
 * The name is always a plain typed value - camera servers do not have to let this page list
 * them, and most do not by default. The Find button is an accelerator layered on top: when it
 * works you click a name, when it does not you keep typing and nothing is lost.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SettingField } from '../widgets/types'
import type { WidgetInstance } from '../model/dashboard'
import { updateWidgetConfig } from '../store/editor'
import { listStreams } from '../widgets/camera/discover'
import type { CameraSourceKind } from '../widgets/camera/model'

export function CameraStreamField({ field, widget, value }: { field: SettingField; widget: WidgetInstance; value: unknown }) {
  const { t } = useTranslation()
  const [found, setFound] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = `f-${widget.id}-${field.key}`

  const config = widget.config as Record<string, unknown>
  const source = (config.source as CameraSourceKind) ?? 'go2rtc'
  const server = config.server as string | undefined

  const find = async () => {
    setBusy(true)
    setError(null)
    const result = await listStreams(server, source)
    setBusy(false)
    if (result.ok) {
      setFound(result.streams)
      if (result.streams.length === 0) setError(t('That server reports no cameras.'))
      return
    }
    setFound(null)
    setError(
      result.reason === 'no-server'
        ? t('Enter the server address first.')
        : result.reason === 'bad-response'
          ? t('That address answered, but not with a camera list.')
          : t(
              'Could not read the camera list. The server may be unreachable, or may not allow this page to read it - go2rtc needs api: {origin: "*"} for that. Type the camera name instead.'
            )
    )
  }

  return (
    <div className="nh-field">
      <label className="nh-field__label" htmlFor={id}>
        {t(field.label)}
      </label>
      <div className="nh-camerafield">
        <input
          id={id}
          type="text"
          value={typeof value === 'string' ? value : ''}
          placeholder={t('camera name')}
          onChange={(e) => updateWidgetConfig(widget.id, field.key, e.target.value)}
        />
        <button type="button" className="nh-camerafield__find" onClick={() => void find()} disabled={busy}>
          {busy ? t('Finding…') : t('Find')}
        </button>
      </div>
      {found && found.length > 0 ? (
        <div className="nh-camerafield__list">
          {found.map((name) => (
            <button
              key={name}
              type="button"
              className={'nh-camerafield__pick' + (name === value ? ' nh-camerafield__pick--on' : '')}
              onClick={() => updateWidgetConfig(widget.id, field.key, name)}>
              {name}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="nh-field__hint">{error}</p> : null}
    </div>
  )
}
