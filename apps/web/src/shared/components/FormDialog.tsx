import { useEffect, useLayoutEffect, useRef, useState, type AnimationEvent, type ReactNode } from 'react'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'

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
  onClose: () => void
  children: ReactNode
}

export function FormDialog({ open, title, description, onClose, children }: FormDialogProps) {
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
      onOpenChange={handleOpenChange}
      onAnimationEnd={handleAnimationEnd}
      purpose="form"
      width={560}
      maxHeight="90dvh"
    >
      <DialogHeader title={title} subtitle={description} onOpenChange={handleOpenChange} />
      {children}
    </Dialog>
  )
}
