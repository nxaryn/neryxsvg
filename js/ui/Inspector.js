import { state } from '../app/State.js';
import { getElement } from '../document/Element.js';
import { snapshotElements, makeSetPropsCommand, makeReplaceDefsCommand } from '../document/Commands.js';
import * as History from '../document/History.js';
import { parseDToCommands, pathToD, pathAllPoints } from '../svg/PathParser.js';
import { renderAll } from '../app/renderAll.js';
import { renderElements } from '../canvas/Renderer.js';
import { rotateElementsBy, flipElements, resetElementTransform, setRotation } from '../canvas/Interaction.js';
import {
  createLinearGradient, createRadialGradient, getGradient, gradientIdFromRef,
  refFromGradientId, isGradientRef, pruneUnusedGradients,
} from '../document/Gradients.js';

function doc(){ return state.document; }
function round2(n){ return Math.round(n*100)/100; }
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), 1400);
}

function commit(ids, before, after){
  History.push(state.history, makeSetPropsCommand(doc(), before, after));}

/* --- Google Fonts browsing --- */
const loadedFonts = new Set();

// Curated list of popular Google Fonts (no API key needed for browsing;
// fonts are loaded on demand via the Google Fonts CSS API).
const GOOGLE_FONTS = [
  'Roboto','Open Sans','Lato','Montserrat','Oswald','Source Sans Pro','Raleway',
  'PT Sans','Ubuntu','Nunito','Poppins','Playfair Display','Merriweather','Lora',
  'Cormorant Garamond','Libre Baskerville','Crimson Pro','Spectral','Trocchi',
  'Bitter','Cabin','Fira Sans','Muli','Noto Sans','Quicksand','Varela Round',
  'Zilla Slab','Karla','Hind','Maven Pop','Work Sans','Inter','Rubik','Manrope',
  'Barlow','Heebo','Tajawal','Almarai','Cairo','Teko','Rajdhani','Baloo 2'
];

const fontBrowser = document.getElementById('fontBrowserPopup');
const fontListEl = document.getElementById('fontList');
const fontSearch = document.getElementById('fontSearch');
const fontStatus = document.getElementById('fontLoadStatus');
const fontBrowserClose = document.getElementById('fontBrowserClose');
let fontBrowserTargetId = null;

