import { Link } from 'react-router-dom'

import { ROUTES } from '@/routes'

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="font-mono text-sm text-ink-dim">404</p>
      <p className="text-sm text-ink-muted">Page not found.</p>
      <Link to={ROUTES.dashboard} className="text-sm text-low hover:underline">
        Return to Command Center
      </Link>
    </div>
  )
}
