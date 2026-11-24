import { state } from '../app/State.js';
import { Matrix } from '../utils/Matrix.js';
import { uid } from '../utils/ids.js';
import { createElement, createGroup, shapeLocalBounds, getElement } from '../document/Element.js';
import { createDocument } from '../document/Document.js';
import { serializeSVG, computeContentBounds } from '../svg/Serializer.js';
import { parseDToCommands } from '../svg/PathParser.js';
import { parseTransformAttr } from '../svg/TransformParser.js';
import { sanitizeElementTree, assertNoDangerousXmlDeclarations } from '../svg/Sanitizer.js';
import { renderAll } from '../app/renderAll.js';
import { fitToContent, renderView } from '../canvas/Navigation.js';
import { replaceDocument } from '../canvas/Interaction.js';

function doc(){ return state.document; }
function round2(n){ return Math.round(n*100)/100; }
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), 1400);
}

const codeText = document.getElementById('codeText');
const codeHighlightPre = document.getElementById('codeHighlight');
const codeHighlight = codeHighlightPre.querySelector('code');
let codeEditingByUser = false;
let lastSyncedSource = '';

function highlightXML(src){
  const escaped = src.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return escaped.replace(/(&lt;\/?)([a-zA-Z0-9]+)([\s\S]*?)(\/?&gt;)/g,
    (match, openTag, tagName, rest, closeTag) => {
      const highlightedRest = rest.replace(/([a-zA-Z-]+)(=)(")([^"]*)(")/g,
        '<span class="tok-attr">$1</span>$2<span class="tok-str">$3$4$5</span>');
      return `${openTag}<span class="tok-tag">${tagName}</span>${highlightedRest}<span class="tok-punc">${closeTag}</span>`;
    });
}

export function syncCodePanel(){
  if(codeEditingByUser) return;
  const topLevel = doc().elements.filter(e=>!e.parentId);
  const src = serializeSVG(doc(), topLevel);
  if(src === lastSyncedSource && codeText.value === src) return;
  lastSyncedSource = src;
  codeText.value = src;
  codeHighlight.innerHTML = highlightXML(src);
  syncCodeScroll();
}

// The highlight layer is a <pre> behind a transparent <textarea>. Both scroll
// independently, so mirror the textarea's offset onto the <pre> every frame
// instead of only on the scroll event (which fires before layout settles).
function syncCodeScroll(){
  codeHighlightPre.scrollTop = codeText.scrollTop;
  codeHighlightPre.scrollLeft = codeText.scrollLeft;
}
codeText.addEventListener('scroll', syncCodeScroll);
codeText.addEventListener('focus', ()=>{ codeEditingByUser = true; });
codeText.addEventListener('input', ()=>{
  codeHighlight.innerHTML = highlightXML(codeText.value);
  syncCodeScroll();
});
codeText.addEventListener('blur', ()=>{
  if(!codeEditingByUser) return;
  codeEditingByUser = false;
  const next = codeText.value;
  if(next === lastSyncedSource) return;
  try{
    importSVGSource(next, true);
    lastSyncedSource = next;
  }catch(err){
    // Keep the user's text visible so they can fix it rather than losing it.
    toast('Could not parse SVG source \u2014 your edits are still in the panel');
    codeHighlight.innerHTML = highlightXML(next);
  }
});

// Keep the highlight layer aligned when the panel is resized or re-shown.
if(typeof ResizeObserver === 'function'){
  new ResizeObserver(syncCodeScroll).observe(document.getElementById('codeEditorWrap'));
}

document.getElementById('codeTabHeader').addEventListener('click', (e)=>{
  if(e.target.id==='btnCopySvg') return;
  document.getElementById('bottomPanel').classList.toggle('collapsed');
});
document.getElementById('btnCopySvg').addEventListener('click', (e)=>{
  e.stopPropagation();
  const topLevel = doc().elements.filter(e=>!e.parentId);

  if(!navigator.clipboard || !navigator.clipboard.writeText){
    toast('Clipboard access isn\u2019t available in this browser');
    return;
  }
  navigator.clipboard.writeText(serializeSVG(doc(), topLevel))
    .then(()=>toast('SVG copied to clipboard'))
    .catch(()=>toast('Could not copy to clipboard'));
});