function openFontBrowser(elId){
  fontBrowserTargetId = elId;
  fontSearch.value = '';
  fontStatus.textContent = '';
  renderFontList(GOOGLE_FONTS);
  fontBrowser.classList.add('show');
  fontBrowser.removeAttribute('aria-hidden');
  fontSearch.focus();
}
function closeFontBrowser(){
  fontBrowser.classList.remove('show');
  fontBrowser.setAttribute('aria-hidden', 'true');
  fontBrowserTargetId = null;
}
function renderFontList(fonts){
  fontListEl.innerHTML = '';
  fonts.forEach(family=>{
    const item = document.createElement('div');
    item.className = 'font-item';
    item.setAttribute('role','option');
    item.tabIndex = 0;
    const preview = document.createElement('div');
    preview.className = 'font-preview';
    preview.textContent = 'Abc';
    preview.style.fontFamily = family;
    const name = document.createElement('div');
    name.className = 'font-name';
    name.textContent = family;
    item.appendChild(preview);
    item.appendChild(name);
    item.addEventListener('click', ()=>selectFont(family));
    item.addEventListener('keydown', (e)=>{
      if(e.key==='Enter' || e.key===' ') selectFont(family);
    });
    fontListEl.appendChild(item);
  });
}
function filterFonts(){
  const q = fontSearch.value.toLowerCase();
  renderFontList(GOOGLE_FONTS.filter(f=>f.toLowerCase().includes(q)));
}
function loadFont(family){
  if(loadedFonts.has(family)) return Promise.resolve();
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family.replace(/ /g,'+'))}:wght@400,700&display=swap`;
  return new Promise((resolve,reject)=>{
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.onload = ()=>{ loadedFonts.add(family); resolve(); };
    link.onerror = reject;
    document.head.appendChild(link);
  });
}
function selectFont(family){
  if(!fontBrowserTargetId) return;
  loadFont(family).then(()=>{
    const el = getElement(doc(), fontBrowserTargetId);
    if(!el) return;
    const before = snapshotElements(doc(), [el.id]);
    el.attrs.fontFamily = family;
    const after = snapshotElements(doc(), [el.id]);
    commit([el.id], before, after);
    renderAll();
    const ffField = document.getElementById('field-fontFamily');
    if(ffField) ffField.value = family;
    fontStatus.textContent = `Loaded ${family}`;
    fontStatus.className = 'font-status font-loaded';
    closeFontBrowser();
  }).catch(()=>{
    fontStatus.textContent = `Failed to load ${family}`;
    fontStatus.className = 'font-status font-loading';
  });
}

fontSearch.addEventListener('input', filterFonts);
fontBrowserClose.addEventListener('click', closeFontBrowser);
fontBrowser.addEventListener('click', (e)=>{
  if(e.target === fontBrowser) closeFontBrowser();
});
window.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape' && fontBrowser.classList.contains('show')) closeFontBrowser();
});

function field(labelText, id, value, opts){
  opts = opts||{};




  return `<div class="field"><label for="${id}">${labelText}${opts.unit?`<span>${opts.unit}</span>`:''}</label>
  <input type="${opts.type||'number'}" id="${id}" value="${value}" ${opts.step?`step="${opts.step}"`:'step="any"'} ${opts.attrs||''}></div>`;
}

export function renderInspector(){
  const body = document.getElementById('inspectorBody');
  const typeLabel = document.getElementById('inspTypeLabel');
  const sel = state.selection.map(id=>getElement(doc(),id)).filter(Boolean);

  if(!sel.length){
    typeLabel.textContent = '';
    body.innerHTML = `<div class="insp-empty">Select an element to see its exact coordinates and properties here.</div>`;
    return;
  }

  if(sel.length>1){
    renderMultiSelection(sel, typeLabel, body);
    return;
  }

  const el = sel[0];
  if(el.type === 'group'){
    renderGroupPanel(el, typeLabel, body);
    return;
  }
  renderLeafPanel(el, typeLabel, body);
}

function renderMultiSelection(sel, typeLabel, body){
  typeLabel.textContent = sel.length+' selected';
  const ids = sel.map(e=>e.id);
  const styleBasis = sel.find(e=>e.style);
  body.innerHTML = `
    <div class="small-note">${sel.length} objects selected. Rotate/flip apply to each object individually, around its own center.</div>
    <div class="section-title">Transform (all selected)</div>
    <div class="btn-row">
      <button id="btnRotL">Rotate −90°</button>
      <button id="btnRotR">Rotate +90°</button>
    </div>
    <div class="btn-row">
      <button id="btnFlipH">Flip Horizontal</button>
      <button id="btnFlipV">Flip Vertical</button>
    </div>
    ${styleBasis ? `<div class="section-title">Style</div>${colorFields(styleBasis)}` : ''}
  `;
  if(styleBasis) wireStyleFields(sel.filter(e=>e.style));
  document.getElementById('btnRotL').onclick = ()=>rotateElementsBy(ids, -90);
  document.getElementById('btnRotR').onclick = ()=>rotateElementsBy(ids, 90);
  document.getElementById('btnFlipH').onclick = ()=>flipElements(ids, 'x');
  document.getElementById('btnFlipV').onclick = ()=>flipElements(ids, 'y');
}

function renderGroupPanel(el, typeLabel, body){
  typeLabel.textContent = 'Group';
  const childCount = doc().elements.filter(e=>e.parentId===el.id).length;
  body.innerHTML = `
    <div class="small-note">${childCount} object${childCount===1?'':'s'} in this group. Double-click the group on canvas to edit its contents.</div>
    <div class="section-title">Transform</div>
    <div class="btn-row">
      <button id="btnRotL">−90°</button><button id="btnRotR">+90°</button><button id="btnRotReset">Reset</button>
    </div>
    <div class="btn-row">
      <button id="btnFlipHs">Flip Horizontal</button>
      <button id="btnFlipVs">Flip Vertical</button>
    </div>
  `;
  document.getElementById('btnRotL').onclick = ()=>rotateElementsBy([el.id], -90);
  document.getElementById('btnRotR').onclick = ()=>rotateElementsBy([el.id], 90);
  document.getElementById('btnRotReset').onclick = ()=>resetElementTransform([el.id]);
  document.getElementById('btnFlipHs').onclick = ()=>flipElements([el.id], 'x');
  document.getElementById('btnFlipVs').onclick = ()=>flipElements([el.id], 'y');
}

function renderLeafPanel(el, typeLabel, body){
  typeLabel.textContent = leafDisplayName(el);
  let html = '';
  html += `<div class="section-title">Geometry</div>`;
  html += geometryFields(el);
  html += `<div class="section-title">Transform</div>`;
  html += `<div class="field-row triple">
    ${field('Rotation','field-rotation', round2(el.rotation), {unit:'°'})}
    <div class="field"><label id="lbl-flipH">Flip H</label><button id="btnFlipHs" class="${el.flipX?'active':''}" aria-labelledby="lbl-flipH" aria-pressed="${el.flipX}">${el.flipX?'On':'Off'}</button></div>
    <div class="field"><label id="lbl-flipV">Flip V</label><button id="btnFlipVs" class="${el.flipY?'active':''}" aria-labelledby="lbl-flipV" aria-pressed="${el.flipY}">${el.flipY?'On':'Off'}</button></div>
  </div>`;
  html += `<div class="btn-row">
    <button id="btnRotL">−90°</button><button id="btnRotR">+90°</button><button id="btnRotReset">Reset</button>
  </div>`;
  html += `<div class="section-title">Style</div>`;
  html += fillSectionHTML(el);
  html += strokeSectionHTML(el);

  body.innerHTML = html;
  wireGeometryFields(el);
  wireFillSection(el);
  wireStrokeSection(el);

  document.getElementById('field-rotation').addEventListener('change', (e)=>{
    setRotation(el.id, parseFloat(e.target.value)||0);
  });
  document.getElementById('field-rotation').addEventListener('input', (e)=>{
    el.rotation = parseFloat(e.target.value)||0;
    renderElementsOnly();
  });
  document.getElementById('btnFlipHs').onclick = ()=>flipElements([el.id], 'x');
  document.getElementById('btnFlipVs').onclick = ()=>flipElements([el.id], 'y');
  document.getElementById('btnRotL').onclick = ()=>rotateElementsBy([el.id], -90);
  document.getElementById('btnRotR').onclick = ()=>rotateElementsBy([el.id], 90);
  document.getElementById('btnRotReset').onclick = ()=>resetElementTransform([el.id]);
}

function leafDisplayName(el){
  const map = { rect:'Rectangle', rrect:'Rounded Rect', circle:'Circle', ellipse:'Ellipse',
    line:'Line', polygon:'Polygon', polyline:'Polyline', path:'Path', text:'Text', raw:'Imported' };
  return el.name || map[el.type] || el.type;
}

function colorFields(el){
  return `<div class="field-row">
    <div class="field"><label id="lbl-fill">Fill</label><div class="color-row"><input type="color" id="field-fill" class="swatch" aria-labelledby="lbl-fill" value="${toHex(el.style.fill)}"><input type="text" id="field-fillText" aria-label="Fill color (hex)" value="${el.style.fill}"></div></div>
    <div class="field"><label id="lbl-stroke">Stroke</label><div class="color-row"><input type="color" id="field-stroke" class="swatch" aria-labelledby="lbl-stroke" value="${toHex(el.style.stroke)}"><input type="text" id="field-strokeText" aria-label="Stroke color (hex)" value="${el.style.stroke}"></div></div>
  </div>
  <div class="field-row">
    ${field('Stroke Width','field-strokeWidth', el.style.strokeWidth)}
    ${field('Fill Opacity','field-fillOpacity', el.style.fillOpacity!=null?el.style.fillOpacity:1, {step:'0.05'})}
  </div>`;
}
function toHex(c){
  if(!c || c==='none') return '#000000';
  if(c[0]==='#') return c.length===7? c : '#000000';
  return '#4fd1c5';
}
function wireStyleFields(sel){
  const ids = sel.map(e=>e.id);
  const set = (fn)=>{
    const before = snapshotElements(doc(), ids);
    sel.forEach(fn);
    const after = snapshotElements(doc(), ids);
    commit(ids, before, after);
    renderAll();
  };
  const fill = document.getElementById('field-fill');
  const fillText = document.getElementById('field-fillText');
  const stroke = document.getElementById('field-stroke');
  const strokeText = document.getElementById('field-strokeText');
  const sw = document.getElementById('field-strokeWidth');
  const fo = document.getElementById('field-fillOpacity');
  if(fill) fill.addEventListener('input', ()=>{ sel.forEach(e=>e.style.fill=fill.value); renderElementsOnly(); if(fillText) fillText.value=fill.value; });
  if(fill) fill.addEventListener('change', ()=>set(e=>e.style.fill=fill.value));
  if(fillText) fillText.addEventListener('change', ()=>set(e=>e.style.fill=fillText.value));
  if(stroke) stroke.addEventListener('input', ()=>{ sel.forEach(e=>e.style.stroke=stroke.value); renderElementsOnly(); if(strokeText) strokeText.value=stroke.value; });
  if(stroke) stroke.addEventListener('change', ()=>set(e=>e.style.stroke=stroke.value));
  if(strokeText) strokeText.addEventListener('change', ()=>set(e=>e.style.stroke=strokeText.value));
  if(sw) sw.addEventListener('change', ()=>set(e=>e.style.strokeWidth=parseFloat(sw.value)||0));
  if(fo) fo.addEventListener('change', ()=>set(e=>e.style.fillOpacity=parseFloat(fo.value)));
}






function fillTypeOf(el){
  if(!isGradientRef(el.style.fill)) return 'solid';
  const g = getGradient(doc(), gradientIdFromRef(el.style.fill));
  return g ? g.kind : 'solid';
}

function fillSectionHTML(el){
  const kind = fillTypeOf(el);
  let html = `<div class="field-row">
    <div class="field"><label for="field-fillType">Fill Type</label>
      <select id="field-fillType">
        <option value="solid"${kind==='solid'?' selected':''}>Solid</option>
        <option value="linear"${kind==='linear'?' selected':''}>Linear Gradient</option>
        <option value="radial"${kind==='radial'?' selected':''}>Radial Gradient</option>
      </select>
    </div>
  </div>`;
  if(kind==='solid'){
    html += `<div class="field-row">
      <div class="field"><label id="lbl-fill">Fill</label><div class="color-row"><input type="color" id="field-fill" class="swatch" aria-labelledby="lbl-fill" value="${toHex(el.style.fill)}"><input type="text" id="field-fillText" aria-label="Fill color (hex)" value="${el.style.fill}"></div></div>
      ${field('Fill Opacity','field-fillOpacity', el.style.fillOpacity!=null?el.style.fillOpacity:1, {step:'0.05'})}
    </div>`;
  } else {
    const grad = getGradient(doc(), gradientIdFromRef(el.style.fill));
    html += gradientEditorHTML(grad, kind);
  }
  return html;
}

function gradientEditorHTML(grad, kind){
  if(!grad) return '<div class="small-note">Gradient data missing.</div>';
  let html = `<div class="small-note">${grad.stops.length} stops. Position values are fractions (0–1) of the shape's own bounding box.</div>`;
  if(kind==='radial'){
    html += `<div class="field-row">${field('Center X','field-grad-cx',grad.cx,{step:'0.01'})}${field('Center Y','field-grad-cy',grad.cy,{step:'0.01'})}</div>
    <div class="field-row single">${field('Radius','field-grad-r',grad.r,{step:'0.01'})}</div>`;
  } else {
    html += `<div class="field-row">${field('X1','field-grad-x1',grad.x1,{step:'0.01'})}${field('Y1','field-grad-y1',grad.y1,{step:'0.01'})}</div>
    <div class="field-row">${field('X2','field-grad-x2',grad.x2,{step:'0.01'})}${field('Y2','field-grad-y2',grad.y2,{step:'0.01'})}</div>`;
  }
  grad.stops.forEach((s,i)=>{
    html += `<div class="pt-row">
      <span class="idx">${i}</span>
      <input type="color" class="grad-stop-color" data-idx="${i}" value="${toHex(s.color)}">
      <input type="number" step="0.05" min="0" max="1" class="grad-stop-offset" data-idx="${i}" value="${s.offset}">
      <button class="grad-stop-del" data-idx="${i}" title="Remove stop">✕</button>
    </div>`;
  });
  html += `<button id="btnAddStop" style="width:100%;margin-top:4px;">+ Add Stop</button>`;
  return html;
}

