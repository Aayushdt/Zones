import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import App from '../App'
import { LocationSharing } from '../components/LocationSharing'
import { ShortcutsModal } from '../components/ui/ShortcutsModal'

export function AppLayout() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [])
  return (
    <>
      <App />
      {!online ? <div className="connectivity-banner" role="status" aria-live="polite">Offline — match data is not cached, and location uploads are paused.</div> : null}
      <LocationSharing />
      <Outlet />
      <ShortcutsModal />
    </>
  )
}

