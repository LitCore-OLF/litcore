# Open Literature Format (OLF) Specification v1.0

Status: Draft (living specification)  
Scope: Syntax, parsing, and AST conformance for LitCore v1.x

## 1) Goals

- Define a strict, machine-readable grammar for `.olf`.
- Guarantee deterministic compiler output for the same source.
- Establish baseline conformance tests for parser behavior.

## 2) Line Types

Each source line is interpreted as exactly one of:

- Metadata line: `@key: value`
- Structural line: `#key: value`
- Block attribute line: `>key: value` or plain `>`
- Text line: any non-empty line that does not start with `@`, `#`, `>`
- Empty line: whitespace-only or empty

## 3) Key Rules

- System keys are lowercase only.
- Valid key charset: `[a-z0-9_-]+`.
- Metadata and structural lines require a colon.
- Block attribute lines require a colon, except plain `>` which defaults to `type: plaintext`.

## 4) AST Contract

`compile(text)` returns:

- `metadata: Record<string, string>`
- `body: Array<structure | block>`

Structure node:
- `type: "structure"`
- `name: string`
- `value: string`
- `line: number`

Block node:
- `type: "block"`
- `id: string` (deterministic block identifier)
- `attributes: Record<string, string>`
- `content: string`
- `line: number`

## 5) Block Parsing Semantics

- Consecutive block attributes belong to the same block until first content line.
- If block content starts without prior `>` attributes, block defaults to `type: plaintext`.
- Leading/trailing empty lines inside a block are trimmed.
- Internal newlines and indentation in block content are preserved.

## 6) Deterministic Block IDs

Compiler assigns stable `block.id` values from:

- normalized block attributes (excluding `id` and `litcore_block_id`)
- block content
- occurrence counter for duplicate fingerprints

Resulting format: `b-<hash>-<n>`.

## 7) Error Model

Malformed tag lines throw `LitCoreSyntaxError` with:

- reason
- file path (if provided)
- line number
- line content

## 8) Conformance Suite

Parser conformance currently includes tests for:

- strict syntax rejection
- block defaulting
- whitespace handling
- deterministic block IDs
- duplicate-content ID uniqueness

Primary file: `/tmp/workspace/LitCore-OLF/litcore/tests/parser.test.js`