function strokeSectionHTML(el){
  const s = el.style;
  return `<div class="field-row">
    <div class="field"><label id="lbl-stroke">Stroke</label><div class="color-row"><input type="color" id="field-stroke" class="swatch" aria-labelledby="lbl-stroke" value="${toHex(s.stroke)}"><input type="text" id="field-strokeText" aria-label="Stroke color (hex)" value="${s.stroke}"></div></div>
    ${field('Stroke Width','field-strokeWidth', s.strokeWidth)}
  </div>
  <div class="field-row">
    ${field('Stroke Opacity','field-strokeOpacity', s.strokeOpacity!=null?s.strokeOpacity:1, {step:'0.05'})}
    <div class="field"><label for="field-strokeLinecap">Line Cap</label>
      <select id="field-strokeLinecap">
        <option value="butt"${s.strokeLinecap==='butt'?' selected':''}>Butt</option>
        <option value="round"${s.strokeLinecap==='round'?' selected':''}>Round</option>
        <option value="square"${s.strokeLinecap==='square'?' selected':''}>Square</option>
      </select>
    </div>
  </div>
  <div class="field-row">
    <div class="field"><label for="field-strokeLinejoin">Line Join</label>
      <select id="field-strokeLinejoin">
        <option value="miter"${s.strokeLinejoin==='miter'?' selected':''}>Miter</option>
        <option value="round"${s.strokeLinejoin==='round'?' selected':''}>Round</option>
        <option value="bevel"${s.strokeLinejoin==='bevel'?' selected':''}>Bevel</option>
      </select>
    </div>
    ${field('Dash Offset','field-strokeDashoffset', s.strokeDashoffset||0)}
  </div>
  <div class="field-row single">
    <div class="field"><label>Dash Pattern<span>e.g. 4,2 — blank for solid</span></label><input type="text" id="field-strokeDasharray" value="${escapeAttr(s.strokeDasharray||'')}"></div>
  </div>`;
}

