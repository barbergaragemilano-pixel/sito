(() => {
  const online = window.GARAGE_ONLINE === true;
  const cache = {}, revisions = {};
  async function request(path, options = {}) {
    const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin', redirect: 'error', ...options });
    let payload; try { payload = await response.json(); } catch { throw Error('Accesso scaduto o servizio non disponibile. Ricarica la pagina.'); }
    if (!response.ok) throw Error(payload.error || 'Operazione non riuscita.');
    return payload;
  }
  async function load(name) {
    const result = await request('/api/' + name);
    cache[name] = result.data; revisions[name] = result.revision;
    window.dispatchEvent(new CustomEvent('garage-data', { detail: name }));
    return result.data;
  }
  async function upload(photo) {
    if (!photo || photo.startsWith('/media/')) return photo;
    if (!/^data:image\/jpeg;base64,/.test(photo)) throw Error('Ricarica la foto in formato JPEG.');
    const bytes = Uint8Array.from(atob(photo.split(',')[1]), char => char.charCodeAt(0));
    return (await request('/api/admin/photos', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-Garage-Admin': '1' }, body: bytes })).url;
  }
  let saving = false;
  async function save(name, value) {
    if (saving) throw Error('Attendi il completamento del salvataggio.');
    saving = true;
    try {
      const data = structuredClone(value);
      if (name === 'catalog') for (const item of data.products) item.photo = await upload(item.photo);
      const result = await request('/api/admin/' + name, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Garage-Admin': '1' }, body: JSON.stringify({ data, revision: revisions[name] }) });
      cache[name] = result.data; revisions[name] = result.revision;
      window.dispatchEvent(new CustomEvent('garage-data', { detail: name }));
      return result.data;
    } finally { saving = false; }
  }
  const admin = /\/admin(?:\/|$)/.test(location.pathname);
  const ready = online ? (async () => {
    if (admin) await request('/api/admin/session');
    await Promise.all([load('catalog'), load('hours')]);
  })() : Promise.resolve();
  // Consumers handle the failure; attach a handler immediately to avoid unhandled rejection.
  ready.catch(() => {});
  window.GarageStore = { online, ready, get: name => cache[name], load, save };
  if (online && !admin) window.addEventListener('focus', () => {
    Promise.all([load('catalog'), load('hours')]).catch(() => {});
  });
})();
