(() => {
  const footer = document.querySelector('main > footer');
  const online = window.GarageStore?.online;
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const exportButton = document.createElement('button'); exportButton.type = 'button';
  exportButton.textContent = 'Scarica catalogo e orari';
  exportButton.onclick = async () => {
    try {
      let catalog, hours;
      if (online) { await window.GarageStore.ready; catalog = window.GarageStore.get('catalog'); hours = window.GarageStore.get('hours'); }
      else { catalog = JSON.parse(localStorage.getItem('barber-garage-admin-catalog-v1') || 'null') || window.INITIAL_CATALOG; hours = window.GarageHours.read(); }
      const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'barber-garage-backup-v1', catalog, hours }, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'barber-garage-completo.json'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { status.textContent = 'Impossibile esportare i dati. Ricarica e riprova.'; }
  };
  footer.append(exportButton, status);
  if (!online) return;
  const label = document.createElement('label'); label.textContent = 'Trasferisci i dati salvati dal pannello locale';
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; label.append(input); footer.append(label);
  input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    if (file.size > 15 * 1024 * 1024) { status.textContent = 'Il file supera 15 MB.'; return; }
    input.disabled = true; let catalogSaved = false;
    try {
      await window.GarageStore.ready;
      const backup = JSON.parse(await file.text());
      const catalog = backup.format === 'barber-garage-backup-v1' ? backup.catalog : backup;
      if (catalog?.version !== 1 || !Array.isArray(catalog.services) || !Array.isArray(catalog.products) || catalog.services.length > 300 || catalog.products.length > 300) throw Error('File catalogo non valido.');
      if (backup.hours) window.GarageHours.validate(backup.hours);
      if (!confirm('Sostituire il catalogo online con questo file? Gli orari saranno sostituiti solo se inclusi.')) return;
      status.textContent = 'Trasferimento in corso…';
      await window.GarageStore.save('catalog', catalog); catalogSaved = true;
      if (backup.hours) await window.GarageStore.save('hours', backup.hours);
      status.textContent = 'Trasferimento completato. Ricaricamento…'; location.reload();
    } catch (error) { status.textContent = (catalogSaved ? 'Catalogo trasferito, ma orari non salvati. ' : '') + error.message; }
    finally { input.disabled = false; input.value = ''; }
  };
})();
