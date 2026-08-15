/**
 * Shared background-image control: a URL box, an upload button and a clear button, with a
 * small live preview. Used by Settings (the global default) and the dashboard settings panel
 * (the per-dashboard override); uploads become `background:<id>` components and the field's
 * value a `bg:<id>` reference, so backups carry the image itself.
 */
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { saveBackground, useConfigStore } from '../store/config'
import { notify } from '../store/notify'
import { BG_REF_PREFIX, isUploadedBackground, newBackgroundId, resolveBackgroundRef } from '../model/background'
import { cssUrl } from './download'
import { processBackgroundFile } from './iconUpload'

export function BackgroundField({
  id,
  value,
  onChange,
}: {
  id: string
  value: string | undefined
  onChange: (ref: string | undefined) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const backgrounds = useConfigStore((s) => s.backgrounds)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const resolved = resolveBackgroundRef(value, backgrounds)
  const uploaded = value !== undefined && isUploadedBackground(value)
  const uploadedBytes = uploaded ? backgrounds.find((b) => BG_REF_PREFIX + b.id === value)?.bytes : undefined

  const upload = async (file: File) => {
    setBusy(true)
    try {
      const processed = await processBackgroundFile(file)
      const bgId = newBackgroundId()
      await saveBackground({ version: 1, id: bgId, ...processed })
      await onChange(BG_REF_PREFIX + bgId)
    } catch (err) {
      notify(
        t('Upload failed: {{error}} - uploads need an administrator sign-in.', {
          error: err instanceof Error ? err.message : String(err),
        })
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="nh-bgfield">
      <div className="nh-bgfield__row">
        {resolved ? <span className="nh-bgfield__thumb" style={{ backgroundImage: `url("${cssUrl(resolved)}")` }} /> : null}
        <input
          id={id}
          type="text"
          value={uploaded ? '' : (value ?? '')}
          placeholder={
            !uploaded
              ? t('Image URL, or upload one')
              : // an uploaded reference whose component is gone: say so rather than describing
                // an image that is not there
                !resolved
                ? t('The uploaded image is missing - upload another')
                : (uploadedBytes ?? 0) >= 1024 * 1024
                ? t('Uploaded image ({{mb}} MB)', { mb: ((uploadedBytes ?? 0) / (1024 * 1024)).toFixed(1) })
                : t('Uploaded image ({{kb}} KB)', { kb: Math.round((uploadedBytes ?? 0) / 1024) })
          }
          onChange={(e) => void onChange(e.target.value || undefined)}
        />
        <button type="button" className="nh-btn nh-btn--ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
          {busy ? t('Uploading…') : t('Upload image…')}
        </button>
        {value ? (
          <button
            type="button"
            className="nh-iconbtn"
            aria-label={t('Remove background')}
            title={t('Remove background')}
            onClick={() => void onChange(undefined)}
          >
            ✕
          </button>
        ) : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.svg,.png,.jpg,.jpeg,.gif,.webp,.bmp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void upload(file)
        }}
      />
    </div>
  )
}

