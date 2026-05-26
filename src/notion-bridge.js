/**
 * Translates Notion Rich Text array into inline markdown-compatible text.
 * @param {Array<Object>} richTextArray - Notion rich text array.
 * @returns {string} Compiled inline text.
 */
export function richTextToMarkdown(richTextArray) {
  if (!richTextArray || richTextArray.length === 0) return '';

  return richTextArray.map(run => {
    let text = run.plain_text || '';
    if (!text) return '';

    const ann = run.annotations || {};

    // Apply inline code
    if (ann.code) {
      text = `\`${text}\``;
    } else {
      // Apply inline annotations (order is important to prevent malformed overlapping)
      if (ann.bold) text = `**${text}**`;
      if (ann.italic) text = `*${text}*`;
      if (ann.strikethrough) text = `~~${text}~~`;
      if (ann.underline) text = `<u>${text}</u>`;
    }

    // Apply link
    if (run.href) {
      text = `[${text}](${run.href})`;
    }

    return text;
  }).join('');
}

/**
 * Translates an array of Notion Blocks into OLF source syntax.
 * @param {Array<Object>} blocks - Notion Block JSON array.
 * @returns {string} OLF formatted string.
 */
export function notionBlocksToOlf(blocks) {
  if (!Array.isArray(blocks)) return '';

  const lines = [];

  blocks.forEach(block => {
    const type = block.type;
    const data = block[type];

    if (!data) return;

    switch (type) {
      case 'heading_1': {
        const text = richTextToMarkdown(data.rich_text);
        lines.push(`#heading_1: ${text}\n`);
        break;
      }
      case 'heading_2': {
        const text = richTextToMarkdown(data.rich_text);
        lines.push(`#heading_2: ${text}\n`);
        break;
      }
      case 'heading_3': {
        const text = richTextToMarkdown(data.rich_text);
        lines.push(`#heading_3: ${text}\n`);
        break;
      }
      case 'paragraph': {
        const text = richTextToMarkdown(data.rich_text);
        lines.push(`>type: paragraph\n${text}\n`);
        break;
      }
      case 'bulleted_list_item': {
        const text = richTextToMarkdown(data.rich_text);
        lines.push(`>type: bullet\n${text}\n`);
        break;
      }
      case 'numbered_list_item': {
        const text = richTextToMarkdown(data.rich_text);
        lines.push(`>type: number\n${text}\n`);
        break;
      }
      case 'to_do': {
        const text = richTextToMarkdown(data.rich_text);
        const checked = !!data.checked;
        lines.push(`>type: todo\n>checked: ${checked}\n${text}\n`);
        break;
      }
      case 'toggle': {
        const text = richTextToMarkdown(data.rich_text);
        lines.push(`>type: toggle\n${text}\n`);
        break;
      }
      case 'quote': {
        const text = richTextToMarkdown(data.rich_text);
        lines.push(`>type: quote\n${text}\n`);
        break;
      }
      case 'callout': {
        const text = richTextToMarkdown(data.rich_text);
        const icon = data.icon && data.icon.type === 'emoji' ? data.icon.emoji : '';
        const color = data.color || '';
        lines.push(`>type: callout`);
        if (icon) lines.push(`>icon: ${icon}`);
        if (color) lines.push(`>color: ${color}`);
        lines.push(`${text}\n`);
        break;
      }
      case 'code': {
        const text = richTextToMarkdown(data.rich_text);
        const language = data.language || 'plaintext';
        lines.push(`>type: code\n>lang: ${language}\n${text}\n`);
        break;
      }
      case 'image': {
        const url = data.type === 'external' ? data.external.url : (data.file ? data.file.url : '');
        const caption = richTextToMarkdown(data.caption);
        lines.push(`>type: image\n>src: ${url}`);
        if (caption) lines.push(`>alt: ${caption}`);
        lines.push(`\n`);
        break;
      }
      case 'divider': {
        lines.push(`#divider: true\n`);
        break;
      }
      case 'equation': {
        const expression = data.expression || '';
        lines.push(`>type: equation\n${expression}\n`);
        break;
      }
    }
  });

  return lines.join('\n');
}
