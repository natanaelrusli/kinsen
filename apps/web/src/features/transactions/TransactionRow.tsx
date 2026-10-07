import { Button } from '@astryxdesign/core/Button'
import type { Transaction } from '@kinsen/budget-domain'
import { formatDate } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { Icon } from '../../shared/components/Icon'

type TransactionRowProps = {
  transaction: Transaction
  categoryName: string
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
  deleteDisabled?: boolean
}

export function TransactionRow({ transaction, categoryName, onEdit, onDelete, deleteDisabled = false }: TransactionRowProps) {
  return (
    <article className="transaction-row">
      <span className="transaction-icon"><Icon name="receipt" size={18} /></span>
      <div className="transaction-main">
        <strong>{transaction.description}</strong>
        <span>{categoryName} <i aria-hidden="true">·</i> {formatDate(transaction.date, { day: 'numeric', month: 'short' })}</span>
      </div>
      {transaction.plannedExpenseId && <span className="linked-badge">Commitment linked</span>}
      <strong className="transaction-amount">−{formatIdr(transaction.amount)}</strong>
      <div className="row-actions">
        <Button label={`Edit ${transaction.description}`} className="icon-button" variant="ghost" type="button" aria-label={`Edit ${transaction.description}`} onClick={() => onEdit(transaction)} icon={<Icon name="edit" size={17} />} isIconOnly />
        <Button label={`Delete ${transaction.description}`} className="icon-button danger-icon" variant="destructive" type="button" aria-label={`Delete ${transaction.description}`} onClick={() => onDelete(transaction)} isDisabled={deleteDisabled} icon={<Icon name="trash" size={17} />} isIconOnly />
      </div>
    </article>
  )
}
