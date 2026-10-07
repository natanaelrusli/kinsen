import { Button } from '@astryxdesign/core/Button'
import { useEffect, useState } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createSampleSnapshot } from '@kinsen/budget-domain'
import { BudgetUseCases } from '../application/use-cases/budget-use-cases'
import { budgetRepository } from '../infrastructure/repositories/dexie-budget-repository'
import { TransactionForm } from '../features/transactions/TransactionForm'
import { AssetsPage } from '../features/assets/AssetsPage'
import { AssetDetailPage } from '../features/assets/AssetDetailPage'
import { BudgetPage } from '../features/budget/BudgetPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { AppShellChrome } from '../shared/components/AppShell'
import { useAssetStore } from '../shared/state/asset-store'
import { useBudgetStore } from '../shared/state/budget-store'
import { formatIdr } from '../shared/format/money'
import { localToday } from '../shared/format/date'

const today = localToday()

const search = new URLSearchParams(window.location.search)
const sidebarPreviewE2E = search.get('sidebar-e2e') === '1'
const initialPath =
  sidebarPreviewE2E || search.get('settings-e2e') === '1'
    ? '/settings'
    : search.get('budget-form-e2e') === '1'
      ? '/budget'
      : '/assets'
const budgetUseCases = new BudgetUseCases(budgetRepository)
let initialization: Promise<void> | null = null

function initializeHarness(): Promise<void> {
  if (!initialization) {
    initialization = (async () => {
      const existing = await budgetRepository.getSnapshot()
      if (!existing.period) await budgetRepository.seedIfEmpty(createSampleSnapshot(today))
      const [snapshot, overview] = await Promise.all([
        budgetUseCases.getSnapshot(),
        budgetUseCases.getOverview(today),
      ])
      useBudgetStore.setState({
        status: 'ready',
        snapshot,
        overview,
        error: null,
        saving: false,
        syncStatus: 'LOCAL',
        runMutation: async (operation) => {
          useBudgetStore.setState({ saving: true, error: null })
          try {
            await operation(budgetUseCases)
            const [nextSnapshot, nextOverview] = await Promise.all([
              budgetUseCases.getSnapshot(),
              budgetUseCases.getOverview(today),
            ])
            useBudgetStore.setState({ snapshot: nextSnapshot, overview: nextOverview, status: 'ready', error: null })
          } catch (reason) {
            useBudgetStore.setState({ error: reason instanceof Error ? reason.message : 'Test budget update failed.' })
            throw reason
          } finally {
            useBudgetStore.setState({ saving: false })
          }
        },
      })
      await useAssetStore.getState().initialize()
    })().finally(() => { initialization = null })
  }
  return initialization
}

function AssetTrackerFlow() {
  const overview = useBudgetStore((state) => state.overview)
  const snapshot = useBudgetStore((state) => state.snapshot)
  const [expenseOpen, setExpenseOpen] = useState(false)
  if (!overview || !snapshot) return null
  return (
    <>
      <section className="e2e-budget-regression" aria-label="Budget regression checks">
        <span>Safe to Spend</span>
        <output data-testid="safe-to-spend" data-value={overview.safeToSpendToday}>{formatIdr(overview.safeToSpendToday)}</output>
        <output data-testid="actual-spent" data-value={overview.actualSpent}>{formatIdr(overview.actualSpent)}</output>
        <output data-testid="transaction-count" data-value={snapshot.transactions.length}>{snapshot.transactions.length} budget transactions</output>
        <Button label="Open test expense" variant="secondary" type="button" onClick={() => setExpenseOpen(true)} />
      </section>
      <Routes>
        <Route path="/budget" element={<div className="page-content"><BudgetPage /></div>} />
        <Route path="/settings" element={<div className="page-content"><SettingsPage /></div>} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/assets/:assetId" element={<AssetDetailPage />} />
      </Routes>
      <TransactionForm open={expenseOpen} onClose={() => setExpenseOpen(false)} />
    </>
  )
}

export function AssetTrackerHarness() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    if (sidebarPreviewE2E) {
      setReady(true)
      return () => { active = false }
    }
    void initializeHarness().then(() => {
      if (active) setReady(true)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'The local test budget could not be prepared.')
    })
    return () => { active = false }
  }, [])
  if (error) return <main className="load-error-state" role="alert">{error}</main>
  if (!ready) return <main className="auth-loading" role="status">Preparing local asset test…</main>
  if (sidebarPreviewE2E) {
    return (
      <MemoryRouter initialEntries={[initialPath]}>
        <AppShellChrome
          themeColor="default"
          layoutDensity="comfortable"
          playfulMotion
          online
          syncStatus="LOCAL"
          error={null}
          onRetry={() => window.location.reload()}
          accountControl={<div className="topbar-account"><span className="sr-only">Test account</span></div>}>
          <div className="page-content sidebar-preview-content">
            <p className="eyebrow">SHELL NAVIGATION</p>
            <h1>Choose a destination</h1>
            <p className="page-description">Use the resizable rail, menu bar, or command search to navigate.</p>
          </div>
        </AppShellChrome>
      </MemoryRouter>
    )

  }
  return <MemoryRouter initialEntries={[initialPath]}><main><AssetTrackerFlow /></main></MemoryRouter>
}
