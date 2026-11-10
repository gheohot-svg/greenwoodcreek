/* GREENWOODCREEK – Kategorie-Auswahl auf /preise/. Ohne JavaScript bleiben alle Kategorien sichtbar. */
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.gwc-price-tab'));
  var groups = Array.prototype.slice.call(document.querySelectorAll('.gwc-price-group'));
  if (!tabs.length || !groups.length) return;

  function show(id, pushHash) {
    var found = false;
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-target') === id;
      if (on) found = true;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    if (!found) return;
    groups.forEach(function (g) { g.hidden = g.id !== id; });
    if (pushHash && window.history && history.replaceState) history.replaceState(null, '', '#' + id);
  }

  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { show(t.getAttribute('data-target'), true); });
    t.addEventListener('keydown', function (e) {
      var n = null;
      if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
      if (n) { e.preventDefault(); n.focus(); show(n.getAttribute('data-target'), true); }
    });
  });

  var start = (location.hash || '').replace('#', '');
  var ids = tabs.map(function (t) { return t.getAttribute('data-target'); });
  show(ids.indexOf(start) > -1 ? start : ids[0], false);
})();
