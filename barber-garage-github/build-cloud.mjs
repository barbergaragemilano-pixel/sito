import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const source = fileURLToPath(new URL('.', import.meta.url));
const target = path.join(source, 'dist');
await mkdir(target); // Refuse a dirty output directory rather than publishing stale files.
const files = ['index.html','site.js','data-store.js','interactions.css','catalogo.js','orari.js','_headers',
  'admin/index.html','admin/admin.js','admin/admin.css','admin/orari-admin.js','admin/migration.js',
  'assets/logo-dark-bg.svg','assets/logo-light-bg.svg','assets/photo-2.jpg','uploads/immagini-1789819663461-hzrr.jpg'];
for (const file of files) {
  const dest = path.join(target, file); await mkdir(path.dirname(dest), { recursive:true });
  let content;
  if (file.endsWith('.html')) {
    content = await readFile(path.join(source,file),'utf8');
    content = content.replace(/<script src="(?:admin\/)?catalogo-iniziale.js" defer><\/script>/, '<script src="/online.js" defer></script>');
    if (file.startsWith('admin/')) {
      content = content.replace('Versione di prova locale','Area riservata').replace('Le modifiche aggiornano il sito locale nello stesso browser. Usa il collegamento Apri sito per vederle. Accesso senza password per questa prova.', 'Le modifiche salvate vengono pubblicate sul sito.');
      content = content.replace('I dati sono salvati solo su questo dispositivo. Scarica una copia per conservarli.', 'I dati sono salvati online. Puoi scaricare una copia del catalogo.');
      content = content.replace('<header>', '<header><a href="/cdn-cgi/access/logout">Esci</a>');
    }
    await writeFile(dest,content);
  } else await copyFile(path.join(source,file),dest);
}
await copyFile(path.join(source,'server/worker.mjs'),path.join(target,'_worker.js'));
await writeFile(path.join(target,'online.js'),'window.GARAGE_ONLINE = true;\n');
await writeFile(path.join(target,'_routes.json'),JSON.stringify({version:1,include:['/*'],exclude:[]}));
await writeFile(path.join(target,'404.html'),'<!doctype html><html lang="it"><meta charset="utf-8"><title>Pagina non trovata</title><h1>Pagina non trovata</h1><a href="/">Torna al sito</a></html>');
console.log('Build Cloudflare pronta in dist. Configurare DB, PHOTOS e Access prima dell’uso.');
