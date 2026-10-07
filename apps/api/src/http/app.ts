import { clerkClient, clerkMiddleware, getAuth } from '@clerk/express'
import express, { type ErrorRequestHandler, type Express, type Request, type RequestHandler, type Response } from 'express'
import { ZodError, z } from 'zod'
import { BudgetValidationError, SnapshotConflictError, SqliteBudgetRepository } from '../repositories/sqlite-budget-repository.js'
import { HttpError } from './errors.js'
import { plannedExpenseSchema, saveBudgetSchema, snapshotSchema, transactionSchema } from './schemas.js'


export type ApiAuthProvider = {
  middleware: RequestHandler
  getUserId: (request: Request) => string | null
}

export type ApiAccountActions = {
  deactivateUser: (userId: string) => Promise<void>
}

const clerkAccountActions: ApiAccountActions = {
  deactivateUser: async (userId) => { await clerkClient.users.banUser(userId) },
}


function clerkAuthProvider(): ApiAuthProvider {
  return {
    middleware: clerkMiddleware({
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY,
    }),
    getUserId: (request) => getAuth(request).userId,
  }
}
export function createApiApp(
  repository: SqliteBudgetRepository,
  auth: ApiAuthProvider = clerkAuthProvider(),
  accountActions: ApiAccountActions = clerkAccountActions,
): Express {
  const app = express()
  app.use(auth.middleware)
  app.disable('x-powered-by')
  app.use(express.json({ limit: '256kb' }))

  app.get('/api/health', (_request, response) => {
    repository.ping()
    response.json({ status: 'ok', database: 'ok' })
  })

  app.use('/api', (request, response, next) => {
    const userId = auth.getUserId(request)
    if (!userId) {
      response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to access your budget.' } })
      return
    }
    if (!repository.claimOrVerifyOwner(userId)) {
      response.status(403).json({ error: { code: 'ACCOUNT_NOT_OWNER', message: 'This budget is linked to a different Clerk account.' } })
      return
    }
    next()
  })
  app.get('/api/budget', (_request, response) => {
    response.json({ snapshot: repository.getSnapshot(), dataGeneration: repository.getDataGeneration() })
  })
  app.delete('/api/account/data', (_request, response) => {
    requireDataGeneration(_request, repository)
    response.json({ dataGeneration: repository.resetAccountData() })
  })

  app.post('/api/account/deactivate', async (request, response) => {
    const userId = auth.getUserId(request)
    if (!userId) {
      response.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to access your budget.' } })
      return
    }
    await accountActions.deactivateUser(userId)
    response.status(204).end()
  })


  app.post('/api/budget/import', (request, response) => {
    requireDataGeneration(request, repository)
    const snapshot = parseBody(snapshotSchema, request.body)
    const imported = repository.importIfEmpty(snapshot)
    response.status(imported ? 201 : 200).json({ snapshot: repository.getSnapshot(), imported })
  })

  app.put('/api/budget', (request, response) => {
    requireDataGeneration(request, repository)
    const body = parseBody(saveBudgetSchema, request.body)
    repository.saveBudget(body.period, body.categories)
    response.json({ snapshot: repository.getSnapshot() })
  })

  app.put('/api/planned-expenses/:id', (request, response) => {
    requireDataGeneration(request, repository)
    const expense = parseBody(plannedExpenseSchema, request.body)
    if (expense.id !== request.params.id) throw new HttpError(400, 'ID_MISMATCH', 'The URL id must match the planned expense id.')
    repository.savePlannedExpense(expense)
    response.json({ snapshot: repository.getSnapshot() })
  })

  app.delete('/api/planned-expenses/:id', (request, response) => {
    requireDataGeneration(request, repository)
    repository.deletePlannedExpense(request.params.id ?? '')
    response.status(204).end()
  })

  app.put('/api/transactions/:id', (request, response) => {
    requireDataGeneration(request, repository)
    const transaction = parseBody(transactionSchema, request.body)
    if (transaction.id !== request.params.id) throw new HttpError(400, 'ID_MISMATCH', 'The URL id must match the transaction id.')
    repository.saveTransaction(transaction)
    response.json({ snapshot: repository.getSnapshot() })
  })

  app.delete('/api/transactions/:id', (request, response) => {
    requireDataGeneration(request, repository)
    repository.deleteTransaction(request.params.id ?? '')
    response.status(204).end()
  })

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } })
  })

  const errorHandler: ErrorRequestHandler = (error: unknown, request: Request, response: Response, next) => {
    if (response.headersSent) return next(error)
    if (error instanceof HttpError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message } })
      return
    }
    if (error instanceof ZodError) {
      response.status(400).json({ error: { code: 'INVALID_REQUEST', message: error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ') } })
      return
    }
    if (error instanceof BudgetValidationError) {
      response.status(400).json({ error: { code: 'INVALID_BUDGET', message: error.message } })
      return
    }
    if (error instanceof SnapshotConflictError) {
      response.status(409).json({ error: { code: 'SNAPSHOT_CONFLICT', message: error.message } })
      return
    }
    if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.parse.failed') {
      response.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' } })
      return
    }
    console.error('Unhandled API request error', request.method, request.route?.path ?? '<unmatched>', error)
    response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The API could not complete the request.' } })
  }
  app.use(errorHandler)

  return app
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  return schema.parse(body)
}
function requireDataGeneration(request: Request, repository: SqliteBudgetRepository): void {
  const rawGeneration = request.get('x-kinsen-data-generation')
  const generation = Number(rawGeneration)
  if (!rawGeneration || !/^(0|[1-9]\d*)$/.test(rawGeneration) || !Number.isSafeInteger(generation)) {
    throw new HttpError(428, 'DATA_GENERATION_REQUIRED', 'A current account data generation is required for this change.')
  }
  if (generation !== repository.getDataGeneration()) {
    throw new HttpError(409, 'DATA_GENERATION_MISMATCH', 'Account data changed in another session. Reload before saving.')
  }
}

