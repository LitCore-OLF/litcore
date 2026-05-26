import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { compile } from './index.js';

// Get current directory in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Packages a LitCore project (OLF, custom CSS, cover) into a self-rendering .olx file.
 * @param {string} bookDir - Path to book directory or .olf file.
 * @param {string|null} [outputPath=null] - Path to write the output .olx file.
 * @returns {Object} Packaging metadata.
 */
export function pack(bookDir, outputPath = null) {
  const resolvedPath = path.resolve(bookDir);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Path not found: ${bookDir}`);
  }

  let olfPath = null;
  const isFile = fs.statSync(resolvedPath).isFile();

  if (isFile) {
    if (!resolvedPath.endsWith('.olf')) {
      throw new Error(`Target file must be a .olf file: ${bookDir}`);
    }
    olfPath = resolvedPath;
  } else {
    // Look for book.olf first, fallback to first .olf file
    const primaryOlf = path.join(resolvedPath, 'book.olf');
    if (fs.existsSync(primaryOlf)) {
      olfPath = primaryOlf;
    } else {
      const files = fs.readdirSync(resolvedPath);
      const olfFiles = files.filter(f => f.endsWith('.olf'));
      if (olfFiles.length === 0) {
        throw new Error(`No .olf files found in directory: ${bookDir}`);
      }
      olfPath = path.join(resolvedPath, olfFiles[0]);
    }
  }

  const baseDir = isFile ? path.dirname(resolvedPath) : resolvedPath;

  // Read custom theme.css if it exists
  let customCss = '';
  const cssPath = path.join(baseDir, 'theme.css');
  if (fs.existsSync(cssPath)) {
    customCss = fs.readFileSync(cssPath, 'utf8');
  }

  // Read cover image if it exists (jpeg, png)
  let coverBase64 = null;
  let coverPath = null;
  const possibleCovers = ['cover.jpg', 'cover.jpeg', 'cover.png'];
  for (const name of possibleCovers) {
    const p = path.join(baseDir, name);
    if (fs.existsSync(p)) {
      coverPath = p;
      break;
    }
  }

  if (coverPath) {
    const ext = path.extname(coverPath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    const buffer = fs.readFileSync(coverPath);
    coverBase64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
  }

  // Compile OLF file to JSON AST
  const olfText = fs.readFileSync(olfPath, 'utf8');
  const ast = compile(olfText, olfPath);

  // Inject cover art to AST metadata if found
  if (coverBase64) {
    ast.metadata.cover_image = coverBase64;
  }

  // Load standalone viewer template
  const templatePath = path.join(__dirname, 'template.html');
  if (!fs.existsSync(templatePath)) {
    throw new Error('Template file src/template.html not found.');
  }
  let html = fs.readFileSync(templatePath, 'utf8');

  // Inline the compiled AST data safely using functions to prevent '$' symbol issues
  const jsonString = JSON.stringify(ast, null, 2);
  const astRegex = /(<script type="application\/json" id="litcore-ast">)([\s\S]*?)(<\/script>)/;
  html = html.replace(astRegex, (match, p1, p2, p3) => `${p1}\n${jsonString}\n${p3}`);

  // Inline the author's custom CSS theme safely
  const cssRegex = /(<style id="author-theme">)([\s\S]*?)(<\/style>)/;
  html = html.replace(cssRegex, (match, p1, p2, p3) => `${p1}\n${customCss}\n${p3}`);

  // Determine final .olx output location
  let finalOutPath = outputPath;
  const bookSlug = (ast.metadata.title || path.basename(baseDir))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  if (!finalOutPath) {
    finalOutPath = path.join(process.cwd(), `${bookSlug}.olx`);
  } else {
    finalOutPath = path.resolve(finalOutPath);
    if (fs.existsSync(finalOutPath) && fs.statSync(finalOutPath).isDirectory()) {
      finalOutPath = path.join(finalOutPath, `${bookSlug}.olx`);
    }
  }

  // Write compiled standalone file
  fs.mkdirSync(path.dirname(finalOutPath), { recursive: true });
  fs.writeFileSync(finalOutPath, html, 'utf8');

  return {
    outputPath: finalOutPath,
    title: ast.metadata.title || 'Untitled',
    author: ast.metadata.author || 'Unknown',
    hasCustomCss: !!customCss,
    hasCover: !!coverBase64
  };
}
export default pack;
