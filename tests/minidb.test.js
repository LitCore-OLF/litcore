/**
 * tests/minidb.test.js
 * Unit tests for the MiniDB embedded flat-file database.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MiniDB, getMiniDB, closeMiniDB } from '../src/minidb.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, '__minidb_test__.json');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function freshDB() {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  closeMiniDB(TEST_DB_PATH);
  return new MiniDB(TEST_DB_PATH);
}

function cleanup() {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  if (fs.existsSync(`${TEST_DB_PATH}.tmp`)) fs.unlinkSync(`${TEST_DB_PATH}.tmp`);
  closeMiniDB(TEST_DB_PATH);
}

// ─── Test Suites ─────────────────────────────────────────────────────────────

describe('MiniDB — load / save', () => {
  after(cleanup);

  it('starts with empty tables when file does not exist', () => {
    const db = freshDB();
    assert.deepEqual(db.find('books'), []);
    assert.deepEqual(db.find('authors'), []);
    assert.deepEqual(db.find('book_versions'), []);
    assert.deepEqual(db.find('translations'), []);
  });

  it('save() writes a valid JSON file to disk', () => {
    const db = freshDB();
    db.insert('books', { slug: 'test-book', title: 'Test Book', author: 'Tester' });
    db.save();

    assert.ok(fs.existsSync(TEST_DB_PATH), 'Database file should exist after save()');
    const raw = fs.readFileSync(TEST_DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    assert.ok(Array.isArray(parsed.books), 'Parsed file should have a books array');
    assert.equal(parsed.books.length, 1);
  });

  it('load() restores data from disk', () => {
    // Save with one DB instance
    const db1 = freshDB();
    db1.insert('books', { slug: 'persist-book', title: 'Persist Book', author: 'Author A' });
    db1.save();

    // Load with a fresh instance
    const db2 = new MiniDB(TEST_DB_PATH).load();
    const found = db2.findOne('books', (b) => b.slug === 'persist-book');
    assert.ok(found !== null, 'Should restore persisted book');
    assert.equal(found.title, 'Persist Book');
  });

  it('saveAsync() persists data asynchronously', async () => {
    const db = freshDB();
    db.insert('authors', { name: 'Async Author', bio: 'Testing async save' });
    await db.saveAsync();

    const db2 = new MiniDB(TEST_DB_PATH).load();
    const found = db2.findOne('authors', (a) => a.name === 'Async Author');
    assert.ok(found !== null, 'Async-saved author should be restorable');
  });
});

describe('MiniDB — insert', () => {
  after(cleanup);

  it('auto-generates id (UUID) and createdAt when not provided', () => {
    const db = freshDB();
    const record = db.insert('books', { slug: 'auto-id', title: 'Auto ID Book', author: 'Auto' });

    assert.ok(typeof record.id === 'string' && record.id.length > 0, 'Should generate a UUID id');
    assert.ok(typeof record.createdAt === 'string', 'Should generate createdAt');
  });

  it('preserves user-provided id', () => {
    const db = freshDB();
    const record = db.insert('books', { id: 'my-custom-id', slug: 'custom', title: 'Custom ID', author: 'Me' });
    assert.equal(record.id, 'my-custom-id');
  });

  it('merges schema defaults for missing fields', () => {
    const db = freshDB();
    const record = db.insert('books', { slug: 'defaults-test', title: 'Defaults', author: 'Test' });

    assert.equal(record.language, 'en', 'Should default language to "en"');
    assert.equal(record.featured, false, 'Should default featured to false');
  });

  it('inserts multiple records independently', () => {
    const db = freshDB();
    db.insert('books', { slug: 'book-1', title: 'Book 1', author: 'A' });
    db.insert('books', { slug: 'book-2', title: 'Book 2', author: 'B' });
    db.insert('books', { slug: 'book-3', title: 'Book 3', author: 'C' });

    assert.equal(db.count('books'), 3);
  });

  it('auto-generates updatedAt for tables that have it in the schema', () => {
    const db = freshDB();
    const record = db.insert('books', { slug: 'upd-at', title: 'Updated At', author: 'Test' });
    assert.ok(typeof record.updatedAt === 'string', 'books table should have updatedAt');
  });
});

describe('MiniDB — find / findOne / findById', () => {
  let db;

  before(() => {
    db = freshDB();
    db.insert('books', { id: 'id-a', slug: 'deenyat', title: 'Deenyat', author: 'Thanwi', language: 'ur', featured: true });
    db.insert('books', { id: 'id-b', slug: 'quran-en', title: 'Quran (English)', author: 'Various', language: 'en' });
    db.insert('books', { id: 'id-c', slug: 'naseem-saba', title: 'Naseem e Saba', author: 'Iqbal', language: 'ur' });
  });

  after(cleanup);

  it('find() with no predicate returns all records', () => {
    assert.equal(db.find('books').length, 3);
  });

  it('find() with predicate filters correctly', () => {
    const urdu = db.find('books', (b) => b.language === 'ur');
    assert.equal(urdu.length, 2);
  });

  it('findOne() returns the first match', () => {
    const found = db.findOne('books', (b) => b.slug === 'deenyat');
    assert.ok(found !== null);
    assert.equal(found.title, 'Deenyat');
  });

  it('findOne() returns null for no match', () => {
    const found = db.findOne('books', (b) => b.slug === 'nonexistent');
    assert.equal(found, null);
  });

  it('findById() returns correct record', () => {
    const found = db.findById('books', 'id-b');
    assert.ok(found !== null);
    assert.equal(found.slug, 'quran-en');
  });

  it('findById() returns null for unknown id', () => {
    assert.equal(db.findById('books', 'not-an-id'), null);
  });

  it('count() returns the correct number of filtered records', () => {
    assert.equal(db.count('books', (b) => b.featured === true), 1);
  });
});

describe('MiniDB — update', () => {
  let db;

  before(() => {
    db = freshDB();
    db.insert('books', { id: 'up-1', slug: 'update-me', title: 'Old Title', author: 'Old Author', language: 'en' });
    db.insert('books', { id: 'up-2', slug: 'leave-me', title: 'Leave Me', author: 'Stay', language: 'en' });
  });

  after(cleanup);

  it('update() modifies matching records and returns count', () => {
    const count = db.update('books', (b) => b.slug === 'update-me', { title: 'New Title', author: 'New Author' });
    assert.equal(count, 1);
    const updated = db.findById('books', 'up-1');
    assert.equal(updated.title, 'New Title');
    assert.equal(updated.author, 'New Author');
  });

  it('update() does not modify non-matching records', () => {
    const unaffected = db.findById('books', 'up-2');
    assert.equal(unaffected.title, 'Leave Me');
  });

  it('updateById() updates a single record by id', () => {
    const count = db.updateById('books', 'up-1', { featured: true });
    assert.equal(count, 1);
    assert.equal(db.findById('books', 'up-1').featured, true);
  });

  it('updateById() returns 0 for unknown id', () => {
    assert.equal(db.updateById('books', 'ghost-id', { title: 'Ghost' }), 0);
  });

  it('update() refreshes updatedAt timestamp', () => {
    const before = db.findById('books', 'up-1').updatedAt;
    // Small sleep to ensure timestamp changes
    const start = Date.now();
    while (Date.now() - start < 5) {} // busy-wait 5ms
    db.updateById('books', 'up-1', { language: 'ur' });
    const after = db.findById('books', 'up-1').updatedAt;
    assert.notEqual(before, after, 'updatedAt should change on update');
  });
});

describe('MiniDB — delete', () => {
  let db;

  before(() => {
    db = freshDB();
    db.insert('books', { id: 'del-1', slug: 'delete-me', title: 'Delete Me', author: 'Doomed', language: 'en' });
    db.insert('books', { id: 'del-2', slug: 'survive', title: 'Survivor', author: 'Lucky', language: 'en' });
    db.insert('books', { id: 'del-3', slug: 'also-delete', title: 'Also Delete', author: 'Doomed', language: 'ur' });
  });

  after(cleanup);

  it('delete() removes matching records and returns count', () => {
    const count = db.delete('books', (b) => b.author === 'Doomed');
    assert.equal(count, 2);
    assert.equal(db.count('books'), 1);
  });

  it('delete() leaves non-matching records intact', () => {
    const survivor = db.findOne('books', (b) => b.slug === 'survive');
    assert.ok(survivor !== null);
  });

  it('deleteById() removes exact record', () => {
    db.insert('books', { id: 'temp-del', slug: 'temp', title: 'Temp', author: 'X', language: 'en' });
    const count = db.deleteById('books', 'temp-del');
    assert.equal(count, 1);
    assert.equal(db.findById('books', 'temp-del'), null);
  });

  it('deleteById() returns 0 for unknown id', () => {
    assert.equal(db.deleteById('books', 'phantom'), 0);
  });
});

describe('MiniDB — LitCore-specific methods', () => {
  let db;

  before(() => {
    db = freshDB();
  });

  after(cleanup);

  it('upsertBook() inserts a new book if slug does not exist', () => {
    const record = db.upsertBook({ slug: 'new-book', title: 'New Book', author: 'Test' });
    assert.ok(record !== null);
    assert.equal(db.count('books'), 1);
  });

  it('upsertBook() updates existing book on repeated call', () => {
    db.upsertBook({ slug: 'new-book', title: 'Updated Title', author: 'Test' });
    assert.equal(db.count('books'), 1, 'Should not create duplicate');
    const found = db.findOne('books', (b) => b.slug === 'new-book');
    assert.equal(found.title, 'Updated Title');
  });

  it('addBookVersion() records a version for a book', () => {
    const book = db.findOne('books', (b) => b.slug === 'new-book');
    const version = db.addBookVersion(book.id, {
      version: '1.0.0',
      commitHash: 'abc123def456',
      message: 'Initial version',
      olfPath: 'data/books/new-book.olf',
      cachePath: 'data/cache/new-book.json',
      sizeBytes: 4096
    });
    assert.ok(version !== null);
    assert.equal(version.version, '1.0.0');
    assert.equal(version.bookId, book.id);
  });

  it('getLatestVersion() retrieves the most recent version', () => {
    const book = db.findOne('books', (b) => b.slug === 'new-book');
    // Add a second version
    db.addBookVersion(book.id, {
      version: '1.1.0',
      commitHash: 'fff000',
      message: 'Updated version',
      olfPath: 'data/books/new-book.olf',
      cachePath: 'data/cache/new-book.json',
      sizeBytes: 4200
    });

    const latest = db.getLatestVersion(book.id);
    assert.ok(latest !== null);
    assert.equal(latest.version, '1.1.0');
  });

  it('getBookVersion() retrieves a specific version by tag', () => {
    const book = db.findOne('books', (b) => b.slug === 'new-book');
    const v = db.getBookVersion(book.id, '1.0.0');
    assert.ok(v !== null);
    assert.equal(v.version, '1.0.0');
  });

  it('getBookVersion() retrieves by commit hash prefix', () => {
    const book = db.findOne('books', (b) => b.slug === 'new-book');
    const v = db.getBookVersion(book.id, 'abc123');
    assert.ok(v !== null);
    assert.equal(v.commitHash, 'abc123def456');
  });

  it('addTranslation() links two books as parent/child', () => {
    const parent = db.insert('books', { slug: 'original-ur', title: 'Original (Urdu)', author: 'Sheikh', language: 'ur' });
    const child = db.insert('books', { slug: 'translation-en', title: 'Translation (English)', author: 'Translator', language: 'en' });

    const t = db.addTranslation(parent.id, child.id, {
      parentLanguage: 'ur',
      childLanguage: 'en',
      translatorName: 'John Doe'
    });
    assert.ok(t !== null);
    assert.equal(t.parentBookId, parent.id);
    assert.equal(t.childBookId, child.id);
  });

  it('addTranslation() prevents duplicate translation entries', () => {
    const translations = db.find('translations');
    const parent = translations[0];
    const childId = parent.childBookId;
    const parentId = parent.parentBookId;

    // Call again with same pair
    const t2 = db.addTranslation(parentId, childId, { parentLanguage: 'ur', childLanguage: 'en' });
    assert.equal(db.count('translations'), 1, 'Should not create duplicate translation');
    assert.equal(t2.id, parent.id, 'Should return existing translation');
  });

  it('getTranslations() returns translations for a book (as parent or child)', () => {
    const parent = db.findOne('books', (b) => b.slug === 'original-ur');
    const ts = db.getTranslations(parent.id);
    assert.equal(ts.length, 1);
  });
});

describe('MiniDB — getMiniDB singleton factory', () => {
  after(cleanup);

  it('getMiniDB() returns the same instance for the same path', () => {
    cleanup();
    const db1 = getMiniDB(TEST_DB_PATH);
    const db2 = getMiniDB(TEST_DB_PATH);
    assert.strictEqual(db1, db2, 'Should return same singleton instance');
  });

  it('closeMiniDB() allows a new instance to be created', () => {
    const db1 = getMiniDB(TEST_DB_PATH);
    closeMiniDB(TEST_DB_PATH);
    const db2 = getMiniDB(TEST_DB_PATH);
    assert.notStrictEqual(db1, db2, 'Should create a fresh instance after close');
  });
});

describe('MiniDB — stats / dump / clearTable', () => {
  after(cleanup);

  it('stats() returns row counts per table', () => {
    const db = freshDB();
    db.insert('books', { slug: 'stat-book', title: 'Stats', author: 'Test' });
    db.insert('authors', { name: 'Stat Author' });
    const s = db.stats();
    assert.equal(s.books, 1);
    assert.equal(s.authors, 1);
    assert.equal(s.translations, 0);
    assert.equal(s.book_versions, 0);
  });

  it('dump() returns a deep clone of data (mutations do not affect DB)', () => {
    const db = freshDB();
    db.insert('books', { slug: 'dump-book', title: 'Dump Test', author: 'Test' });
    const d = db.dump();
    d.books[0].title = 'Mutated';
    assert.equal(db.findOne('books', (b) => b.slug === 'dump-book').title, 'Dump Test', 'DB should be unaffected');
  });

  it('clearTable() empties a table without affecting others', () => {
    const db = freshDB();
    db.insert('books', { slug: 'clear-book', title: 'Clear Test', author: 'Test' });
    db.insert('authors', { name: 'Clear Author' });
    db.clearTable('books');
    assert.equal(db.count('books'), 0);
    assert.equal(db.count('authors'), 1, 'Authors table should be unaffected');
  });
});
