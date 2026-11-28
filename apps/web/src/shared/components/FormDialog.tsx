import { useEffect, useLayoutEffect, useRef, useState, type AnimationEvent, type ReactNode } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { useIsMobile } from '../hooks/use-is-mobile'
import { FormSheet } from './FormSheet'

const EXIT_ANIMATION_NAME = 'form-dialog-exit'

function animationDurationMs(element: HTMLElement) {
  const duration = window.getComputedStyle(element).animationDuration
  const value = Number.parseFloat(duration)
  if (!Number.isFinite(value)) return 0
  return duration.endsWith('ms') ? value : value * 1000
}

type FormDialogProps = {
  open: boolean
  title: string
  description?: string
  /** Preferred surface width; Astryx clamps it to the viewport. Defaults to the Dialog default. */
  width?: number | string
  /** Mobile sheet height: 'tall' for forms, 'hug' for short confirmations. */
  mobileHeight?: 'hug' | 'tall'
  onClose: () => void
  children: ReactNode
}

/** A centered dialog on desktop and a bottom sheet on mobile. */
export function FormDialog({ mobileHeight = 'tall', ...props }: FormDialogProps) {
  const isMobile = useIsMobile()
  if (isMobile) {
    const { open, title, description, onClose, children } = props
    return (
      <FormSheet open={open} title={title} description={description} height={mobileHeight} purpose={mobileHeight === 'hug' ? 'info' : 'form'} onClose={onClose}>
        {children}
      </FormSheet>
    )
  }
  return <DesktopFormDialog {...props} />
}

function DesktopFormDialog({ open, title, description, width, onClose, children }: Omit<FormDialogProps, 'mobileHeight'>) {
  const [dialogOpen, setDialogOpen] = useState(open)
  const [isClosing, setIsClosing] = useState(false)
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  useLayoutEffect(() => {
    if (open) {
      setIsClosing(false)
      setDialogOpen(true)
    } else if (dialogOpen) {
      setIsClosing(true)
    }
  }, [open, dialogOpen])

  useEffect(() => {
    if (!isClosing) return
    const finishClose = () => {
      setIsClosing(false)
      setDialogOpen(false)
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishClose()
      return
    }
    const duration = dialogRef.current ? animationDurationMs(dialogRef.current) : 0
    if (duration <= 0) {
      finishClose()
      return
    }
    const timeout = window.setTimeout(finishClose, duration + 50)
    return () => window.clearTimeout(timeout)
  }, [isClosing])

  function finishClose() {
    setIsClosing(false)
    setDialogOpen(false)
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) onClose()
  }

  function handleAnimationEnd(event: AnimationEvent<HTMLDialogElement>) {
    if (isClosing && event.target === event.currentTarget && event.animationName === EXIT_ANIMATION_NAME) {
      finishClose()
    }
  }

  return (
    <Dialog
      ref={dialogRef}
      className={`form-dialog${isClosing ? ' form-dialog-closing' : ''}`}
      isOpen={dialogOpen}
      width={width}
      onOpenChange={handleOpenChange}
      onAnimationEnd={handleAnimationEnd}
      purpose="form"
    >
      <DialogHeader title={title} subtitle={description} onOpenChange={handleOpenChange} />
      {children}
    </Dialog>
  )
}
