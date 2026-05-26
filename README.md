# @litcore/cli

> **LitCore** is an open, API-native infrastructure that redefines human literature as structured, queryable, and version-controlled data. 

While the web has modern, API-first standards for organizing code (GitHub) and media (Spotify), books remain trapped in static, visual-first files (EPUB, PDF) or bloated, developer-hostile academic XML (TEI). LitCore bridges the gap, allowing developers to query text at the sub-document level, training AI models on noise-free structural data, and enabling global communities to collaborate via Git.

---

## 🚀 Key Features

* **Isomorphic Compiler Engine:** Pure JavaScript tokenizer and parser that compiles `.olf` files to structured JSON ASTs. Runs seamlessly in both local CLIs and browser environments.
* **Separation of Concerns:** Keep styling completely decoupled from content. Let rendering engines (Viewers) handle dynamic dark mode, fonts, and readability preferences.
* **Single-File Standalone Viewer (`.olx`):** Package `.olf` content, custom CSS, and cover art into a zero-dependency, self-rendering interactive HTML document.
* **Notion Webhook Bridge:** Build bridges that translate popular writing formats (Notion Block JSON arrays) into clean `.olf` syntax to capture users where they write.
* **Stable Block Anchors:** Deterministic `block.id` values are generated at compile-time for durable deep links, citations, and diffs.
* **High Performance:** Compiles a full 128,000-word book in **under 10 milliseconds** (linear $O(N)$ CPU execution time).

---

## 📐 OLF Syntax Specification

The Open Literature Format (`.olf`) separates structure and metadata from content:

* **Metadata (`@`):** Global book properties. Format: `@key: value`
* **Structure (`#`):** Chapter or subheading indicators. Format: `#key: value`
* **Block Attributes (`>`):** Block-level properties. Format: `>key: value` or plain `>`
* **Soft Content:** Spacing, indentation, and newlines are perfectly preserved inside blocks to protect poetic and artistic intent.
* **Case Sensitive:** All system tags must be strictly lowercase. Malformed tags trigger strict compilation errors.

### Example OLF Document:
```olf
@title: Shikwa
@author: Allama Iqbal
@lang: ur
@type: poetry

#chapter: 1

>type: verse
>lang: ur
کیوں زیاں کار بنوں، سُود فراموش رہوں
    فکرِ فردا نہ کروں، محوِ غمِ دوش رہوں
```

---

## 📚 Specification & Roadmap

- OLF spec draft: `docs/olf-spec-v1.md`
- Practical roadmap: `docs/roadmap.md`
- Adoption playbook: `docs/adoption-playbook.md`

---

## 🛠️ CLI Usage Guide

Install globally or run using `npx`:

```bash
# Initialize a new book project template
npx litcore init my-new-book

# Validate syntax correctness without outputting files
npx litcore validate book.olf

# Compile OLF file to standard JSON AST
npx litcore compile book.olf --out dist/

# Package OLF, custom theme, and cover into a self-rendering OLX reader
npx litcore pack my-new-book --out output/
```

---

## 🔌 Programmatic APIs (Isomorphic)

Use LitCore compiler capabilities inside Node.js applications, serverless functions, or Next.js/browser environments:

```javascript
import { compile, tokenize, parse, notionBlocksToOlf } from '@litcore/cli';

// 1. Compile OLF text to JSON AST
const sourceOlf = `@title: My Book\n#chapter: 1\nHello World!`;
const ast = compile(sourceOlf);
console.log(ast.metadata.title); // "My Book"

// 2. Ingest Notion blocks from Webhooks
const notionBlocks = [
  {
    type: 'paragraph',
    paragraph: {
      rich_text: [{ plain_text: 'Hello from Notion!' }]
    }
  }
];
const compiledOlf = notionBlocksToOlf(notionBlocks);
const parsedAst = compile(compiledOlf);
```

---

## 🔌 Notion Block to OLF Translation Map

Our integration bridge translates the full range of industry-standard rich-text features:

| Notion Block Type | OLF Structure | Compiled AST Output |
| :--- | :--- | :--- |
| `heading_1` | `#heading_1: text` | `type: "structure", name: "heading_1"` |
| `paragraph` | `>type: paragraph` | `type: "block", attributes: { type: "paragraph" }` |
| `bulleted_list_item` | `>type: bullet` | `type: "block", attributes: { type: "bullet" }` |
| `to_do` | `>type: todo \n >checked: true/false` | `type: "block", attributes: { type: "todo", checked: "true" }` |
| `callout` | `>type: callout \n >icon: ⚠️` | `type: "block", attributes: { type: "callout", icon: "⚠️" }` |
| `code` | `>type: code \n >lang: javascript` | `type: "block", attributes: { type: "code", lang: "javascript" }` |
| `image` | `>type: image \n >src: url` | `type: "block", attributes: { type: "image", src: "url" }` |
| `divider` | `#divider: true` | `type: "structure", name: "divider"` |

---

## 📊 Performance Benchmarks

Engine performance was measured on Node.js `v24.15.0`.

* **Compilation Rate:** ~1.8 ms per 100 KB of OLF source content.
* **Standard Book (128,000 words, 1,508 blocks):** CPU compiling takes **9.68 ms** (1.31 MB JSON output).
* **Stress Test (Tafheem-ul-Quran - 114 surahs, 20,900 blocks):** CPU compiling takes **112.88 ms** (9.29 MB JSON output).

---

## 🧪 Running Tests

Ensure all core validation and integration tests run successfully:

```bash
npm test
```

## 🚀 CI/CD & Trusted Publishing

This repository is configured with:
- **GitHub Actions CI (`ci.yml`)**: Automatically runs the entire test suite on every push and pull request across Node.js versions 18, 20, and 22.
- **npm Trusted Publishing (`publish.yml`)**: Fully secure, tokenless OIDC-based publishing directly to npm when a new GitHub Release is created.

## 📄 License

MIT
