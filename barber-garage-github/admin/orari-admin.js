(async () => {
  const $ = id => document.getElementById(id);
  const api = window.GarageHours;
  const online = window.GarageStore?.online === true;
  if (online) {
    $('hours-save').disabled = true;
    try { await window.GarageStore.ready; }
    catch (error) { $('hours-message').textContent = error.message; return; }
  }
  let dirty = false, snapshot;
  const form = $('hours-form');
  function build() {
    $('hours-message').textContent = '';
    let week;
    try { week = api.read(); snapshot = online ? null : localStorage.getItem(api.key); }
    catch { $('hours-message').textContent = 'Impossibile leggere gli orari salvati. Ricarica la pagina o verifica le impostazioni del browser.'; $('hours-save').disabled = true; return; }
    $('hours-save').disabled = false;
    $('hours-days').replaceChildren();
    week.forEach((day, index) => {
      const row = document.createElement('fieldset'); row.className = 'hours-day';
      const legend = document.createElement('legend'); legend.textContent = api.days[index]; row.append(legend);
      const label = document.createElement('label'); label.className = 'hours-closed';
      const closed = document.createElement('input'); closed.type = 'checkbox'; closed.name = 'closed-' + index; closed.checked = day.closed;
      label.append(closed, ' Chiuso'); row.append(label);
      const slots = document.createElement('div'); slots.className = 'hours-slots';
      for (let n = 0; n < 2; n++) {
        const slot = document.createElement('div'); slot.className = 'hours-slot';
        ['start', 'end'].forEach((part, p) => {
          const wrapper = document.createElement('label'); wrapper.textContent = (p ? 'Alle' : 'Dalle') + (n ? ' (seconda fascia)' : '');
          const input = document.createElement('input'); input.type = 'time'; input.name = `${part}-${index}-${n}`; input.value = day.slots[n]?.[part] || ''; input.required = !n && !day.closed; input.disabled = day.closed;
          wrapper.append(input); slot.append(wrapper);
        });
        slots.append(slot);
      }
      closed.onchange = () => slots.querySelectorAll('input').forEach((input, n) => { input.disabled = closed.checked; input.required = !closed.checked && n < 2; });
      row.append(slots); $('hours-days').append(row);
    });
    dirty = false;
  }
  $('hours-tab').onclick = () => {
    document.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed', 'false'));
    $('hours-tab').setAttribute('aria-pressed', 'true'); $('catalog-panel').hidden = true; $('hours-panel').hidden = false;
  };
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
    $('hours-tab').setAttribute('aria-pressed', 'false'); $('hours-panel').hidden = true; $('catalog-panel').hidden = false;
  }));
  form.addEventListener('input', () => { dirty = true; $('hours-message').textContent = 'Modifiche non ancora salvate.'; });
  $('hours-cancel').onclick = () => { if (!dirty || confirm('Annullare le modifiche agli orari?')) build(); };
  form.onsubmit = async event => {
    event.preventDefault();
    const week = api.days.map((_, i) => ({
      closed: form.elements.namedItem('closed-' + i).checked,
      slots: [0, 1].map(n => ({ start: form.elements.namedItem(`start-${i}-${n}`).value, end: form.elements.namedItem(`end-${i}-${n}`).value })).filter(slot => slot.start || slot.end)
    }));
    try {
      api.validate(week);
      if (online) {
        $('hours-save').disabled = true;
        try {
          await window.GarageStore.save('hours', week);
          dirty = false; $('hours-message').textContent = 'Orari salvati sul sito.';
        } finally { $('hours-save').disabled = false; }
        return;
      }
      if (localStorage.getItem(api.key) !== snapshot) throw Error('Gli orari sono cambiati in un’altra scheda. Premi Annulla modifiche per caricarli.');
      const encoded = JSON.stringify(week);
      try { localStorage.setItem(api.key, encoded); } catch { throw Error('Salvataggio non riuscito. Verifica lo spazio e le impostazioni del browser.'); }
      snapshot = encoded; dirty = false; $('hours-message').textContent = 'Orari salvati. Il sito locale è aggiornato.';
    } catch (error) { $('hours-message').textContent = error.message; }
  };
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  build();
})();
