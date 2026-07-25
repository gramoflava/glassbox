/* ---------------------------------------------------------------------------
   glassbox — application

   One canonical document, N target descriptors (see targets.js). The document
   is the only thing that is edited; JSON is always a rendering of it, never a
   source you type into. That is the whole reason the structure cannot break.
--------------------------------------------------------------------------- */

'use strict';

const NS = 'glassbox.';
const K_SLOTS = NS + 'slots';
const K_DRAFT = NS + 'draft';
const K_TARGET = NS + 'target';
const K_COORDS = NS + 'coordorder';

/* --- coordinate-order overrides -------------------------------------------
   Ideogram publishes its axis order; Krea does not — its bbox JSON is a
   community convention around a text encoder that reads the numbers loosely,
   so there is no spec to be right about. That makes axis order an empirical
   question, and empirical questions need a switch rather than a constant.

   Overrides are applied onto the descriptor objects themselves, so every
   exportDoc/importDoc that reads `this.bboxFormat` picks them up untouched. */

function loadCoordOverrides() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(K_COORDS)) || {}; } catch { /* ignore */ }
  for (const t of TARGETS) {
    if (t.defaultBboxFormat === undefined) t.defaultBboxFormat = t.bboxFormat;
    if (saved[t.id]) t.bboxFormat = saved[t.id];
  }
}

function setCoordOrder(t, format) {
  t.bboxFormat = format;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(K_COORDS)) || {}; } catch { /* ignore */ }
  if (format === t.defaultBboxFormat) delete saved[t.id]; else saved[t.id] = format;
  try { localStorage.setItem(K_COORDS, JSON.stringify(saved)); } catch { /* ignore */ }
}

/** Human description of a target's current coordinate convention. */
function coordsDescription(t) {
  if (t.boxes !== 'numeric') return 'Boxes become placement wording, not coordinates.';
  const order = {
    xywh: '[x, y, width, height]',
    xyxy: '[x1, y1, x2, y2] — x-first corners',
    yxyx: '[y_min, x_min, y_max, x_max] — row-first corners',
  }[t.bboxFormat || 'xywh'];
  const scale = t.grid ? `normalized 0–${t.grid}` : 'normalized 0–1';
  return `${order}, ${scale}, origin top-left.`;
}

/* --- canonical field catalogue -------------------------------------------
   Grouped for the accordion. Each entry is addressed by its dotted path in the
   document; whether a given target keeps it comes from that target's `fields`. */

const SECTIONS = [
  {
    title: 'Scene', open: true, fields: [
      { path: 'scene', label: 'Scene', type: 'textarea', ph: 'a dense pine forest at first light, mist between the trunks' },
      { path: 'background', label: 'Background', type: 'textarea', ph: 'receding treeline, soft depth haze' },
      { path: 'mood', label: 'Mood', type: 'text', ph: 'still, watchful' },
    ]
  },
  {
    title: 'Style', fields: [
      { path: 'style.type', label: 'Style type', type: 'select', options: ['', 'AUTO', 'GENERAL', 'REALISTIC', 'DESIGN', 'FICTION'] },
      { path: 'style.descriptors', label: 'Aesthetics', type: 'textarea', ph: 'painterly, muted naturalism, fine grain' },
      { path: 'style.medium', label: 'Medium', type: 'text', ph: 'oil on canvas, 35mm photograph' },
      { path: 'style.palette', label: 'Colour palette', type: 'text', ph: '#4a5d3a, #d9cbb0, #2c3e50' },
    ]
  },
  {
    title: 'Light & camera', fields: [
      { path: 'lighting', label: 'Lighting', type: 'textarea', ph: 'low sun through fog, long shadows' },
      { path: 'camera.angle', label: 'Camera angle', type: 'text', ph: 'slightly low, eye level with the animals' },
      { path: 'camera.distance', label: 'Camera distance', type: 'text', ph: 'wide shot' },
      { path: 'camera.lens', label: 'Lens', type: 'text', ph: '35mm, shallow depth of field' },
    ]
  },
  {
    title: 'Text in image', fields: [
      { path: 'text.content', label: 'Text content', type: 'text', ph: 'NORTHWOOD' },
      { path: 'text.placement', label: 'Text placement', type: 'text', ph: 'lower centre, small' },
    ]
  },
  {
    title: 'Output', fields: [
      { path: 'negative', label: 'Negative prompt', type: 'textarea', ph: 'blur, extra limbs, watermark' },
      { path: 'seed', label: 'Seed', type: 'number', ph: 'blank for random' },
    ]
  },
];

/* --- state ---------------------------------------------------------------- */

let doc = blankDoc();
let targetId = localStorage.getItem(K_TARGET) || 'general';
let selectedId = null;
let docName = '';
const openBoxes = new Set();
let backdrop = { url: '', name: '', opacity: 0.45 };

const $ = (sel) => document.querySelector(sel);
const el = {
  canvas: $('#canvas'), wrap: $('#canvas-wrap'), inspector: $('#inspector'),
  target: $('#target'), aspect: $('#aspect'), empty: $('#canvas-empty'),
  backdrop: $('#backdrop'), toast: $('#toast'), docName: $('#doc-name'),
  hintCoords: $('#hint-coords'),
};

function target() { return TARGETS.find((t) => t.id === targetId) || TARGETS[0]; }

function blankDoc() {
  return {
    version: 1,
    aspect: '16:9',
    scene: '', background: '', mood: '',
    style: { type: '', descriptors: '', medium: '', palette: '' },
    lighting: '',
    camera: { angle: '', distance: '', lens: '' },
    text: { content: '', placement: '' },
    negative: '', seed: null,
    pixelBasis: null,      // remembered frame for targets that export pixels
    boxes: [],
    extras: {},
  };
}

let idCounter = 1;
function nextId() { return 'b' + (idCounter++); }

/* --- dotted path access --------------------------------------------------- */

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let o = obj;
  for (const k of keys) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
  o[last] = value;
}

/* --- geometry ------------------------------------------------------------- */

