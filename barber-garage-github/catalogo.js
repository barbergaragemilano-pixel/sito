/* Catalogo condiviso con il pannello locale, sullo stesso host e porta. */
(() => {
  const key = 'barber-garage-admin-catalog-v1';
  const price = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  function read() {
    if (window.GarageStore?.online) return window.GarageStore.get('catalog');
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return window.INITIAL_CATALOG;
      const data = JSON.parse(raw);
      if (data.version !== 1 || !['services', 'products'].every(type => Array.isArray(data[type]) && data[type].every(item =>
        ['name', 'description', 'section', 'photo'].every(prop => typeof item[prop] === 'string') &&
        Number.isFinite(item.price) && item.price >= 0 &&
        (!item.photo || /^data:image\/(jpeg|png|webp);base64,/.test(item.photo))))) throw new Error('Catalogo non valido');
      return data;
    } catch (error) {
      console.warn('Catalogo locale non disponibile; uso il listino iniziale.', error);
      return window.INITIAL_CATALOG;
    }
  }
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  class Catalog extends HTMLElement {
    constructor() {
      super(); this.attachShadow({ mode: 'open' });
      this.refresh = () => this.render();
      this.onStorage = event => { if (event.key === key || event.key === null) this.render(); };
    }
    connectedCallback() {
      this.render(); window.addEventListener('garage-data', this.refresh); window.addEventListener('storage', this.onStorage);
      window.addEventListener('focus', this.refresh); window.addEventListener('pageshow', this.refresh);
    }
    disconnectedCallback() {
      window.removeEventListener('garage-data', this.refresh); window.removeEventListener('storage', this.onStorage);
      window.removeEventListener('focus', this.refresh); window.removeEventListener('pageshow', this.refresh);
    }
    render() {
      const products = this.getAttribute('kind') === 'products';
      const catalog = read();
      if (!catalog) {
        this.shadowRoot.replaceChildren(el('p', 'Catalogo non disponibile. Contattaci per prezzi e informazioni.'));
        return;
      }
      const items = catalog[products ? 'products' : 'services'];
      if (products) {
        const empty = items.length === 0;
        const section = this.closest('#prodotti');
        if (section) section.hidden = empty;
        document.querySelectorAll('a[href="#prodotti"]').forEach(link => {
          link.hidden = empty;
        });
      }
      const style = el('style', `
        :host{display:block;color:var(--ink);font-family:inherit}*{box-sizing:border-box}
        h3{font-family:'IBM Plex Mono',monospace;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin:0 0 18px;padding-bottom:10px;border-bottom:1px solid var(--line);overflow-wrap:anywhere}
        section{margin-bottom:36px}section:last-child{margin-bottom:0}.services{display:grid;gap:16px}
        .service{display:flex;gap:20px;justify-content:space-between;align-items:baseline}.copy{min-width:0}
        h4{font-size:17px;font-weight:600;margin:0;overflow-wrap:anywhere}.description{font-size:14px;color:var(--muted);margin:4px 0 0;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
        .price{font-family:'IBM Plex Mono',monospace;font-size:17px;white-space:nowrap;margin:0}
        .products{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:1px;background:var(--line);border:1px solid var(--line)}
        .product{background:var(--bg);min-width:0}.photo{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:var(--panel)}
        .placeholder{display:grid;place-items:center;color:var(--muted);font-size:12px}.details{padding:16px 18px 22px}.details .price{margin-top:12px}.empty{color:var(--muted);line-height:1.6}
      `);
      const fragment = document.createDocumentFragment();
      for (const section of new Set(items.map(item => item.section))) {
        const group = el('section'); group.append(el('h3', section));
        const list = el('div', undefined, products ? 'products' : 'services');
        items.filter(item => item.section === section).forEach(item => {
          const row = el('article', undefined, products ? 'product' : 'service');
          if (products) {
            if (item.photo) { const img = el('img', undefined, 'photo'); img.src = item.photo; img.alt = item.name; img.loading = 'lazy'; row.append(img); }
            else row.append(el('div', 'Foto non disponibile', 'photo placeholder'));
          }
          const copy = el('div', undefined, products ? 'details' : 'copy');
          copy.append(el('h4', item.name));
          if (item.description) copy.append(el('p', item.description, 'description'));
          const amount = el('p', price.format(item.price), 'price');
          if (products) { copy.append(amount); row.append(copy); } else row.append(copy, amount);
          list.append(row);
        });
        group.append(list); fragment.append(group);
      }
      if (!items.length) fragment.append(el('p', products ? 'Nessun prodotto disponibile al momento.' : 'Listino in aggiornamento. Contattaci per informazioni.', 'empty'));
      this.shadowRoot.replaceChildren(style, fragment);
    }
  }
  customElements.define('garage-catalog', Catalog);
})();