function commitDefsChange(mutateFn){
  const before = doc().defs;
  mutateFn();
  const after = doc().defs;
  History.push(state.history, makeReplaceDefsCommand(doc(), before, after));
  renderAll();
}

function wireFillSection(el){
  const typeSel = document.getElementById('field-fillType');
  if(typeSel) typeSel.addEventListener('change', ()=>{
    const newKind = typeSel.value;
    const before = snapshotElements(doc(), [el.id]);
    const beforeDefs = doc().defs;
    if(newKind==='solid'){
      el.style.fill = '#4fd1c5';
    } else {
      const grad = newKind==='radial' ? createRadialGradient() : createLinearGradient();
      doc().defs = (doc().defs||[]).concat([grad]);
      el.style.fill = refFromGradientId(grad.id);
    }
    pruneUnusedGradients(doc());
    const after = snapshotElements(doc(), [el.id]);





    commit([el.id], before, after);
    History.push(state.history, makeReplaceDefsCommand(doc(), beforeDefs, doc().defs));
    renderAll();
  });

  if(fillTypeOf(el)==='solid'){
    const fill = document.getElementById('field-fill');
    const fillText = document.getElementById('field-fillText');
    const fo = document.getElementById('field-fillOpacity');
    const commitFill = ()=>{
      const before = snapshotElements(doc(), [el.id]);
      return ()=>{ const after = snapshotElements(doc(), [el.id]); commit([el.id], before, after); renderAll(); };
    };
    if(fill) fill.addEventListener('input', ()=>{ el.style.fill=fill.value; renderElementsOnly(); if(fillText) fillText.value=fill.value; });
    if(fill) fill.addEventListener('change', ()=>{ const c=commitFill(); c(); });
    if(fillText) fillText.addEventListener('change', ()=>{ const c=commitFill(); el.style.fill=fillText.value; c(); });
    if(fo) fo.addEventListener('change', ()=>{ const c=commitFill(); el.style.fillOpacity=parseFloat(fo.value); c(); });
  } else {
    const grad = getGradient(doc(), gradientIdFromRef(el.style.fill));
    if(grad) wireGradientFields(grad);
  }
}

function wireGradientFields(grad){
  const bindGradNum = (id, key)=>{
    const input = document.getElementById(id);
    if(!input) return;
    input.addEventListener('change', ()=>{
      commitDefsChange(()=>{ grad[key] = parseFloat(input.value)||0; });
    });
  };
  bindGradNum('field-grad-cx','cx'); bindGradNum('field-grad-cy','cy'); bindGradNum('field-grad-r','r');
  bindGradNum('field-grad-x1','x1'); bindGradNum('field-grad-y1','y1');
  bindGradNum('field-grad-x2','x2'); bindGradNum('field-grad-y2','y2');

  document.querySelectorAll('.grad-stop-color').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      commitDefsChange(()=>{ grad.stops[+inp.dataset.idx].color = inp.value; });
    });
  });
  document.querySelectorAll('.grad-stop-offset').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      commitDefsChange(()=>{ grad.stops[+inp.dataset.idx].offset = Math.max(0, Math.min(1, parseFloat(inp.value)||0)); });
    });
  });
  document.querySelectorAll('.grad-stop-del').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(grad.stops.length<=2) return;
      commitDefsChange(()=>{ grad.stops.splice(+btn.dataset.idx,1); });
    });
  });
  const addBtn = document.getElementById('btnAddStop');
  if(addBtn) addBtn.addEventListener('click', ()=>{
    commitDefsChange(()=>{ grad.stops.push({ offset:1, color:'#ffffff', opacity:1 }); });
  });
}

