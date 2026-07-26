/* ---------------------------------------------------------------------------
   glassbox — target descriptors
   ---------------------------------------------------------------------------

   This file is the one you edit when a generator changes its JSON, or when you
   want to add a new one. Nothing in app.js knows the name of any field; it all
   comes from here.

   Every descriptor answers four questions:

     1. What fields does this target have, and what are they called?
     2. Does it take numeric boxes, prose placement, or neither?
     3. How do I turn the canonical document into its JSON?   (exportDoc)
     4. How do I turn its JSON back into the canonical document?  (importDoc)

   CONFIDENCE FLAGS
   ----------------
   Each field carries `confidence`:

     'known'   — documented behaviour, safe to rely on.
     'assumed' — plausible, matches the usual convention, NOT verified.

   Assumed fields are highlighted in the UI with a dotted underline so you never
   quietly ship a guessed field name to a generator. When you see the real JSON
   from a tool, correct the field here and flip it to 'known'. That is the whole
   maintenance story.

   THE CANONICAL DOCUMENT
   ----------------------
   {
     version: 1,
     aspect:   "16:9",
     scene:    "",                       // the shot as a whole
     background: "",
     style:    { type: "", descriptors: "", medium: "", palette: "" },
     lighting: "",
     camera:   { angle: "", distance: "", lens: "" },
     mood:     "",
     text:     { content: "", placement: "" },
     negative: "",
     seed:     null,
     boxes: [{
       id, rect: {x, y, w, h},           // normalized 0..1, origin top-left
       prompt, weight, depth,            // depth: 'foreground'|'midground'|'background'|''
       kind, text, palette,              // kind: 'obj'|'text'; text = literal copy to render
       label, color                      // APP-ONLY. Never exported. See app.js.
     }],
     extras: {}                          // unrecognised keys from a paste, kept + flagged
   }
--------------------------------------------------------------------------- */

/* --- geometry → prose ------------------------------------------------------
   FLUX.2 takes description rather than coordinates. This is the bridge: you
   draw the box, this writes the sentence. Tune the vocabulary here if a model
   responds better to different wording.

   (Ideogram takes real coordinates. Krea 2 is an experimental soft-guidance
   target: its public interface does not expose native bbox control.) */

const GEO = {
  columns: [
    [0.00, 0.22, 'far left'],
    [0.22, 0.40, 'left third'],
    [0.40, 0.60, 'horizontal centre'],
    [0.60, 0.78, 'right third'],
    [0.78, 1.01, 'far right'],
  ],
  rows: [
    [0.00, 0.22, 'top'],
    [0.22, 0.40, 'upper'],
    [0.40, 0.60, 'vertical centre'],
    [0.60, 0.78, 'lower'],
    [0.78, 1.01, 'bottom'],
  ],
  scales: [
    [0.00, 0.03, 'tiny, a small detail in the frame'],
    [0.03, 0.10, 'small'],
    [0.10, 0.28, 'medium'],
    [0.28, 0.55, 'large, a major element'],
    [0.55, 1.01, 'dominant, filling most of the frame'],
  ],
};

function bandFor(bands, v) {
  for (const [lo, hi, name] of bands) if (v >= lo && v < hi) return name;
  return bands[bands.length - 1][2];
}

/** Turn a normalized rect into a human placement phrase. */
function rectToPlacement(rect) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const col = bandFor(GEO.columns, cx);
  const row = bandFor(GEO.rows, cy);

  // "vertical centre / horizontal centre" reads badly — collapse it.
  if (col === 'horizontal centre' && row === 'vertical centre') return 'centred in the frame';
  if (col === 'horizontal centre') return `${row} centre`;
  if (row === 'vertical centre') return `${col}, vertically centred`;
  return `${row} ${col}`;
}

/** Turn a normalized rect into a size phrase. */
function rectToScale(rect) {
  return bandFor(GEO.scales, Math.max(0, rect.w) * Math.max(0, rect.h));
}

/** The full sentence a prose target gets instead of numbers. */
function rectToProse(box) {
  const parts = [rectToPlacement(box.rect), rectToScale(box.rect)];
  if (box.depth) parts.push(box.depth);
  return parts.join(', ');
}

/* Rough inverse: prose back to a box, so a paste from a prose target still
   puts something on the canvas rather than nothing. Deliberately coarse — it
   recovers the region, not the exact rectangle you drew. */
function proseToRect(text) {
  const t = String(text || '').toLowerCase();
  let cx = 0.5, cy = 0.5, area = 0.16;

  if (/far left/.test(t)) cx = 0.12;
  else if (/left/.test(t)) cx = 0.30;
  else if (/far right/.test(t)) cx = 0.88;
  else if (/right/.test(t)) cx = 0.70;

  if (/\btop\b/.test(t)) cy = 0.12;
  else if (/upper/.test(t)) cy = 0.30;
  else if (/\bbottom\b/.test(t)) cy = 0.88;
  else if (/lower/.test(t)) cy = 0.70;

  if (/tiny/.test(t)) area = 0.02;
  else if (/small/.test(t)) area = 0.06;
  else if (/dominant|filling/.test(t)) area = 0.64;
  else if (/large|major/.test(t)) area = 0.36;

  const side = Math.sqrt(area);
  return {
    x: clamp01(cx - side / 2), y: clamp01(cy - side / 2),
    w: Math.min(side, 1), h: Math.min(side, 1),
  };
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function r3(v) { return Math.round(v * 1000) / 1000; }
function nonEmpty(v) { return v !== undefined && v !== null && v !== '' ; }

/** Drop empty strings / empty objects so exported JSON stays readable. */
function prune(obj) {
  if (Array.isArray(obj)) return obj.map(prune).filter((v) => v !== undefined);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const p = prune(v);
      if (p === undefined) continue;
      if (typeof p === 'object' && !Array.isArray(p) && Object.keys(p).length === 0) continue;
      if (Array.isArray(p) && p.length === 0) continue;
      out[k] = p;
    }
    return out;
  }
  return nonEmpty(obj) ? obj : undefined;
}

