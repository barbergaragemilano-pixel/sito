/* Prototipo locale: nessuna scrittura sul sito pubblico. */
(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const key = 'barber-garage-admin-catalog-v1';
  const money = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const store = window.GarageStore;
  const online = store?.online === true;
  let data = structuredClone(window.INITIAL_CATALOG || { version: 1, services: [], products: [] });
  if (online) {
    document.querySelectorAll('main button').forEach(button => button.disabled = true);
    try { await store.ready; data = structuredClone(store.get('catalog')); }
    catch (error) { document.getElementById('status').textContent = error.message; return; }
    document.querySelectorAll('main button').forEach(button => button.disabled = false);
  }
  let tab = 'services', editing = null, pendingDelete = null, photo = '', dirty = false, photoBusy = false;
  let storageBlocked = false, photoGeneration = 0, saving = false;
  const form = $('form');
  const field = name => form.elements.namedItem(name);
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function validCatalog(value) {
    return value?.version === 1 && ['services', 'products'].every(type =>
      Array.isArray(value[type]) && value[type].every(item =>
        typeof item.id === 'string' && typeof item.name === 'string' &&
        typeof item.description === 'string' && typeof item.section === 'string' &&
        Number.isFinite(item.price) && item.price >= 0 && typeof item.photo === 'string' &&
        (!item.photo || /^data:image\/(jpeg|png|webp);base64,/.test(item.photo))));
  }
  try {
    const stored = online ? null : localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!validCatalog(parsed)) throw new Error('Dati non validi');
      data = parsed;
    }
  } catch {
    storageBlocked = true;
    $('status').textContent = 'Impossibile leggere i dati salvati. Le modifiche sono bloccate per non sovrascriverli. Prova a riaprire la pagina in un browser con archiviazione locale disponibile.';
  }
  async function persist(next) {
    if (online) { data = await store.save('catalog', next); return; }
    if (storageBlocked) throw new Error('Archiviazione locale non disponibile.');
    // Rileva modifiche provenienti da un'altra scheda prima di sovrascriverle.
    const current = localStorage.getItem(key);
    if (current && JSON.parse(current).updatedAt !== data.updatedAt) {
      throw new Error('Il catalogo è cambiato in un’altra scheda. Ricarica la pagina prima di salvare.');
    }
    next.updatedAt = new Date().toISOString();
    try { localStorage.setItem(key, JSON.stringify(next)); }
    catch { throw new Error('Salvataggio non riuscito: spazio esaurito o archiviazione disabilitata. Prova con una foto più piccola.'); }
    data = next;
  }
  function sections() { return [...new Set(data[tab].map(item => item.section))]; }
  function render() {
    const product = tab === 'products';
    $('list-title').textContent = product ? 'Prodotti' : 'Servizi';
    $('add').textContent = product ? '+ Aggiungi prodotto' : '+ Aggiungi servizio';
    $('add').disabled = storageBlocked;
    for (const type of ['services', 'products']) $(type + '-count').textContent = data[type].length;
    document.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === tab)));
    const selected = $('filter').value;
    $('filter').replaceChildren(new Option('Tutte le sezioni', ''));
    sections().forEach(section => $('filter').add(new Option(section, section)));
    if (sections().includes(selected)) $('filter').value = selected;
    $('list').replaceChildren();
    const query = $('search').value.trim().toLocaleLowerCase('it');
    const items = data[tab].filter(item => (!$('filter').value || item.section === $('filter').value) &&
      (item.name + ' ' + item.description + ' ' + item.section).toLocaleLowerCase('it').includes(query));
    for (const section of sections()) {
      const entries = items.filter(item => item.section === section);
      if (!entries.length) continue;
      const group = node('section', undefined, 'group');
      group.append(node('h3', section));
      const rows = node('div', undefined, 'rows');
      entries.forEach(item => {
        const row = node('article', undefined, 'row');
        if (product) {
          if (item.photo) {
            const img = node('img', undefined, 'thumb'); img.src = item.photo; img.alt = ''; img.loading = 'lazy'; row.append(img);
          } else row.append(node('span', 'No foto', 'thumb placeholder'));
        }
        const copy = node('div', undefined, 'row-copy');
        copy.append(node('h4', item.name));
        if (item.description) copy.append(node('p', item.description));
        row.append(copy, node('span', money.format(item.price), 'price'));
        const actions = node('div', undefined, 'row-actions');
        const edit = node('button', 'Modifica'); edit.type = 'button'; edit.disabled = storageBlocked;
        edit.setAttribute('aria-label', 'Modifica ' + item.name); edit.onclick = () => openEditor(item);
        const remove = node('button', 'Elimina', 'delete'); remove.type = 'button'; remove.disabled = storageBlocked;
        remove.setAttribute('aria-label', 'Elimina ' + item.name);
        remove.onclick = () => {
          pendingDelete = item.id; $('delete-name').textContent = item.name;
          $('delete-error').textContent = ''; $('delete-dialog').showModal(); $('delete-cancel').focus();
        };
        actions.append(edit, remove); row.append(actions); rows.append(row);
      });
      group.append(rows); $('list').append(group);
    }
    if (!items.length) $('list').append(node('p', data[tab].length ? 'Nessun risultato. Prova un’altra ricerca o sezione.' : 'Il catalogo è vuoto. Aggiungi la prima voce.', 'empty'));
    $('saved').textContent = data.updatedAt ? 'Ultimo salvataggio: ' + new Date(data.updatedAt).toLocaleString('it-IT') : 'Catalogo iniziale del sito';
  }
  function showPhoto() {
    $('preview').replaceChildren();
    if (photo) { const img = node('img'); img.src = photo; img.alt = 'Anteprima foto prodotto'; $('preview').append(img); }
    else $('preview').textContent = 'Nessuna foto';
    $('remove-photo').hidden = !photo;
  }
  function openEditor(item = null) {
    editing = item?.id || null; dirty = false; photoBusy = false; photoGeneration++;
    form.reset(); $('form-error').textContent = ''; $('save').disabled = false;
    $('editor-title').textContent = (item ? 'Modifica ' : 'Nuovo ') + (tab === 'products' ? 'prodotto' : 'servizio');
    for (const name of ['name', 'section', 'description']) field(name).value = item?.[name] || '';
    field('price').value = item ? item.price.toFixed(2).replace('.', ',') : '';
    if (!item) field('section').value = $('filter').value;
    field('section').placeholder = tab === 'products' ? 'Es. Capelli, Barba, Accessori' : 'Es. Capelli, Barba';
    $('sections').replaceChildren(...sections().map(section => new Option(section, section)));
    photo = item?.photo || ''; showPhoto(); $('photo-field').hidden = tab !== 'products';
    $('editor').showModal(); field('name').focus();
  }
  function closeEditor() {
    if (saving) return;
    if (dirty && !window.confirm('Vuoi uscire senza salvare le modifiche?')) return;
    photoGeneration++; dirty = false; $('editor').close();
  }
  $('add').onclick = () => openEditor();
  $('close').onclick = $('cancel').onclick = closeEditor;
  $('editor').addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
  form.addEventListener('input', () => { dirty = true; });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (photoBusy || $('save').disabled) return;
    const name = field('name').value.trim(), description = field('description').value.trim();
    let section = field('section').value.trim();
    const rawPrice = field('price').value.trim();
    if (!name || !section || !/^\d+([.,]\d{1,2})?$/.test(rawPrice)) {
      $('form-error').textContent = 'Compila nome, sezione e un prezzo valido (es. 25,00).'; return;
    }
    const price = Number(rawPrice.replace(',', '.'));
    if (!Number.isFinite(price) || price > 999999) { $('form-error').textContent = 'Inserisci un prezzo tra 0 e 999.999 €.'; return; }
    section = sections().find(value => value.toLocaleLowerCase('it') === section.toLocaleLowerCase('it')) || section;
    const next = structuredClone(data);
    const item = { id: editing || crypto.randomUUID(), name, description, section, price, photo: tab === 'products' ? photo : '' };
    if (editing) next[tab] = next[tab].map(old => old.id === editing ? item : old);
    else next[tab].push(item);
    $('save').disabled = true;
    saving = true;
    try {
      await persist(next); dirty = false; $('editor').close(); $('filter').value = ''; $('search').value = ''; render();
      $('status').textContent = '“' + name + '” salvato.';
    } catch (error) { $('form-error').textContent = error.message; }
    finally { saving = false; $('save').disabled = false; }
  });
  $('delete-cancel').onclick = () => $('delete-dialog').close();
  $('delete-confirm').onclick = async () => {
    if ($('delete-confirm').disabled) return;
    $('delete-confirm').disabled = true;
    const next = structuredClone(data); next[tab] = next[tab].filter(item => item.id !== pendingDelete);
    try { await persist(next); $('delete-dialog').close(); render(); $('status').textContent = 'Voce eliminata dal catalogo.'; }
    catch (error) { $('delete-error').textContent = error.message; }
    finally { $('delete-confirm').disabled = false; }
  };
  $('remove-photo').onclick = () => { photoGeneration++; photo = ''; dirty = true; photoBusy = false; $('save').disabled = false; $('photo').value = ''; showPhoto(); };
  $('photo').addEventListener('change', async () => {
    const file = $('photo').files[0]; if (!file) return;
    const generation = ++photoGeneration;
    $('form-error').textContent = '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      $('form-error').textContent = 'Scegli una foto JPG, PNG o WebP di massimo 10 MB.'; $('photo').value = ''; return;
    }
    photoBusy = true; $('save').disabled = true;
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url; await img.decode();
      const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      if (generation === photoGeneration) { photo = canvas.toDataURL('image/jpeg', .8); dirty = true; showPhoto(); }
    } catch { if (generation === photoGeneration) $('form-error').textContent = 'Non riesco ad aprire questa foto. Prova con un altro file.'; }
    finally { URL.revokeObjectURL(url); if (generation === photoGeneration) { photoBusy = false; $('save').disabled = false; } }
  });
  document.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => {
    tab = button.dataset.tab; $('filter').value = ''; $('search').value = ''; if (!storageBlocked) $('status').textContent = ''; render();
  });
  $('search').addEventListener('input', render); $('filter').addEventListener('change', render);
  $('export').onclick = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = node('a'); link.href = url;
    link.download = 'barber-garage-catalogo-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('storage', event => { if (event.key === key) $('status').textContent = 'Catalogo modificato in un’altra scheda. Ricarica questa pagina per vedere le modifiche.'; });
  render();
})();
