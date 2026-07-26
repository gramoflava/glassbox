/* ---------------------------------------------------------------------------
   glassbox — application

   One canonical document and one verified target descriptor (see targets.js). The document
   is the only thing that is edited; JSON is always a rendering of it, never a
   source you type into. That is the whole reason the structure cannot break.
--------------------------------------------------------------------------- */

'use strict';

const NS = 'glassbox.';
const K_SLOTS = NS + 'slots';
const K_DRAFT = NS + 'draft';
const K_TARGET = NS + 'target';

/** Human description of a target's current coordinate convention. */
function coordsDescription(t) {
  if (t.boxes !== 'numeric') return 'Boxes become placement wording, not coordinates.';
  const order = {
    xywh: '[x, y, width, height]',
    xyxy: '[x1, y1, x2, y2] — x-first corners',
    yxyx: '[y_min, x_min, y_max, x_max] — row-first corners',
  }[t.bboxFormat || 'xywh'];
  const dims = scaleOf(t, doc.aspect);
  const scale = t.dynamicGrid && dims
    ? `aspect grid 0–${dims.w} × 0–${dims.h}`
    : t.grid ? `normalized 0–${t.grid}` : 'normalized 0–1';
  return `${order}, ${scale}, canvas origin top-left.`;
}

/* --- canonical field catalogue -------------------------------------------
   Grouped for the settings dialog. Each entry is addressed by its dotted path in the
   document; whether a given target keeps it comes from that target's `fields`. */

const SECTIONS = [
  {
    title: 'Scene', open: true, fields: [
      { path: 'scene', label: 'Scene', type: 'textarea', ph: 'a dense pine forest at first light, mist between the trunks' },
      { path: 'background', label: 'Background', type: 'textarea', ph: 'receding treeline, soft depth haze' },
      { path: 'mood', label: 'Mood', type: 'text', ph: 'still, watchful' },
      { path: 'composition', label: 'Composition', type: 'text', ph: 'rule of thirds, balanced negative space' },
    ]
  },
  {
    title: 'Style', fields: [
      { path: 'style.mode', label: 'Caption type', type: 'select', options: ['art', 'photo'] },
      { path: 'style.descriptors', label: 'Aesthetics', type: 'textarea', ph: 'painterly, muted naturalism, fine grain' },
      { path: 'style.medium', label: 'Medium', type: 'text', ph: 'oil on canvas, 35mm photograph' },
      { path: 'style.detail', label: 'Photo / art style', type: 'text', ph: '35mm, f/1.4, bokeh or flat vector illustration' },
      { path: 'style.palette', label: 'Colour palette', type: 'text', ph: '#4a5d3a, #d9cbb0, #2c3e50' },
    ]
  },
  {
    title: 'Light & camera', fields: [
      { path: 'lighting', label: 'Lighting', type: 'textarea', ph: 'low sun through fog, long shadows' },
      { path: 'camera.angle', label: 'Camera angle', type: 'text', ph: 'slightly low, eye level with the animals' },
      { path: 'camera.distance', label: 'Camera distance', type: 'text', ph: 'wide shot' },
      { path: 'camera.lens', label: 'Lens', type: 'text', ph: '35mm, shallow depth of field' },
      { path: 'camera.focus', label: 'Focus', type: 'text', ph: 'sharp subject, shallow depth of field' },
      { path: 'camera.fNumber', label: 'F-number', type: 'text', ph: 'f/5.6' },
      { path: 'camera.iso', label: 'ISO', type: 'number', ph: '200' },
    ]
  },
  {
    title: 'Output', fields: [
      { path: 'seed', label: 'Seed', type: 'number', ph: 'blank for random' },
      { path: 'krea.creativity', label: 'Creativity', type: 'select', options: ['raw', 'low', 'medium', 'high'] },
    ]
  },
];

/* --- state ---------------------------------------------------------------- */

let doc = blankDoc();
let targetId = localStorage.getItem(K_TARGET) || 'general';
if (!TARGETS.some((item) => item.id === targetId)) targetId = TARGETS[0].id;
let selectedId = null;
let docName = '';
let currentSlotName = '';
const openBoxes = new Set();
let backdrop = { url: '', name: '', opacity: 0.45 };

const $ = (sel) => document.querySelector(sel);
const el = {
  canvas: $('#canvas'), wrap: $('#canvas-wrap'), inspector: $('#inspector'),
  target: $('#target'), aspect: $('#aspect'), empty: $('#canvas-empty'),
  aspectCustom: $('#aspect-custom'),
  imageSize: $('#image-size-control'),
  imageWidth: $('#image-width'),
  imageHeight: $('#image-height'),
  imageSizeStatus: $('#image-size-status'),
  backdrop: $('#backdrop'), toast: $('#toast'), docName: $('#doc-name'),
  hintCoords: $('#hint-coords'),
};

function target() { return TARGETS.find((t) => t.id === targetId) || TARGETS[0]; }