/* --- shared field definitions ---------------------------------------------
   `path` is the dotted address in the canonical document. `key` is what this
   particular target calls it. */

const F = (path, key, label, opts = {}) => ({
  path, key, label,
  type: opts.type || 'text',
  confidence: opts.confidence || 'known',
  note: opts.note || '',
  options: opts.options || null,
});

/* =========================================================================
   TARGET: General JSON
   Our own canonical shape. Lossless — everything survives a round trip.
   ========================================================================= */

const TARGET_GENERAL = {
  id: 'general',
  name: 'General JSON',
  blurb: 'The canonical shape. Nothing is dropped, boxes stay numeric. Use this as your archive format and convert outward from it.',
  boxes: 'numeric',
  bboxFormat: 'xywh',
  coords: 'Normalized 0–1, origin top-left, [x, y, w, h].',
  fields: [
    F('aspect', 'aspect_ratio', 'Aspect ratio'),
    F('scene', 'scene', 'Scene'),
    F('background', 'background', 'Background'),
    F('style.type', 'style.type', 'Style type'),
    F('style.descriptors', 'style.descriptors', 'Style descriptors'),
    F('style.medium', 'style.medium', 'Medium'),
    F('style.palette', 'style.palette', 'Colour palette'),
    F('lighting', 'lighting', 'Lighting'),
    F('camera.angle', 'camera.angle', 'Camera angle'),
    F('camera.distance', 'camera.distance', 'Camera distance'),
    F('camera.lens', 'camera.lens', 'Lens'),
    F('mood', 'mood', 'Mood'),
    F('text.content', 'text.content', 'Text content'),
    F('text.placement', 'text.placement', 'Text placement'),
    F('negative', 'negative_prompt', 'Negative prompt'),
    F('seed', 'seed', 'Seed', { type: 'number' }),
  ],

  exportDoc(doc) {
    return prune({
      aspect_ratio: doc.aspect,
      scene: doc.scene,
      background: doc.background,
      style: {
        type: doc.style.type, descriptors: doc.style.descriptors,
        medium: doc.style.medium, palette: doc.style.palette,
      },
      lighting: doc.lighting,
      camera: { angle: doc.camera.angle, distance: doc.camera.distance, lens: doc.camera.lens },
      mood: doc.mood,
      text: { content: doc.text.content, placement: doc.text.placement },
      negative_prompt: doc.negative,
      seed: doc.seed,
      boxes: doc.boxes.map((b) => prune({
        type: b.kind === 'text' ? 'text' : undefined,
        bbox: [r3(b.rect.x), r3(b.rect.y), r3(b.rect.w), r3(b.rect.h)],
        prompt: b.prompt,
        text: b.kind === 'text' ? b.text : undefined,
        color_palette: splitList(b.palette),
        weight: b.weight !== 1 ? b.weight : undefined,
        depth: b.depth,
      })),
      ...doc.extras,
    });
  },

  importDoc(json) {
    const dims = dimsOf(json);
    const boxes = (json.boxes || json.regions || []).map((b) => ({
      rect: bboxArrayToRect(b.bbox || b.box || b.rect, this.bboxFormat, dims),
      prompt: b.prompt || b.description || '',
      weight: typeof b.weight === 'number' ? b.weight : 1,
      depth: b.depth || '',
      kind: b.type === 'text' ? 'text' : 'obj',
      text: b.text || '',
      palette: joinList(b.color_palette),
    }));
    return {
      aspect: json.aspect_ratio || '',
      scene: json.scene || '',
      background: json.background || '',
      style: {
        type: json.style?.type || '',
        descriptors: json.style?.descriptors || '',
        medium: json.style?.medium || '',
        palette: json.style?.palette || '',
      },
      lighting: json.lighting || '',
      camera: {
        angle: json.camera?.angle || '',
        distance: json.camera?.distance || '',
        lens: json.camera?.lens || '',
      },
      mood: json.mood || '',
      text: { content: json.text?.content || '', placement: json.text?.placement || '' },
      negative: json.negative_prompt || '',
      seed: json.seed ?? null,
      boxes,
      consumed: ['aspect_ratio', 'scene', 'background', 'style', 'lighting', 'camera',
        'mood', 'text', 'negative_prompt', 'seed', 'boxes', 'regions'],
    };
  },
};

/* =========================================================================
   TARGET: FLUX.2  (Black Forest Labs)

   FLUX.2 reads a structured JSON object pasted into the prompt. It does NOT
   take numeric bounding boxes — placement is described in words. That is why
   `boxes: 'prose'`: your canvas rectangles become `placement` strings.
   ========================================================================= */

