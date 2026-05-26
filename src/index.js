import { tokenize } from './tokenizer.js';
import { parse } from './parser.js';
import { LitCoreSyntaxError } from './errors.js';
import { pack } from './packager.js';
import { notionBlocksToOlf, richTextToMarkdown } from './notion-bridge.js';
import { toSql } from './sql-exporter.js';
import { startServer, loadBooks } from './server.js';

/**
 * Compiles raw .olf text into a structured JSON AST.
 * @param {string} text - Raw .olf file content.
 * @param {string|null} [filePath=null] - Optional file path for syntax error reports.
 * @returns {Object} Structured JSON AST.
 * @throws {LitCoreSyntaxError} If syntax error is encountered.
 */
export function compile(text, filePath = null) {
  const tokens = tokenize(text, filePath);
  return parse(tokens);
}

export { tokenize, parse, LitCoreSyntaxError, pack, notionBlocksToOlf, richTextToMarkdown, toSql, startServer, loadBooks };

