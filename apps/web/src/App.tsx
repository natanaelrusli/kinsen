import { Button } from '@astryxdesign/core/Button'
import { useEffect, useState } from 'react'
import { ClerkLoaded, ClerkLoading, Show, SignInButton, SignUpButton, UserButton, useAuth } from '@clerk/react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './shared/components/AppShell'
import { BudgetPage } from './features/budget/BudgetPage'
import { CalendarPage } from './features/calendar/CalendarPage'
import { CommitmentsPage } from './features/commitments/CommitmentsPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { TransactionsPage } from './features/transactions/TransactionsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { AccountSettingsPage } from './features/account/AccountSettingsPage'
import { AssetsPage } from './features/assets/AssetsPage'
import { AssetDetailPage } from './features/assets/AssetDetailPage'

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

  if (!isLoaded || access === 'checking') return <main className="auth-loading" role="status">Checking your account…</main>
  if (access === 'different-account') {
    return <AccountNotice title="This browser belongs to another account." message="Sign out and use the Clerk account linked to this browser's local budget. Your saved data has not been changed." />
  }
  if (access === 'storage-unavailable') {
    return <AccountNotice title="Browser storage is unavailable." message="Enable local browser storage to securely open this offline budget." />
  }

  return <BudgetApplication />
}

function BudgetApplication() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="commitments" element={<CommitmentsPage />} />
          <Route path="activity" element={<TransactionsPage />} />
          <Route path="budget" element={<BudgetPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="assets/:assetId" element={<AssetDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="account" element={<AccountSettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export function App() {
  return (
    <>
      <ClerkLoading><main className="auth-loading" role="status">Loading secure sign-in…</main></ClerkLoading>
      <ClerkLoaded>
        <Show when="signed-out"><SignInScreen /></Show>
        <Show when="signed-in"><AccountGate /></Show>
      </ClerkLoaded>
    </>
  )
}
