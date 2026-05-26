import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { compile, toSql, notionBlocksToOlf } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminHtmlPath = path.join(__dirname, 'admin.html');

/**
 * Shared helper function to index structures and blocks of a book AST.
 * @param {string} bookId - Unique slug identifier.
 * @param {Object} ast - Compiled book JSON AST.
 * @param {string} filePath - Absolute path or URL to the book file.
 * @returns {Object} Indexed book model representation.
 */
function indexBook(bookId, ast, filePath) {
  const meta = ast.metadata || {};
  let chapterCount = 0;
  let sectionCount = 0;
  let blockCount = 0;
  let structureOrder = 0;
  
  const structures = [];
  const blocks = [];
  
  (ast.body || []).forEach((node) => {
    if (node.type === 'structure') {
      const order = structureOrder++;
      const id = randomUUID();
      
      if (node.name === 'chapter') {
        chapterCount++;
        sectionCount = 0;
      } else if (node.name === 'section') {
        sectionCount++;
      }
      
      structures.push({
        id,
        bookId,
        type: node.name,
        value: node.value,
        line: node.line,
        order,
        chapterIndex: chapterCount
      });
    } else if (node.type === 'block') {
      blockCount++;
      const id = randomUUID();
      const blockType = node.attributes.type || 'plaintext';
      
      blocks.push({
        id,
        bookId,
        chapterIndex: chapterCount || 1,
        sectionIndex: sectionCount,
        blockIndex: blockCount,
        type: blockType,
        attributes: node.attributes || {},
        content: node.content,
        line: node.line
      });
    }
  });

  return {
    id: bookId,
    title: meta.title || 'Untitled',
    author: meta.author || 'Unknown',
    language: meta.lang || 'en',
    type: meta.type || 'prose',
    version: meta.version || '1.0.0',
    filePath,
    ast,
    structures,
    blocks
  };
}

/**
 * Recursively scans directory for .olf files and compiles them in-memory.
 * Supports loading from a local litcore.json manifest.
 * @param {string} directory - Target directory to scan.
 * @returns {Object} Database object of indexed books.
 */
export function loadBooks(directory) {
  const books = {};
  const resolvedDir = path.resolve(directory);

  if (!fs.existsSync(resolvedDir)) {
    return books;
  }

  // 1. Check if local litcore.json manifest is present
  const manifestPath = path.join(resolvedDir, 'litcore.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifestContent = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);
      if (manifest && Array.isArray(manifest.books)) {
        console.log(`[LitCore Server] Found litcore.json manifest. Ingesting declared books...`);
        for (const bookEntry of manifest.books) {
          const relativePath = bookEntry.path;
          if (!relativePath) continue;
          
          const fullPath = path.resolve(resolvedDir, relativePath);
          if (!fs.existsSync(fullPath)) {
            console.error(`[LitCore Server] Manifest book file not found: ${relativePath}`);
            continue;
          }

          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const ast = compile(content, fullPath);
            const slug = path.basename(fullPath, '.olf').toLowerCase();
            const bookId = bookEntry.id || ast.metadata.id || slug;
            
            books[bookId] = indexBook(bookId, ast, fullPath);
          } catch (err) {
            console.error(`[LitCore Server] Failed to index book from manifest path ${relativePath}: ${err.message}`);
          }
        }
        return books; // Return early with manifest-loaded books only
      }
    } catch (err) {
      console.warn(`[LitCore Server] Failed to parse litcore.json manifest: ${err.message}. Falling back to directory scan.`);
    }
  }

  // 2. Fallback: Scan directory recursively for all .olf files
  const scanDir = (dir, depth = 0) => {
    if (depth > 10) return; // prevent infinite loops or excessively deep scanning

    let files;
    try {
      files = fs.readdirSync(dir);
    } catch (err) {
      return; // skip directories with insufficient read permissions
    }
    for (const file of files) {
      const fullPath = path.join(dir, file);
      let stat;
      try {
        stat = fs.lstatSync(fullPath);
      } catch (err) {
        continue; // skip broken links or unreadable files
      }

      if (stat.isSymbolicLink()) {
        continue; // skip junctions and symbolic links to prevent recursive cycles
      }

      if (stat.isDirectory()) {
        scanDir(fullPath, depth + 1);
      } else if (stat.isFile() && file.endsWith('.olf')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const ast = compile(content, fullPath);
          const slug = path.basename(file, '.olf').toLowerCase();
          
          const meta = ast.metadata || {};
          const bookId = meta.id || slug;

          books[bookId] = indexBook(bookId, ast, fullPath);
        } catch (err) {
          console.error(`[LitCore Server] Failed to index book ${file}: ${err.message}`);
        }
      }
    }
  };

  scanDir(resolvedDir);
  return books;
}

