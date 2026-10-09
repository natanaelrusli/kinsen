import { assetTypeLabels } from '@kinsen/budget-domain'
import type { AssetPurpose, AssetType, GoldPriceQuote, GoldPriceResponse, GoldPriceSource } from '@kinsen/budget-domain'
import { expect, test, type Locator, type Page } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

const assetPurposeLabels: Record<AssetPurpose, string> = {
  DAILY_CASH: 'Daily-use cash',
  PROTECTED_SAVINGS: 'Protected savings',
  INVESTMENT: 'Investment',
  OTHER: 'Other',
}

async function addAsset(page: Page, details: { name: string; type: AssetType; institution: string; purpose: AssetPurpose; amount: string; exchangeRate?: string }) {
  await page.getByRole('button', { name: 'Add asset' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add an asset' })
  await dialog.getByLabel('Name').fill(details.name)
  await dialog.getByRole('combobox', { name: 'Asset type', exact: true }).click()
  await page.getByRole('option', { name: assetTypeLabels[details.type], exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Purpose', exact: true }).click()
  await page.getByRole('option', { name: assetPurposeLabels[details.purpose], exact: true }).click()
  await dialog.getByLabel('Bank / institution / place').fill(details.institution)
  await dialog.getByRole('button', { name: 'Continue' }).click()
  const openingAmount = dialog.locator('input[name="openingAmount"]')
  await openingAmount.fill(details.amount)
  await expect(openingAmount).toHaveValue(Number(details.amount.replaceAll(',', '')).toLocaleString('en-US'))
  await openingAmount.press('Tab')
  await expect(openingAmount).toHaveValue(Number(details.amount.replaceAll(',', '')).toLocaleString('en-US'))
  if (details.exchangeRate) {
    const exchangeRate = dialog.locator('input[name="exchangeRate"]')
    await exchangeRate.fill(details.exchangeRate)
    await expect(exchangeRate).toHaveValue(Number(details.exchangeRate.replaceAll(',', '')).toLocaleString('en-US'))
    await exchangeRate.press('Tab')
    await expect(exchangeRate).toHaveValue(Number(details.exchangeRate.replaceAll(',', '')).toLocaleString('en-US'))
  }
  await dialog.getByRole('button', { name: 'Save asset' }).click()
  await expect(page.getByRole('link', { name: new RegExp(details.name) })).toBeVisible()
}

async function startAssetHarness(page: Page) {
  await page.goto('/?asset-tracker-e2e=1')
  await expect(page.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible()
}

type GoldFixture = { status: number; body: GoldPriceResponse | { error: { code: string; message: string } } }

async function interceptGoldPrices(page: Page) {
  await page.clock.setFixedTime(new Date())
  const dates = await page.evaluate(() => {
    const dateOnly = (offset: number) => {
      const date = new Date()
      date.setDate(date.getDate() + offset)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    }
    return { today: dateOnly(0), yesterday: dateOnly(-1), stale: dateOnly(-3), tomorrow: dateOnly(1) }
  })
  const fixtures = new Map<GoldPriceSource, GoldFixture>()
  const requests = new Map<GoldPriceSource, number>()
  const setQuotes = (source: GoldPriceSource, quotes: GoldPriceQuote[]) => {
    fixtures.set(source, { status: 200, body: { source, quotes, fetchedAt: new Date().toISOString() } })
  }
  const antam = (sellPrice = 12_600_000, recordedDate = dates.today): GoldPriceQuote => ({
    source: 'logammulia', materialType: 'Emas Batangan', weightGrams: '5', lineKey: '',
    displayName: 'Antam Logam Mulia', sellPrice, recordedDate,
  })
  const galeri = (sellPrice = 2_500_000, recordedDate = dates.today): GoldPriceQuote => ({
    source: 'galeri24', materialType: 'Galeri24', weightGrams: '1', lineKey: 'Classic',
    displayName: 'Galeri24', sellPrice, recordedDate,
  })
  setQuotes('logammulia', [antam()])
  setQuotes('galeri24', [galeri()])
  await page.route('**/api/gold-prices?source=*', async (route) => {
    const source = new URL(route.request().url()).searchParams.get('source') as GoldPriceSource
    requests.set(source, (requests.get(source) ?? 0) + 1)
    const fixture = fixtures.get(source)
    if (!fixture) throw new Error(`Unexpected gold source requested: ${source}`)
    await route.fulfill({ status: fixture.status, contentType: 'application/json', body: JSON.stringify(fixture.body) })
  })
  return {
    dates, antam, galeri, setQuotes, requests,
    fail: (source: GoldPriceSource) => fixtures.set(source, {
      status: 502, body: { error: { code: 'GOLD_PRICE_UNAVAILABLE', message: 'Gold prices are currently unavailable.' } },
    }),
  }
}

async function selectOption(page: Page, dialog: Locator, label: string, option: string) {
  await dialog.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

async function addAutomaticGold(page: Page, details: {
  name: string; source: 'logammulia' | 'galeri24'; product: string; units: string; valueIdr: number; keyboard?: boolean
}) {
  await page.getByRole('button', { name: 'Add asset', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add an asset' })
  await dialog.getByLabel('Name', { exact: true }).fill(details.name)
  await selectOption(page, dialog, 'Asset type', assetTypeLabels.GOLD)
  await selectOption(page, dialog, 'Purpose', 'Investment')
  await dialog.getByLabel('Bank / institution / place').fill(details.source)
  await selectOption(page, dialog, 'Pricing method', 'Automatic gold price')
  await expect(dialog.getByRole('combobox', { name: 'Currency', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(dialog.locator('input[name="openingAmount"]')).toHaveCount(0)
  await expect(dialog.getByLabel('Opening date', { exact: true })).toHaveCount(0)
  await selectOption(page, dialog, 'Price source', details.source)
  const product = dialog.getByRole('combobox', { name: 'Gold product', exact: true })
  await expect(product).toBeEnabled()
  await expect(product).toContainText('Choose a gold product')
  await product.click()
  const option = page.getByRole('option', { name: details.product, exact: true })
  await expect(option).toBeVisible()
  if (details.keyboard) {
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
  } else {
    await option.click()
  }
  await expect(product).toContainText(details.product)
  const units = dialog.getByRole('textbox', { name: 'Units held', exact: true })
  await expect(units).toHaveAttribute('inputmode', 'decimal')
  await units.fill(details.units)
  await expect(dialog.getByText('Units are packages of the selected product, not grams.')).toBeVisible()
  await expect(dialog.getByText('Retail purchase estimate — not a buyback value.')).toBeVisible()
  await expect(dialog.getByText(`Retail purchase estimate: ${idr(details.valueIdr)}`, { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Save asset', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('link', { name: new RegExp(details.name) })).toContainText(idr(details.valueIdr))
}

function idr(value: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
}

function displayDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day))
}

async function budgetBoundary(page: Page) {
  const baseline = {
    safe: (await page.getByTestId('safe-to-spend').getAttribute('data-value'))!,
    spent: (await page.getByTestId('actual-spent').getAttribute('data-value'))!,
    transactions: (await page.getByTestId('transaction-count').getAttribute('data-value'))!,
  }
  return async () => {
    await expect(page.getByTestId('safe-to-spend')).toHaveAttribute('data-value', baseline.safe)
    await expect(page.getByTestId('actual-spent')).toHaveAttribute('data-value', baseline.spent)
    await expect(page.getByTestId('transaction-count')).toHaveAttribute('data-value', baseline.transactions)
  }
}

async function refreshGold(page: Page, source: GoldPriceSource, all = false) {
  const response = page.waitForResponse((response) => response.url().includes(`/api/gold-prices?source=${source}`))
  const button = page.getByRole('button', { name: all ? 'Refresh gold prices' : 'Refresh price', exact: true })
  await button.click()
  await response
  await expect(button).toBeEnabled()
}

async function expectPosition(page: Page, assets: number, netWorth: number, dashboard = false) {
  const metrics = dashboard ? page.locator('.dashboard-assets-metrics') : page.locator('.asset-summary-grid')
  for (const [label, amount] of [['Total assets', assets], ['Investments', assets], ['Net worth', netWorth]] as const) {
    await expect(metrics.locator(dashboard ? 'article' : ':scope > div').filter({
      has: page.getByText(label, { exact: true }),
    })).toContainText(idr(amount))
  }
}

async function expectGoldDetail(page: Page, valueIdr: number, records: number) {
  await expect(page.getByRole('region', { name: 'Current asset value' })).toContainText(idr(valueIdr))
  await expect(page.getByRole('region', { name: 'Current asset value' })).toContainText('Automatic gold price')
  await expect(page.locator('.valuation-timeline-row')).toHaveCount(records)
  await expect(page.locator('.valuation-timeline-row').first()).toContainText('Retail purchase estimate')
  await expect(page.getByRole('button', { name: 'Update value', exact: true })).toHaveCount(0)
}

test('keeps budget fields within narrow mobile viewports', async ({ page }) => {
  await page.goto('/?asset-tracker-e2e=1&budget-form-e2e=1')
  await expect(page.getByRole('heading', { name: 'Budget settings', level: 1 })).toBeVisible()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 667 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)

    await page.getByRole('button', { name: 'Continue' }).click()
    const form = await page.locator('.budget-form').evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(form.scrollWidth).toBeLessThanOrEqual(form.width)
    const allocationLayout = await page.evaluate(() => {
      const saveNotice = document.querySelector('.budget-save-bar')!
      const equation = document.querySelector('.allocation-equation')!
      const noticeBox = saveNotice.getBoundingClientRect()
      const equationBox = equation.getBoundingClientRect()
      return {
        position: getComputedStyle(saveNotice).position,
        noticeTop: noticeBox.top + window.scrollY,
        equationBottom: equationBox.bottom + window.scrollY,
      }
    })
    expect(allocationLayout.position).toBe('static')
    expect(allocationLayout.noticeTop).toBeGreaterThanOrEqual(allocationLayout.equationBottom)

    await page.getByRole('button', { name: 'Continue' }).click()
    const saveButton = page.getByRole('button', { name: 'Save budget' })
    await expect(saveButton).toBeVisible()
    const box = await saveButton.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    const firstCategoryName = page.locator('input[name="categories.0.name"]')
    await firstCategoryName.fill('')
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await saveButton.click()
    await expect(firstCategoryName).toHaveAttribute('aria-invalid', 'true')
    await expect(firstCategoryName).toBeFocused()


    await page.getByRole('button', { name: 'Back' }).click()
    await page.getByRole('button', { name: 'Back' }).click()
  }
})

test('keeps the expense form inside narrow phone viewports', async ({ page }) => {
  await page.goto('/?asset-tracker-e2e=1&budget-form-e2e=1')
  await expect(page.getByRole('heading', { name: 'Budget settings', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Open test expense' }).click()
  await expect(page.getByRole('heading', { name: 'Add expense' })).toBeVisible()

  const dialog = page.getByRole('dialog', { name: 'Add expense' })
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 667 }]) {
    await page.setViewportSize(viewport)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)

    const bounds = await dialog.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)

    const form = dialog.locator('form')
    const formBounds = await form.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(formBounds.scrollWidth).toBeLessThanOrEqual(formBounds.width)
    const amount = form.getByRole('textbox', { name: 'Amount' })
    const description = form.getByRole('textbox', { name: 'Description' })
    await expect(amount).toHaveAttribute('inputmode', 'numeric')
    const amountBounds = await amount.boundingBox()
    const descriptionBounds = await description.boundingBox()
    expect(amountBounds).not.toBeNull()
    expect(descriptionBounds).not.toBeNull()
    expect(amountBounds!.y).toBeLessThan(descriptionBounds!.y)
    expect(amountBounds!.height).toBeGreaterThanOrEqual(44)
    await expect(page.getByRole('button', { name: 'Save expense' })).toBeVisible()
  }
})

test('keeps settings usable on small screens and persists choices across categories', async ({ page }) => {
  await page.goto('/?asset-tracker-e2e=1&settings-e2e=1')
  const navigation = page.getByRole('navigation', { name: 'Settings categories' })
  for (const viewport of [
    { width: 320, height: 667 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    await page.getByRole('radio', { name: 'Ocean' }).click()
    await navigation.getByRole('button', { name: 'Layout & motion' }).click()
    await expect(page.getByRole('heading', { name: 'Layout & motion', level: 2 })).toBeFocused()
    await page.getByRole('switch', { name: 'Compact layout' }).check()
    await navigation.getByRole('button', { name: 'Appearance' }).click()
    await expect(page.getByRole('radio', { name: 'Ocean' })).toBeChecked()
  }
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Ocean' })).toBeChecked()
  await navigation.getByRole('button', { name: 'Layout & motion' }).click()
  await expect(page.getByRole('switch', { name: 'Compact layout' })).toBeChecked()
})

test('persists an explicit mode and resumes following system appearance', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/?asset-tracker-e2e=1&workspace-e2e=1&settings-e2e=1')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.locator('.app-top-nav').getByRole('button', { name: 'Appearance', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked()

  await page.reload()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')

  await page.getByRole('radio', { name: 'System', exact: true }).click()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')

  await page.getByRole('button', { name: 'Search pages and commands', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Search pages and commands' })).toHaveCSS('color-scheme', 'dark')
  await page.keyboard.press('Escape')
  await page.locator('.app-top-nav').getByRole('button', { name: 'Appearance', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Light', exact: true }).click()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')

  await page.setViewportSize({ width: 320, height: 667 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await expect(page.locator('.app-top-nav').getByRole('button', { name: 'Appearance', exact: true })).toBeVisible()
})

test('renders the Astryx shell nav with searchable, resizable, and mobile navigation', async ({ page }) => {
  await page.goto('/?asset-tracker-e2e=1&sidebar-e2e=1')
  await page.setViewportSize({ width: 1440, height: 900 })
  const sidebar = page.locator('.app-side-nav')
  await expect(sidebar).toBeVisible()
  await expect(sidebar.getByRole('treeitem', { name: 'Settings', exact: true })).toHaveAttribute('aria-selected', 'true')

  const initialSidebarWidth = await sidebar.evaluate((element) => element.getBoundingClientRect().width)
  const resizeHandle = page.getByTestId('astryx-sidenav-resize-handle')
  await sidebar.hover()
  const handleBox = await resizeHandle.boundingBox()
  if (!handleBox) throw new Error('The shell navigation resize handle has no layout box.')
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 60, handleBox.y + handleBox.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().width)).toBe(initialSidebarWidth + 60)

  await sidebar.getByRole('link', { name: 'Calendar', exact: true }).click()
  await expect(sidebar.getByRole('treeitem', { name: 'Calendar', exact: true })).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: 'Search pages and commands' })
  await expect(palette).toBeVisible()
  await palette.getByRole('combobox').fill('commitments')
  await palette.getByRole('option', { name: 'Commitments', exact: true }).click()
  await expect(sidebar.getByRole('treeitem', { name: 'Commitments', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(palette).toBeHidden()

  await sidebar.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect(sidebar.getByRole('link', { name: 'Commitments', exact: true })).toBeVisible()
  await sidebar.getByRole('button', { name: 'Expand sidebar' }).click()

  await page.setViewportSize({ width: 320, height: 667 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await expect(page.getByRole('region', { name: 'More destinations' }).getByRole('link', { name: 'Commitments', exact: true })).toBeVisible()
})

test('keeps the mobile calendar grid and opens selected-day details in a dialog', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 })
  await page.goto('/?asset-tracker-e2e=1&workspace-e2e=1')
  await expect(page.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible()
  await page.locator('.mobile-navigation').getByRole('link', { name: 'Calendar', exact: true }).click()

  const grid = page.locator('.calendar-grid')
  await expect(grid).toBeVisible()
  await expect(page.locator('.calendar-weekdays')).toBeVisible()
  await expect(page.locator('.calendar-agenda')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)

  const day = grid.getByRole('button').nth(10)
  const box = await day.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(44)
  expect(box!.height).toBeGreaterThanOrEqual(44)
  await day.click()

  const expectedDate = (await day.getAttribute('aria-label'))?.split('. Actual ')[0] ?? ''
  expect(expectedDate).not.toBe('')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAccessibleName(expectedDate)
  await expect(dialog.getByText('Actual', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Still to pay', { exact: true })).toBeVisible()
  await expect(day).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(day).toBeFocused()
})

test('provides a screen-reader summary for asset history and custom range errors', async ({ page }) => {
  await startAssetHarness(page)

  const chart = page.getByRole('img', { name: /Total asset value/ })
  await expect(chart).toHaveAccessibleDescription(/ranges from .+ to .+\. It starts at .+ on .+ and ends at .+ on .+\./)

  await page.getByLabel('History range').click()
  await page.getByRole('option', { name: 'Custom dates', exact: true }).click()
  const rangeControls = page.locator('.asset-custom-range')
  const from = rangeControls.getByLabel('From', { exact: true })
  const to = rangeControls.getByLabel('To', { exact: true })
  await from.fill('2099-12-31')
  await to.fill('2000-01-01')

  const rangeError = 'Choose valid dates with the start on or before the end.'
  await expect(from).toHaveAttribute('aria-invalid', 'true')
  await expect(to).toHaveAttribute('aria-invalid', 'true')
  await expect(from).toHaveAccessibleDescription(rangeError)
  await expect(to).toHaveAccessibleDescription(rangeError)
})

test('groups financial metrics accessibly and reflows without horizontal overflow', async ({ page }) => {
  await startAssetHarness(page)
  const position = page.getByRole('region', { name: 'Current financial position' })
  const summary = position.locator('dl.asset-summary-grid')
  await expect(summary.locator('dt', { hasText: 'Total assets' })).toBeVisible()
  await expect(summary.locator('dd')).toHaveCount(4)

  await page.setViewportSize({ width: 1440, height: 900 })
  const summaryLayout = await page.locator('.asset-summary-grid').evaluate((grid) => ({
    columns: getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter((track) => parseFloat(track) > 0).length,
    metrics: grid.children.length,
  }))
  expect(summaryLayout.columns).toBe(summaryLayout.metrics)

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  }
})

test('stretches the WHERE IT GOES card to match the dashboard row height', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?asset-tracker-e2e=1&workspace-e2e=1')
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your money, in focus', level: 1 })).toBeVisible()

  const category = page.getByRole('region', { name: 'Category pulse' })
  const commitments = page.locator('.commitments-preview')
  await expect(category).toBeVisible()
  const categoryBox = await category.boundingBox()
  const commitmentsBox = await commitments.boundingBox()
  expect(categoryBox).not.toBeNull()
  expect(commitmentsBox).not.toBeNull()
  expect(Math.abs(categoryBox!.height - commitmentsBox!.height)).toBeLessThanOrEqual(1)

  await page.setViewportSize({ width: 1024, height: 768 })
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024)
})


test('keeps asset section actions at least 44px across touch-width layouts', async ({ page }) => {
  await startAssetHarness(page)

  for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)

    const actions = [
      page.getByRole('button', { name: 'Record transfer', exact: true }),
      page.getByRole('button', { name: 'Add asset', exact: true }).last(),
      page.getByRole('button', { name: 'Add liability', exact: true }),
    ]
    for (const action of actions) {
      await expect(action).toBeVisible()
      const bounds = await action.boundingBox()
      expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44)
    }
  }
})

test('lays out asset page actions in two equal-width columns at 970px', async ({ page }) => {
  await interceptGoldPrices(page)
  await startAssetHarness(page)
  await addAutomaticGold(page, {
    name: 'Layout gold', source: 'logammulia', product: 'Emas Batangan · 5 g', units: '1', valueIdr: 12_600_000,
  })
  await page.setViewportSize({ width: 970, height: 900 })

  const header = page.locator('.assets-page > .page-heading')
  const actions = header.locator('.page-actions')
  const buttons = actions.getByRole('button')
  await expect(buttons).toHaveCount(3)
  await expect(header).toHaveCSS('flex-direction', 'column')
  expect(await actions.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2)

  const [refresh, update, add] = await Promise.all([
    buttons.nth(0).boundingBox(),
    buttons.nth(1).boundingBox(),
    buttons.nth(2).boundingBox(),
  ])
  expect(refresh?.height ?? 0).toBeGreaterThan(0)
  expect(update?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(add?.height ?? 0).toBeGreaterThanOrEqual(44)
  expect(Math.abs((refresh?.height ?? 0) - (update?.height ?? 0))).toBeLessThanOrEqual(1)
  expect(Math.abs((add?.height ?? 0) - (update?.height ?? 0))).toBeLessThanOrEqual(1)
  expect(Math.abs((refresh?.width ?? 0) - (update?.width ?? 0))).toBeLessThanOrEqual(1)
  expect(Math.abs((refresh?.x ?? 0) - (add?.x ?? 0))).toBeLessThanOrEqual(1)
  expect(Math.abs((refresh?.y ?? 0) + (refresh?.height ?? 0) / 2 - (update?.y ?? 0) - (update?.height ?? 0) / 2)).toBeLessThanOrEqual(1)
  expect((add?.y ?? 0)).toBeGreaterThan(update?.y ?? 0)
})

test('reflows asset actions to the content width inside the desktop shell', async ({ page }) => {
  await interceptGoldPrices(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/assets?asset-tracker-e2e=1&workspace-e2e=1')
  await expect(page.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible()
  await addAutomaticGold(page, {
    name: 'Desktop layout gold', source: 'logammulia', product: 'Emas Batangan · 5 g', units: '1', valueIdr: 12_600_000,
  })

  const assets = page.locator('.assets-page')
  expect(await assets.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(1120)
  const header = assets.locator(':scope > .page-heading')
  await expect(header).toHaveCSS('flex-direction', 'column')
  const actions = header.locator('.page-actions')
  const buttons = actions.getByRole('button')
  await expect(buttons).toHaveCount(3)
  expect(await actions.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2)
  const [refresh, update, add] = await Promise.all([
    buttons.nth(0).boundingBox(),
    buttons.nth(1).boundingBox(),
    buttons.nth(2).boundingBox(),
  ])
  expect(Math.abs((refresh?.height ?? 0) - (update?.height ?? 0))).toBeLessThanOrEqual(1)
  expect(Math.abs((add?.height ?? 0) - (update?.height ?? 0))).toBeLessThanOrEqual(1)
})



test('creates valuations, transfers tracked cash, and links one expense without mixing wealth into the budget', async ({ page }) => {
  await startAssetHarness(page)
  const initialSafeToSpend = await page.getByTestId('safe-to-spend').getAttribute('data-value')
  const initialSpent = Number(await page.getByTestId('actual-spent').getAttribute('data-value'))
  const initialTransactions = Number(await page.getByTestId('transaction-count').getAttribute('data-value'))

  await addAsset(page, { name: 'BCA Daily', type: 'BANK_ACCOUNT', institution: 'BCA', purpose: 'DAILY_CASH', amount: '1,000,000' })
  await addAsset(page, { name: 'SeaBank Savings', type: 'BANK_ACCOUNT', institution: 'SeaBank', purpose: 'PROTECTED_SAVINGS', amount: '500000' })
  await expect(page.getByTestId('safe-to-spend')).toHaveAttribute('data-value', initialSafeToSpend!)
  await expect(page.getByText('Rp 1.500.000', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Record transfer' }).click()
  await page.getByRole('combobox', { name: 'From', exact: true }).click()
  await page.getByRole('option', { name: 'SeaBank Savings · SeaBank', exact: true }).click()
  await page.getByRole('combobox', { name: 'To', exact: true }).click()
  await page.getByRole('option', { name: 'BCA Daily · BCA', exact: true }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  const transferDialog = page.getByRole('dialog', { name: 'Record transfer' })
  const transferAmount = transferDialog.locator('input[name="amount"]')
  await transferAmount.fill('100000')
  await transferAmount.press('Tab')
  await expect(transferAmount).toHaveValue('100,000')
  await transferDialog.getByRole('button', { name: 'Record transfer' }).click()
  await expect(page.getByTestId('safe-to-spend')).toHaveAttribute('data-value', initialSafeToSpend!)
  await expect(page.getByText('Rp 1.500.000', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Internal tracked-account transfers are excluded from contributions and withdrawals.')).toBeVisible()

  await addAsset(page, { name: 'USD cash', type: 'FOREIGN_CURRENCY', institution: 'Travel wallet', purpose: 'OTHER', amount: '100', exchangeRate: '15,000' })
  await expect(page.getByRole('link', { name: /USD cash/ })).toContainText('Rp 1.500.000')
  await page.getByRole('link', { name: /USD cash/ }).click()
  await expect(page.getByText('100,00 USD', { exact: true })).toBeVisible()
  await expect(page.getByText(/1 USD = Rp 15000 · rate dated/)).toBeVisible()
  await expect(page.getByText(/Rate: 1 USD = Rp 15000 · dated/)).toBeVisible()
  await page.getByRole('link', { name: 'All assets' }).click()

  await addAsset(page, { name: 'Bibit fund', type: 'MUTUAL_FUND', institution: 'Bibit', purpose: 'INVESTMENT', amount: '1000000' })
  await page.getByRole('button', { name: 'Update value for Bibit fund' }).click()
  await page.locator('input[name="nativeAmount"]').fill('1,250,000')
  await expect(page.locator('input[name="nativeAmount"]')).toHaveValue('1,250,000')
  await page.locator('input[name="nativeAmount"]').press('Tab')
  await expect(page.locator('input[name="nativeAmount"]')).toHaveValue('1,250,000')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.locator('input[name="quantity"]').fill('10')
  await page.locator('input[name="unitPrice"]').fill('120000.50')
  await expect(page.locator('input[name="unitPrice"]')).toHaveValue('120,000.50')
  await page.locator('input[name="unitPrice"]').press('Tab')
  await expect(page.locator('input[name="unitPrice"]')).toHaveValue('120,000.50')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Save valuation' }).click()
  await expect(page.getByTestId('safe-to-spend')).toHaveAttribute('data-value', initialSafeToSpend!)

  await page.getByRole('link', { name: /Bibit fund/ }).click()
  await expect(page.getByText(/Change since .*\+Rp 250\.000/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Activity and valuations' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'All assets' }).click()

  await page.getByRole('button', { name: 'Open test expense' }).click()
  const expenseDialog = page.getByRole('dialog', { name: 'Add expense' })
  await expenseDialog.getByLabel('Description').fill('Market groceries')
  const expenseAmount = expenseDialog.getByRole('textbox', { name: 'Amount' })
  await expenseAmount.fill('25000')
  await expect(expenseAmount).toHaveValue('25,000')
  await expenseDialog.getByLabel('Description').click()
  await expect(expenseAmount).toHaveValue('25,000')
  await expenseDialog.getByRole('combobox', { name: 'Paid from Optional', exact: true }).click()
  await page.getByRole('option', { name: 'BCA Daily · BCA', exact: true }).click()
  await expenseDialog.getByRole('button', { name: 'Clear Amount' }).click()
  await expect(expenseAmount).toHaveValue('0')
  await expenseDialog.getByRole('button', { name: 'Save expense' }).click()
  await expect(expenseDialog.getByText('Review these fields', { exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Expense added' })).toHaveCount(0)
  await expenseAmount.fill('25000')
  await expenseDialog.getByLabel('Description').click()
  await expect(expenseAmount).toHaveValue('25,000')
  await expenseDialog.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByRole('region', { name: 'Notifications' }).getByRole('status').filter({ hasText: 'Expense added' })).toBeVisible()
  await expect(page.getByTestId('transaction-count')).toHaveAttribute('data-value', String(initialTransactions + 1))
  await expect(page.getByTestId('actual-spent')).toHaveAttribute('data-value', String(initialSpent + 25_000))
  await expect(page.getByRole('link', { name: /BCA Daily/ })).toContainText('Rp 1.075.000')
  await expect(page.getByTestId('safe-to-spend')).not.toHaveAttribute('data-value', initialSafeToSpend!)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})


test('settles a liability from cash without changing net worth', async ({ page }) => {
  await startAssetHarness(page)
  await addAsset(page, { name: 'Everyday cash', type: 'CASH', institution: 'Wallet', purpose: 'DAILY_CASH', amount: '1000000' })

  await page.getByRole('button', { name: 'Add liability' }).first().click()
  const liabilityDialog = page.getByRole('dialog', { name: 'Add a liability' })
  await liabilityDialog.getByLabel('Name').fill('BCA card')
  await liabilityDialog.getByLabel('Bank / provider').fill('BCA')
  await liabilityDialog.getByRole('button', { name: 'Continue' }).click()
  await liabilityDialog.locator('input[name="openingAmount"]').fill('100000')
  await liabilityDialog.getByRole('button', { name: 'Save liability' }).click()
  await expect(page.getByText('Rp 900.000', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Record payment for BCA card' }).click()
  const paymentDialog = page.getByRole('dialog', { name: 'Record liability payment' })
  await paymentDialog.getByRole('combobox', { name: 'Paid from', exact: true }).click()
  await page.getByRole('option', { name: 'Everyday cash · Wallet', exact: true }).click()
  await paymentDialog.getByRole('button', { name: 'Continue' }).click()
  await paymentDialog.locator('input[name="amount"]').fill('25000')
  await paymentDialog.getByRole('button', { name: 'Record payment', exact: true }).click()
  await expect(page.getByText('Net worth', { exact: true })).toBeVisible()
  await expect(page.getByText('Rp 900.000', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'View 2 activity records · BCA card' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Everyday cash/ })).toContainText('Rp 975.000')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('saves and reloads a dated cash activity with the app offline on mobile', async ({ page, context }) => {
  await startAssetHarness(page)
  await addAsset(page, { name: 'Offline wallet', type: 'E_WALLET', institution: 'Flazz', purpose: 'DAILY_CASH', amount: '100000' })

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
    }
  })
  await context.setOffline(true)
  await page.getByRole('link', { name: /Offline wallet/ }).click()
  await page.getByRole('button', { name: 'Add activity' }).click()
  const activityDialog = page.getByRole('dialog', { name: 'Add cash activity' })
  await activityDialog.getByRole('combobox', { name: 'Activity', exact: true }).click()
  await page.getByRole('option', { name: 'Credit / deposit', exact: true }).click()
  await activityDialog.locator('input[name="amount"]').fill('10000')
  await activityDialog.getByRole('button', { name: 'Continue' }).click()
  await activityDialog.locator('textarea[name="note"]').fill('Offline top-up')
  await activityDialog.getByRole('button', { name: 'Record activity' }).click()
  await expect(page.getByRole('heading', { name: 'Offline wallet' })).toBeVisible()
  await expect(page.getByText('Rp 110.000', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: /Offline wallet/ }).click()
  await expect(page.getByText('Rp 110.000', { exact: true })).toBeVisible()
  await expect(page.getByText('Offline top-up')).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('prices exact gold packages across sources, appends only changed holdings, and keeps wealth out of the budget', async ({ page, context }) => {
  test.setTimeout(90_000)
  const prices = await interceptGoldPrices(page)
  await page.goto('/?asset-tracker-e2e=1&workspace-e2e=1')
  await expect(page.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible()
  const expectBudgetUnchanged = await budgetBoundary(page)

  await addAsset(page, { name: 'Legacy manual gold', type: 'GOLD', institution: 'Home safe', purpose: 'INVESTMENT', amount: '1000000' })
  await expect(page.getByRole('button', { name: 'Update value for Legacy manual gold', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Legacy manual gold/ })).toContainText('Manual estimate')
  expect(prices.requests.size).toBe(0)
  await expectBudgetUnchanged()

  await page.getByRole('button', { name: 'Add liability', exact: true }).first().click()
  const liability = page.getByRole('dialog', { name: 'Add a liability' })
  await liability.getByLabel('Name', { exact: true }).fill('Gold test liability')
  await liability.getByLabel('Bank / provider').fill('Test bank')
  await liability.getByRole('button', { name: 'Continue', exact: true }).click()
  await liability.locator('input[name="openingAmount"]').fill('100000')
  await liability.getByRole('button', { name: 'Save liability', exact: true }).click()
  await expect(liability).toBeHidden()
  await expectBudgetUnchanged()

  await addAutomaticGold(page, {
    name: 'Antam packages', source: 'logammulia', product: 'Emas Batangan · 5 g', units: '2', valueIdr: 25_200_000, keyboard: true,
  })
  await addAutomaticGold(page, {
    name: 'Galeri packages', source: 'galeri24', product: 'Galeri24 · 1 g · Classic', units: '0.5', valueIdr: 1_250_000,
  })
  await expectPosition(page, 27_450_000, 27_350_000)
  await expectBudgetUnchanged()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expectPosition(page, 27_450_000, 27_350_000, true)
  await expectBudgetUnchanged()
  await page.getByRole('link', { name: 'Assets', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Refresh price for Antam packages', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Update value for Antam packages', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: /Antam packages/ }).click()
  await expectGoldDetail(page, 25_200_000, 1)
  const current = page.getByRole('region', { name: 'Current asset value' })
  await expect(current).toContainText('logammulia')
  await expect(current).toContainText('Emas Batangan')
  await expect(current).toContainText('5 g')
  await expect(current).toContainText(idr(12_600_000))
  await expect(current).toContainText(`Quote date ${displayDate(prices.dates.today)}`)
  await expect(current).toContainText(`Observed ${displayDate(prices.dates.today)}`)
  await expect(page.getByText('Native value', { exact: true })).toHaveCount(0)
  await expectBudgetUnchanged()
  await page.getByRole('link', { name: 'All assets', exact: true }).click()

  prices.setQuotes('logammulia', [prices.antam(12_700_000)])
  await refreshGold(page, 'logammulia', true)
  await expect(page.getByRole('link', { name: /Antam packages/ })).toContainText(idr(25_400_000))
  await expectPosition(page, 27_650_000, 27_550_000)
  await expectBudgetUnchanged()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expectPosition(page, 27_650_000, 27_550_000, true)
  await expectBudgetUnchanged()
  await page.getByRole('link', { name: 'Assets', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('link', { name: /Antam packages/ }).click()
  await expectGoldDetail(page, 25_400_000, 2)
  await expect(page.locator('.valuation-timeline-row').first()).toContainText(idr(25_400_000))
  await expect(page.locator('.valuation-timeline-row').last()).toContainText(idr(25_200_000))
  await expect(page.getByText(/Change since .*\+Rp\s*200\.000/)).toBeVisible()
  await refreshGold(page, 'logammulia')
  await expectGoldDetail(page, 25_400_000, 2)
  await expectBudgetUnchanged()

  await page.getByRole('button', { name: 'Edit details', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Edit asset details' })
  await expect(edit.getByRole('combobox', { name: 'Pricing method', exact: true })).toContainText('Automatic gold price')
  await edit.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(edit.getByRole('combobox', { name: 'Gold product', exact: true })).toContainText('Emas Batangan · 5 g')
  await selectOption(page, edit, 'Price source', 'galeri24')
  await selectOption(page, edit, 'Gold product', 'Galeri24 · 1 g · Classic')
  await selectOption(page, edit, 'Price source', 'logammulia')
  await expect(edit.getByRole('combobox', { name: 'Gold product', exact: true })).toContainText('Choose a gold product')
  await expect(edit.getByRole('textbox', { name: 'Units held', exact: true })).toHaveValue('2')
  await selectOption(page, edit, 'Gold product', 'Emas Batangan · 5 g')
  await edit.getByRole('textbox', { name: 'Units held', exact: true }).fill('3')
  await expect(edit.getByText(`Retail purchase estimate: ${idr(38_100_000)}`, { exact: true })).toBeVisible()
  await edit.getByRole('button', { name: 'Save details', exact: true }).click()
  await expect(edit).toBeHidden()
  await expectGoldDetail(page, 38_100_000, 3)
  await expect(page.locator('.valuation-timeline-row').first()).toContainText('3 packages')
  await expect(page.locator('.valuation-timeline-row').nth(1)).toContainText('2 packages')
  await expect(page.locator('.valuation-timeline-row').last()).toContainText('2 packages')
  await expectBudgetUnchanged()

  await page.getByRole('button', { name: 'Edit details', exact: true }).click()
  await edit.getByLabel('Name', { exact: true }).fill('Antam renamed')
  await edit.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(edit.getByRole('combobox', { name: 'Price source', exact: true })).toContainText('logammulia')
  await expect(edit.getByRole('combobox', { name: 'Gold product', exact: true })).toContainText('Emas Batangan · 5 g')
  await expect(edit.getByRole('textbox', { name: 'Units held', exact: true })).toHaveValue('3')
  await edit.getByRole('button', { name: 'Save details', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Antam renamed', exact: true })).toBeVisible()
  await expectGoldDetail(page, 38_100_000, 3)
  await page.getByRole('link', { name: 'All assets', exact: true }).click()
  await expectPosition(page, 40_350_000, 40_250_000)
  await expectBudgetUnchanged()

  await page.getByRole('link', { name: /Antam renamed/ }).click()
  await context.setOffline(true)
  await expect(page.getByRole('button', { name: 'Refresh price', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Edit details', exact: true }).click()
  await selectOption(page, edit, 'Pricing method', 'Manual value')
  await edit.getByRole('button', { name: 'Continue', exact: true }).click()
  await edit.getByRole('button', { name: 'Save details', exact: true }).click()
  await expect(edit).toBeHidden()
  await expect(page.getByRole('button', { name: 'Update value', exact: true })).toBeVisible()
  await expect(current).toContainText('Automatic gold price')
  await expect(current).toContainText(idr(38_100_000))
  await expect(page.locator('.valuation-timeline-row')).toHaveCount(3)
  const antamRequestsAtOptOut = prices.requests.get('logammulia')
  prices.setQuotes('logammulia', [prices.antam(13_000_000)])
  await context.setOffline(false)
  await page.getByRole('link', { name: 'All assets', exact: true }).click()
  await refreshGold(page, 'galeri24', true)
  expect(prices.requests.get('logammulia')).toBe(antamRequestsAtOptOut)
  await expect(page.getByRole('link', { name: /Antam renamed/ })).toContainText(idr(38_100_000))
  await expectBudgetUnchanged()

  await page.getByRole('link', { name: /Antam renamed/ }).click()
  await page.getByRole('button', { name: 'Update value', exact: true }).click()
  const manual = page.getByRole('dialog', { name: 'Update asset value' })
  await manual.locator('input[name="nativeAmount"]').fill('39000000')
  await manual.getByRole('button', { name: 'Continue', exact: true }).click()
  await manual.getByRole('button', { name: 'Continue', exact: true }).click()
  await manual.getByRole('button', { name: 'Save valuation', exact: true }).click()
  await expect(manual).toBeHidden()
  await expect(current).toContainText(idr(39_000_000))
  await expect(current).not.toContainText('Automatic gold price')
  await expect(page.locator('.valuation-timeline-row')).toHaveCount(4)
  await expect(page.locator('.valuation-timeline-row').first()).toContainText('Manual valuation')
  await expect(page.locator('.valuation-timeline-row').nth(1)).toContainText('Automatic gold price')
  await expectBudgetUnchanged()
  await page.getByRole('link', { name: 'All assets', exact: true }).click()
  await expectPosition(page, 41_250_000, 41_150_000)
  await expect(page.getByRole('link', { name: /Legacy manual gold/ })).toContainText(idr(1_000_000))
  await expect(page.getByRole('button', { name: 'Update value for Legacy manual gold', exact: true })).toBeVisible()

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your money, in focus', level: 1 })).toBeVisible()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expectPosition(page, 41_250_000, 41_150_000, true)
    await expect(page.getByText('Separate from Safe to Spend Today.', { exact: true })).toBeVisible()
    await expectBudgetUnchanged()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  }
})

test('retains saved gold through failed, missing, older and stale quotes, then reloads offline and recovers on reconnect', async ({ page, context }) => {
  test.setTimeout(90_000)
  const prices = await interceptGoldPrices(page)
  prices.setQuotes('galeri24', [prices.galeri(2_500_000, prices.dates.stale)])
  await page.goto('/?asset-tracker-e2e=1&workspace-e2e=1')
  await expect(page.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible()
  const expectBudgetUnchanged = await budgetBoundary(page)
  await addAutomaticGold(page, {
    name: 'Retained Antam', source: 'logammulia', product: 'Emas Batangan · 5 g', units: '2', valueIdr: 25_200_000,
  })
  await addAutomaticGold(page, {
    name: 'Stale Galeri', source: 'galeri24', product: 'Galeri24 · 1 g · Classic', units: '1', valueIdr: 2_500_000,
  })
  await expect(page.getByRole('link', { name: /Stale Galeri/ })).toContainText('Stale gold price')
  await expect(page.getByRole('link', { name: /Retained Antam/ })).not.toContainText('Stale gold price')
  await expectBudgetUnchanged()

  prices.fail('logammulia')
  prices.setQuotes('galeri24', [prices.galeri(2_600_000, prices.dates.stale)])
  await refreshGold(page, 'logammulia', true)
  await expect(page.getByRole('link', { name: /Retained Antam/ })).toContainText(idr(25_200_000))
  await expect(page.getByRole('link', { name: /Retained Antam/ })).toContainText('Gold prices are currently unavailable.')
  await expect(page.getByRole('link', { name: /Stale Galeri/ })).toContainText(idr(2_600_000))
  await expect(page.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible()
  await expectBudgetUnchanged()
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByText('Gold prices are currently unavailable.', { exact: true })).toBeVisible()
  await expect(page.getByText('Stale gold price', { exact: true })).toBeVisible()
  await expect(page.locator('.dashboard-assets-metrics').getByText(idr(27_800_000), { exact: true }).first()).toBeVisible()
  await expectBudgetUnchanged()
  await page.getByRole('link', { name: 'Assets', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('link', { name: /Retained Antam/ }).click()
  await expectGoldDetail(page, 25_200_000, 1)

  await page.getByRole('button', { name: 'Edit details', exact: true }).click()
  const edit = page.getByRole('dialog', { name: 'Edit asset details' })
  await edit.getByLabel('Name', { exact: true }).fill('Retained Antam renamed')
  await edit.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(edit.getByRole('combobox', { name: 'Gold product', exact: true })).toContainText('Emas Batangan · 5 g')
  await expect(edit.getByRole('textbox', { name: 'Units held', exact: true })).toHaveValue('2')
  await expect(edit.getByRole('alert').filter({ hasText: 'Entered details and saved selection are retained.' })).toBeVisible()
  await edit.getByRole('textbox', { name: 'Units held', exact: true }).fill('3')
  await edit.getByRole('button', { name: 'Save details', exact: true }).click()
  await expect(edit.getByText('A usable gold price is required. Retry gold prices and select your product.', { exact: true })).toBeVisible()
  await expect(edit.getByRole('textbox', { name: 'Units held', exact: true })).toHaveValue('3')
  await expect(edit.getByRole('combobox', { name: 'Gold product', exact: true })).toContainText('Emas Batangan · 5 g')
  prices.setQuotes('logammulia', [prices.antam()])
  const retryResponse = page.waitForResponse((response) => response.url().includes('/api/gold-prices?source=logammulia'))
  await edit.getByRole('button', { name: 'Retry gold prices', exact: true }).click()
  await retryResponse
  await expect(edit.getByRole('button', { name: 'Retry gold prices', exact: true })).toBeEnabled()
  await expect(edit.getByRole('alert').filter({ hasText: 'Entered details and saved selection are retained.' })).toHaveCount(0)
  await expect(edit.getByRole('textbox', { name: 'Units held', exact: true })).toHaveValue('3')
  await expect(edit.getByRole('combobox', { name: 'Gold product', exact: true })).toContainText('Emas Batangan · 5 g')
  await edit.getByRole('textbox', { name: 'Units held', exact: true }).fill('2')
  await edit.getByRole('button', { name: 'Save details', exact: true }).click()
  await expect(edit).toBeHidden()
  await expectGoldDetail(page, 25_200_000, 1)

  prices.setQuotes('logammulia', [{ ...prices.antam(12_700_000), lineKey: 'Different product' }])
  await refreshGold(page, 'logammulia')
  await expect(page.getByText('Price unavailable for the selected gold product. Last saved value retained.', { exact: true })).toBeVisible()
  await expectGoldDetail(page, 25_200_000, 1)
  prices.setQuotes('logammulia', [prices.antam(12_700_000, prices.dates.yesterday)])
  await refreshGold(page, 'logammulia')
  await expect(page.getByText('Received an older gold price. Last saved value retained.', { exact: true })).toBeVisible()
  await expectGoldDetail(page, 25_200_000, 1)
  prices.setQuotes('logammulia', [prices.antam(12_700_000, prices.dates.tomorrow)])
  await refreshGold(page, 'logammulia')
  await expect(page.getByText("Gold price is dated after today's valuation date.", { exact: true })).toBeVisible()
  await expectGoldDetail(page, 25_200_000, 1)
  await expectBudgetUnchanged()

  prices.setQuotes('logammulia', [prices.antam(12_700_000)])
  await refreshGold(page, 'logammulia')
  await expectGoldDetail(page, 25_400_000, 2)
  await expect(page.getByText('Received an older gold price. Last saved value retained.', { exact: true })).toHaveCount(0)
  await expect(page.getByText("Gold price is dated after today's valuation date.", { exact: true })).toHaveCount(0)
  await expectBudgetUnchanged()
  await page.getByRole('link', { name: 'All assets', exact: true }).click()
  await page.getByRole('link', { name: /Stale Galeri/ }).click()
  await expectGoldDetail(page, 2_600_000, 2)
  const current = page.getByRole('region', { name: 'Current asset value' })
  await expect(current).toContainText('Stale gold price')
  await expect(current).toContainText(`Quote date ${displayDate(prices.dates.stale)}`)
  await expect(current).toContainText(`Observed ${displayDate(prices.dates.today)}`)
  await expect(page.locator('.valuation-timeline-row').last()).toContainText(idr(2_500_000))
  await page.getByRole('link', { name: 'All assets', exact: true }).click()

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your money, in focus', level: 1 })).toBeVisible()
  await expect(page.getByText(/Stale gold price/)).toBeVisible()
  await expect(page.locator('.dashboard-assets-metrics').getByText(idr(28_000_000), { exact: true }).first()).toBeVisible()
  await expectBudgetUnchanged()
  await page.getByRole('link', { name: 'Assets', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
    }
  })
  await context.setOffline(true)
  await expect(page.getByRole('button', { name: 'Refresh gold prices', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Refresh price for Retained Antam renamed', exact: true })).toBeDisabled()
  const requestsWhileOffline = [...prices.requests.entries()]
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: /Retained Antam renamed/ })).toContainText(idr(25_400_000))
  await page.getByRole('link', { name: /Retained Antam renamed/ }).click()
  await expectGoldDetail(page, 25_400_000, 2)
  await expect(current).toContainText('Offline — showing last saved gold value.')
  await expect(current).toContainText('logammulia')
  await expect(current).toContainText(`Quote date ${displayDate(prices.dates.today)}`)
  await expect(page.getByRole('button', { name: 'Refresh price', exact: true })).toBeDisabled()
  await expect(page.locator('.valuation-timeline-row').last()).toContainText(idr(25_200_000))
  expect([...prices.requests.entries()]).toEqual(requestsWhileOffline)
  await expectBudgetUnchanged()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)

  prices.setQuotes('logammulia', [prices.antam(12_800_000)])
  prices.setQuotes('galeri24', [prices.galeri(2_700_000)])
  const reconnectResponse = page.waitForResponse((response) => response.url().includes('/api/gold-prices?source=logammulia'))
  await context.setOffline(false)
  await reconnectResponse
  await expectGoldDetail(page, 25_600_000, 3)
  await expect(current).not.toContainText('Offline — showing last saved gold value.')
  await expect(page.getByRole('button', { name: 'Refresh price', exact: true })).toBeEnabled()
  await expectBudgetUnchanged()
  await page.getByRole('link', { name: 'All assets', exact: true }).click()
  await expect(page.getByRole('link', { name: /Stale Galeri/ })).toContainText(idr(2_700_000))
  await expect(page.getByRole('link', { name: /Stale Galeri/ })).not.toContainText('Stale gold price')
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  }
  await expectBudgetUnchanged()
})
