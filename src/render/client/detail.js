/* Strata viewer: the node detail popover. */
(function () {
  'use strict';

  var TL = window.TL;
  var page = document.querySelector('.tl-page');
  var panel = document.getElementById('tl-detail');
  if (!panel) return;

  var body = panel.querySelector('.tl-detail-body');
  var openFor = null;
  var currentEl = null;


  /* A citation is only useful if you can see what it points at. When the
     diagram was built with --repo-root the cited lines travel inside the file,
     so the code opens here rather than sending the reader to go and find it. */
  function sourceRow(source) {
    var snippet = (TL.data.snippets || {})[source];
    var row = document.createElement('div');
    row.className = 'tl-source';

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'tl-src';
    button.textContent = source;
    button.disabled = !snippet;
    if (!snippet) {
      button.title = 'rebuild with --repo-root to embed this code';
      row.appendChild(button);
      return row;
    }

    var code = buildCode(snippet);
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      var open = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!open));
      code.hidden = open;
      panel.classList.toggle('wide', !open || panel.querySelector('.tl-code:not([hidden])') !== null);
      place(currentEl);
    });

    row.appendChild(button);
    row.appendChild(code);
    return row;
  }

  function buildCode(snippet) {
    var wrap = document.createElement('div');
    wrap.className = 'tl-code';
    wrap.hidden = true;

    var head = document.createElement('div');
    head.className = 'tl-code-head';
    head.textContent = snippet.path
      + (snippet.citedFrom ? ':' + snippet.citedFrom + (snippet.citedTo !== snippet.citedFrom ? '-' + snippet.citedTo : '') : '')
      + (snippet.language ? ' · ' + snippet.language : '');
    wrap.appendChild(head);

    var pre = document.createElement('pre');
    snippet.lines.forEach(function (line) {
      var row = document.createElement('span');
      row.className = 'tl-line' + (line.cited ? ' cited' : '');
      var num = document.createElement('i');
      num.textContent = line.n;
      var text = document.createElement('code');
      text.textContent = line.text;
      row.appendChild(num);
      row.appendChild(text);
      pre.appendChild(row);
    });
    wrap.appendChild(pre);

    if (snippet.clipped) {
      var note = document.createElement('div');
      note.className = 'tl-code-note';
      note.textContent = 'cited range continues past what is shown';
      wrap.appendChild(note);
    }
    return wrap;
  }

  function close() {
    panel.setAttribute('data-open', 'false');
    panel.classList.remove('wide');
    openFor = null;
    currentEl = null;
  }

  function open(id, el) {
    var info = (TL.data.nodes || {})[id];
    if (!info) return;
    body.textContent = '';

    var heading = document.createElement('h3');
    heading.textContent = info.label;
    body.appendChild(heading);

    if (info.sublabel) {
      var sub = document.createElement('p');
      sub.textContent = info.sublabel;
      body.appendChild(sub);
    }
    if (info.detail) {
      var detail = document.createElement('p');
      detail.textContent = info.detail;
      body.appendChild(detail);
    }
    if (info.sources && info.sources.length) {
      var list = document.createElement('div');
      list.className = 'tl-sources';
      info.sources.forEach(function (source) {
        list.appendChild(sourceRow(source));
      });
      body.appendChild(list);
    }
    (info.links || []).forEach(function (link) {
      var title = document.createElement('p');
      title.className = 'tl-link';
      title.textContent = '\u2192 ' + link.to + (link.label ? ' \u00b7 ' + link.label : '');
      body.appendChild(title);
      if (link.detail) {
        var why = document.createElement('p');
        why.textContent = link.detail;
        body.appendChild(why);
      }
      if (link.sources.length) {
        var rows = document.createElement('div');
        rows.className = 'tl-sources';
        link.sources.forEach(function (source) {
          rows.appendChild(sourceRow(source));
        });
        body.appendChild(rows);
      }
    });

    currentEl = el;
    panel.classList.remove('wide');
    place(el);
    panel.setAttribute('data-open', 'true');
    openFor = id;
  }

  /* The page is CSS-scaled to fit, so client rects come back in scaled pixels;
     divide back out to land the panel in the page's own coordinate space. */
  function place(el) {
    if (!el) return;
    var scale = TL.scale || 1;
    var box = el.getBoundingClientRect();
    var host = page.getBoundingClientRect();
    var x = (box.left - host.left) / scale;
    var y = (box.bottom - host.top) / scale + 10;

    var wasOpen = panel.getAttribute('data-open');
    panel.style.left = '0px';
    panel.style.top = '0px';
    panel.setAttribute('data-open', 'true');
    var width = panel.offsetWidth;
    var height = panel.offsetHeight;
    panel.setAttribute('data-open', wasOpen);

    var maxX = TL.data.meta.width - width - 16;
    var maxY = TL.data.meta.height - height - 16;
    panel.style.left = Math.max(16, Math.min(x, maxX)) + 'px';
    panel.style.top = Math.max(16, Math.min(y, maxY)) + 'px';
  }

  Array.prototype.forEach.call(document.querySelectorAll('.node.has-detail'), function (el) {
    var id = el.getAttribute('data-node');
    function activate(event) {
      event.stopPropagation();
      if (openFor === id) { close(); return; }
      open(id, el);
    }
    el.addEventListener('click', activate);
    el.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(event); }
    });
  });

  panel.querySelector('.close').addEventListener('click', close);
  document.addEventListener('click', function (event) {
    if (openFor && !panel.contains(event.target)) close();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') close();
  });

  var hashNode = TL.readHash().node;
  if (hashNode) {
    var el = document.querySelector('[data-node="' + hashNode.replace(/"/g, '') + '"]');
    if (el) open(hashNode, el);
  }
}());