function matricesApproxEqual(a,b,eps){
  return Math.abs(a.a-b.a)<eps && Math.abs(a.b-b.b)<eps && Math.abs(a.c-b.c)<eps &&
    Math.abs(a.d-b.d)<eps && Math.abs(a.e-b.e)<eps && Math.abs(a.f-b.f)<eps;
}


function applyImportedTransform(el, transformAttr) {
  if (!transformAttr) return null;
  const m = parseTransformAttr(transformAttr);
  if (Matrix.isIdentity(m)) return null;
  const b = shapeLocalBounds(el);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const dec = Matrix.decompose(m);
  const flipX = dec.scaleX < 0, flipY = dec.scaleY < 0;
  const candidate = Matrix.fromRotateFlip(dec.rotation, flipX, flipY, cx, cy);
  if (matricesApproxEqual(candidate, m, 1e-3)) {
    el.rotation = round2(dec.rotation);
    el.flipX = flipX; el.flipY = flipY;
    return null;
  }
  return m;
}

function num(node, attr){ return parseFloat(node.getAttribute(attr))||0; }

function readFillOrStroke(node, attr, gradientIdRemap){
  const v = node.getAttribute(attr);
  if(!v) return null;
  const m = /^url\(#([^)]+)\)$/.exec(v.trim());
  if(m) return `url(#${gradientIdRemap.get(m[1]) || m[1]})`;
  return v;
}

function makeImportedElement(type, attrs, node, parentId, gradientIdRemap){
  const el = {
    id: uid('el'), type, name: null, parentId: parentId || null,
    attrs, style: {},
    rotation: 0, flipX: false, flipY: false,
    visible: true, locked: false,
  };
  const fill = readFillOrStroke(node, 'fill', gradientIdRemap);
  const stroke = readFillOrStroke(node, 'stroke', gradientIdRemap);
  if(fill !== null) el.style.fill = fill;
  if(stroke !== null) el.style.stroke = stroke;
  const swAttr = node.getAttribute('stroke-width');
  if(swAttr != null) el.style.strokeWidth = parseFloat(swAttr);
  const foAttr = node.getAttribute('fill-opacity');
  if(foAttr != null) el.style.fillOpacity = parseFloat(foAttr);
  const soAttr = node.getAttribute('stroke-opacity');
  if(soAttr != null) el.style.strokeOpacity = parseFloat(soAttr);
  const capAttr = node.getAttribute('stroke-linecap');
  if(capAttr != null) el.style.strokeLinecap = capAttr;
  const joinAttr = node.getAttribute('stroke-linejoin');
  if(joinAttr != null) el.style.strokeLinejoin = joinAttr;
  const dashAttr = node.getAttribute('stroke-dasharray');
  if(dashAttr != null) el.style.strokeDasharray = dashAttr;
  const dashOffAttr = node.getAttribute('stroke-dashoffset');
  if(dashOffAttr != null) el.style.strokeDashoffset = parseFloat(dashOffAttr);
  const filterAttr = node.getAttribute('filter');
  if(filterAttr != null) el.attrs.filter = filterAttr;
  return el;
}


function parseGradients(root){
  const gradients = [];
  const idRemap = new Map();
  root.querySelectorAll('linearGradient, radialGradient').forEach(node=>{
    const origId = node.getAttribute('id');
    if(!origId) return;
    const kind = node.tagName.toLowerCase()==='radialgradient' ? 'radial' : 'linear';
    const stops = Array.from(node.querySelectorAll('stop')).map(s=>({
      offset: parseFloat(s.getAttribute('offset'))||0,
      color: s.getAttribute('stop-color') || '#000000',
      opacity: s.getAttribute('stop-opacity')!=null ? parseFloat(s.getAttribute('stop-opacity')) : 1,
    }));
    if(!stops.length) return;
    const g = kind==='radial'
      ? { id: uid('grad'), kind, cx: numOr(node,'cx',0.5), cy: numOr(node,'cy',0.5), r: numOr(node,'r',0.5), stops, gradientUnits: node.getAttribute('gradientUnits') }
      : { id: uid('grad'), kind, x1: numOr(node,'x1',0), y1: numOr(node,'y1',0), x2: numOr(node,'x2',1), y2: numOr(node,'y2',0), stops, gradientUnits: node.getAttribute('gradientUnits') };
    gradients.push(g);
    idRemap.set(origId, g.id);
  });
  return { gradients, idRemap };
}
function numOr(node, attr, fallback){
  const v = node.getAttribute(attr);
  return v!=null ? parseFloat(v) : fallback;
}

function parseDefs(root){
  const defs = [];
  root.querySelectorAll('filter').forEach(node=>{
    defs.push({ type: 'filter', id: node.getAttribute('id'), html: node.outerHTML });
  });
  root.querySelectorAll('pattern').forEach(node=>{
    defs.push({ type: 'pattern', id: node.getAttribute('id'), html: node.outerHTML });
  });
  return defs;
}

const MAX_USE_DEPTH = 8;

function importSVGSource(src, keepView){

  assertNoDangerousXmlDeclarations(src);
  const parser = new DOMParser();
  const parsed = parser.parseFromString(src, 'image/svg+xml');
  if(parsed.querySelector('parsererror')) throw new Error('parse error');
  const root = parsed.documentElement;
  sanitizeElementTree(root);

  const { gradients, idRemap: gradientIdRemap } = parseGradients(root);


  const byId = new Map();
  root.querySelectorAll('[id]').forEach(n=>{ if(!byId.has(n.getAttribute('id'))) byId.set(n.getAttribute('id'), n); });

  const newElements = [];

  function pushLeafWithTransform(el, transformAttr){
    const overflowMatrix = applyImportedTransform(el, transformAttr);
    if(overflowMatrix){
      const wrapper = createGroup(el.parentId);
      wrapper.transform = overflowMatrix;
      el.parentId = wrapper.id;
      newElements.push(wrapper);
    }
    newElements.push(el);
  }

  function convertOneNode(child, parentId, ancestorIds){
    const tag = child.tagName.toLowerCase();
    if(tag==='g'){

      const group = createGroup(parentId);
      group.transform = parseTransformAttr(child.getAttribute('transform'));
      newElements.push(group);
      walk(child, group.id, ancestorIds);
    } else if(tag==='rect'){
      const rx = parseFloat(child.getAttribute('rx'))||0;
      const el = makeImportedElement(rx>0?'rrect':'rect', {
        x:num(child,'x'), y:num(child,'y'), width:num(child,'width'), height:num(child,'height'),
        rx, ry: parseFloat(child.getAttribute('ry'))||rx
      }, child, parentId, gradientIdRemap);
      pushLeafWithTransform(el, child.getAttribute('transform'));
    } else if(tag==='circle'){
      const el = makeImportedElement('circle', { cx:num(child,'cx'), cy:num(child,'cy'), r:num(child,'r') }, child, parentId, gradientIdRemap);
      pushLeafWithTransform(el, child.getAttribute('transform'));
    } else if(tag==='ellipse'){
      const el = makeImportedElement('ellipse', { cx:num(child,'cx'), cy:num(child,'cy'), rx:num(child,'rx'), ry:num(child,'ry') }, child, parentId, gradientIdRemap);
      pushLeafWithTransform(el, child.getAttribute('transform'));
    } else if(tag==='line'){
      const el = makeImportedElement('line', { x1:num(child,'x1'), y1:num(child,'y1'), x2:num(child,'x2'), y2:num(child,'y2') }, child, parentId, gradientIdRemap);
      pushLeafWithTransform(el, child.getAttribute('transform'));
    } else if(tag==='polygon' || tag==='polyline'){
      const pts = (child.getAttribute('points')||'').trim().split(/\s+/).filter(Boolean).map(pair=>{
        const [x,y] = pair.split(',').map(parseFloat); return {x:x||0,y:y||0};
      });
      const el = makeImportedElement(tag, { points:pts }, child, parentId, gradientIdRemap);
      pushLeafWithTransform(el, child.getAttribute('transform'));
    } else if(tag==='path'){
      const cmds = parseDToCommands(child.getAttribute('d')||'');
      const el = makeImportedElement('path', { commands:cmds }, child, parentId, gradientIdRemap);
      pushLeafWithTransform(el, child.getAttribute('transform'));
    } else if(tag==='text'){

      const fontWeight = child.getAttribute('font-weight');
      const fontStyle = child.getAttribute('font-style');
      const textAnchor = child.getAttribute('text-anchor');
      const letterSpacingAttr = child.getAttribute('letter-spacing');
      const el = makeImportedElement('text', {
        x:num(child,'x'), y:num(child,'y'), fontSize: parseFloat(child.getAttribute('font-size'))||16,
        fontFamily: child.getAttribute('font-family')||'ui-monospace, monospace', content: child.textContent,
        ...(fontWeight ? { fontWeight } : {}),
        ...(fontStyle ? { fontStyle } : {}),
        ...(textAnchor ? { textAnchor } : {}),
        ...(letterSpacingAttr!=null ? { letterSpacing: parseFloat(letterSpacingAttr)||0 } : {}),
      }, child, parentId, gradientIdRemap);
      pushLeafWithTransform(el, child.getAttribute('transform'));
    } else if(tag==='use'){
      convertUse(child, parentId, ancestorIds);
    }
  }


  function convertUse(useNode, parentId, ancestorIds){
    const href = useNode.getAttribute('href') || useNode.getAttribute('xlink:href');
    if(!href || href[0]!=='#') return;
    const targetId = href.slice(1);
    if(ancestorIds.has(targetId) || ancestorIds.size >= MAX_USE_DEPTH) return;
    const target = byId.get(targetId);
    if(!target || target === useNode) return;
    const tag = target.tagName.toLowerCase();
    if(!['g','symbol','rect','circle','ellipse','line','polygon','polyline','path','text','use'].includes(tag)) return;


    const ux = num(useNode,'x'), uy = num(useNode,'y');
    const useTransform = Matrix.multiply(parseTransformAttr(useNode.getAttribute('transform')), Matrix.translate(ux,uy));
    const wrapper = createGroup(parentId);
    wrapper.transform = useTransform;
    newElements.push(wrapper);

    const nextAncestors = new Set(ancestorIds);
    nextAncestors.add(targetId);

    if(tag==='use'){
      convertUse(target, wrapper.id, nextAncestors);
    } else if(tag==='g' || tag==='symbol'){
      walk(target, wrapper.id, nextAncestors);
    } else {
      convertOneNode(target, wrapper.id, nextAncestors);
    }
  }

  function walk(node, parentId, ancestorIds){
    Array.from(node.children).forEach(child=>{
      const tag = child.tagName.toLowerCase();

      if(tag==='defs' || tag==='symbol' || tag==='title' || tag==='desc') return;
      convertOneNode(child, parentId, ancestorIds);
    });
  }
  walk(root, null, new Set());

  const newDoc = createDocument();
  newDoc.elements = newElements;
  newDoc.defs = [...gradients, ...parseDefs(root)];
  const rootAttrs = {};
  for(const attr of root.attributes){
    rootAttrs[attr.name] = attr.value;
  }
  newDoc.rootAttrs = rootAttrs;
  const rootTitle = root.querySelector('title');
  const rootDesc = root.querySelector('desc');
  if(rootTitle) newDoc.metadata.title = rootTitle.textContent;
  if(rootDesc) newDoc.metadata.desc = rootDesc.textContent;
  const importedViewBox = root.getAttribute('viewBox');
  if(importedViewBox){
    const parts = importedViewBox.trim().split(/[\s,]+/).map(Number);
    if(parts.length===4 && parts.every(n=>isFinite(n))){
      newDoc.viewBox = { x:parts[0], y:parts[1], width:parts[2], height:parts[3] };
      newDoc.width = parts[2]; newDoc.height = parts[3];
      // Keep autoFitViewBox = true so the viewBox expands to fit content
      // that is larger than the imported viewBox.
    }
  }
  replaceDocument(newDoc);
  if(!keepView){
    const topLevel = newDoc.elements.filter(e=>!e.parentId);
    fitToContent(topLevel.length ? computeContentBounds(newDoc, topLevel) : null);
  }
  renderAll();
}

export function importSVGSourceExternal(src, keepView){
  importSVGSource(src, keepView);
}

document.getElementById('btnImport').addEventListener('click', ()=>document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{ importSVGSource(reader.result, false); toast('SVG imported'); }
    catch(err){ toast('Failed to import SVG'); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

function getExportElements(){
  const chk = document.getElementById('chkExportSelection');
  if(chk && chk.checked){
    const sel = state.selection.map(id=>getElement(doc(), id)).filter(Boolean);
    if(sel.length === 0){
      toast('No elements selected');
      return null;
    }
    return sel;
  }
  return doc().elements.filter(e=>!e.parentId);
}

function exportPng(elements){
  const src = serializeSVG(doc(), elements);
  const svgBlob = new Blob([src], {type:'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = ()=>{
    // Prefer the explicit width/height the serialiser wrote into the SVG;
    // img.width/height are unreliable for SVG blobs in several browsers.
    const w = Math.max(1, Math.round(img.naturalWidth || img.width || doc().width || 800));
    const h = Math.max(1, Math.round(img.naturalHeight || img.height || doc().height || 600));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    canvas.toBlob(blob=>{
      URL.revokeObjectURL(url);
      if(!blob){ toast('PNG export failed'); return; }
      const pngUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = pngUrl; a.download = 'drawing.png';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(pngUrl);
      toast('PNG exported');
    }, 'image/png');
  };
  img.onerror = ()=>{
    URL.revokeObjectURL(url);
    toast('PNG export failed');
  };
  img.src = url;
}

function doExport(format){
  const elements = getExportElements();
  if(!elements) return;
  if(format === 'png'){
    exportPng(elements);
    return;
  }
  const src = serializeSVG(doc(), elements);
  const blob = new Blob([src], {type:'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'drawing.svg';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('SVG exported');
}

document.getElementById('btnExport').addEventListener('click', (e)=>{
  e.stopPropagation();
  const btn = document.getElementById('btnExport');
  const menu = document.getElementById('exportMenu');
  const show = !menu.classList.contains('show');
  document.querySelectorAll('.dropdown-menu.show').forEach(m=>m.classList.remove('show'));
  if(show){
    const rect = btn.getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.top + rect.height + 6) + 'px';
    menu.classList.add('show');
  }
});
document.getElementById('exportMenuSvg').addEventListener('click', (e)=>{
  e.stopPropagation();
  document.getElementById('exportMenu').classList.remove('show');
  doExport('svg');
});
document.getElementById('exportMenuPng').addEventListener('click', (e)=>{
  e.stopPropagation();
  document.getElementById('exportMenu').classList.remove('show');
  doExport('png');
});
document.getElementById('chkExportSelection').addEventListener('change', (e)=>{
  e.stopPropagation();
});

// Close dropdown when clicking outside
document.addEventListener('click', (e)=>{
  const menu = document.getElementById('exportMenu');
  const btn = document.getElementById('btnExport');
  if(menu && btn && !menu.contains(e.target) && e.target !== btn){
    menu.classList.remove('show');
  }
});

/* --- Editor Themes & Canvas Background --- */
const THEME_KEY = 'neryxsvg:theme';
const CANVAS_BG_KEY = 'neryxsvg:canvasBg';
const CANVAS_COLOR_KEY = 'neryxsvg:canvasColor';
const GRID_STYLE_KEY = 'neryxsvg:gridStyle';
const GRID_VISIBLE_KEY = 'neryxsvg:gridVisible';
const GRID_SIZE_KEY = 'neryxsvg:gridSize';
const SNAP_KEY = 'neryxsvg:snap';
const CODE_PANEL_KEY = 'neryxsvg:codePanel';

const selTheme = document.getElementById('selTheme');
const selCanvasBg = document.getElementById('selCanvasBg');
const selCanvasColor = document.getElementById('selCanvasColor');
const chkGrid = document.getElementById('chkGrid');
const selGridStyle = document.getElementById('selGridStyle');
const chkSnap = document.getElementById('chkSnap');
const gridSizeInput = document.getElementById('gridSizeInput');
const chkCodePanel = document.getElementById('chkCodePanel');
const canvasScroll = document.getElementById('canvasScroll');

// Resolve localStorage lazily against `window`. Reaching for a bare
// `localStorage` identifier throws in non-browser contexts (and in jsdom-based
// tests), and the try/catch below would silently swallow it, losing every
// preference without any visible error.
function lsStore(){
  try{ return (typeof window !== 'undefined' && window.localStorage) || null; }
  catch(e){ return null; }
}
function lsGet(key, def){
  const store = lsStore();
  if(!store) return def;
  try{ const v = store.getItem(key); return v != null ? v : def; }catch(e){ return def; }
}
function lsSet(key, val){
  const store = lsStore();
  if(!store) return;
  try{ store.setItem(key, val); }catch(e){}
}

// Only touch the theme class so unrelated body classes survive.
function applyTheme(theme){
  const wanted = theme && theme !== 'dark' ? 'theme-' + theme : '';
  Array.from(document.body.classList)
    .filter(c=>c.indexOf('theme-') === 0 && c !== wanted)
    .forEach(c=>document.body.classList.remove(c));
  if(wanted && !document.body.classList.contains(wanted)) document.body.classList.add(wanted);
  lsSet(THEME_KEY, theme || 'dark');
}

// Drive the canvas background through the .bg-* / .grid-* classes that already
// exist in editor.css instead of writing inline styles, so the values stay
// theme-aware and the stylesheet remains the single source of truth.
const CANVAS_BG_CLASSES = ['bg-transparent','bg-white','bg-black','bg-grey'];
const GRID_STYLE_CLASSES = ['grid-squares','grid-dots','grid-none'];

function applyCanvasBg(bg){
  const gridStyle = selGridStyle.value;
  const color = lsGet(CANVAS_COLOR_KEY, '#0a0d10');

  canvasScroll.classList.remove(...CANVAS_BG_CLASSES, ...GRID_STYLE_CLASSES);
  canvasScroll.classList.add('bg-' + (bg || 'transparent'));
  canvasScroll.classList.add('grid-' + (gridStyle || 'squares'));

  // Custom colour is the one value the stylesheet can't express, so set it
  // directly on the element and let the class handle the image layers.
  if(bg === 'custom') canvasScroll.style.backgroundColor = color;
  else canvasScroll.style.removeProperty('background-color');

  lsSet(CANVAS_BG_KEY, bg || 'transparent');
  lsSet(GRID_STYLE_KEY, gridStyle || 'squares');
  selCanvasColor.style.display = bg === 'custom' ? 'inline-block' : 'none';
}

// Grid visibility and snap live on `state` — that's what Navigation.js and
// Interaction.js actually read. Mirror them into the DOM and localStorage.
function applyGridVisible(visible){
  state.gridVisible = !!visible;
  const gridLayer = document.getElementById('gridLayer');
  if(gridLayer) gridLayer.style.display = visible ? '' : 'none';
  lsSet(GRID_VISIBLE_KEY, visible ? '1' : '0');
}

function applySnap(enabled){
  state.snap = !!enabled;
  lsSet(SNAP_KEY, enabled ? '1' : '0');
}

function applyGridSize(value){
  const n = Math.max(0.1, parseFloat(value) || 10);
  state.document.settings.gridSize = n;
  lsSet(GRID_SIZE_KEY, String(n));
  return n;
}

function applyCodePanel(visible){
  const bottomPanel = document.getElementById('bottomPanel');
  if(visible){
    bottomPanel.classList.remove('collapsed');
  } else {
    bottomPanel.classList.add('collapsed');
  }
  lsSet(CODE_PANEL_KEY, visible ? '1' : '0');
}

// Load saved preferences. Order matters: the colour must be restored before
// applyCanvasBg() runs so the custom swatch is correct on first paint.
const savedTheme = lsGet(THEME_KEY, 'dark');
const savedBg = lsGet(CANVAS_BG_KEY, 'transparent');
const savedGrid = lsGet(GRID_STYLE_KEY, 'squares');
const savedGridVis = lsGet(GRID_VISIBLE_KEY, '1') !== '0';
const savedSnap = lsGet(SNAP_KEY, '1') !== '0';
const savedGridSize = lsGet(GRID_SIZE_KEY, '10');
const savedCodePanel = lsGet(CODE_PANEL_KEY, '1') !== '0';

selTheme.value = savedTheme;
applyTheme(savedTheme);
selCanvasBg.value = savedBg;
selCanvasColor.value = lsGet(CANVAS_COLOR_KEY, '#0a0d10');
selGridStyle.value = savedGrid;
applyCanvasBg(savedBg);
chkGrid.checked = savedGridVis;
applyGridVisible(savedGridVis);
chkSnap.checked = savedSnap;
applySnap(savedSnap);
gridSizeInput.value = savedGridSize;
applyGridSize(savedGridSize);
chkCodePanel.checked = savedCodePanel;
applyCodePanel(savedCodePanel);

selTheme.addEventListener('change', ()=>applyTheme(selTheme.value));
selCanvasBg.addEventListener('change', ()=>applyCanvasBg(selCanvasBg.value));
selCanvasColor.addEventListener('input', ()=>{
  lsSet(CANVAS_COLOR_KEY, selCanvasColor.value);
  applyCanvasBg(selCanvasBg.value);
});
chkGrid.addEventListener('change', ()=>{
  applyGridVisible(chkGrid.checked);
  renderView();
});
selGridStyle.addEventListener('change', ()=>applyCanvasBg(selCanvasBg.value));
chkSnap.addEventListener('change', ()=>applySnap(chkSnap.checked));
gridSizeInput.addEventListener('change', ()=>{
  gridSizeInput.value = applyGridSize(gridSizeInput.value);
  renderView();
});
chkCodePanel.addEventListener('change', ()=>applyCodePanel(chkCodePanel.checked));

/* --- Settings Popup --- */
const settingsPopup = document.getElementById('settingsPopup');
const settingsClose = document.getElementById('settingsClose');
const btnSettings = document.getElementById('btnSettings');

function syncSettingsControls(){
  selTheme.value = lsGet(THEME_KEY, 'dark');
  selCanvasBg.value = lsGet(CANVAS_BG_KEY, 'transparent');
  selCanvasColor.value = lsGet(CANVAS_COLOR_KEY, '#0a0d10');
  selGridStyle.value = lsGet(GRID_STYLE_KEY, 'squares');
  chkGrid.checked = lsGet(GRID_VISIBLE_KEY, '1') !== '0';
  chkSnap.checked = lsGet(SNAP_KEY, '1') !== '0';
  gridSizeInput.value = lsGet(GRID_SIZE_KEY, '10');
  chkCodePanel.checked = lsGet(CODE_PANEL_KEY, '1') !== '0';
  selCanvasColor.style.display = selCanvasBg.value === 'custom' ? 'inline-block' : 'none';
}

let settingsReturnFocus = null;

function openSettings(){
  syncSettingsControls();
  settingsReturnFocus = document.activeElement;
  settingsPopup.classList.add('show');
  settingsPopup.removeAttribute('aria-hidden');
  const first = settingsPopup.querySelector('select, input, button');
  if(first) first.focus();
}
function closeSettings(){
  settingsPopup.classList.remove('show');
  settingsPopup.setAttribute('aria-hidden', 'true');
  if(settingsReturnFocus && settingsReturnFocus.isConnected) settingsReturnFocus.focus();
  settingsReturnFocus = null;
}

btnSettings.addEventListener('click', (e)=>{
  e.stopPropagation();
  openSettings();
});
settingsClose.addEventListener('click', closeSettings);

// Close settings when clicking outside, or on Escape.
settingsPopup.addEventListener('click', (e)=>{
  if(e.target === settingsPopup) closeSettings();
});
window.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && settingsPopup.classList.contains('show')) closeSettings();
});

/* --- Description Popup --- */
const POPUP_KEY = 'neryxsvg:popupShown';
const popup = document.getElementById('descriptionPopup');
const popupClose = document.getElementById('popupClose');
const popupDontShow = document.getElementById('popupDontShow');

function showDescriptionPopup(){
  if(lsGet(POPUP_KEY, '0') === '1') return;
  popup.classList.add('show');
  popup.removeAttribute('aria-hidden');
  const first = popup.querySelector('button, input');
  if(first) first.focus();
}
function hideDescriptionPopup(){
  popup.classList.remove('show');
  popup.setAttribute('aria-hidden', 'true');
  if(popupDontShow.checked){
    lsSet(POPUP_KEY, '1');
  }
}

popupClose.addEventListener('click', hideDescriptionPopup);
popupDontShow.addEventListener('change', ()=>{
  if(popupDontShow.checked) lsSet(POPUP_KEY, '1');
});
window.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && popup.classList.contains('show')) hideDescriptionPopup();
});

// Show popup after a short delay so the UI is visible first
setTimeout(showDescriptionPopup, 300);
