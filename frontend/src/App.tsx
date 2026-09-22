import { Loader2 } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { ROUTES } from '@/routes'
import { SurveillanceProvider } from '@/store/SurveillanceProvider'

import CommandCenter from '@/pages/CommandCenter'
import Incidents from '@/pages/Incidents'
import NotFound from '@/pages/NotFound'

// Charting (recharts) is the single heaviest dependency in this app - keep it
// out of the initial bundle by only loading the page that uses it on demand.
const Analytics = lazy(() => import('@/pages/Analytics'))
const Audit = lazy(() => import('@/pages/Audit'))
const CameraHealth = lazy(() => import('@/pages/CameraHealth'))
const Cameras = lazy(() => import('@/pages/Cameras'))
const IncidentDetail = lazy(() => import('@/pages/IncidentDetail'))
const SettingsPage = lazy(() => import('@/pages/Settings'))
const Tracks = lazy(() => import('@/pages/Tracks'))
const Vehicles = lazy(() => import('@/pages/Vehicles'))

function PageFallback() {
  return (
    <div className="flex h-full items-center justify-center text-ink-dim">
      <Loader2 className="size-4 animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <SurveillanceProvider>
      <AppShell>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to={ROUTES.dashboard} replace />} />
            <Route path={ROUTES.dashboard} element={<CommandCenter />} />
            <Route path={ROUTES.cameraFeeds} element={<Cameras />} />
            <Route path={ROUTES.incidentLog} element={<Incidents />} />
            <Route path={ROUTES.incidentDetail(':id')} element={<IncidentDetail />} />
            <Route path={ROUTES.tracks} element={<Tracks />} />
            <Route path={ROUTES.vehicles} element={<Vehicles />} />
            <Route path={ROUTES.analytics} element={<Analytics />} />
            <Route path={ROUTES.cameraHealth} element={<CameraHealth />} />
            <Route path={ROUTES.audit} element={<Audit />} />
            <Route path={ROUTES.settings} element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AppShell>
    </SurveillanceProvider>
  )
}