function blankDoc() {
  return {
    version: 1,
    aspect: '16:9',
    scene: '', background: '', mood: '',
    style: { mode: 'art', descriptors: '', medium: '', detail: '', palette: '' },
    lighting: '',
    composition: '',
    camera: { angle: '', distance: '', lens: '', focus: '', fNumber: '', iso: null },
    text: { content: '', placement: '' },
    negative: '', seed: null,
    krea: { creativity: 'medium', resolution: '1K' },
    pixelBasis: null,      // actual output pixels; separate from a prompt's coordinate grid
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
  return ratioOf(str) || 16 / 9;
}

function hasPixelBasis(value = doc.pixelBasis) {
  return Number(value?.w) > 0 && Number(value?.h) > 0;
}

function canvasAspectRatio() {
  return target().imageSize && hasPixelBasis()
    ? Number(doc.pixelBasis.w) / Number(doc.pixelBasis.h)
    : aspectRatio(doc.aspect);
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

/**
 * Accept any ratio a pasted document declares, not just the preset list —
 * "32:17" is perfectly valid and silently snapping it to 16:9 would move every
 * box you just imported.
 */
function setAspectValue(value) {
  doc.aspect = ratioOf(value) ? String(value).trim() : (doc.aspect || '16:9');
  if (!el.aspect) return;
  el.aspect.querySelectorAll('[data-current-custom]').forEach((option) => option.remove());
  if (ASPECTS.includes(doc.aspect)) {
    el.aspect.value = doc.aspect;
  } else {
    const option = document.createElement('option');
    option.value = doc.aspect;
    option.textContent = `${doc.aspect} · custom`;
    option.dataset.currentCustom = '';
    el.aspect.insertBefore(option, el.aspect.querySelector('[value="__custom__"]'));
    el.aspect.value = doc.aspect;
  }
  el.aspectCustom.hidden = true;
  el.aspectCustom.value = doc.aspect;
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
  const r = canvasAspectRatio();
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

    if (box.label) {
      const label = document.createElement('div');
      label.className = 'box-label';
      label.textContent = box.label;
      node.appendChild(label);
    }

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

  el.empty.innerHTML = isNarrowEditor()
    ? 'Add an element, then tap it to select.<br>Use its editor for exact placement.'
    : 'Drag anywhere to draw a box.<br>Drop an image here to use it as a backdrop.';
  el.empty.style.display = doc.boxes.length ? 'none' : 'flex';
  $('#btn-dup').disabled = $('#btn-del').disabled = !selectedId;
  const edit = $('#btn-edit-selected');
  edit.hidden = !selectedId;
  if (selectedId) {
    const selected = doc.boxes.find((box) => box.id === selectedId);
    edit.textContent = `Edit ${selected?.label || 'selected box'}`;
  }
}

/* --- pointer interaction: draw, move, resize ------------------------------ */

let drag = null;

function isNarrowEditor() {
  return matchMedia('(max-width: 640px)').matches;
}

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

  if (isNarrowEditor()) {
    if (boxNode) select(boxNode.dataset.id, { scroll: false });
    return;
  }

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
      hasBbox: true,
      prompt: '', action: '', weight: 1, depth: '', kind: 'obj', text: '', palette: '', label: '', color: 'grey',
    };
    doc.boxes.push(box);
    selectedId = box.id;
    setOnlyOpenBox(box.id);
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

function setOnlyOpenBox(id) {
  openBoxes.clear();
  if (id) openBoxes.add(id);
}

function scrollSelectedBox(behavior = 'smooth') {
  if (!selectedId) return;
  const row = el.inspector.querySelector(`[data-box-id="${selectedId}"]`);
  row?.scrollIntoView({ block: 'nearest', behavior });
}

function select(id, options = {}) {
  selectedId = id;
  setOnlyOpenBox(id);
  renderCanvas();
  renderInspector();
  if (id && options.scroll !== false && !isNarrowEditor()) {
    requestAnimationFrame(() => scrollSelectedBox());
  }
}

/* --- backdrop ------------------------------------------------------------- */

function setBackdrop(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (backdrop.url) URL.revokeObjectURL(backdrop.url);
  backdrop = { url: URL.createObjectURL(file), name: file.name, opacity: backdrop.opacity };
  applyBackdrop();
  if (target().imageSize && !hasPixelBasis()) {
    const image = new Image();
    image.onload = () => {
      doc.pixelBasis = { w: image.naturalWidth, h: image.naturalHeight };
      setAspectValue(reducedRatio(image.naturalWidth, image.naturalHeight));
      renderImageSizeControls();
      fitCanvas(); renderCanvas(); renderInspector(); showCoordHint(); persistDraft();
    };
    image.src = backdrop.url;
  }
}

function applyBackdrop() {
  const on = !!backdrop.url;
  el.backdrop.src = backdrop.url || '';
  el.backdrop.style.display = on ? 'block' : 'none';
  el.backdrop.style.opacity = backdrop.opacity;
  $('#backdrop-controls').hidden = !on;
  $('#backdrop-name').textContent = backdrop.name || 'Backdrop';
  $('#backdrop-opacity').value = Math.round(backdrop.opacity * 100);
  $('#backdrop-opacity-value').textContent = `${Math.round(backdrop.opacity * 100)}%`;
  $('#btn-backdrop').textContent = on ? 'Replace…' : 'Backdrop…';
}

$('#btn-backdrop').onclick = () => $('#backdrop-file').click();
$('#backdrop-file').onchange = (e) => { setBackdrop(e.target.files[0]); e.target.value = ''; };
$('#backdrop-opacity').oninput = (e) => {
  backdrop.opacity = e.target.value / 100;
  el.backdrop.style.opacity = backdrop.opacity;
  $('#backdrop-opacity-value').textContent = `${e.target.value}%`;
};
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

function reducedRatio(w, h) {
  let a = Math.round(w), b = Math.round(h);
  while (b) [a, b] = [b, a % b];
  const divisor = a || 1;
  return `${Math.round(w / divisor)}:${Math.round(h / divisor)}`;
}

function renderImageSizeStatus() {
  const status = el.imageSizeStatus;
  status.classList.remove('warn');
  status.removeAttribute('title');
  if (!target().imageSize) {
    status.textContent = '';
    return;
  }
  if (!hasPixelBasis()) {
    status.textContent = 'sets JSON ratio';
    return;
  }
  const { w, h } = doc.pixelBasis;
  const imageRatio = w / h;
  const jsonRatio = aspectRatio(doc.aspect);
  const mismatch = Math.abs(imageRatio - jsonRatio) / jsonRatio;
  const imageLabel = reducedRatio(w, h);
  if (mismatch < 0.002) {
    status.textContent = `${imageLabel} · JSON synced`;
  } else {
    status.textContent = `${imageLabel} · JSON ${doc.aspect}`;
    status.classList.add('warn');
    status.title = 'Image Size and aspect_ratio differ. Re-enter Image Size to synchronize them.';
  }
}

function renderImageSizeControls() {
  const enabled = Boolean(target().imageSize);
  el.imageSize.hidden = !enabled;
  $('#aspect-label').textContent = enabled ? 'Ratio' : 'Frame';
  if (!enabled) return;
  el.imageWidth.value = hasPixelBasis() ? doc.pixelBasis.w : '';
  el.imageHeight.value = hasPixelBasis() ? doc.pixelBasis.h : '';
  renderImageSizeStatus();
}

function renderInspector() {
  const t = target();
  renderImageSizeControls();
  const frag = document.createDocumentFragment();

  const targetInfo = document.createElement('div');
  targetInfo.className = 'target-note';
  targetInfo.textContent = 'DrawThings Ideogram 4.0 · row-first · 0–1000';
  targetInfo.title = `${t.blurb} ${coordsDescription(t)}`;
  frag.appendChild(targetInfo);

  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'settings-card solid';
  const settingsIcon = document.createElement('img');
  settingsIcon.className = 'settings-card__icon';
  settingsIcon.src = 'gramofdesign/icons/adjustments-x.svg';
  settingsIcon.alt = '';
  const settingsCopy = document.createElement('span');
  settingsCopy.className = 'settings-card__copy';
  const settingsTitle = document.createElement('span');
  settingsTitle.className = 'settings-card__title';
  settingsTitle.textContent = 'Prompt settings';
  const settingsSummary = document.createElement('span');
  settingsSummary.className = 'settings-card__summary';
  settingsSummary.textContent = doc.scene || 'Scene, style, lighting and output settings';
  settingsCopy.append(settingsTitle, settingsSummary);
  const settingsArrow = document.createElement('span');
  settingsArrow.textContent = 'Edit';
  settingsArrow.className = 'hint';
  settings.append(settingsIcon, settingsCopy, settingsArrow);
  settings.onclick = openSettingsDialog;
  frag.appendChild(settings);

  const head = document.createElement('div');
  head.className = 'composition-head';
  const heading = document.createElement('strong');
  heading.textContent = t.id === 'flux2' ? 'Subjects' : 'Elements';
  const count = badge(String(doc.boxes.length));
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn';
  add.textContent = 'Add';
  add.onclick = addBox;
  head.append(heading, count, add);
  frag.appendChild(head);

  const list = document.createElement('div');
  list.className = 'box-list';
  if (!doc.boxes.length) list.appendChild(hint(
    isNarrowEditor() ? 'Add an element, then set its frame position in the editor.' : 'Draw on the canvas or add an element here.'));
  for (const box of doc.boxes) list.appendChild(renderBoxListItem(box));
  frag.appendChild(list);

  el.inspector.replaceChildren(frag);
  quantizeInspectorCards();
  renderJson();
}

/**
 * Let every card show its full copy, then snap its height to half-card steps:
 * 64, 96, 128px… This keeps the rhythm without truncating unequal text.
 */
function quantizeInspectorCards() {
  requestAnimationFrame(() => {
    const base = 64;
    const step = base / 2;
    for (const card of el.inspector.querySelectorAll('.settings-card, .box-list-item')) {
      card.style.minHeight = '';
      const required = card.scrollHeight;
      card.style.minHeight = `${Math.max(base, Math.ceil(required / step) * step)}px`;
    }
  });
}

function renderBoxListItem(box) {
  const index = doc.boxes.indexOf(box) + 1;
  const row = document.createElement('div');
  row.className = 'box-list-item solid' + (box.id === selectedId ? ' selected' : '');
  row.dataset.boxId = box.id;

  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  swatch.style.background = (PALETTE_BY_KEY[box.color] || PALETTE_BY_KEY.grey).hex;

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'box-list-item__open';
  const copy = document.createElement('span');
  copy.className = 'box-list-item__copy';
  const title = document.createElement('span');
  title.className = 'box-list-item__title';
  title.textContent = box.label || `${target().id === 'flux2' ? 'Subject' : 'Element'} ${index}`;
  const summary = document.createElement('span');
  summary.className = 'box-list-item__summary';
  summary.textContent = box.prompt || boxExportPreview(box);
  copy.append(title, summary);
  openButton.append(copy);
  openButton.onclick = () => openBoxDialog(box.id);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn--quiet btn--danger btn--icon';
  del.innerHTML = '<img class="button-icon" src="gramofdesign/icons/trash.svg" alt="">';
  del.setAttribute('aria-label', `Delete ${title.textContent}`);
  del.onclick = (event) => {
    event.stopPropagation();
    deleteBox(box.id);
  };

  row.append(swatch, openButton, del);
  return row;
}

let editorSession = null;

function cloneDocument(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function beginEditorSession(dialog) {
  editorSession = {
    dialog,
    document: cloneDocument(doc),
    selectedId,
  };
}

function applyEditorSession(dialog) {
  if (editorSession?.dialog !== dialog) return;
  dialog.close('apply');
}

function cancelEditorSession(dialog) {
  if (editorSession?.dialog !== dialog) return;
  doc = editorSession.document;
  selectedId = editorSession.selectedId;
  dialog.close('cancel');
}

function shouldDismissDialogBackdrop(dialog, event, startedOnBackdrop) {
  if (!startedOnBackdrop || event.target !== dialog) return false;
  const rect = dialog.getBoundingClientRect();
  const inside = event.clientX >= rect.left && event.clientX <= rect.right
    && event.clientY >= rect.top && event.clientY <= rect.bottom;
  return !inside;
}

function wireEditorDialog(dialog, applyButton, cancelButton) {
  let startedOnBackdrop = false;

  applyButton.addEventListener('click', () => applyEditorSession(dialog));
  cancelButton.addEventListener('click', () => cancelEditorSession(dialog));

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    cancelEditorSession(dialog);
  });

  dialog.addEventListener('pointerdown', (event) => {
    startedOnBackdrop = event.target === dialog;
  });
  dialog.addEventListener('pointercancel', () => {
    startedOnBackdrop = false;
  });
  dialog.addEventListener('click', (event) => {
    const dismiss = shouldDismissDialogBackdrop(dialog, event, startedOnBackdrop);
    startedOnBackdrop = false;
    if (dismiss) cancelEditorSession(dialog);
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement) return;
    const multiline = event.target instanceof HTMLTextAreaElement;
    if (multiline && !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    if (event.target instanceof HTMLInputElement) {
      event.target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    applyEditorSession(dialog);
  });
}

function openSettingsDialog() {
  const dialog = $('#dlg-settings');
  beginEditorSession(dialog);
  const editor = $('#settings-editor');
  editor.replaceChildren();
  editor.appendChild(hint(target().blurb));
  for (const section of SECTIONS) {
    const supported = section.fields.filter((field) => fieldSpecFor(field.path));
    if (!supported.length) continue;
    const group = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = section.title;
    group.appendChild(heading);
    for (const field of supported) group.appendChild(renderField(field));
    editor.appendChild(group);
  }
  dialog.showModal();
}

function openBoxDialog(id) {
  const box = doc.boxes.find((item) => item.id === id);
  if (!box) return;
  const dialog = $('#dlg-box');
  beginEditorSession(dialog);
  selectedId = id;
  setOnlyOpenBox(id);
  renderCanvas();
  renderInspector();
  const shell = renderBoxRow(box);
  shell.open = true;
  const body = shell.querySelector('.box-body');
  $('#box-editor-title').textContent = box.label || `Edit ${target().id === 'flux2' ? 'subject' : 'element'}`;
  $('#box-editor').replaceChildren(body);
  dialog.showModal();
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
  else if (!spec) key.title = `${target().name} does not export this field.`;
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
  if (box.hasBbox === false) {
    return 'No bbox — DrawThings lets the sampler place this element.';
  }
  if (t.boxes !== 'numeric') return `Exports as “${rectToProse(box)}”`;

  const dims = scaleOf(t, doc.aspect);
  const nums = rectToBboxArray(box.rect, t.bboxFormat, dims);
  const order = { yxyx: 'y, x, y, x', xyxy: 'x1, y1, x2, y2', xywh: 'x, y, w, h' }[t.bboxFormat || 'xywh'];
  const grid = t.dynamicGrid && dims
    ? `, ${dims.w}×${dims.h} aspect grid`
    : t.grid ? `, 0–${t.grid} grid` : '';
  return `Exports as [${nums.join(', ')}]  (${order}${grid})`;
}

function renderBoxRow(box) {
  const color = (PALETTE_BY_KEY[box.color] || PALETTE_BY_KEY.grey).hex;
  const boxNumber = doc.boxes.indexOf(box) + 1;
  const d = document.createElement('details');
  d.className = 'box-row solid' + (box.id === selectedId ? ' selected' : '');
  d.dataset.boxId = box.id;
  d.open = openBoxes.has(box.id);
  d.addEventListener('toggle', () => {
    if (!d.open) {
      openBoxes.delete(box.id);
      return;
    }
    setOnlyOpenBox(box.id);
    for (const other of el.inspector.querySelectorAll('.box-row[open]')) {
      if (other !== d) other.open = false;
    }
  });

  const s = document.createElement('summary');
  const sw = document.createElement('span');
  sw.className = 'swatch';
  sw.style.background = color;
  const title = document.createElement('span');
  title.className = 'box-title';
  title.textContent = box.label || `Box ${boxNumber}`;
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
  priv.textContent = 'Label is optional. Label and colour stay in glassbox — never exported.';
  body.appendChild(priv);

  const labelField = document.createElement('div');
  labelField.className = 'field';
  const ll = document.createElement('label');
  ll.textContent = 'Label';
  const li = document.createElement('input');
  li.type = 'text'; li.value = box.label; li.placeholder = 'wolf';
  li.addEventListener('input', () => {
    box.label = li.value;
    title.textContent = box.label || `Box ${boxNumber}`;
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
  pk.textContent = target().boxes === 'numeric'
    ? 'compositional_deconstruction.elements[].desc'
    : 'subjects[].description';
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

  const placementField = document.createElement('label');
  placementField.className = 'placement-toggle';
  const placementInput = document.createElement('input');
  placementInput.type = 'checkbox';
  placementInput.checked = box.hasBbox !== false;
  const placementCopy = document.createElement('span');
  placementCopy.textContent = 'Use placement box';
  placementField.append(placementInput, placementCopy);
  body.appendChild(placementField);

  /* Canonical editor geometry is always percentages of the frame. Target
     coordinate order is a read-only export concern. */
  const geometry = document.createElement('div');
  geometry.className = 'geometry-grid';
  const geometryInputs = {};
  const geometryFields = [
    ['x', 'Left'], ['y', 'Top'], ['w', 'Width'], ['h', 'Height'],
  ];
  const refreshGeometry = () => {
    for (const [key] of geometryFields) geometryInputs[key].value = Math.round(box.rect[key] * 1000) / 10;
    updateBoxNode(box);
    renderJson();
    preview.textContent = boxExportPreview(box);
    persistDraft();
  };
  for (const [key, label] of geometryFields) {
    const field = document.createElement('div');
    field.className = 'field';
    const lab = document.createElement('label');
    lab.textContent = `${label} %`;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '100';
    input.step = '0.1';
    geometryInputs[key] = input;
    input.addEventListener('change', () => {
      const value = clamp01((Number(input.value) || 0) / 100);
      if (key === 'x') box.rect.x = Math.min(value, 1 - box.rect.w);
      if (key === 'y') box.rect.y = Math.min(value, 1 - box.rect.h);
      if (key === 'w') box.rect.w = Math.max(0.01, Math.min(value, 1 - box.rect.x));
      if (key === 'h') box.rect.h = Math.max(0.01, Math.min(value, 1 - box.rect.y));
      refreshGeometry();
    });
    field.append(lab, input);
    geometry.appendChild(field);
  }
  body.appendChild(geometry);
  geometry.hidden = !placementInput.checked;
  placementInput.addEventListener('change', () => {
    box.hasBbox = placementInput.checked;
    geometry.hidden = !placementInput.checked;
    updateBoxNode(box);
    renderJson();
    preview.textContent = boxExportPreview(box);
    persistDraft();
  });

  /* DrawThings Ideogram distinguishes objects from rendered text. */
  const supportsElementType = true;
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
  kindField.hidden = !supportsElementType;
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

  if (target().id === 'flux2') {
    const actionField = document.createElement('div');
    actionField.className = 'field';
    const actionLabel = document.createElement('label');
    actionLabel.textContent = 'Action';
    const actionKey = document.createElement('span');
    actionKey.className = 'field__key';
    actionKey.textContent = 'subjects[].action';
    actionLabel.appendChild(actionKey);
    const actionInput = document.createElement('input');
    actionInput.type = 'text';
    actionInput.value = box.action || '';
    actionInput.placeholder = 'standing still, looking toward camera';
    actionInput.addEventListener('input', () => {
      box.action = actionInput.value;
      renderJson();
      persistDraft();
    });
    actionField.append(actionLabel, actionInput);
    body.appendChild(actionField);
  }

  /* Per-element colour palette — Ideogram documents up to five per element.
     Distinct from the swatch above, which is yours and never exported. */
  const palField = document.createElement('div');
  palField.className = 'field';
  palField.hidden = target().id !== 'ideogram';
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
  preview.className = 'hint coord-preview';
  preview.textContent = boxExportPreview(box);
  body.appendChild(preview);
  refreshGeometry();

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn--danger';
  del.textContent = `Delete ${target().id === 'flux2' ? 'subject' : 'element'}`;
  del.onclick = () => deleteBox(box.id);
  body.appendChild(del);

  d.appendChild(body);
  return d;
}

/* --- JSON preview --------------------------------------------------------- */

function currentJson() {
  return target().exportDoc(doc);
}

function currentJsonText() {
  return JSON.stringify(currentJson());
}

function renderJson() {
  const out = $('#json-out');
  if (!out) return;
  $('#json-target').textContent = target().name;
  try {
    out.textContent = currentJsonText();
  } catch (e) {
    out.textContent = '// export failed: ' + e.message;
  }
}

async function copyJson() {
  const text = currentJsonText();
  try {
    await navigator.clipboard.writeText(text);
    toast('JSON copied.');
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

function downloadJson() {
  const blob = new Blob([currentJsonText()], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const base = (docName || target().id || 'prompt').replace(/[^\w\-. ]+/g, '_');
  link.download = `${base}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function setWorkspaceView(view) {
  const json = view === 'json';
  $('.workspace').hidden = json;
  $('#json-view').hidden = !json;
  for (const button of document.querySelectorAll('[data-view]')) {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  if (json) renderJson();
  else requestAnimationFrame(fitCanvas);
}

/* --- box actions ---------------------------------------------------------- */

function addBox() {
  const n = doc.boxes.length;
  const off = (n % 5) * 0.04;
  const box = {
    id: nextId(),
    rect: { x: 0.3 + off, y: 0.3 + off, w: 0.28, h: 0.28 },
    hasBbox: true,
    prompt: '', action: '', weight: 1, depth: '', kind: 'obj', text: '', palette: '', label: '', color: 'grey',
  };
  doc.boxes.push(box);
  selectedId = box.id;
  setOnlyOpenBox(box.id);
  renderCanvas(); renderInspector(); persistDraft();
  openBoxDialog(box.id);
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
  setOnlyOpenBox(copy.id);
  renderCanvas(); renderInspector(); persistDraft();
}

function deleteBox(id) {
  doc.boxes = doc.boxes.filter((b) => b.id !== id);
  openBoxes.delete(id);
  if (selectedId === id) selectedId = null;
  if ($('#dlg-box').open) {
    editorSession = null;
    $('#dlg-box').close('delete');
  }
  renderCanvas(); renderInspector(); persistDraft();
}

/* --- import --------------------------------------------------------------- */

/** Replace the current strict target document with a parsed document. */
function applyImport(parsed) {
  const next = blankDoc();
  next.pixelBasis = parsed.pixelBasis
    || (target().imageSize && hasPixelBasis() ? { ...doc.pixelBasis } : null);

  for (const k of ['aspect', 'scene', 'background', 'mood', 'lighting', 'composition']) {
    if (parsed[k] != null) next[k] = parsed[k];
  }
  next.style = { ...next.style, ...(parsed.style || {}) };
  next.camera = { ...next.camera, ...(parsed.camera || {}) };
  next.seed = parsed.seed ?? null;
  if (!next.aspect) next.aspect = doc.aspect;
  next.boxes = (parsed.boxes || []).map((b) => {
    return {
      id: nextId(),
      rect: b.rect || { x: 0.3, y: 0.3, w: 0.28, h: 0.28 },
      hasBbox: b.hasBbox !== false,
      prompt: b.prompt || '',
      action: b.action || '',
      weight: 1,
      depth: '',
      kind: b.kind || 'obj',
      text: b.text || '',
      palette: b.palette || '',
      label: '',
      color: 'grey',
    };
  });

  doc = next;
  docName = '';
  currentSlotName = '';
  selectedId = null;
  openBoxes.clear();
  setAspectValue(doc.aspect);
  el.docName.textContent = '';

  fitCanvas(); renderCanvas(); renderInspector(); persistDraft();
  toast(`Imported ${target().name} JSON.`);
}

/* --- persistence ---------------------------------------------------------- */

function serialize(name = docName) {
  return {
    format: 'glassbox',
    version: 1,
    name,
    slot: currentSlotName,
    target: targetId,
    savedAt: new Date().toISOString(),
    doc,                      // includes labels and colours — the point of saving
  };
}

function deserialize(payload, source = 'draft') {
  if (!payload || payload.format !== 'glassbox' || !payload.doc) {
    throw new Error('Not a glassbox file.');
  }
  const base = blankDoc();
  doc = { ...base, ...payload.doc };
  doc.style = { ...base.style, ...(payload.doc.style || {}) };
  doc.camera = { ...base.camera, ...(payload.doc.camera || {}) };
  doc.krea = { ...base.krea, ...(payload.doc.krea || {}) };
  doc.boxes = (payload.doc.boxes || []).map((b) => ({
    id: nextId(),
    rect: b.rect || { x: 0.3, y: 0.3, w: 0.3, h: 0.3 },
    hasBbox: b.hasBbox !== false,
    prompt: b.prompt || '', action: b.action || '', weight: b.weight ?? 1, depth: b.depth || '',
    kind: b.kind || 'obj',
    text: b.text || '',
    palette: b.palette || '',
    label: b.label || '', color: PALETTE_BY_KEY[b.color] ? b.color : 'grey',
  }));
  docName = payload.name || '';
  currentSlotName = source === 'slot' ? docName : (source === 'draft' ? payload.slot || '' : '');
  if (payload.target && TARGETS.some((t) => t.id === payload.target)) {
    targetId = payload.target;
    el.target.value = targetId;
  }
  selectedId = null;
  openBoxes.clear();
  setAspectValue(doc.aspect);
  renderImageSizeControls();
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
  dlgPaste.showModal();
  // Offer whatever is already on the clipboard, if the browser allows reading it.
  try {
    const t = await navigator.clipboard.readText();
    if (t && t.trim().startsWith('{')) { $('#paste-text').value = t; analysePaste(); }
  } catch { /* no permission — user pastes manually */ }
  $('#paste-text').focus();
};

let pasteAnalysis = null;

function validateStrictJson(t, json, parsed) {
  const unknown = Object.keys(json).filter((key) => !(parsed.consumed || []).includes(key));
  if (unknown.length) return `Not valid ${t.name}: unsupported top-level key${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}.`;
  const required = ['aspect_ratio', 'high_level_description', 'compositional_deconstruction'];
  const missing = required.filter((key) => !Object.hasOwn(json, key));
  if (missing.length) return `${t.name} requires ${missing.join(', ')}.`;
  if (!ratioOf(json.aspect_ratio)) return 'aspect_ratio must be a positive ratio such as 4:3.';
  if (Object.keys(json).join('|') !== required.join('|')) {
    return 'Top-level keys must be ordered aspect_ratio, high_level_description, compositional_deconstruction.';
  }
  if (typeof json.high_level_description !== 'string') {
    return 'high_level_description must be a string.';
  }

  const composition = json.compositional_deconstruction;
  if (!composition || typeof composition !== 'object' || !Array.isArray(composition.elements)) {
    return `${t.name} needs compositional_deconstruction with an elements array.`;
  }
  const allowedComposition = ['background', 'elements'];
  const badComposition = Object.keys(composition).filter((key) => !allowedComposition.includes(key));
  if (badComposition.length) return `Unsupported compositional_deconstruction key: ${badComposition.join(', ')}.`;
  if (!Object.hasOwn(composition, 'background')) return 'compositional_deconstruction.background is required.';
  if (Object.keys(composition).join('|') !== allowedComposition.join('|')) {
    return 'compositional_deconstruction keys must be ordered background, elements.';
  }
  if (typeof composition.background !== 'string') return 'background must be a string.';

  for (const element of composition.elements) {
    if (!element || typeof element !== 'object' || Array.isArray(element)) {
      return 'Every element must be an object.';
    }
    const type = element.type;
    if (!['obj', 'text'].includes(type)) return 'Every element type must be obj or text.';
    const allowed = type === 'text'
      ? ['type', 'bbox', 'text', 'desc']
      : ['type', 'bbox', 'desc'];
    const bad = Object.keys(element || {}).filter((key) => !allowed.includes(key));
    if (bad.length) return `Unsupported element key: ${bad.join(', ')}.`;
    if ('bbox' in element) {
      if (!Array.isArray(element.bbox) || element.bbox.length !== 4
        || !element.bbox.every((value) => Number.isInteger(value) && value >= 0 && value <= 1000)) {
        return 'bbox must contain four integers from 0 to 1000.';
      }
      const [y1, x1, y2, x2] = element.bbox;
      if (y1 > y2 || x1 > x2) return 'bbox must follow [y1, x1, y2, x2] with increasing corners.';
    }
    if (typeof element.desc !== 'string') return 'Every element needs a desc string.';
    if (type === 'text' && typeof element.text !== 'string') {
      return 'Every text element needs a text string.';
    }
    const expected = type === 'text'
      ? ['type', 'bbox', 'text', 'desc']
      : ['type', 'bbox', 'desc'];
    const keys = Object.keys(element);
    if (keys.join('|') !== expected.filter((key) => key in element).join('|')) {
      return 'Element keys are out of DrawThings’ required order.';
    }
  }
  return '';
}

function validHexPalette(value, max) {
  return Array.isArray(value)
    && value.length <= max
    && value.every((color) => typeof color === 'string' && /^#[0-9A-F]{6}$/.test(color));
}

function analysePaste() {
  const raw = $('#paste-text').value.trim();
  const err = $('#paste-error');
  const box = $('#paste-summary');
  err.textContent = '';
  box.hidden = true;
  pasteAnalysis = null;
  if (!raw) return;

  let json;
  let repairedClosingBrace = false;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    const canRepairObserved = target().observedOutput
      && (raw.match(/{/g) || []).length === (raw.match(/}/g) || []).length + 1
      && (raw.match(/\[/g) || []).length === (raw.match(/\]/g) || []).length;
    if (canRepairObserved) {
      try {
        json = JSON.parse(raw + '}');
        repairedClosingBrace = true;
      } catch { /* report the original parse failure below */ }
    }
    if (!json) {
      err.textContent = 'Invalid JSON — ' + e.message + '. Nothing will be changed.';
      return;
    }
  }
  if (typeof json !== 'object' || Array.isArray(json) || json === null) {
    err.textContent = 'Expected a JSON object at the top level. Nothing will be changed.';
    return;
  }

  let parsed = null;
  try {
    parsed = target().importDoc(json);
  } catch { parsed = null; }

  if (!parsed) {
    err.textContent = `This is not valid ${target().name} JSON. Nothing will be changed.`;
    return;
  }

  const validationError = validateStrictJson(target(), json, parsed);
  if (validationError) {
    err.textContent = validationError + ' Nothing will be changed.';
    return;
  }

  const warnings = [];
  if (repairedClosingBrace) {
    warnings.push('The source was missing one final }, matching the observed Expand to JSON defect; Glassbox restored it.');
  }
  if (/"desc"\s*:[^{}]*"desc"\s*:/.test(raw)) {
    warnings.push('One element contains desc twice. JSON keeps only the second value, so the first description cannot survive structured editing.');
  }
  pasteAnalysis = { parsed, json, warnings };
  renderPasteSummary();
}

function renderPasteSummary() {
  const box = $('#paste-summary');
  const { parsed, warnings = [] } = pasteAnalysis;
  box.replaceChildren();
  box.hidden = false;

  const lines = [];
  lines.push(`Valid ${target().name}: ${parsed.boxes.length} ${target().id === 'flux2' ? 'subject' : 'element'}${parsed.boxes.length === 1 ? '' : 's'}`
    + (parsed.scene ? ', plus scene text' : '') + '.');
  if (parsed.aspect) lines.push(`Aspect ratio ${parsed.aspect}.`);
  if (target().boxes === 'numeric') lines.push(coordsDescription(target()));
  box.appendChild(hint(lines.join(' ')));
  for (const warning of warnings) box.appendChild(hint(warning, true));
}

$('#paste-text').addEventListener('input', analysePaste);

$('#paste-ok').onclick = () => {
  if (!pasteAnalysis) { analysePaste(); if (!pasteAnalysis) return; }
  applyImport(pasteAnalysis.parsed);
  dlgPaste.close();
};

function openSaveAsDialog() {
  $('#save-name').value = docName ? `${docName} copy` : '';
  $('#save-current').hidden = !currentSlotName;
  $('#save-current').textContent = currentSlotName
    ? `The current work “${currentSlotName}” will stay untouched.`
    : '';
  dlgSave.showModal();
  $('#save-name').focus();
}

function saveCurrent() {
  if (!currentSlotName) {
    openSaveAsDialog();
    return;
  }
  const slots = readSlots();
  const index = slots.findIndex((slot) => slot.name === currentSlotName);
  const payload = serialize(currentSlotName);
  payload.slot = currentSlotName;
  if (index >= 0) slots[index] = payload;
  else slots.unshift(payload);
  if (writeSlots(slots)) {
    docName = currentSlotName;
    el.docName.textContent = docName;
    toast(`Updated “${docName}”.`);
  }
}

$('#btn-save').onclick = saveCurrent;
$('#btn-save-as').onclick = openSaveAsDialog;

$('#save-ok').onclick = () => {
  const name = $('#save-name').value.trim();
  if (!name) { toast('Give it a name first.', true); return; }
  const slots = readSlots();
  if (slots.some((slot) => slot.name === name)) {
    toast(`“${name}” already exists. Choose another name or use Save to update it.`, true);
    return;
  }
  const payload = serialize(name);
  payload.slot = name;
  slots.unshift(payload);
  if (writeSlots(slots)) {
    docName = name;
    currentSlotName = name;
    el.docName.textContent = docName;
    toast(`Saved a new work “${name}”.`);
    dlgSave.close();
  }
};

$('#save-file').onclick = () => {
  const name = $('#save-name').value.trim() || 'untitled';
  const blob = new Blob([JSON.stringify(serialize(name), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name.replace(/[^\w\-. ]+/g, '_') + '.glassbox.json';
  a.click();
  URL.revokeObjectURL(a.href);
  dlgSave.close();
};

$('#save-copy').onclick = async () => {
  try {
    const name = $('#save-name').value.trim() || docName || 'untitled';
    await navigator.clipboard.writeText(JSON.stringify(serialize(name), null, 2));
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
      if (currentSlotName === s.name) currentSlotName = '';
      renderSlots();
    };
    row.append(n, m, del);
    row.onclick = () => {
      try { deserialize(s, 'slot'); toast(`Opened “${s.name}”.`); dlgOpen.close(); }
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
      deserialize(JSON.parse(r.result), 'file');
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
  currentSlotName = '';
  selectedId = null;
  openBoxes.clear();
  el.docName.textContent = '';
  setAspectValue(doc.aspect);
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
  setWorkspaceView('editor');
  el.inspector.dataset.open = '';
  setMobileTab(name);
  el.inspector.scrollTo({ top: 0, behavior: 'smooth' });
}

for (const tab of mobileTabs) {
  tab.addEventListener('click', () => {
    const panel = tab.dataset.mobilePanel;
    if (panel === 'canvas') {
      setWorkspaceView('editor');
      delete el.inspector.dataset.open;
      setMobileTab('canvas');
    } else if (panel === 'json') {
      delete el.inspector.dataset.open;
      setWorkspaceView('json');
      setMobileTab('json');
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
$('#dlg-settings').addEventListener('close', () => {
  editorSession = null;
  renderCanvas(); renderInspector(); renderJson(); persistDraft();
});
$('#dlg-box').addEventListener('close', () => {
  editorSession = null;
  renderCanvas(); renderInspector(); renderJson(); persistDraft();
});
$('#dlg-box form').addEventListener('submit', (event) => event.preventDefault());
$('#dlg-settings form').addEventListener('submit', (event) => event.preventDefault());
wireEditorDialog($('#dlg-settings'), $('#settings-editor-done'), $('#settings-editor-cancel'));
wireEditorDialog($('#dlg-box'), $('#box-editor-done'), $('#box-editor-cancel'));
$('#btn-edit-selected').onclick = () => selectedId && openBoxDialog(selectedId);

for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => setWorkspaceView(button.dataset.view));
}

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
  doc = blankDoc();
  docName = '';
  currentSlotName = '';
  selectedId = null;
  openBoxes.clear();
  if (backdrop.url) URL.revokeObjectURL(backdrop.url);
  backdrop = { url: '', name: '', opacity: backdrop.opacity };
  applyBackdrop();
  setAspectValue(doc.aspect);
  el.docName.textContent = '';
  setWorkspaceView('editor');
  fitCanvas();
  renderCanvas();
  renderInspector();
  showCoordHint();
  persistDraft();
};

function showCoordHint() {
  el.hintCoords.textContent = 'row-first · [y₁, x₁, y₂, x₂] · 0–1000';
}

for (const a of ASPECTS) {
  const o = document.createElement('option');
  o.value = a;
  o.textContent = a;
  el.aspect.appendChild(o);
}
const customAspectOption = document.createElement('option');
customAspectOption.value = '__custom__';
customAspectOption.textContent = 'Custom…';
el.aspect.appendChild(customAspectOption);
setAspectValue(doc.aspect);

function commitCustomAspect() {
  const value = el.aspectCustom.value.trim();
  if (!ratioOf(value)) {
    $('#aspect-error').hidden = false;
    el.aspectCustom.setAttribute('aria-invalid', 'true');
    return false;
  }
  $('#aspect-error').hidden = true;
  el.aspectCustom.removeAttribute('aria-invalid');
  setAspectValue(value);
  fitCanvas(); renderCanvas(); renderInspector(); showCoordHint(); persistDraft();
  return true;
}

el.aspect.onchange = () => {
  if (el.aspect.value === '__custom__') {
    el.aspectCustom.hidden = false;
    el.aspectCustom.value = ASPECTS.includes(doc.aspect) ? '' : doc.aspect;
    el.aspectCustom.focus();
    el.aspectCustom.select();
    return;
  }
  $('#aspect-error').hidden = true;
  setAspectValue(el.aspect.value);
  fitCanvas(); renderCanvas(); renderInspector(); showCoordHint(); persistDraft();
};
el.aspectCustom.onchange = commitCustomAspect;
el.aspectCustom.onkeydown = (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitCustomAspect();
  }
  if (event.key === 'Escape') setAspectValue(doc.aspect);
};

function commitImageSize() {
  const w = Math.round(Number(el.imageWidth.value));
  const h = Math.round(Number(el.imageHeight.value));
  doc.pixelBasis = w > 0 && h > 0 ? { w, h } : null;
  if (doc.pixelBasis) setAspectValue(reducedRatio(w, h));
  renderImageSizeStatus();
  fitCanvas(); renderCanvas(); renderInspector(); showCoordHint(); persistDraft();
}

el.imageWidth.addEventListener('change', commitImageSize);
el.imageHeight.addEventListener('change', commitImageSize);
el.imageWidth.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitImageSize();
    el.imageHeight.focus();
  }
});
el.imageHeight.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    commitImageSize();
  }
});

$('#btn-add').onclick = addBox;
$('#btn-dup').onclick = duplicateBox;
$('#btn-del').onclick = () => selectedId && deleteBox(selectedId);
$('#btn-clear-canvas').onclick = () => {
  const empty = blankDoc();
  empty.aspect = doc.aspect;
  empty.pixelBasis = hasPixelBasis() ? { ...doc.pixelBasis } : null;
  const hasContent = JSON.stringify(doc) !== JSON.stringify(empty) || backdrop.url;
  if (hasContent && !confirm('Clear the current prompt, every element, and the backdrop? Saved works will not be deleted.')) {
    return;
  }
  const aspect = doc.aspect;
  const pixelBasis = hasPixelBasis() ? { ...doc.pixelBasis } : null;
  doc = blankDoc();
  doc.aspect = aspect;
  doc.pixelBasis = pixelBasis;
  selectedId = null;
  openBoxes.clear();
  if (backdrop.url) URL.revokeObjectURL(backdrop.url);
  backdrop = { url: '', name: '', opacity: backdrop.opacity };
  applyBackdrop();
  setWorkspaceView('editor');
  setAspectValue(doc.aspect);
  fitCanvas();
  renderCanvas();
  renderInspector();
  showCoordHint();
  persistDraft();
  toast('Canvas cleared. Saved works are untouched.');
};
$('#btn-copy').onclick = copyJson;
$('#json-copy').onclick = copyJson;
$('#json-download').onclick = downloadJson;

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
