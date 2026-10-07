import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

async function addAsset(page: Page, details: { name: string; type: string; institution: string; purpose: string; amount: string; exchangeRate?: string }) {
  await page.getByRole('button', { name: 'Add asset' }).first().click()
  await page.getByLabel('Name').fill(details.name)
  await page.getByLabel('Asset type').selectOption(details.type)
  await page.getByLabel('Purpose').selectOption(details.purpose)
  await page.getByLabel('Bank / institution / place').fill(details.institution)
  await page.locator('input[name="openingAmount"]').fill(details.amount)
  if (details.exchangeRate) await page.locator('input[name="exchangeRate"]').fill(details.exchangeRate)
  await page.getByRole('button', { name: 'Save asset' }).click()
  await expect(page.getByRole('link', { name: new RegExp(details.name) })).toBeVisible()
}

async function startAssetHarness(page: Page) {
  await page.goto('/?asset-tracker-e2e=1')
  await expect(page.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible()
}

test('keeps budget fields within narrow mobile viewports', async ({ page }) => {
  await page.goto('/?asset-tracker-e2e=1&budget-form-e2e=1')
  await expect(page.getByRole('heading', { name: 'Budget settings', level: 1 })).toBeVisible()

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 667 })
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)

    const form = await page.locator('.budget-form').evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(form.scrollWidth).toBeLessThanOrEqual(form.width)

    const saveButton = page.getByRole('button', { name: 'Save budget' })
    await expect(saveButton).toBeVisible()
    const box = await saveButton.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)

    const saveLayout = await page.evaluate(() => {
      const saveBar = document.querySelector('.budget-save-bar')!
      const lastCategory = document.querySelector('.category-editor:last-child')!
      const saveBox = saveBar.getBoundingClientRect()
      const categoryBox = lastCategory.getBoundingClientRect()
      return {
        position: getComputedStyle(saveBar).position,
        saveTop: saveBox.top + window.scrollY,
        categoryBottom: categoryBox.bottom + window.scrollY,
      }
    })
    expect(saveLayout.position).toBe('static')
    expect(saveLayout.saveTop).toBeGreaterThanOrEqual(saveLayout.categoryBottom)
  }
})

test('keeps the expense form inside narrow phone viewports', async ({ page }) => {
  await page.goto('/?asset-tracker-e2e=1&budget-form-e2e=1')
  await expect(page.getByRole('heading', { name: 'Budget settings', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Open test expense' }).click()
  await expect(page.getByRole('heading', { name: 'Add expense' })).toBeVisible()

  const dialog = page.locator('.astryx-dialog')
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 667 }]) {
    await page.setViewportSize(viewport)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)

    const bounds = await dialog.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.y).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height)

    const form = await dialog.locator('form').evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(form.scrollWidth).toBeLessThanOrEqual(form.width)
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
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.getByRole('treeitem', { name: 'Commitments', exact: true })).toBeVisible()
})

