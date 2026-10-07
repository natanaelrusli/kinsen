import { expect, test } from '@playwright/test'

test('shows Clerk sign-up and sign-in controls and opens both flows', async ({ page }) => {
  await page.goto('/')

  const signUp = page.getByRole('button', { name: 'Create your account' })
  const signIn = page.getByRole('button', { name: 'Sign in' })
  await expect(signUp).toBeVisible()
  await expect(signIn).toBeVisible()

  await signUp.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')

  await signIn.click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('rejects unauthenticated budget API requests', async ({ request }) => {
  const response = await request.get('/api/budget')
  expect(response.status()).toBe(401)
  expect(await response.json()).toEqual({
    error: { code: 'UNAUTHENTICATED', message: 'Sign in to access your budget.' },
  })
})
