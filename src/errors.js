export class LitCoreSyntaxError extends Error {
  constructor(message, line, lineContent, filePath = null) {
    const formattedMessage = `LitCore Syntax Error: ${message}\n` +
      `  File: ${filePath || 'unknown'}:${line}\n` +
      `  Line ${line}: | ${lineContent.trimEnd()}`;
    super(formattedMessage);
    this.name = 'LitCoreSyntaxError';
    this.line = line;
    this.lineContent = lineContent;
    this.filePath = filePath;
  }
}
