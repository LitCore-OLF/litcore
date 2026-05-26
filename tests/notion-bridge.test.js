import test from 'node:test';
import assert from 'node:assert';
import { notionBlocksToOlf, compile } from '../src/index.js';

test('Notion Bridge - Translate complex blocks and inline styles', () => {
  const mockNotionBlocks = [
    {
      type: 'heading_1',
      heading_1: {
        rich_text: [
          {
            plain_text: 'Chapter 1: The Beginning',
            annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false }
          }
        ]
      }
    },
    {
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            plain_text: 'This is a paragraph containing ',
            annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false }
          },
          {
            plain_text: 'bold text',
            annotations: { bold: true, italic: false, strikethrough: false, underline: false, code: false }
          },
          {
            plain_text: ', ',
            annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false }
          },
          {
            plain_text: 'italics',
            annotations: { bold: false, italic: true, strikethrough: false, underline: false, code: false }
          },
          {
            plain_text: ', and ',
            annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false }
          },
          {
            plain_text: 'inline code',
            annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: true }
          },
          {
            plain_text: '.',
            annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false }
          }
        ]
      }
    },
    {
      type: 'callout',
      callout: {
        rich_text: [
          {
            plain_text: 'This is an important warning!',
            annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false }
          }
        ],
        icon: { type: 'emoji', emoji: '⚠️' },
        color: 'yellow_background'
      }
    },
    {
      type: 'to_do',
      to_do: {
        rich_text: [
          {
            plain_text: 'Review draft edits',
            annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false }
          }
        ],
        checked: true
      }
    },
    {
      type: 'code',
      code: {
        rich_text: [
          {
            plain_text: 'console.log("Hello LitCore!");',
            annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false }
          }
        ],
        language: 'javascript'
      }
    },
    {
      type: 'image',
      image: {
        type: 'external',
        external: {
          url: 'https://example.com/cover.jpg'
        },
        caption: [
          {
            plain_text: 'Book Cover Illustration',
            annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false }
          }
        ]
      }
    },
    {
      type: 'divider',
      divider: {}
    }
  ];

  // 1. Translate Notion blocks to OLF string syntax
  const olfText = notionBlocksToOlf(mockNotionBlocks);

  // Check structure in OLF string
  assert.ok(olfText.includes('#heading_1: Chapter 1: The Beginning'));
  assert.ok(olfText.includes('This is a paragraph containing **bold text**, *italics*, and `inline code`.'));
  assert.ok(olfText.includes('>type: callout'));
  assert.ok(olfText.includes('>icon: ⚠️'));
  assert.ok(olfText.includes('>color: yellow_background'));
  assert.ok(olfText.includes('>type: todo'));
  assert.ok(olfText.includes('>checked: true'));
  assert.ok(olfText.includes('>type: code'));
  assert.ok(olfText.includes('>lang: javascript'));
  assert.ok(olfText.includes('>type: image'));
  assert.ok(olfText.includes('>src: https://example.com/cover.jpg'));
  assert.ok(olfText.includes('>alt: Book Cover Illustration'));
  assert.ok(olfText.includes('#divider: true'));

  // 2. Compile translated OLF directly to JSON AST
  const ast = compile(olfText);

  // Verify compiled AST matches expected values
  assert.strictEqual(ast.body.length, 7);

  // Validate Heading 1
  assert.strictEqual(ast.body[0].type, 'structure');
  assert.strictEqual(ast.body[0].name, 'heading_1');
  assert.strictEqual(ast.body[0].value, 'Chapter 1: The Beginning');

  // Validate Paragraph Block
  assert.strictEqual(ast.body[1].type, 'block');
  assert.strictEqual(ast.body[1].attributes.type, 'paragraph');
  assert.strictEqual(ast.body[1].content, 'This is a paragraph containing **bold text**, *italics*, and `inline code`.');

  // Validate Callout Block
  assert.strictEqual(ast.body[2].attributes.type, 'callout');
  assert.strictEqual(ast.body[2].attributes.icon, '⚠️');
  assert.strictEqual(ast.body[2].attributes.color, 'yellow_background');
  assert.strictEqual(ast.body[2].content, 'This is an important warning!');

  // Validate Todo Block
  assert.strictEqual(ast.body[3].attributes.type, 'todo');
  assert.strictEqual(ast.body[3].attributes.checked, 'true');
  assert.strictEqual(ast.body[3].content, 'Review draft edits');

  // Validate Code Block
  assert.strictEqual(ast.body[4].attributes.type, 'code');
  assert.strictEqual(ast.body[4].attributes.lang, 'javascript');
  assert.strictEqual(ast.body[4].content, 'console.log("Hello LitCore!");');

  // Validate Image Block
  assert.strictEqual(ast.body[5].attributes.type, 'image');
  assert.strictEqual(ast.body[5].attributes.src, 'https://example.com/cover.jpg');
  assert.strictEqual(ast.body[5].attributes.alt, 'Book Cover Illustration');

  // Validate Divider
  assert.strictEqual(ast.body[6].type, 'structure');
  assert.strictEqual(ast.body[6].name, 'divider');
  assert.strictEqual(ast.body[6].value, 'true');
});
