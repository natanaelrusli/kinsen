import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const schemaV1 = `
  CREATE TABLE budget_period (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    id TEXT NOT NULL UNIQUE,
    total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
    reserve_amount INTEGER NOT NULL CHECK (reserve_amount >= 0),
    flexible_allocation INTEGER NOT NULL CHECK (flexible_allocation >= 0),
    planned_allocation INTEGER NOT NULL CHECK (planned_allocation >= 0),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1))
  );
  CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('DAILY', 'PERIOD', 'SCHEDULED')),
    bucket TEXT NOT NULL CHECK (bucket IN ('FLEXIBLE', 'PLANNED')),
    allocation INTEGER NOT NULL CHECK (allocation >= 0),
    color TEXT NOT NULL,
    default_cadence TEXT CHECK (default_cadence IN ('WEEKLY', 'MONTHLY') OR default_cadence IS NULL)
  );
  CREATE TABLE planned_expenses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    amount INTEGER NOT NULL CHECK (amount > 0),
    due_date TEXT NOT NULL,
    cadence TEXT CHECK (cadence IN ('WEEKLY', 'MONTHLY') OR cadence IS NULL),
    end_date TEXT
  );
  CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    category_id TEXT NOT NULL REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    amount INTEGER NOT NULL CHECK (amount > 0),
    date TEXT NOT NULL,
    planned_expense_id TEXT REFERENCES planned_expenses(id) ON UPDATE CASCADE ON DELETE SET NULL,
    planned_occurrence_date TEXT,
    CHECK ((planned_expense_id IS NULL AND planned_occurrence_date IS NULL) OR (planned_expense_id IS NOT NULL AND planned_occurrence_date IS NOT NULL))
  );
  CREATE INDEX planned_expenses_category_idx ON planned_expenses(category_id);
  CREATE INDEX transactions_category_idx ON transactions(category_id);
  CREATE INDEX transactions_planned_expense_idx ON transactions(planned_expense_id);
`

const schemaV2 = `
  CREATE TABLE app_owner (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    user_id TEXT NOT NULL UNIQUE
  );
`
const schemaV3 = `
  ALTER TABLE app_owner ADD COLUMN data_generation INTEGER NOT NULL DEFAULT 0 CHECK (data_generation >= 0);
`


export function migrateDatabase(database: DatabaseSync): void {
  database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
  const row = database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number | null }
  let version = row.version ?? 0
  if (version < 1) {
    applyMigration(database, 1, schemaV1)
    version = 1
  }
  if (version < 2) applyMigration(database, 2, schemaV2)

  if (version < 3) applyMigration(database, 3, schemaV3)
}

function applyMigration(database: DatabaseSync, version: number, schema: string): void {
  database.exec('BEGIN IMMEDIATE')
  try {
    database.exec(schema)
    database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString())
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

export function openDatabase(location = process.env.DATABASE_PATH ?? 'data/kinsen.sqlite'): DatabaseSync {
  const filePath = location === ':memory:' ? location : isAbsolute(location) ? location : resolve(process.cwd(), location)
  if (filePath !== ':memory:') mkdirSync(dirname(filePath), { recursive: true })
  const database = new DatabaseSync(filePath)
  database.exec('PRAGMA foreign_keys = ON')
  if (filePath !== ':memory:') database.exec('PRAGMA journal_mode = WAL')
  migrateDatabase(database)
  return database
}
