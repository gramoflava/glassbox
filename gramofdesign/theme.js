/* gramof design — theme switch (light / auto / dark)
   Lifted from whois, tokenized for the family.

   1. Paste the inline no-flash snippet from README.md into <head>, BEFORE any
      stylesheet.
   2. Load this file (defer is fine) and drop the markup below anywhere:

      <div class="segmented segmented--icon" role="group" aria-label="Color theme" data-theme-switch>
        <button class="segmented__btn" data-theme="light" aria-label="Light" aria-pressed="false">&lt;sun svg&gt;</button>
        <button class="segmented__btn" data-theme="auto"  aria-label="Auto"  aria-pressed="false"><span>A</span></button>
        <button class="segmented__btn" data-theme="dark"  aria-label="Dark"  aria-pressed="false">&lt;moon svg&gt;</button>
      </div>

   Drop --icon for the word form (Light / Auto / Dark). See README for the svgs.
*/

(function () {
  var html = document.documentElement;

  function read() {
    try { return localStorage.getItem('theme'); } catch (e) { return null; }
  }

  function write(t) {
    try {
      if (t === 'auto') localStorage.removeItem('theme');
      else localStorage.setItem('theme', t);
    } catch (e) { /* private mode — theme just won't persist */ }
  }

  function apply(t) {
    html.classList.remove('theme-light', 'theme-dark');
    if (t === 'light') html.classList.add('theme-light');
    if (t === 'dark') html.classList.add('theme-dark');
    document.querySelectorAll('[data-theme-switch] [data-theme]').forEach(function (btn) {
      var active = btn.dataset.theme === t;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: t } }));
  }

  function init() {
    apply(read() || 'auto');
    document.querySelectorAll('[data-theme-switch] [data-theme]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        write(btn.dataset.theme);
        apply(btn.dataset.theme);
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Repaint charts etc. when the system flips while on "auto".
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (!read()) apply('auto');
    });
  }
})();
