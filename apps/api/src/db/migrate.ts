import { openDatabase } from './database.js'

const database = openDatabase()
database.close()
console.log('Kinsen SQLite schema is current.')
