import { Button } from '@astryxdesign/core/Button'
import { Stack } from '@astryxdesign/core/Stack'
import { FormDialog } from './FormDialog'

type ConfirmationDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmationDialog({ open, title, description, confirmLabel, onClose, onConfirm }: ConfirmationDialogProps) {
  return (
    <FormDialog open={open} title={title} description={description} onClose={onClose}>
      <Stack className="form-actions" direction="horizontal" justify="end" gap={2}>
        <Button label="Cancel" variant="ghost" className="button button-outline" type="button" onClick={onClose} />
        <Button label={confirmLabel} variant="destructive" className="button button-danger" type="button" onClick={onConfirm} />
      </Stack>
    </FormDialog>
  )
}
