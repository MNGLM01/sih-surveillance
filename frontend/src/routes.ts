/**
 * Single source of truth for frontend page paths.
 *
 * `/cameras` and `/incidents` deliberately do NOT match the backend's REST
 * paths of the same name (`GET /cameras`, `GET /incidents` - see
 * backend/main.py). Both are served from the same origin, and FastAPI
 * resolves its explicit routes before falling through to the SPA's static
 * `index.html`, so a literal path collision would make a full page load (or
 * browser refresh) of the "Cameras" or "Incidents" screen return raw API
 * JSON instead of the app. Every in-app link/route must go through this
 * file so that can't happen again by accident.
 */
export const ROUTES = {
  dashboard: '/dashboard',
  cameraFeeds: '/camera-feeds',
  incidentLog: '/incident-log',
  incidentDetail: (id: string) => `/incident-log/${id}`,
  tracks: '/tracks',
  vehicles: '/vehicles',
  analytics: '/analytics',
  cameraHealth: '/camera-health',
  audit: '/audit',
  settings: '/settings',
} as const
