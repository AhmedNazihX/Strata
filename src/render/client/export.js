/* Strata viewer: SVG and PNG export.
   The diagram on screen is SVG already; the header and caption are HTML, so an
   export redraws those two as SVG text into the same coordinate space rather
   than rasterising the DOM. Web fonts are inlined when the network allows and
   the export falls back to the local stack when it does not — and says so. */
(function () {
  'use strict';

  var TL = window.TL;
  var meta = TL.data.meta;
  var frame = TL.data.frame;
  var cap = TL.data.capLayout;
  var NS = 'http://www.w3.org/2000/svg';

  var measurer = document.createElement('canvas').getContext('2d');
  var fontCache = null;

  function el(name, attrs, text) {
    var node = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function measure(text, font) {
    measurer.font = font;
    return measurer.measureText(text).width;
  }

  function wrap(text, font, maxWidth, maxLines) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    var lines = [];
    var current = '';
    for (var i = 0; i < words.length; i += 1) {
      var candidate = current ? current + ' ' + words[i] : words[i];
      if (measure(candidate, font) <= maxWidth || !current) { current = candidate; continue; }
      lines.push(current);
      current = words[i];
      if (lines.length >= maxLines) break;
    }
    if (lines.length < maxLines && current) lines.push(current);
    return lines.slice(0, maxLines);
  }

  function cssText() {
    var sheet = document.getElementById('tl-css');
    return sheet ? sheet.textContent : '';
  }

  /* ---------- building the export document ---------- */

  function buildSvg(fontCss) {
    var svg = el('svg', {
      xmlns: NS, width: meta.width, height: meta.height,
      viewBox: '0 0 ' + meta.width + ' ' + meta.height,
    });
    svg.setAttribute('data-theme', document.documentElement.getAttribute('data-theme'));

    var style = el('style');
    style.textContent = (fontCss || '') + '\n' + cssText()
      + '\nsvg[data-theme="light"]{' + themeVars('light') + '}'
      + '\nsvg[data-theme="dark"]{' + themeVars('dark') + '}';
    svg.appendChild(style);

    svg.appendChild(el('rect', { x: 0, y: 0, width: meta.width, height: meta.height, fill: 'var(--bg)' }));

    drawHeader(svg);
    var stage = document.querySelector('.tl-stage').cloneNode(true);
    Array.prototype.slice.call(stage.childNodes).forEach(function (child) { svg.appendChild(child); });
    drawCaption(svg);

    return new XMLSerializer().serializeToString(svg);
  }

  /* Copy the live custom properties for a theme out of the page's own rules,
     so an export never carries a second, drifting palette. */
  function themeVars(name) {
    var previous = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', name);
    var computed = getComputedStyle(document.documentElement);
    var out = [];
    (TL.data.cssVarNames || []).forEach(function (varName) {
      out.push(varName + ':' + computed.getPropertyValue(varName).trim());
    });
    document.documentElement.setAttribute('data-theme', previous);
    return out.join(';');
  }

  function drawHeader(svg) {
    var h = frame.header;
    svg.appendChild(el('text', {
      x: h.x, y: h.y + 24, class: 'tl-title-svg',
      style: 'font-family:var(--font-display);font-size:29px;font-weight:600;fill:var(--display)',
    }, meta.title));
    if (meta.subtitle) {
      svg.appendChild(el('text', {
        x: h.x, y: h.y + 46,
        style: 'font-family:var(--font-body);font-size:12.5px;fill:var(--muted)',
      }, meta.subtitle));
    }
  }

  function drawCaption(svg) {
    if (!frame.caption || !(TL.data.steps || []).length) return;
    var step = TL.data.steps[TL.state.index];
    if (!step) return;

    var box = frame.caption;
    svg.appendChild(el('rect', {
      x: box.x, y: box.y, width: box.w, height: box.h, rx: 18,
      fill: 'var(--panel)', stroke: 'var(--stroke)',
    }));

    var x = box.x + cap.padX;
    var y = box.y + cap.padY;

    svg.appendChild(el('text', {
      x: x, y: y + 11,
      style: 'font-family:var(--font-mono);font-size:10.5px;letter-spacing:1.6px;fill:var(--flow)',
    }, 'STEP ' + (TL.state.index + 1 < 10 ? '0' : '') + (TL.state.index + 1)));

    svg.appendChild(el('text', {
      x: x, y: y + 44,
      style: 'font-family:var(--font-display);font-size:25px;font-weight:600;fill:var(--display)',
    }, step.title));

    var ledeFont = '13px ' + bodyStack();
    wrap(step.lede, ledeFont, cap.leftW, cap.ledeLines).forEach(function (line, i) {
      svg.appendChild(el('text', {
        x: x, y: y + 72 + i * 21,
        style: 'font-family:var(--font-body);font-size:13px;fill:var(--muted)',
      }, line));
    });

    drawChips(svg, step.notes || [], box.x + cap.padX + cap.leftW + cap.gap, y);
  }

  function drawChips(svg, notes, left, top) {
    var colW = (frame.caption.w - cap.padX * 2 - cap.leftW - cap.gap - cap.chipGap) / 2;
    var keyFont = '11.5px ' + monoStack();
    var valFont = '11px ' + bodyStack();
    var rowTops = [];
    var cursor = [top, top];

    notes.forEach(function (note, i) {
      var col = i % 2;
      var x = left + col * (colW + cap.chipGap);
      var lines = wrap(note.v, valFont, colW - 26, 2);
      var height = 20 + 15 + lines.length * 15;

      svg.appendChild(el('rect', {
        x: x, y: cursor[col], width: colW, height: height, rx: 10,
        fill: 'var(--panel)', stroke: 'var(--stroke)',
      }));
      svg.appendChild(el('text', {
        x: x + 13, y: cursor[col] + 22,
        style: 'font-family:var(--font-mono);font-size:11.5px;fill:var(--flow)',
      }, note.k));
      lines.forEach(function (line, j) {
        svg.appendChild(el('text', {
          x: x + 13, y: cursor[col] + 38 + j * 15,
          style: 'font-family:var(--font-body);font-size:11px;fill:var(--muted)',
        }, line));
      });
      cursor[col] += height + cap.chipGap;
      rowTops.push(height);
    });
    void keyFont;
  }

  function bodyStack() { return getComputedStyle(document.body).fontFamily; }
  function monoStack() { return 'monospace'; }

  /* ---------- fonts ---------- */

  async function inlineFonts() {
    if (fontCache !== null) return fontCache;
    var href = TL.data.fontHref;
    if (!href) { fontCache = ''; return fontCache; }
    try {
      var css = await fetchText(href);
      var urls = css.match(/https:\/\/[^)"']+\.woff2/g) || [];
      var unique = urls.filter(function (u, i) { return urls.indexOf(u) === i; }).slice(0, 12);
      var pairs = await Promise.all(unique.map(async function (url) {
        return [url, await fetchDataUrl(url)];
      }));
      pairs.forEach(function (pair) { css = css.split(pair[0]).join(pair[1]); });
      fontCache = css;
    } catch (error) {
      fontCache = '';
    }
    return fontCache;
  }

  function fetchText(url) {
    return fetch(url, { mode: 'cors' }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.text();
    });
  }

  function fetchDataUrl(url) {
    return fetch(url, { mode: 'cors' })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      });
  }

  /* ---------- output ---------- */

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function slug() {
    return (meta.title || 'diagram').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram';
  }

  async function rasterise(scale) {
    var source = buildSvg(await inlineFonts());
    var blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    try {
      var image = await loadImage(url);
      var canvas = document.createElement('canvas');
      canvas.width = meta.width * scale;
      canvas.height = meta.height * scale;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error('the diagram could not be rasterised')); };
      image.src = url;
    });
  }

  async function withFeedback(button, label, task) {
    var original = button.textContent;
    button.disabled = true;
    try {
      await task();
      button.textContent = label;
    } catch (error) {
      button.textContent = 'Failed';
      console.error('[strata] export failed:', error);
    } finally {
      setTimeout(function () { button.textContent = original; button.disabled = false; }, 1600);
    }
  }

  bind('tl-svg', 'Saved', async function () {
    var source = buildSvg(await inlineFonts());
    download(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }), slug() + '.svg');
  });

  bind('tl-png', 'Saved', async function () {
    var blob = await rasterise(2);
    if (!blob) throw new Error('the browser produced no image');
    download(blob, slug() + '.png');
  });

  bind('tl-copy', 'Copied', async function () {
    var blob = await rasterise(2);
    if (!blob) throw new Error('the browser produced no image');
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error('this browser cannot write images to the clipboard');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  });

  function bind(id, label, task) {
    var button = document.getElementById(id);
    if (!button) return;
    button.addEventListener('click', function () { withFeedback(button, label, task); });
  }
}());
