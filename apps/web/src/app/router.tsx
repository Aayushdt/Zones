import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { RouteShell } from '../pages/RouteShell'

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <RouteShell kind="home" /> },
      { path: '/create', element: <RouteShell kind="create" /> },
      { path: '/join', element: <RouteShell kind="join" /> },
      { path: '/lobby/:matchId', element: <RouteShell kind="lobby" /> },
      { path: '/match/:matchId/head-start', element: <RouteShell kind="head-start" /> },
      { path: '/match/:matchId', element: <RouteShell kind="match" /> },
      { path: '/match/:matchId/pings', element: <RouteShell kind="pings" /> },
      { path: '/match/:matchId/tag', element: <RouteShell kind="tag" /> },
      { path: '/match/:matchId/results', element: <RouteShell kind="results" /> },
      { path: '/settings', element: <RouteShell kind="settings" /> },
      ...(import.meta.env.DEV
        ? [{
            path: '/dev/sim',
            lazy: async () => {
              const { SimulatorPage } = await import('../pages/SimulatorPage')
              return { Component: SimulatorPage }
            },
          }]
        : []),
      { path: '*', element: <RouteShell kind="not-found" /> },
    ],
  },
])
