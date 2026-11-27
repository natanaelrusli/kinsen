import { useIsMobile } from '../../shared/hooks/use-is-mobile'
import { TransactionFormDialog } from './TransactionFormDialog'
import { TransactionFormSheet } from './TransactionFormSheet'
import type { TransactionFormProps } from './useTransactionForm'

/** Phones and small tablets get a touch-first bottom sheet; larger screens keep the dialog. */
export function TransactionForm(props: TransactionFormProps) {
  return useIsMobile() ? <TransactionFormSheet {...props} /> : <TransactionFormDialog {...props} />
}