function aspectRatio(str) {
  const m = String(str || '16:9').split(':').map(Number);
  return (m[0] > 0 && m[1] > 0) ? m[0] / m[1] : 16 / 9;
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/**
 * Accept any ratio a pasted document declares, not just the preset list —
 * "32:17" is perfectly valid and silently snapping it to 16:9 would move every
 * box you just imported.
 */
function ensureAspectOption(value) {
  if (!value || !ratioOf(value)) { doc.aspect = doc.aspect || '16:9'; return; }
  if ([...el.aspect.options].some((o) => o.value === value)) return;
  const o = document.createElement('option');
  o.value = value;
  o.textContent = value + ' (imported)';
  el.aspect.appendChild(o);
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/* --- canvas sizing -------------------------------------------------------- */

function fitCanvas() {
  const pad = 32;
  const availW = Math.max(120, el.wrap.clientWidth - pad);
  const availH = Math.max(120, el.wrap.clientHeight - pad);
  const r = aspectRatio(doc.aspect);
  let w = availW, h = w / r;
  if (h > availH) { h = availH; w = h * r; }
  el.canvas.style.width = Math.round(w) + 'px';
  el.canvas.style.height = Math.round(h) + 'px';
}

/* --- canvas rendering ----------------------------------------------------- */

function renderCanvas() {
  el.canvas.querySelectorAll('.box').forEach((n) => n.remove());

  doc.boxes.forEach((box) => {
    const color = (PALETTE_BY_KEY[box.color] || PALETTE_BY_KEY.grey).hex;
    const node = document.createElement('div');
    node.className = 'box' + (box.id === selectedId ? ' selected' : '');
    node.dataset.id = box.id;
    node.style.setProperty('--box-color', color);
    node.style.left = (box.rect.x * 100) + '%';
    node.style.top = (box.rect.y * 100) + '%';
    node.style.width = (box.rect.w * 100) + '%';
    node.style.height = (box.rect.h * 100) + '%';

    const label = document.createElement('div');
    label.className = 'box-label' + (box.label ? '' : ' unnamed');
    label.textContent = box.label || 'unlabelled';
    node.appendChild(label);

    if (box.id === selectedId) {
      for (const dir of ['nw', 'ne', 'sw', 'se']) {
        const h = document.createElement('div');
        h.className = 'handle';
        h.dataset.dir = dir;
        node.appendChild(h);
      }
    }
    el.canvas.appendChild(node);
  });

  el.empty.style.display = doc.boxes.length ? 'none' : 'flex';
  $('#btn-dup').disabled = $('#btn-del').disabled = !selectedId;
}

/* --- pointer interaction: draw, move, resize ------------------------------ */

let drag = null;

function canvasPoint(ev) {
  const r = el.canvas.getBoundingClientRect();
  if (!r.width || !r.height) return { x: 0, y: 0 };  // before layout settles
  return { x: clamp01((ev.clientX - r.left) / r.width), y: clamp01((ev.clientY - r.top) / r.height) };
}

el.canvas.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  const p = canvasPoint(ev);
  const handle = ev.target.closest('.handle');
  const boxNode = ev.target.closest('.box');

  if (handle && boxNode) {
    const box = doc.boxes.find((b) => b.id === boxNode.dataset.id);
    drag = { mode: 'resize', dir: handle.dataset.dir, box, start: p, orig: { ...box.rect } };
  } else if (boxNode) {
    const box = doc.boxes.find((b) => b.id === boxNode.dataset.id);
    select(box.id);
    drag = { mode: 'move', box, start: p, orig: { ...box.rect } };
  } else {
    const box = {
      id: nextId(), rect: { x: p.x, y: p.y, w: 0, h: 0 },
      prompt: '', weight: 1, depth: '', kind: 'obj', text: '', palette: '', label: '', color: 'grey',
    };
    doc.boxes.push(box);
    selectedId = box.id;
    openBoxes.add(box.id);
    drag = { mode: 'draw', box, start: p, orig: { ...box.rect }, isNew: true };
    renderCanvas();
  }
  el.canvas.setPointerCapture(ev.pointerId);
  ev.preventDefault();
});

el.canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const p = canvasPoint(ev);
  const r = drag.box.rect;

  if (drag.mode === 'draw') {
    r.x = Math.min(drag.start.x, p.x);
    r.y = Math.min(drag.start.y, p.y);
    r.w = Math.abs(p.x - drag.start.x);
    r.h = Math.abs(p.y - drag.start.y);
  } else if (drag.mode === 'move') {
    const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    r.x = clamp01(Math.min(drag.orig.x + dx, 1 - drag.orig.w));
    r.y = clamp01(Math.min(drag.orig.y + dy, 1 - drag.orig.h));
  } else if (drag.mode === 'resize') {
    const o = drag.orig;
    let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
    if (drag.dir.includes('w')) x0 = p.x; else x1 = p.x;
    if (drag.dir.includes('n')) y0 = p.y; else y1 = p.y;
    r.x = Math.min(x0, x1); r.y = Math.min(y0, y1);
    r.w = Math.abs(x1 - x0); r.h = Math.abs(y1 - y0);
  }
  updateBoxNode(drag.box);
  renderJson();
});

el.canvas.addEventListener('pointerup', (ev) => {
  if (!drag) return;
  const d = drag; drag = null;
  el.canvas.releasePointerCapture(ev.pointerId);

  // A click rather than a drag: discard the zero-size box we speculatively made.
  if (d.isNew && (d.box.rect.w < 0.012 || d.box.rect.h < 0.012)) {
    doc.boxes = doc.boxes.filter((b) => b.id !== d.box.id);
    selectedId = null;
  }
  renderCanvas();
  renderInspector();
  persistDraft();
});

/** Cheap per-frame update during a drag — avoids rebuilding the whole canvas. */
function updateBoxNode(box) {
  const node = el.canvas.querySelector(`.box[data-id="${box.id}"]`);
  if (!node) return;
  node.style.left = (box.rect.x * 100) + '%';
  node.style.top = (box.rect.y * 100) + '%';
  node.style.width = (box.rect.w * 100) + '%';
  node.style.height = (box.rect.h * 100) + '%';
}

function select(id) {
  if (selectedId === id) return;
  selectedId = id;
  if (id) openBoxes.add(id);
  renderCanvas();
  renderInspector();
}

/* --- backdrop ------------------------------------------------------------- */