function wireStrokeSection(el){
  const stroke = document.getElementById('field-stroke');
  const strokeText = document.getElementById('field-strokeText');
  const sw = document.getElementById('field-strokeWidth');
  const commitStroke = ()=>{
    const before = snapshotElements(doc(), [el.id]);
    return ()=>{ const after = snapshotElements(doc(), [el.id]); commit([el.id], before, after); renderAll(); };
  };
  if(stroke) stroke.addEventListener('input', ()=>{ el.style.stroke=stroke.value; renderElementsOnly(); if(strokeText) strokeText.value=stroke.value; });
  if(stroke) stroke.addEventListener('change', ()=>{ const c=commitStroke(); c(); });
  if(strokeText) strokeText.addEventListener('change', ()=>{ const c=commitStroke(); el.style.stroke=strokeText.value; c(); });
  if(sw) sw.addEventListener('change', ()=>{ const c=commitStroke(); el.style.strokeWidth=parseFloat(sw.value)||0; c(); });

  const so = document.getElementById('field-strokeOpacity');
  const cap = document.getElementById('field-strokeLinecap');
  const join = document.getElementById('field-strokeLinejoin');
  const dashArr = document.getElementById('field-strokeDasharray');
  const dashOff = document.getElementById('field-strokeDashoffset');
  if(so) so.addEventListener('change', ()=>{ const c=commitStroke(); el.style.strokeOpacity=Math.max(0,Math.min(1,parseFloat(so.value)||0)); c(); });
  if(cap) cap.addEventListener('change', ()=>{ const c=commitStroke(); el.style.strokeLinecap=cap.value; c(); });
  if(join) join.addEventListener('change', ()=>{ const c=commitStroke(); el.style.strokeLinejoin=join.value; c(); });
  if(dashArr) dashArr.addEventListener('change', ()=>{ const c=commitStroke(); el.style.strokeDasharray=dashArr.value.trim(); c(); });
  if(dashOff) dashOff.addEventListener('change', ()=>{ const c=commitStroke(); el.style.strokeDashoffset=parseFloat(dashOff.value)||0; c(); });
}

function geometryFields(el){
  switch(el.type){
    case 'rect': case 'rrect':
      return `<div class="field-row">${field('X','field-x',round2(el.attrs.x))}${field('Y','field-y',round2(el.attrs.y))}</div>
      <div class="field-row">${field('Width','field-width',round2(el.attrs.width))}${field('Height','field-height',round2(el.attrs.height))}</div>
      ${el.type==='rrect'? `<div class="field-row">${field('Corner Radius X','field-rx',round2(el.attrs.rx||0))}${field('Corner Radius Y','field-ry',round2(el.attrs.ry!=null?el.attrs.ry:(el.attrs.rx||0)))}</div>`:''}`;
    case 'circle':
      return `<div class="field-row">${field('Center X','field-cx',round2(el.attrs.cx))}${field('Center Y','field-cy',round2(el.attrs.cy))}</div>
      <div class="field-row single">${field('Radius','field-r',round2(el.attrs.r))}</div>`;
    case 'ellipse':
      return `<div class="field-row">${field('Center X','field-cx',round2(el.attrs.cx))}${field('Center Y','field-cy',round2(el.attrs.cy))}</div>
      <div class="field-row">${field('Radius X','field-rx',round2(el.attrs.rx))}${field('Radius Y','field-ry',round2(el.attrs.ry))}</div>`;
    case 'line':
      return `<div class="field-row">${field('X1','field-x1',round2(el.attrs.x1))}${field('Y1','field-y1',round2(el.attrs.y1))}</div>
      <div class="field-row">${field('X2','field-x2',round2(el.attrs.x2))}${field('Y2','field-y2',round2(el.attrs.y2))}</div>`;
    case 'polygon': case 'polyline':
      return pointsListHTML(el);
    case 'path':
      return pathFieldsHTML(el);
    case 'text':




      return `<div class="field-row">${field('X','field-x',round2(el.attrs.x))}${field('Y','field-y',round2(el.attrs.y))}</div>
      <div class="field-row">${field('Font Size','field-fontSize',round2(el.attrs.fontSize))}${field('Letter Spacing','field-letterSpacing',round2(el.attrs.letterSpacing||0),{step:'0.1'})}</div>
      <div class="field-row single"><div class="field"><label for="field-fontFamily">Font Family</label><div class="color-row" style="display:flex;align-items:center;gap:6px;"><input type="text" id="field-fontFamily" value="${escapeAttr(el.attrs.fontFamily||'ui-monospace, monospace')}" style="flex:1;"><button id="btnBrowseFonts" type="button" style="padding:2px 8px;font-size:11px;">Browse Google Fonts</button></div></div></div>
      <div class="field-row">
        <div class="field"><label for="field-fontWeight">Weight</label>
          <select id="field-fontWeight">
            <option value="normal"${(!el.attrs.fontWeight||el.attrs.fontWeight==='normal')?' selected':''}>Normal</option>
            <option value="bold"${el.attrs.fontWeight==='bold'?' selected':''}>Bold</option>
          </select>
        </div>
        <div class="field"><label for="field-fontStyle">Style</label>
          <select id="field-fontStyle">
            <option value="normal"${(!el.attrs.fontStyle||el.attrs.fontStyle==='normal')?' selected':''}>Normal</option>
            <option value="italic"${el.attrs.fontStyle==='italic'?' selected':''}>Italic</option>
          </select>
        </div>
      </div>
      <div class="field-row single">
        <div class="field"><label for="field-textAnchor">Alignment</label>
          <select id="field-textAnchor">
            <option value="start"${(!el.attrs.textAnchor||el.attrs.textAnchor==='start')?' selected':''}>Left</option>
            <option value="middle"${el.attrs.textAnchor==='middle'?' selected':''}>Center</option>
            <option value="end"${el.attrs.textAnchor==='end'?' selected':''}>Right</option>
          </select>
        </div>
      </div>
      <div class="field-row single"><div class="field"><label for="field-content">Content</label><input type="text" id="field-content" value="${escapeAttr(el.attrs.content||'')}"></div></div>`;
    case 'raw':
      return `<div class="small-note">Imported markup this editor doesn't have dedicated controls for yet. Edit it via the SVG Source panel below.</div>`;
  }
  return '';
}

