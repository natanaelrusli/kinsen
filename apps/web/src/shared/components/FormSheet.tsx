import type { ReactNode } from 'react'
import { BottomSheet } from '@astryxdesign/core/BottomSheet'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Stack } from '@astryxdesign/core/Stack'
import { Icon } from './Icon'

type FormSheetProps = {
  open: boolean
  title: string
  description?: string
  /** 'tall' keeps the sheet pinned while the keyboard is up; 'hug' suits short confirmations. */
  height?: 'hug' | 'tall'
  /** Entered data is protected from scrim taps and swipes unless this is a plain confirmation. */
  purpose?: 'form' | 'info'
  onClose: () => void
  children: ReactNode
}

/**
 * Mobile counterpart of FormDialog: the same title, description and body, presented
 * as a bottom sheet. The sheet's own content area scrolls, so forms inside drop
 * their dialog scrolling (see `.form-sheet` in styles.css) and keep sticky actions.
 */
export function FormSheet({ open, title, description, height = 'tall', purpose = 'form', onClose, children }: FormSheetProps) {
  return (
    <BottomSheet
      isOpen={open}
      onOpenChange={(next) => { if (!next) onClose() }}
      label={title}
      height={height}
      purpose={purpose}
    >
      <Stack className="form-sheet" direction="vertical" gap={4}>
        <Stack as="header" className="form-sheet-header" direction="horizontal" align="start" justify="between" gap={2}>
          <Stack direction="vertical" gap={1}>
            <h2 className="form-sheet-title">{title}</h2>
            {description && <p className="form-sheet-description">{description}</p>}
          </Stack>
          <IconButton label="Close" variant="ghost" icon={<Icon name="close" size={20} />} onClick={onClose} />
        </Stack>
        {children}
      </Stack>
    </BottomSheet>
  )
}
