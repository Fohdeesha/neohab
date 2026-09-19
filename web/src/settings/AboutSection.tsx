import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getRootInfo } from '../api/items'
import { listPersistenceServices } from '../api/persistence'
import { serviceNames, type PersistenceService } from '../model/persistence'
import { parseServerVersion, serverGaps } from '../model/serverVersion'
import { useAuthStore } from '../store/auth'
import { useConfigStore } from '../store/config'
import { useItemsStore } from '../store/items'

const REPO_URL = 'https://github.com/Fohdeesha/neohab'

export function AboutSection() {
  const { t } = useTranslation()
  const [oh, setOh] = useState<{ version?: string; build?: string } | null>(null)
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
    return () => {
      dead = true
    }
  }, [])

  // admin-only, so asking as a viewer logs a 401 on every visit to Settings
  useEffect(() => {
    if (authStatus !== 'admin') {
      setServices(null)
      return
    }
    let dead = false
    void listPersistenceServices().then((list) => {
      if (!dead) setServices(list)
    })
    return () => {
      dead = true
    }
  }, [authStatus])

  const gaps = serverGaps(parseServerVersion(oh?.version))

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

  // no address, no token, no item names: it is meant to be pasted into an issue
  const report = [
    `neohab ${__NEOHAB_VERSION__}`,
    `openHAB ${oh?.version ?? '?'}${oh?.build ? ' (' + oh.build + ')' : ''}`,
    `role: ${authStatus}`,
    `live states: ${live ? 'yes' : 'no'}`,
    `persistence: ${services === null ? 'unknown' : services === undefined ? '?' : services.map((s) => s.id).join(',') || 'none'}`,
    `dashboards: ${dashboards}`,
    `browser: ${navigator.userAgent}`,
    `locale: ${navigator.language}`
  ].join('\n')

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
      // clipboard refused; the report is selectable instead
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

        {gaps.length > 0 ? (
          <>
            <dt>{t('Not on this server')}</dt>
            <dd>
              <ul className="nh-about__gaps">
                {gaps.includes('logSocket') ? <li>{t('The log widget needs openHAB 4.1 or newer.')}</li> : null}
                {gaps.includes('semanticTags') ? (
                  <li>{t('Semantic tags you define yourself need openHAB 4.0 or newer. The built-in ones still work.')}</li>
                ) : null}
                {gaps.includes('anonymousPresets') ? (
                  <li>{t('Floor plan presets are hidden from signed-out viewers on openHAB 3.')}</li>
                ) : null}
              </ul>
            </dd>
          </>
        ) : null}

        <dt>{t('This device')}</dt>
        <dd>{live ? t('{{role}}, receiving live item states', { role }) : t('{{role}}, no live item states', { role })}</dd>

        <dt>{t('Persistence')}</dt>
        <dd>{persistence}</dd>

        <dt>{t('Guides')}</dt>
        <dd>
          <a href="docs/getting-started.html" target="_blank" rel="noreferrer">
            {t('Getting started')}
          </a>
          {' · '}
          <a href="docs/theming.html" target="_blank" rel="noreferrer">
            {t('Theming')}
          </a>
        </dd>

        <dt>{t('Project')}</dt>
        <dd>
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener">
            {t('Source, releases and issues on GitHub')}
          </a>
        </dd>

        <dt>{t('Author')}</dt>
        <dd>
          Jon Sands (
          <a href="https://github.com/Fohdeesha" target="_blank" rel="noreferrer noopener">
            Fohdeesha
          </a>
          )
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

      <p className="nh-settings__text">{t('Paste this into a bug report. It carries no addresses, credentials or item names.')}</p>
      <pre className="nh-about__report" ref={reportRef}>
        {report}
      </pre>
      <button type="button" className="nh-btn" onClick={() => void copy()}>
        {copyState === 'copied' ? t('Copied') : copyState === 'selected' ? t('Selected - press Ctrl+C') : t('Copy this report')}
      </button>
    </section>
  )
}
