import { Button } from '@astryxdesign/core/Button'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useState, type FormEvent } from 'react'
import { useAuth } from '@clerk/react'
import { FormDialog } from '../../shared/components/FormDialog'
import { PageHeader } from '../../shared/components/Primitives'
import { useBudgetStore } from '../../shared/state/budget-store'
import { budgetRepository } from '../../infrastructure/repositories/api-budget-repository'
import { useAssetStore } from '../../shared/state/asset-store'

type AccountAction = 'reset' | 'deactivate'

const confirmationPhrase: Record<AccountAction, string> = {
  reset: 'RESET MY DATA',
  deactivate: 'DEACTIVATE',
}

export function AccountSettingsPage() {
  const syncStatus = useBudgetStore((state) => state.syncStatus)
  const refresh = useBudgetStore((state) => state.refresh)
  const { signOut } = useAuth()
  const [action, setAction] = useState<AccountAction | null>(null)
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function openAction(nextAction: AccountAction) {
    setAction(nextAction)
    setConfirmation('')
    setError(null)
    setNotice(null)
  }

  function closeAction() {
    if (busy) return
    setAction(null)
    setConfirmation('')
    setError(null)
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!action || confirmation !== confirmationPhrase[action] || busy) return

    setBusy(true)
    setError(null)
    try {
      if (action === 'reset') {
        await budgetRepository.resetAccountData()
        void useAssetStore.getState().refresh().catch(() => undefined)
        await refresh()
        setNotice('Kinsen budget data and local asset data have been reset. Your account remains active.')
        setAction(null)
        setConfirmation('')
        return
      }

      await budgetRepository.deactivateAccount()
      setAction(null)
      try {
        await signOut()
      } catch {
        window.location.assign('/')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Kinsen could not complete this account action.')
    } finally {
      setBusy(false)
    }
  }

  const phrase = action ? confirmationPhrase[action] : ''
  const isReset = action === 'reset'
  const resetUnavailable = syncStatus !== 'SYNCED'
  const resetHint = syncStatus === 'ACCOUNT_MISMATCH'
    ? 'Reset is unavailable because this API budget is linked to a different Clerk account. Sign in with the linked account to reset its data.'
    : resetUnavailable
      ? `Sync your budget before resetting. Current sync status: ${syncStatus.toLowerCase()}.`
      : null

  return (
    <div className="account-settings-page">
      <PageHeader eyebrow="ACCOUNT" title="Account settings" description="Manage the budget data saved to Kinsen and your sign-in access." actions={<Button label="Back to settings" variant="secondary" className="button button-outline" href="/settings" />} />

      {notice && <p className="success-notice" role="status">{notice}</p>}

      <div className="account-settings-list">
        <section className="account-setting-card" aria-labelledby="reset-account-title">
          <div>
            <p className="eyebrow">YOUR DATA</p>
            <h2 id="reset-account-title">Reset all account data</h2>
            <p>Delete your budget, assets, liabilities, categories, commitments, transactions and queued changes. Budget data is cleared from the Kinsen API; assets and liabilities are stored only on this device and are cleared here. Other devices clear their local budget copies the next time they connect. This reset requires an internet connection. Your Clerk sign-in stays active.</p>
            {resetHint && (
              <p id="reset-account-hint" className="account-setting-hint" role={syncStatus === 'ACCOUNT_MISMATCH' ? 'alert' : 'status'}>
                {resetHint}
              </p>
            )}
          </div>
          <Button label="Reset all data" variant="destructive" className="button button-danger" onClick={() => openAction('reset')} isDisabled={resetUnavailable} aria-describedby={resetUnavailable ? 'reset-account-hint' : undefined} />
        </section>

        <section className="account-setting-card account-setting-card-danger" aria-labelledby="deactivate-account-title">
          <div>
            <p className="eyebrow">SIGN-IN ACCESS</p>
            <h2 id="deactivate-account-title">Deactivate account</h2>
            <p>This disables your Clerk account so it can no longer sign in. Kinsen keeps your data; reset it separately if you want it erased. A Kinsen administrator must reactivate a deactivated account.</p>
            {syncStatus !== 'SYNCED' && <p className="account-setting-hint">Sync your latest changes before deactivating. Current sync status: {syncStatus.toLowerCase()}.</p>}
          </div>
          <Button label="Deactivate account" variant="destructive" className="button button-danger" onClick={() => openAction('deactivate')} isDisabled={syncStatus !== 'SYNCED'} />
        </section>
      </div>

      <FormDialog
        open={action !== null}
        title={isReset ? 'Reset all account data?' : 'Deactivate this account?'}
        description={isReset
          ? 'This permanently removes Kinsen budget data and the assets and liabilities saved on this device.'
          : 'You will be signed out and blocked from signing in until an administrator reactivates your Clerk account.'}
        onClose={closeAction}
      >
        <form className="form-stack" onSubmit={(event) => void submitAction(event)}>
          <p className="account-confirmation-copy">
            {isReset
              ? 'This affects the API budget and this browser’s local asset data. Other devices remove their local budget copies when they next connect. Your sign-in remains active.'
              : 'Your Kinsen data is retained. Reset all account data first if you also want to erase it.'}
          </p>
          <TextInput label={`Type ${phrase} to confirm`} value={confirmation} onChange={setConfirmation} autoComplete="off" />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions">
            <Button label="Cancel" variant="ghost" className="button button-outline" onClick={closeAction} isDisabled={busy} />
            <Button
              label={busy ? 'Working…' : isReset ? 'Reset all data' : 'Deactivate account'}
              variant="destructive"
              className="button button-danger"
              type="submit"
              isDisabled={busy || confirmation !== phrase}
              isLoading={busy}
            />
          </div>
        </form>
      </FormDialog>
    </div>
  )
}
