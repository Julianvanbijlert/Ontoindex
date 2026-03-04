import sqlite3 from 'sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dbPath = join(__dirname, 'database.sqlite')

// Initialize SQLite Database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message)
    } else {
        console.log('Connected to the SQLite database.')
        db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    )`)

        db.run(`CREATE TABLE IF NOT EXISTS ontologies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      description TEXT,
      source_type TEXT,
      user_id INTEGER
    )`)

        // Alter table to add columns if they don't exist (SQLite doesn't support IF NOT EXISTS for ADD COLUMN easily, 
        // so we'll rely on the schema creation for new DBs, and catch errors for existing ones or do PRAGMA table_info).
        db.run(`CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ontology_id INTEGER,
      term TEXT,
      definition TEXT,
      type TEXT,
      related_terms TEXT,
      domain TEXT,
      notes TEXT,
      similar_terms TEXT,
      FOREIGN KEY(ontology_id) REFERENCES ontologies(id)
    )`, () => {
            // Attempt to add new columns to existing table
            db.run(`ALTER TABLE words ADD COLUMN domain TEXT`, () => { })
            db.run(`ALTER TABLE words ADD COLUMN notes TEXT`, () => { })
            db.run(`ALTER TABLE words ADD COLUMN similar_terms TEXT`, () => { })
        })
    }
})

// Helper functions for Promises
export const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err)
            else resolve(rows)
        })
    })
}

export const execute = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err)
            else resolve(this)
        })
    })
}

export default db
