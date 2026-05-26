import test from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const tempOlfPath = path.resolve('temp_test_book.olf');
const tempJsonPath = path.resolve('temp_test_book.json');
const tempInitDir = path.resolve('temp_init_dir');

function cleanup() {
  if (fs.existsSync(tempOlfPath)) fs.unlinkSync(tempOlfPath);
  if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath);
  if (fs.existsSync(tempInitDir)) {
    fs.rmSync(tempInitDir, { recursive: true, force: true });
  }
}

test('LitCore CLI - Compile and Validate Commands', () => {
  cleanup();

  const sourceOlf = `@title: CLI Test Book
@author: CLI Runner
@lang: en
@type: prose

#chapter: 1

>type: plaintext
This is a line of prose in the CLI test book.
`;

  fs.writeFileSync(tempOlfPath, sourceOlf, 'utf8');

  // Test validate command (should pass)
  const validateOutput = execSync(`node bin/litcore.js validate "${tempOlfPath}"`, { encoding: 'utf8' });
  assert.match(validateOutput, /Validation Passed!/);
  assert.match(validateOutput, /Found .*4.* metadata tags/);

  // Test compile command
  const compileOutput = execSync(`node bin/litcore.js compile "${tempOlfPath}"`, { encoding: 'utf8' });
  assert.match(compileOutput, /Compilation Successful!/);
  assert.match(compileOutput, /Compiled to:/);

  // Verify compiled file contents
  assert.ok(fs.existsSync(tempJsonPath));
  const compiledAst = JSON.parse(fs.readFileSync(tempJsonPath, 'utf8'));
  assert.strictEqual(compiledAst.metadata.title, 'CLI Test Book');
  assert.strictEqual(compiledAst.body.length, 2);
  assert.strictEqual(compiledAst.body[0].type, 'structure');
  assert.strictEqual(compiledAst.body[1].type, 'block');
  assert.strictEqual(compiledAst.body[1].content, 'This is a line of prose in the CLI test book.');

  cleanup();
});

test('LitCore CLI - Validation Failure Command', () => {
  cleanup();

  const invalidOlf = `@Title: Uppercase Title Tag`; // Invalid because of Uppercase 'T'
  fs.writeFileSync(tempOlfPath, invalidOlf, 'utf8');

  // Test validation failure
  try {
    execSync(`node bin/litcore.js validate "${tempOlfPath}"`, { stdio: 'pipe' });
    assert.fail('Expected command to fail due to syntax error');
  } catch (err) {
    const stderr = err.stderr.toString();
    assert.match(stderr, /Validation Failed!/);
    assert.match(stderr, /Metadata key must be lowercase/);
  }

  cleanup();
});

test('LitCore CLI - Init Command', () => {
  cleanup();

  // Test init command
  const initOutput = execSync(`node bin/litcore.js init "${tempInitDir}"`, { encoding: 'utf8' });
  assert.match(initOutput, /Initialization Successful!/);

  const olfPath = path.join(tempInitDir, 'book.olf');
  const pkgPath = path.join(tempInitDir, 'package.json');

  assert.ok(fs.existsSync(olfPath));
  assert.ok(fs.existsSync(pkgPath));

  const olfContent = fs.readFileSync(olfPath, 'utf8');
  assert.match(olfContent, /@title: Sample Book/);

  cleanup();
});