function setBackdrop(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (backdrop.url) URL.revokeObjectURL(backdrop.url);
  backdrop = { url: URL.createObjectURL(file), name: file.name, opacity: backdrop.opacity };
  applyBackdrop();
}

function applyBackdrop() {
  const on = !!backdrop.url;
  el.backdrop.src = backdrop.url || '';
  el.backdrop.style.display = on ? 'block' : 'none';
  el.backdrop.style.opacity = backdrop.opacity;
  for (const id of ['#backdrop-opacity', '#opacity-label', '#btn-backdrop-clear']) $(id).hidden = !on;
  $('#btn-backdrop').textContent = on ? 'Replace…' : 'Backdrop…';
}

$('#btn-backdrop').onclick = () => $('#backdrop-file').click();
$('#backdrop-file').onchange = (e) => { setBackdrop(e.target.files[0]); e.target.value = ''; };
$('#backdrop-opacity').oninput = (e) => { backdrop.opacity = e.target.value / 100; el.backdrop.style.opacity = backdrop.opacity; };
$('#btn-backdrop-clear').onclick = () => {
  if (backdrop.url) URL.revokeObjectURL(backdrop.url);
  backdrop = { url: '', name: '', opacity: backdrop.opacity };
  applyBackdrop();
};

el.canvas.addEventListener('dragover', (e) => { e.preventDefault(); el.canvas.classList.add('dragover'); });
el.canvas.addEventListener('dragleave', () => el.canvas.classList.remove('dragover'));
el.canvas.addEventListener('drop', (e) => {
  e.preventDefault();
  el.canvas.classList.remove('dragover');
  setBackdrop(e.dataTransfer.files[0]);
});

/* --- inspector ------------------------------------------------------------ */

function fieldSpecFor(path) {
  return target().fields.find((f) => f.path === path) || null;
}

function renderInspector() {
  const t = target();
  const frag = document.createDocumentFragment();

  /* Target note — what this target can and cannot do. */
  frag.appendChild(accordion('Target', [], (body) => {
    body.appendChild(hint(t.blurb));

    if (t.boxes === 'numeric') {
      /* Axis order is a switch, not a constant — see loadCoordOverrides. */
      const f = document.createElement('div');
      f.className = 'field' + (t.coordOrderUnsettled ? ' assumed' : '');
      const lab = document.createElement('label');
      lab.textContent = 'Coordinate order';
      const key = document.createElement('span');
      key.className = 'field__key';
      key.textContent = t.bboxFormat === t.defaultBboxFormat ? 'default' : 'overridden';
      lab.appendChild(key);
      const sel = document.createElement('select');
      for (const [v, txt] of [
        ['xywh', '[x, y, width, height]'],
        ['xyxy', '[x1, y1, x2, y2] — x-first'],
        ['yxyx', '[y, x, y, x] — row-first'],
      ]) {
        const o = document.createElement('option');
        o.value = v; o.textContent = txt;
        sel.appendChild(o);
      }
      sel.value = t.bboxFormat || 'xywh';
      sel.addEventListener('change', () => {
        setCoordOrder(t, sel.value);
        renderInspector();
        showCoordHint();
        toast('Coordinate order changed. Your boxes have not moved — only the numbers written out.');
      });
      f.append(lab, sel);
      body.appendChild(f);
      body.appendChild(hint(coordsDescription(t)));

      if (t.coordOrderUnsettled) {
        body.appendChild(hint(t.coordOrderUnsettled, true));
      }
    } else if (t.boxes === 'prose') {
      body.appendChild(hint(
        'This target has no coordinates. Each box you draw is exported as a placement phrase — '
        + 'glassbox writes the wording for you.'));
    }

    if (t.unverified) {
      body.appendChild(hint(
        'Field names for this target are unverified. Check them against a real export before trusting them, ' +
        'and correct targets.js when you know better.', true));
    }
  }, false));

  /* Canonical field sections. */
  for (const section of SECTIONS) {
    const supported = section.fields.filter((f) => fieldSpecFor(f.path)).length;
    frag.appendChild(accordion(section.title, [badge(`${supported}/${section.fields.length}`)], (body) => {
      for (const f of section.fields) body.appendChild(renderField(f));
    }, section.open));
  }

  /* Boxes. */
  frag.appendChild(accordion('Boxes', [badge(String(doc.boxes.length))], (body) => {
    body.appendChild(hint(
      'Labels and colours are yours alone — they are stripped from every export, are not expected on paste, ' +
      'and are kept in saved works.'));
    if (!doc.boxes.length) body.appendChild(hint('Drag on the canvas to draw one.'));
    for (const box of doc.boxes) body.appendChild(renderBoxRow(box));
  }, true));

  /* Anything a paste brought in that no target claims. */
  const extraKeys = Object.keys(doc.extras || {});
  if (extraKeys.length) {
    frag.appendChild(accordion('Unrecognised keys', [badge(String(extraKeys.length))], (body) => {
      body.appendChild(hint(
        'These came in with a paste and belong to no field glassbox knows. They are preserved and passed ' +
        'straight through to every export, untouched.', true));
      const pre = document.createElement('pre');
      pre.className = 'json sunk';
      pre.textContent = JSON.stringify(doc.extras, null, 2);
      body.appendChild(pre);
      const drop = document.createElement('button');
      drop.className = 'btn btn--danger';
      drop.textContent = 'Discard them';
      drop.onclick = () => { doc.extras = {}; renderInspector(); renderJson(); persistDraft(); };
      body.appendChild(drop);
    }, true));
  }

  /* Read-only JSON. */
  frag.appendChild(accordion('JSON', [badge('read-only')], (body) => {
    const pre = document.createElement('pre');
    pre.className = 'json sunk';
    pre.id = 'json-out';
    body.appendChild(pre);
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = 'Copy to clipboard';
    b.onclick = copyJson;
    body.appendChild(b);
  }, true));

  el.inspector.replaceChildren(frag);
  renderJson();
}

function accordion(title, extras, build, open) {
  const d = document.createElement('details');
  d.className = 'acc';
  d.dataset.section = title.toLowerCase();
  d.open = !!open;
  const s = document.createElement('summary');
  s.append(title, ...extras);
  d.appendChild(s);
  const body = document.createElement('div');
  body.className = 'acc__body';
  build(body);
  d.appendChild(body);
  return d;
}

