/**
 * The Settings screen: a shell that stacks the sections, and the one notice line they all write
 * to. Each section lives in `src/settings/` and owns its own state and persistence.
 *
 * The order is deliberate — what every device can change comes first, what changes the server's
 * configuration comes after, and the account is last because it is where you go when something
 * above it refused.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditingAllowed } from '../store/auth'
import { NavButton } from './Sidebar'
import { AppearanceSection } from '../settings/AppearanceSection'
import { KioskSection } from '../settings/KioskSection'
import { VoiceAudioSection } from '../settings/VoiceAudioSection'
import { WidgetDefManager } from '../settings/WidgetDefManager'
import { CustomIconsSection } from '../settings/CustomIconsSection'
import { HabpanelImport } from '../settings/HabpanelImport'
import { GallerySection } from '../settings/GallerySection'
import { BackupSection } from '../settings/BackupSection'
import { HistorySection } from '../settings/HistorySection'
import { EditingLockSection } from '../settings/EditingLockSection'
import { AccountSection } from '../settings/AccountSection'

export function SettingsView() {
  const { t } = useTranslation()
  const [notice, setNotice] = useState<string | null>(null)
  // With the editing lock on, non-admin devices get a viewer's Settings: appearance and the
  // per-device options stay, everything that changes the server configuration goes away.
  const canEdit = useEditingAllowed()

  return (
    <div className="nh-dash">
      <header className="nh-dash__bar">
        <NavButton />
        <span className="nh-dash__title">{t('Settings')}</span>
      </header>

      <div className="nh-settings">
        {notice ? <div className="nh-settings__notice">{notice}</div> : null}

        <AppearanceSection onNotice={setNotice} />

        <KioskSection onNotice={setNotice} />

        <VoiceAudioSection onNotice={setNotice} />

        {canEdit ? (
          <>
            <WidgetDefManager onNotice={setNotice} />

            <CustomIconsSection onNotice={setNotice} />

            <HabpanelImport onNotice={setNotice} />

            <GallerySection onNotice={setNotice} />

            <BackupSection onNotice={setNotice} />

            <HistorySection onNotice={setNotice} />
          </>
        ) : null}

        <EditingLockSection onNotice={setNotice} />

        <AccountSection onNotice={setNotice} />
      </div>
    </div>
  )
}
