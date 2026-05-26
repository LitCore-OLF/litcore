#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { compile, pack, toSql, startServer } from '../src/index.js';
import { LitCoreSyntaxError } from '../src/errors.js';

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h' || command === 'help') {
  printHelp();
  process.exit(0);
}

switch (command) {
  case 'compile':
    handleCompile();
    break;
  case 'validate':
    handleValidate();
    break;
  case 'pack':
    handlePack();
    break;
  case 'init':
    handleInit();
    break;
  case 'sql':
    handleSql();
    break;
  case 'serve':
    handleServe();
    break;
  default:
    console.error(`${colors.red}Error:${colors.reset} Unknown command "${command}"`);
    printHelp();
    process.exit(1);
}

function printHelp() {
  console.log(`
${colors.bold}${colors.cyan}LitCore Compiler & Packager${colors.reset} ${colors.dim}v1.0.0${colors.reset}
${colors.dim}A Git-backed tool for structured, queryable, and version-controlled literature.${colors.reset}

${colors.bold}Usage:${colors.reset}
  litcore compile <file.olf> [options]
  litcore validate <file.olf>
  litcore pack <directory_or_file> [options]
  litcore init [directory]
  litcore sql <file.olf> [options]
  litcore serve [directory] [options]

${colors.bold}Options:${colors.reset}
  --out, -o <path>          Output file or directory path
  --dialect, -d <db>        Dialect for SQL output (postgres, mysql, sqlite)
  --create-tables           Prepend CREATE TABLE schema statements to SQL output
  --port, -p <number>       Local server port (defaults to 4000)
  --help, -h                Show help screen

${colors.bold}Examples:${colors.reset}
  litcore compile books/shikwa.olf
  litcore compile books/shikwa.olf -o dist/
  litcore validate books/shikwa.olf
  litcore pack books/my-book
  litcore pack books/my-book -o dist/
  litcore init my-new-book
  litcore sql books/shikwa.olf --dialect postgres --create-tables -o db.sql
  litcore serve books/ --port 4500
`);
}

function handleCompile() {
  const fileArg = args[1];
  if (!fileArg) {
    console.error(`${colors.red}Error:${colors.reset} Missing file argument.`);
    console.log(`Usage: litcore compile <file.olf> [--out <path>]`);
    process.exit(1);
  }

  const resolvedPath = path.resolve(fileArg);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`${colors.red}Error:${colors.reset} File not found: ${fileArg}`);
    process.exit(1);
  }

  // Parse options
  let outPath = null;
  const outIdx = args.findIndex(arg => arg === '--out' || arg === '-o');
  if (outIdx !== -1 && args[outIdx + 1]) {
    outPath = args[outIdx + 1];
  }

  try {
    const content = fs.readFileSync(resolvedPath, 'utf8');
    const startTime = process.hrtime.bigint();
    const ast = compile(content, fileArg);
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;

    // Determine output file location
    let targetFile;
    if (outPath) {
      const resolvedOut = path.resolve(outPath);
      if (fs.existsSync(resolvedOut) && fs.statSync(resolvedOut).isDirectory()) {
        const baseName = path.basename(resolvedPath, path.extname(resolvedPath)) + '.json';
        targetFile = path.join(resolvedOut, baseName);
      } else {
        targetFile = resolvedOut;
      }
    } else {
      const dirName = path.dirname(resolvedPath);
      const baseName = path.basename(resolvedPath, path.extname(resolvedPath)) + '.json';
      targetFile = path.join(dirName, baseName);
    }

    // Write AST to file
    const jsonStr = JSON.stringify(ast, null, 2);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, jsonStr, 'utf8');

    // Stats
    const stats = fs.statSync(targetFile);
    const sizeKb = (stats.size / 1024).toFixed(2);
    const metaCount = Object.keys(ast.metadata).length;
    const structureCount = ast.body.filter(n => n.type === 'structure').length;
    const blockCount = ast.body.filter(n => n.type === 'block').length;

    console.log(`
${colors.green}✔ Compilation Successful!${colors.reset}
  ${colors.bold}Source:${colors.reset}      ${fileArg}
  ${colors.bold}Compiled to:${colors.reset} ${path.relative(process.cwd(), targetFile)}
  
${colors.cyan}Book Summary:${colors.reset}
  ${colors.bold}Title:${colors.reset}       ${ast.metadata.title || 'Untitled'}
  ${colors.bold}Author:${colors.reset}      ${ast.metadata.author || 'Unknown'}
  ${colors.bold}Language:${colors.reset}    ${ast.metadata.lang || 'N/A'}
  
${colors.magenta}AST Metrics:${colors.reset}
  ${colors.bold}Metadata Keys:${colors.reset}  ${metaCount}
  ${colors.bold}Structure Nodes:${colors.reset} ${structureCount}
  ${colors.bold}Content Blocks:${colors.reset}  ${blockCount}
  
${colors.yellow}Engine Stats:${colors.reset}
  ${colors.bold}Compile Time:${colors.reset}   ${durationMs.toFixed(2)}ms
  ${colors.bold}Output Size:${colors.reset}    ${sizeKb} KB
`);
  } catch (err) {
    if (err instanceof LitCoreSyntaxError) {
      console.error(`\n${colors.red}✖ Compilation Failed!${colors.reset}`);
      console.error(err.message);
      console.error();
    } else {
      console.error(`\n${colors.red}✖ An unexpected error occurred:${colors.reset}`);
      console.error(err);
    }
    process.exit(1);
  }
}

