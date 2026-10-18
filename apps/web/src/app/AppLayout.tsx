import { Outlet } from 'react-router-dom'
import App from '../App'

export function AppLayout() {
  return (
    <>
      <App />
      <Outlet />
    </>
  )
}
