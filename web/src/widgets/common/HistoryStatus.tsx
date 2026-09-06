import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listPersistenceServices } from '../../api/persistence'
import { persistenceAdvice, type PersistenceAdvice } from '../../model/persistence'
import { useIsAdmin } from '../../store/auth'

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