function handleValidate() {
  const fileArg = args[1];
  if (!fileArg) {
    console.error(`${colors.red}Error:${colors.reset} Missing file argument.`);
    console.log(`Usage: litcore validate <file.olf>`);
    process.exit(1);
  }

  const resolvedPath = path.resolve(fileArg);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`${colors.red}Error:${colors.reset} File not found: ${fileArg}`);
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(resolvedPath, 'utf8');
    const startTime = process.hrtime.bigint();
    const ast = compile(content, fileArg);
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;

    const metaCount = Object.keys(ast.metadata).length;
    const structureCount = ast.body.filter(n => n.type === 'structure').length;
    const blockCount = ast.body.filter(n => n.type === 'block').length;

    console.log(`
${colors.green}✔ Validation Passed!${colors.reset}
  ${colors.bold}File:${colors.reset}          ${fileArg}
  ${colors.bold}Syntax Status:${colors.reset} Valid Open Literature Format (.olf)
  ${colors.bold}Time Taken:${colors.reset}    ${durationMs.toFixed(2)}ms
  
  Found ${colors.cyan}${metaCount}${colors.reset} metadata tags, ${colors.cyan}${structureCount}${colors.reset} structural tags, and ${colors.cyan}${blockCount}${colors.reset} content blocks.
`);
  } catch (err) {
    if (err instanceof LitCoreSyntaxError) {
      console.error(`\n${colors.red}✖ Validation Failed!${colors.reset}`);
      console.error(err.message);
      console.error();
    } else {
      console.error(`\n${colors.red}✖ An unexpected error occurred:${colors.reset}`);
      console.error(err);
    }
    process.exit(1);
  }
}

