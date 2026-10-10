import { Button } from '@astryxdesign/core/Button'
import { Component, lazy, Suspense, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { ClerkLoaded, ClerkLoading, Show, SignInButton, SignUpButton, UserButton, useAuth } from '@clerk/react'
import { AppShell } from './shared/components/AppShell'
import { RouteSkeleton } from './shared/components/RouteSkeleton'

const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then(({ DashboardPage }) => ({ default: DashboardPage })))
const CalendarPage = lazy(() => import('./features/calendar/CalendarPage').then(({ CalendarPage }) => ({ default: CalendarPage })))
const CommitmentsPage = lazy(() => import('./features/commitments/CommitmentsPage').then(({ CommitmentsPage }) => ({ default: CommitmentsPage })))
const TransactionsPage = lazy(() => import('./features/transactions/TransactionsPage').then(({ TransactionsPage }) => ({ default: TransactionsPage })))
const BudgetPage = lazy(() => import('./features/budget/BudgetPage').then(({ BudgetPage }) => ({ default: BudgetPage })))
const AssetsPage = lazy(() => import('./features/assets/AssetsPage').then(({ AssetsPage }) => ({ default: AssetsPage })))
const AssetDetailPage = lazy(() => import('./features/assets/AssetDetailPage').then(({ AssetDetailPage }) => ({ default: AssetDetailPage })))
const SettingsPage = lazy(() => import('./features/settings/SettingsPage').then(({ SettingsPage }) => ({ default: SettingsPage })))
const AccountSettingsPage = lazy(() => import('./features/account/AccountSettingsPage').then(({ AccountSettingsPage }) => ({ default: AccountSettingsPage })))
const ElectricityPage = lazy(() => import('./features/electricity/ElectricityPage').then(({ ElectricityPage }) => ({ default: ElectricityPage })))

const budgetOwnerKey = 'kinsen-budget-clerk-owner'

type BudgetAccess = 'checking' | 'allowed' | 'different-account' | 'storage-unavailable'

function SignInScreen() {
  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true"><span>K</span><i /></span>
          <span className="brand-name">kinsen<span>.</span></span>
        </div>
        <p className="eyebrow">A CLEARER DAILY PLAN</p>
        <h1 id="auth-title">Your money, in focus.</h1>
        <p className="auth-description">Sign in to access your personal budget. Your browser keeps a local copy for offline use.</p>
        <div className="auth-actions">
          <SignUpButton mode="modal" forceRedirectUrl="/">
            <Button label="Create your account" className="button button-primary" variant="primary" type="button" />
          </SignUpButton>
          <SignInButton mode="modal" forceRedirectUrl="/">
            <Button label="Sign in" className="button button-outline" variant="secondary" type="button" />
          </SignInButton>
        </div>
        <p className="auth-note">Your budget is linked to one Clerk account on this API.</p>
      </section>
    </main>
  )
}

function AppSplash() {
  return (
    <main className="auth-loading" role="status">
      <div className="auth-splash">
        <span className="brand-mark auth-splash-mark" aria-hidden="true"><span>K</span><i /></span>
        <p className="auth-splash-caption">Loading your budget…</p>
      </div>
    </main>
  )
}

function AccountNotice({ title, message }: { title: string; message: string }) {
  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="account-notice-title">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true"><span>K</span><i /></span>
          <span className="brand-name">kinsen<span>.</span></span>
        </div>
        <p className="eyebrow">ACCOUNT ACCESS</p>
        <h1 id="account-notice-title">{title}</h1>
        <p className="auth-description">{message}</p>
        <div className="auth-actions"><UserButton /></div>
      </section>
    </main>
  )
}

function AccountGate() {
  const { isLoaded, userId } = useAuth()
  const [access, setAccess] = useState<BudgetAccess>('checking')

  useEffect(() => {
    if (!isLoaded || !userId) {
      setAccess('checking')
      return
    }

    try {
      const ownerId = window.localStorage.getItem(budgetOwnerKey)
      if (ownerId && ownerId !== userId) {
        setAccess('different-account')
        return
      }
      if (!ownerId) window.localStorage.setItem(budgetOwnerKey, userId)
      setAccess('allowed')
    } catch {
      setAccess('storage-unavailable')
    }
  }, [isLoaded, userId])

  if (!isLoaded || access === 'checking') return <AppSplash />
  if (access === 'different-account') {
    return <AccountNotice title="This browser belongs to another account." message="Sign out and use the Clerk account linked to this browser's local budget. Your saved data has not been changed." />
  }
  if (access === 'storage-unavailable') {
    return <AccountNotice title="Browser storage is unavailable." message="Enable local browser storage to securely open this offline budget." />
  }

  return <BudgetApplication />
}
class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="load-error-state" role="alert" aria-labelledby="route-load-error-title">
        <h2 id="route-load-error-title">This page could not be loaded</h2>
        <p>Check your connection, then reload to try again.</p>
        <Button label="Reload page" className="button button-secondary" variant="secondary" type="button" onClick={() => window.location.reload()} />
      </section>
    )
  }
}

function RouteContent() {
  const location = useLocation()
  return <RouteErrorBoundary key={location.key}><Suspense fallback={<RouteSkeleton />}><Outlet /></Suspense></RouteErrorBoundary>
}


function BudgetApplication() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route element={<RouteContent />}>
            <Route index element={<DashboardPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="commitments" element={<CommitmentsPage />} />
            <Route path="activity" element={<TransactionsPage />} />
            <Route path="budget" element={<BudgetPage />} />
            <Route path="assets" element={<AssetsPage />} />
            <Route path="assets/:assetId" element={<AssetDetailPage />} />
            <Route path="electricity" element={<ElectricityPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="account" element={<AccountSettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export function App() {
  return (
    <>
      <ClerkLoading><AppSplash /></ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-out"><SignInScreen /></Show>
        <Show when="signed-in"><AccountGate /></Show>
      </ClerkLoaded>
    </>
  )
}
