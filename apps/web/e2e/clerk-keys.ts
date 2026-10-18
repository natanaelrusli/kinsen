import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Mirrors the guard in apps/api/src/server.ts: the API refuses to start without
// CLERK_SECRET_KEY and a publishable key, read from the environment or the repo's .env.local.
const rootEnvFile = fileURLToPath(new URL('../../../.env.local', import.meta.url))

function readRootEnv(): string {
  return existsSync(rootEnvFile) ? readFileSync(rootEnvFile, 'utf8') : ''
}

function hasKey(name: string, envFile: string): boolean {
  if (process.env[name]) return true
  return new RegExp(`^${name}=.+`, 'm').test(envFile)
}

const envFile = readRootEnv()

export const clerkKeysMissingMessage =
  'Clerk keys are not configured (CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY). Run `clerk env pull --app app_3KIii8HfJsup41N5rwZcbEs9lJw --file .env.local` from the repository root to enable the Clerk-backed e2e tests.'

export const hasClerkKeys =
  hasKey('CLERK_SECRET_KEY', envFile)
  && (hasKey('CLERK_PUBLISHABLE_KEY', envFile) || hasKey('VITE_CLERK_PUBLISHABLE_KEY', envFile))
