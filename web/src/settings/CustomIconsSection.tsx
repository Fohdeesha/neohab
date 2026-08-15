import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  saveSettings,
  useConfigStore
} from '../store/config'
import { NumberSetting } from '../components/NumberSetting'
import { deleteCustomIcon, saveCustomIcon } from '../store/config'
import { Icon } from '../components/Icon'
import { slugifyIconId, type CustomIcon } from '../model/customIcon'
import { DEFAULT_MAX_ICON_KB, processIconFile } from '../components/iconUpload'

/** Manager for user-uploaded icons: upload, rename, delete, and the upload size limit. */
export function CustomIconsSection({ onNotice }: { onNotice: (m: string | null) => void }) {
  const { t } = useTranslation()
  // Selectors, not the whole store: this section re-rendered on every unrelated configuration
  // change - a theme edit, a dashboard save - to read two fields.
  const customIcons = useConfigStore((s) => s.customIcons)
  const maxKB = useConfigStore((s) => s.settings.maxIconKB) ?? DEFAULT_MAX_ICON_KB
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const totalKB = Math.round(customIcons.reduce((sum, i) => sum + (i.bytes || 0), 0) / 1024)

  const upload = async (file: File) => {
    onNotice(null)
    setUploading(true)
    try {
      const processed = await processIconFile(file, maxKB)
      const name = file.name.replace(/\.[^.]+$/, '') || 'icon'
      const id = slugifyIconId(name, new Set(customIcons.map((i) => i.id)))
      await saveCustomIcon({ version: 1, id, name, ...processed })
    } catch (err) {
      onNotice(
        t('Upload failed: {{error}} - uploads need an administrator sign-in.', {
          error: err instanceof Error ? err.message : String(err),
        })
      )
    } finally {
      setUploading(false)
    }
  }

  const remove = async (icon: CustomIcon) => {
    if (!window.confirm(t('Delete icon “{{name}}”? Widgets using it will show no icon.', { name: icon.name }))) return
    onNotice(null)
    try {
      await deleteCustomIcon(icon.id)
    } catch (err) {
      onNotice(t('Deleting the icon failed: {{error}}', { error: err instanceof Error ? err.message : String(err) }))
    }
  }

  return (
    <section>
      <h2 className="nh-settings__h">{t('Custom icons')}</h2>
      <p className="nh-settings__text">
        {t(
          'Upload your own icons (PNG, JPG, GIF, WebP, BMP or SVG - transparency and GIF animation survive) and pick them from the icon picker\'s Custom tab on any widget. They are stored in the openHAB configuration, so backups and exports include them.'
        )}
        {customIcons.length > 0
          ? ' ' + t('Using {{kb}} KB across {{count}} icons.', { kb: totalKB, count: customIcons.length })
          : ''}
      </p>
      {customIcons.length > 0 ? (
        <div className="nh-iconman">
          {customIcons.map((icon) => (
            <CustomIconRow key={icon.id} icon={icon} onNotice={onNotice} onDelete={() => void remove(icon)} />
          ))}
        </div>
      ) : null}
      <div className="nh-settings__row">
        <button type="button" className="nh-btn nh-btn--ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? t('Uploading…') : t('Upload icon…')}
        </button>
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
        <NumberSetting
          id="icon-maxkb"
          className="nh-iconman__limit"
          label={t('Upload limit (KB)')}
          value={maxKB}
          min={50}
          max={2000}
          onCommit={(v) => void saveSettings({ maxIconKB: v })}
        />
      </div>
    </section>
  )
}

function CustomIconRow({
  icon,
  onNotice,
  onDelete,
}: {
  icon: CustomIcon
  onNotice: (m: string | null) => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(icon.name)

  const commitRename = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === icon.name) {
      setName(icon.name)
      return
    }
    try {
      await saveCustomIcon({ ...icon, name: trimmed })
    } catch (err) {
      onNotice(t('Renaming the icon failed: {{error}}', { error: err instanceof Error ? err.message : String(err) }))
      setName(icon.name)
    }
  }

  return (
    <div className="nh-iconman__row">
      <Icon icon={'custom:' + icon.id} size={28} />
      <input
        type="text"
        className="nh-iconman__name"
        value={name}
        aria-label={t('Rename icon {{name}}', { name: icon.name })}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void commitRename()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
      />
      <span className="nh-iconman__meta">
        custom:{icon.id} · {Math.max(1, Math.round((icon.bytes || 0) / 1024))} KB
      </span>
      <button type="button" className="nh-btn nh-btn--danger" onClick={onDelete}>
        {t('Delete')}
      </button>
    </div>
  )
}
