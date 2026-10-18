import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { RouteShell } from '../pages/RouteShell'
import { HomePage } from '../pages/HomePage'
import { CreatePage } from '../pages/CreatePage'
import { JoinPage } from '../pages/JoinPage'

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/create', element: <CreatePage /> },
      { path: '/join', element: <JoinPage /> },
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