/**
 * Sends a structured JSON HTTP response.
 */
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

/**
 * Reads the request body asynchronously.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', err => {
      reject(err);
    });
  });
}

// Router pattern list mapping RegExp to handler functions
const routes = [
  // GET / (Admin UI dashboard)
  {
    method: 'GET',
    pattern: /^\/(index\.html)?\/?$/,
    handler: (req, res) => {
      try {
        if (!fs.existsSync(adminHtmlPath)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('Admin dashboard file (src/admin.html) not found.');
        }
        const html = fs.readFileSync(adminHtmlPath, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(html);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Failed to load admin panel: ${err.message}`);
      }
    }
  },
  // GET /api/books
  {
    method: 'GET',
    pattern: /^\/api\/books\/?$/,
    handler: (req, res, matches, booksDatabase) => {
      const list = Object.values(booksDatabase).map(b => ({
        id: b.id,
        title: b.title,
        author: b.author,
        language: b.language,
        type: b.type,
        version: b.version,
        filePath: b.filePath || null,
        githubUrl: b.githubUrl || null
      }));
      sendJson(res, 200, list);
    }
  },
  // POST /api/books/connect
  {
    method: 'POST',
    pattern: /^\/api\/books\/connect\/?$/,
    handler: async (req, res, matches, booksDatabase) => {
      try {
        const bodyStr = await readBody(req);
        let payload;
        try {
          payload = JSON.parse(bodyStr);
        } catch (e) {
          return sendJson(res, 400, { error: 'Invalid JSON payload' });
        }

        const repoInput = payload.repo || '';
        if (!repoInput) {
          return sendJson(res, 400, { error: 'Missing repository input' });
        }

        let owner = '';
        let repo = '';
        const branch = payload.branch || 'main';

        const urlMatch = repoInput.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (urlMatch) {
          owner = urlMatch[1];
          repo = urlMatch[2].replace(/\.git$/, '');
        } else {
          const parts = repoInput.split('/');
          if (parts.length >= 2) {
            owner = parts[0];
            repo = parts[1];
          }
        }

        if (!owner || !repo) {
          return sendJson(res, 400, { error: 'Invalid repository format. Use "owner/repo" or GitHub URL.' });
        }

        const connectedBooks = [];

        // 1. Try to fetch remote litcore.json manifest first
        const manifestUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/litcore.json`;
        const manifestRes = await fetch(manifestUrl);

        if (manifestRes.status === 200) {
          try {
            const manifestText = await manifestRes.text();
            const manifest = JSON.parse(manifestText);
            if (manifest && Array.isArray(manifest.books)) {
              console.log(`[LitCore Server] Found remote litcore.json manifest. Loading declared books...`);
              
              for (const bookEntry of manifest.books) {
                const bookPath = bookEntry.path;
                if (!bookPath) continue;

                const rawBookUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${bookPath}`;
                const rawRes = await fetch(rawBookUrl);
                if (rawRes.status !== 200) {
                  console.error(`[LitCore Server] Remote book file not found in repository: ${bookPath}`);
                  continue;
                }

                const content = await rawRes.text();
                const ast = compile(content, path.basename(bookPath));
                const slug = path.basename(bookPath, '.olf').toLowerCase();
                const bookId = bookEntry.id || ast.metadata.id || slug;

                const githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${bookPath}`;
                booksDatabase[bookId] = indexBook(bookId, ast, githubUrl);
                booksDatabase[bookId].githubUrl = githubUrl;

                connectedBooks.push(bookId);
              }
              
              return sendJson(res, 200, { success: true, connected: connectedBooks });
            }
          } catch (err) {
            console.warn(`[LitCore Server] Failed to parse remote litcore.json: ${err.message}. Falling back to root directory scan.`);
          }
        }

        // 2. Fallback: Fetch directory contents list from public GitHub contents API
        const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents?ref=${branch}`;
        const contentsRes = await fetch(contentsUrl, {
          headers: { 'User-Agent': 'LitCore-CLI' }
        });

        if (contentsRes.status !== 200) {
          return sendJson(res, contentsRes.status, {
            error: 'GitHub API Error',
            message: `Failed to fetch contents from repository: ${contentsRes.statusText}`
          });
        }

        const items = await contentsRes.json();
        if (!Array.isArray(items)) {
          return sendJson(res, 500, { error: 'Unexpected response from GitHub API' });
        }

        const olfFiles = items.filter(item => item.type === 'file' && item.name.endsWith('.olf'));
        if (olfFiles.length === 0) {
          return sendJson(res, 404, { error: 'No .olf files found in the root of the repository.' });
        }

        for (const file of olfFiles) {
          const rawRes = await fetch(file.download_url);
          if (rawRes.status !== 200) {
            continue;
          }
          const content = await rawRes.text();
          const ast = compile(content, file.name);
          const slug = path.basename(file.name, '.olf').toLowerCase();
          
          const meta = ast.metadata || {};
          const bookId = meta.id || slug;

          const githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${file.path}`;
          booksDatabase[bookId] = indexBook(bookId, ast, githubUrl);
          booksDatabase[bookId].githubUrl = githubUrl;

          connectedBooks.push(bookId);
        }

        sendJson(res, 200, { success: true, connected: connectedBooks });

      } catch (err) {
        sendJson(res, 500, { error: 'ConnectionError', message: err.message });
      }
    }
  },
  // POST /api/sandbox/compile
  {
    method: 'POST',
    pattern: /^\/api\/sandbox\/compile\/?$/,
    handler: async (req, res) => {
      try {
        const bodyStr = await readBody(req);
        let payload;
        try {
          payload = JSON.parse(bodyStr);
        } catch (e) {
          return sendJson(res, 400, { error: 'Invalid JSON payload' });
        }
        
        const text = payload.text || '';
        const ast = compile(text, 'sandbox.olf');
        sendJson(res, 200, { ast });
      } catch (err) {
        sendJson(res, 400, { error: err.name || 'CompileError', message: err.message });
      }
    }
  },
  // POST /api/sandbox/notion
  {
    method: 'POST',
    pattern: /^\/api\/sandbox\/notion\/?$/,
    handler: async (req, res) => {
      try {
        const bodyStr = await readBody(req);
        let payload;
        try {
          payload = JSON.parse(bodyStr);
        } catch (e) {
          return sendJson(res, 400, { error: 'Invalid JSON payload' });
        }

        const blocks = payload.blocks || [];
        const olf = notionBlocksToOlf(blocks);
        const ast = compile(olf, 'notion-sandbox.olf');
        sendJson(res, 200, { olf, ast });
      } catch (err) {
        sendJson(res, 400, { error: err.name || 'NotionError', message: err.message });
      }
    }
  },
  // GET /api/books/:slug/export
  {
    method: 'GET',
    pattern: /^\/api\/books\/([^/]+)\/export\/?$/,
    handler: (req, res, matches, booksDatabase) => {
      const slug = decodeURIComponent(matches[1]).toLowerCase();
      const book = booksDatabase[slug];
      if (!book) {
        return sendJson(res, 404, { error: 'Book not found' });
      }
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const dialect = url.searchParams.get('dialect') || 'postgres';
      const createTables = url.searchParams.get('createTables') === 'true';

      try {
        const sqlContent = toSql(book.ast, slug, dialect, createTables);
        sendJson(res, 200, { sql: sqlContent });
      } catch (err) {
        sendJson(res, 500, { error: 'SQL export failed', message: err.message });
      }
    }
  },
  // GET /api/books/:slug/search
  {
    method: 'GET',
    pattern: /^\/api\/books\/([^/]+)\/search\/?$/,
    handler: (req, res, matches, booksDatabase) => {
      const slug = decodeURIComponent(matches[1]).toLowerCase();
      const book = booksDatabase[slug];
      if (!book) {
        return sendJson(res, 404, { error: 'Book not found' });
      }
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const query = url.searchParams.get('q') || '';
      if (!query) {
        return sendJson(res, 200, []);
      }
      const lowerQuery = query.toLowerCase();
      const results = book.blocks.filter(b => b.content.toLowerCase().includes(lowerQuery));
      sendJson(res, 200, results);
    }
  },
  // GET /api/books/:slug/chapters/:chapterIndex/blocks/:blockIndex
  {
    method: 'GET',
    pattern: /^\/api\/books\/([^/]+)\/chapters\/(\d+)\/blocks\/(\d+)\/?$/,
    handler: (req, res, matches, booksDatabase) => {
      const slug = decodeURIComponent(matches[1]).toLowerCase();
      const chapterIdx = parseInt(matches[2], 10);
      const blockIdx = parseInt(matches[3], 10);
      const book = booksDatabase[slug];
      if (!book) {
        return sendJson(res, 404, { error: 'Book not found' });
      }
      const chapterBlocks = book.blocks.filter(b => b.chapterIndex === chapterIdx);
      if (chapterBlocks.length === 0) {
        return sendJson(res, 404, { error: 'Chapter not found' });
      }
      
      // Try match by global blockIndex first
      let block = chapterBlocks.find(b => b.blockIndex === blockIdx);
      // Fallback: chapter-relative 1-indexed block index
      if (!block && blockIdx >= 1 && blockIdx <= chapterBlocks.length) {
        block = chapterBlocks[blockIdx - 1];
      }
      
      if (!block) {
        return sendJson(res, 404, { error: 'Block not found' });
      }
      sendJson(res, 200, block);
    }
  },
  // GET /api/books/:slug/chapters/:chapterIndex
  {
    method: 'GET',
    pattern: /^\/api\/books\/([^/]+)\/chapters\/(\d+)\/?$/,
    handler: (req, res, matches, booksDatabase) => {
      const slug = decodeURIComponent(matches[1]).toLowerCase();
      const chapterIdx = parseInt(matches[2], 10);
      const book = booksDatabase[slug];
      if (!book) {
        return sendJson(res, 404, { error: 'Book not found' });
      }
      const structures = book.structures.filter(s => s.chapterIndex === chapterIdx);
      const blocks = book.blocks.filter(b => b.chapterIndex === chapterIdx);
      if (structures.length === 0 && blocks.length === 0) {
        return sendJson(res, 404, { error: 'Chapter not found' });
      }
      sendJson(res, 200, {
        chapterIndex: chapterIdx,
        structures,
        blocks
      });
    }
  },
  // GET /api/books/:slug
  {
    method: 'GET',
    pattern: /^\/api\/books\/([^/]+)\/?$/,
    handler: (req, res, matches, booksDatabase) => {
      const slug = decodeURIComponent(matches[1]).toLowerCase();
      const book = booksDatabase[slug];
      if (!book) {
        return sendJson(res, 404, { error: 'Book not found' });
      }
      sendJson(res, 200, book);
    }
  }
];

/**
 * Boots the server and watches the target directory.
 * @param {string} directory - Directory containing .olf files.
 * @param {number} [port=4000] - Server listening port.
 * @returns {Object} Server instance control handlers.
 */