const TARGET_FLUX2 = {
  id: 'flux2',
  name: 'FLUX.2 · Structured prompt',
  blurb: 'Black Forest Labs’ documented structured prompt. Boxes become the official subjects[].position wording; FLUX.2 does not use numeric bounding boxes or negative prompts.',
  boxes: 'prose',
  coords: 'None. Rectangles are rendered as placement + scale wording.',
  fields: [
    F('scene', 'scene', 'Scene'),
    F('background', 'background', 'Background'),
    F('style.descriptors', 'style', 'Style'),
    F('style.palette', 'color_palette', 'Colour palette'),
    F('lighting', 'lighting', 'Lighting'),
    F('camera.angle', 'camera.angle', 'Camera angle'),
    F('camera.lens', 'camera.lens', 'Lens'),
    F('camera.focus', 'camera.depth_of_field', 'Depth of field'),
    F('mood', 'mood', 'Mood'),
    F('composition', 'composition', 'Composition'),
  ],

  exportDoc(doc) {
    return prune({
      scene: doc.scene,
      subjects: doc.boxes.map((b) => prune({
        description: b.prompt,
        position: rectToProse(b),
        action: b.action,
      })),
      background: doc.background,
      style: joinStyle(doc),
      color_palette: splitList(doc.style.palette),
      lighting: doc.lighting,
      camera: { angle: doc.camera.angle, lens: doc.camera.lens, depth_of_field: doc.camera.focus },
      mood: doc.mood,
      composition: doc.composition,
    });
  },

  importDoc(json) {
    const subjects = json.subjects || json.elements || [];
    return {
      aspect: json.aspect_ratio || '',
      scene: json.scene || '',
      background: json.background || '',
      style: {
        type: '',
        descriptors: typeof json.style === 'string' ? json.style : (json.style?.descriptors || ''),
        palette: joinList(json.color_palette),
      },
      lighting: json.lighting || '',
      composition: json.composition || '',
      camera: {
        angle: json.camera?.angle || '',
        lens: json.camera?.lens || '',
        focus: json.camera?.depth_of_field || '',
      },
      mood: json.mood || '',
      boxes: subjects.map((s) => ({
        rect: proseToRect(s.position || ''),
        prompt: s.description || s.subject || '',
        action: s.action || s.pose || '',
      })),
      consumed: ['scene', 'subjects', 'background', 'style', 'color_palette',
        'lighting', 'camera', 'mood', 'composition'],
      warnings: subjects.length
        ? ['Boxes were reconstructed from placement wording, so the rectangles are approximate. Reposition them on the canvas.']
        : [],
    };
  },
};

/* =========================================================================
   TARGET: Ideogram 4.0 — JSON prompting

   VERIFIED against Ideogram's own prompting guide and Runware's model docs.

   Ideogram 4.0 was trained on structured captions, so it takes a real JSON
   document — including per-element bounding boxes. Note the axis order:

       bbox = [y_min, x_min, y_max, x_max]   ROW-FIRST, y before x
       normalized 0–1000, origin top-left

   This is distinct from the observed expanded format, which is x-first and
   uses an aspect-shaped grid rather than a square 0–1000 grid.

   `aspect_ratio` is deliberately absent: it is a separate API parameter, not
   part of the prompt document.
   ========================================================================= */

