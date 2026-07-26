/**
 * theme.js
 * Modo claro / oscuro con persistencia en localStorage.
 */

const ThemeManager = {
  init() {
    const saved = Storage.getTheme();
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = saved || (prefersDark ? 'dark' : 'light');
    this.apply(initial);

    const toggleBtn = document.getElementById('theme-toggle');
    toggleBtn?.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      this.apply(current === 'dark' ? 'light' : 'dark');
    });
  },

  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    Storage.setTheme(theme);
    const icon = document.querySelector('#theme-toggle i');
    if (icon) {
      icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
  },
};

window.ThemeManager = ThemeManager;