export function startServer(directory, port = 4000) {
  let booksDatabase = loadBooks(directory);
  console.log(`[LitCore Server] Ingested ${Object.keys(booksDatabase).length} books from: ${directory}`);

  let debounceTimer;
  let watcher;
  
  // File watcher setup to live reload changes
  try {
    watcher = fs.watch(directory, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith('.olf') || filename === 'litcore.json')) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          console.log(`[LitCore Server] File change detected: "${filename}". Re-indexing...`);
          booksDatabase = loadBooks(directory);
          console.log(`[LitCore Server] Loaded ${Object.keys(booksDatabase).length} books.`);
        }, 200);
      }
    });
  } catch (err) {
    try {
      // Fallback watcher for environments/drives not supporting recursive flags
      watcher = fs.watch(directory, {}, (eventType, filename) => {
        if (filename && (filename.endsWith('.olf') || filename === 'litcore.json')) {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            console.log(`[LitCore Server] File change detected: "${filename}". Re-indexing...`);
            booksDatabase = loadBooks(directory);
            console.log(`[LitCore Server] Loaded ${Object.keys(booksDatabase).length} books.`);
          }, 200);
        }
      });
    } catch (e) {
      console.warn(`[LitCore Server] File watcher failed to initialize: ${e.message}`);
    }
  }

  const server = http.createServer((req, res) => {
    const startTime = Date.now();
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Log request after response closes
    const originalEnd = res.end;
    res.end = function (...args) {
      const duration = Date.now() - startTime;
      console.log(`[LitCore Server] ${req.method} ${pathname} - ${res.statusCode} (${duration}ms)`);
      return originalEnd.apply(this, args);
    };

    // Enable CORS preflight responses
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    let matched = false;
    for (const route of routes) {
      if (req.method === route.method) {
        const match = pathname.match(route.pattern);
        if (match) {
          matched = true;
          try {
            route.handler(req, res, match, booksDatabase);
          } catch (err) {
            console.error('[LitCore Server] Request handling exception:', err);
            sendJson(res, 500, { error: 'Internal Server Error', message: err.message });
          }
          break;
        }
      }
    }

    if (!matched) {
      sendJson(res, 404, { error: 'Not Found' });
    }
  });

  server.listen(port, () => {
    console.log(`[LitCore Server] Listening at http://localhost:${port}`);
  });

  return {
    server,
    watcher,
    close: () => {
      server.close();
      if (watcher) watcher.close();
    }
  };
}
