/* AI Behavioral Profile — page behaviour. Displays saved results only; nothing is re-estimated. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var PAGE = root.getAttribute('data-page'), LANG = root.getAttribute('data-lang');
  var MINUS = '−';
  var SEP = LANG === 'zh' ? '' : ' ', STOP = LANG === 'zh' ? '。' : '.';   /* Chinese sentences join without a space */
  var ID = /^[A-Za-z0-9_.-]{1,40}$/, MEASURE = /^[A-F][0-9]$/;

  /* ------------------------------------------------------------------ helpers */
  function qs(sel, el) { return (el || doc).querySelector(sel); }
  function qsa(sel, el) { return Array.prototype.slice.call((el || doc).querySelectorAll(sel)); }
  function fill(t, o) { return String(t).replace(/\{(\w+)\}/g, function (m, k) { return o[k] !== undefined ? o[k] : m; }); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } return null; }
  function getParams() { return new URLSearchParams(location.search); }
  function query(pairs) {
    var out = [];
    pairs.forEach(function (p) { if (p[1] !== null && p[1] !== undefined && p[1] !== '') out.push(p[0] + '=' + encodeURIComponent(p[1]).replace(/%2C/g, ',')); });
    return out.length ? '?' + out.join('&') : '';
  }
  function setUrl(search, hash, push) {
    var url = location.pathname + search + (hash === undefined ? location.hash : hash);
    if (push) history.pushState(null, '', url); else history.replaceState(history.state, '', url);
    carryLanguage();
  }
  /* Same rounding as build.py (toFixed: exact binary value, ties away from zero). */
  function fmtNum(v, places, signed, pct) {
    if (v === null || v === undefined) return '';
    if (Math.abs(v) < 1e-9) v = 0;   /* floating-point residue of an exact zero (e.g. 4.4e-16) is zero, not "<0.1" */
    if (pct) v = v * 100;
    var s = Math.abs(v).toFixed(places), step = '0.' + new Array(places).join('0') + '1';
    if (v !== 0 && Number(s) === 0) { var body = '<' + step; return (signed || v < 0) ? (v > 0 ? '+' : MINUS) + body : body; }
    if (Number(s) === 0) return s;
    if (v < 0) return MINUS + s;
    return signed ? '+' + s : s;
  }
  function pos(v, dom) { var lo = dom[0], hi = dom[1]; v = Math.min(hi, Math.max(lo, v)); return Math.round((v - lo) / (hi - lo) * 1e6) / 1e4; }
  function listParam(v, re) { return (v || '').split(',').filter(function (x) { return re.test(x); }); }

  /* ------------------------------------------------------------------ theme */
  function isDark() { var t = root.getAttribute('data-theme'); return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
  function syncTheme() {
    var b = qs('[data-theme-toggle]'); if (!b) return;
    var dark = isDark();
    qs('[data-theme-text]', b).textContent = dark ? b.getAttribute('data-label-light') : b.getAttribute('data-label-dark');
    b.setAttribute('aria-label', dark ? b.getAttribute('data-switch-light') : b.getAttribute('data-switch-dark'));   /* the action, e.g. "Switch to dark appearance" */
  }
  function initTheme() {
    var b = qs('[data-theme-toggle]'); if (!b) return;
    b.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next); store('bp-theme', next); syncTheme();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);
    syncTheme();
  }

  /* ------------------------------------------------------------------ language links keep the current view */
  function carryLanguage() {
    qsa('[data-lang-link]').forEach(function (a) {
      var base = a.getAttribute('href').split(/[?#]/)[0];
      a.setAttribute('href', base + location.search + location.hash);
    });
  }
  function initLanguage() {
    carryLanguage();
    qsa('[data-lang-link]').forEach(function (a) { a.addEventListener('click', function () { store('bp-lang', a.getAttribute('data-lang-link')); }); });
    addEventListener('hashchange', carryLanguage);
  }

  /* On phones the navigation row scrolls sideways; keep the current page's tab in view, clear of the right-edge
     fade. Measured again once the web fonts have loaded (they widen the tabs). A left fade shows once scrolled. */
  function initNav() {
    var nav = qs('.site-nav'), cur = qs('.site-nav a[aria-current="page"]');
    if (!nav) return;
    function edge() { nav.classList.toggle('is-scrolled', nav.scrollLeft > 2); }
    function keep() {
      if (cur && nav.scrollWidth > nav.clientWidth) {
        var over = cur.getBoundingClientRect().right - (nav.getBoundingClientRect().right - 40);   /* 30px fade + 10px air */
        if (over > 0) nav.scrollLeft += over;
      }
      edge();
    }
    keep();
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(keep);
    nav.addEventListener('scroll', edge, { passive: true });
  }

  /* Tables wider than their box scroll sideways: fade the clipped edge(s) and let the keyboard scroll them.
     Rechecked on resize and whenever a folded section opens (closed tables have no width). */
  function initScrollCues() {
    function cue(w) {
      var over = w.scrollWidth - w.clientWidth > 1;
      w.classList.toggle('is-clipped-start', over && w.scrollLeft > 1);
      w.classList.toggle('is-clipped-end', over && w.scrollLeft < w.scrollWidth - w.clientWidth - 1);
      if (over && !w.hasAttribute('tabindex')) {
        var cap = qs('caption', w);
        w.setAttribute('tabindex', '0'); w.setAttribute('role', 'region');
        if (cap) w.setAttribute('aria-label', cap.textContent.trim());
      } else if (!over && w.getAttribute('role') === 'region') {
        w.removeAttribute('tabindex'); w.removeAttribute('role'); w.removeAttribute('aria-label');
      }
    }
    function all() { qsa('.table-wrap').forEach(function (w) { if (w.offsetParent) cue(w); }); }
    qsa('.table-wrap').forEach(function (w) { w.addEventListener('scroll', function () { cue(w); }, { passive: true }); });
    all();
    addEventListener('resize', all);
    doc.addEventListener('toggle', function (e) { if (e.target.open) qsa('.table-wrap', e.target).forEach(cue); }, true);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(all);
    return all;   /* rechecked again once the Methods formulas are typeset (they change table widths) */
  }

  /* ------------------------------------------------------------------ table of contents: mark the section in view */
  function watchToc(ids) {
    var links = {}; qsa('[data-toc]').forEach(function (a) { links[a.getAttribute('data-toc')] = a; });
    if (!('IntersectionObserver' in window)) return;
    var visible = {}, queued = false, current = null;
    function mark() {
      queued = false;
      var shown = ids.filter(function (id) { return visible[id]; });
      if (!shown.length) return;
      // the reading line sits where an anchor jump puts a section's top (page scroll-padding plus the section's
      // scroll-margin, e.g. below the home page's sticky controls). Sections nest (a category holds its shared
      // method and measures), so mark the innermost section across that line, else the innermost in the band.
      var line = (parseFloat(getComputedStyle(doc.documentElement).scrollPaddingTop) || 0)
        + (parseFloat(getComputedStyle(doc.getElementById(shown[0])).scrollMarginTop) || 0) + 8;
      var reading = shown.filter(function (id) {
        var r = doc.getElementById(id).getBoundingClientRect(); return r.top <= line && r.bottom > line;
      });
      var pool = reading.length ? reading : shown;
      var first = pool.filter(function (id) {
        var el = doc.getElementById(id);
        return !pool.some(function (o) { return o !== id && el.contains(doc.getElementById(o)); });
      })[0];
      // at the very end of the page the last sections can never reach the reading line: mark the last one shown
      if (innerHeight + scrollY >= doc.documentElement.scrollHeight - 2) {
        var onScreen = ids.filter(function (id) { var el = doc.getElementById(id), r = el && el.getBoundingClientRect(); return r && r.top < innerHeight && r.bottom > 0; });
        if (onScreen.length) first = onScreen[onScreen.length - 1];
      }
      if (!first || first === current) return;
      current = first;
      Object.keys(links).forEach(function (k) { if (k === first) links[k].setAttribute('aria-current', 'true'); else links[k].removeAttribute('aria-current'); });
      // keep the marked entry visible inside a contents list that scrolls on its own (never scrolls the page)
      var a = links[first], box = a && a.closest('.toc');
      if (box && box.scrollHeight > box.clientHeight) {
        var ar = a.getBoundingClientRect(), br = box.getBoundingClientRect();
        if (ar.top < br.top + 12) box.scrollTop -= br.top + 12 - ar.top;
        else if (ar.bottom > br.bottom - 12) box.scrollTop += ar.bottom - (br.bottom - 12);
      }
    }
    function later() { if (!queued) { queued = true; requestAnimationFrame(mark); } }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
      later();
    }, { rootMargin: '-140px 0px -55% 0px' });
    ids.forEach(function (id) { var el = doc.getElementById(id); if (el) io.observe(el); });
    // a short scroll or jump within the same sections changes no intersection, so look again as the page moves
    addEventListener('scroll', later, { passive: true });
  }

  /* ------------------------------------------------------------------ home */
  /* "How to read the chart": folded by default on phones, always open (not a toggle) on wider screens. */
  function initLegend() {
    var legend = qs('[data-legend]'); if (!legend) return;
    var summary = qs('summary', legend), narrow = matchMedia('(max-width: 640px)');
    function sync() {
      legend.open = !narrow.matches; summary.tabIndex = narrow.matches ? 0 : -1;
      // wide screens: the heading cannot fold, so it must not be announced as a working toggle
      if (narrow.matches) summary.removeAttribute('aria-disabled'); else summary.setAttribute('aria-disabled', 'true');
    }
    summary.addEventListener('click', function (e) { if (!narrow.matches) e.preventDefault(); });
    narrow.addEventListener('change', sync);
    sync();
  }

  function initHome() {
    var results = qs('.results'); if (!results) return;
    var measures = qsa('details.measure', results);
    var hlSel = qs('[data-highlight]'), sortSel = qs('[data-sort]'), clearBtn = qs('[data-clear-highlight]'), status = qs('[data-hl-status]');
    var profileLink = qs('[data-profile-link]');
    var modelIds = qsa('option', hlSel).map(function (o) { return o.value; }).filter(Boolean);
    var p = getParams();
    var state = { hl: p.get('hl') || '', sort: p.get('sort') || '' };
    if (modelIds.indexOf(state.hl) < 0) state.hl = '';
    if (state.sort !== 'high' && state.sort !== 'low') state.sort = '';
    if (p.has('open')) {
      var open = listParam(p.get('open'), MEASURE);
      measures.forEach(function (d) { d.open = open.indexOf(d.id) >= 0; });
    }
    var restoring = true;

    function openIds() { return measures.filter(function (d) { return d.open; }).map(function (d) { return d.id; }); }
    function stateQuery(extra) {
      var open = openIds(), dflt = open.length === 1 && open[0] === 'A1';
      return query((extra || []).concat([['hl', state.hl], ['sort', state.sort], ['open', dflt ? '' : (open.length ? open.join(',') : 'none')]]));
    }
    function writeState() { if (restoring) return; setUrl(stateQuery()); carryLinks(); }
    function carryLinks() {
      qsa('a[data-carry="methods"]').forEach(function (a) {
        var base = a.getAttribute('href').split(/[?#]/)[0];
        a.setAttribute('href', base + stateQuery([['from', 'home']]) + '#' + a.getAttribute('data-anchor'));
      });
      if (profileLink) profileLink.setAttribute('href', profileLink.getAttribute('data-base') + (state.hl ? '?models=' + state.hl : ''));
    }
    function applyHighlight() {
      results.classList.toggle('is-highlighting', !!state.hl);
      qsa('.row[data-model], .mini-line[data-model]', results).forEach(function (r) {
        var on = r.getAttribute('data-model') === state.hl;
        r.classList.toggle('is-hl', on);
        if (r.classList.contains('row')) {
          var sr = qs('.sr', r), tag = qs('.hl-sr', sr);
          if (on && !tag) { tag = doc.createElement('span'); tag.className = 'hl-sr'; tag.textContent = ' (' + status.getAttribute('data-row-label') + ')'; sr.appendChild(tag); }
          if (!on && tag) tag.remove();
        }
      });
      hlSel.value = state.hl;
      clearBtn.hidden = !state.hl;
      var opt = state.hl ? qs('option[value="' + state.hl + '"]', hlSel) : null;
      status.textContent = opt ? fill(status.getAttribute('data-template'), { model: opt.textContent }) : '';
      stickyPad();
    }
    /* While the results controls stick below the header, keyboard focus and anchor jumps must land clear of both:
       the page's scroll-padding then covers header + controls, and the measures drop their own scroll-margin. */
    var controls = qs('.controls');
    function stickyPad() {
      if (!controls) return;
      var cs = getComputedStyle(controls);
      if (cs.position === 'sticky') {
        root.style.scrollPaddingTop = Math.ceil((parseFloat(cs.top) || 0) + controls.offsetHeight + 12) + 'px';
        root.classList.add('has-sticky-pad');
      } else {
        root.style.scrollPaddingTop = '';
        root.classList.remove('has-sticky-pad');
      }
    }
    addEventListener('resize', stickyPad);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(stickyPad);
    function applySort(animate) {
      var still = !animate || matchMedia('(prefers-reduced-motion: reduce)').matches;
      measures.forEach(function (d) {
        var list = qs('ol.rows', d); if (!list) return;
        var rows = qsa(':scope > li', list);
        var before = !still && d.open ? rows.map(function (r) { return r.getBoundingClientRect().top; }) : null;
        var original = rows.slice();
        rows.sort(function (a, b) {
          if (!state.sort) return a.getAttribute('data-i') - b.getAttribute('data-i');
          var va = a.getAttribute('data-center'), vb = b.getAttribute('data-center');
          if (va === null && vb === null) return a.getAttribute('data-i') - b.getAttribute('data-i');
          if (va === null) return 1; if (vb === null) return -1;
          var diff = state.sort === 'high' ? vb - va : va - vb;
          return diff || a.getAttribute('data-i') - b.getAttribute('data-i');
        });
        rows.forEach(function (r) { list.appendChild(r); });
        if (before && r0animate(original, before)) { /* animated */ }
        var svg = qs('svg.mini', d);
        if (svg) {
          var y0 = parseFloat(svg.getAttribute('data-y0')), lh = parseFloat(svg.getAttribute('data-lh'));
          rows.forEach(function (r, i) {
            var g = qs('.mini-line[data-model="' + r.getAttribute('data-model') + '"]', svg);
            if (g) g.setAttribute('transform', 'translate(0 ' + (y0 + i * lh).toFixed(2) + ')');
          });
        }
      });
      sortSel.value = state.sort;
    }
    /* Slide rows from their old place to the new one (skipped when reduced motion is requested). */
    function r0animate(original, before) {
      if (!Element.prototype.animate) return false;
      original.forEach(function (r, i) {
        var dy = before[i] - r.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) r.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.75,.2,1)' });
      });
      return true;
    }
    function openTarget(id, scroll) {
      var d = doc.getElementById(id);
      if (!d || !d.matches('details.measure')) return;
      if (!d.open) d.open = true;
      if (scroll) d.scrollIntoView({ block: 'start' });
    }

    hlSel.addEventListener('change', function () { state.hl = hlSel.value; applyHighlight(); writeState(); });
    clearBtn.addEventListener('click', function () { state.hl = ''; applyHighlight(); writeState(); hlSel.focus(); });
    sortSel.addEventListener('change', function () { state.sort = sortSel.value; applySort(true); writeState(); });
    qsa('[data-expand]').forEach(function (b) {
      b.addEventListener('click', function () {
        var all = b.getAttribute('data-expand') === 'all';
        restoring = true; measures.forEach(function (d) { d.open = all; }); restoring = false; writeState();
      });
    });
    measures.forEach(function (d) { d.addEventListener('toggle', writeState); });
    var jump = qs('[data-jump]');
    if (jump) jump.addEventListener('change', function () {
      if (!MEASURE.test(jump.value)) return;
      var id = jump.value; jump.value = '';
      if (location.hash.slice(1) === id) openTarget(id, true);   /* same address again: setting it would not scroll */
      else { openTarget(id, false); location.hash = id; }
    });
    qsa('.toc a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function () { openTarget(a.getAttribute('href').slice(1), false); });
    });
    addEventListener('hashchange', function () { var id = location.hash.slice(1); if (MEASURE.test(id)) openTarget(id, true); });

    applyHighlight(); applySort(false);
    var h = location.hash.slice(1);
    if (MEASURE.test(h)) openTarget(h, false);
    restoring = false;
    carryLinks();
    if (MEASURE.test(h)) requestAnimationFrame(function () { openTarget(h, true); });
    watchToc(measures.map(function (d) { return d.id; }));
  }

  /* ------------------------------------------------------------------ explore */
  function initExplore() {
    var el = qs('[data-explore]'); if (!el) return;
    var P = JSON.parse(qs('#explore-payload').textContent);
    var C = P.S.common, X = P.S.explore, E = P.S.extra, V = P.S.versions;
    var colon = LANG === 'zh' ? '：' : ': ';
    var view = qs('[data-view]'), loading = qs('[data-loading]');
    var DATA = null, models = {}, order = [], items = {}, changes = {};
    var selected = [], pair = null, notices = [];
    var early = false, focusLater = false;   /* a choice made before the data arrived, and whether it opened a view */
    var measureById = {}; P.measures.forEach(function (m) { measureById[m.id] = m; });

    /* chooser */
    var search = qs('[data-search]'), empty = qs('[data-search-empty]'), clearSearch = qs('[data-clear-search]');
    var chips = qs('[data-chips]'), selection = qs('[data-selection]'), selCount = qs('[data-selection-count]');
    var selStatus = qs('[data-selection-status]'), grid = qs('[data-chooser-grid]');
    function filterCards() {
      var q = search.value.trim().toLowerCase(), shown = 0;
      qsa('.model-card').forEach(function (c) { var hit = !q || c.getAttribute('data-search-text').indexOf(q) >= 0; c.hidden = !hit; if (hit) shown++; });
      empty.hidden = shown > 0; clearSearch.hidden = !q;
    }
    search.addEventListener('input', filterCards);
    clearSearch.addEventListener('click', function () { search.value = ''; filterCards(); search.focus(); });

    function syncChooser() {
      qsa('.model-card').forEach(function (c) {
        var id = c.getAttribute('data-model'), on = selected.indexOf(id) >= 0;
        c.classList.toggle('is-selected', on);
        var t = qs('[data-toggle-model]', c); if (t) t.setAttribute('aria-pressed', String(on));
      });
      chips.innerHTML = selected.map(function (id, i) {
        var name = nameOf(id);
        return '<li class="chip"><span class="ord">' + (i + 1) + '</span><span>' + esc(name) + '</span><button type="button" data-remove="' + esc(id) + '" aria-label="' + esc(fill(X.remove_model, { model: name })) + '">×</button></li>';
      }).join('');
      selection.hidden = selected.length === 0;
      selCount.textContent = '';
    }
    function announce(t) { selStatus.textContent = t; }
    // a model's name: from the data, else from its card, which is in the page before the data arrives
    function nameOf(id) {
      if (models[id]) return models[id].name;
      var c = qs('.model-card[data-model="' + id + '"] .mc-title');
      return c ? c.textContent : id;
    }
    function writeUrl(push) {
      var q = pair ? query([['pair', pair.pair]]) : query([['models', selected.join(',')]]);
      setUrl(q, undefined, push);
    }
    el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-open-model],[data-toggle-model],[data-remove],[data-clear-selection],[data-version-open],[data-add-focus]');
      if (!t) return;
      if (t.hasAttribute('data-open-model')) {
        e.preventDefault(); pair = null; selected = [t.getAttribute('data-open-model')];
        announce(fill(X.selected_status, { model: nameOf(selected[0]) })); update(true, true);
      } else if (t.hasAttribute('data-toggle-model')) {
        var id = t.getAttribute('data-toggle-model'), i = selected.indexOf(id); pair = null;
        if (i >= 0) { selected.splice(i, 1); announce(fill(X.removed_status, { model: nameOf(id) })); }
        else { selected.push(id); announce(fill(X.selected_status, { model: nameOf(id) })); }
        update(false, false);
      } else if (t.hasAttribute('data-remove')) {
        var rid = t.getAttribute('data-remove'), at = selected.indexOf(rid); selected = selected.filter(function (x) { return x !== rid; }); pair = null;
        announce(fill(X.removed_status, { model: nameOf(rid) })); update(false, false);
        // the chip list was rebuilt: keep focus on the neighbouring chip's remove button, else on the search box
        var next = qsa('[data-remove]', chips)[Math.min(at, selected.length - 1)];
        if (next) next.focus(); else { grid.open = true; search.focus(); }
      } else if (t.hasAttribute('data-clear-selection')) {
        selected = []; pair = null; announce(X.selection_cleared); update(false, false);
        grid.open = true; search.focus();
      } else if (t.hasAttribute('data-version-open')) {
        e.preventDefault(); var pr = P.pairs.filter(function (x) { return x.pair === t.getAttribute('data-version-open'); })[0];
        if (pr) { pair = pr; selected = [pr.old_model, pr.new_model]; update(true, true); }
      } else if (t.hasAttribute('data-add-focus')) {
        e.preventDefault(); grid.open = true; qs('[data-chooser]').scrollIntoView({ block: 'start' }); search.focus({ preventScroll: true });
      }
    });

    /* measure rendering: mirrors templates/macros.html.j2 */
    function rowData(mid, id) {
      var m = measureById[mid], it = (items[id] || {})[mid], mod = models[id];
      var base = { model: id, name: mod ? mod.name : id, provider: mod ? mod.provider : '', notes: notesFor(id, mid) };
      if (!mod) return Object.assign(base, { missing: true, unknown: true });
      if (!it || it.center === null || it.center === undefined || !it.reference_range) return Object.assign(base, { missing: true });
      var f = function (v) { return fmtNum(v, 1, m.signed); }, inner = it.reference_range, outer = it.validation_expanded_range || null;
      var r = Object.assign(base, {
        missing: false, center: it.center, centerText: f(it.center), unit: m.percent ? '%' : '', inner: inner, outer: outer,
        innerText: fill(C.range_template, { low: f(inner[0]), high: f(inner[1]) }),
        outerText: outer ? fill(C.range_template, { low: f(outer[0]), high: f(outer[1]) }) : C.outer_unavailable,
        c: pos(it.center, m.dom), il: pos(inner[0], m.dom), iw: Math.round((pos(inner[1], m.dom) - pos(inner[0], m.dom)) * 1e4) / 1e4,
        innerZero: Math.abs(inner[1] - inner[0]) < 1e-12
      });
      if (outer) { r.ol = pos(outer[0], m.dom); r.ow = Math.round((pos(outer[1], m.dom) - pos(outer[0], m.dom)) * 1e4) / 1e4; r.outerZero = Math.abs(outer[1] - outer[0]) < 1e-12; }
      var scale = fill(E.chart_scale, { label: m.copy.axis_label, min: m.ticks[0].label, max: m.ticks[m.ticks.length - 1].label });
      r.sr = fill(C.chart_text, { model: r.name, measure: m.copy.title, center: r.centerText + r.unit, inner_min: f(inner[0]), inner_max: f(inner[1]),
        outer_min: outer ? f(outer[0]) : '—', outer_max: outer ? f(outer[1]) : '—', scale: scale }) + (outer ? '' : SEP + C.outer_unavailable + STOP);
      if (m.poles && mod.type) {
        var tp = (mod.type.pairs || []).filter(function (x) { return x.task_id === mid; })[0];
        if (tp) { r.letter = tp.letter; r.basis = tp.range_basis; r.boundary = !!tp.range_reaches_midpoint; r.sr += SEP + fill(E.type_letter, { letter: tp.letter }) + STOP + (r.boundary ? SEP + E.reaches_midpoint + STOP : ''); }
      }
      return r;
    }
    function notesFor(id, mid) {
      var b = P.bindings[id] || {}, out = [];
      Object.keys(b).forEach(function (k) { if (k !== 'profile' && (k === mid || (k.length === 1 && mid.charAt(0) === k))) out.push(X[b[k]]); });
      return out;
    }
    function glyph(r) {
      return (r.outer ? '<i class="g-out' + (r.outerZero ? ' is-zero' : '') + '" style="left:' + r.ol + '%;width:' + r.ow + '%"></i>' : '') +
        '<i class="g-in' + (r.innerZero ? ' is-zero' : '') + '" style="left:' + r.il + '%;width:' + r.iw + '%"></i><i class="g-dot" style="left:' + r.c + '%"></i>';
    }
    function rowHtml(m, r, i) {
      var name = r.unknown ? r.model : r.name;
      var sr = r.unknown ? name + '. ' + X.model_unavailable : (r.missing ? name + '. ' + m.copy.title + '. ' + fill(X.measure_unavailable, { model: name }) : r.sr);
      r.notes.forEach(function (n) { sr += SEP + E.note_marker + colon + n; });
      var h = '<li class="row' + (r.missing ? ' is-missing' : '') + '" data-model="' + esc(r.model) + '" data-i="' + i + '"' + (r.missing ? '' : ' data-center="' + r.center + '"') + '>';
      h += '<p class="sr">' + esc(sr) + '</p><div class="m">';
      h += r.unknown ? '<span class="m-name">' + esc(name) + '</span>' : '<a class="m-name" href="' + esc(query([['models', r.model]])) + '" data-open-model="' + esc(r.model) + '" aria-label="' + esc(fill(X.link_profile_label, { model: name })) + '">' + esc(name) + '</a>';
      if (r.notes.length) h += '<sup class="note-mark" aria-hidden="true">†</sup>';
      h += '<span class="m-prov" aria-hidden="true">' + esc(r.provider) + '</span></div>';
      h += '<div class="plot' + (m.signed ? ' is-signed' : '') + '" aria-hidden="true">' + (m.ref !== null && m.ref !== undefined ? '<i class="ref" style="left:' + pos(m.ref, m.dom) + '%"></i>' : '');
      h += r.missing ? '<span class="missing-text">' + esc(r.unknown ? X.model_unavailable : C.unavailable) + '</span>' : glyph(r);
      h += '</div><div class="c" aria-hidden="true">';
      if (r.missing) h += '—';
      else {
        h += '<span class="c-num">' + esc(r.centerText) + '</span>' + (r.unit ? '<small>' + r.unit + '</small>' : '');
        if (r.letter) h += '<span class="type-letter' + (r.boundary ? ' is-boundary' : '') + '">' + esc(r.letter) + (r.boundary ? '<sup>*</sup>' : '') + '</span>';
      }
      h += '</div><div class="r" aria-hidden="true">';
      if (!r.missing) h += '<span><i class="k-in"></i>' + esc(r.innerText) + '</span><span class="' + (r.outer ? '' : 'is-unavailable') + '"><i class="k-out"></i>' + esc(r.outerText) + '</span>';
      return h + '</div></li>';
    }
    function axisHead(m) {
      return '<div class="axis-head" aria-hidden="true"><span class="h-m">' + esc(E.col_model) + '</span><div class="h-plot"><div class="ends"><span>' + esc(m.copy.axis_low) + '</span><span>' + esc(m.copy.axis_high) + '</span></div><div class="ticks">' +
        m.ticks.map(function (t) { return '<span class="' + (t.minor ? 'minor' : '') + '" style="left:' + t.pos + '%">' + esc(t.label) + '</span>'; }).join('') +
        '</div></div><span class="h-c">' + esc(C.average) + '</span><span class="h-r">' + esc(E.col_ranges) + '</span></div>';
    }
    function evidence(m) {
      if (m.kind === 'self_description') return '<p class="evidence"><span class="pill pill-e">' + esc(C.self_description) + '</span><span class="evidence-help">' + esc(C.self_description_help) + '</span></p>';
      if (m.kind === 'rated_conversation') return '<p class="evidence"><span class="pill pill-f">' + esc(C.conversation_evidence) + '</span><span class="evidence-help">' + esc(C.judges_label + colon + C.judges) + '</span><span class="pill pill-status">' + esc(C.human_review) + '</span></p>';
      return '';
    }
    function explain(m) {
      var c = m.copy;
      return '<details class="explain"><summary><span class="when-closed">' + esc(C.show_explanation) + '</span><span class="when-open">' + esc(C.hide_explanation) + '</span>' + CHEV + '</summary><div class="explain-grid">' +
        '<section><h5>' + esc(C.section_meaning) + '</h5><p>' + esc(c.explanation) + '</p></section>' +
        '<section><h5>' + esc(C.section_reading) + '</h5><p>' + esc(c.reading) + '</p>' + (c.interpretation_note ? '<p class="note">' + esc(c.interpretation_note) + '</p>' : '') + '</section>' +
        '<section class="ex"><h5>' + esc(C.section_example) + '</h5><p>' + esc(c.example) + '</p></section>' +
        '<section class="ex"><h5>' + esc(C.section_everyday) + '</h5><p>' + esc(c.everyday) + '</p></section></div><p class="illustration-note">' + esc(C.illustration_note) + '</p></details>';
    }
    var CHEV = '<svg class="chev-i" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    function methodsHref(mid) {
      var q = pair ? [['from', 'explore'], ['pair', pair.pair]] : [['from', 'explore'], ['models', selected.join(',')]];
      return '../methods/' + query(q) + '#' + mid;
    }
    function measureBlock(m, ids, opts) {
      var rows = ids.map(function (id, i) { return rowData(m.id, id); });
      var h = '<article class="x-measure cat-' + m.cat + '" id="' + m.id + '"><div class="x-measure-head"><span class="code">' + m.id + '</span><div><h4 class="title">' + esc(m.copy.title) + '</h4><p class="question">' + esc(m.copy.question) + '</p></div></div>';
      h += '<div class="measure-meta"><p class="axis-label">' + esc(m.copy.axis_label) + '</p>' + evidence(m) + '</div>';
      var chartLabel = fill(X.comparison_chart_label, { measure: m.copy.title, models: rows.map(function (r) { return r.name; }).join(LANG === 'zh' ? '、' : ', ') });
      h += '<div class="chart">' + axisHead(m) + '<ol class="rows" aria-label="' + esc(chartLabel) + '">' + rows.map(function (r, i) { return rowHtml(m, r, i); }).join('') + '</ol></div>';
      if (opts && opts.delta) h += opts.delta(m);
      var foot = [esc(C.range_note) + (m.signed ? (LANG === 'zh' ? '' : ' ') + esc(C.signed_difference_note) : '')];   /* Chinese sentences join without a space */
      if (m.kind === 'rated_conversation') foot.push(esc(C.human_review_help));
      if (rows.some(function (r) { return r.boundary; })) foot.push('<span class="type-letter is-boundary" aria-hidden="true">*</span> ' + esc(C.type_boundary));
      if (rows.some(function (r) { return r.letter === 'X'; })) foot.push(esc(C.type_tie));
      if (rows.some(function (r) { return r.basis === 'inner_range'; })) foot.push(esc(C.type_inner_only));
      if (ids.length > 1 && rows.some(function (r) { return r.missing; })) foot.push(esc(X.comparison_partial));
      rows.forEach(function (r) { r.notes.forEach(function (n) { foot.push('<span aria-hidden="true" class="deploy-note">†</span> ' + esc(r.name + colon + n)); }); });
      h += '<div class="measure-foot">' + foot.map(function (f) { return '<p>' + f + '</p>'; }).join('') + '</div>';
      h += '<div class="measure-end">' + explain(m) + '<p class="measure-links"><a class="methods-link" href="' + esc(methodsHref(m.id)) + '">' + esc(C.methods_link) + '<span aria-hidden="true"> →</span></a></p></div></article>';
      return h;
    }
    function groupsHtml(ids, opts) {
      return P.groups.map(function (g) {
        var ms = P.measures.filter(function (m) { return m.cat === g.id; });
        var h = '<section class="x-group group cat-' + g.id + '" aria-labelledby="xg-' + g.id + '"><header class="group-head"><h3 id="xg-' + g.id + '"><span class="g-code">' + g.id + '</span>' + esc(g.title) + '</h3><p>' + esc(g.description) + '</p></header>';
        if (g.first_block) {
          h += '<p class="block-title">' + esc(g.first_block) + '</p>' + ms.filter(function (m) { return +m.id.charAt(1) <= 5; }).map(function (m) { return measureBlock(m, ids, opts); }).join('');
          h += '<p class="block-title">' + esc(g.second_block) + '</p>' + ms.filter(function (m) { return +m.id.charAt(1) > 5; }).map(function (m) { return measureBlock(m, ids, opts); }).join('');
        } else h += ms.map(function (m) { return measureBlock(m, ids, opts); }).join('');
        return h + '</section>';
      }).join('');
    }
    function noticeHtml() { return notices.map(function (n) { return '<p class="notice">' + esc(n) + '</p>'; }).join(''); }
    function pairFor(id) { return P.pairs.filter(function (p) { return p.old_model === id || p.new_model === id; })[0]; }

    function renderProfile(id) {
      var mod = models[id];
      if (!mod) { view.innerHTML = noticeHtml() + '<p class="notice">' + esc(X.model_unavailable) + ' <button type="button" class="btn-text" data-add-focus>' + esc(X.choose_available) + '</button></p>'; return; }
      var available = P.measures.filter(function (m) { var it = (items[id] || {})[m.id]; return it && it.center !== null && it.center !== undefined; }).length;
      var h = noticeHtml() + '<header class="x-head"><p class="kicker">' + esc(X.page_title) + '</p><h2 id="x-title">' + esc(fill(X.profile_title, { model: mod.name })) + '</h2><p class="x-intro">' + esc(X.profile_intro) + '</p>';
      h += '<dl class="facts x-meta"><div><dt>' + esc(E.provider) + '</dt><dd>' + esc(mod.provider) + '</dd></div><div><dt>' + esc(V.model_id) + '</dt><dd class="mono">' + esc(mod.model_id) + '</dd></div>';
      if (mod.reasoning_effort) h += '<div><dt>' + esc(V.reasoning) + '</dt><dd>' + esc(mod.reasoning_effort === 'high' ? V.high : mod.reasoning_effort) + '</dd></div>';
      h += '<div><dt>' + esc(C.release_label) + '</dt><dd class="mono">' + esc(DATA.release_id) + '</dd></div></dl>';
      h += '<p class="fine x-count">' + esc(fill(X.profile_count, { available_count: available, measure_count: P.measures.length })) + '</p>';
      h += '<p class="fine x-settings"><b>' + esc(X.settings_heading) + '</b>' + SEP + esc(X.settings_body) + SEP + '<a href="' + esc('../methods/' + query([['from', 'explore'], ['models', id]]) + '#versions') + '">' + esc(X.settings_link) + '<span aria-hidden="true"> →</span></a></p>';
      var b = P.bindings[id]; if (b && b.profile) h += '<div class="x-notes"><p class="x-note">' + esc(X[b.profile]) + '</p></div>';
      if (mod.type && mod.type.available) {
        var bnd = (mod.type.pairs || []).some(function (p) { return p.range_reaches_midpoint; });
        var eg = P.groups.filter(function (g) { return g.id === 'E'; })[0];
        h += '<p class="x-type"><span>' + esc(eg ? eg.second_block : '') + '</span><b>' + esc(mod.type.label) + '</b><span class="pill pill-e">' + esc(C.self_description) + '</span>' + (bnd ? '<span class="fine">* ' + esc(C.type_boundary) + '</span>' : '') + '</p>';
      }
      var pr = pairFor(id);
      if (pr) {
        h += '<div class="x-version"><div><h3>' + esc(X.version_heading) + '</h3><p>' + esc(fill(X.version_intro, { old_model: models[pr.old_model].name, new_model: models[pr.new_model].name })) + '</p></div><a class="btn-pill" href="' + esc(query([['pair', pr.pair]])) + '" data-version-open="' + esc(pr.pair) + '">' + esc(X.version_open) + '</a></div>';
      }
      h += '<div class="x-toolbar"><button type="button" class="btn-pill" data-add-focus>' + esc(X.add_model) + '</button><a class="btn-pill" href="' + esc(P.home || '../') + '">' + esc(X.back_to_overview) + '</a><p class="fine">' + esc(X.compare_one_model) + '</p></div></header>';
      h += groupsHtml([id]);
      view.innerHTML = h;
    }
    function renderCompare(ids) {
      var known = ids.filter(function (id) { return models[id]; });
      var h = noticeHtml() + '<header class="x-head"><p class="kicker">' + esc(X.page_title) + '</p><h2 id="x-title">' + esc(X.compare_heading) + '</h2><p class="x-intro">' + esc(X.compare_intro) + '</p>';
      h += '<p class="x-meta fine">' + esc(fill(X.compare_ready, { count: known.length })) + ' · ' + known.map(function (id) { return esc(models[id].name); }).join(' · ') + '</p>';
      h += '<div class="x-hints"><p>' + esc(X.compare_axis_hint) + '</p><p>' + esc(X.compare_range_hint) + '</p></div>';
      var notes = ids.filter(function (id) { return P.bindings[id] && P.bindings[id].profile && models[id]; });
      if (notes.length) h += '<div class="x-notes">' + notes.map(function (id) { return '<p class="x-note">' + esc(models[id].name + colon + X[P.bindings[id].profile]) + '</p>'; }).join('') + '</div>';
      var vp = ids.length === 2 ? P.pairs.filter(function (p) { return ids.indexOf(p.old_model) >= 0 && ids.indexOf(p.new_model) >= 0; })[0] : null;
      if (vp) h += '<div class="x-version"><div><h3>' + esc(X.version_heading) + '</h3><p>' + esc(fill(X.version_intro, { old_model: models[vp.old_model].name, new_model: models[vp.new_model].name })) + '</p></div><a class="btn-pill" href="' + esc(query([['pair', vp.pair]])) + '" data-version-open="' + esc(vp.pair) + '">' + esc(X.version_open) + '</a></div>';
      h += '<div class="x-toolbar"><button type="button" class="btn-pill" data-add-focus>' + esc(X.add_model) + '</button></div></header>';
      h += groupsHtml(ids);
      view.innerHTML = h;
    }
    function renderVersions(pr) {
      var o = models[pr.old_model], n = models[pr.new_model], ch = changes[pr.pair] || {};
      var h = noticeHtml() + '<header class="x-head"><p class="kicker">' + esc(X.version_heading) + '</p><h2 id="x-title">' + esc(o.name) + ' → ' + esc(n.name) + '</h2><p class="x-intro">' + esc(fill(X.version_intro, { old_model: o.name, new_model: n.name })) + '</p>';
      h += '<div class="x-hints"><p>' + esc(fill(X.version_direction, { old_model: o.name, new_model: n.name })) + '</p><p>' + esc(V.pair_help) + '</p></div>';
      [pr.old_model, pr.new_model].forEach(function (id) { var b = P.bindings[id]; if (b && b.profile) h += '<div class="x-notes"><p class="x-note">' + esc(models[id].name + colon + X[b.profile]) + '</p></div>'; });
      h += '</header>';
      h += groupsHtml([pr.old_model, pr.new_model], { delta: function (m) {
        var g = ch[m.id]; if (!g) return '';
        var unitWord = X[P.diff_units[g.unit] || 'points'] || '';
        var d = g.delta, txt;
        if (d !== 0 && Math.abs(d) < 0.1) txt = '<b>' + (d > 0 ? '+' : MINUS) + '&lt;0.1</b><span>' + esc(fill(X.version_small_difference, { unit: unitWord })) + '</span>';
        else txt = '<b>' + esc(fmtNum(d, 1, true)) + '</b><span>' + esc(unitWord) + '</span>';
        return '<p class="delta"><span>' + esc(fill(E.difference_label, { new: n.name, old: o.name })) + colon + '</span>' + txt + '</p>';
      } });
      view.innerHTML = h;
    }
    function render() {
      loading.hidden = true;
      if (pair) renderVersions(pair);
      else if (selected.length === 1) renderProfile(selected[0]);
      else if (selected.length > 1) renderCompare(selected);
      else view.innerHTML = noticeHtml() + (selected.length === 0 && notices.length === 0 ? '' : '');
      var h = location.hash.slice(1);
      if (MEASURE.test(h)) { var t = doc.getElementById(h); if (t) t.scrollIntoView({ block: 'start' }); }
    }
    function update(push, scroll) {
      syncChooser(); writeUrl(push);
      if (!DATA) { early = true; if (scroll) focusLater = true; return; }
      render();
      if (scroll) { var head = qs('#x-title', view); if (head) { head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true }); view.scrollIntoView({ block: 'start' }); } }
    }
    function readUrl() {
      var p = getParams(); notices = [];
      var rel = p.get('release');
      if (rel && rel !== DATA.release_id) notices.push(E.unknown_release);
      pair = null; selected = [];
      var pn = p.get('pair');
      if (pn) { pair = P.pairs.filter(function (x) { return x.pair === pn; })[0] || null; if (pair) selected = [pair.old_model, pair.new_model]; else notices.push(X.model_unavailable); }
      if (!pair) {
        var ids = listParam(p.get('models'), ID), seen = {};
        ids.forEach(function (id) { if (seen[id]) return; seen[id] = 1; if (models[id]) selected.push(id); else notices.push(fill(X.model_unavailable, {}) + ' (' + id + ')'); });
        if (selected.length === 0 && ids.length) notices.push(X.choose_available);
      }
    }
    function load(retry) {
      loading.hidden = false; el.setAttribute('data-state', 'loading');
      view.querySelectorAll('.notice.load').forEach(function (n) { n.remove(); });
      if (retry) { loading.setAttribute('tabindex', '-1'); loading.focus(); }   /* the Try again button is gone */
      fetch(P.data, { cache: 'no-cache' }).then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); }).then(function (d) {
        DATA = d; order = d.model_order || [];
        order.forEach(function (id) {
          var m = d.models[id]; if (!m) return;
          models[id] = { name: m.name, provider: m.provider, model_id: m.model_id, reasoning_effort: m.reasoning_effort, type: m.self_described_type };
          items[id] = {}; (m.items || []).forEach(function (it) { items[id][it.item] = it; });
        });
        (d.generation_changes || []).forEach(function (g) { (changes[g.pair] = changes[g.pair] || {})[g.item] = g; });
        readUrl(); syncChooser(); if (!early) grid.open = selected.length === 0; render(); carryLanguage();
        el.setAttribute('data-state', 'ready');
        var opened = focusLater; early = focusLater = false;   /* a profile or version view asked for while loading */
        if (retry || opened) {
          var head = qs('#x-title', view);
          if (head) { head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true }); if (opened) view.scrollIntoView({ block: 'start' }); }
          else if (retry) search.focus({ preventScroll: true });
        }
      }).catch(function () {
        loading.hidden = true; el.setAttribute('data-state', 'error');
        view.innerHTML = '<div class="notice load" role="alert"><p>' + esc(X.load_error) + '</p><p><button type="button" class="btn-pill" data-retry>' + esc(X.retry) + '</button></p></div>';
        var again = qs('[data-retry]', view);
        again.addEventListener('click', function () { load(true); });
        if (retry) again.focus();
      });
    }
    // An address that already names models (or a version pair) folds the chooser before the data arrives, so the
    // page does not jump when it would fold later; the full choice stays one click away.
    (function () {
      var p0 = getParams(), named = listParam(p0.get('models'), ID).some(function (id) { return !!qs('.model-card[data-model="' + id + '"]'); });
      if (named || P.pairs.some(function (x) { return x.pair === p0.get('pair'); })) grid.open = false;
    })();
    // opening the folded chooser hides its summary line; move focus into the search box instead of losing it
    var asked = false;
    qs('summary', grid).addEventListener('click', function () { asked = true; });
    grid.addEventListener('toggle', function () {
      if (asked && grid.open) search.focus({ preventScroll: true });
      asked = false;
    });
    addEventListener('popstate', function () { if (DATA) { readUrl(); syncChooser(); grid.open = selected.length === 0; render(); carryLanguage(); } });
    P.home = qs('.site-nav a[href]') ? qs('.site-nav a').getAttribute('href') : '../';
    load();
  }

  /* ------------------------------------------------------------------ robustness */
  function initRobustness() {
    var rows = qsa('details[data-gr-model]'); if (!rows.length) return;
    var ids = rows.map(function (d) { return d.getAttribute('data-gr-model'); });
    var records = qs('[data-gr-records]'), unknown = qs('[data-gr-unknown]');
    function openIds() { return rows.filter(function (d) { return d.open; }).map(function (d) { return d.getAttribute('data-gr-model'); }); }
    function state() { return [['model', openIds().join(',')], ['records', records && records.open ? 'open' : '']]; }
    function carry() {
      qsa('a[data-carry="methods"]').forEach(function (a) {
        var base = a.getAttribute('href').split(/[?#]/)[0];
        a.setAttribute('href', base + query([['from', 'robustness']].concat(state())) + '#' + a.getAttribute('data-anchor'));
      });
      carryLanguage();
    }
    /* Open models (and the record section) follow the URL: ?model=a,b&records=open */
    function apply() {
      var p = getParams(), want = listParam(p.get('model'), ID);
      rows.forEach(function (d) { d.open = want.indexOf(d.getAttribute('data-gr-model')) >= 0; });
      if (records) records.open = p.get('records') === 'open';
      if (unknown) unknown.hidden = !want.some(function (id) { return ids.indexOf(id) < 0; });
      carry();
      return want.filter(function (id) { return ids.indexOf(id) >= 0; });
    }
    function showUnknown() {   /* an address naming no model on this page: bring the notice into view */
      if (unknown && !unknown.hidden) { unknown.setAttribute('tabindex', '-1'); unknown.scrollIntoView({ block: 'center' }); unknown.focus({ preventScroll: true }); }
    }
    function write() { setUrl(query(state())); carry(); }
    rows.forEach(function (d) { d.addEventListener('toggle', write); });
    if (records) records.addEventListener('toggle', write);
    var opened = apply();
    if (opened.length && !location.hash) requestAnimationFrame(function () { var el = doc.getElementById('gr-' + opened[0]); if (el) el.scrollIntoView({ block: 'start' }); });
    else if (!location.hash) requestAnimationFrame(showUnknown);
    addEventListener('popstate', apply);
  }

  /* ------------------------------------------------------------------ methods */
  /* the element the address points to; a malformed escape in it (a hand-edited link) is ignored */
  function hashTarget() {
    try { return location.hash.length > 1 ? doc.getElementById(decodeURIComponent(location.hash.slice(1))) : null; } catch (e) { return null; }
  }

  /* The Methods page has about 600 formulas. Typesetting them all at once froze a mid-range phone for 2-3 seconds,
     so the formulas from where the page opens go first and the rest follow in short slices, one per frame, those on
     or near the screen before the others.
     A typeset formula is taller or shorter than its source text, so the page keeps the text at the reading line (a
     character on the line where an anchor jump puts a section's top) where it is: after every slice, and when
     something else moves it (a font arriving), the page is scrolled by the same amount. The browsers' own scroll
     anchoring is off meanwhile, on <html> and <body> both (Chrome reads it from <body>, and KaTeX's absolutely
     placed boxes would otherwise be anchors); Safari has none anyway. Formulas above the reading line wait while the
     reader is scrolling (a flick on a phone is never cut short) and until the page has loaded (until then the browser
     keeps an anchor target in view itself).
     Leaving or hiding the page records which formulas above the reading line were typeset; a reload or a return
     through history typesets exactly those first, so the page above the reader is laid out as it was and the
     browser's own scroll restoration lands where the reader was. The rest follow in the usual slices.
     data-math on the page body: "rendering", then "rendered" (or "source" when KaTeX is missing or fails). */
  function typeset(body, finish) {
    var opts = { delimiters: [{ left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }], throwOnError: false };
    var units = qsa('.math-display, .math-inline', body), total = units.length, left = total, failed = 0;
    var done = [], near = [], order = new Map(), io = null, held = 0, KEY = 'bp-methods-read';
    var LEAF = 'p, li, h1, h2, h3, h4, h5, tr, dt, dd, summary, caption, pre, blockquote, .math-display, .back-row';
    var MATH = '.math-display, .math-inline';
    units.forEach(function (u, i) { order.set(u, i); });
    function one(i) {
      if (done[i]) return;
      done[i] = true; left--;
      try { window.renderMathInElement(units[i], opts); units[i].classList.add('is-set'); } catch (e) { failed++; }
    }
    function all() { for (var i = 0; i < total; i++) one(i); }
    function anchoring(v) { root.style.overflowAnchor = v; if (doc.body) doc.body.style.overflowAnchor = v; }
    function end() { if (io) io.disconnect(); anchoring(''); finish(!failed); }
    // index of the first formula at or after the start of node (the formulas are in document order)
    function firstAfter(node) {
      var lo = 0, hi = total;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (units[mid] === node || node.compareDocumentPosition(units[mid]) & (Node.DOCUMENT_POSITION_FOLLOWING | Node.DOCUMENT_POSITION_CONTAINED_BY)) hi = mid; else lo = mid + 1;
      }
      return lo;
    }
    function caretAt(x, y) {
      var c;
      if (doc.caretPositionFromPoint) { c = doc.caretPositionFromPoint(x, y); return c && { node: c.offsetNode, off: c.offset }; }
      if (doc.caretRangeFromPoint) { c = doc.caretRangeFromPoint(x, y); return c && { node: c.startContainer, off: c.startOffset }; }
      return null;
    }
    function pinTop(p) { return (p.range || p.el).getBoundingClientRect().top; }
    // what sits at the reading line: one character of text there (near mid-line, so a word re-wrapping at the
    // line's start does not move it; formulas skipped), else that line's formula, else the whole block
    function findPin() {
      var b = body.getBoundingClientRect(), y = (parseFloat(getComputedStyle(root).scrollPaddingTop) || 0) + 4;
      if (b.top >= y || b.bottom <= y) return null;
      var x = b.left + Math.min(40, b.width / 2);
      for (var py = y; py < Math.min(innerHeight, y + 240); py += 12) {
        var el = doc.elementFromPoint(x, py);
        if (!el || !body.contains(el)) continue;
        el = (el.closest(MATH) || el).closest(LEAF);   // a formula's own box stays when it is typeset
        if (!el || !body.contains(el)) continue;
        var r = el.getBoundingClientRect();
        // a formula not typeset yet will change height: when the line runs through its lower half, hold what comes
        // after it instead of its top
        if (el.matches(MATH) && !el.classList.contains('is-set') && y > (r.top + r.bottom) / 2) { py = Math.max(py, r.bottom - 11); continue; }
        var p = { el: el, node: el, range: null }, f = null, xs = [0.5, 0.35, 0.65, 0.2, 0.8];
        for (var k = 0; k < xs.length && !p.range; k++) {
          var c = caretAt(r.left + r.width * xs[k], py);
          if (!c || !c.node || !el.contains(c.node)) continue;
          var inF = (c.node.nodeType === 1 ? c.node : c.node.parentNode).closest(MATH);
          if (inF) { f = f || inF; continue; }
          if (c.node.nodeType !== 3 || !c.node.length) continue;
          var o = Math.min(c.off, c.node.length - 1), rg = doc.createRange();
          rg.setStart(c.node, o); rg.setEnd(c.node, o + 1);
          p.node = c.node; p.range = rg;
        }
        if (!p.range && f && f !== el) p.node = p.el = f;
        p.top = pinTop(p); p.at = performance.now();
        return p;
      }
      return null;
    }
    // remember which formulas above the reading line are typeset, whenever the page is left or hidden (a phone may
    // discard a hidden tab without any further event)
    function save() {
      try {
        var p = findPin(), k = p ? firstAfter(p.node) : (scrollY > 0 ? total : 0), s = '';
        for (var i = 0; i < k; i++) s += done[i] ? '1' : '0';
        sessionStorage.setItem(KEY, JSON.stringify({ path: location.pathname, n: total, k: k, d: s }));
      } catch (e) { /* storage blocked: a reload typesets everything above first */ }
    }
    addEventListener('pagehide', save);
    addEventListener('visibilitychange', function () { if (doc.visibilityState === 'hidden') save(); });
    var nav = ((performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {}).type;
    var returning = nav === 'reload' || nav === 'back_forward', saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (!returning) sessionStorage.removeItem(KEY);   // an earlier visit's record must never meet a later reading position
    } catch (e) { saved = null; }
    if (!('IntersectionObserver' in window) || !window.requestAnimationFrame || !window.Map) { all(); end(); return; }
    if (returning) {
      var same = saved && saved.path === location.pathname && saved.n === total;
      var k = same ? Math.min(+saved.k || 0, total) : total, d = same && typeof saved.d === 'string' && saved.d.length === k ? saved.d : null;
      for (var i = 0; i < k; i++) if (!d || d.charAt(i) === '1') one(i);
      if (d) held = k;          // the others above the old reading line wait until the browser has put the page back
      if (!left) { end(); return; }
    }
    // the first two screens from where the page opens (an anchor in the address, else the top)
    var start = hashTarget();
    if (start && !body.contains(start)) start = null;
    var from = Math.max(held, start ? firstAfter(start) : 0), limit = (start ? start.getBoundingClientRect().top : 0) + 2 * innerHeight, first = [];
    for (var j = from; j < total; j++) {
      var r = units[j].getBoundingClientRect();
      if ((r.width || r.height) && r.top > limit) break;
      first.push(j);
    }
    first.forEach(one);
    if (!left) { end(); return; }

    var pin = null, userAt = 0, ownY = null, loaded = doc.readyState === 'complete', scheduled = false, per = 4, steps = 0;
    anchoring('none');
    function above(i) { return !!pin && !!(pin.node.compareDocumentPosition(units[i]) & Node.DOCUMENT_POSITION_PRECEDING) && !units[i].contains(pin.node); }
    function keep(d) { if (Math.abs(d) >= 0.5) { scrollBy(0, d); ownY = scrollY; } }
    function schedule(wait) {
      if (scheduled || !left || doc.hidden) return;      // a hidden page waits (its layout stays as recorded)
      scheduled = true;
      if (wait) setTimeout(step, wait); else requestAnimationFrame(step);
    }
    function step() {
      scheduled = false;
      if (!left || doc.hidden) return;
      var t0 = performance.now(), quiet = loaded && t0 - userAt > 400;
      if (pin && pin.node.isConnected) {
        var d0 = pinTop(pin) - pin.top;
        // moved since the last slice: by the reader (or the browser while loading) -> read the new place; by
        // anything else (a font arriving) -> put the text back, but never while the reader is scrolling
        if (Math.abs(d0) >= 0.5 && (userAt > pin.at || !quiet)) pin = null;
        else { keep(d0); pin.at = t0; }
      } else pin = null;
      if (!pin) pin = findPin();
      var free = quiet && (!pin || userAt <= pin.at);                                    // the page may be scrolled now
      var n = Math.max(2, Math.min(80, Math.round(32 / per))), pick = [], picked = {}, i;   // about 32 ms a slice
      function take(i) {
        if (done[i] || picked[i] || pick.length >= n) return;
        if (!free && (above(i) || i < held)) return;
        picked[i] = true; pick.push(i);
      }
      for (i = 0; i < total && pick.length < n; i++) if (near[i]) take(i);              // on or near the screen
      var at = pin ? firstAfter(pin.node) : 0;
      for (i = at; i < total && pick.length < n; i++) take(i);                           // then below the reading line
      for (i = at - 1; i >= 0 && pick.length < n; i--) take(i);                          // then above it, nearest first
      if (!pick.length) { schedule(150); return; }                                       // only formulas above, and not yet
      var t1 = performance.now();
      pick.forEach(one);
      if (pin && free) { keep(pinTop(pin) - pin.top); pin.at = performance.now(); }       // also lays out now, so the cost is measured
      else void body.offsetHeight;
      // cost per formula, typesetting and layout together; the first slice also pays for laying out the whole page
      if (steps++) per = per * 0.7 + 0.3 * Math.min(6, Math.max(0.05, (performance.now() - t1) / pick.length));
      if (!left) end(); else schedule();
    }
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { near[order.get(e.target)] = e.isIntersecting; });
      schedule();
    }, { rootMargin: '50% 0px 150% 0px' });
    units.forEach(function (u, i) { if (!done[i]) io.observe(u); });
    addEventListener('scroll', function () {
      if (ownY !== null && Math.abs(scrollY - ownY) < 1) { ownY = null; return; }       // our own correction
      ownY = null; userAt = performance.now();
    }, { passive: true });
    ['touchstart', 'touchmove', 'wheel', 'keydown', 'mousedown'].forEach(function (t) {
      addEventListener(t, function () { userAt = performance.now(); }, { passive: true });
    });
    addEventListener('visibilitychange', function () { if (doc.visibilityState !== 'hidden') schedule(); });
    if (doc.fonts && doc.fonts.addEventListener) doc.fonts.addEventListener('loadingdone', function () { schedule(); });
    // a returning visit waits a little after loading too, for the browser's scroll restoration
    if (!loaded) addEventListener('load', function () { loaded = true; if (held) userAt = performance.now(); schedule(); });
    // printing needs every formula now (this runs before the print set-up unfolds the schedules)
    addEventListener('beforeprint', function () {
      if (!left) return;
      var p = findPin();
      all();
      if (p) keep(pinTop(p) - p.top);
      end();
    });
    schedule();
  }

  function initMethods() {
    var body = qs('[data-methods]'); if (!body) return;
    qsa('a[data-external]', body).forEach(function (a) { a.setAttribute('aria-label', a.textContent + ' (' + a.getAttribute('data-external') + ')'); });
    /* phones: contents menu; any link to a folded table opens it */
    var jump = qs('[data-m-jump]');
    if (jump) jump.addEventListener('change', function () {
      var id = jump.value; if (!id) return;
      jump.value = '';   /* back to the prompt, so the same section can be chosen again */
      if (location.hash.slice(1) === id) { openTarget(); var t = doc.getElementById(id); if (t) t.scrollIntoView({ block: 'start' }); }
      else location.hash = id;
    });
    function openTarget() {
      var t = hashTarget();
      for (var el = t; el && el !== body; el = el.parentElement) if (el.tagName === 'DETAILS') el.open = true;
    }
    openTarget();
    addEventListener('hashchange', openTarget);
    var p = getParams(), from = p.get('from');
    var urls = { home: body.getAttribute('data-home'), explore: body.getAttribute('data-explore'), robustness: body.getAttribute('data-robustness'), about: body.getAttribute('data-about'), ratings: body.getAttribute('data-ratings') };
    var back = null;
    if (from === 'home') back = urls.home + query([['hl', ID.test(p.get('hl') || '') ? p.get('hl') : ''], ['sort', /^(high|low)$/.test(p.get('sort') || '') ? p.get('sort') : ''], ['open', p.get('open') === 'none' ? 'none' : listParam(p.get('open'), MEASURE).join(',')]]);
    else if (from === 'explore') back = urls.explore + query([['models', listParam(p.get('models'), ID).join(',')], ['pair', ID.test(p.get('pair') || '') ? p.get('pair') : '']]);
    else if (from === 'robustness') back = urls.robustness + query([['model', listParam(p.get('model'), ID).join(',')], ['records', p.get('records') === 'open' ? 'open' : '']]);
    else if (from === 'about' || from === 'ratings') back = urls[from];
    qsa('[data-back-link][data-anchor]').forEach(function (a) {
      var anchor = a.getAttribute('data-anchor');
      if (MEASURE.test(anchor)) {
        var target = (from === 'home' || from === 'explore') ? back : urls.home;
        a.setAttribute('href', target + '#' + anchor);
      } else if (anchor === 'general-robustness' && from === 'robustness') a.setAttribute('href', back);
    });
    var row = qs('[data-back-row]');
    if (back && row) {
      var entry = location.hash.slice(1), link = qs('[data-back-link]', row);
      // from a result (home measure, Explore) it returns "to this result"; from the checks page "to the checks"; otherwise "to the previous page"
      var label = (from === 'home' || from === 'explore') && MEASURE.test(entry) ? null : from === 'robustness' ? row.getAttribute('data-label-checks') : row.getAttribute('data-label-previous');
      if (label) link.textContent = '← ' + label;
      link.setAttribute('href', back + (MEASURE.test(entry) && (from === 'home' || from === 'explore') ? '#' + entry : ''));
      row.hidden = false;
    }
    var ids = qsa('[data-toc]').map(function (a) { return a.getAttribute('data-toc'); });
    watchToc(ids);
    if (window.renderMathInElement) {
      body.setAttribute('data-math', 'rendering');
      typeset(body, function (ok) { body.setAttribute('data-math', ok ? 'rendered' : 'source'); if (recue) recue(); });
    } else body.setAttribute('data-math', 'source');   /* KaTeX did not load: the formulas stay as source text */
  }

  // Visitor experiences and questions (ratings page). Only a live build posts, to the configured receiver, and only a
  // 2xx reply that confirms this submission id counts as received; anything else keeps the text for a retry.
  function initIdeas() {
    var box = qs('[data-ideas]'), panel = qs('[data-idea-panel]'), form = qs('[data-idea-form]');
    if (!box || !panel || !form) return;              // collection closed: only the notice is on the page
    var T = JSON.parse(qs('[data-idea-text]', panel).textContent);
    var live = box.getAttribute('data-mode') === 'live', endpoint = box.getAttribute('data-endpoint');
    var timeout = +box.getAttribute('data-timeout') || 15000, revision = box.getAttribute('data-revision') || '';
    var opener = qs('[data-idea-open]', box), submit = qs('[data-idea-submit]', form);
    var status = qs('[data-idea-status]', form), alertBox = qs('[data-idea-alert]', form);
    var done = qs('[data-idea-done]', panel), doneTitle = qs('[data-idea-done-title]', panel);
    var names = ['scenario', 'focus'], field = {}, limit = {};
    names.forEach(function (n) { field[n] = qs('#idea-' + n, form); limit[n] = +field[n].getAttribute('data-limit'); });
    var KEY = 'bp-idea-draft', busy = false, sid = null, sidFor = null, sidLanguage = null, sidRevision = null, kept = true;
    // Unicode characters after trimming, the way the receiver is asked to count (an emoji is one, not two)
    function chars(s) { return Array.from(s.trim()).length; }
    // the unsent draft lives only in this tab's sessionStorage; never in the address, the page or anywhere shared
    function draft(v) {
      try {
        if (v === undefined) return JSON.parse(sessionStorage.getItem(KEY) || 'null');
        if (v === null) sessionStorage.removeItem(KEY); else sessionStorage.setItem(KEY, JSON.stringify(v));
        kept = true;
      } catch (e) { kept = false; }
      return null;
    }
    function keep() { draft({ scenario: field.scenario.value, focus: field.focus.value, sid: sid, sidFor: sidFor, sidLanguage: sidLanguage, sidRevision: sidRevision }); }
    function filled() { return !!(field.scenario.value.trim() || field.focus.value.trim()); }
    function count(n) { qs('#idea-' + n + '-count', form).textContent = fill(T.counter, { count: chars(field[n].value), limit: limit[n] }); }
    function flag(n, msg) {
      var e = qs('#idea-' + n + '-error', form);
      e.textContent = msg || '';
      e.hidden = !msg;
      if (msg) field[n].setAttribute('aria-invalid', 'true'); else field[n].removeAttribute('aria-invalid');
    }
    function show(move) {
      panel.hidden = false;
      opener.setAttribute('aria-expanded', 'true');
      if (move) {
        qs('#share-idea-title', panel).scrollIntoView({ block: 'start' });
        (done.hidden ? field.scenario : doneTitle).focus({ preventScroll: true });
      }
    }
    var d = draft();
    if (d && typeof d === 'object') {
      field.scenario.value = typeof d.scenario === 'string' ? d.scenario : '';
      field.focus.value = typeof d.focus === 'string' ? d.focus : '';
      sid = typeof d.sid === 'string' ? d.sid : null;
      sidFor = typeof d.sidFor === 'string' ? d.sidFor : null;
      sidLanguage = /^(en|zh)$/.test(d.sidLanguage || '') ? d.sidLanguage : LANG;
      sidRevision = typeof d.sidRevision === 'string' ? d.sidRevision : revision;
    }
    names.forEach(count);
    var asked = location.hash === '#share-idea';
    if (asked || filled()) show(asked);
    else { panel.hidden = true; opener.setAttribute('aria-expanded', 'false'); }
    // the opener is a real toggle: a second press folds the form again (any typed text stays in the draft)
    opener.addEventListener('click', function () {
      if (!panel.hidden && opener.getAttribute('aria-expanded') === 'true') { panel.hidden = true; opener.setAttribute('aria-expanded', 'false'); }
      else show(true);
    });
    addEventListener('hashchange', function () { if (location.hash === '#share-idea') show(true); });
    form.addEventListener('input', function (ev) {
      var n = ev.target.name;
      if (!field[n]) return;
      count(n);
      flag(n, '');
      alertBox.textContent = '';
      keep();
    });
    // without a tab draft (storage blocked), warn before unsent text would be lost
    addEventListener('beforeunload', function (ev) {
      if (!done.hidden || kept || !filled()) return;
      ev.preventDefault();
      ev.returnValue = T.leave_warning;
      return T.leave_warning;
    });
    function check() {
      var s = chars(field.scenario.value), c = chars(field.focus.value);
      flag('scenario', s === 0 ? T.empty_scenario : s > limit.scenario ? fill(T.scenario_limit, { limit: limit.scenario }) : '');
      flag('focus', c > limit.focus ? fill(T.focus_limit, { limit: limit.focus }) : '');
      var bad = names.filter(function (n) { return field[n].getAttribute('aria-invalid') === 'true'; })[0];
      if (bad) field[bad].focus();
      return !bad;
    }
    function newId() {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      var a = new Uint8Array(16);
      crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    }
    function finish(ok) {
      busy = false;
      names.forEach(function (n) { field[n].readOnly = false; });
      submit.disabled = false;
      submit.textContent = T.submit;
      status.textContent = '';
      if (ok) {
        sid = sidFor = sidLanguage = sidRevision = null;
        draft(null);
        form.hidden = true;
        done.hidden = false;
        doneTitle.focus();
      } else {
        alertBox.textContent = T.failed;
        keep();
        // the button was disabled while sending, which drops focus to the page; give it back so Enter can resend
        if (doc.activeElement === doc.body || !doc.activeElement) submit.focus();
      }
    }
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!live || !endpoint || busy) return;          // preview and closed builds never send anything
      alertBox.textContent = '';
      if (!check()) return;
      var scenario = field.scenario.value.trim(), focus = field.focus.value.trim(), text = scenario + '\u0000' + focus;
      // A retry keeps the entire submitted payload, even after a language switch or a copy update.
      if (!sid || sidFor !== text) { sid = newId(); sidFor = text; sidLanguage = LANG; sidRevision = revision; }
      var id = sid;
      keep();
      busy = true;
      names.forEach(function (n) { field[n].readOnly = true; });
      submit.disabled = true;
      submit.textContent = T.submitting;
      status.textContent = T.submitting;
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeout);
      fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', cache: 'no-store',
        body: JSON.stringify({ scenario: scenario, focus: focus, language: sidLanguage, copy_revision: sidRevision, submission_id: id }),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (r) {
        clearTimeout(timer);
        finish(!!r && r.saved === true && r.submission_id === id);
      }).catch(function () {
        clearTimeout(timer);
        finish(false);
      });
    });
    qs('[data-idea-another]', done).addEventListener('click', function () {
      names.forEach(function (n) { field[n].value = ''; count(n); flag(n, ''); });
      draft(null);
      done.hidden = true;
      form.hidden = false;
      field.scenario.focus();
    });
    // The template starts disabled: a missing/failed script must never submit text through a native GET.
    if (live && endpoint) submit.disabled = false;
  }

  /* Printing (or saving as PDF): unfold the results, schedules and model sections so the whole page prints, in the light
     colours; everything goes back to how it was afterwards. */
  function initPrint() {
    var opened = [], theme = null;
    addEventListener('beforeprint', function () {
      opened = qsa('details.measure:not([open]), details.m-schedule:not([open]), details.m-table:not([open]), details[data-gr-model]:not([open])');
      opened.forEach(function (d) { d.open = true; });
      theme = root.getAttribute('data-theme');
      if (isDark()) root.setAttribute('data-theme', 'light');
    });
    addEventListener('afterprint', function () {
      opened.forEach(function (d) { d.open = false; });
      opened = [];
      if (theme) root.setAttribute('data-theme', theme); else root.removeAttribute('data-theme');
    });
  }

  initTheme();
  initLanguage();
  initNav();
  var recue = initScrollCues();
  if (PAGE === 'home') { initLegend(); initHome(); }
  if (PAGE === 'explore') initExplore();
  if (PAGE === 'robustness') initRobustness();
  if (PAGE === 'methods') initMethods();
  if (PAGE === 'ratings') initIdeas();
  initPrint();   /* after the page code: Methods typesets every formula and keeps the reader's place before printing unfolds the schedules */
})();
