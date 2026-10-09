import React, { lazy, Suspense } from 'react'
import { LinkProvider } from '@astryxdesign/core/Link'
import { Link as RouterLink } from 'react-router-dom'
import ReactDOM from 'react-dom/client'
import { AppTheme, initializeAppTheme } from './shared/components/AppTheme'
import { App } from './App'

import './astryx.css'

const AssetTrackerHarness = lazy(() => import('./e2e/AssetTrackerHarness').then(({ AssetTrackerHarness }) => ({ default: AssetTrackerHarness })))

const assetTrackerE2E = import.meta.env.VITE_ASSET_TRACKER_E2E === 'true'
  && new URLSearchParams(window.location.search).get('asset-tracker-e2e') === '1'

initializeAppTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppTheme withAuth={!assetTrackerE2E}>
      <LinkProvider component={RouterLink}>
        {assetTrackerE2E
          ? <Suspense fallback={<main className="auth-loading" role="status">Preparing local asset test…</main>}><AssetTrackerHarness /></Suspense>
          : <App />}
      </LinkProvider>
    </AppTheme>
  </React.StrictMode>,
)
