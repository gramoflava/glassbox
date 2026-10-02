/* gramof design — support panel (Ko-fi).
   Any element with [data-kofi] toggles it. The panel and its iframe are built on
   first open, so pages that never open it never load Ko-fi.
   Closes on the close button, Escape, or a click outside. */
(function () {
  var SRC = 'https://ko-fi.com/gramoflava/?hidefeed=true&widget=true&embed=true&preview=true';
  var CLOSE = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"></path></svg>';
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
      '<button class="btn btn--quiet btn--icon" type="button" data-kofi-close aria-label="Close" title="Close">' + CLOSE + '</button></div>' +
      '<iframe title="Support lava on Ko-fi" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    panel.querySelector('iframe').src = SRC;
    panel.querySelector('[data-kofi-close]').addEventListener('click', close);
    document.body.appendChild(panel);
  }

  function mark(open) {
    var t = document.querySelectorAll('[data-kofi]');
    for (var i = 0; i < t.length; i++) t[i].setAttribute('aria-expanded', open ? 'true' : 'false');
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