const TARGET_IDEOGRAM = {
  id: 'ideogram',
  name: 'Ideogram 4 · Model JSON',
  blurb: 'Ideogram’s native structured caption. Bounding boxes are optional, row-first [y_min, x_min, y_max, x_max] on a 0–1000 grid. Key order and uppercase hex palettes follow the official CaptionVerifier contract.',
  boxes: 'numeric',
  bboxFormat: 'yxyx',
  grid: 1000,
  coords: 'Normalized 0–1000, origin top-left, [y_min, x_min, y_max, x_max] — row-first.',
  fields: [
    F('scene', 'high_level_description', 'Scene', {
      note: 'Strongly recommended by Ideogram; the one-sentence summary of the whole image.',
    }),
    F('style.mode', 'style_description.photo | art_style', 'Caption type'),
    F('style.descriptors', 'style_description.aesthetics', 'Aesthetics'),
    F('lighting', 'style_description.lighting', 'Lighting'),
    F('style.detail', 'style_description.photo | art_style', 'Photo / art style', {
      note: 'Ideogram requires exactly one: photo for photographic captions, art_style for everything else.',
    }),
    F('style.medium', 'style_description.medium', 'Medium'),
    F('style.palette', 'style_description.color_palette', 'Colour palette', {
      note: 'Optional, up to 16 uppercase #RRGGBB values.',
    }),
    F('background', 'compositional_deconstruction.background', 'Background'),
  ],

  exportDoc(doc) {
    const scale = scaleOf(this);
    const palette = splitList(doc.style.palette)
      .map((color) => color.toUpperCase())
      .filter((color) => /^#[0-9A-F]{6}$/.test(color))
      .slice(0, 16);
    const hasStyle = Boolean(
      doc.style.descriptors || doc.lighting || doc.style.detail || doc.style.medium || palette.length);
    const style = hasStyle
      ? doc.style.mode === 'photo'
        ? {
            aesthetics: doc.style.descriptors || '',
            lighting: doc.lighting || '',
            photo: doc.style.detail || '',
            medium: doc.style.medium || 'photograph',
            ...(palette.length ? { color_palette: palette } : {}),
          }
        : {
            aesthetics: doc.style.descriptors || '',
            lighting: doc.lighting || '',
            medium: doc.style.medium || 'illustration',
            art_style: doc.style.detail || '',
            ...(palette.length ? { color_palette: palette } : {}),
          }
      : null;
    const elements = doc.boxes.map((b) => {
      const elementPalette = splitList(b.palette)
        .map((color) => color.toUpperCase())
        .filter((color) => /^#[0-9A-F]{6}$/.test(color))
        .slice(0, 5);
      const common = {
        bbox: rectToBboxArray(b.rect, this.bboxFormat, scale),
        desc: b.prompt || '',
        ...(elementPalette.length ? { color_palette: elementPalette } : {}),
      };
      return b.kind === 'text'
        ? { type: 'text', bbox: common.bbox, text: b.text || '', desc: common.desc, ...(common.color_palette ? { color_palette: common.color_palette } : {}) }
        : { type: 'obj', bbox: common.bbox, desc: common.desc, ...(common.color_palette ? { color_palette: common.color_palette } : {}) };
    });
    const result = {};
    if (doc.scene) result.high_level_description = doc.scene;
    if (style) result.style_description = style;
    result.compositional_deconstruction = {
      background: doc.background || '',
      elements,
    };
    return result;
  },

  importDoc(json) {
    const cd = json.compositional_deconstruction || {};
    const sd = json.style_description || {};
    const scale = scaleOf(this);
    return {
      aspect: json.aspect_ratio || '',
      scene: json.high_level_description || '',
      background: cd.background || '',
      style: {
        mode: sd.photo !== undefined ? 'photo' : 'art',
        descriptors: sd.aesthetics || '',
        medium: sd.medium || '',
        detail: sd.photo || sd.art_style || '',
        palette: joinList(sd.color_palette),
      },
      lighting: sd.lighting || '',
      mood: '',
      camera: { angle: '', distance: '', lens: '' },
      text: { content: '', placement: '' },
      negative: '',
      seed: json.seed ?? null,
      boxes: (cd.elements || []).map((e) => ({
        rect: bboxArrayToRect(e.bbox, this.bboxFormat, scale),
        prompt: e.desc || e.description || '',
        weight: 1,
        depth: '',
        kind: e.type === 'text' ? 'text' : 'obj',
        text: e.text || '',
        palette: joinList(e.color_palette),
      })),
      consumed: ['high_level_description', 'style_description',
        'compositional_deconstruction'],
    };
  },
};

/* =========================================================================
   TARGET: Ideogram 4 "Expand to JSON" output

   VERIFIED against DrawThings' public PromptJSONExpansion implementation and
   the Ideogram 4 Magic Prompt system prompt it embeds:

       bbox = [y_min, x_min, y_max, x_max]
       normalized 0–1000 on both axes, origin top-left

   Image dimensions are separate. DrawThings reduces width:height by their GCD
   and forcibly writes that value into aspect_ratio after local LLM expansion.
   ========================================================================= */

const TARGET_IDEOGRAM_EXPANDED = {
  id: 'ideogram-expanded',
  name: 'DrawThings Ideogram 4.0',
  blurb: 'DrawThings’ verified Ideogram 4.0 expansion contract: row-first boxes on a 0–1000 grid. Image Size determines aspect_ratio; bbox is optional per element.',
  boxes: 'numeric',
  bboxFormat: 'yxyx',
  grid: 1000,
  imageSize: true,
  coords: 'Verified DrawThings convention: [y_min, x_min, y_max, x_max], normalized 0–1000, origin top-left.',
  fields: [
    F('aspect', 'aspect_ratio', 'Aspect ratio'),
    F('scene', 'high_level_description', 'Scene'),
    F('background', 'compositional_deconstruction.background', 'Background'),
  ],

  exportDoc(doc) {
    const scale = scaleOf(this);
    return {
      aspect_ratio: doc.aspect,
      high_level_description: doc.scene,
      compositional_deconstruction: {
        background: doc.background,
        elements: doc.boxes.map((box) => ({
          type: box.kind === 'text' ? 'text' : 'obj',
          ...(box.hasBbox === false ? {} : {
            bbox: rectToBboxArray(box.rect, this.bboxFormat, scale),
          }),
          ...(box.kind === 'text' ? { text: box.text || '' } : {}),
          desc: box.prompt,
        })),
      },
    };
  },

  importDoc(json) {
    const cd = json.compositional_deconstruction || {};
    const scale = scaleOf(this);
    return {
      aspect: json.aspect_ratio || '',
      scene: json.high_level_description || '',
      background: cd.background || '',
      boxes: (cd.elements || []).map((element) => ({
        rect: bboxArrayToRect(element.bbox, this.bboxFormat, scale),
        hasBbox: Array.isArray(element.bbox),
        prompt: element.desc || '',
        kind: element.type === 'text' ? 'text' : 'obj',
        text: element.text || '',
      })),
      consumed: ['aspect_ratio', 'high_level_description', 'compositional_deconstruction'],
    };
  },
};

/* =========================================================================
   TARGET: Krea 2 bbox experiment

   Krea's technical report confirms that the model reads detailed JSON and
   bounding-box prompts, but Krea publishes no schema. This deliberately narrow
   descriptor supports the exact expanded Ideogram envelope used in the
   supplied Krea/DrawThings experiments. Placement is soft rather than exact.
   ========================================================================= */

const TARGET_KREA = {
  id: 'krea',
  name: 'Krea 2 · BBox experiment',
  blurb: 'Krea confirms exposure to JSON and bounding-box prompts but publishes no schema or native bbox control. This mode preserves the observed compact envelope; placement is soft and may be ignored.',
  boxes: 'numeric',
  bboxFormat: 'xyxy',
  scale: observedExpandedScale,
  dynamicGrid: true,
  coords: 'Working convention: [x_min, y_min, x_max, y_max] on the expanded Ideogram aspect grid, canvas origin top-left. Krea may treat these as weak prompt guidance.',
  coordOrderUnsettled: 'Experimental, not an official Krea API contract. The exported JSON is meant to be pasted as the prompt string.',
  observedOutput: true,
  fields: [
    F('aspect', 'aspect_ratio', 'Aspect ratio'),
    F('scene', 'high_level_description', 'Scene'),
    F('background', 'compositional_deconstruction.background', 'Background'),
  ],

  exportDoc(doc) {
    const scale = scaleOf(this, doc.aspect, doc);
    return {
      aspect_ratio: doc.aspect,
      high_level_description: doc.scene,
      compositional_deconstruction: {
        background: doc.background,
        elements: doc.boxes.map((box) => ({
          type: box.kind === 'text' ? 'text' : 'obj',
          bbox: rectToBboxArray(box.rect, this.bboxFormat, scale),
          ...(box.text ? { text: box.text } : {}),
          desc: box.prompt,
        })),
      },
    };
  },

  importDoc(json) {
    const cd = json.compositional_deconstruction || {};
    const scale = inferObservedScale(json);
    return {
      aspect: json.aspect_ratio || '',
      coordBasis: scale,
      scene: json.high_level_description || '',
      background: cd.background || '',
      boxes: (cd.elements || []).map((element) => ({
        rect: bboxArrayToRect(element.bbox, this.bboxFormat, scale),
        prompt: element.desc || '',
        kind: element.type === 'text' ? 'text' : 'obj',
        text: element.text || '',
      })),
      consumed: ['aspect_ratio', 'high_level_description', 'compositional_deconstruction'],
    };
  },
};

/* --- helpers shared by descriptors ---------------------------------------- */

/** "#ff0000, #00ff00" <-> ["#ff0000", "#00ff00"] */
function splitList(v) {
  if (Array.isArray(v)) return v;
  const s = String(v || '').trim();
  return s ? s.split(/\s*,\s*/).filter(Boolean) : [];
}
function joinList(v) {
  return Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v));
}

