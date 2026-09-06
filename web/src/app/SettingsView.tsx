import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditingAllowed } from '../store/auth'
import { NavButton } from './Sidebar'
import { IncompatibleNotice } from '../components/IncompatibleNotice'
import { AppearanceSection } from '../settings/AppearanceSection'
import { KioskSection } from '../settings/KioskSection'
import { VoiceAudioSection } from '../settings/VoiceAudioSection'
import { WidgetDefManager } from '../settings/WidgetDefManager'
import { PresetsSection } from '../settings/PresetsSection'
import { CustomIconsSection } from '../settings/CustomIconsSection'
import { HabpanelImport } from '../settings/HabpanelImport'
import { GallerySection } from '../settings/GallerySection'
import { BackupSection } from '../settings/BackupSection'
import { HistorySection } from '../settings/HistorySection'
import { AccountSection } from '../settings/AccountSection'
import { AboutSection } from '../settings/AboutSection'

const SECTIONS: { id: string; label: string; admin?: boolean }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'kiosk', label: 'Kiosk & wall panel' },
  { id: 'voice', label: 'Voice & audio' },
  { id: 'widgets', label: 'Custom widgets', admin: true },
  { id: 'presets', label: 'Lighting presets', admin: true },
  { id: 'icons', label: 'Custom icons', admin: true },
  { id: 'habpanel', label: 'Migrate from HABPanel', admin: true },
  { id: 'gallery', label: 'Widget gallery', admin: true },
  { id: 'backup', label: 'Backup', admin: true },
  { id: 'history', label: 'Version history', admin: true },
  { id: 'account', label: 'Account' },
  { id: 'about', label: 'About' }
]

// module scope on purpose - declared inside SettingsView this is a new component type every render, so every
// section remounts
function Anchor({ id, children }: { id: string; children: ReactNode }) {
  return <div id={'nh-sec-' + id}>{children}</div>
}

export function SettingsView() {
  const { t } = useTranslation()
  const [notice, setNotice] = useState<string | null>(null)
  const canEdit = useEditingAllowed()

  return (
    <div className="nh-dash">
      <header className="nh-dash__bar">
        <NavButton />
        <span className="nh-dash__title">{t('Settings')}</span>
      </header>

      <div className="nh-settings">
        {notice ? <div className="nh-settings__notice">{notice}</div> : null}

        <IncompatibleNotice />

        <nav className="nh-settings__index" aria-label={t('Settings sections')}>
          {SECTIONS.filter((s) => canEdit || !s.admin).map((s) => (
            <button
              key={s.id}
              type="button"
              className="nh-settings__indexlink"
              onClick={() => document.getElementById('nh-sec-' + s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
              {t(s.label)}
            </button>
          ))}
        </nav>

        <Anchor id="appearance">
          <AppearanceSection onNotice={setNotice} />
        </Anchor>

        <Anchor id="kiosk">
          <KioskSection onNotice={setNotice} />
        </Anchor>

        <Anchor id="voice">
          <VoiceAudioSection onNotice={setNotice} />
        </Anchor>

        {canEdit ? (
          <>
            <Anchor id="widgets">
              <WidgetDefManager onNotice={setNotice} />
            </Anchor>

            <Anchor id="presets">
              <PresetsSection onNotice={setNotice} />
            </Anchor>

            <Anchor id="icons">
              <CustomIconsSection onNotice={setNotice} />
            </Anchor>

            <Anchor id="habpanel">
              <HabpanelImport onNotice={setNotice} />
            </Anchor>

            <Anchor id="gallery">
              <GallerySection onNotice={setNotice} />
            </Anchor>

            <Anchor id="backup">
              <BackupSection onNotice={setNotice} />
            </Anchor>

            <Anchor id="history">
              <HistorySection onNotice={setNotice} />
            </Anchor>
          </>
        ) : null}

        <Anchor id="account">
          <AccountSection onNotice={setNotice} />
        </Anchor>

        {/* Every role: the device that cannot edit is exactly the one whose owner needs to say
            what it is running. */}
        <Anchor id="about">
          <AboutSection />
        </Anchor>
      </div>
    </div>
  )
}
