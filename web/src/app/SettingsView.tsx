import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useEditingAllowed } from '../store/auth'
import { dismissNotice, notify, type NoticeFn } from '../store/notify'
import { useRoute } from './router'
import { NavButton } from './Sidebar'
import { IncompatibleNotice } from '../components/IncompatibleNotice'
import { SectionBoundary } from '../components/SectionBoundary'
import { AppearanceSection } from '../settings/AppearanceSection'
import { ControlsSection } from '../settings/ControlsSection'
import { KioskSection } from '../settings/KioskSection'
import { VoiceAudioSection } from '../settings/VoiceAudioSection'
import { WidgetDefManager } from '../settings/WidgetDefManager'
import { PresetsSection } from '../settings/PresetsSection'
import { CustomIconsSection } from '../settings/CustomIconsSection'
import { HabpanelImport } from '../settings/HabpanelImport'
import { BackupSection } from '../settings/BackupSection'
import { HistorySection } from '../settings/HistorySection'
import { AccountSection } from '../settings/AccountSection'
import { AboutSection } from '../settings/AboutSection'

const SECTIONS: { id: string; label: string; admin?: boolean }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'controls', label: 'Controls', admin: true },
  { id: 'kiosk', label: 'Kiosk & wall panel' },
  { id: 'voice', label: 'Voice & audio' },
  { id: 'widgets', label: 'Custom widgets', admin: true },
  { id: 'presets', label: 'Lighting presets', admin: true },
  { id: 'icons', label: 'Custom icons', admin: true },
  { id: 'habpanel', label: 'Migrate from HABPanel', admin: true },
  { id: 'backup', label: 'Backup', admin: true },
  { id: 'history', label: 'Version history', admin: true },
  { id: 'account', label: 'Account' },
  { id: 'about', label: 'About' }
]

// module scope on purpose - declared inside SettingsView this is a new component type every render, so every
// section remounts
function Anchor({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={'nh-sec-' + id}>
      <SectionBoundary name={id}>{children}</SectionBoundary>
    </div>
  )
}

export function SettingsView() {
  const { t } = useTranslation()
  const canEdit = useEditingAllowed()
  const route = useRoute()
  const wanted = route.name === 'settings' ? route.section : undefined

  // the page is thousands of pixels long, so a message rendered at the top of it was routinely
  // off-screen from wherever the reader had just pressed something
  const raised = useRef<number | null>(null)
  const setNotice = useCallback<NoticeFn>((message, kind) => {
    if (raised.current !== null) dismissNotice(raised.current)
    raised.current = message === null ? null : notify(message, { sticky: kind !== 'done' })
  }, [])
  useEffect(() => () => setNotice(null), [setNotice])

  const jumpTo = (id: string) => document.getElementById('nh-sec-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  // a section named in the address arrives before the sections have rendered, and an id that names
  // nothing (or an admin section this reader cannot see) simply leaves the page at the top
  useEffect(() => {
    if (!wanted) return
    const at = requestAnimationFrame(() => {
      document.getElementById('nh-sec-' + wanted)?.scrollIntoView({ block: 'start' })
    })
    return () => cancelAnimationFrame(at)
  }, [wanted, canEdit])

  return (
    <div className="nh-dash">
      <header className="nh-dash__bar">
        <NavButton />
        <span className="nh-dash__title">{t('Settings')}</span>
      </header>

      <div className="nh-settings">
        <IncompatibleNotice />

        <nav className="nh-settings__index" aria-label={t('Settings sections')}>
          {SECTIONS.filter((s) => canEdit || !s.admin).map((s) => (
            <button key={s.id} type="button" className="nh-settings__indexlink" onClick={() => jumpTo(s.id)}>
              {t(s.label)}
            </button>
          ))}
        </nav>

        <Anchor id="appearance">
          <AppearanceSection onNotice={setNotice} />
        </Anchor>

        {canEdit ? (
          <Anchor id="controls">
            <ControlsSection onNotice={setNotice} />
          </Anchor>
        ) : null}

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
