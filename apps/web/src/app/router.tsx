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
      { path: '/match/:matchId/tag', lazy: async () => {
        const { TagPage } = await import('../pages/TagPage')
        return { Component: TagPage }
      } },
      { path: '/match/:matchId/results', lazy: async () => {
        const { ResultsPage } = await import('../pages/ResultsPage')
        return { Component: ResultsPage }
      } },
      { path: '/match/:matchId/host-claim', lazy: async () => {
        const { HostClaimPage } = await import('../pages/HostClaimPage')
        return { Component: HostClaimPage }
      } },
      { path: '/settings', lazy: async () => {
        const { SettingsPage } = await import('../pages/SettingsPage')
        return { Component: SettingsPage }
      } },
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
