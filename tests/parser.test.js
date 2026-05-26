import test from 'node:test';
import assert from 'node:assert';
import { compile, LitCoreSyntaxError } from '../src/index.js';

test('LitCore Compiler - Metadata Compilation', () => {
  const source = `@title: The Great Gatsby
@author: F. Scott Fitzgerald
@lang: en
@type: prose`;

  const ast = compile(source);

  assert.deepStrictEqual(ast.metadata, {
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    lang: 'en',
    type: 'prose'
  });
  assert.strictEqual(ast.body.length, 0);
});

test('LitCore Compiler - Structural Tags', () => {
  const source = `#chapter: 1
#section: Introduction`;

  const ast = compile(source);

  assert.strictEqual(ast.body.length, 2);
  assert.deepStrictEqual(ast.body[0], {
    type: 'structure',
    name: 'chapter',
    value: '1',
    line: 1
  });
  assert.deepStrictEqual(ast.body[1], {
    type: 'structure',
    name: 'section',
    value: 'Introduction',
    line: 2
  });
});

test('LitCore Compiler - Explicit Block Attributes & Text Preservation', () => {
  const source = `>type: verse
>lang: ur
کیوں زیاں کار بنوں، سُود فراموش رہوں
    فکرِ فردا نہ کروں، محوِ غمِ دوش رہوں`;

  const ast = compile(source);

  assert.strictEqual(ast.body.length, 1);
  assert.strictEqual(ast.body[0].type, 'block');
  assert.deepStrictEqual(ast.body[0].attributes, {
    type: 'verse',
    lang: 'ur'
  });
  assert.strictEqual(
    ast.body[0].content,
    'کیوں زیاں کار بنوں، سُود فراموش رہوں\n    فکرِ فردا نہ کروں، محوِ غمِ دوش رہوں'
  );
  assert.strictEqual(ast.body[0].line, 1);
});

test('LitCore Compiler - Default Block Type & Auto Start', () => {
  const source = `#chapter: 1

This is standard prose.
It starts without any block attributes.`;

  const ast = compile(source);

  assert.strictEqual(ast.body.length, 2);
  assert.strictEqual(ast.body[0].type, 'structure');
  
  assert.strictEqual(ast.body[1].type, 'block');
  assert.deepStrictEqual(ast.body[1].attributes, {
    type: 'plaintext'
  });
  assert.strictEqual(
    ast.body[1].content,
    'This is standard prose.\nIt starts without any block attributes.'
  );
  assert.strictEqual(ast.body[1].line, 3);
});

test('LitCore Compiler - Block Attribute Defaulting to Plaintext', () => {
  const source = `>lang: en
Only lang is provided here.`;

  const ast = compile(source);

  assert.strictEqual(ast.body.length, 1);
  assert.strictEqual(ast.body[0].type, 'block');
  assert.deepStrictEqual(ast.body[0].attributes, {
    type: 'plaintext',
    lang: 'en'
  });
  assert.strictEqual(ast.body[0].content, 'Only lang is provided here.');
});

test('LitCore Compiler - Multi-Block Parsing and Empty Line Trimming', () => {
  const source = `>type: verse
Line 1


Line 2


>type: verse
Line 3`;

  const ast = compile(source);

  assert.strictEqual(ast.body.length, 2);
  assert.strictEqual(ast.body[0].content, 'Line 1\n\n\nLine 2');
  assert.strictEqual(ast.body[1].content, 'Line 3');
});

test('LitCore Compiler - Strict Syntax Error - Uppercase Metadata Key', () => {
  const source = `@Title: Uppercase key`;
  assert.throws(() => {
    compile(source);
  }, (err) => {
    return err instanceof LitCoreSyntaxError &&
      err.message.includes('Metadata key must be lowercase');
  });
});

test('LitCore Compiler - Strict Syntax Error - Malformed Structural Tag', () => {
  const source = `#chapter 1`; // Missing colon
  assert.throws(() => {
    compile(source);
  }, (err) => {
    return err instanceof LitCoreSyntaxError &&
      err.message.includes('Malformed structural tag. Expected format: #key: value');
  });
});

test('LitCore Compiler - Strict Syntax Error - Malformed Block Attribute', () => {
  const source = `>type verse`; // Missing colon
  assert.throws(() => {
    compile(source);
  }, (err) => {
    return err instanceof LitCoreSyntaxError &&
      err.message.includes('Malformed block attribute tag');
  });
});
