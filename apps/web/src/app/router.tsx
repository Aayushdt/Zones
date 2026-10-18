import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { RouteShell } from '../pages/RouteShell'
import { HomePage } from '../pages/HomePage'
import { CreatePage } from '../pages/CreatePage'
import { JoinPage } from '../pages/JoinPage'
import { LobbyPage } from '../pages/LobbyPage'
import { HeadStartPage } from '../pages/HeadStartPage'

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/create', element: <CreatePage /> },
      { path: '/join', element: <JoinPage /> },
      { path: '/lobby/:matchId', element: <LobbyPage /> },
      { path: '/match/:matchId/head-start', element: <HeadStartPage /> },
      { path: '/match/:matchId', lazy: async () => {
        const { MatchPage } = await import('../pages/MatchPage')
        return { Component: MatchPage }
      } },
      { path: '/match/:matchId/pings', lazy: async () => {
        const { PingsPage } = await import('../pages/PingsPage')
        return { Component: PingsPage }
      } },
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
