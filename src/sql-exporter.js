import { randomUUID } from 'crypto';

/**
 * Escapes single quotes for standard SQL safety.
 * @param {string} str - Input text string.
 * @returns {string} Escaped string.
 */
const escapeSql = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/'/g, "''");
};

/**
 * Generates SQL queries to insert book AST data into a database.
 * @param {Object} ast - OpenLit/LitCore JSON AST.
 * @param {string} bookSlug - Identifier slug for the book (e.g. "shikwa").
 * @param {string} [dialect='postgres'] - Target database dialect ('postgres', 'mysql', 'sqlite').
 * @param {boolean} [createTables=false] - Whether to prepend CREATE TABLE DDL queries.
 * @returns {string} Combined SQL script.
 */
export function toSql(ast, bookSlug, dialect = 'postgres', createTables = false) {
  const d = dialect.toLowerCase();
  if (d !== 'postgres' && d !== 'mysql' && d !== 'sqlite') {
    throw new Error(`Unsupported SQL dialect: ${dialect}`);
  }

  const lines = [];

  // 1. DDL Statements (Create Tables)
  if (createTables) {
    if (d === 'postgres') {
      lines.push(`-- DDL Schema Setup (PostgreSQL)
CREATE TABLE IF NOT EXISTS books (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255),
    language VARCHAR(50),
    type VARCHAR(50),
    version VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS structures (
    id UUID PRIMARY KEY,
    book_id VARCHAR(255) REFERENCES books(id) ON DELETE CASCADE,
    type VARCHAR(100),
    value TEXT,
    line INT,
    "order" INT
);

CREATE TABLE IF NOT EXISTS blocks (
    id UUID PRIMARY KEY,
    book_id VARCHAR(255) REFERENCES books(id) ON DELETE CASCADE,
    chapter_index INT,
    section_index INT,
    block_index INT,
    type VARCHAR(100),
    attributes JSONB,
    content TEXT,
    line INT
);\n`);
    } else if (d === 'mysql') {
      lines.push(`-- DDL Schema Setup (MySQL)
CREATE TABLE IF NOT EXISTS books (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255),
    language VARCHAR(50),
    type VARCHAR(50),
    version VARCHAR(255)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS structures (
    id VARCHAR(36) PRIMARY KEY,
    book_id VARCHAR(255),
    type VARCHAR(100),
    value TEXT,
    line INT,
    \`order\` INT,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS blocks (
    id VARCHAR(36) PRIMARY KEY,
    book_id VARCHAR(255),
    chapter_index INT,
    section_index INT,
    block_index INT,
    type VARCHAR(100),
    attributes JSON,
    content TEXT,
    line INT,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
) ENGINE=InnoDB;\n`);
    } else if (d === 'sqlite') {
      lines.push(`-- DDL Schema Setup (SQLite)
CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    language TEXT,
    type TEXT,
    version TEXT
);

CREATE TABLE IF NOT EXISTS structures (
    id TEXT PRIMARY KEY,
    book_id TEXT,
    type TEXT,
    value TEXT,
    line INTEGER,
    \`order\` INTEGER,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS blocks (
    id TEXT PRIMARY KEY,
    book_id TEXT,
    chapter_index INTEGER,
    section_index INTEGER,
    block_index INTEGER,
    type TEXT,
    attributes TEXT,
    content TEXT,
    line INTEGER,
    FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
);\n`);
    }
  }

  // 2. Insert Book Record (with Upsert logic)
  const meta = ast.metadata || {};
  const bookId = escapeSql(bookSlug);
  const title = escapeSql(meta.title || 'Untitled');
  const author = escapeSql(meta.author || 'Unknown');
  const lang = escapeSql(meta.lang || 'en');
  const type = escapeSql(meta.type || 'prose');
  const version = escapeSql(meta.version || '1.0.0');

  lines.push(`-- Ingesting Book Metadata`);
  if (d === 'postgres' || d === 'sqlite') {
    lines.push(`INSERT INTO books (id, title, author, language, type, version)
VALUES ('${bookId}', '${title}', '${author}', '${lang}', '${type}', '${version}')
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, version = EXCLUDED.version;\n`);
  } else if (d === 'mysql') {
    lines.push(`INSERT INTO books (id, title, author, language, type, version)
VALUES ('${bookId}', '${title}', '${author}', '${lang}', '${type}', '${version}')
ON DUPLICATE KEY UPDATE title = VALUES(title), version = VALUES(version);\n`);
  }

  // Clean old child records before fresh inserting
  lines.push(`-- Refreshing book content nodes
DELETE FROM structures WHERE book_id = '${bookId}';
DELETE FROM blocks WHERE book_id = '${bookId}';\n`);

  // 3. Loop and compile elements
  let chapterCount = 0;
  let sectionCount = 0;
  let blockCount = 0;
  let structureOrder = 0;

  const structuresToInsert = [];
  const blocksToInsert = [];

  (ast.body || []).forEach((node) => {
    if (node.type === 'structure') {
      const order = structureOrder++;
      const id = randomUUID();
      const structType = escapeSql(node.name);
      const val = escapeSql(node.value);

      if (node.name === 'chapter') {
        chapterCount++;
        sectionCount = 0; // reset sections
      } else if (node.name === 'section') {
        sectionCount++;
      }

      structuresToInsert.push(
        `('${id}', '${bookId}', '${structType}', '${val}', ${node.line}, ${order})`
      );
    } else if (node.type === 'block') {
      blockCount++;
      const id = randomUUID();
      const blockType = escapeSql(node.attributes.type || 'plaintext');
      const attrJson = JSON.stringify(node.attributes || {});
      const content = escapeSql(node.content);

      // JSON type casting
      let attrVal;
      if (d === 'postgres') {
        attrVal = `'${escapeSql(attrJson)}'::jsonb`;
      } else {
        attrVal = `'${escapeSql(attrJson)}'`;
      }

      blocksToInsert.push(
        `('${id}', '${bookId}', ${chapterCount || 1}, ${sectionCount}, ${blockCount}, '${blockType}', ${attrVal}, '${content}', ${node.line})`
      );
    }
  });

  // Bulk Insert structures
  if (structuresToInsert.length > 0) {
    lines.push(`-- Inserting structural headings`);
    if (d === 'mysql' || d === 'sqlite') {
      lines.push(`INSERT INTO structures (id, book_id, type, value, line, \`order\`) VALUES`);
    } else {
      lines.push(`INSERT INTO structures (id, book_id, type, value, line, "order") VALUES`);
    }
    lines.push(structuresToInsert.join(',\n') + ';\n');
  }

  // Bulk Insert blocks
  if (blocksToInsert.length > 0) {
    lines.push(`-- Inserting content blocks`);
    lines.push(`INSERT INTO blocks (id, book_id, chapter_index, section_index, block_index, type, attributes, content, line) VALUES`);
    lines.push(blocksToInsert.join(',\n') + ';\n');
  }

  return lines.join('\n');
}