function badge(text) {
  const b = document.createElement('span');
  b.className = 'count';
  b.textContent = text;
  return b;
}

function hint(text, warn) {
  const p = document.createElement('div');
  p.className = 'hint' + (warn ? ' warn' : '');
  p.textContent = text;
  return p;
}

function renderField(f) {
  const spec = fieldSpecFor(f.path);
  const wrap = document.createElement('div');
  wrap.className = 'field'
    + (spec ? '' : ' dropped')
    + (spec && spec.confidence === 'assumed' ? ' assumed' : '');

  const lab = document.createElement('label');
  lab.textContent = f.label;
  const key = document.createElement('span');
  key.className = 'field__key';
  key.textContent = spec ? spec.key : 'not in ' + target().name;
  if (spec && spec.confidence === 'assumed') key.title = 'Unverified field name. ' + (spec.note || '');
  else if (!spec) key.title = `${target().name} has no equivalent — the value is kept in the document and comes back when you switch targets, but is not exported.`;
  lab.appendChild(key);
  wrap.appendChild(lab);

  let input;
  if (f.type === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 2;
  } else if (f.type === 'select') {
    input = document.createElement('select');
    for (const o of f.options) {
      const opt = document.createElement('option');
      opt.value = o; opt.textContent = o || '—';
      input.appendChild(opt);
    }
  } else {
    input = document.createElement('input');
    input.type = f.type === 'number' ? 'number' : 'text';
  }
  const val = getPath(doc, f.path);
  input.value = val == null ? '' : val;
  if (f.ph) input.placeholder = f.ph;
  const id = 'f-' + f.path.replace(/\./g, '-');
  input.id = id; lab.htmlFor = id;

  input.addEventListener('input', () => {
    let v = input.value;
    if (f.type === 'number') v = v === '' ? null : Number(v);
    setPath(doc, f.path, v);
    renderJson();
    persistDraft();
  });
  wrap.appendChild(input);

  if (spec && spec.note) wrap.appendChild(hint(spec.note, spec.confidence === 'assumed'));
  return wrap;
}

/** What this box will actually look like in the current target's JSON. */
function boxExportPreview(box) {
  const t = target();
  if (t.boxes !== 'numeric') return `Exports as “${rectToProse(box)}”`;

  const nums = rectToBboxArray(box.rect, t.bboxFormat, scaleOf(t));
  const order = { yxyx: 'y, x, y, x', xyxy: 'x1, y1, x2, y2', xywh: 'x, y, w, h' }[t.bboxFormat || 'xywh'];
  return `Exports as [${nums.join(', ')}]  (${order}${t.grid ? `, 0–${t.grid} grid` : ''})`;
}

