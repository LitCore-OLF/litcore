import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listBooks, getBook, getChapter, getBlock, searchBook, registerBook } from '../../registry/src/lib/olf-db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve registry data root relative to this test file's location (cli/tests/)
const REGISTRY_DATA = path.resolve(__dirname, '../../registry/data');

test('Registry Flat-File DB Manager - Data Layer Operations', async () => {
  // Test loading the seeded 'deenyat' book
  const books = listBooks();
  assert.ok(books.length >= 1, 'Should load at least one book');
  
  const deenyat = await getBook('deenyat');
  assert.ok(deenyat, 'Should fetch deenyat book');
  assert.strictEqual(deenyat.title, 'Deenyat');
  assert.strictEqual(deenyat.author, "Maulana Abul A'la Maududi");
  assert.strictEqual(deenyat.language, 'ur');

  // Test chapter extraction
  const chapter1 = await getChapter('deenyat', 1);
  assert.ok(chapter1, 'Should find chapter 1');
  assert.strictEqual(chapter1.chapterIndex, 1);
  assert.ok(chapter1.blocks.length > 0, 'Chapter 1 should contain blocks');

  // Test block extraction
  const block1 = await getBlock('deenyat', 1, 1);
  assert.ok(block1, 'Should find block 1');
  assert.strictEqual(block1.blockIndex, 1);
  assert.match(block1.content, /اسلام کے لغوی معنی/);

  // Test search within book
  const searchResults = await searchBook('deenyat', 'اطاعت');
  assert.ok(searchResults.length > 0, 'Should find search results');
  assert.match(searchResults[0].content, /اطاعت/);

  // Test registering a new mock book
  const mockContent = `@title: Mock Novel
@author: Novel Writer
@lang: en
@type: prose
@version: 1.0.0

#chapter: 1
This is a mock novel paragraph.
`;
  await registerBook('mocknovel', mockContent, 'https://github.com/test/mock', false);

  const mockBook = await getBook('mocknovel');
  assert.ok(mockBook, 'Should fetch newly registered mock book');
  assert.strictEqual(mockBook.title, 'Mock Novel');
  assert.strictEqual(mockBook.githubUrl, 'https://github.com/test/mock');

  // Clean up registered mock book
  const manifestPath = path.join(REGISTRY_DATA, 'registry.json');
  const mockOlfPath = path.join(REGISTRY_DATA, 'books', 'mocknovel.olf');
  const cachePath = path.join(REGISTRY_DATA, 'cache', 'mocknovel.json');
  const minidbPath = path.join(REGISTRY_DATA, 'litcore_registry.json');

  if (fs.existsSync(mockOlfPath)) fs.unlinkSync(mockOlfPath);
  if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.books = manifest.books.filter((b) => b.id !== 'mocknovel');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  }
  // Remove mocknovel from MiniDB if it was written
  if (fs.existsSync(minidbPath)) {
    const db = JSON.parse(fs.readFileSync(minidbPath, 'utf8'));
    if (Array.isArray(db.books)) {
      const bookEntry = db.books.find((b) => b.slug === 'mocknovel');
      if (bookEntry) {
        db.books = db.books.filter((b) => b.slug !== 'mocknovel');
        db.book_versions = (db.book_versions || []).filter((v) => v.bookId !== bookEntry.id);
        fs.writeFileSync(minidbPath, JSON.stringify(db, null, 2), 'utf8');
      }
    }
  }
});
