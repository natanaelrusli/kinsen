import { createServer } from 'node:http'
import { createApiApp } from './http/app.js'
import { openDatabase } from './db/database.js'
import { SqliteBudgetRepository } from './repositories/sqlite-budget-repository.js'

const publishableKey = process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY
if (!process.env.CLERK_SECRET_KEY || !publishableKey) {
  throw new Error('Clerk keys are missing. Run `clerk env pull --app app_3KIii8HfJsup41N5rwZcbEs9lJw --file .env.local` from the repository root.')
}

const database = openDatabase()
const repository = new SqliteBudgetRepository(database)
const app = createApiApp(repository)
const host = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? 3001)
const server = createServer(app)

server.listen(port, host, () => {
  console.log(`Kinsen API listening on http://${host}:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      database.close()
      process.exit(0)
    })
  })
}
