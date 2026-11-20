/* Redesign helpers: project filter chips + live count.
   Uses document-level delegation so it keeps working after Barba page swaps. */
(function () {
  'use strict';

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function applyFilter(group, value) {
    var scope = group.closest('[data-filter-scope]') || document;
    var items = scope.querySelectorAll('[data-tags]');
    var shown = 0;
    items.forEach(function (li) {
      var tags = (li.getAttribute('data-tags') || '').split(' ');
      var match = value === 'all' || tags.indexOf(value) !== -1;
      li.hidden = !match;
      if (match) shown++;
    });
    var count = scope.querySelector('[data-count]');
    if (count) count.textContent = pad(shown);
    group.querySelectorAll('.chip').forEach(function (c) {
      c.setAttribute('aria-pressed', c.getAttribute('data-filter') === value ? 'true' : 'false');
    });
    if (window.scroll && typeof window.scroll.update === 'function') {
      setTimeout(function () { try { window.scroll.update(); } catch (e) {} if (window.ScrollTrigger) ScrollTrigger.refresh(); }, 60);
    }
  }

  document.addEventListener('click', function (e) {
    var chip = e.target.closest && e.target.closest('.chip[data-filter]');
    if (!chip) return;
    var group = chip.closest('.chips');
    if (group) applyFilter(group, chip.getAttribute('data-filter'));
  });
})();
