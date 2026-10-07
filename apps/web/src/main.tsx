import React from 'react'
import { ClerkProvider } from '@clerk/react'
import { LinkProvider } from '@astryxdesign/core/Link'
import { Link as RouterLink } from 'react-router-dom'
import ReactDOM from 'react-dom/client'
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import { App } from './App'
import { AssetTrackerHarness } from './e2e/AssetTrackerHarness'
import './astryx.css'

const assetTrackerE2E = import.meta.env.VITE_ASSET_TRACKER_E2E === 'true'
  && new URLSearchParams(window.location.search).get('asset-tracker-e2e') === '1'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Theme theme={neutralTheme} mode="light">
      <LinkProvider component={RouterLink}>
        {assetTrackerE2E
          ? <AssetTrackerHarness />
          : <ClerkProvider afterSignOutUrl="/"><App /></ClerkProvider>}
      </LinkProvider>
    </Theme>
  </React.StrictMode>,
)
