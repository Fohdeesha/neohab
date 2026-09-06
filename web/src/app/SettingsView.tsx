/**
 * The Settings screen: a shell that stacks the sections, and the one notice line they all write
 * to. Each section lives in `src/settings/` and owns its own state and persistence.
 *
 * The order is deliberate - what every device can change comes first, what changes the server's
 * configuration comes after, the account follows because it is where you go when something above
 * it refused, and About is last: it changes nothing, and it is where you go to find out what you
 * are running when you are about to report that none of it worked.
 *
 * That order is also five screens of scrolling, so an index of jump links sits at the top. The
 * links are what makes Account reachable without a hunt; the order below is unchanged.
 */
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

/**
 * The index rows, and the anchor each one scrolls to.
 *
 * The label has to match the section's own heading, or the index sends people somewhere that
 * looks like the wrong place. Kept here rather than exported from each section, because the
 * sections know nothing about the shell and should not have to.
 */
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

/**
 * The anchor lives on a wrapper here rather than on each section's own element: twelve files would
 * otherwise have to know what the shell calls them. `scrollIntoView` rather than an `href="#..."`,
 * because the app's own routing owns the fragment.
 *
 * Defined at module scope, and it has to be. Declared inside SettingsView it would be a NEW
 * component type on every render of the shell, so React would unmount and remount every section
 * each time the notice line changed - and a section that had just put something in its own state
 * (the backup import's confirmation card) would lose it before it could draw.
 */
function Anchor({ id, children }: { id: string; children: ReactNode }) {
  return <div id={'nh-sec-' + id}>{children}</div>
}

export function SettingsView() {
  const { t } = useTranslation()
  const [notice, setNotice] = useState<string | null>(null)
  // Non-admin devices get a viewer's Settings: the per-device options stay, everything that
  // changes the server configuration goes away.
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
