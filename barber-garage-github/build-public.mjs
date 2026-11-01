// Temporary public-only build. The local admin is excluded until authenticated APIs exist.
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const source = fileURLToPath(new URL('.', import.meta.url));
const target = path.join(source, 'dist');
// Refuse stale output instead of accidentally publishing old admin files.
await mkdir(target);
const files = ['index.html', 'site.js', 'interactions.css', 'catalogo.js', 'orari.js', '_headers',
  'admin/catalogo-iniziale.js', 'assets/logo-dark-bg.svg', 'assets/logo-light-bg.svg',
  'assets/photo-2.jpg', 'uploads/immagini-1789819663461-hzrr.jpg'];
for (const name of files) {
  const dest = path.join(target, name);
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(path.join(source, name), dest);
}
await writeFile(path.join(target, '404.html'), '<!doctype html><html lang="it"><meta charset="utf-8"><title>Pagina non disponibile</title><h1>Pagina non disponibile</h1><a href="/">Torna al sito</a></html>');
// No browser-local overrides on the public build; online data comes with the backend.
for (const name of ['catalogo.js', 'orari.js']) {
  const file = path.join(target, name);
  await writeFile(file, (await readFile(file, 'utf8')).replaceAll('localStorage.getItem(key)', 'null'));
}
console.log('Public-only build ready in dist. Admin and local browser data are excluded.');
