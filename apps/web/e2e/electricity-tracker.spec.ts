import { expect, test, type Locator, type Page } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

function displayDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day))
}

async function addReading(page: Page, details: { date: string; remaining: string; refill?: 'Actual credited kWh'; refillKwh?: string; cost?: string; order?: string }) {
  await page.getByRole('button', { name: 'Add reading' }).click()
  const dialog = page.getByRole('dialog', { name: 'Add meter reading' })
  await dialog.getByLabel('Reading date').fill(details.date)
  await dialog.getByLabel('Remaining credit').fill(details.remaining)
  if (details.refill) {
    await dialog.getByRole('combobox', { name: 'Refill record' }).click()
    await page.getByRole('option', { name: details.refill }).click()
    await dialog.getByLabel('Credited refill').fill(details.refillKwh!)
    await dialog.getByLabel('Purchase amount').fill(details.cost!)
  }
  if (details.order) await dialog.getByLabel('Order on this date').fill(details.order)
  await dialog.getByRole('button', { name: 'Save reading' }).click()
  await expect(dialog).toBeHidden()
}

async function openReadingForEdit(page: Page, rowText: string) {
  const row = page.getByRole('row').filter({ hasText: rowText })
  await row.getByRole('button', { name: /^Edit reading from/ }).click()
  return page.getByRole('dialog', { name: 'Edit meter reading' })
}

async function setRefillSource(page: Page, dialog: Locator, option: string) {
  await dialog.getByRole('combobox', { name: 'Refill record' }).click()
  await page.getByRole('option', { name: option }).click()
}

test('tracks PLN readings, corrections, same-day order, uncertainty, deletion, and offline reload', async ({ page, context }) => {
  await page.goto('/electricity?asset-tracker-e2e=1&electricity-tracker-e2e=1')
  await expect(page.getByRole('heading', { name: 'PLN Token Tracker', level: 1 })).toBeVisible()
  await expect(page.locator('.topbar-status')).toContainText('Local only')
  await expect(page.getByText('Saved on this device · not synced to your Kinsen account or other devices.')).toBeVisible()
  await expect(page.getByText('No refill spending yet')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Data quality' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Search pages and commands' }).click()
  const palette = page.getByRole('dialog', { name: 'Search pages and commands' })
  await palette.locator('input').first().fill('PLN Token Tracker')
  const trackerResult = palette.getByText('PLN Token Tracker', { exact: true })
  await expect(trackerResult).toBeVisible()
  await trackerResult.click()
  await expect(palette).toBeHidden()
  const dates = await page.evaluate(() => {
    const at = (offset: number) => {
      const date = new Date()
      date.setDate(date.getDate() + offset)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }
    return { opening: at(-10), refill: at(-5), today: at(0) }
  })

  await addReading(page, { date: dates.opening, remaining: '10' })
  await addReading(page, { date: dates.refill, remaining: '14', refill: 'Actual credited kWh', refillKwh: '5', cost: '500' })
  await addReading(page, { date: dates.today, remaining: '13' })
  await expect(page.getByText('0,2 kWh/day').first()).toBeVisible()
  await expect(page.getByText('65 days')).toBeVisible()

  let dialog = await openReadingForEdit(page, '5 kWh · Actual')
  await dialog.getByLabel('Credited refill').fill('6')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('0,3 kWh/day').first()).toBeVisible()

  await addReading(page, { date: dates.refill, remaining: '9', order: '1' })
  await expect(page.getByText('Reading 1 that day')).toBeVisible()
  await expect(page.getByText('Reading 2 that day')).toBeVisible()
  await expect(page.getByText('0,3 kWh/day').first()).toBeVisible()

  dialog = await openReadingForEdit(page, '6 kWh · Actual')
  await setRefillSource(page, dialog, 'Refill happened, kWh unknown')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Insufficient data', { exact: true })).toBeVisible()
  await expect(page.getByText('Unknown', { exact: true })).toBeVisible()

  dialog = await openReadingForEdit(page, 'Unknown')
  await setRefillSource(page, dialog, 'Actual credited kWh')
  await dialog.getByLabel('Credited refill').fill('6')
  await dialog.getByRole('button', { name: 'Save changes' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('0,3 kWh/day').first()).toBeVisible()

  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'PLN Token Tracker', level: 1 })).toBeVisible()
  await expect(page.getByText('6 kWh · Actual')).toBeVisible()
  await context.setOffline(false)

  const latestRow = page.getByRole('row').filter({ hasText: '13 kWh' })
  await latestRow.getByRole('button', { name: `Delete reading from ${displayDate(dates.today)}` }).click()
  const confirmation = page.getByRole('dialog', { name: 'Delete this meter reading?' })
  const confirmButton = confirmation.getByRole('button', { name: 'Delete reading' })
  await expect(confirmButton).toBeEnabled()
  await confirmButton.click()
  await expect(confirmation).toBeHidden()
  await expect(page.getByText('14 kWh').first()).toBeVisible()
  await expect(page.getByText('0,4 kWh/day').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
