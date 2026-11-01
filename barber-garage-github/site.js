(() => {
  'use strict';
  const root = document.querySelector('[data-theme][data-lang]');
  const language = document.getElementById('toggle-language');
  const theme = document.getElementById('toggle-theme');
  language.addEventListener('click', () => {
    const lang = root.dataset.lang === 'it' ? 'en' : 'it';
    root.dataset.lang = lang;
    document.documentElement.lang = lang;
    language.setAttribute('aria-label', lang === 'it' ? 'Cambia lingua' : 'Change language');
  });
  theme.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    theme.textContent = root.dataset.theme === 'dark' ? 'LIGHT' : 'DARK';
  });
})();