function pointsListHTML(el){
  let html = `<div class="small-note">${el.attrs.points.length} points. Drag nodes on canvas or edit numerically.</div>`;
  el.attrs.points.forEach((p,i)=>{
    html += `<div class="pt-row">
      <span class="idx">${i}</span>
      <input type="number" step="any" class="pt-x" data-idx="${i}" value="${round2(p.x)}">
      <input type="number" step="any" class="pt-y" data-idx="${i}" value="${round2(p.y)}">
      <button class="pt-del" data-idx="${i}" title="Remove point">✕</button>
    </div>`;
  });
  html += `<button id="btnAddPoint" style="width:100%;margin-top:4px;">+ Add Point</button>`;
  return html;
}

function pathFieldsHTML(el){
  const cmds = el.attrs.commands;
  const isClosed = cmds.length>0 && cmds[cmds.length-1].type==='Z';
  let html = `<div class="small-note">${cmds.length} commands. Drag anchor/control nodes on canvas, or use the controls below to insert, smooth, or open/close nodes.</div>`;
  html += `<div class="btn-row"><button id="btnToggleClose">${isClosed?'Open Path':'Close Path'}</button></div>`;
  cmds.forEach((c,i)=>{
    const canSmooth = ('x1' in c) && i>0 && ('x2' in cmds[i-1] || 'x1' in cmds[i-1]);
    html += `<div class="cmd-block" data-idx="${i}">
      <div class="cmd-head"><span class="cmd-tag">${cmdLabel(c.type)}</span>
        <span>
          ${c.type!=='Z' ? `<button class="insert-after" data-idx="${i}" title="Insert a line node after this one">+ Node</button>` : ''}
          ${canSmooth ? `<button class="smooth-node" data-idx="${i}" title="Make this join tangent-smooth with the previous curve">Smooth</button>` : ''}
          <button class="del" data-idx="${i}">✕</button>
        </span>
      </div>
      <div class="cmd-grid">${cmdParamFields(c,i)}</div>
    </div>`;
  });
  html += `<div class="btn-row">
    <button class="addcmd" data-t="M">+ Move To (new subpath)</button>
  </div>
  <div class="btn-row">
    <button class="addcmd" data-t="L">+ Line</button>
    <button class="addcmd" data-t="H">+ Horiz</button>
    <button class="addcmd" data-t="V">+ Vert</button>
  </div>
  <div class="btn-row">
    <button class="addcmd" data-t="C">+ Cubic</button>
    <button class="addcmd" data-t="Q">+ Quadratic</button>
    <button class="addcmd" data-t="S">+ Smooth</button>
    <button class="addcmd" data-t="A">+ Arc</button>
    <button class="addcmd" data-t="Z">+ Close</button>
  </div>
  <div class="section-title">Path Data (d)</div>
  <textarea id="pathDField">${pathToD(cmds)}</textarea>`;
  return html;
}
function cmdLabel(t){
  const map = {M:'M — Move To', L:'L — Line To', H:'H — Horizontal', V:'V — Vertical', C:'C — Cubic Bézier', S:'S — Smooth Cubic', Q:'Q — Quadratic Bézier', T:'T — Smooth Quad', A:'A — Arc', Z:'Z — Close Path'};
  return map[t]||t;
}
function cmdParamFields(c,i){





  const f = (label,key)=>`<div class="field"><label>${label}</label><input type="number" step="any" class="cmd-field" data-idx="${i}" data-key="${key}" aria-label="${label} for path command ${i+1}" value="${round2(c[key])}"></div>`;
  const flag = (label,key)=>`<div class="field"><label>${label}</label><select class="cmd-flag" data-idx="${i}" data-key="${key}" aria-label="${label} for path command ${i+1}"><option value="0"${c[key]?'':' selected'}>0</option><option value="1"${c[key]?' selected':''}>1</option></select></div>`;
  switch(c.type){
    case 'M': case 'L': case 'T': return f('X','x')+f('Y','y');
    case 'H': return f('X','x');
    case 'V': return f('Y','y');
    case 'C': return f('X1','x1')+f('Y1','y1')+f('X2','x2')+f('Y2','y2')+f('X','x')+f('Y','y');
    case 'S': return f('X2','x2')+f('Y2','y2')+f('X','x')+f('Y','y');
    case 'Q': return f('X1','x1')+f('Y1','y1')+f('X','x')+f('Y','y');
    case 'A': return f('Radius X','rx')+f('Radius Y','ry')+f('X-Rotation','rotation')+flag('Large Arc','largeArc')+flag('Sweep','sweep')+f('X','x')+f('Y','y');
    case 'Z': return '<div class="small-note">No parameters.</div>';
  }
  return '';
}
function escapeAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }




