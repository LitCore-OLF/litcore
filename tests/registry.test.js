import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { compile, toSql, startServer } from '../src/index.js';

const tempTestDir = path.resolve('temp_registry_test');

function setupTempBook() {
  if (fs.existsSync(tempTestDir)) {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempTestDir, { recursive: true });

  const bookOlf = `@title: Test Registry Book
@author: Registry Tester
@lang: ar
@type: prose
@version: 2.1.0

#chapter: 1
This is block number one in chapter 1.

#section: Introductory Notes
This is block number two, which has some *italics* and 'single quotes' to escape.
`;
  fs.writeFileSync(path.join(tempTestDir, 'testbook.olf'), bookOlf, 'utf8');

  // Create local litcore.json manifest to test manifest-first load path
  const manifestContent = JSON.stringify({
    name: 'Test Registry Library',
    books: [
      { id: 'testbook', path: 'testbook.olf' }
    ]
  });
  fs.writeFileSync(path.join(tempTestDir, 'litcore.json'), manifestContent, 'utf8');
}

function cleanup() {
  if (fs.existsSync(tempTestDir)) {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
  }
}

test('SQL Exporter - Dialect Specific Generation Correctness', () => {
  setupTempBook();
  const olfPath = path.join(tempTestDir, 'testbook.olf');
  const content = fs.readFileSync(olfPath, 'utf8');
  const ast = compile(content, olfPath);

  // 1. PostgreSQL Dialect
  const pgSql = toSql(ast, 'testbook', 'postgres', true);
  assert.match(pgSql, /CREATE TABLE IF NOT EXISTS books/);
  assert.match(pgSql, /INSERT INTO books/);
  assert.match(pgSql, /ON CONFLICT \(id\) DO UPDATE SET/);
  assert.match(pgSql, /DELETE FROM structures WHERE book_id = 'testbook';/);
  assert.match(pgSql, /'\{\"type\":\"plaintext\",\"litcore_block_id\":\"b-[^"]+\"\}'::jsonb/); // postgres jsonb type casting
  assert.match(pgSql, /'single quotes'' to escape/); // double single-quotes escape

  // 2. MySQL Dialect
  const mySql = toSql(ast, 'testbook', 'mysql', true);
  assert.match(mySql, /ON DUPLICATE KEY UPDATE/);
  assert.match(mySql, /ENGINE=InnoDB/);
  assert.match(mySql, /`order` INT/); // MySQL escaped keyword
  assert.match(mySql, /'\{\"type\":\"plaintext\",\"litcore_block_id\":\"b-[^"]+\"\}'/); // regular JSON literal, no cast
  assert.doesNotMatch(mySql, /::jsonb/);

  // 3. SQLite Dialect
  const sqliteSql = toSql(ast, 'testbook', 'sqlite', true);
  assert.match(sqliteSql, /book_id TEXT/);
  assert.match(sqliteSql, /FOREIGN KEY \(book_id\) REFERENCES books/);
  assert.match(sqliteSql, /ON CONFLICT \(id\) DO UPDATE SET/);
  assert.doesNotMatch(sqliteSql, /ENGINE=InnoDB/);
  assert.doesNotMatch(sqliteSql, /::jsonb/);

  cleanup();
});

test('Developer Server - In-Memory DB & REST API Endpoints', async () => {
  setupTempBook();
  const port = 4123;
  const instance = startServer(tempTestDir, port);

  try {
    const baseUrl = `http://localhost:${port}`;

    // Test GET /api/books (list)
    const listRes = await fetch(`${baseUrl}/api/books`);
    assert.strictEqual(listRes.status, 200);
    assert.strictEqual(listRes.headers.get('access-control-allow-origin'), '*');
    const listData = await listRes.json();
    assert.strictEqual(listData.length, 1);
    assert.strictEqual(listData[0].id, 'testbook');
    assert.strictEqual(listData[0].title, 'Test Registry Book');
    assert.strictEqual(listData[0].author, 'Registry Tester');

    // Test GET /api/books/testbook (detail)
    const detailRes = await fetch(`${baseUrl}/api/books/testbook`);
    assert.strictEqual(detailRes.status, 200);
    const detailData = await detailRes.json();
    assert.strictEqual(detailData.id, 'testbook');
    assert.ok(detailData.structures.length >= 2);
    assert.ok(detailData.blocks.length >= 2);

    // Test GET /api/books/testbook/chapters/1 (chapter API)
    const chapRes = await fetch(`${baseUrl}/api/books/testbook/chapters/1`);
    assert.strictEqual(chapRes.status, 200);
    const chapData = await chapRes.json();
    assert.strictEqual(chapData.chapterIndex, 1);
    assert.strictEqual(chapData.blocks.length, 2);
    assert.strictEqual(chapData.structures.length, 2); // chapter, section

    // Test GET /api/books/testbook/chapters/1/blocks/1
    const blockRes1 = await fetch(`${baseUrl}/api/books/testbook/chapters/1/blocks/1`);
    assert.strictEqual(blockRes1.status, 200);
    const blockData1 = await blockRes1.json();
    assert.strictEqual(blockData1.blockIndex, 1);
    assert.match(blockData1.id, /^b-/);
    assert.strictEqual(blockData1.content, 'This is block number one in chapter 1.');

    // Test GET /api/books/testbook/chapters/1/blocks/2
    const blockRes2 = await fetch(`${baseUrl}/api/books/testbook/chapters/1/blocks/2`);
    assert.strictEqual(blockRes2.status, 200);
    const blockData2 = await blockRes2.json();
    assert.strictEqual(blockData2.blockIndex, 2);
    assert.match(blockData2.content, /single quotes/);

    // Test GET /api/books/testbook/search?q=italics (substring search)
    const searchRes = await fetch(`${baseUrl}/api/books/testbook/search?q=italics`);
    assert.strictEqual(searchRes.status, 200);
    const searchData = await searchRes.json();
    assert.strictEqual(searchData.length, 1);
    assert.match(searchData[0].content, /italics/);

    // Test 404 for missing book
    const missingRes = await fetch(`${baseUrl}/api/books/not-exist`);
    assert.strictEqual(missingRes.status, 404);

    // Test GET / (Serve Admin Dashboard HTML)
    const dashboardRes = await fetch(`${baseUrl}/`);
    assert.strictEqual(dashboardRes.status, 200);
    assert.strictEqual(dashboardRes.headers.get('content-type'), 'text/html');
    const dashboardHtml = await dashboardRes.text();
    assert.match(dashboardHtml, /LitCore Developer Portal/);

    // Test GET /api/books/:slug/export (SQL Export API)
    const exportRes = await fetch(`${baseUrl}/api/books/testbook/export?dialect=postgres&createTables=true`);
    assert.strictEqual(exportRes.status, 200);
    const exportData = await exportRes.json();
    assert.match(exportData.sql, /CREATE TABLE IF NOT EXISTS books/);
    assert.match(exportData.sql, /ON CONFLICT \(id\) DO UPDATE SET/);

    // Test POST /api/sandbox/compile (OLF Compiler Sandbox API)
    const compileRes = await fetch(`${baseUrl}/api/sandbox/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '@title: Sandbox Book\n#chapter: 1\nHello Sandbox!'
      })
    });
    assert.strictEqual(compileRes.status, 200);
    const compileData = await compileRes.json();
    assert.strictEqual(compileData.ast.metadata.title, 'Sandbox Book');
    assert.strictEqual(compileData.ast.body[1].content, 'Hello Sandbox!');

    // Test POST /api/sandbox/notion (Notion Ingest Sandbox API)
    const notionRes = await fetch(`${baseUrl}/api/sandbox/notion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            object: 'block',
            type: 'heading_1',
            heading_1: {
              rich_text: [{ plain_text: 'Notion Title' }]
            }
          }
        ]
      })
    });
    assert.strictEqual(notionRes.status, 200);
    const notionData = await notionRes.json();
    assert.match(notionData.olf, /#heading_1: Notion Title/);
    assert.strictEqual(notionData.ast.body[0].value, 'Notion Title');

    // Test POST /api/books/connect (Lightweight GitHub Ingestion API)
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (url.includes('litcore.json')) {
        return {
          status: 200,
          text: async () => JSON.stringify({
            name: 'Mock Repo Library',
            books: [{ id: 'gitbook', path: 'gitbook.olf' }]
          })
        };
      }
      if (url.includes('gitbook.olf')) {
        return {
          status: 200,
          text: async () => `@title: GitHub Book\n@author: Git Author\n@lang: en\n\n#chapter: 1\nHello from GitHub!`
        };
      }
      return originalFetch(url, options);
    };

    try {
      const connectRes = await fetch(`${baseUrl}/api/books/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: 'mock/repo',
          branch: 'main'
        })
      });
      assert.strictEqual(connectRes.status, 200);
      const connectData = await connectRes.json();
      assert.ok(connectData.success);
      assert.deepStrictEqual(connectData.connected, ['gitbook']);

      // Check if gitbook is now in list
      const listResAfter = await fetch(`${baseUrl}/api/books`);
      const listDataAfter = await listResAfter.json();
      const gitBook = listDataAfter.find(b => b.id === 'gitbook');
      assert.ok(gitBook);
      assert.strictEqual(gitBook.title, 'GitHub Book');
      assert.strictEqual(gitBook.githubUrl, 'https://github.com/mock/repo/blob/main/gitbook.olf');
    } finally {
      globalThis.fetch = originalFetch;
    }

  } finally {
    // Teardown server
    instance.close();
    cleanup();
  }
});
