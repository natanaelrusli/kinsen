import { useCallback, useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Stack } from '@astryxdesign/core/Stack'
import { Icon } from './Icon'

/** How often an open app checks for a new deploy. */
const CHECK_INTERVAL_MS = 60_000

async function fetchDeployedBuildId(): Promise<string | null> {
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return null
    const data = (await response.json()) as { buildId?: unknown }
    return typeof data.buildId === 'string' ? data.buildId : null
  } catch {
    return null // Offline or mid-deploy: try again on the next check.
  }
}

/**
 * Shows a popup when a new version has been deployed and reloads into it.
 *
 * Two detectors feed the same popup:
 * - Service worker (HTTPS or localhost): a new worker installs and waits; the
 *   popup's Reload activates it, which reloads every open tab.
 * - /version.json polling: browsers refuse service workers on plain-HTTP
 *   origins, so the build id is compared directly and Reload refreshes the page.
 */
export function UpdatePrompt() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const [deployedBuildId, setDeployedBuildId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [reloading, setReloading] = useState(false)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      registrationRef.current = registration ?? null
    },
  })

  const checkForUpdate = useCallback(async () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return
    const registration = registrationRef.current
    if (registration) {
      // The worker owns the cached app shell, so let it fetch the new build;
      // needRefresh flips once it has installed.
      await registration.update().catch(() => undefined)
      return
    }
    const deployed = await fetchDeployedBuildId()
    if (deployed && deployed !== __APP_BUILD_ID__) {
      setDeployedBuildId((current) => {
        if (current !== deployed) setDismissed(false) // Another deploy after "Later": ask again.
        return deployed
      })
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void checkForUpdate() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    void checkForUpdate()
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [checkForUpdate])

  // A later deploy while "Later" is pending should ask again.
  useEffect(() => { if (needRefresh) setDismissed(false) }, [needRefresh])

  function reload() {
    setReloading(true)
    if (needRefresh) void updateServiceWorker(true)
    else window.location.reload()
  }

  if (!(needRefresh || deployedBuildId !== null) || dismissed) return null

  // A quiet corner notice rather than a modal: it never interrupts a form in
  // progress, and stays until the user reloads or dismisses it.
  return (
    <Card className="update-notice" role="status" aria-live="polite" elevation="med" padding={3} maxWidth={360}>
      <Stack direction="horizontal" align="center" gap={3}>
        <Stack className="update-notice-text" direction="vertical" gap={0}>
          <strong>Update available</strong>
          <span>Reload to get the latest version.</span>
        </Stack>
        <Button label={reloading ? 'Reloading…' : 'Reload'} variant="primary" size="sm" className="button button-primary" type="button" onClick={reload} isLoading={reloading} />
        <Button label="Dismiss update notice" variant="ghost" size="sm" className="icon-button" type="button" isIconOnly icon={<Icon name="close" size={15} />} onClick={() => setDismissed(true)} isDisabled={reloading} />
      </Stack>
    </Card>
  )
}
