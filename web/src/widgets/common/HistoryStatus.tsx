/**
 * What a history-backed widget says when the server has no usable persistence service.
 *
 * Shared so the chart and the timeline word it identically, and so the advice is worked out in
 * one place rather than at each call site - the mistake "the theme in effect" made five times
 * over. The wording deliberately names no particular add-on: openHAB has many and they are all
 * equally valid here, so telling someone running InfluxDB to install rrd4j is worse than saying
 * nothing.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listPersistenceServices } from '../../api/persistence'
import { persistenceAdvice, type PersistenceAdvice } from '../../model/persistence'
import { useIsAdmin } from '../../store/auth'

/**
 * Which advice this device is in a position to give. Starts at "ask", which is the honest
 * answer before the admin-only service list has been read - and stays there for every viewer,
 * because a 401 tells us nothing about what is installed.
 *
 * A viewer therefore does not ask at all: the answer is already known, and the request would only
 * add a console error to a screen that is already reporting a problem.
 */
export function usePersistenceAdvice(active: boolean): PersistenceAdvice {
  const [advice, setAdvice] = useState<PersistenceAdvice>('ask')
  const admin = useIsAdmin()
  useEffect(() => {
    if (!active || !admin) return
    let dead = false
    void listPersistenceServices().then((services) => {
      if (!dead) setAdvice(persistenceAdvice(services))
    })
    return () => {
      dead = true
    }
  }, [active, admin])
  return advice
}

/** The two-line notice. The second line is shed in tight cells by the container queries. */
export function PersistenceNotice({ advice }: { advice: PersistenceAdvice }) {
  const { t } = useTranslation()
  const detail =
    advice === 'install'
      ? t('No persistence service is installed on this openHAB server. Any of them will do.')
      : advice === 'default'
        ? t('None of this server’s persistence services answered. Set a default in openHAB, or name one in this widget’s settings.')
        : t('Ask an administrator to set up persistence on this openHAB server.')
  return (
    <span className="nh-histnotice">
      <strong className="nh-histnotice__head">{t('This needs a persistence service')}</strong>
      <span className="nh-histnotice__detail">{detail}</span>
    </span>
  )
}
