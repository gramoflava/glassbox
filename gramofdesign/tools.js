/* gramof design — site tools: theme switch · Ko-fi · whois, in that order.

   One module for every site's top-right chrome. Drop an empty element and load
   this file BEFORE theme.js (both deferred is fine; order matters):

     <div class="site-tools" data-site-tools></div>
     <script defer src="gramofdesign/tools.js"></script>
     <script defer src="gramofdesign/theme.js"></script>

   Modifiers on the element:
     .site-tools--glass   glass surface, for pages without an app bar
     .site-tools--float   fixed to the top-right corner
     data-site-tools="no-whois"   leave out the whois link (whois itself)

   The Ko-fi panel is built on first open, so a page that never opens it never
   loads Ko-fi. It closes on the close button, Escape, or a click outside.
   Any other element with [data-kofi] opens it too. */
(function () {
  var WHOIS = 'https://whois.gramoflava.xyz';
  var KOFI = 'https://ko-fi.com/gramoflava/?hidefeed=true&widget=true&embed=true&preview=true';

  function svg(paths) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths + '</svg>';
  }
  var ICON = {
    sun: svg('<circle cx="12" cy="12" r="4"></circle><path d="M6.343 17.657l-1.414 1.414M6.343 6.343l-1.414 -1.414M17.657 6.343l1.414 -1.414M17.657 17.657l1.414 1.414M12 20v2M12 2v2M20 12h2M2 12h2"></path>'),
    moon: svg('<path d="M12 3h.393a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"></path>'),
    coffee: svg('<path d="M3 14c.83 .642 2.077 1.017 3.5 1c1.423 .017 2.67 -.358 3.5 -1c.83 -.642 2.077 -1.017 3.5 -1c1.423 -.017 2.67 .358 3.5 1"></path><path d="M8 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2M12 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2"></path><path d="M3 10h14v5a6 6 0 0 1 -6 6H9a6 6 0 0 1 -6 -6v-5zM16.746 16.726a3 3 0 1 0 .252 -5.555"></path>'),
    user: svg('<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"></path><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"></path>'),
    x: svg('<path d="M18 6L6 18M6 6l12 12"></path>')
  };

  // ── Render the module ─────────────────────────────────────────────────────
  document.querySelectorAll('[data-site-tools]').forEach(function (el) {
    var noWhois = el.getAttribute('data-site-tools') === 'no-whois';
    el.classList.add('site-tools');
    el.innerHTML =
      '<div class="segmented segmented--icon" role="group" aria-label="Color theme" data-theme-switch>' +
        '<button class="segmented__btn" type="button" data-theme="light" aria-label="Light" title="Light" aria-pressed="false">' + ICON.sun + '</button>' +
        '<button class="segmented__btn" type="button" data-theme="auto" aria-label="Auto" title="Auto" aria-pressed="false"><span>A</span></button>' +
        '<button class="segmented__btn" type="button" data-theme="dark" aria-label="Dark" title="Dark" aria-pressed="false">' + ICON.moon + '</button>' +
      '</div>' +
      '<span class="site-tools__sep" aria-hidden="true"></span>' +
      '<button class="site-tools__btn" type="button" data-kofi aria-expanded="false" aria-label="Support my work" title="Support my work">' + ICON.coffee + '</button>' +
      (noWhois ? '' :
        '<a class="site-tools__btn" href="' + WHOIS + '" aria-label="Who made this — lava" title="Who made this">' + ICON.user + '</a>');
  });

  // ── Ko-fi panel ───────────────────────────────────────────────────────────
  var panel = null, opener = null;

  function build() {
    panel = document.createElement('div');
    panel.className = 'kofi-panel';
    panel.id = 'kofi-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Support lava on Ko-fi');
    panel.hidden = true;
    panel.innerHTML =
      '<div class="kofi-panel__head"><span>Support lava</span>' +
      '<button class="site-tools__btn" type="button" data-kofi-close aria-label="Close" title="Close">' + ICON.x + '</button></div>' +
      '<iframe title="Support lava on Ko-fi" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    panel.querySelector('iframe').src = KOFI;
    panel.querySelector('[data-kofi-close]').addEventListener('click', close);
    document.body.appendChild(panel);
  }

  function mark(open) {
    document.querySelectorAll('[data-kofi]').forEach(function (t) {
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  function open(trigger) {
    if (!panel) build();
    opener = trigger;
    panel.hidden = false;
    mark(true);
    panel.querySelector('[data-kofi-close]').focus();
  }

  function close() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    mark(false);
    if (opener) opener.focus();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-kofi]');
    if (t) { e.preventDefault(); if (panel && !panel.hidden) close(); else open(t); return; }
    if (panel && !panel.hidden && !panel.contains(e.target)) close();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
})();