function joinStyle(doc) {
  return [doc.style.detail, doc.style.descriptors].filter(Boolean).join(', ');
}

/**
 * Read a bbox array into a normalized rect.
 *
 * Coordinate helpers retain the three common formats used during development,
 * though the shipped DrawThings target uses only row-first `yxyx`.
 *
 *   'xywh'  [x, y, width, height]        — the generic convention
 *   'xyxy'  [x1, y1, x2, y2]
 *   'yxyx'  [y_min, x_min, y_max, x_max] — DrawThings Ideogram 4.0
 *
 * The convention is DECLARED by the target, never guessed: the same four
 * numbers are a valid rectangle under all three, and picking wrong silently
 * moves — or transposes — every box.
 *
 * @param arr    the raw array
 * @param format one of the three above
 * @param scale  {w, h} divisor: {w:1000,h:1000} for a normalized-1000 grid,
 *               pixel dimensions for a pixel format, or null if already 0–1
 */
function bboxArrayToRect(arr, format, scale) {
  const FALLBACK = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
  if (!Array.isArray(arr) || arr.length < 4) return FALLBACK;
  let [a, b, c, d] = arr.map(Number);
  if (![a, b, c, d].every(Number.isFinite)) return FALLBACK;

  // Row-first: swap into x-first and fall through to the corner branch.
  if (format === 'yxyx') { [a, b, c, d] = [b, a, d, c]; format = 'xyxy'; }

  if (Math.max(a, b, c, d) > 1.5) {
    const sx = scale && scale.w > 0 ? scale.w : Math.max(a, b, c, d);
    const sy = scale && scale.h > 0 ? scale.h : Math.max(a, b, c, d);
    a /= sx; c /= sx; b /= sy; d /= sy;
  }

  if (format === 'xyxy') {
    const x0 = Math.min(a, c), x1 = Math.max(a, c);
    const y0 = Math.min(b, d), y1 = Math.max(b, d);
    return { x: clamp01(x0), y: clamp01(y0), w: clamp01(x1 - x0), h: clamp01(y1 - y0) };
  }
  return {
    x: clamp01(a), y: clamp01(b),
    w: clamp01(Math.min(c, 1 - clamp01(a))), h: clamp01(Math.min(d, 1 - clamp01(b))),
  };
}

