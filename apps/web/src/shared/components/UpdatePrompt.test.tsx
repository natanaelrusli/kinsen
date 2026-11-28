import userEvent from '@testing-library/user-event'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdatePrompt } from './UpdatePrompt'

vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: () => ({ needRefresh: [false, vi.fn()], offlineReady: [false, vi.fn()], updateServiceWorker: vi.fn() }) }))

function serveBuildId(buildId: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ buildId }))))
}

beforeEach(() => { vi.stubGlobal('__APP_BUILD_ID__', 'current') })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('UpdatePrompt', () => {
  it('stays hidden while the deployed build matches this one', async () => {
    serveBuildId('current')
    render(<UpdatePrompt />)
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.queryByText('Update available')).toBeNull()
  })

  it('announces a newer deploy and can be dismissed', async () => {
    serveBuildId('newer')
    const user = userEvent.setup()
    render(<UpdatePrompt />)
    expect(await screen.findByText('Update available')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dismiss update notice' }))
    expect(screen.queryByText('Update available')).toBeNull()
  })
})
