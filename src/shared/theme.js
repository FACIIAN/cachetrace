/* Light/dark theme. The choice is stored in localStorage; the default is dark. The change fades for half a second. */
(function () {
  'use strict';
  var KEY = 'ct-theme', root = document.documentElement;
  function stored() { try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; } catch (e) { return null; } }
  function apply(t) {
    root.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'dark' ? '#0B0D10' : '#EEF1F5');
  }
  apply(stored() || 'dark');
  var en = (root.lang || '').indexOf('en') === 0;
  function label(t) { return en ? (t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme') : (t === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'); }
  var timer;
  document.addEventListener('DOMContentLoaded', function () {
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    function sync() {
      var t = root.getAttribute('data-theme');
      var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'dark' ? '#0B0D10' : '#EEF1F5');
      Array.prototype.forEach.call(buttons, function (b) { b.setAttribute('aria-label', label(t)); b.setAttribute('title', label(t)); });
    }
    sync();
    Array.prototype.forEach.call(buttons, function (b) {
      b.addEventListener('click', function () {
        var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduce) { root.classList.add('theme-anim'); void root.offsetWidth; }
        apply(next);
        try { localStorage.setItem(KEY, next); } catch (e) { /* the choice just is not remembered */ }
        sync();
        if (!reduce) { clearTimeout(timer); timer = setTimeout(function () { root.classList.remove('theme-anim'); }, 700); }
      });
    });
  });
})();
