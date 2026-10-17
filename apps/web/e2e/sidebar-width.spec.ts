import { expect, test, type Page } from '@playwright/test'

// Real routes inside the real shell: the workspace harness renders the page for each
// destination with the app's own AppShellChrome and theme, without Clerk.
const workspaceHarness = '/?asset-tracker-e2e=1&workspace-e2e=1'

async function columnWidths(page: Page) {
  return page.evaluate(() => {
    const width = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) throw new Error(`${selector} is missing`)
      return element.getBoundingClientRect().width
    }
    const labels = Array.from(document.querySelectorAll<HTMLElement>('.app-nav-rail-label'))
    return {
      rail: width('.app-nav-rail'),
      pane: width('.app-side-nav'),
      truncatedLabels: labels.filter((label) => label.scrollWidth > label.clientWidth).map((label) => label.textContent),
    }
  })
}

async function expectMatchingCollapsedColumns(page: Page) {
  await expect(page.locator('.app-side-nav')).toHaveAttribute('data-sidebar-collapsed', 'true')
  const { rail, pane, truncatedLabels } = await columnWidths(page)
  expect(rail).toBeGreaterThan(0)
  expect(pane).toBe(rail)
  expect(truncatedLabels).toEqual([])
}

test('collapsed rail and collapsed second pane share one width on each real section', async ({ page }) => {
  await page.goto(workspaceHarness)
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expectMatchingCollapsedColumns(page)

  await page.locator('.app-nav-rail-item', { hasText: 'Manage' }).click()
  await expectMatchingCollapsedColumns(page)

  await page.locator('.app-nav-rail-item', { hasText: 'Overview' }).click()
  await expectMatchingCollapsedColumns(page)
})

test('a saved pane size from an earlier session does not widen the collapsed pane', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('astryx-resizable:kinsen-shell-nav-pane', JSON.stringify({ size: 420, isCollapsed: false }))
  })
  await page.goto(workspaceHarness)
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expectMatchingCollapsedColumns(page)
})
