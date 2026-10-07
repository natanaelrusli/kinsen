import { Button } from '@astryxdesign/core/Button'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import type { CSSProperties } from 'react'
import type { PlannedOccurrence } from '@kinsen/budget-domain'
import { formatDate } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { Icon } from '../../shared/components/Icon'

type CommitmentCardProps = {
  occurrence: PlannedOccurrence
  today: string
  categoryName: string
  onFulfill: (occurrence: PlannedOccurrence) => void
  onEdit: () => void
  onDelete: () => void
}

export function CommitmentCard({ occurrence, today, categoryName, onFulfill, onEdit, onDelete }: CommitmentCardProps) {
  const complete = occurrence.outstandingAmount === 0
  const overdue = !complete && occurrence.dueDate < today
  const partial = occurrence.fulfilledAmount > 0 && !complete
  const status = complete ? 'Paid' : overdue ? 'Overdue' : partial ? 'Partially paid' : 'Upcoming'
  const progress = occurrence.amount === 0 ? 0 : occurrence.fulfilledAmount / occurrence.amount * 100
  return (
    <article className={`commitment-card${overdue ? ' is-overdue' : ''}${complete ? ' is-complete' : ''}`}>
      <div className="commitment-card-main">
        <div className="commitment-card-title"><span className={`commitment-state-icon${complete ? ' done' : overdue ? ' warning' : ''}`}><Icon name={complete ? 'check' : overdue ? 'warning' : 'clock'} size={16} /></span><div><h3>{occurrence.name}</h3><p>{categoryName} <i aria-hidden="true">·</i> {occurrence.cadence ? `${occurrence.cadence.toLowerCase()} repeat` : 'One-time'}</p></div></div>
        <div className="commitment-card-due"><span>{overdue ? 'Was due' : 'Due'} {formatDate(occurrence.dueDate, { day: 'numeric', month: 'short' })}</span><strong>{formatIdr(occurrence.amount)}</strong></div>
      </div>
      <div className="commitment-progress-row"><ProgressBar className="app-progress-bar" value={progress} label={`${occurrence.name} fulfillment`} style={{'--color-accent': complete ? 'var(--green)' : overdue ? 'var(--rust)' : 'var(--lime-dark)'} as CSSProperties} isLabelHidden /><span>{status}</span></div>
      <div className="commitment-card-bottom"><span>{occurrence.fulfilledAmount > 0 ? `${formatIdr(occurrence.fulfilledAmount)} paid · ${formatIdr(occurrence.outstandingAmount)} left` : `${formatIdr(occurrence.outstandingAmount)} outstanding`}</span><div className="row-actions">
        {!complete && <Button label={partial ? 'Add payment' : 'Record payment'} className="button button-small button-secondary" variant="secondary" type="button" onClick={() => onFulfill(occurrence)} />}
        <Button label={`Edit ${occurrence.name}`} className="icon-button" variant="ghost" type="button" aria-label={`Edit ${occurrence.name}`} onClick={onEdit} icon={<Icon name="edit" size={17} />} isIconOnly />
        <Button label={`Delete ${occurrence.name}`} className="icon-button danger-icon" variant="destructive" type="button" aria-label={`Delete ${occurrence.name}`} onClick={onDelete} icon={<Icon name="trash" size={17} />} isIconOnly />
      </div></div>
    </article>
  )
}