/** The inverse: a normalized rect back into a target's bbox array. */
function rectToBboxArray(rect, format, scale) {
  const sw = (scale && scale.w) || 1, sh = (scale && scale.h) || 1;
  const round = (v) => (sw === 1 && sh === 1) ? r3(v) : Math.round(v);
  const x0 = rect.x * sw, y0 = rect.y * sh;
  const x1 = (rect.x + rect.w) * sw, y1 = (rect.y + rect.h) * sh;
  if (format === 'yxyx') return [round(y0), round(x0), round(y1), round(x1)];
  if (format === 'xyxy') return [round(x0), round(y0), round(x1), round(y1)];
  return [round(x0), round(y0), round(rect.w * sw), round(rect.h * sh)];
}

/** Legacy aspect-grid helper retained for unregistered development descriptors. */
function aspectGridScale(aspect) {
  const match = String(aspect || '').match(/^\s*(\d+(?:\.\d+)?)\s*[:x×\/]\s*(\d+(?:\.\d+)?)\s*$/i);
  if (!match) return { w: 1000, h: 1000 };
  return { w: Number(match[1]) * 100, h: Number(match[2]) * 100 };
}

function observedExpandedScale(_aspect, doc) {
  const w = Number(doc?.coordBasis?.w);
  const h = Number(doc?.coordBasis?.h);
  return w > 0 && h > 0 ? { w, h } : { w: 1000, h: 1000 };
}

function inferObservedScale(json) {
  const elements = json?.compositional_deconstruction?.elements || [];
  const boxes = elements.map((element) => element?.bbox)
    .filter((bbox) => Array.isArray(bbox) && bbox.length === 4);
  if (!boxes.length) return { w: 1000, h: 1000 };
  const maxX = Math.max(...boxes.flatMap((bbox) => [Number(bbox[0]), Number(bbox[2])]));
  const maxY = Math.max(...boxes.flatMap((bbox) => [Number(bbox[1]), Number(bbox[3])]));
  if (maxX <= 1000 && maxY <= 1000) return { w: 1000, h: 1000 };

  const aspectScale = aspectGridScale(json.aspect_ratio);
  if (maxX <= aspectScale.w && maxY <= aspectScale.h) return aspectScale;
  return { w: Math.max(1000, maxX), h: Math.max(1000, maxY) };
}

/** The coordinate divisor a target uses, if any. */
function scaleOf(t, aspect, doc) {
  if (typeof t.scale === 'function') return t.scale(aspect, doc);
  return t.grid ? { w: t.grid, h: t.grid } : null;
}

/** Pixel dimensions declared in a pasted document, if any. */
function dimsOf(json) {
  const w = Number(json.width || json.image_width || json.canvas?.width);
  const h = Number(json.height || json.image_height || json.canvas?.height);
  return (w > 0 && h > 0) ? { w, h } : null;
}

/* --- shipped format -------------------------------------------------------
   Experimental descriptors above are intentionally not registered. A format
   should only be added here after it has been tested in the actual generator. */

const TARGETS = [TARGET_IDEOGRAM_EXPANDED];

/* =========================================================================
   TOLERANT IMPORT

   A descriptor only knows the shape it was written for. Real JSON arrives from
   tools nobody has described yet, with different names and different nesting —
   and the failure mode that matters is the silent one, where a paste produces
   an empty canvas and no explanation.

   So: when the chosen target's importer finds nothing, fall back to a
   structural scavenger that walks the whole tree looking for anything
   box-shaped, whatever it happens to be called.
   ========================================================================= */

const IMPORT_ALIASES = {
  aspect: ['aspect_ratio', 'aspectratio', 'ratio', 'aspect'],
  scene: ['scene', 'high_level_description', 'overall_description', 'description',
    'prompt', 'summary', 'concept', 'main_prompt', 'global_prompt'],
  background: ['background', 'backdrop', 'setting', 'environment', 'scenery'],
  'style.descriptors': ['style', 'art_style', 'artstyle', 'aesthetic', 'visual_style', 'style_descriptors'],
  'style.type': ['style_type', 'styletype'],
  'style.palette': ['color_palette', 'colour_palette', 'palette', 'colors', 'colours'],
  lighting: ['lighting', 'light', 'illumination'],
  mood: ['mood', 'atmosphere', 'tone', 'ambience'],
  'camera.angle': ['camera_angle', 'angle', 'viewpoint'],
  'camera.distance': ['camera_distance', 'shot_type', 'framing', 'shot'],
  'camera.lens': ['lens', 'focal_length'],
  'text.content': ['text_content', 'rendered_text', 'typography'],
  'text.placement': ['text_placement'],
  negative: ['negative_prompt', 'negative', 'avoid', 'exclude', 'do_not_include'],
};

const ELEMENT_BBOX_KEYS = ['bbox', 'box', 'rect', 'bounds', 'coords', 'coordinates', 'region', 'area', 'position'];
const ELEMENT_DESC_KEYS = ['desc', 'description', 'prompt', 'caption', 'content', 'text', 'subject'];