function renderBoxRow(box) {
  const color = (PALETTE_BY_KEY[box.color] || PALETTE_BY_KEY.grey).hex;
  const d = document.createElement('details');
  d.className = 'box-row solid' + (box.id === selectedId ? ' selected' : '');
  d.open = openBoxes.has(box.id);
  d.addEventListener('toggle', () => { d.open ? openBoxes.add(box.id) : openBoxes.delete(box.id); });

  const s = document.createElement('summary');
  const sw = document.createElement('span');
  sw.className = 'swatch';
  sw.style.background = color;
  const title = document.createElement('span');
  title.className = 'box-title' + (box.label ? '' : ' unnamed');
  title.textContent = box.label || 'unlabelled';
  const sub = document.createElement('span');
  sub.className = 'box-sub';
  sub.textContent = box.prompt || '—';
  s.append(sw, title, sub);
  s.addEventListener('click', () => {
    selectedId = box.id;
    // Keep the row highlight in step without rebuilding the whole inspector,
    // which would collapse whatever the user just opened.
    el.inspector.querySelectorAll('.box-row.selected').forEach((n) => n.classList.remove('selected'));
    d.classList.add('selected');
    renderCanvas();
  });
  d.appendChild(s);

  const body = document.createElement('div');
  body.className = 'box-body';

  /* Private label + palette. */
  const priv = document.createElement('div');
  priv.className = 'private-note';
  priv.textContent = 'Label and colour stay in glassbox — never exported.';
  body.appendChild(priv);

  const labelField = document.createElement('div');
  labelField.className = 'field';
  const ll = document.createElement('label');
  ll.textContent = 'Label';
  const li = document.createElement('input');
  li.type = 'text'; li.value = box.label; li.placeholder = 'wolf';
  li.addEventListener('input', () => {
    box.label = li.value;
    title.textContent = box.label || 'unlabelled';
    title.className = 'box-title' + (box.label ? '' : ' unnamed');
    renderCanvas();
    persistDraft();
  });
  labelField.append(ll, li);
  body.appendChild(labelField);

  const grid = document.createElement('div');
  grid.className = 'palette-grid';
  for (const c of PALETTE) {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = c.hex;
    b.title = c.name;
    b.setAttribute('aria-pressed', String(box.color === c.key));
    b.onclick = () => {
      box.color = c.key;
      grid.querySelectorAll('button').forEach((n) => n.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      sw.style.background = c.hex;
      renderCanvas();
      persistDraft();
    };
    grid.appendChild(b);
  }
  body.appendChild(grid);

  /* Exported content. */
  const pf = document.createElement('div');
  pf.className = 'field';
  const pl = document.createElement('label');
  pl.textContent = 'Description';
  const pk = document.createElement('span');
  pk.className = 'field__key';
  pk.textContent = target().boxes === 'numeric' ? 'regions[].prompt' : 'subjects[].description';
  pl.appendChild(pk);
  const pt = document.createElement('textarea');
  pt.rows = 2; pt.value = box.prompt;
  pt.placeholder = 'a grey wolf, head lowered, watching';
  pt.addEventListener('input', () => {
    box.prompt = pt.value;
    sub.textContent = box.prompt || '—';
    renderJson();
    persistDraft();
  });
  pf.append(pl, pt);
  body.appendChild(pf);

  /* Element type. Ideogram and Krea both distinguish "obj" from "text", where a
     text element additionally carries the literal copy to render. */
  const kindField = document.createElement('div');
  kindField.className = 'field';
  const kl = document.createElement('label');
  kl.textContent = 'Element type';
  const kk = document.createElement('span');
  kk.className = 'field__key';
  kk.textContent = 'type';
  kl.appendChild(kk);
  const ks = document.createElement('select');
  for (const [v, t] of [['obj', 'Object'], ['text', 'Rendered text']]) {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = t;
    ks.appendChild(opt);
  }
  ks.value = box.kind === 'text' ? 'text' : 'obj';
  kindField.append(kl, ks);
  body.appendChild(kindField);

  const textField = document.createElement('div');
  textField.className = 'field';
  textField.hidden = box.kind !== 'text';
  const tl = document.createElement('label');
  tl.textContent = 'Literal text';
  const tk = document.createElement('span');
  tk.className = 'field__key';
  tk.textContent = 'text';
  tl.appendChild(tk);
  const ti = document.createElement('input');
  ti.type = 'text'; ti.value = box.text || ''; ti.placeholder = 'NORTHWOOD';
  ti.addEventListener('input', () => { box.text = ti.value; renderJson(); persistDraft(); });
  textField.append(tl, ti);
  body.appendChild(textField);

  ks.addEventListener('change', () => {
    box.kind = ks.value;
    textField.hidden = box.kind !== 'text';
    renderJson(); persistDraft();
  });

  const row = document.createElement('div');
  row.className = 'row';

  const wf = document.createElement('div');
  wf.className = 'field';
  const wl = document.createElement('label'); wl.textContent = 'Weight';
  const wi = document.createElement('input');
  wi.type = 'number'; wi.step = '0.1'; wi.min = '0'; wi.max = '3'; wi.value = box.weight;
  wi.addEventListener('input', () => { box.weight = Number(wi.value) || 1; renderJson(); persistDraft(); });
  wf.append(wl, wi);

  const df = document.createElement('div');
  df.className = 'field';
  const dl = document.createElement('label'); dl.textContent = 'Depth';
  const ds = document.createElement('select');
  for (const o of ['', 'foreground', 'midground', 'background']) {
    const opt = document.createElement('option');
    opt.value = o; opt.textContent = o || '—';
    ds.appendChild(opt);
  }
  ds.value = box.depth;
  ds.addEventListener('change', () => { box.depth = ds.value; renderJson(); persistDraft(); });
  df.append(dl, ds);

  row.append(wf, df);
  body.appendChild(row);

  /* Per-element colour palette — Ideogram documents up to five per element.
     Distinct from the swatch above, which is yours and never exported. */
  const palField = document.createElement('div');
  palField.className = 'field';
  const pll = document.createElement('label');
  pll.textContent = 'Element colours';
  const plk = document.createElement('span');
  plk.className = 'field__key';
  plk.textContent = 'color_palette';
  pll.appendChild(plk);
  const pli = document.createElement('input');
  pli.type = 'text'; pli.value = box.palette || '';
  pli.placeholder = '#7a6a4f, #d8cbb4  (up to 5)';
  pli.addEventListener('input', () => { box.palette = pli.value; renderJson(); persistDraft(); });
  palField.append(pll, pli);
  body.appendChild(palField);

  /* What this box becomes in the current target. */
  const preview = document.createElement('div');
  preview.className = 'hint';
  preview.textContent = boxExportPreview(box);
  body.appendChild(preview);

  const del = document.createElement('button');
  del.className = 'btn btn--danger';
  del.textContent = 'Delete box';
  del.onclick = () => deleteBox(box.id);
  body.appendChild(del);

  d.appendChild(body);
  return d;
}

/* --- JSON preview --------------------------------------------------------- */

function currentJson() {
  return target().exportDoc(doc);
}

function renderJson() {
  const out = $('#json-out');
  if (!out) return;
  try {
    out.textContent = JSON.stringify(currentJson(), null, 2);
  } catch (e) {
    out.textContent = '// export failed: ' + e.message;
  }
}

async function copyJson() {
  const text = JSON.stringify(currentJson(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied ${target().name} JSON — labels and colours stripped.`);
  } catch {
    // Clipboard API needs a secure context; fall back to a selectable prompt.
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Copied.');
  }
}

/* --- box actions ---------------------------------------------------------- */

function addBox() {
  const n = doc.boxes.length;
  const off = (n % 5) * 0.04;
  const box = {
    id: nextId(),
    rect: { x: 0.3 + off, y: 0.3 + off, w: 0.28, h: 0.28 },
    prompt: '', weight: 1, depth: '', kind: 'obj', text: '', palette: '', label: '', color: 'grey',
  };
  doc.boxes.push(box);
  selectedId = box.id;
  openBoxes.add(box.id);
  renderCanvas(); renderInspector(); persistDraft();
}

function duplicateBox() {
  const src = doc.boxes.find((b) => b.id === selectedId);
  if (!src) return;
  const copy = {
    ...src, id: nextId(),
    rect: { ...src.rect, x: clamp01(src.rect.x + 0.03), y: clamp01(src.rect.y + 0.03) },
  };
  doc.boxes.push(copy);
  selectedId = copy.id;
  openBoxes.add(copy.id);
  renderCanvas(); renderInspector(); persistDraft();
}

function deleteBox(id) {
  doc.boxes = doc.boxes.filter((b) => b.id !== id);
  openBoxes.delete(id);
  if (selectedId === id) selectedId = null;
  renderCanvas(); renderInspector(); persistDraft();
}

/* --- import --------------------------------------------------------------- */

/** Merge a target's parsed result into the document, keeping private labels. */
function applyImport(parsed, raw) {
  const oldBoxes = doc.boxes;
  const next = blankDoc();

  for (const k of ['aspect', 'scene', 'background', 'mood', 'lighting', 'negative']) {
    if (parsed[k] != null) next[k] = parsed[k];
  }
  next.style = { ...next.style, ...(parsed.style || {}) };
  next.camera = { ...next.camera, ...(parsed.camera || {}) };
  next.text = { ...next.text, ...(parsed.text || {}) };
  next.seed = parsed.seed ?? null;
  next.pixelBasis = parsed.pixelBasis || null;
  if (!next.aspect) next.aspect = doc.aspect;

  /* Geometry matching: a pasted box that lands on roughly the same spot as one
     you already had inherits its label and colour. Each old box is claimed at
     most once, best match first. */
  const claimed = new Set();
  next.boxes = (parsed.boxes || []).map((b) => {
    const box = {
      id: nextId(),
      rect: b.rect, prompt: b.prompt || '', weight: b.weight ?? 1, depth: b.depth || '',
      kind: b.kind || 'obj',
      text: b.text || '',
      palette: b.palette || '',
      label: '', color: 'grey',      // never auto-filled on paste, by design
    };
    let best = null, bestScore = 0.35;
    for (const old of oldBoxes) {
      if (claimed.has(old.id)) continue;
      const score = iou(old.rect, box.rect);
      if (score > bestScore) { best = old; bestScore = score; }
    }
    if (best) { claimed.add(best.id); box.label = best.label; box.color = best.color; }
    return box;
  });

  /* Keys no target field claimed — kept and surfaced rather than silently lost. */
  const consumed = new Set(parsed.consumed || []);
  next.extras = {};
  for (const [k, v] of Object.entries(raw)) if (!consumed.has(k)) next.extras[k] = v;

  doc = next;
  selectedId = null;
  openBoxes.clear();
  ensureAspectOption(doc.aspect);
  el.aspect.value = doc.aspect;

  fitCanvas(); renderCanvas(); renderInspector(); persistDraft();

  const kept = next.boxes.filter((b) => b.label).length;
  const msgs = [`Read ${next.boxes.length} box${next.boxes.length === 1 ? '' : 'es'} as ${target().name}.`];
  if (kept) msgs.push(`${kept} label${kept === 1 ? '' : 's'} carried over.`);
  if (Object.keys(next.extras).length) msgs.push(`${Object.keys(next.extras).length} unrecognised key(s) kept.`);
  (parsed.warnings || []).forEach((w) => msgs.push(w));
  toast(msgs.join(' '));
}

/* --- persistence ---------------------------------------------------------- */

function serialize() {
  return {
    format: 'glassbox',
    version: 1,
    name: docName,
    target: targetId,
    savedAt: new Date().toISOString(),
    doc,                      // includes labels and colours — the point of saving
  };
}

function deserialize(payload) {
  if (!payload || payload.format !== 'glassbox' || !payload.doc) {
    throw new Error('Not a glassbox file.');
  }
  const base = blankDoc();
  doc = { ...base, ...payload.doc };
  doc.style = { ...base.style, ...(payload.doc.style || {}) };
  doc.camera = { ...base.camera, ...(payload.doc.camera || {}) };
  doc.text = { ...base.text, ...(payload.doc.text || {}) };
  doc.extras = payload.doc.extras || {};
  doc.pixelBasis = payload.doc.pixelBasis || null;
  doc.boxes = (payload.doc.boxes || []).map((b) => ({
    id: nextId(),
    rect: b.rect || { x: 0.3, y: 0.3, w: 0.3, h: 0.3 },
    prompt: b.prompt || '', weight: b.weight ?? 1, depth: b.depth || '',
    kind: b.kind || 'obj',
    text: b.text || '',
    palette: b.palette || '',
    label: b.label || '', color: PALETTE_BY_KEY[b.color] ? b.color : 'grey',
  }));
  docName = payload.name || '';
  ensureAspectOption(doc.aspect);
  if (payload.target && TARGETS.some((t) => t.id === payload.target)) {
    targetId = payload.target;
    el.target.value = targetId;
  }
  selectedId = null;
  openBoxes.clear();
  el.aspect.value = doc.aspect;
  el.docName.textContent = docName;
  fitCanvas(); renderCanvas(); renderInspector();
}

function readSlots() {
  try { return JSON.parse(localStorage.getItem(K_SLOTS)) || []; } catch { return []; }
}
function writeSlots(slots) {
  try {
    localStorage.setItem(K_SLOTS, JSON.stringify(slots));
    return true;
  } catch (e) {
    toast('Browser storage is full — save to a file instead.', true);
    return false;
  }
}

let draftTimer = null;
function persistDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try { localStorage.setItem(K_DRAFT, JSON.stringify(serialize())); } catch { /* quota — ignore */ }
  }, 300);
}

/* --- dialogs -------------------------------------------------------------- */

const dlgPaste = $('#dlg-paste'), dlgSave = $('#dlg-save'),
  dlgOpen = $('#dlg-open'), dlgData = $('#dlg-data');

$('#btn-paste').onclick = async () => {
  $('#paste-target').textContent = target().name;
  $('#paste-error').textContent = '';
  $('#paste-text').value = '';
  $('#paste-summary').hidden = true;
  pasteAnalysis = null;
  pasteFormatOverride = null;
  dlgPaste.showModal();
  // Offer whatever is already on the clipboard, if the browser allows reading it.
  try {
    const t = await navigator.clipboard.readText();
    if (t && t.trim().startsWith('{')) { $('#paste-text').value = t; analysePaste(); }
  } catch { /* no permission — user pastes manually */ }
  $('#paste-text').focus();
};

const COORD_LABELS = {
  xywh: '[x, y, w, h]',
  xyxy: '[x1, y1, x2, y2]',
  yxyx: '[y, x, y, x]',
};

/* The last successful analysis, so the format toggle can re-run without
   re-parsing and the OK button can apply exactly what was previewed. */
let pasteAnalysis = null;
let pasteFormatOverride = null;

/**
 * Parse and interpret, without touching the document.
 *
 * Tries the selected target first — it knows its own shape best — and falls
 * back to a structural scan of the whole tree when that finds nothing. The
 * silent empty-canvas outcome is the one thing this must never produce.
 */
function analysePaste() {
  const raw = $('#paste-text').value.trim();
  const err = $('#paste-error');
  const box = $('#paste-summary');
  err.textContent = '';
  box.hidden = true;
  pasteAnalysis = null;
  if (!raw) return;

  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    err.textContent = 'Invalid JSON — ' + e.message + '. Nothing will be changed.';
    return;
  }
  if (typeof json !== 'object' || Array.isArray(json) || json === null) {
    err.textContent = 'Expected a JSON object at the top level. Nothing will be changed.';
    return;
  }

  let parsed = null, via = target().name;
  try {
    parsed = target().importDoc(json);
  } catch { parsed = null; }

  if (!parsed || (!parsed.boxes.length && !parsed.scene)) {
    const scavenged = scavengeDoc(json, pasteFormatOverride);
    if (scavenged.boxes.length || scavenged.scene) {
      parsed = scavenged;
      via = 'structural scan';
    }
  } else if (pasteFormatOverride && parsed.boxes.length) {
    // The user flipped the reading — redo it through the scanner, which is the
    // only path that honours an override.
    const scavenged = scavengeDoc(json, pasteFormatOverride);
    if (scavenged.boxes.length) { parsed = scavenged; via = 'structural scan'; }
  }

  if (!parsed || (!parsed.boxes.length && !parsed.scene)) {
    err.textContent = 'Nothing recognisable in here — no scene text and nothing box-shaped. '
      + 'Nothing will be changed.';
    return;
  }

  /* A descriptor that read the document itself reports nothing about how it
     read the coordinates. Fill that in from what the descriptor declares, so
     the coordinate reading is always visible — and always reversible. */
  if (!parsed.found && parsed.boxes.length && target().boxes === 'numeric') {
    parsed.found = {
      path: null,
      count: parsed.boxes.length,
      format: target().bboxFormat || 'xywh',
      basis: parsed.pixelBasis || null,
      detected: { confident: true, reason: `declared by the ${target().name} descriptor` },
    };
  }

  pasteAnalysis = { parsed, json, via };
  renderPasteSummary();
}

function renderPasteSummary() {
  const box = $('#paste-summary');
  const { parsed, json, via } = pasteAnalysis;
  const f = parsed.found;
  box.replaceChildren();
  box.hidden = false;

  const lines = [];
  lines.push(`Read via ${via}. ${parsed.boxes.length} box${parsed.boxes.length === 1 ? '' : 'es'}`
    + (f && f.path && f.path !== 'root' ? ` found under ${f.path}` : '')
    + (parsed.scene ? ', plus scene text' : '') + '.');
  if (parsed.aspect) lines.push(`Aspect ratio ${parsed.aspect}.`);
  for (const w of parsed.warnings || []) lines.push(w);
  box.appendChild(hint(lines.join(' ')));

  /* Coordinate reading — shown whenever it was inferred, with a way to flip it. */
  if (f && f.detected && parsed.boxes.length) {
    const row = document.createElement('div');
    row.className = 'hint' + (f.detected.confident ? '' : ' warn');
    row.textContent = `Coordinates read as ${COORD_LABELS[f.format]} — ${f.detected.reason}.`
      + (f.basis && f.basis.grid ? ' Values are on a 0–1000 grid.' : '');
    box.appendChild(row);

    /* Three readings, not two. Ideogram is row-first and Krea is x-first on the
       same 0–1000 grid, so a document can look right and be transposed — the
       only reliable check is seeing it on the canvas. */
    const pick = document.createElement('div');
    pick.className = 'row';
    for (const fmt of ['xywh', 'xyxy', 'yxyx']) {
      const b = document.createElement('button');
      b.className = 'btn' + (fmt === f.format ? ' primary' : '');
      b.type = 'button';
      b.textContent = COORD_LABELS[fmt];
      b.onclick = () => { pasteFormatOverride = fmt; analysePaste(); };
      pick.appendChild(b);
    }
    box.appendChild(pick);
  }

  /* Keys nothing claimed. */
  const consumed = new Set(parsed.consumed || []);
  const orphans = Object.keys(json).filter((k) => !consumed.has(k));
  if (orphans.length) {
    box.appendChild(hint(`Kept as-is and passed through to exports: ${orphans.join(', ')}.`));
  }
}

$('#paste-text').addEventListener('input', () => { pasteFormatOverride = null; analysePaste(); });

$('#paste-ok').onclick = () => {
  if (!pasteAnalysis) { analysePaste(); if (!pasteAnalysis) return; }
  applyImport(pasteAnalysis.parsed, pasteAnalysis.json);
  dlgPaste.close();
};

$('#btn-save').onclick = () => {
  $('#save-name').value = docName || '';
  dlgSave.showModal();
  $('#save-name').focus();
};

$('#save-ok').onclick = () => {
  const name = $('#save-name').value.trim();
  if (!name) { toast('Give it a name first.', true); return; }
  docName = name;
  const slots = readSlots();
  const payload = serialize();
  const i = slots.findIndex((s) => s.name === name);
  if (i >= 0) slots[i] = payload; else slots.unshift(payload);
  if (writeSlots(slots)) {
    el.docName.textContent = docName;
    toast(`Saved “${name}” in this browser.`);
    dlgSave.close();
  }
};

$('#save-file').onclick = () => {
  const name = $('#save-name').value.trim() || 'untitled';
  docName = name;
  el.docName.textContent = docName;
  const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name.replace(/[^\w\-. ]+/g, '_') + '.glassbox.json';
  a.click();
  URL.revokeObjectURL(a.href);
  dlgSave.close();
};

$('#save-copy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(serialize(), null, 2));
    toast('Copied the saved-work JSON, including labels and colours.');
  } catch {
    toast('Could not copy this work. Download the file instead.', true);
  }
};

if (!navigator.clipboard?.writeText) $('#save-copy').hidden = true;

$('#btn-open').onclick = () => { renderSlots(); dlgOpen.showModal(); };

function renderSlots() {
  const list = $('#slot-list');
  const slots = readSlots();
  list.replaceChildren();
  if (!slots.length) {
    list.appendChild(Object.assign(document.createElement('div'),
      { className: 'empty', textContent: 'No saved works in this browser yet.' }));
    return;
  }
  for (const s of slots) {
    const row = document.createElement('div');
    row.className = 'slot solid';
    const n = document.createElement('span');
    n.className = 'slot-name'; n.textContent = s.name || 'untitled';
    const m = document.createElement('span');
    m.className = 'slot-meta';
    const tName = (TARGETS.find((t) => t.id === s.target) || {}).name || s.target;
    m.textContent = `${(s.doc?.boxes || []).length} boxes · ${tName} · ${new Date(s.savedAt).toLocaleDateString()}`;
    const del = document.createElement('button');
    del.className = 'btn btn--quiet btn--danger btn--icon';
    del.type = 'button';
    del.innerHTML = '<svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"></path></svg>';
    del.setAttribute('aria-label', `Delete “${s.name || 'untitled'}”`);
    del.title = 'Delete this slot';
    del.onclick = (e) => {
      e.stopPropagation();
      writeSlots(readSlots().filter((x) => x.name !== s.name));
      renderSlots();
    };
    row.append(n, m, del);
    row.onclick = () => {
      try { deserialize(s); toast(`Opened “${s.name}”.`); dlgOpen.close(); }
      catch (e) { toast(e.message, true); }
    };
    list.appendChild(row);
  }
}

$('#open-from-file').onclick = () => $('#open-file').click();
$('#open-file').onchange = (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      deserialize(JSON.parse(r.result));
      toast(`Opened “${docName || file.name}”.`);
      dlgOpen.close();
    } catch (err) {
      toast('Could not open that file — ' + err.message, true);
    }
  };
  r.readAsText(file);
};

$('#btn-data').onclick = () => {
  const slots = readSlots();
  let bytes = 0;
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(NS)) bytes += (localStorage.getItem(k) || '').length;
  }
  bytes += (localStorage.getItem('theme') || '').length;
  $('#data-report').textContent =
    `${slots.length} saved work${slots.length === 1 ? '' : 's'}, one autosaved draft, and your theme choice. ` +
    `About ${(bytes / 1024).toFixed(1)} KB in total. ` +
    `Backdrop images are read from disk and never stored.`;
  dlgData.showModal();
};

$('#btn-clear').onclick = () => {
  if (!confirm('Erase every saved work, the current draft and your theme choice from this browser? This cannot be undone.')) return;
  for (const k of Object.keys(localStorage)) if (k.startsWith(NS)) localStorage.removeItem(k);
  document.querySelector('[data-theme-switch] [data-theme="auto"]')?.click();
  doc = blankDoc();
  docName = '';
  selectedId = null;
  openBoxes.clear();
  el.docName.textContent = '';
  el.aspect.value = doc.aspect;
  fitCanvas(); renderCanvas(); renderInspector();
  dlgData.close();
  toast('Everything erased.');
};

/* --- toast ---------------------------------------------------------------- */

let toastTimer = null;
function toast(msg, isError) {
  el.toast.textContent = msg;
  el.toast.classList.toggle('is-error', !!isError);
  el.toast.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('is-shown'), isError ? 6000 : 3800);
}

/* --- mobile workspace ----------------------------------------------------- */

const mobileTabs = [...document.querySelectorAll('[data-mobile-panel]')];

function setMobileTab(name) {
  for (const tab of mobileTabs) {
    const active = tab.dataset.mobilePanel === name;
    tab.classList.toggle('is-active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
}

function openInspectorSection(name) {
  el.inspector.dataset.open = '';
  setMobileTab(name);
  const section = el.inspector.querySelector(`[data-section="${name}"]`);
  if (!section) return;
  section.open = true;
  requestAnimationFrame(() => {
    el.inspector.scrollTo({ top: Math.max(0, section.offsetTop - 8), behavior: 'smooth' });
  });
}

for (const tab of mobileTabs) {
  tab.addEventListener('click', () => {
    const panel = tab.dataset.mobilePanel;
    if (panel === 'canvas') {
      delete el.inspector.dataset.open;
      setMobileTab('canvas');
    } else if (panel === 'data') {
      delete el.inspector.dataset.open;
      setMobileTab('data');
      $('#btn-data').click();
    } else {
      openInspectorSection(panel);
    }
  });
}

el.inspector.addEventListener('click', () => {
  if (matchMedia('(max-width: 640px)').matches && !el.inspector.hasAttribute('data-open')) {
    openInspectorSection('boxes');
  }
});

$('#dlg-data').addEventListener('close', () => setMobileTab('canvas'));

/* --- wiring --------------------------------------------------------------- */

for (const t of TARGETS) {
  const o = document.createElement('option');
  o.value = t.id; o.textContent = t.name;
  el.target.appendChild(o);
}
el.target.value = targetId;
el.target.onchange = () => {
  targetId = el.target.value;
  localStorage.setItem(K_TARGET, targetId);
  renderInspector();
  showCoordHint();
  toast(`Now exporting as ${target().name}. Nothing was lost — fields this target drops are struck through.`);
};

function showCoordHint() {
  el.hintCoords.textContent = coordsDescription(target());
}

for (const a of ASPECTS) {
  const o = document.createElement('option');
  o.value = a; o.textContent = a;
  el.aspect.appendChild(o);
}
el.aspect.value = doc.aspect;
el.aspect.onchange = () => {
  doc.aspect = el.aspect.value;
  fitCanvas(); renderCanvas(); renderJson(); persistDraft();
};

$('#btn-add').onclick = addBox;
$('#btn-dup').onclick = duplicateBox;
$('#btn-del').onclick = () => selectedId && deleteBox(selectedId);
$('#btn-copy').onclick = copyJson;

window.addEventListener('resize', () => { fitCanvas(); });

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  const meta = e.metaKey || e.ctrlKey;

  if (meta && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); copyJson(); return; }
  if (meta && e.shiftKey && e.key.toLowerCase() === 'v') { e.preventDefault(); $('#btn-paste').click(); return; }
  if (meta && e.key.toLowerCase() === 's') { e.preventDefault(); $('#btn-save').click(); return; }
  if (meta && e.key.toLowerCase() === 'o') { e.preventDefault(); $('#btn-open').click(); return; }

  if (typing) return;
  if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId) { e.preventDefault(); deleteBox(selectedId); }
  if (e.key === 'Escape') select(null);
});

/* --- boot ----------------------------------------------------------------- */

loadCoordOverrides();
showCoordHint();

try {
  const draft = JSON.parse(localStorage.getItem(K_DRAFT));
  if (draft) deserialize(draft);
} catch { /* no draft, or unreadable — start blank */ }

applyBackdrop();
fitCanvas();
renderCanvas();
renderInspector();

// The canvas has no size until layout settles; re-fit once it has.
requestAnimationFrame(() => { fitCanvas(); renderCanvas(); });
