/**
 * MiniDB — Lightweight Pure-JS Embedded Flat-File Database for LitCore
 *
 * Zero external dependencies. Uses a single JSON file on disk as storage.
 * Designed for the LitCore registry to manage:
 *   - authors     (publisher / author profiles)
 *   - books       (canonical volume index)
 *   - book_versions (historical OLF commit + compiled AST snapshot)
 *   - translations  (parent/child language mapping)
 *
 * All write operations are atomic: data is written to a temp file then
 * renamed into place, preventing corruption on crash mid-write.
 *
 * Usage (Node ESM):
 *   import { MiniDB } from './minidb.js';
 *   const db = new MiniDB('/path/to/store.json');
 *   db.load();
 *   db.insert('books', { id: 'deenyat', title: 'Deenyat', author: 'Ashraf Ali Thanwi' });
 *   const book = db.findOne('books', r => r.id === 'deenyat');
 *   db.save();
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// ─── Built-in Table Schemas ──────────────────────────────────────────────────
// Defines which tables exist. Unknown tables can still be used — schemas just
// define the defaults applied to new records if a field is missing.

const TABLE_SCHEMAS = {
  authors: {
    id: null,
    name: '',
    bio: '',
    githubHandle: '',
    website: '',
    createdAt: null
  },
  books: {
    id: null,
    slug: '',
    title: '',
    author: '',
    authorId: null,
    language: 'en',
    type: 'prose',
    featured: false,
    githubUrl: '',
    latestVersion: '1.0.0',
    createdAt: null,
    updatedAt: null
  },
  book_versions: {
    id: null,
    bookId: null,
    version: '',
    commitHash: '',
    message: '',
    olfPath: '',
    cachePath: '',
    sizeBytes: 0,
    createdAt: null
  },
  translations: {
    id: null,
    parentBookId: null,
    childBookId: null,
    parentLanguage: '',
    childLanguage: '',
    translatorName: '',
    createdAt: null
  }
};

// ─── MiniDB Class ────────────────────────────────────────────────────────────

export class MiniDB {
  /**
   * @param {string} dbPath - Absolute path to the JSON database file.
   */
  constructor(dbPath) {
    this._dbPath = dbPath;
    this._data = {};

    // Initialize empty tables from schema
    for (const table of Object.keys(TABLE_SCHEMAS)) {
      this._data[table] = [];
    }
  }

  // ── Disk I/O ──────────────────────────────────────────────────────────────

  /**
   * Load the database from disk. If the file doesn't exist, starts with empty tables.
   * Call this once at startup before any queries.
   */
  load() {
    try {
      if (fs.existsSync(this._dbPath)) {
        const raw = fs.readFileSync(this._dbPath, 'utf8');
        const parsed = JSON.parse(raw);

        // Merge persisted tables with schema defaults (forward-compat)
        for (const table of Object.keys(TABLE_SCHEMAS)) {
          this._data[table] = Array.isArray(parsed[table]) ? parsed[table] : [];
        }

        // Preserve any extra tables not in schema (extensible)
        for (const table of Object.keys(parsed)) {
          if (!this._data[table]) {
            this._data[table] = Array.isArray(parsed[table]) ? parsed[table] : [];
          }
        }
      }
    } catch (err) {
      console.error(`[MiniDB] Failed to load database from ${this._dbPath}: ${err.message}`);
    }
    return this;
  }

  /**
   * Persist the database to disk atomically (temp-file + rename).
   * Safe to call synchronously — uses writeFileSync with temp file rename.
   */
  save() {
    try {
      const dir = path.dirname(this._dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tempPath = `${this._dbPath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this._data, null, 2), 'utf8');
      fs.renameSync(tempPath, this._dbPath);
    } catch (err) {
      console.error(`[MiniDB] Failed to save database to ${this._dbPath}: ${err.message}`);
      throw err;
    }
    return this;
  }

  /**
   * Async version of save() for use inside async server routes.
   */
  async saveAsync() {
    const dir = path.dirname(this._dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${this._dbPath}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(this._data, null, 2), 'utf8');
    await fs.promises.rename(tempPath, this._dbPath);
    return this;
  }

  // ── Table Initialization ──────────────────────────────────────────────────

  /**
   * Ensure a custom table exists (creates it if missing).
   * @param {string} table
   */
  ensureTable(table) {
    if (!Array.isArray(this._data[table])) {
      this._data[table] = [];
    }
    return this;
  }

  // ── CRUD Operations ───────────────────────────────────────────────────────

  /**
   * Insert a new record into a table.
   * Auto-generates `id` (UUID) and `createdAt` timestamp if not provided.
   *
   * @param {string} table - Table name.
   * @param {object} record - The record data.
   * @returns {object} The inserted record (with generated id and timestamps).
   */
  insert(table, record) {
    this.ensureTable(table);

    const schema = TABLE_SCHEMAS[table] || {};
    const now = new Date().toISOString();

    const row = {
      ...schema,
      ...record,
      id: record.id ?? randomUUID(),
      createdAt: record.createdAt ?? now
    };

    // Add updatedAt if the schema supports it
    if ('updatedAt' in schema && !row.updatedAt) {
      row.updatedAt = now;
    }

    this._data[table].push(row);
    return row;
  }

  /**
   * Find all records in a table matching a predicate.
   *
   * @param {string} table
   * @param {function(record): boolean} [queryFn] - Optional filter function. Omit to return all.
   * @returns {Array<object>}
   */
  find(table, queryFn = null) {
    const rows = this._data[table] ?? [];
    return queryFn ? rows.filter(queryFn) : [...rows];
  }

  /**
   * Find the first record matching a predicate.
   *
   * @param {string} table
   * @param {function(record): boolean} queryFn
   * @returns {object|null}
   */
  findOne(table, queryFn) {
    const rows = this._data[table] ?? [];
    return rows.find(queryFn) ?? null;
  }

  /**
   * Find a record by its `id` field.
   *
   * @param {string} table
   * @param {string} id
   * @returns {object|null}
   */
  findById(table, id) {
    return this.findOne(table, (r) => r.id === id);
  }

  /**
   * Update all records matching a predicate.
   * Merges the provided `updates` object into each matched record.
   * Automatically updates `updatedAt` if the table schema has it.
   *
   * @param {string} table
   * @param {function(record): boolean} queryFn
   * @param {object} updates
   * @returns {number} Number of records updated.
   */
  update(table, queryFn, updates) {
    const rows = this._data[table] ?? [];
    const schema = TABLE_SCHEMAS[table] || {};
    const now = new Date().toISOString();
    let count = 0;

    for (let i = 0; i < rows.length; i++) {
      if (queryFn(rows[i])) {
        const updatedAt = 'updatedAt' in schema ? { updatedAt: now } : {};
        rows[i] = { ...rows[i], ...updates, ...updatedAt };
        count++;
      }
    }
    return count;
  }

  /**
   * Update a record by its `id`.
   *
   * @param {string} table
   * @param {string} id
   * @param {object} updates
   * @returns {number} 1 if updated, 0 if not found.
   */
  updateById(table, id, updates) {
    return this.update(table, (r) => r.id === id, updates);
  }

  /**
   * Delete all records matching a predicate.
   *
   * @param {string} table
   * @param {function(record): boolean} queryFn
   * @returns {number} Number of records deleted.
   */
  delete(table, queryFn) {
    const rows = this._data[table] ?? [];
    const before = rows.length;
    this._data[table] = rows.filter((r) => !queryFn(r));
    return before - this._data[table].length;
  }

  /**
   * Delete a record by its `id`.
   *
   * @param {string} table
   * @param {string} id
   * @returns {number} 1 if deleted, 0 if not found.
   */
  deleteById(table, id) {
    return this.delete(table, (r) => r.id === id);
  }

  /**
   * Count records in a table matching an optional predicate.
   *
   * @param {string} table
   * @param {function(record): boolean} [queryFn]
   * @returns {number}
   */
  count(table, queryFn = null) {
    return this.find(table, queryFn).length;
  }

  // ── LitCore-Specific Convenience Methods ──────────────────────────────────

  /**
   * Upsert a book record: insert if not present, update if slug already exists.
   *
   * @param {object} bookData - Must include `slug` field.
   * @returns {object} The upserted record.
   */
  upsertBook(bookData) {
    const existing = this.findOne('books', (b) => b.slug === bookData.slug);
    if (existing) {
      this.update('books', (b) => b.slug === bookData.slug, bookData);
      return this.findOne('books', (b) => b.slug === bookData.slug);
    }
    return this.insert('books', bookData);
  }

  /**
   * Record a new version commit for a book.
   *
   * @param {string} bookId - The book's UUID (not slug).
   * @param {object} versionData - { version, commitHash, message, olfPath, cachePath, sizeBytes }
   * @returns {object} The inserted version record.
   */
  addBookVersion(bookId, versionData) {
    return this.insert('book_versions', {
      bookId,
      ...versionData
    });
  }

  /**
   * Get the latest version record for a book.
   *
   * @param {string} bookId
   * @returns {object|null}
   */
  getLatestVersion(bookId) {
    const rows = this._data['book_versions'] ?? [];
    // Filter and keep original indices for stable "last inserted" tiebreaking
    const indexed = rows
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => v.bookId === bookId);
    if (indexed.length === 0) return null;
    indexed.sort((a, b) => {
      const diff = new Date(b.v.createdAt) - new Date(a.v.createdAt);
      return diff !== 0 ? diff : b.i - a.i; // later index wins on equal timestamp
    });
    return indexed[0].v;
  }

  /**
   * Get a specific named version (e.g. '1.0.0' or a commit hash prefix) for a book.
   *
   * @param {string} bookId
   * @param {string} tag - version string or commit hash prefix
   * @returns {object|null}
   */
  getBookVersion(bookId, tag) {
    return (
      this.findOne(
        'book_versions',
        (v) =>
          v.bookId === bookId &&
          (v.version === tag || (v.commitHash && v.commitHash.startsWith(tag)))
      ) ?? null
    );
  }

  /**
   * Get all translations for a book (both as parent and as child).
   *
   * @param {string} bookId
   * @returns {Array<object>}
   */
  getTranslations(bookId) {
    return this.find(
      'translations',
      (t) => t.parentBookId === bookId || t.childBookId === bookId
    );
  }

  /**
   * Register a translation relationship between two books.
   *
   * @param {string} parentBookId
   * @param {string} childBookId
   * @param {object} meta - { parentLanguage, childLanguage, translatorName }
   * @returns {object} The inserted translation record.
   */
  addTranslation(parentBookId, childBookId, meta = {}) {
    // Prevent duplicates
    const existing = this.findOne(
      'translations',
      (t) => t.parentBookId === parentBookId && t.childBookId === childBookId
    );
    if (existing) return existing;
    return this.insert('translations', { parentBookId, childBookId, ...meta });
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  /**
   * Clear all records from a specific table (destructive).
   * @param {string} table
   */
  clearTable(table) {
    this._data[table] = [];
    return this;
  }

  /**
   * Return a summary of row counts per table for debugging.
   * @returns {object}
   */
  stats() {
    const result = {};
    for (const [table, rows] of Object.entries(this._data)) {
      result[table] = Array.isArray(rows) ? rows.length : 0;
    }
    return result;
  }

  /**
   * Export the raw in-memory data (read-only snapshot).
   * @returns {object}
   */
  dump() {
    return JSON.parse(JSON.stringify(this._data));
  }
}

// ─── Singleton Factory ───────────────────────────────────────────────────────
// Optional: create a module-level singleton keyed by path for shared access.

const _instances = new Map();

/**
 * Get (or create) a loaded MiniDB instance for a given path.
 * Subsequent calls with the same path return the same in-memory instance.
 *
 * @param {string} dbPath
 * @returns {MiniDB}
 */
export function getMiniDB(dbPath) {
  if (!_instances.has(dbPath)) {
    const db = new MiniDB(dbPath).load();
    _instances.set(dbPath, db);
  }
  return _instances.get(dbPath);
}

/**
 * Flush (evict) a singleton instance from the cache (useful in tests).
 * @param {string} dbPath
 */
export function closeMiniDB(dbPath) {
  _instances.delete(dbPath);
}