/** Numeric aspect ratio from "32:17" / "16x9" / "1.85". */
function ratioOf(str) {
  if (!str) return 0;
  const m = String(str).match(/(\d+(?:\.\d+)?)\s*[:x×\/]\s*(\d+(?:\.\d+)?)/i);
  if (m) { const a = +m[1], b = +m[2]; return (a > 0 && b > 0) ? a / b : 0; }
  const n = Number(str);
  return n > 0 ? n : 0;
}

/** A pixel frame for exporting, when the document has no remembered one. */
function basisFromAspect(aspect, width) {
  const r = ratioOf(aspect) || 16 / 9;
  const w = width || 1024;
  return { w, h: Math.round(w / r) };
}

/**
 * Decide whether a set of 4-number arrays is [x,y,w,h] or [x0,y0,x1,y1].
 *
 * Unlike a single box — where the two readings are genuinely indistinguishable —
 * a whole SET carries evidence. Reading corners as width/height inflates the
 * frame far past the largest coordinate present, which is the tell.
 */
function detectBboxFormat(arrays) {
  const good = arrays.filter((a) => Array.isArray(a) && a.length >= 4 && a.every((v) => Number.isFinite(+v)));
  if (!good.length) return { format: 'xywh', reason: 'no coordinates to inspect', confident: false };

  if (!good.every((a) => +a[2] > +a[0] && +a[3] > +a[1])) {
    return {
      format: 'xywh', confident: true,
      reason: 'some boxes have a third or fourth value below the first or second, which only reads as width and height',
    };
  }

  const maxCoord = Math.max(...good.flat().map(Number));
  const spanX = Math.max(...good.map((a) => +a[0] + +a[2]));
  const spanY = Math.max(...good.map((a) => +a[1] + +a[3]));
  if (spanX > maxCoord * 1.35 || spanY > maxCoord * 1.35) {
    return {
      format: 'xyxy', confident: true,
      reason: 'reading them as width and height would push boxes well outside the frame',
    };
  }
  return {
    format: 'xywh', confident: false,
    reason: 'both readings fit the frame, so the usual x/y/width/height is assumed',
  };
}

/**
 * The coordinate scale implied by a set of boxes, or null if already 0–1.
 *
 * A 0–1000 grid is documented for Ideogram 4.0 model captions. Unknown
 * documents that fit inside it are read as that grid rather than as pixels
 * scaled to whatever the boxes happen to span.
 * Getting this wrong does not
 * misplace boxes so much as STRETCH them: normalizing a 0–1000 document
 * against its own extents pushes everything outward toward the frame edges.
 */
function inferBasis(arrays, format, ratio) {
  const good = arrays.filter((a) => Array.isArray(a) && a.length >= 4 && a.every((v) => Number.isFinite(+v)));
  if (!good.length) return null;
  const max = Math.max(...good.flat().map(Number));
  if (max <= 1.5) return null;                       // already normalized 0–1
  if (max <= 1000) return { w: 1000, h: 1000, grid: true };

  const ex = Math.max(...good.map((a) => format === 'xywh' ? +a[0] + +a[2] : +a[2]));
  const ey = Math.max(...good.map((a) => format === 'xywh' ? +a[1] + +a[3] : +a[3]));
  if (ratio > 0) {
    let w = Math.max(ex, ey * ratio);
    let h = w / ratio;
    if (h < ey) { h = ey; w = h * ratio; }
    return { w, h };
  }
  return { w: ex, h: ey };
}

/**
 * Walk an arbitrary object looking for something box-shaped and something
 * scene-shaped. Returns the same result contract as a descriptor's importDoc,
 * plus `found` describing where things came from — so the paste dialog can say
 * what it did instead of leaving you with a blank canvas.
 */
function scavengeDoc(json, formatOverride) {
  const flat = {};              // alias key -> first string value found
  let best = null;              // { path, items }
  const topTouched = new Set();

  (function walk(node, path, top) {
    if (node == null || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      const objs = node.filter((n) => n && typeof n === 'object' && !Array.isArray(n));
      const boxy = objs.filter((n) => ELEMENT_BBOX_KEYS.some((k) => Array.isArray(n[k]) && n[k].length >= 4));
      if (boxy.length && boxy.length >= objs.length / 2) {
        if (!best || boxy.length > best.items.length) {
          best = { path: path || 'root', items: boxy };
          if (top) topTouched.add(top);
        }
      }
      node.forEach((n, i) => walk(n, `${path}[${i}]`, top));
      return;
    }

    for (const [k, v] of Object.entries(node)) {
      const here = path ? `${path}.${k}` : k;
      const topKey = top || k;
      if (typeof v === 'string' && v.trim()) {
        const lk = k.toLowerCase();
        for (const [slot, names] of Object.entries(IMPORT_ALIASES)) {
          if (flat[slot] === undefined && names.includes(lk)) {
            flat[slot] = v;
            topTouched.add(topKey);
            break;
          }
        }
      } else if (typeof v === 'number' && k.toLowerCase() === 'seed') {
        flat.seed = v; topTouched.add(topKey);
      } else if (v && typeof v === 'object') {
        walk(v, here, topKey);
      }
    }
  })(json, '', null);

  const items = best ? best.items : [];
  const rawBoxes = items.map((n) => {
    const bk = ELEMENT_BBOX_KEYS.find((k) => Array.isArray(n[k]) && n[k].length >= 4);
    return { arr: n[bk], node: n };
  });

  const detected = detectBboxFormat(rawBoxes.map((b) => b.arr));
  const format = formatOverride || detected.format;
  const ratio = ratioOf(flat.aspect);
  const basis = inferBasis(rawBoxes.map((b) => b.arr), format, ratio);

  const boxes = rawBoxes.map(({ arr, node }) => {
    const dk = ELEMENT_DESC_KEYS.find((k) => typeof node[k] === 'string' && node[k].trim());
    return {
      rect: bboxArrayToRect(arr, format, basis),
      prompt: dk ? node[dk] : '',
      weight: typeof node.weight === 'number' ? node.weight : 1,
      depth: '',
      kind: node.type || 'obj',
    };
  });

  const out = {
    aspect: flat.aspect || '',
    scene: flat.scene || '',
    background: flat.background || '',
    style: {
      type: flat['style.type'] || '',
      descriptors: flat['style.descriptors'] || '',
      palette: flat['style.palette'] || '',
    },
    lighting: flat.lighting || '',
    mood: flat.mood || '',
    camera: {
      angle: flat['camera.angle'] || '',
      distance: flat['camera.distance'] || '',
      lens: flat['camera.lens'] || '',
    },
    text: { content: flat['text.content'] || '', placement: flat['text.placement'] || '' },
    negative: flat.negative || '',
    seed: flat.seed ?? null,
    pixelBasis: basis,
    boxes,
    consumed: [...topTouched],
    warnings: [],
    found: {
      path: best ? best.path : null,
      count: boxes.length,
      format, detected, basis,
    },
  };

  if (basis) {
    out.warnings.push(`Pixel coordinates normalized against an inferred ${Math.round(basis.w)}×${Math.round(basis.h)} frame.`);
  }
  return out;
}

