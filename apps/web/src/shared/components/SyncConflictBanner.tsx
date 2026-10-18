import { useEffect, useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { budgetRepository, type SyncConflictChoice } from '../../infrastructure/repositories/api-budget-repository'
import { useBudgetStore } from '../state/budget-store'
import { ConfirmationDialog } from './ConfirmationDialog'

export function SyncConflictBanner() {
  const syncStatus = useBudgetStore((state) => state.syncStatus)
  const refresh = useBudgetStore((state) => state.refresh)
  const [explanation, setExplanation] = useState('This device and the server have different budgets.')
  const [isConfirmingDevice, setIsConfirmingDevice] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsDecision = syncStatus === 'NEEDS_DECISION'

  useEffect(() => {
    if (!needsDecision) return
    let active = true
    void budgetRepository.getSyncConflict().then((conflict) => {
      if (active && conflict) setExplanation(conflict.explanation)
    })
    return () => { active = false }
  }, [needsDecision])

  if (!needsDecision) return null

  async function resolve(choice: SyncConflictChoice) {
    setIsBusy(true)
    setError(null)
    try {
      await budgetRepository.resolveSyncConflict(choice)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Kinsen could not resolve this sync conflict.')
    } finally {
      setIsBusy(false)
      setIsConfirmingDevice(false)
    }
  }

  return (
    <>
      <Banner
        status="warning"
        container="section"
        collapsible={false}
        title="Sync needs your decision"
        description={`${explanation} Choose which copy to keep. Nothing changes until you choose.`}
        endContent={(
          <Stack direction="horizontal" gap={2}>
            <Button label="Keep server copy" variant="primary" type="button" isDisabled={isBusy} onClick={() => void resolve('SERVER')} />
            <Button label="Use this device's copy" variant="secondary" type="button" isDisabled={isBusy} onClick={() => setIsConfirmingDevice(true)} />
          </Stack>
        )}
      >
        {error ? <Text type="supporting">{error}</Text> : null}
      </Banner>
      <ConfirmationDialog
        open={isConfirmingDevice}
        title="Replace the server budget?"
        description="This overwrites the budget stored on the server with this device's copy. Other devices will see this copy when they next sync. The server's previous budget cannot be restored."
        confirmLabel="Replace server budget"
        isConfirmDisabled={isBusy}
        onClose={() => setIsConfirmingDevice(false)}
        onConfirm={() => void resolve('DEVICE')}
      />
    </>
  )
}
