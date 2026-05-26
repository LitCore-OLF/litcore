/**
 * Compiles a list of tokens into an OpenLit JSON AST.
 * @param {Array<Object>} tokens - Array of tokens from tokenizer.
 * @returns {Object} Structured JSON AST.
 */
export function parse(tokens) {
  const ast = {
    metadata: {},
    body: []
  };

  let currentBlock = null;
  const blockFingerprintCounts = new Map();

  function hashString(input) {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function computeBlockId(attributes, content) {
    const stableAttrs = { ...(attributes || {}) };
    delete stableAttrs.id;
    delete stableAttrs.litcore_block_id;
    const normalized = `${JSON.stringify(stableAttrs)}|${content}`;
    const hash = hashString(normalized);
    const seen = (blockFingerprintCounts.get(hash) || 0) + 1;
    blockFingerprintCounts.set(hash, seen);
    return `b-${hash}-${seen}`;
  }

  function closeCurrentBlock() {
    if (currentBlock) {
      // Clean leading and trailing empty lines
      const lines = [...currentBlock.lines];
      while (lines.length > 0 && lines[0].trim() === '') {
        lines.shift();
      }
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
      }

      // Default the block type to plaintext if not specified
      if (!currentBlock.attributes.type) {
        currentBlock.attributes.type = 'plaintext';
      }

      const content = lines.join('\n');
      const id = currentBlock.attributes.id || computeBlockId(currentBlock.attributes, content);

      ast.body.push({
        type: 'block',
        id,
        attributes: currentBlock.attributes,
        content,
        line: currentBlock.line
      });

      currentBlock = null;
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    switch (token.type) {
      case 'METADATA':
        closeCurrentBlock();
        ast.metadata[token.key] = token.value;
        break;

      case 'STRUCTURAL':
        closeCurrentBlock();
        ast.body.push({
          type: 'structure',
          name: token.key,
          value: token.value,
          line: token.line
        });
        break;

      case 'BLOCK_ATTR':
        if (currentBlock === null) {
          currentBlock = {
            attributes: { [token.key]: token.value },
            lines: [],
            line: token.line,
            hasContent: false
          };
        } else if (!currentBlock.hasContent) {
          // We are still defining attributes for the current block
          currentBlock.attributes[token.key] = token.value;
        } else {
          // We already have content, so this is a new block
          closeCurrentBlock();
          currentBlock = {
            attributes: { [token.key]: token.value },
            lines: [],
            line: token.line,
            hasContent: false
          };
        }
        break;

      case 'TEXT_LINE':
        if (currentBlock === null) {
          currentBlock = {
            attributes: { type: 'plaintext' },
            lines: [token.text],
            line: token.line,
            hasContent: true
          };
        } else {
          currentBlock.hasContent = true;
          currentBlock.lines.push(token.text);
        }
        break;

      case 'EMPTY_LINE':
        if (currentBlock !== null) {
          currentBlock.lines.push('');
        }
        break;
    }
  }

  // Close any final active block
  closeCurrentBlock();

  return ast;
}
