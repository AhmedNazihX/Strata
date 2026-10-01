/* Strata viewer: step engine, controls, theme and fit. */
(function () {
  'use strict';

  var dataEl = document.getElementById('tl-data');
  var TL = window.TL = window.TL || {};
  TL.data = JSON.parse(dataEl.textContent);

  var page = document.querySelector('.tl-page');
  var root = document.documentElement;
  var steps = TL.data.steps || [];
  var meta = TL.data.meta || {};
  var narrated = steps.length > 1;

  var nodeEls = {};
  var linkEls = {};
  Array.prototype.forEach.call(document.querySelectorAll('[data-node]'), function (el) {
    nodeEls[el.getAttribute('data-node')] = el;
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-link]'), function (el) {
    linkEls[el.getAttribute('data-link')] = el;
  });

  var state = { index: 0, playing: narrated && meta.autoplay !== false, elapsed: 0 };
  var motionChoice = null;
  TL.state = state;

  /* ---------- painting ---------- */

  function setAll(on) {
    Object.keys(nodeEls).forEach(function (id) { nodeEls[id].classList.toggle('on', on); });
    Object.keys(linkEls).forEach(function (id) { linkEls[id].classList.toggle('on', on); });
  }

  function paint() {
    if (!narrated) { setAll(true); return; }
    var step = steps[state.index];
    if (!step) return;
    var onNodes = {};
    (step.nodes || []).forEach(function (id) { onNodes[id] = true; });
    var onLinks = {};
    (step.links || []).forEach(function (id) { onLinks[id] = true; });

    Object.keys(nodeEls).forEach(function (id) { nodeEls[id].classList.toggle('on', !!onNodes[id]); });
    Object.keys(linkEls).forEach(function (id) { linkEls[id].classList.toggle('on', !!onLinks[id]); });

    text('tl-step-no', 'STEP ' + pad(state.index + 1));
    text('tl-cap-title', step.title);
    text('tl-cap-lede', step.lede);
    text('tl-counter', pad(state.index + 1) + ' / ' + pad(steps.length));

    var bar = document.getElementById('tl-progress-fill');
    if (bar) bar.style.width = Math.round((state.index + 1) / steps.length * 100) + '%';

    paintChips(step.notes || []);

    Array.prototype.forEach.call(document.querySelectorAll('.dot'), function (dot, i) {
      dot.setAttribute('aria-current', String(i === state.index));
    });

    page.classList.toggle('paused', !state.playing);
    var play = document.getElementById('tl-play');
    if (play) {
      play.textContent = state.playing ? 'Pause' : 'Play';
      play.setAttribute('aria-pressed', String(state.playing));
    }
    writeHash();
  }

  function paintChips(notes) {
    var host = document.getElementById('tl-chips');
    if (!host) return;
    host.textContent = '';
    notes.forEach(function (note) {
      var chip = document.createElement('div');
      chip.className = 'tl-chip';
      var key = document.createElement('b');
      key.textContent = note.k;
      var value = document.createElement('span');
      value.textContent = note.v;
      chip.appendChild(key);
      chip.appendChild(value);
      host.appendChild(chip);
    });
  }

  function text(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* ---------- navigation ---------- */

  function go(index, stop) {
    if (!narrated) return;
    state.index = (index + steps.length) % steps.length;
    if (stop) state.playing = false;
    state.elapsed = 0;
    paint();
  }
  TL.go = go;

  function toggle() {
    state.playing = !state.playing;
    state.elapsed = 0;
    paint();
  }

  /* ---------- motion ----------
     The operating system's "reduce motion" setting wins by default, which is
     why an animated diagram can look dead in one browser and alive in another
     on the same machine. A viewer who wants it anyway can say so here. */

  function prefersReduced() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  function savedMotion() {
    var fromHash = readHash().motion;
    if (fromHash === 'on' || fromHash === 'off') return fromHash;
    try {
      var stored = localStorage.getItem('strata-motion');
      if (stored === 'on' || stored === 'off') return stored;
    } catch (e) { /* file:// or private mode */ }
    return null;
  }

  function setMotion(choice, remember) {
    var explicit = choice === 'on' || choice === 'off' ? choice : null;
    var wanted = explicit
      ? explicit === 'on'
      : (meta.motion !== 'off' && !prefersReduced());

    page.classList.toggle('motion', wanted);
    root.setAttribute('data-motion', wanted ? 'on' : 'off');
    motionChoice = explicit;

    if (remember && explicit) {
      try { localStorage.setItem('strata-motion', explicit); } catch (e) { /* ignore */ }
    }
    var btn = document.getElementById('tl-motion');
    if (btn) {
      btn.setAttribute('aria-pressed', String(wanted));
      btn.textContent = wanted ? 'Motion' : 'Still';
      btn.title = wanted
        ? 'Turn the animation off (M)'
        : (prefersReduced() && !explicit
          ? 'Animation is off because this system asks for reduced motion — click to override (M)'
          : 'Turn the animation on (M)');
    }
    TL.motion = wanted;
  }

  TL.setMotion = setMotion;

  function toggleMotion() {
    setMotion(TL.motion ? 'off' : 'on', true);
    writeHash();
  }

  /* ---------- theme ---------- */

  function setTheme(name) {
    root.setAttribute('data-theme', name);
    try { localStorage.setItem('strata-theme', name); } catch (e) { /* private mode */ }
    var btn = document.getElementById('tl-theme');
    if (btn) btn.textContent = name === 'dark' ? 'Light' : 'Dark';
  }
  TL.setTheme = setTheme;

  function initialTheme() {
    var fromHash = readHash().theme;
    if (fromHash === 'dark' || fromHash === 'light') return fromHash;
    try {
      var saved = localStorage.getItem('strata-theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) { /* private mode */ }
    return meta.theme || 'dark';
  }

  /* ---------- deep links ---------- */

  function readHash() {
    var out = {};
    (location.hash || '').replace(/^#/, '').split('&').forEach(function (pair) {
      if (!pair) return;
      var bits = pair.split('=');
      out[decodeURIComponent(bits[0])] = decodeURIComponent(bits.slice(1).join('=') || '');
    });
    return out;
  }
  TL.readHash = readHash;

  var hashTimer = null;
  function writeHash() {
    if (hashTimer) clearTimeout(hashTimer);
    hashTimer = setTimeout(function () {
      var parts = [];
      if (narrated) parts.push('step=' + (state.index + 1));
      parts.push('theme=' + root.getAttribute('data-theme'));
      if (motionChoice) parts.push('motion=' + motionChoice);
      history.replaceState(null, '', '#' + parts.join('&'));
    }, 240);
  }

  /* ---------- fit to window ---------- */

  function fit() {
    var pad = 32;
    var scale = Math.min(
      (window.innerWidth - pad) / meta.width,
      (window.innerHeight - pad) / meta.height,
      1
    );
    page.style.transform = 'scale(' + scale + ')';
    page.classList.add('is-fit');
    document.body.style.height = Math.ceil(meta.height * scale + pad) + 'px';
    TL.scale = scale;
  }

  /* ---------- wiring ---------- */

  setTheme(initialTheme());
  setMotion(savedMotion(), false);

  bind('tl-prev', function () { go(state.index - 1, true); });
  bind('tl-next', function () { go(state.index + 1, true); });
  bind('tl-play', toggle);
  bind('tl-theme', function () {
    setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  bind('tl-motion', toggleMotion);

  Array.prototype.forEach.call(document.querySelectorAll('.dot'), function (dot, i) {
    dot.addEventListener('click', function () { go(i, true); });
  });

  function bind(id, handler) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
  }

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var tag = (event.target && event.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    switch (event.key) {
      case 'ArrowRight': case 'PageDown': go(state.index + 1, true); break;
      case 'ArrowLeft': case 'PageUp': go(state.index - 1, true); break;
      case 'Home': go(0, true); break;
      case 'End': go(steps.length - 1, true); break;
      case ' ': event.preventDefault(); toggle(); break;
      case 't': case 'T':
        setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); break;
      case 'm': case 'M': toggleMotion(); break;
      default:
        if (/^[1-9]$/.test(event.key)) go(Number(event.key) - 1, true);
        return;
    }
    event.preventDefault();
  });

  var hash = readHash();
  if (narrated && hash.step) {
    var wanted = parseInt(hash.step, 10);
    if (wanted >= 1 && wanted <= steps.length) { state.index = wanted - 1; state.playing = false; }
  }

  setInterval(function () {
    if (!state.playing || !narrated) return;
    state.elapsed += 0.25;
    if (state.elapsed >= (meta.stepSeconds || 8)) { state.elapsed = 0; go(state.index + 1); }
  }, 250);

  window.addEventListener('resize', fit);
  fit();
  paint();
}());
