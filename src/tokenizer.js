import { LitCoreSyntaxError } from './errors.js';

/**
 * Tokenizes .olf text into structured tokens.
 * @param {string} text - Raw .olf file content.
 * @param {string|null} [filePath=null] - Optional file path for error messages.
 * @returns {Array<Object>} List of tokens.
 * @throws {LitCoreSyntaxError} If any tag is malformed.
 */
export function tokenize(text, filePath = null) {
  const lines = text.split(/\r?\n/);
  const tokens = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (line.startsWith('@')) {
      const match = line.match(/^@([^:]+):\s*(.*)$/);
      if (!match) {
        throw new LitCoreSyntaxError(
          "Malformed metadata tag. Expected format: @key: value",
          lineNum,
          line,
          filePath
        );
      }
      const key = match[1];
      const value = match[2];
      if (!/^[a-z0-9_-]+$/.test(key)) {
        throw new LitCoreSyntaxError(
          "Metadata key must be lowercase and contain only alphanumeric characters, underscores, or hyphens",
          lineNum,
          line,
          filePath
        );
      }
      tokens.push({ type: 'METADATA', key, value, line: lineNum });
    } else if (line.startsWith('#')) {
      const match = line.match(/^#([^:]+):\s*(.*)$/);
      if (!match) {
        throw new LitCoreSyntaxError(
          "Malformed structural tag. Expected format: #key: value",
          lineNum,
          line,
          filePath
        );
      }
      const key = match[1];
      const value = match[2];
      if (!/^[a-z0-9_-]+$/.test(key)) {
        throw new LitCoreSyntaxError(
          "Structural key must be lowercase and contain only alphanumeric characters, underscores, or hyphens",
          lineNum,
          line,
          filePath
        );
      }
      tokens.push({ type: 'STRUCTURAL', key, value, line: lineNum });
    } else if (line.startsWith('>')) {
      // If it is just a plain '>', default to type: plaintext
      if (line.trim() === '>') {
        tokens.push({ type: 'BLOCK_ATTR', key: 'type', value: 'plaintext', line: lineNum });
        continue;
      }
      const match = line.match(/^>([^:]+):\s*(.*)$/);
      if (!match) {
        throw new LitCoreSyntaxError(
          "Malformed block attribute tag. Expected format: >key: value or a plain >",
          lineNum,
          line,
          filePath
        );
      }
      const key = match[1];
      const value = match[2];
      if (!/^[a-z0-9_-]+$/.test(key)) {
        throw new LitCoreSyntaxError(
          "Block attribute key must be lowercase and contain only alphanumeric characters, underscores, or hyphens",
          lineNum,
          line,
          filePath
        );
      }
      tokens.push({ type: 'BLOCK_ATTR', key, value, line: lineNum });
    } else {
      if (line.trim() === '') {
        tokens.push({ type: 'EMPTY_LINE', line: lineNum });
      } else {
        tokens.push({ type: 'TEXT_LINE', text: line, line: lineNum });
      }
    }
  }

  return tokens;
}
