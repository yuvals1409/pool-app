import { useEffect, useState } from 'react'
import { useLang } from '../i18n.jsx'

export default function OfflineBanner() {
  const { t } = useLang()
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  )

  useEffect(() => {
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      {t('offlineBanner')}
    </div>
  )
}