function handleInit() {
  const dirArg = args[1] || '.';
  const targetDir = path.resolve(dirArg);

  console.log(`${colors.cyan}Initializing LitCore project in:${colors.reset} ${targetDir}...`);

  const templateOlf = `@title: Sample Book
@author: LitCore Community
@lang: en
@type: poetry

#chapter: 1

>type: verse
>lang: en
This is the first verse of the sample book.
And this is the second line of the first verse.

>type: plaintext
This is a standard paragraph of prose, which defaults to plaintext format.
Notice how we can have blank lines or formatting inside blocks, and it is 
preserved exactly as written.

#chapter: 2

This is a default block in chapter 2. Since we did not write any ">" tags
above this text, it automatically defaults to "type: plaintext".
`;

  try {
    fs.mkdirSync(targetDir, { recursive: true });
    
    // Create package.json if it doesn't exist
    const pkgPath = path.join(targetDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      const pkgContent = {
        name: path.basename(targetDir),
        version: "1.0.0",
        type: "module",
        dependencies: {
          "@litcore/cli": "^1.0.0"
        }
      };
      fs.writeFileSync(pkgPath, JSON.stringify(pkgContent, null, 2), 'utf8');
      console.log(`  ${colors.green}Created:${colors.reset} package.json`);
    }

    const olfPath = path.join(targetDir, 'book.olf');
    fs.writeFileSync(olfPath, templateOlf, 'utf8');
    console.log(`  ${colors.green}Created:${colors.reset} book.olf`);

    console.log(`
${colors.green}✔ Initialization Successful!${colors.reset}

${colors.bold}Get Started:${colors.reset}
  1. Open ${colors.bold}book.olf${colors.reset} to edit your book's content.
  2. Run the compiler:
     ${colors.cyan}node bin/litcore.js compile book.olf${colors.reset}
  3. Pack into standalone interactive .olx reader:
     ${colors.cyan}node bin/litcore.js pack .${colors.reset}
`);
  } catch (err) {
    console.error(`${colors.red}Error initializing project:${colors.reset}`, err.message);
    process.exit(1);
  }
}

function handlePack() {
  const dirArg = args[1];
  if (!dirArg) {
    console.error(`${colors.red}Error:${colors.reset} Missing directory or file argument.`);
    console.log(`Usage: litcore pack <directory_or_file> [--out <path>]`);
    process.exit(1);
  }

  // Parse options
  let outPath = null;
  const outIdx = args.findIndex(arg => arg === '--out' || arg === '-o');
  if (outIdx !== -1 && args[outIdx + 1]) {
    outPath = args[outIdx + 1];
  }

  try {
    const startTime = process.hrtime.bigint();
    const result = pack(dirArg, outPath);
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;

    const stats = fs.statSync(result.outputPath);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(3);

    console.log(`
${colors.green}✔ Packaging Successful!${colors.reset}
  ${colors.bold}Source:${colors.reset}      ${dirArg}
  ${colors.bold}Bundled to:${colors.reset}  ${path.relative(process.cwd(), result.outputPath)}
  
${colors.cyan}Archive Metadata:${colors.reset}
  ${colors.bold}Title:${colors.reset}       ${result.title}
  ${colors.bold}Author:${colors.reset}      ${result.author}
  ${colors.bold}Custom Theme:${colors.reset} ${result.hasCustomCss ? colors.green + 'Yes' : colors.dim + 'No'}${colors.reset}
  ${colors.bold}Cover Art:${colors.reset}    ${result.hasCover ? colors.green + 'Yes' : colors.dim + 'No'}${colors.reset}
  
${colors.yellow}Engine Stats:${colors.reset}
  ${colors.bold}Pack Time:${colors.reset}    ${durationMs.toFixed(2)}ms
  ${colors.bold}Bundle Size:${colors.reset}  ${sizeMb} MB
`);
  } catch (err) {
    console.error(`\n${colors.red}✖ Packaging Failed!${colors.reset}`);
    console.error(err.message);
    console.error();
    process.exit(1);
  }
}

