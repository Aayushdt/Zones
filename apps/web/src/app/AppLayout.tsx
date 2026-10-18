import { Outlet } from 'react-router-dom'
import App from '../App'
import { LocationSharing } from '../components/LocationSharing'

export function AppLayout() {
  return (
    <>
      <App />
      <LocationSharing />
      <Outlet />
    </>
  )
}
