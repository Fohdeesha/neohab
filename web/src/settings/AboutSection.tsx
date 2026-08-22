/**
 * About & diagnostics.
 *
 * Two jobs. It says what this is and who wrote it, which every add-on should; and it answers
 * "what are you running?" in one place, which nothing in the app could do before - a bug report
 * used to arrive with no version, no openHAB build and no browser, and neither the reporter nor
 * anyone reading it could find out.
 *
 * Everything here is read-only and visible to every role, because the person standing at a wall
 * panel that is misbehaving is often not an administrator. The one exception is the persistence
 * line, whose endpoint is admin-only; it says that it does not know rather than guessing.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getRootInfo } from '../api/items'
import { listPersistenceServices } from '../api/persistence'
import { serviceNames, type PersistenceService } from '../model/persistence'
import { useAuthStore } from '../store/auth'
import { useConfigStore } from '../store/config'
import { useItemsStore } from '../store/items'

const REPO_URL = 'https://github.com/Fohdeesha/neohab'

export function AboutSection() {
  const { t } = useTranslation()
  const [oh, setOh] = useState<{ version?: string; build?: string } | null>(null)
  // undefined = still asking, null = not allowed to know (admin-only endpoint)
  const [services, setServices] = useState<PersistenceService[] | null | undefined>(undefined)
  const authStatus = useAuthStore((s) => s.status)
  const dashboards = useConfigStore((s) => s.dashboards.length)
  const live = useItemsStore((s) => s.connected)

  useEffect(() => {
    let dead = false
    void getRootInfo()
      .then((info) => {
        if (!dead) setOh({ version: info.runtimeInfo?.version, build: info.runtimeInfo?.buildString })
      })
      .catch(() => {
        if (!dead) setOh(null)
      })
    void listPersistenceServices().then((list) => {
      if (!dead) setServices(list)
    })
    return () => {
      dead = true
    }
  }, [])

  const role =
    authStatus === 'admin'
      ? t('administrator')
      : authStatus === 'user'
        ? t('signed in')
        : authStatus === 'anonymous'
          ? t('not signed in')
          : t('unknown')

  const persistence =
    services === undefined
      ? t('checking…')
      : services === null
        ? t('needs an administrator to check')
        : services.length === 0
          ? t('none installed - charts, timelines and history need one')
          : serviceNames(services).join(', ')

  // One block a person can select and paste into an issue, so a report arrives with the facts
  // in it. Deliberately no server address, no token and no item names: this gets pasted in
  // public. Locale rather than language so a date-format report carries the right detail.
  const report = [
    `neohab ${__NEOHAB_VERSION__}`,
    `openHAB ${oh?.version ?? '?'}${oh?.build ? ' (' + oh.build + ')' : ''}`,
    `role: ${authStatus}`,
    `live states: ${live ? 'yes' : 'no'}`,
    `persistence: ${services === null ? 'unknown' : services === undefined ? '?' : services.map((s) => s.id).join(',') || 'none'}`,
    `dashboards: ${dashboards}`,
    `browser: ${navigator.userAgent}`,
    `locale: ${navigator.language}`,
  ].join('\n')

  /**
   * Copy, or the next best thing.
   *
   * `navigator.clipboard` exists only in a secure context, and openHAB on a home LAN is plain
   * HTTP far more often than not - verified undefined on the test server - so the clipboard API
   * is the fallback here, not the plan. When it is missing the report is SELECTED instead, which
   * turns the job into one Ctrl+C rather than a button that silently does nothing.
   */
  const reportRef = useRef<HTMLPreElement>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'selected'>('idle')
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(report)
        setCopyState('copied')
        setTimeout(() => setCopyState('idle'), 2000)
        return
      }
    } catch {
      // refused (denied permission, or an insecure context that still exposes the object)
    }
    const pre = reportRef.current
    if (!pre) return
    const range = document.createRange()
    range.selectNodeContents(pre)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    setCopyState('selected')
  }

  return (
    <section>
      <h2 className="nh-settings__h">{t('About')}</h2>

      <dl className="nh-about">
        <dt>{t('Version')}</dt>
        <dd>
          <strong>neohab {__NEOHAB_VERSION__}</strong>
        </dd>

        <dt>{t('openHAB')}</dt>
        <dd>{oh?.version ? `${oh.version}${oh.build ? ` (${oh.build})` : ''}` : t('not reachable')}</dd>

        <dt>{t('This device')}</dt>
        <dd>{live ? t('{{role}}, receiving live item states', { role }) : t('{{role}}, no live item states', { role })}</dd>

        <dt>{t('Persistence')}</dt>
        <dd>{persistence}</dd>

        <dt>{t('Project')}</dt>
        <dd>
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
            {t('Source, releases and issues on GitHub')}
          </a>
        </dd>

        <dt>{t('Author')}</dt>
        <dd>
          Jon Sands (<a href="https://github.com/Fohdeesha" target="_blank" rel="noreferrer noopener">Fohdeesha</a>)
        </dd>

        <dt>{t('License')}</dt>
        <dd>{t('Eclipse Public License 2.0. A community project, not an official openHAB UI.')}</dd>

        {/* the weather widget's forecast source asks for attribution (CC BY 4.0) */}
        <dt>{t('Weather data')}</dt>
        <dd>
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer noopener">
            Open-Meteo
          </a>{' '}
          (CC BY 4.0)
        </dd>
      </dl>

      <p className="nh-settings__text">
        {t(
          'If you report a problem, paste the block below into the issue - it says what you are running. It contains no addresses, credentials or item names.'
        )}
      </p>
      <pre className="nh-about__report" ref={reportRef}>
        {report}
      </pre>
      <button type="button" className="nh-btn" onClick={() => void copy()}>
        {copyState === 'copied'
          ? t('Copied')
          : copyState === 'selected'
            ? t('Selected - press Ctrl+C')
            : t('Copy this report')}
      </button>
    </section>
  )
}
