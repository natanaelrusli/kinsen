import { SqliteBudgetRepository } from '../repositories/sqlite-budget-repository.js'
import { openDatabase } from './database.js'

const passedArgs = process.argv.slice(2)
const [option, targetUserId, ...extra] = passedArgs[0] === '--' ? passedArgs.slice(1) : passedArgs
if (option !== '--to-user-id' || !targetUserId || extra.length > 0) {
  throw new Error('Usage: pnpm --filter @kinsen/api db:transfer-owner -- --to-user-id user_<id>')
}

const database = openDatabase()
try {
  const transferred = new SqliteBudgetRepository(database).transferOwnerTo(targetUserId)
  console.log(transferred ? 'API ownership transferred; budget data was not changed.' : 'This Clerk account already owns the API budget.')
} finally {
  database.close()
}
