import { expect, test } from '@playwright/test'

test('collapsed primary rail and collapsed second pane share one width', async ({ page }) => {
  await page.goto('/?asset-tracker-e2e=1&sidebar-e2e=1')

  const pane = page.locator('.app-side-nav')
  await expect(pane).toHaveAttribute('data-sidebar-collapsed', 'false')
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect(pane).toHaveAttribute('data-sidebar-collapsed', 'true')

  const railBox = await page.locator('.app-nav-rail').boundingBox()
  const paneBox = await pane.boundingBox()
  expect(railBox?.width).toBeGreaterThan(0)
  expect(paneBox?.width).toBe(railBox?.width)
})
