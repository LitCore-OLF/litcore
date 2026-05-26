import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { pack } from '../src/index.js';

const testPackDir = path.resolve('temp_pack_test');

function cleanup() {
  if (fs.existsSync(testPackDir)) {
    fs.rmSync(testPackDir, { recursive: true, force: true });
  }
  const defaultOlx = path.resolve('pack-test-book.olx');
  if (fs.existsSync(defaultOlx)) {
    fs.unlinkSync(defaultOlx);
  }
}

test('LitCore Packager - Bundling book.olf, theme.css, and cover art', () => {
  cleanup();

  fs.mkdirSync(testPackDir, { recursive: true });

  const olfContent = `@title: Pack Test Book
@author: Pack Author
@lang: en

#chapter: 1
>type: plaintext
Hello LitCore Archive!
`;
  fs.writeFileSync(path.join(testPackDir, 'book.olf'), olfContent, 'utf8');

  // Create a dummy CSS file
  const cssContent = `body { background: purple !important; }`;
  fs.writeFileSync(path.join(testPackDir, 'theme.css'), cssContent, 'utf8');

  // Create a dummy 1x1 pixel PNG cover art
  const coverBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const coverBuffer = Buffer.from(coverBase64, 'base64');
  fs.writeFileSync(path.join(testPackDir, 'cover.png'), coverBuffer);

  // Run packager
  const result = pack(testPackDir);

  // Verify result metadata
  assert.strictEqual(result.title, 'Pack Test Book');
  assert.strictEqual(result.author, 'Pack Author');
  assert.ok(result.hasCustomCss);
  assert.ok(result.hasCover);
  assert.ok(fs.existsSync(result.outputPath));

  // Verify packaged HTML contents
  const html = fs.readFileSync(result.outputPath, 'utf8');
  assert.match(html, /<script type="application\/json" id="litcore-ast">/);
  assert.match(html, /Pack Test Book/);
  assert.match(html, /body \{ background: purple !important; \}/);
  assert.match(html, /data:image\/png;base64,/);

  cleanup();
});
