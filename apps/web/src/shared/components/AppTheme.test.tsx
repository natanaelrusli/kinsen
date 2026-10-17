import { afterEach, describe, expect, it } from 'vitest'
import { syncRootSidebarWidth } from './AppTheme'

describe('sidebar width on the document root', () => {
  afterEach(() => {
    delete document.documentElement.dataset.sidebarWidth
  })

  it('marks the root with the chosen preset so both rails read the same width token', () => {
    syncRootSidebarWidth('compact')
    expect(document.documentElement.dataset.sidebarWidth).toBe('compact')

    syncRootSidebarWidth('wide')
    expect(document.documentElement.dataset.sidebarWidth).toBe('wide')
  })

  it('marks the root default preset so the current 80px width stays the baseline', () => {
    syncRootSidebarWidth('default')
    expect(document.documentElement.dataset.sidebarWidth).toBe('default')
  })
})