/* --- the app-only colour palette ------------------------------------------
   32 colours plus the default grey. These never leave the app — they exist so
   a canvas full of anonymous rectangles becomes a scene you can read at a
   glance: the blue one is the wolf, the brown one is the moose. */

const PALETTE = [
  { key: 'grey',    name: 'Grey',      hex: 'var(--palette-grey)' },
  { key: 'red',     name: 'Red',       hex: 'var(--palette-red)' },
  { key: 'crimson', name: 'Crimson',   hex: 'var(--palette-crimson)' },
  { key: 'rose',    name: 'Rose',      hex: 'var(--palette-rose)' },
  { key: 'pink',    name: 'Pink',      hex: 'var(--palette-pink)' },
  { key: 'fuchsia', name: 'Fuchsia',   hex: 'var(--palette-fuchsia)' },
  { key: 'purple',  name: 'Purple',    hex: 'var(--palette-purple)' },
  { key: 'violet',  name: 'Violet',    hex: 'var(--palette-violet)' },
  { key: 'indigo',  name: 'Indigo',    hex: 'var(--palette-indigo)' },
  { key: 'blue',    name: 'Blue',      hex: 'var(--palette-blue)' },
  { key: 'azure',   name: 'Azure',     hex: 'var(--palette-azure)' },
  { key: 'sky',     name: 'Sky',       hex: 'var(--palette-sky)' },
  { key: 'cyan',    name: 'Cyan',      hex: 'var(--palette-cyan)' },
  { key: 'teal',    name: 'Teal',      hex: 'var(--palette-teal)' },
  { key: 'emerald', name: 'Emerald',   hex: 'var(--palette-emerald)' },
  { key: 'green',   name: 'Green',     hex: 'var(--palette-green)' },
  { key: 'lime',    name: 'Lime',      hex: 'var(--palette-lime)' },
  { key: 'olive',   name: 'Olive',     hex: 'var(--palette-olive)' },
  { key: 'yellow',  name: 'Yellow',    hex: 'var(--palette-yellow)' },
  { key: 'amber',   name: 'Amber',     hex: 'var(--palette-amber)' },
  { key: 'orange',  name: 'Orange',    hex: 'var(--palette-orange)' },
  { key: 'coral',   name: 'Coral',     hex: 'var(--palette-coral)' },
  { key: 'sienna',  name: 'Sienna',    hex: 'var(--palette-sienna)' },
  { key: 'brown',   name: 'Brown',     hex: 'var(--palette-brown)' },
  { key: 'sand',    name: 'Sand',      hex: 'var(--palette-sand)' },
  { key: 'khaki',   name: 'Khaki',     hex: 'var(--palette-khaki)' },
  { key: 'mint',    name: 'Mint',      hex: 'var(--palette-mint)' },
  { key: 'plum',    name: 'Plum',      hex: 'var(--palette-plum)' },
  { key: 'mauve',   name: 'Mauve',     hex: 'var(--palette-mauve)' },
  { key: 'slate',   name: 'Slate',     hex: 'var(--palette-slate)' },
  { key: 'steel',   name: 'Steel',     hex: 'var(--palette-steel)' },
  { key: 'denim',   name: 'Denim',     hex: 'var(--palette-denim)' },
  { key: 'ink',     name: 'Ink',       hex: 'var(--palette-ink)' },
];

const PALETTE_BY_KEY = Object.fromEntries(PALETTE.map((c) => [c.key, c]));

/* --- aspect ratios offered in the toolbar --------------------------------- */

const ASPECTS = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16', '21:9', '4:5', '5:4'];