test('provides a screen-reader summary for asset history and custom range errors', async ({ page }) => {
  await startAssetHarness(page)

  const chart = page.getByRole('img', { name: /Total asset value/ })
  await expect(chart).toHaveAccessibleDescription(/ranges from .+ to .+\. It starts at .+ on .+ and ends at .+ on .+\./)

  await page.getByLabel('History range').selectOption('CUSTOM')
  const from = page.getByLabel('From', { exact: true })
  const to = page.getByLabel('To', { exact: true })
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

test('creates valuations, transfers tracked cash, and links one expense without mixing wealth into the budget', async ({ page }) => {
  await startAssetHarness(page)
  const initialSafeToSpend = await page.getByTestId('safe-to-spend').getAttribute('data-value')
  const initialSpent = Number(await page.getByTestId('actual-spent').getAttribute('data-value'))
  const initialTransactions = Number(await page.getByTestId('transaction-count').getAttribute('data-value'))

  await addAsset(page, { name: 'BCA Daily', type: 'BANK_ACCOUNT', institution: 'BCA', purpose: 'DAILY_CASH', amount: '1000000' })
  await addAsset(page, { name: 'SeaBank Savings', type: 'BANK_ACCOUNT', institution: 'SeaBank', purpose: 'PROTECTED_SAVINGS', amount: '500000' })
  await expect(page.getByTestId('safe-to-spend')).toHaveAttribute('data-value', initialSafeToSpend!)
  await expect(page.getByText('Rp 1.500.000', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Record transfer' }).click()
  await page.getByRole('combobox', { name: 'From', exact: true }).selectOption({ label: 'SeaBank Savings · SeaBank' })
  await page.getByRole('combobox', { name: 'To', exact: true }).selectOption({ label: 'BCA Daily · BCA' })
  await page.locator('input[name="amount"]').fill('100000')
  await page.getByRole('button', { name: 'Record transfer' }).last().click()
  await expect(page.getByTestId('safe-to-spend')).toHaveAttribute('data-value', initialSafeToSpend!)
  await expect(page.getByText('Rp 1.500.000', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Internal tracked-account transfers are excluded from contributions and withdrawals.')).toBeVisible()

  await addAsset(page, { name: 'USD cash', type: 'FOREIGN_CURRENCY', institution: 'Travel wallet', purpose: 'OTHER', amount: '100', exchangeRate: '15000' })
  await expect(page.getByRole('link', { name: /USD cash/ })).toContainText('Rp 1.500.000')
  await page.getByRole('link', { name: /USD cash/ }).click()
  await expect(page.getByText('100,00 USD', { exact: true })).toBeVisible()
  await expect(page.getByText(/1 USD = Rp 15000 · rate dated/)).toBeVisible()
  await expect(page.getByText(/Rate: 1 USD = Rp 15000 · dated/)).toBeVisible()
  await page.getByRole('link', { name: 'All assets' }).click()

  await addAsset(page, { name: 'Bibit fund', type: 'MUTUAL_FUND', institution: 'Bibit', purpose: 'INVESTMENT', amount: '1000000' })
  await page.getByRole('button', { name: 'Update value for Bibit fund' }).click()
  await page.locator('input[name="nativeAmount"]').fill('1250000')
  await page.locator('input[name="quantity"]').fill('10')
  await page.getByRole('button', { name: 'Save valuation' }).click()
  await expect(page.getByTestId('safe-to-spend')).toHaveAttribute('data-value', initialSafeToSpend!)

  await page.getByRole('link', { name: /Bibit fund/ }).click()
  await expect(page.getByText(/Change since .*\+Rp 250\.000/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Activity and valuations' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'All assets' }).click()

  await page.getByRole('button', { name: 'Open test expense' }).click()
  await page.getByLabel('Description').fill('Market groceries')
  await page.locator('input[name="amount"]').fill('25000')
  await page.getByLabel('Paid from').selectOption({ label: 'BCA Daily · BCA' })
  await page.getByRole('button', { name: 'Save expense' }).click()
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
  await page.getByLabel('Name').fill('BCA card')
  await page.getByLabel('Bank / provider').fill('BCA')
  await page.locator('input[name="openingAmount"]').fill('100000')
  await page.getByRole('button', { name: 'Save liability' }).click()
  await expect(page.getByText('Rp 900.000', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Record payment for BCA card' }).click()
  await page.getByLabel('Paid from').selectOption({ label: 'Everyday cash · Wallet' })
  await page.locator('input[name="amount"]').fill('25000')
  await page.getByRole('button', { name: 'Record payment', exact: true }).click()
  await expect(page.getByText('Net worth')).toBeVisible()
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
  await page.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('CREDIT')
  await page.locator('input[name="amount"]').fill('10000')
  await page.locator('textarea[name="note"]').fill('Offline top-up')
  await page.getByRole('button', { name: 'Record activity' }).click()
  await expect(page.getByRole('heading', { name: 'Offline wallet' })).toBeVisible()
  await expect(page.getByText('Rp 110.000', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Assets', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: /Offline wallet/ }).click()
  await expect(page.getByText('Rp 110.000', { exact: true })).toBeVisible()
  await expect(page.getByText('Offline top-up')).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