function handleSql() {
  const fileArg = args[1];
  if (!fileArg) {
    console.error(`${colors.red}Error:${colors.reset} Missing file argument.`);
    console.log(`Usage: litcore sql <file.olf> --dialect <postgres|mysql|sqlite> [--create-tables] [--out <path>]`);
    process.exit(1);
  }

  const resolvedPath = path.resolve(fileArg);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`${colors.red}Error:${colors.reset} File not found: ${fileArg}`);
    process.exit(1);
  }

  // Parse options
  let dialect = 'postgres';
  const dialectIdx = args.findIndex(arg => arg === '--dialect' || arg === '-d');
  if (dialectIdx !== -1 && args[dialectIdx + 1]) {
    dialect = args[dialectIdx + 1].toLowerCase();
  }

  if (dialect !== 'postgres' && dialect !== 'mysql' && dialect !== 'sqlite') {
    console.error(`${colors.red}Error:${colors.reset} Unsupported dialect "${dialect}". Supported: postgres, mysql, sqlite.`);
    process.exit(1);
  }

  const createTables = args.includes('--create-tables');

  let outPath = null;
  const outIdx = args.findIndex(arg => arg === '--out' || arg === '-o');
  if (outIdx !== -1 && args[outIdx + 1]) {
    outPath = args[outIdx + 1];
  }

  try {
    const content = fs.readFileSync(resolvedPath, 'utf8');
    const startTime = process.hrtime.bigint();
    const ast = compile(content, fileArg);
    
    // Derive slug from filename
    const bookSlug = path.basename(resolvedPath, path.extname(resolvedPath));
    
    const sqlContent = toSql(ast, bookSlug, dialect, createTables);
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;

    // Determine output file location
    let targetFile;
    if (outPath) {
      const resolvedOut = path.resolve(outPath);
      if (fs.existsSync(resolvedOut) && fs.statSync(resolvedOut).isDirectory()) {
        const baseName = bookSlug + '.sql';
        targetFile = path.join(resolvedOut, baseName);
      } else {
        targetFile = resolvedOut;
      }
    } else {
      const dirName = path.dirname(resolvedPath);
      const baseName = bookSlug + '.sql';
      targetFile = path.join(dirName, baseName);
    }

    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, sqlContent, 'utf8');

    const stats = fs.statSync(targetFile);
    const sizeKb = (stats.size / 1024).toFixed(2);

    console.log(`
${colors.green}✔ SQL Export Successful!${colors.reset}
  ${colors.bold}Source:${colors.reset}        ${fileArg}
  ${colors.bold}Dialect:${colors.reset}       ${dialect}
  ${colors.bold}Create Tables:${colors.reset} ${createTables ? 'Yes' : 'No'}
  ${colors.bold}Exported to:${colors.reset}   ${path.relative(process.cwd(), targetFile)}
  
${colors.yellow}Engine Stats:${colors.reset}
  ${colors.bold}Export Time:${colors.reset}   ${durationMs.toFixed(2)}ms
  ${colors.bold}Output Size:${colors.reset}   ${sizeKb} KB
`);
  } catch (err) {
    if (err instanceof LitCoreSyntaxError) {
      console.error(`\n${colors.red}✖ SQL Export Failed!${colors.reset}`);
      console.error(err.message);
      console.error();
    } else {
      console.error(`\n${colors.red}✖ An unexpected error occurred:${colors.reset}`);
      console.error(err);
    }
    process.exit(1);
  }
}

function handleServe() {
  const dirArg = args[1] || '.';
  const resolvedPath = path.resolve(dirArg);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`${colors.red}Error:${colors.reset} Directory not found: ${dirArg}`);
    process.exit(1);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    console.error(`${colors.red}Error:${colors.reset} Path is not a directory: ${dirArg}`);
    process.exit(1);
  }

  // Parse port
  let port = 4000;
  const portIdx = args.findIndex(arg => arg === '--port' || arg === '-p');
  if (portIdx !== -1 && args[portIdx + 1]) {
    const parsedPort = parseInt(args[portIdx + 1], 10);
    if (!isNaN(parsedPort)) {
      port = parsedPort;
    }
  }

  console.log(`\n${colors.bold}${colors.cyan}Starting LitCore Developer Server...${colors.reset}`);
  
  try {
    startServer(resolvedPath, port);
  } catch (err) {
    console.error(`${colors.red}Error starting server:${colors.reset} ${err.message}`);
    process.exit(1);
  }
}