function renderElementsOnly(){
  renderElements();
}

function wireGeometryFields(el){
  const liveRerender = ()=>{ renderElementsOnly(); };

  function bindNum(id, apply){
    const input = document.getElementById(id);
    if(!input) return;
    let before = null;
    input.addEventListener('focus', ()=>{ before = snapshotElements(doc(), [el.id]); });
    input.addEventListener('input', ()=>{ apply(parseFloat(input.value)||0); liveRerender(); });
    input.addEventListener('change', ()=>{
      if(!before) before = snapshotElements(doc(), [el.id]);
      const after = snapshotElements(doc(), [el.id]);
      commit([el.id], before, after);
      before = null;
      renderAll();
    });
  }

  switch(el.type){
    case 'rect': case 'rrect':
      bindNum('field-x', v=>el.attrs.x=v);
      bindNum('field-y', v=>el.attrs.y=v);
      bindNum('field-width', v=>el.attrs.width=Math.max(v,0));
      bindNum('field-height', v=>el.attrs.height=Math.max(v,0));
      if(el.type==='rrect'){ bindNum('field-rx', v=>el.attrs.rx=v); bindNum('field-ry', v=>el.attrs.ry=v); }
      break;
    case 'circle':
      bindNum('field-cx', v=>el.attrs.cx=v);
      bindNum('field-cy', v=>el.attrs.cy=v);
      bindNum('field-r', v=>el.attrs.r=Math.max(v,0));
      break;
    case 'ellipse':
      bindNum('field-cx', v=>el.attrs.cx=v);
      bindNum('field-cy', v=>el.attrs.cy=v);
      bindNum('field-rx', v=>el.attrs.rx=Math.max(v,0));
      bindNum('field-ry', v=>el.attrs.ry=Math.max(v,0));
      break;
    case 'line':
      bindNum('field-x1', v=>el.attrs.x1=v);
      bindNum('field-y1', v=>el.attrs.y1=v);
      bindNum('field-x2', v=>el.attrs.x2=v);
      bindNum('field-y2', v=>el.attrs.y2=v);
      break;
    case 'text': {
      bindNum('field-x', v=>el.attrs.x=v);
      bindNum('field-y', v=>el.attrs.y=v);
      bindNum('field-fontSize', v=>el.attrs.fontSize=Math.max(v,1));
      bindNum('field-letterSpacing', v=>el.attrs.letterSpacing=v);
      const cField = document.getElementById('field-content');
      if(cField){
        let before = null;
        cField.addEventListener('focus', ()=>{ before = snapshotElements(doc(), [el.id]); });
        cField.addEventListener('input', ()=>{ el.attrs.content=cField.value; liveRerender(); });
        cField.addEventListener('change', ()=>{
          if(!before) before = snapshotElements(doc(), [el.id]);
          const after = snapshotElements(doc(), [el.id]);
          commit([el.id], before, after);
          renderAll();
        });
      }




      const ffField = document.getElementById('field-fontFamily');
      if(ffField) ffField.addEventListener('change', ()=>{
        const before = snapshotElements(doc(), [el.id]);
        el.attrs.fontFamily = ffField.value.trim() || 'ui-monospace, monospace';
        const after = snapshotElements(doc(), [el.id]);
        commit([el.id], before, after);
        renderAll();
      });
      const browseBtn = document.getElementById('btnBrowseFonts');
      if(browseBtn) browseBtn.addEventListener('click', ()=>openFontBrowser(el.id));
      const bindTextSelect = (id, apply)=>{
        const input = document.getElementById(id);
        if(!input) return;
        input.addEventListener('change', ()=>{
          const before = snapshotElements(doc(), [el.id]);
          apply(input.value);
          const after = snapshotElements(doc(), [el.id]);
          commit([el.id], before, after);
          renderAll();
        });
      };
      bindTextSelect('field-fontWeight', v=>el.attrs.fontWeight=v);
      bindTextSelect('field-fontStyle', v=>el.attrs.fontStyle=v);
      bindTextSelect('field-textAnchor', v=>el.attrs.textAnchor=v);
      break;
    }
    case 'polygon': case 'polyline': {
      document.querySelectorAll('.pt-x').forEach(inp=>{
        inp.addEventListener('change', ()=>{
          const before = snapshotElements(doc(), [el.id]);
          el.attrs.points[+inp.dataset.idx].x = parseFloat(inp.value)||0;
          const after = snapshotElements(doc(), [el.id]);
          commit([el.id], before, after);
          renderAll();
        });
      });
      document.querySelectorAll('.pt-y').forEach(inp=>{
        inp.addEventListener('change', ()=>{
          const before = snapshotElements(doc(), [el.id]);
          el.attrs.points[+inp.dataset.idx].y = parseFloat(inp.value)||0;
          const after = snapshotElements(doc(), [el.id]);
          commit([el.id], before, after);
          renderAll();
        });
      });
      document.querySelectorAll('.pt-del').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          if(el.attrs.points.length<=2) return;
          const before = snapshotElements(doc(), [el.id]);
          el.attrs.points.splice(+btn.dataset.idx,1);
          const after = snapshotElements(doc(), [el.id]);
          commit([el.id], before, after);
          renderAll();
        });
      });
      const addBtn = document.getElementById('btnAddPoint');
      if(addBtn) addBtn.addEventListener('click', ()=>{
        const before = snapshotElements(doc(), [el.id]);
        const pts = el.attrs.points;
        const last = pts[pts.length-1], prev = pts[pts.length-2]||last;
        pts.push({ x: round2(last.x + (last.x-prev.x||10)), y: round2(last.y + (last.y-prev.y||10)) });
        const after = snapshotElements(doc(), [el.id]);
        commit([el.id], before, after);
        renderAll();
      });
      break;
    }
    case 'path': {
      document.querySelectorAll('.cmd-field').forEach(inp=>{
        inp.addEventListener('change', ()=>{
          const before = snapshotElements(doc(), [el.id]);
          const c = el.attrs.commands[+inp.dataset.idx];
          c[inp.dataset.key] = parseFloat(inp.value)||0;
          const after = snapshotElements(doc(), [el.id]);
          commit([el.id], before, after);
          renderAll();
        });
      });
      document.querySelectorAll('.cmd-flag').forEach(sel=>{
        sel.addEventListener('change', ()=>{
          const before = snapshotElements(doc(), [el.id]);
          const c = el.attrs.commands[+sel.dataset.idx];
          c[sel.dataset.key] = sel.value === '1';
          const after = snapshotElements(doc(), [el.id]);
          commit([el.id], before, after);
          renderAll();
        });
      });
      document.querySelectorAll('.cmd-block .del').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const before = snapshotElements(doc(), [el.id]);
          el.attrs.commands.splice(+btn.dataset.idx,1);
          const after = snapshotElements(doc(), [el.id]);
          commit([el.id], before, after);
          renderAll();
        });
      });
      document.querySelectorAll('.addcmd').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const before = snapshotElements(doc(), [el.id]);
          const cmds = el.attrs.commands;
          const last = pathAllPoints(cmds).slice(-1)[0] || {x:0,y:0};
          const t = btn.dataset.t;
          let c;
          if(t==='M') c = {type:'M', x:last.x+40, y:last.y+40};
          else if(t==='Z') c = {type:'Z'};
          else if(t==='H') c = {type:'H', x:last.x+20, y:last.y};
          else if(t==='V') c = {type:'V', x:last.x, y:last.y+20};
          else if(t==='C') c = {type:'C', x1:last.x+10,y1:last.y-15,x2:last.x+20,y2:last.y+15,x:last.x+30,y:last.y};
          else if(t==='S') c = {type:'S', x2:last.x+20,y2:last.y+15,x:last.x+30,y:last.y};
          else if(t==='Q') c = {type:'Q', x1:last.x+15,y1:last.y-20,x:last.x+30,y:last.y};
          else if(t==='A') c = {type:'A', rx:20, ry:20, rotation:0, largeArc:false, sweep:true, x:last.x+40, y:last.y};
          cmds.push(c);
          const after = snapshotElements(doc(), [el.id]);
          commit([el.id], before, after);
          renderAll();
        });
      });
      document.getElementById('btnToggleClose')?.addEventListener('click', ()=>{
        const before = snapshotElements(doc(), [el.id]);
        const cmds = el.attrs.commands;
        if(cmds.length && cmds[cmds.length-1].type==='Z') cmds.pop();
        else cmds.push({type:'Z'});
        const after = snapshotElements(doc(), [el.id]);
        commit([el.id], before, after);
        renderAll();
      });
      document.querySelectorAll('.insert-after').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const before = snapshotElements(doc(), [el.id]);
          const cmds = el.attrs.commands;
          const idx = +btn.dataset.idx;
          const pts = pathAllPoints(cmds);
          const here = pts[idx] || {x:0,y:0};
          const nextCmd = cmds[idx+1];
          const there = (nextCmd && nextCmd.type!=='Z' && 'x' in nextCmd) ? {x:nextCmd.x,y:nextCmd.y} : {x:here.x+20,y:here.y+20};
          const mid = { x:(here.x+there.x)/2, y:(here.y+there.y)/2 };
          cmds.splice(idx+1, 0, {type:'L', x:mid.x, y:mid.y});
          const after = snapshotElements(doc(), [el.id]);
          commit([el.id], before, after);
          renderAll();
        });
      });
      document.querySelectorAll('.smooth-node').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const before = snapshotElements(doc(), [el.id]);
          const cmds = el.attrs.commands;
          const idx = +btn.dataset.idx;
          const cur = cmds[idx], prev = cmds[idx-1];
          const prevCtrl = 'x2' in prev ? {x:prev.x2,y:prev.y2} : ('x1' in prev ? {x:prev.x1,y:prev.y1} : null);
          const prevAnchor = { x:prev.x, y:prev.y };
          if(prevCtrl && 'x1' in cur){
            cur.x1 = 2*prevAnchor.x - prevCtrl.x;
            cur.y1 = 2*prevAnchor.y - prevCtrl.y;
          }
          const after = snapshotElements(doc(), [el.id]);
          commit([el.id], before, after);
          renderAll();
        });
      });
      const dField = document.getElementById('pathDField');
      if(dField){
        dField.addEventListener('change', ()=>{
          try{
            const cmds = parseDToCommands(dField.value);
            if(cmds.length){
              const before = snapshotElements(doc(), [el.id]);
              el.attrs.commands = cmds;
              const after = snapshotElements(doc(), [el.id]);
              commit([el.id], before, after);
              renderAll();
            }
          }catch(err){ toast('Could not parse path data'); }
        });
      }
      break;
    }
  }
}
