import { useEffect, useState, type CSSProperties } from 'react'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Icon } from './Icon'
import { celebrationShowsFeedback, useSettingsStore } from '../state/settings-store'

const cheers: Record<'gentle' | 'playful', string[]> = {
  gentle: ['Logged. Nicely done.', 'That one is on the record.', 'Saved for your future self.'],
  playful: ['Cha-ching, in the good way.', 'Receipts? We love them.', 'Your budget is doing a little dance.'],
}

function pickCheer(tone: 'gentle' | 'playful'): string {
  return cheers[tone][Math.floor(Math.random() * cheers[tone].length)]!
}

/** Broadcast after an expense is saved so any celebration UI can react. */
export function announceExpenseSaved() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('kinsen:expense-saved'))
}

/**
 * A short, non-blocking celebration after saving an expense.
 * Honors the celebrate, cheer, and motion preferences; purely decorative, so it is hidden from assistive tech.
 */
export function Celebration() {
  const celebrateOnSave = useSettingsStore((state) => state.celebrateOnSave)
  const playfulMotion = useSettingsStore((state) => state.playfulMotion)
  const cheerTone = useSettingsStore((state) => state.cheerTone)
  const [burstKey, setBurstKey] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const showsFeedback = celebrationShowsFeedback({ celebrateOnSave, playfulMotion, cheerTone })

  useEffect(() => {
    if (!celebrateOnSave) return
    const celebrate = () => {
      setBurstKey((key) => key + 1)
      setMessage(cheerTone === 'off' ? null : pickCheer(cheerTone))
    }
    window.addEventListener('kinsen:expense-saved', celebrate)
    return () => window.removeEventListener('kinsen:expense-saved', celebrate)
  }, [celebrateOnSave, cheerTone])

  useEffect(() => {
    if (burstKey === 0 || !message) return
    const timer = window.setTimeout(() => setMessage(null), 2800)
    return () => window.clearTimeout(timer)
  }, [burstKey, message])

  if (!showsFeedback || burstKey === 0) return null

  return (
    <Stack className="celebration" gap={3}>
      {playfulMotion && <span key={burstKey} className="celebration-burst" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => <i key={index} style={{ '--i': index } as CSSProperties} />)}
      </span>}
      {message && <Stack direction="horizontal" gap={2} className="celebration-cheer" role="status">
        <Icon name="check" aria-hidden="true" style={{ width: 'var(--spacing-4)', height: 'var(--spacing-4)' }} />
        <Text type="supporting">{message}</Text>
      </Stack>}
    </Stack>
  )
}
