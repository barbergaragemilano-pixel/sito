(() => {
  'use strict';
  const key = 'barber-garage-hours-v1';
  const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  const english = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const defaults = days.map((_, i) => ({ closed: i === 0 || i === 6, slots: [{ start: i === 5 ? '09:00' : '09:30', end: i === 5 ? '19:00' : '19:30' }] }));
  function validate(week) {
    if (!Array.isArray(week) || week.length !== 7) throw Error('Orari non validi.');
    week.forEach((day, i) => {
      if (typeof day.closed !== 'boolean' || !Array.isArray(day.slots) || day.slots.length > 2) throw Error('Orari non validi.');
      if (day.closed) return;
      if (!day.slots.length) throw Error(days[i] + ': inserisci almeno una fascia oraria.');
      day.slots.forEach((slot, n) => {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.end) || slot.start >= slot.end)
          throw Error(days[i] + ': la chiusura deve essere successiva all’apertura.');
        if (n && slot.start <= day.slots[n - 1].end) throw Error(days[i] + ': le fasce non devono sovrapporsi.');
      });
    });
    return week;
  }
  function read() { if (window.GarageStore?.online) return window.GarageStore.get('hours'); const raw = localStorage.getItem(key); return raw ? validate(JSON.parse(raw)) : structuredClone(defaults); }
  class Hours extends HTMLElement {
    connectedCallback() {
      this.refresh = () => {
        let week; try { week = read(); } catch { week = defaults; }
        this.replaceChildren();
        if (!week) { this.textContent = 'Contattaci per conoscere gli orari.'; return; }
        ['it', 'en'].forEach(lang => {
          const span = document.createElement('span'); span.dataset.l = lang;
          week.forEach((day, i) => {
            if (i) span.append(document.createElement('br'));
            span.append(document.createTextNode((lang === 'it' ? days : english)[i] + ' · ' +
              (day.closed ? (lang === 'it' ? 'Chiuso' : 'Closed') : day.slots.map(slot => slot.start + ' – ' + slot.end).join(' / '))));
          });
          this.append(span);
        });
      };
      this.changed = event => { if (event.key === key || event.key === null) this.refresh(); };
      this.refresh(); window.addEventListener('garage-data', this.refresh); window.addEventListener('storage', this.changed); window.addEventListener('focus', this.refresh); window.addEventListener('pageshow', this.refresh);
    }
    disconnectedCallback() { window.removeEventListener('garage-data', this.refresh); window.removeEventListener('storage', this.changed); window.removeEventListener('focus', this.refresh); window.removeEventListener('pageshow', this.refresh); }
  }
  customElements.define('garage-hours', Hours);
  window.GarageHours = { key, days, read, validate };
})();
