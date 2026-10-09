import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { createSampleSnapshot } from '@kinsen/budget-domain'
import type { BudgetSnapshot, GoldPriceResponse } from '@kinsen/budget-domain'
import { migrateDatabase, openDatabase } from '../db/database.js'
import { SqliteBudgetRepository } from '../repositories/sqlite-budget-repository.js'
import { createApiApp, type ApiAccountActions, type ApiAuthProvider } from '../http/app.js'
import type { DatabaseSync } from 'node:sqlite'
import type { Express } from 'express'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HttpError } from '../http/errors.js'

let database: DatabaseSync
let app: Express

const testAuth: ApiAuthProvider = {
  middleware: (_request, _response, next) => next(),
  getUserId: (request) => {
    const userId = request.get('x-test-user')
    return userId === 'anonymous' ? null : userId ?? 'user_test_default'
  },
}

beforeEach(() => {
  database = openDatabase(':memory:')
  app = createApiApp(new SqliteBudgetRepository(database), testAuth)
})

afterEach(() => database.close())

describe('budget API', () => {
  it('reports API and SQLite readiness', async () => {
    const response = await request(app).get('/api/health')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok', database: 'ok' })
  })

  it('requires authentication and prevents another account from reading the budget', async () => {
    await request(app).get('/api/budget').set('x-test-user', 'anonymous').expect(401)

    const snapshot = createSampleSnapshot('2024-01-02')
    await postWithGeneration('/api/budget/import').send(snapshot).expect(201)

    const unauthorized = await request(app).get('/api/budget').set('x-test-user', 'user_other')
    expect(unauthorized.status).toBe(403)
    expect(unauthorized.body.error.code).toBe('ACCOUNT_NOT_OWNER')
    expect((await request(app).get('/api/budget')).body.snapshot).toEqual(sortedSnapshot(snapshot))
  })

  it('transfers API ownership without changing the budget snapshot', () => {
    const snapshot = createSampleSnapshot('2024-01-02')
    const repository = new SqliteBudgetRepository(database)
    repository.importIfEmpty(snapshot)
    expect(repository.claimOrVerifyOwner('user_first')).toBe(true)

    expect(repository.transferOwnerTo('user_second')).toBe(true)
    expect(repository.transferOwnerTo('user_second')).toBe(false)
    expect(repository.claimOrVerifyOwner('user_first')).toBe(false)
    expect(repository.claimOrVerifyOwner('user_second')).toBe(true)
    expect(repository.getSnapshot()).toEqual(sortedSnapshot(snapshot))
  })

  it('adds account ownership to an existing v1 budget without dropping its snapshot', () => {
    const snapshot = createSampleSnapshot('2024-01-02')
    const repository = new SqliteBudgetRepository(database)
    repository.importIfEmpty(snapshot)
    database.exec('DROP TABLE app_owner')

    database.prepare('DELETE FROM schema_migrations WHERE version >= 2').run()

    migrateDatabase(database)

    const migratedRepository = new SqliteBudgetRepository(database)
    expect(migratedRepository.getSnapshot()).toEqual(sortedSnapshot(snapshot))
    expect(migratedRepository.claimOrVerifyOwner('user_first')).toBe(true)
    expect(migratedRepository.claimOrVerifyOwner('user_second')).toBe(false)
  })
  it('adds the account data generation to an existing version-two database', () => {
    const snapshot = createSampleSnapshot('2024-01-02')
    const repository = new SqliteBudgetRepository(database)
    repository.importIfEmpty(snapshot)
    expect(repository.claimOrVerifyOwner('user_first')).toBe(true)

    database.exec(`
      CREATE TABLE app_owner_v2 (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        user_id TEXT NOT NULL UNIQUE
      );
      INSERT INTO app_owner_v2 (singleton, user_id) SELECT singleton, user_id FROM app_owner;
      DROP TABLE app_owner;
      ALTER TABLE app_owner_v2 RENAME TO app_owner;
    `)
    database.prepare('DELETE FROM schema_migrations WHERE version = 3').run()
    migrateDatabase(database)

    expect(repository.getSnapshot()).toEqual(sortedSnapshot(snapshot))
    expect(repository.claimOrVerifyOwner('user_first')).toBe(true)
    expect(repository.getDataGeneration()).toBe(0)
  })

  it('resets API budget data for its owner and increments the generation', async () => {
    const original = createSampleSnapshot('2024-01-02')
    await postWithGeneration('/api/budget/import').send(original).expect(201)

    await request(app).delete('/api/account/data').set('x-test-user', 'anonymous').expect(401)
    await request(app).delete('/api/account/data').set('x-test-user', 'user_other').expect(403)
    expect((await request(app).get('/api/budget')).body.snapshot).toEqual(sortedSnapshot(original))

    const reset = await request(app).delete('/api/account/data').set('x-kinsen-data-generation', '0').expect(200)
    expect(reset.body).toEqual({ dataGeneration: 1 })
    const empty = await request(app).get('/api/budget').expect(200)
    expect(empty.body).toEqual({
      snapshot: { period: null, categories: [], plannedExpenses: [], transactions: [] },
      dataGeneration: 1,
    })

    const replacement = createSampleSnapshot('2024-02-02')

    const staleWrite = await postWithGeneration('/api/budget/import').send(replacement)
    expect(staleWrite.status).toBe(409)
    expect(staleWrite.body.error.code).toBe('DATA_GENERATION_MISMATCH')
    expect((await request(app).get('/api/budget')).body).toEqual(empty.body)

    await postWithGeneration('/api/budget/import', 1).send(replacement).expect(201)
    expect((await request(app).get('/api/budget')).body.snapshot).toEqual(sortedSnapshot(replacement))
    expect((await request(app).get('/api/budget')).body.dataGeneration).toBe(1)
  })

  it('deactivates only the authenticated owner and keeps its budget data', async () => {
    const original = createSampleSnapshot('2024-01-02')
    await postWithGeneration('/api/budget/import').send(original).expect(201)
    const deactivatedUsers: string[] = []
    const accountActions: ApiAccountActions = {
      deactivateUser: async (userId) => { deactivatedUsers.push(userId) },
    }
    app = createApiApp(new SqliteBudgetRepository(database), testAuth, accountActions)

    await request(app).post('/api/account/deactivate').set('x-test-user', 'user_other').expect(403)
    expect(deactivatedUsers).toEqual([])
    await request(app).post('/api/account/deactivate').expect(204)
    expect(deactivatedUsers).toEqual(['user_test_default'])
    expect((await request(app).get('/api/budget')).body.snapshot).toEqual(sortedSnapshot(original))
  })

  it('persists the budget across SQLite connection restarts', () => {
    const directory = mkdtempSync(join(tmpdir(), 'kinsen-api-'))
    const path = join(directory, 'budget.sqlite')
    let fileDatabase: DatabaseSync | undefined
    try {
      fileDatabase = openDatabase(path)
      const snapshot = createSampleSnapshot('2024-01-02')
      new SqliteBudgetRepository(fileDatabase).importIfEmpty(snapshot)
      fileDatabase.close()
      fileDatabase = openDatabase(path)
      const repository = new SqliteBudgetRepository(fileDatabase)
      expect(repository.claimOrVerifyOwner('user_first')).toBe(true)
      expect(repository.getSnapshot()).toEqual(sortedSnapshot(snapshot))
      expect(repository.claimOrVerifyOwner('user_second')).toBe(false)
    } finally {
      fileDatabase?.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('imports an existing local snapshot atomically and idempotently', async () => {
    const snapshot = createSampleSnapshot('2024-01-02')
    const missingGeneration = await request(app).post('/api/budget/import').send(snapshot)
    expect(missingGeneration.status).toBe(428)
    expect(missingGeneration.body.error.code).toBe('DATA_GENERATION_REQUIRED')

    const first = await postWithGeneration('/api/budget/import').send(snapshot)
    expect(first.status).toBe(201)
    expect(first.body.snapshot).toEqual(sortedSnapshot(snapshot))
    expect(first.body.imported).toBe(true)

    const repeated = await postWithGeneration('/api/budget/import').send(snapshot)
    expect(repeated.status).toBe(200)
    expect(repeated.body.imported).toBe(false)
    expect((await request(app).get('/api/budget')).body.snapshot).toEqual(sortedSnapshot(snapshot))
  })

  it('rejects conflicting imports without replacing server data', async () => {
    const original = createSampleSnapshot('2024-01-02')
    await postWithGeneration('/api/budget/import').send(original).expect(201)
    const different = createSampleSnapshot('2024-02-02')

    const response = await postWithGeneration('/api/budget/import').send(different)
    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('SNAPSHOT_CONFLICT')
    expect((await request(app).get('/api/budget')).body.snapshot).toEqual(sortedSnapshot(original))
  })

  it('rejects invalid budget totals and keeps the stored snapshot unchanged', async () => {
    const snapshot = createSampleSnapshot('2024-01-02')
    await postWithGeneration('/api/budget/import').send(snapshot).expect(201)

    const response = await putWithGeneration('/api/budget').send({
      period: { ...snapshot.period, totalAmount: 100 },
      categories: snapshot.categories,
    })
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_BUDGET')
    expect((await request(app).get('/api/budget')).body.snapshot).toEqual(sortedSnapshot(snapshot))
  })

  it('persists linked payments and unlinks them when a planned expense is removed', async () => {
    const snapshot = createSampleSnapshot('2024-01-02')
    await postWithGeneration('/api/budget/import').send(snapshot).expect(201)

    const transaction = {
      id: 'rent-payment',
      description: 'Rent part payment',
      categoryId: 'home',
      amount: 1_000_000,
      date: '2024-01-02',
      plannedExpenseId: 'rent',
      plannedOccurrenceDate: '2024-01-01',
    }
    await putWithGeneration('/api/transactions/rent-payment').send(transaction).expect(200)
    expect((await request(app).get('/api/budget')).body.snapshot.transactions).toContainEqual(transaction)

    await deleteWithGeneration('/api/planned-expenses/rent').expect(204)
    const stored = (await request(app).get('/api/budget')).body.snapshot
    expect(stored.plannedExpenses.some((expense: { id: string }) => expense.id === 'rent')).toBe(false)
    expect(stored.transactions).toContainEqual({
      id: 'rent-payment',
      description: 'Rent part payment',
      categoryId: 'home',
      amount: 1_000_000,
      date: '2024-01-02',
    })
  })

  it('rejects invalid date-only payloads and URL/body id mismatches', async () => {
    const snapshot = createSampleSnapshot('2024-01-02')
    await postWithGeneration('/api/budget/import').send(snapshot).expect(201)

    const invalidDate = await putWithGeneration('/api/transactions/expense-1').send({
      id: 'expense-1', description: 'Invalid date', categoryId: 'food', amount: 10, date: '2024-02-30',
    })
    expect(invalidDate.status).toBe(400)

    const idMismatch = await putWithGeneration('/api/transactions/expense-1').send({
      id: 'different-id', description: 'Mismatch', categoryId: 'food', amount: 10, date: '2024-01-02',
    })
    expect(idMismatch.status).toBe(400)
    expect(idMismatch.body.error.code).toBe('ID_MISMATCH')
  })
})

function postWithGeneration(path: string, dataGeneration = 0) {
  return request(app).post(path).set('x-kinsen-data-generation', String(dataGeneration))
}

function putWithGeneration(path: string, dataGeneration = 0) {
  return request(app).put(path).set('x-kinsen-data-generation', String(dataGeneration))
}

function deleteWithGeneration(path: string, dataGeneration = 0) {
  return request(app).delete(path).set('x-kinsen-data-generation', String(dataGeneration))
}

function sortedSnapshot(snapshot: BudgetSnapshot): BudgetSnapshot {
  return {
    ...snapshot,
    categories: [...snapshot.categories].sort((a, b) => a.id.localeCompare(b.id)),
    plannedExpenses: [...snapshot.plannedExpenses].sort((a, b) => a.id.localeCompare(b.id)),
    transactions: [...snapshot.transactions].sort((a, b) => a.id.localeCompare(b.id)),
  }
}

describe('protected gold prices API', () => {
  const prices: GoldPriceResponse = {
    source: 'logammulia', fetchedAt: '2026-10-09T00:00:00.000Z',
    quotes: [{
      source: 'logammulia', materialType: 'Emas Batangan', weightGrams: '5', lineKey: '',
      displayName: 'Logam Mulia', sellPrice: 12600000, recordedDate: '2026-10-09',
    }],
  }

  it('denies anonymous and non-owner callers before invoking the reader', async () => {
    const getPrices = vi.fn().mockResolvedValue(prices)
    app = createApiApp(new SqliteBudgetRepository(database), testAuth, undefined, { getPrices })
    await request(app).get('/api/gold-prices?source=logammulia').set('x-test-user', 'anonymous').expect(401)
    await request(app).get('/api/budget').expect(200)
    await request(app).get('/api/gold-prices?source=logammulia').set('x-test-user', 'user_other').expect(403)
    expect(getPrices).not.toHaveBeenCalled()
  })

  it.each([
    '/api/gold-prices', '/api/gold-prices?source=kursdolar',
    '/api/gold-prices?source=LOGAMMULIA', '/api/gold-prices?source=',
    '/api/gold-prices?source=logammulia&source=galeri24',
    '/api/gold-prices?source[]=logammulia',
    '/api/gold-prices?source=https%3A%2F%2Fexample.com',
  ])('rejects invalid source query values without fetching: %s', async (url) => {
    const getPrices = vi.fn().mockResolvedValue(prices)
    app = createApiApp(new SqliteBudgetRepository(database), testAuth, undefined, { getPrices })
    const response = await request(app).get(url).expect(400)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
    expect(getPrices).not.toHaveBeenCalled()
  })

  it('serves authenticated no-store quotes without a generation header or budget changes', async () => {
    const repository = new SqliteBudgetRepository(database)
    repository.importIfEmpty(createSampleSnapshot('2024-01-02'))
    const getPrices = vi.fn().mockResolvedValue(prices)
    app = createApiApp(repository, testAuth, undefined, { getPrices })
    const before = (await request(app).get('/api/budget').expect(200)).body
    const response = await request(app).get('/api/gold-prices?source=logammulia').expect(200)
    expect(response.body).toEqual(prices)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(getPrices).toHaveBeenCalledExactlyOnceWith('logammulia')
    expect((await request(app).get('/api/budget').expect(200)).body).toEqual(before)
  })

  it('claims an unclaimed owner just like other protected GET routes', async () => {
    const getPrices = vi.fn().mockResolvedValue(prices)
    app = createApiApp(new SqliteBudgetRepository(database), testAuth, undefined, { getPrices })
    await request(app).get('/api/gold-prices?source=logammulia').set('x-test-user', 'first_owner').expect(200)
    await request(app).get('/api/budget').set('x-test-user', 'user_other').expect(403)
    await request(app).get('/api/budget').set('x-test-user', 'first_owner').expect(200)
  })

  it.each([
    [502, 'GOLD_PRICE_UNAVAILABLE', 'Gold prices are currently unavailable.'],
    [504, 'GOLD_PRICE_TIMEOUT', 'Gold price request timed out.'],
  ] as const)('preserves structured provider error %s', async (status, code, message) => {
    const getPrices = vi.fn().mockRejectedValue(new HttpError(status, code, message))
    app = createApiApp(new SqliteBudgetRepository(database), testAuth, undefined, { getPrices })
    const response = await request(app).get('/api/gold-prices?source=logammulia').expect(status)
    expect(response.body).toEqual({ error: { code, message } })
  })
})
