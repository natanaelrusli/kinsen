import { Button } from '@astryxdesign/core/Button'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function LoadErrorState({ onRetry }: { onRetry: () => void }) {
  return <div className="load-error-state" role="alert"><span className="empty-icon"><Icon name="warning" size={22} /></span><h2>Your budget could not be loaded</h2><p>Your saved data stays on this device. Check local storage access and try again.</p><Button label="Try again" variant="secondary" className="button button-secondary" type="button" onClick={onRetry} /></div>
}
