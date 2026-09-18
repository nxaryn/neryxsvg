(function(){
"use strict";

const state = {
  elements: [],
  selection: [],
  tool: 'select',
  nextId: 1,
  view: { x:-20, y:-20, w:800, h:600, zoom:1 },
  gridSize: 10,
  snap: true,
  gridVisible: true,
  clipboard: [],
  drawing: null,
  dragging: null,
  history: [],
  historyIndex: -1,
};

const SVG_NS = "http://www.w3.org/2000/svg";
const svgRoot = document.getElementById('svgRoot');
const elementsLayer = document.getElementById('elementsLayer');
const overlayLayer = document.getElementById('overlayLayer');
const gridLayer = document.getElementById('gridLayer');
const canvasScroll = document.getElementById('canvasScroll');
const rulerTop = document.getElementById('rulerTop');
const rulerLeft = document.getElementById('rulerLeft');
const coordReadout = document.getElementById('coordReadout');
const pathHint = document.getElementById('pathHint');

function uid(prefix){ return prefix + (state.nextId++); }
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), 1400);
}

function defaultStyle(){
  return { fill:'#4fd1c5', stroke:'#0b0d10', strokeWidth:1.5, fillOpacity:0.85 };
}

function makeElement(type, attrs){
  const el = {
    id: uid('el'),
    type,
    attrs,
    rotation: 0,
    flipX: false,
    flipY: false,
    visible: true,
    locked: false,
    name: null,
    style: defaultStyle(),
  };
  if(type === 'line'){ el.style.fill = 'none'; el.style.stroke = '#4fd1c5'; el.style.strokeWidth = 2; }
  if(type === 'text'){ el.style.fill = '#cfd6dd'; el.style.stroke='none'; }
  if(type === 'polyline' || type === 'path'){ el.style.fill = 'none'; el.style.stroke = '#4fd1c5'; el.style.strokeWidth = 2; }
  return el;
}

function displayName(el){
  const map = { rect:'Rectangle', rrect:'Rounded Rect', circle:'Circle', ellipse:'Ellipse',
    line:'Line', polygon:'Polygon', polyline:'Polyline', path:'Path', text:'Text', raw:'Imported' };
  return el.name || map[el.type] || el.type;
}

function localBBox(el){
  const a = el.attrs;
  switch(el.type){
    case 'rect': case 'rrect':
      return { x:a.x, y:a.y, w:Math.max(a.width,0.0001), h:Math.max(a.height,0.0001) };
    case 'circle':
      return { x:a.cx-a.r, y:a.cy-a.r, w:a.r*2, h:a.r*2 };
    case 'ellipse':
      return { x:a.cx-a.rx, y:a.cy-a.ry, w:a.rx*2, h:a.ry*2 };
    case 'line': {
      const x = Math.min(a.x1,a.x2), y = Math.min(a.y1,a.y2);
      return { x, y, w:Math.max(Math.abs(a.x2-a.x1),0.0001), h:Math.max(Math.abs(a.y2-a.y1),0.0001) };
    }
    case 'polygon': case 'polyline': {
      if(!a.points.length) return {x:0,y:0,w:0,h:0};
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      a.points.forEach(p=>{ minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); });
      return { x:minX, y:minY, w:Math.max(maxX-minX,0.0001), h:Math.max(maxY-minY,0.0001) };
    }
    case 'path': {
      const pts = pathAllPoints(a.commands);
      if(!pts.length) return {x:0,y:0,w:0,h:0};
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      pts.forEach(p=>{ minX=Math.min(minX,p.x); maxX=Math.max(maxX,p.x); minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); });
      return { x:minX, y:minY, w:Math.max(maxX-minX,0.0001), h:Math.max(maxY-minY,0.0001) };
    }
    case 'text': {
      const fs = a.fontSize || 16;
      const w = Math.max((a.content||'').length * fs * 0.58, fs*0.6);
      return { x:a.x, y:a.y-fs*0.8, w, h:fs*1.2 };
    }
    case 'raw':
      return a.bbox || {x:0,y:0,w:10,h:10};
  }
  return {x:0,y:0,w:0,h:0};
}

function bboxCenter(b){ return { cx: b.x + b.w/2, cy: b.y + b.h/2 }; }

function elementTransform(el){
  const b = localBBox(el);
  const {cx,cy} = bboxCenter(b);
  const parts = [];
  if(el.rotation) parts.push(`rotate(${round3(el.rotation)} ${round3(cx)} ${round3(cy)})`);
  if(el.flipX || el.flipY){
    parts.push(`translate(${round3(cx)} ${round3(cy)})`);
    parts.push(`scale(${el.flipX?-1:1} ${el.flipY?-1:1})`);
    parts.push(`translate(${round3(-cx)} ${round3(-cy)})`);
  }
  return parts.join(' ');
}

function round3(n){ return Math.round(n*1000)/1000; }
function round2(n){ return Math.round(n*100)/100; }

function pathAllPoints(cmds){
  const pts = [];
  cmds.forEach(c=>{
    if(c.type==='Z') return;
    if('x1' in c) pts.push({x:c.x1,y:c.y1});
    if('x2' in c) pts.push({x:c.x2,y:c.y2});
    if('x' in c) pts.push({x:c.x, y:c.y});
    else if('yOnly' in c) pts.push({x:0,y:c.yOnly});
  });
  return pts.filter(p=>isFinite(p.x)&&isFinite(p.y));
}

function pathToD(cmds){
  let d = '';
  cmds.forEach(c=>{
    switch(c.type){
      case 'M': d += `M ${round2(c.x)} ${round2(c.y)} `; break;
      case 'L': d += `L ${round2(c.x)} ${round2(c.y)} `; break;
      case 'H': d += `H ${round2(c.x)} `; break;
      case 'V': d += `V ${round2(c.y)} `; break;
      case 'C': d += `C ${round2(c.x1)} ${round2(c.y1)}, ${round2(c.x2)} ${round2(c.y2)}, ${round2(c.x)} ${round2(c.y)} `; break;
      case 'S': d += `S ${round2(c.x2)} ${round2(c.y2)}, ${round2(c.x)} ${round2(c.y)} `; break;
      case 'Q': d += `Q ${round2(c.x1)} ${round2(c.y1)}, ${round2(c.x)} ${round2(c.y)} `; break;
      case 'T': d += `T ${round2(c.x)} ${round2(c.y)} `; break;
      case 'Z': d += `Z `; break;
    }
  });
  return d.trim();
}

function parseDToCommands(d){
  const cmds = [];
  if(!d) return cmds;
  const tokens = d.match(/[MLHVCSQTZmlhvcsqtz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let i=0, cur=null, cx=0, cy=0, startX=0, startY=0;
  function num(){ return parseFloat(tokens[i++]); }
  while(i<tokens.length){
    let t = tokens[i];
    if(/[a-zA-Z]/.test(t)){ cur = t; i++; }
    const rel = cur === cur.toLowerCase();
    const T = cur.toUpperCase();
    if(T==='M'){
      const x=num(), y=num();
      cx = rel? cx+x : x; cy = rel? cy+y : y;
      cmds.push({type:'M', x:cx, y:cy}); startX=cx; startY=cy;
      cur = rel?'l':'L';
    } else if(T==='L'){
      const x=num(), y=num();
      cx = rel? cx+x : x; cy = rel? cy+y : y;
      cmds.push({type:'L', x:cx, y:cy});
    } else if(T==='H'){
      const x=num(); cx = rel? cx+x : x;
      cmds.push({type:'H', x:cx, y:cy});
    } else if(T==='V'){
      const y=num(); cy = rel? cy+y : y;
      cmds.push({type:'V', x:cx, y:cy});
    } else if(T==='C'){
      const x1=num(),y1=num(),x2=num(),y2=num(),x=num(),y=num();
      const X1= rel?cx+x1:x1, Y1= rel?cy+y1:y1, X2= rel?cx+x2:x2, Y2= rel?cy+y2:y2, X= rel?cx+x:x, Y= rel?cy+y:y;
      cmds.push({type:'C', x1:X1,y1:Y1,x2:X2,y2:Y2,x:X,y:Y});
      cx=X; cy=Y;
    } else if(T==='S'){
      const x2=num(),y2=num(),x=num(),y=num();
      const X2= rel?cx+x2:x2, Y2= rel?cy+y2:y2, X= rel?cx+x:x, Y= rel?cy+y:y;
      cmds.push({type:'S', x2:X2,y2:Y2,x:X,y:Y});
      cx=X; cy=Y;
    } else if(T==='Q'){
      const x1=num(),y1=num(),x=num(),y=num();
      const X1= rel?cx+x1:x1, Y1= rel?cy+y1:y1, X= rel?cx+x:x, Y= rel?cy+y:y;
      cmds.push({type:'Q', x1:X1,y1:Y1,x:X,y:Y});
      cx=X; cy=Y;
    } else if(T==='T'){
      const x=num(),y=num();
      const X= rel?cx+x:x, Y= rel?cy+y:y;
      cmds.push({type:'T', x:X, y:Y});
      cx=X; cy=Y;
    } else if(T==='Z'){
      cmds.push({type:'Z'});
      cx=startX; cy=startY;
    } else { i++; }
  }
  return cmds;
}

function snapshot(){
  return JSON.stringify({ elements: state.elements, selection: state.selection });
}
function pushHistory(){
  const snap = snapshot();
  if(state.historyIndex>=0 && state.history[state.historyIndex]===snap) return;
  state.history = state.history.slice(0, state.historyIndex+1);
  state.history.push(snap);
  if(state.history.length>100) state.history.shift();
  state.historyIndex = state.history.length-1;
  updateUndoRedoButtons();
}
function undo(){
  if(state.historyIndex<=0) return;
  state.historyIndex--;
  restoreSnapshot(state.history[state.historyIndex]);
}
function redo(){
  if(state.historyIndex>=state.history.length-1) return;
  state.historyIndex++;
  restoreSnapshot(state.history[state.historyIndex]);
}
function restoreSnapshot(snap){
  const data = JSON.parse(snap);
  state.elements = data.elements;
  state.selection = data.selection;
  renderAll();
  updateUndoRedoButtons();
}
function updateUndoRedoButtons(){
  document.getElementById('btnUndo').disabled = state.historyIndex<=0;
  document.getElementById('btnRedo').disabled = state.historyIndex>=state.history.length-1;
}

function containerSize(){
  const r = canvasScroll.getBoundingClientRect();
  return { w:r.width||800, h:r.height||600 };
}
function screenToSVG(clientX, clientY){
  const r = svgRoot.getBoundingClientRect();
  const cs = containerSize();
  const sx = state.view.w / cs.w;
  const sy = state.view.h / cs.h;
  return {
    x: state.view.x + (clientX - r.left) * sx,
    y: state.view.y + (clientY - r.top) * sy
  };
}
function scalePxPerUnit(){
  const cs = containerSize();
  return cs.w / state.view.w;
}
function setZoom(newZoom, centerClientX, centerClientY){
  newZoom = Math.max(0.02, Math.min(64, newZoom));
  const cs = containerSize();
  let focalX, focalY;
  if(centerClientX!=null){
    const f = screenToSVG(centerClientX, centerClientY);
    focalX = f.x; focalY = f.y;
  } else {
    focalX = state.view.x + state.view.w/2;
    focalY = state.view.y + state.view.h/2;
  }
  const oldZoom = state.view.zoom;
  state.view.zoom = newZoom;
  const newW = cs.w / newZoom;
  const newH = cs.h / newZoom;
  const ratioX = (focalX - state.view.x) / state.view.w;
  const ratioY = (focalY - state.view.y) / state.view.h;
  state.view.x = focalX - ratioX*newW;
  state.view.y = focalY - ratioY*newH;
  state.view.w = newW; state.view.h = newH;
  document.getElementById('zoomPct').value = Math.round(newZoom*100)+'%';
  renderView();
}
function initView(){
  const cs = containerSize();
  state.view.zoom = 1;
  state.view.w = cs.w;
  state.view.h = cs.h;
  state.view.x = -cs.w*0.1;
  state.view.y = -cs.h*0.1;
}
function panBy(dxSvg, dySvg){
  state.view.x += dxSvg;
  state.view.y += dySvg;
  renderView();
}
function fitToContent(){
  if(!state.elements.length){ initView(); renderView(); return; }
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  state.elements.forEach(el=>{
    const b = localBBox(el);
    minX=Math.min(minX,b.x); minY=Math.min(minY,b.y);
    maxX=Math.max(maxX,b.x+b.w); maxY=Math.max(maxY,b.y+b.h);
  });
  const pad = Math.max((maxX-minX), (maxY-minY)) * 0.15 || 40;
  minX-=pad; minY-=pad; maxX+=pad; maxY+=pad;
  const cs = containerSize();
  const w = Math.max(maxX-minX, 10), h = Math.max(maxY-minY, 10);
  const zoom = Math.min(cs.w/w, cs.h/h);
  state.view.zoom = zoom;
  state.view.w = cs.w/zoom; state.view.h = cs.h/zoom;
  state.view.x = minX - (state.view.w - w)/2;
  state.view.y = minY - (state.view.h - h)/2;
  document.getElementById('zoomPct').value = Math.round(zoom*100)+'%';
  renderView();
}

function niceStep(){
  const base = state.gridSize;
  const scale = scalePxPerUnit();
  let step = base;
  const minPx = 34;
  if(step*scale < minPx){
    while(step*scale < minPx) step *= 2;
  } else {
    while(step*scale > minPx*5) step /= 2;
    if(step < base) step = base;
  }
  return step;
}

function renderGrid(){
  gridLayer.innerHTML = '';
  if(!state.gridVisible) return;
  const step = niceStep();
  const scale = scalePxPerUnit();
  const {x,y,w,h} = state.view;
  const startX = Math.floor(x/step)*step;
  const startY = Math.floor(y/step)*step;
  const frag = document.createDocumentFragment();
  const strokeW = 1/scale;
  for(let gx=startX; gx<=x+w; gx+=step){
    const line = document.createElementNS(SVG_NS,'line');
    line.setAttribute('x1',gx); line.setAttribute('x2',gx);
    line.setAttribute('y1',y); line.setAttribute('y2',y+h);
    const isAxis = Math.abs(gx) < step/1000;
    line.setAttribute('stroke', isAxis? 'rgba(224,169,90,0.55)' : 'rgba(140,150,160,0.10)');
    line.setAttribute('stroke-width', isAxis? strokeW*1.4 : strokeW);
    frag.appendChild(line);
  }
  for(let gy=startY; gy<=y+h; gy+=step){
    const line = document.createElementNS(SVG_NS,'line');
    line.setAttribute('y1',gy); line.setAttribute('y2',gy);
    line.setAttribute('x1',x); line.setAttribute('x2',x+w);
    const isAxis = Math.abs(gy) < step/1000;
    line.setAttribute('stroke', isAxis? 'rgba(224,169,90,0.55)' : 'rgba(140,150,160,0.10)');
    line.setAttribute('stroke-width', isAxis? strokeW*1.4 : strokeW);
    frag.appendChild(line);
  }
  gridLayer.appendChild(frag);
}

function fmtRulerLabel(v, step){
  if(step < 1) return v.toFixed(2).replace(/\.?0+$/,'');
  return String(Math.round(v));
}

function renderRulers(){
  const cs = containerSize();
  [rulerTop, rulerLeft].forEach(c=>{
    const dpr = window.devicePixelRatio||1;
    const w = c===rulerTop? cs.w : 24;
    const h = c===rulerTop? 24 : cs.h;
    if(c.width !== Math.round(w*dpr)) c.width = Math.round(w*dpr);
    if(c.height !== Math.round(h*dpr)) c.height = Math.round(h*dpr);
    c.style.width = w+'px'; c.style.height = h+'px';
  });
  const step = niceStep();
  const scale = scalePxPerUnit();
  const {x,y,w,h} = state.view;
  const dpr = window.devicePixelRatio||1;


  let ctx = rulerTop.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,cs.w,24);
  ctx.fillStyle = '#121519';
  ctx.fillRect(0,0,cs.w,24);
  ctx.strokeStyle = '#2a313a';
  ctx.fillStyle = '#7d8590';
  ctx.font = '9px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  const startX = Math.floor(x/step)*step;
  for(let gx=startX; gx<=x+w; gx+=step){
    const px = (gx-x)*scale;
    const isAxis = Math.abs(gx) < step/1000;
    ctx.strokeStyle = isAxis? 'rgba(224,169,90,0.8)' : 'rgba(120,130,140,0.35)';
    ctx.beginPath(); ctx.moveTo(px,24); ctx.lineTo(px, isAxis?10:16); ctx.stroke();
    ctx.fillStyle = isAxis? '#e0a95a' : '#7d8590';
    ctx.fillText(fmtRulerLabel(gx,step), px+3, 10);
  }

  if(state.mouseSvg){
    const px = (state.mouseSvg.x-x)*scale;
    ctx.fillStyle = '#4fd1c5';
    ctx.beginPath(); ctx.moveTo(px-4,24); ctx.lineTo(px+4,24); ctx.lineTo(px,18); ctx.closePath(); ctx.fill();
  }


  ctx = rulerLeft.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,24,cs.h);
  ctx.fillStyle = '#121519';
  ctx.fillRect(0,0,24,cs.h);
  const startY = Math.floor(y/step)*step;
  for(let gy=startY; gy<=y+h; gy+=step){
    const py = (gy-y)*scale;
    const isAxis = Math.abs(gy) < step/1000;
    ctx.strokeStyle = isAxis? 'rgba(224,169,90,0.8)' : 'rgba(120,130,140,0.35)';
    ctx.beginPath(); ctx.moveTo(24,py); ctx.lineTo(isAxis?10:16, py); ctx.stroke();
    ctx.save();
    ctx.translate(9, py-3);
    ctx.rotate(-Math.PI/2);
    ctx.fillStyle = isAxis? '#e0a95a' : '#7d8590';
    ctx.fillText(fmtRulerLabel(gy,step), 0, 0);
    ctx.restore();
  }
  if(state.mouseSvg){
    const py = (state.mouseSvg.y-y)*scale;
    ctx.fillStyle = '#4fd1c5';
    ctx.beginPath(); ctx.moveTo(24,py-4); ctx.lineTo(24,py+4); ctx.lineTo(18,py); ctx.closePath(); ctx.fill();
  }
}

function renderView(){
  svgRoot.setAttribute('viewBox', `${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);
  renderGrid();
  renderRulers();
  renderOverlay();
}

const TAGS = { rect:'rect', rrect:'rect', circle:'circle', ellipse:'ellipse',
  line:'line', polygon:'polygon', polyline:'polyline', path:'path', text:'text' };

function renderElementNode(el){
  let node = elementsLayer.querySelector(`[data-id="${el.id}"]`);
  const tag = el.type==='raw' ? (el.attrs.tag||'g') : TAGS[el.type];
  if(!node || node.tagName.toLowerCase() !== tag.toLowerCase()){
    if(node) node.remove();
    node = document.createElementNS(SVG_NS, tag);
    node.setAttribute('data-id', el.id);
  }
  const a = el.attrs;
  if(el.type==='rect' || el.type==='rrect'){
    node.setAttribute('x', a.x); node.setAttribute('y', a.y);
    node.setAttribute('width', Math.max(a.width,0)); node.setAttribute('height', Math.max(a.height,0));
    if(el.type==='rrect'){ node.setAttribute('rx', a.rx||0); node.setAttribute('ry', a.ry!=null?a.ry:(a.rx||0)); }
    else { node.removeAttribute('rx'); node.removeAttribute('ry'); }
  } else if(el.type==='circle'){
    node.setAttribute('cx', a.cx); node.setAttribute('cy', a.cy); node.setAttribute('r', Math.max(a.r,0));
  } else if(el.type==='ellipse'){
    node.setAttribute('cx', a.cx); node.setAttribute('cy', a.cy);
    node.setAttribute('rx', Math.max(a.rx,0)); node.setAttribute('ry', Math.max(a.ry,0));
  } else if(el.type==='line'){
    node.setAttribute('x1', a.x1); node.setAttribute('y1', a.y1);
    node.setAttribute('x2', a.x2); node.setAttribute('y2', a.y2);
  } else if(el.type==='polygon' || el.type==='polyline'){
    node.setAttribute('points', a.points.map(p=>`${round2(p.x)},${round2(p.y)}`).join(' '));
  } else if(el.type==='path'){
    node.setAttribute('d', pathToD(a.commands));
  } else if(el.type==='text'){
    node.setAttribute('x', a.x); node.setAttribute('y', a.y);
    node.setAttribute('font-size', a.fontSize||16);
    node.setAttribute('font-family', a.fontFamily || 'ui-monospace, monospace');
    node.textContent = a.content!=null? a.content : 'Text';
  } else if(el.type==='raw'){
    if(node.getAttribute('data-raw-html')!==a.html){
      node.outerHTML = a.html;
    }
  }

  if(el.type!=='raw'){
    node.setAttribute('fill', el.style.fill);
    node.setAttribute('stroke', el.style.stroke);
    node.setAttribute('stroke-width', el.style.strokeWidth);
    if(el.style.fillOpacity!=null) node.setAttribute('fill-opacity', el.style.fillOpacity);
  }
  node.setAttribute('visibility', el.visible? 'visible':'hidden');
  const t = elementTransform(el);
  if(t) node.setAttribute('transform', t); else node.removeAttribute('transform');
  node.style.cursor = el.locked? 'not-allowed' : (state.tool==='select'?'move':'inherit');
  if(!node.isConnected) elementsLayer.appendChild(node);
  return node;
}

function renderElements(){
  const seen = new Set();
  state.elements.forEach(el=>{
    renderElementNode(el);
    seen.add(el.id);
  });

  Array.from(elementsLayer.children).forEach(node=>{
    const id = node.getAttribute('data-id');
    if(!seen.has(id)) node.remove();
  });

  state.elements.forEach(el=>{
    const node = elementsLayer.querySelector(`[data-id="${el.id}"]`);
    if(node) elementsLayer.appendChild(node);
  });
}

const HANDLE_PX = 7;
function handlePxToSvg(){ return HANDLE_PX/scalePxPerUnit(); }

function renderOverlay(){
  overlayLayer.innerHTML = '';
  if(state.drawing) renderDrawingPreview();
  const sel = state.elements.filter(e=>state.selection.includes(e.id));
  if(!sel.length) return;

  if(sel.length===1){
    renderSingleSelectionHandles(sel[0]);
  } else {
    renderMultiSelectionBox(sel);
  }
  renderAlignmentGuides();
}

function svgEl(tag, attrs){
  const n = document.createElementNS(SVG_NS, tag);
  for(const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function renderSingleSelectionHandles(el){
  const b = localBBox(el);
  const t = elementTransform(el);
  const g = svgEl('g', {});
  if(t) g.setAttribute('transform', t);
  const hs = handlePxToSvg();
  const strokeW = 1/scalePxPerUnit();


  g.appendChild(svgEl('rect', {
    x:b.x, y:b.y, width:b.w, height:b.h, fill:'none',
    stroke:'#4fd1c5', 'stroke-width':strokeW*1.2, 'stroke-dasharray':`${strokeW*4},${strokeW*3}`,
    'pointer-events':'none'
  }));

  if(el.type==='line'){
    ['p1','p2'].forEach((hid,i)=>{
      const px = i===0? el.attrs.x1: el.attrs.x2;
      const py = i===0? el.attrs.y1: el.attrs.y2;
      g.appendChild(makeHandle(px,py,hs,hid,'move'));
    });
  } else if(el.type==='polygon' || el.type==='polyline'){
    el.attrs.points.forEach((p,i)=>{
      g.appendChild(makeHandle(p.x,p.y,hs,'pt'+i,'move'));
    });
  } else if(el.type==='path'){
    let lastAnchor = {x:0,y:0};
    el.attrs.commands.forEach((c,i)=>{
      if(c.type==='Z') return;
      if('x1' in c){
        g.appendChild(svgEl('line',{x1:lastAnchor.x,y1:lastAnchor.y,x2:c.x1,y2:c.y1,stroke:'#e0a95a','stroke-width':strokeW,'stroke-dasharray':`${strokeW*2},${strokeW*2}`}));
        g.appendChild(makeHandle(c.x1,c.y1,hs*0.8,'c'+i+'a','crosshair','#e0a95a'));
      }
      if('x2' in c){
        const anchor2 = ('x' in c)? {x:c.x,y:c.y} : lastAnchor;
        g.appendChild(svgEl('line',{x1:anchor2.x,y1:anchor2.y,x2:c.x2,y2:c.y2,stroke:'#e0a95a','stroke-width':strokeW,'stroke-dasharray':`${strokeW*2},${strokeW*2}`}));
        g.appendChild(makeHandle(c.x2,c.y2,hs*0.8,'c'+i+'b','crosshair','#e0a95a'));
      }
      let ax=lastAnchor.x, ay=lastAnchor.y;
      if('x' in c){ ax=c.x; ay=c.y; }
      else if(c.type==='H'){ ax=c.x; ay=lastAnchor.y; }
      else if(c.type==='V'){ ax=lastAnchor.x; ay=c.y; }
      g.appendChild(makeHandle(ax,ay,hs,'node'+i,'move'));
      lastAnchor = {x:ax,y:ay};
    });
  } else if(el.type==='text'){
    g.appendChild(makeHandle(b.x,b.y,hs,'move-text','move'));
    g.appendChild(makeHandle(b.x+b.w,b.y+b.h,hs,'se','nwse-resize'));
  } else {

    const pts = {
      nw:[b.x,b.y], n:[b.x+b.w/2,b.y], ne:[b.x+b.w,b.y],
      w:[b.x,b.y+b.h/2], e:[b.x+b.w,b.y+b.h/2],
      sw:[b.x,b.y+b.h], s:[b.x+b.w/2,b.y+b.h], se:[b.x+b.w,b.y+b.h],
    };
    const cursors = {nw:'nwse-resize',n:'ns-resize',ne:'nesw-resize',w:'ew-resize',e:'ew-resize',sw:'nesw-resize',s:'ns-resize',se:'nwse-resize'};
    Object.keys(pts).forEach(k=>{
      g.appendChild(makeHandle(pts[k][0],pts[k][1],hs,k,cursors[k]));
    });

    const rx = b.x+b.w/2, ry = b.y - 26/scalePxPerUnit();
    g.appendChild(svgEl('line',{x1:b.x+b.w/2,y1:b.y,x2:rx,y2:ry,stroke:'#4fd1c5','stroke-width':strokeW}));
    g.appendChild(makeHandle(rx,ry,hs,'rotate','grab','#e0a95a', true));
  }
  overlayLayer.appendChild(g);
}

function makeHandle(x,y,size,hid,cursor,color,circle){
  const n = circle? svgEl('circle',{cx:x,cy:y,r:size*0.62}) : svgEl('rect',{x:x-size/2,y:y-size/2,width:size,height:size});
  n.setAttribute('fill', color||'#0b0d10');
  n.setAttribute('stroke', color? color : '#4fd1c5');
  n.setAttribute('stroke-width', (1.4/scalePxPerUnit()));
  n.setAttribute('data-handle', hid);
  n.style.cursor = cursor;
  return n;
}

function renderMultiSelectionBox(sel){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  sel.forEach(el=>{
    const b = localBBox(el);
    minX=Math.min(minX,b.x); minY=Math.min(minY,b.y);
    maxX=Math.max(maxX,b.x+b.w); maxY=Math.max(maxY,b.y+b.h);
  });
  const strokeW = 1/scalePxPerUnit();
  overlayLayer.appendChild(svgEl('rect', {
    x:minX,y:minY,width:maxX-minX,height:maxY-minY, fill:'rgba(79,209,197,0.05)',
    stroke:'#4fd1c5','stroke-width':strokeW*1.2,'stroke-dasharray':`${strokeW*4},${strokeW*3}`,
    'pointer-events':'none'
  }));
  sel.forEach(el=>{
    const b = localBBox(el);
    const t = elementTransform(el);
    const g = svgEl('g',{});
    if(t) g.setAttribute('transform',t);
    g.appendChild(svgEl('rect',{x:b.x,y:b.y,width:b.w,height:b.h,fill:'none',stroke:'#4fd1c5','stroke-width':strokeW*0.8,'stroke-dasharray':`${strokeW*2},${strokeW*2}`,'pointer-events':'none'}));
    overlayLayer.appendChild(g);
  });
}

function renderAlignmentGuides(){
  if(!state.guides || !state.guides.length) return;
  const strokeW = 1/scalePxPerUnit();
  state.guides.forEach(g=>{
    if(g.type==='v'){
      overlayLayer.appendChild(svgEl('line',{x1:g.x,x2:g.x,y1:state.view.y,y2:state.view.y+state.view.h,stroke:'#e05a9e','stroke-width':strokeW,'stroke-dasharray':`${strokeW*3},${strokeW*2}`}));
    } else {
      overlayLayer.appendChild(svgEl('line',{y1:g.y,y2:g.y,x1:state.view.x,x2:state.view.x+state.view.w,stroke:'#e05a9e','stroke-width':strokeW,'stroke-dasharray':`${strokeW*3},${strokeW*2}`}));
    }
  });
}

function renderDrawingPreview(){
  const d = state.drawing;
  const strokeW = 1/scalePxPerUnit();
  if(d.type==='polygon' || d.type==='polyline' || d.type==='path'){
    if(d.points.length){
      const ptsStr = d.points.map(p=>`${p.x},${p.y}`).join(' ') + (d.cursor? ` ${d.cursor.x},${d.cursor.y}`:'');
      overlayLayer.appendChild(svgEl('polyline',{points:ptsStr, fill:'none', stroke:'#e0a95a','stroke-width':strokeW*1.5}));
      d.points.forEach(p=>overlayLayer.appendChild(svgEl('circle',{cx:p.x,cy:p.y,r:handlePxToSvg()*0.6,fill:'#e0a95a'})));
    }
  }
}

function renderAll(){
  renderElements();
  renderView();
  renderLayersPanel();
  renderInspector();
  syncCodePanel();
}

const TOOLS = [
  { id:'select', label:'Select (V)', icon:`<path d="M4 2l9 9-4 1 3 4-2 1-3-4-2 3z"/>` },
  { id:'rect', label:'Rectangle (R)', icon:`<rect x="3" y="4" width="10" height="8"/>` },
  { id:'rrect', label:'Rounded Rectangle', icon:`<rect x="3" y="4" width="10" height="8" rx="2.5"/>` },
  { id:'circle', label:'Circle (C)', icon:`<circle cx="8" cy="8" r="5"/>` },
  { id:'ellipse', label:'Ellipse (E)', icon:`<ellipse cx="8" cy="8" rx="6" ry="4"/>` },
  { id:'line', label:'Line (L)', icon:`<line x1="3" y1="13" x2="13" y2="3"/>` },
  { id:'polygon', label:'Polygon', icon:`<polygon points="8,2 14,6 12,13 4,13 2,6"/>` },
  { id:'polyline', label:'Polyline', icon:`<polyline points="2,13 6,4 10,11 14,3"/>` },
  { id:'path', label:'Path (P)', icon:`<path d="M2 12 Q6 2 8 8 T14 4"/>` },
  { id:'text', label:'Text (T)', icon:`<path d="M3 3h10M8 3v10"/>` },
];
function buildToolbar(){
  const bar = document.getElementById('toolbar');
  TOOLS.forEach(t=>{
    const b = document.createElement('button');
    b.title = t.label;
    b.dataset.tool = t.id;
    b.innerHTML = `<svg viewBox="0 0 16 16">${t.icon}</svg>`;
    b.addEventListener('click', ()=>setTool(t.id));
    if(t.id==='select') b.classList.add('active');
    bar.appendChild(b);
  });
}
function setTool(id){
  cancelDrawing();
  state.tool = id;
  document.querySelectorAll('#toolbar button').forEach(b=>b.classList.toggle('active', b.dataset.tool===id));
  svgRoot.classList.toggle('tool-select', id==='select');
  svgRoot.style.cursor = id==='select'? 'default' : 'crosshair';
  pathHint.classList.remove('show');
  renderAll();
}

let spaceHeld = false;
let panState = null;

svgRoot.addEventListener('wheel', (e)=>{
  e.preventDefault();
  if(e.shiftKey){
    panBy(e.deltaY / scalePxPerUnit(), 0);
    return;
  }
  if(e.ctrlKey || e.metaKey || true){
    const factor = Math.pow(1.0015, -e.deltaY);
    setZoom(state.view.zoom*factor, e.clientX, e.clientY);
  }
}, {passive:false});

svgRoot.addEventListener('mousemove', (e)=>{
  const p = screenToSVG(e.clientX, e.clientY);
  state.mouseSvg = p;
  coordReadout.innerHTML = `<span>X</span>${round2(p.x)}  <span>Y</span>${round2(p.y)}`;
  renderRulers();
});
svgRoot.addEventListener('mouseleave', ()=>{ state.mouseSvg=null; renderRulers(); });

svgRoot.addEventListener('mousedown', onPointerDown);
window.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);
svgRoot.addEventListener('dblclick', onDblClick);

window.addEventListener('keydown', (e)=>{
  const tag = (e.target.tagName||'').toLowerCase();
  const typing = tag==='input' || tag==='textarea' || e.target.isContentEditable;
  if(e.code==='Space' && !typing){ spaceHeld = true; svgRoot.classList.add('panning'); }
  if(typing) {
    if(e.key==='Enter' && tag==='input') e.target.blur();
    return;
  }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); if(e.shiftKey) redo(); else undo(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y'){ e.preventDefault(); redo(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='d'){ e.preventDefault(); duplicateSelection(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='c'){ e.preventDefault(); copySelection(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='v'){ e.preventDefault(); pasteClipboard(); return; }
  if(e.key==='Delete' || e.key==='Backspace'){
    if(state.drawing){ cancelDrawing(); return; }
    if(state.selection.length){ e.preventDefault(); deleteSelection(); }
    return;
  }
  if(e.key==='Escape'){ cancelDrawing(); clearSelection(); renderAll(); return; }
  if(e.key==='Enter' && state.drawing){ finishDrawingPath(false); return; }
  if(['v','r','o','c','e','l','g','y','p','t'].includes(e.key.toLowerCase()) && !e.ctrlKey && !e.metaKey){
    const map = {v:'select',r:'rect',o:'rrect',c:'circle',e:'ellipse',l:'line',g:'polygon',y:'polyline',p:'path',t:'text'};
    if(map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
  }
  if(state.selection.length && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
    e.preventDefault();
    const step = e.shiftKey? (state.gridSize||10) : 1;
    let dx=0,dy=0;
    if(e.key==='ArrowUp') dy=-step; if(e.key==='ArrowDown') dy=step;
    if(e.key==='ArrowLeft') dx=-step; if(e.key==='ArrowRight') dx=step;
    nudgeSelection(dx,dy);
  }
});
window.addEventListener('keyup', (e)=>{
  if(e.code==='Space'){ spaceHeld = false; svgRoot.classList.remove('panning','panning-active'); }
});

function nudgeSelection(dx,dy){
  state.selection.forEach(id=>{
    const el = state.elements.find(x=>x.id===id);
    if(el && !el.locked) translateElement(el, dx, dy);
  });
  pushHistory();
  renderAll();
}

function hitTestElement(target){
  let node = target;
  while(node && node!==elementsLayer && node.parentNode){
    if(node.parentNode===elementsLayer) break;
    node = node.parentNode;
  }
  if(node && node.getAttribute && node.getAttribute('data-id')) return node.getAttribute('data-id');
  return null;
}

function onPointerDown(e){
  if(e.button===1 || spaceHeld || e.button===2){
    panState = { startX:e.clientX, startY:e.clientY, vx:state.view.x, vy:state.view.y };
    svgRoot.classList.add('panning-active');
    return;
  }
  if(e.button!==0) return;
  const p = screenToSVG(e.clientX, e.clientY);
  const handleId = e.target.getAttribute && e.target.getAttribute('data-handle');

  if(handleId){
    startHandleDrag(handleId, p, e);
    return;
  }

  if(state.tool==='select'){
    const hitId = hitTestElement(e.target);
    if(hitId){
      const el = state.elements.find(x=>x.id===hitId);
      if(el && el.locked) return;
      if(e.shiftKey){
        if(state.selection.includes(hitId)) state.selection = state.selection.filter(id=>id!==hitId);
        else state.selection.push(hitId);
      } else if(!state.selection.includes(hitId)){
        state.selection = [hitId];
      }
      renderAll();
      const startPositions = {};
      state.selection.forEach(id=>{
        const el2 = state.elements.find(x=>x.id===id);
        startPositions[id] = JSON.parse(JSON.stringify(el2.attrs));
      });
      state.dragging = { mode:'move', startSvg:p, startPositions };
    } else {
      if(!e.shiftKey) clearSelection();
      state.dragging = { mode:'rubberband', startSvg:p, rect:{x:p.x,y:p.y,w:0,h:0} };
      renderAll();
    }
    return;
  }


  startDrawing(state.tool, p, e);
}

function startHandleDrag(handleId, p, e){
  const el = state.elements.find(x=>x.id===state.selection[0]);
  if(!el || el.locked) return;
  const startAttrs = JSON.parse(JSON.stringify(el.attrs));
  const startBBox = localBBox(el);
  state.dragging = {
    mode:'handle', handleId, startSvg:p, el, startAttrs, startBBox,
    startRotation: el.rotation, shift:e.shiftKey
  };
}

function onPointerMove(e){
  if(panState){
    const cs = containerSize();
    const sx = state.view.w/cs.w, sy = state.view.h/cs.h;
    const dx = (e.clientX-panState.startX)*sx;
    const dy = (e.clientY-panState.startY)*sy;
    state.view.x = panState.vx - dx;
    state.view.y = panState.vy - dy;
    renderView();
    return;
  }
  if(!state.dragging){
    if(state.drawing){
      const p = screenToSVG(e.clientX, e.clientY);
      state.drawing.cursor = maybeSnap(p);
      renderOverlay();
    }
    return;
  }
  let p = screenToSVG(e.clientX, e.clientY);
  const d = state.dragging;

  if(d.mode==='move'){
    let dx = p.x - d.startSvg.x, dy = p.y - d.startSvg.y;
    if(state.snap){ dx = snapVal(dx); dy = snapVal(dy); }
    state.guides = [];
    state.selection.forEach(id=>{
      const el = state.elements.find(x=>x.id===id);
      if(!el) return;
      setElementFromBase(el, d.startPositions[id], dx, dy);
    });
    computeAlignmentGuides();
    renderElements(); renderOverlay(); renderInspector();
  } else if(d.mode==='rubberband'){
    d.rect = { x:Math.min(d.startSvg.x,p.x), y:Math.min(d.startSvg.y,p.y), w:Math.abs(p.x-d.startSvg.x), h:Math.abs(p.y-d.startSvg.y) };
    overlayLayer.innerHTML='';
    const strokeW = 1/scalePxPerUnit();
    overlayLayer.appendChild(svgEl('rect', {x:d.rect.x,y:d.rect.y,width:d.rect.w,height:d.rect.h,fill:'rgba(79,209,197,0.08)',stroke:'#4fd1c5','stroke-width':strokeW}));
  } else if(d.mode==='handle'){
    if(state.snap) p = { x:snapPoint(p.x), y:snapPoint(p.y) };
    applyHandleDrag(d, p, e.shiftKey);
    renderElements(); renderOverlay(); renderInspector();
  } else if(d.mode==='drawShape'){
    if(state.snap) p = { x:snapPoint(p.x), y:snapPoint(p.y) };
    updateDrawingShape(state.drawing, p, e.shiftKey);
    renderElements(); renderOverlay();
  }
}

function onPointerUp(e){
  if(panState){ panState=null; svgRoot.classList.remove('panning-active'); return; }
  if(state.dragging){
    const d = state.dragging;
    if(d.mode==='rubberband'){
      const r = d.rect;
      if(r.w>1 || r.h>1){
        const ids = state.elements.filter(el=>{
          const b = localBBox(el);
          return b.x < r.x+r.w && b.x+b.w > r.x && b.y < r.y+r.h && b.y+b.h > r.y && el.visible && !el.locked;
        }).map(el=>el.id);
        state.selection = ids;
      }
    }
    if(d.mode==='move' || d.mode==='handle'){
      pushHistory();
    }
    state.guides = [];
    state.dragging = null;
    renderAll();
    return;
  }
  if(state.drawing && state.drawing.mode==='drag'){
    finalizeDragShape();
  }
}

function snapVal(v){ const g=state.gridSize; return Math.round(v/g)*g; }
function snapPoint(v){ const g=state.gridSize; return Math.round(v/g)*g; }
function maybeSnap(p){ return state.snap? {x:snapPoint(p.x), y:snapPoint(p.y)} : p; }

function computeAlignmentGuides(){
  state.guides = [];
  if(state.selection.length!==1) return;
  const el = state.elements.find(x=>x.id===state.selection[0]);
  if(!el) return;
  const b = localBBox(el);
  const mySides = { left:b.x, right:b.x+b.w, cx:b.x+b.w/2, top:b.y, bottom:b.y+b.h, cy:b.y+b.h/2 };
  const thresh = 4/scalePxPerUnit();
  state.elements.forEach(other=>{
    if(other.id===el.id) return;
    const ob = localBBox(other);
    const oSides = { left:ob.x, right:ob.x+ob.w, cx:ob.x+ob.w/2, top:ob.y, bottom:ob.y+ob.h, cy:ob.y+ob.h/2 };
    ['left','right','cx'].forEach(k1=>{
      ['left','right','cx'].forEach(k2=>{
        if(Math.abs(mySides[k1]-oSides[k2])<thresh) state.guides.push({type:'v', x:oSides[k2]});
      });
    });
    ['top','bottom','cy'].forEach(k1=>{
      ['top','bottom','cy'].forEach(k2=>{
        if(Math.abs(mySides[k1]-oSides[k2])<thresh) state.guides.push({type:'h', y:oSides[k2]});
      });
    });
  });
}

function setElementFromBase(el, base, dx, dy){
  switch(el.type){
    case 'rect': case 'rrect':
      el.attrs.x = base.x+dx; el.attrs.y = base.y+dy; break;
    case 'circle':
      el.attrs.cx = base.cx+dx; el.attrs.cy = base.cy+dy; break;
    case 'ellipse':
      el.attrs.cx = base.cx+dx; el.attrs.cy = base.cy+dy; break;
    case 'line':
      el.attrs.x1 = base.x1+dx; el.attrs.y1 = base.y1+dy;
      el.attrs.x2 = base.x2+dx; el.attrs.y2 = base.y2+dy; break;
    case 'polygon': case 'polyline':
      el.attrs.points = base.points.map(p=>({x:p.x+dx, y:p.y+dy})); break;
    case 'path':
      el.attrs.commands = base.commands.map(c=>{
        const nc = Object.assign({}, c);
        if('x' in nc) nc.x = c.x+dx;
        if('y' in nc) nc.y = c.y+dy;
        if('x1' in nc) nc.x1 = c.x1+dx;
        if('y1' in nc) nc.y1 = c.y1+dy;
        if('x2' in nc) nc.x2 = c.x2+dx;
        if('y2' in nc) nc.y2 = c.y2+dy;
        return nc;
      }); break;
    case 'text':
      el.attrs.x = base.x+dx; el.attrs.y = base.y+dy; break;
  }
}
function translateElement(el, dx, dy){
  setElementFromBase(el, JSON.parse(JSON.stringify(el.attrs)), dx, dy);
}

function startDrawing(tool, p, e){
  const sp = state.snap? maybeSnap(p) : p;
  if(['rect','rrect','circle','ellipse','line'].includes(tool)){
    state.drawing = { type:tool, mode:'drag', start:sp, cur:sp };
    state.dragging = { mode:'drawShape' };
  } else if(tool==='polygon' || tool==='polyline'){
    if(!state.drawing || state.drawing.type!==tool){
      state.drawing = { type:tool, mode:'points', points:[sp], cursor:sp };
      pathHint.classList.add('show');
      document.querySelector('#pathHint span').textContent = tool==='polygon'?'Click to add points (Enter/dblclick to finish, closes automatically):':'Click to add points:';
      document.getElementById('pathSegType').style.display='none';
      document.getElementById('btnClosePath').style.display = tool==='polygon'?'none':'inline-block';
    } else {
      state.drawing.points.push(sp);
    }
    renderOverlay();
  } else if(tool==='path'){
    if(!state.drawing || state.drawing.type!=='path'){
      state.drawing = { type:'path', mode:'points', points:[sp], cursor:sp, commands:[{type:'M', x:sp.x, y:sp.y}] };
      pathHint.classList.add('show');
      document.querySelector('#pathHint span').textContent='Next segment:';
      document.getElementById('pathSegType').style.display='inline-block';
      document.getElementById('btnClosePath').style.display='inline-block';
    } else {
      const segType = document.getElementById('pathSegType').value;
      const last = state.drawing.points[state.drawing.points.length-1];
      let cmd;
      if(segType==='H') cmd = {type:'H', x:sp.x, y:last.y};
      else if(segType==='V') cmd = {type:'V', x:last.x, y:sp.y};
      else if(segType==='C') cmd = {type:'C', x1:last.x+(sp.x-last.x)/3, y1:last.y, x2:last.x+2*(sp.x-last.x)/3, y2:sp.y, x:sp.x, y:sp.y};
      else if(segType==='S') cmd = {type:'S', x2:last.x+(sp.x-last.x)/2, y2:last.y, x:sp.x, y:sp.y};
      else if(segType==='Q') cmd = {type:'Q', x1:(last.x+sp.x)/2, y1:last.y, x:sp.x, y:sp.y};
      else cmd = {type:'L', x:sp.x, y:sp.y};
      state.drawing.commands.push(cmd);
      state.drawing.points.push({x: segType==='H'? sp.x : (segType==='V'? last.x : sp.x), y: segType==='V'? sp.y : (segType==='H'? last.y : sp.y)});
    }
    renderOverlay();
  } else if(tool==='text'){
    const el = makeElement('text', { x:sp.x, y:sp.y, fontSize:20, fontFamily:'ui-monospace, monospace', content:'Text' });
    state.elements.push(el);
    state.selection = [el.id];
    pushHistory();
    setTool('select');
    renderAll();
    setTimeout(()=>{ const f = document.getElementById('field-content'); if(f){ f.focus(); f.select(); } }, 30);
  }
}

function updateDrawingShape(d, p, shift){
  d.cur = p;
  const {start,cur} = d;
  if(d.type==='rect' || d.type==='rrect'){
    let w = cur.x-start.x, h = cur.y-start.y;
    if(shift){ const s = Math.max(Math.abs(w),Math.abs(h)); w = Math.sign(w||1)*s; h = Math.sign(h||1)*s; }
    d.previewAttrs = { x:Math.min(start.x,start.x+w), y:Math.min(start.y,start.y+h), width:Math.abs(w), height:Math.abs(h), rx: d.type==='rrect'?8:0, ry: d.type==='rrect'?8:0 };
  } else if(d.type==='circle'){
    const r = Math.hypot(cur.x-start.x, cur.y-start.y);
    d.previewAttrs = { cx:start.x, cy:start.y, r };
  } else if(d.type==='ellipse'){
    let rx = Math.abs(cur.x-start.x), ry = Math.abs(cur.y-start.y);
    if(shift){ rx = ry = Math.max(rx,ry); }
    d.previewAttrs = { cx:start.x, cy:start.y, rx, ry };
  } else if(d.type==='line'){
    let x2=cur.x, y2=cur.y;
    if(shift){
      const dx=x2-start.x, dy=y2-start.y;
      const ang = Math.round(Math.atan2(dy,dx)/(Math.PI/4))*(Math.PI/4);
      const len = Math.hypot(dx,dy);
      x2 = start.x+Math.cos(ang)*len; y2 = start.y+Math.sin(ang)*len;
    }
    d.previewAttrs = { x1:start.x, y1:start.y, x2, y2 };
  }
  if(!d.liveEl){
    d.liveEl = makeElement(d.type, d.previewAttrs);
    d.liveEl.style.fillOpacity = 0.5;
    state.elements.push(d.liveEl);
  } else {
    d.liveEl.attrs = d.previewAttrs;
  }
}

function finalizeDragShape(){
  const d = state.drawing;
  if(!d || !d.liveEl){ state.drawing=null; state.dragging=null; return; }
  const b = localBBox(d.liveEl);
  if(b.w<1 && b.h<1 && d.type!=='line'){
    state.elements = state.elements.filter(e=>e.id!==d.liveEl.id);
  } else {
    state.selection = [d.liveEl.id];
  }
  state.drawing = null; state.dragging = null;
  pushHistory();
  setTool('select');
  renderAll();
}

function finishDrawingPath(closePath){
  const d = state.drawing;
  if(!d) return;
  if(d.type==='polygon' || d.type==='polyline'){
    if(d.points.length<2){ cancelDrawing(); return; }
    const el = makeElement(d.type, { points: d.points.slice() });
    state.elements.push(el);
    state.selection = [el.id];
  } else if(d.type==='path'){
    if(d.commands.length<2){ cancelDrawing(); return; }
    const cmds = d.commands.slice();
    if(closePath) cmds.push({type:'Z'});
    const el = makeElement('path', { commands: cmds });
    state.elements.push(el);
    state.selection = [el.id];
  }
  state.drawing = null;
  pathHint.classList.remove('show');
  pushHistory();
  setTool('select');
  renderAll();
}
function cancelDrawing(){
  if(state.drawing && state.drawing.liveEl){
    state.elements = state.elements.filter(e=>e.id!==state.drawing.liveEl.id);
  }
  state.drawing = null;
  state.dragging = null;
  pathHint.classList.remove('show');
  renderAll();
}
document.getElementById('btnFinishPath').addEventListener('click', ()=>finishDrawingPath(false));
document.getElementById('btnClosePath').addEventListener('click', ()=>finishDrawingPath(true));

function onDblClick(e){
  if(state.drawing && (state.drawing.type==='polygon' || state.drawing.type==='polyline' || state.drawing.type==='path')){
    finishDrawingPath(false);
  } else if(state.tool==='select'){
    const hitId = hitTestElement(e.target);
    if(hitId){
      const el = state.elements.find(x=>x.id===hitId);
      if(el && el.type==='text'){
        state.selection=[hitId]; renderAll();
        setTimeout(()=>{ const f=document.getElementById('field-content'); if(f){f.focus(); f.select();} },20);
      }
    }
  }
}

function applyHandleDrag(d, p, shift){
  const el = d.el;
  const hid = d.handleId;

  if(hid==='rotate'){
    const b = d.startBBox;
    const cx = b.x+b.w/2, cy = b.y+b.h/2;
    let ang = Math.atan2(p.y-cy, p.x-cx)*180/Math.PI + 90;
    if(shift) ang = Math.round(ang/15)*15;
    el.rotation = round2(ang);
    return;
  }
  if(hid.startsWith('pt')){
    const idx = parseInt(hid.slice(2),10);
    el.attrs.points[idx] = { x:p.x, y:p.y };
    return;
  }
  if(hid==='p1'){ el.attrs.x1=p.x; el.attrs.y1=p.y; return; }
  if(hid==='p2'){ el.attrs.x2=p.x; el.attrs.y2=p.y; return; }
  if(hid.startsWith('node')){
    const idx = parseInt(hid.slice(4),10);
    const c = el.attrs.commands[idx];
    if(c.type==='H'){ c.x=p.x; }
    else if(c.type==='V'){ c.y=p.y; }
    else { c.x=p.x; c.y=p.y; }
    return;
  }
  if(hid.startsWith('c') && (hid.endsWith('a')||hid.endsWith('b'))){
    const idx = parseInt(hid.slice(1,-1),10);
    const which = hid.endsWith('a')?'1':'2';
    const c = el.attrs.commands[idx];
    c['x'+which] = p.x; c['y'+which] = p.y;
    return;
  }
  if(hid==='move-text'){
    el.attrs.x = p.x; el.attrs.y = p.y; return;
  }


  const b0 = d.startBBox;
  let localP = p;
  if(el.rotation){
    const cx = b0.x+b0.w/2, cy = b0.y+b0.h/2;
    const rad = -el.rotation*Math.PI/180;
    const dx = p.x-cx, dy = p.y-cy;
    localP = { x: cx + dx*Math.cos(rad)-dy*Math.sin(rad), y: cy + dx*Math.sin(rad)+dy*Math.cos(rad) };
  }
  let nx=b0.x, ny=b0.y, nw=b0.w, nh=b0.h;
  const minSize = 2;
  if(hid.includes('w')){ nw = Math.max(b0.x+b0.w-localP.x, minSize); nx = b0.x+b0.w-nw; }
  if(hid.includes('e')){ nw = Math.max(localP.x-b0.x, minSize); }
  if(hid.includes('n')){ nh = Math.max(b0.y+b0.h-localP.y, minSize); ny = b0.y+b0.h-nh; }
  if(hid.includes('s')){ nh = Math.max(localP.y-b0.y, minSize); }
  if(shift && (hid==='se'||hid==='nw'||hid==='ne'||hid==='sw')){
    const ratio = b0.w/b0.h || 1;
    if(nw/nh > ratio){ nh = nw/ratio; } else { nw = nh*ratio; }
    if(hid.includes('n')) ny = b0.y+b0.h-nh;
    if(hid.includes('w')) nx = b0.x+b0.w-nw;
  }

  if(el.type==='rect' || el.type==='rrect'){
    el.attrs.x = nx; el.attrs.y = ny; el.attrs.width = nw; el.attrs.height = nh;
  } else if(el.type==='circle'){
    const cx=b0.x+b0.w/2, cy=b0.y+b0.h/2;
    const r = Math.max(Math.hypot(localP.x-cx, localP.y-cy),1);
    el.attrs.cx=cx; el.attrs.cy=cy; el.attrs.r=r;
  } else if(el.type==='ellipse'){
    el.attrs.cx = nx+nw/2; el.attrs.cy = ny+nh/2; el.attrs.rx = nw/2; el.attrs.ry = nh/2;
  } else if(el.type==='text'){
    const scale = nh / b0.h;
    el.attrs.fontSize = Math.max(4, round2((el._baseFontSize||el.attrs.fontSize)*scale));
  } else if(el.type==='polygon' || el.type==='polyline' || el.type==='path'){

    const sx = b0.w? nw/b0.w : 1, sy = b0.h? nh/b0.h : 1;
    if(el.type==='path'){
      el.attrs.commands = d.startAttrs.commands.map(c=>{
        const nc = Object.assign({}, c);
        ['x','x1','x2'].forEach(k=>{ if(k in nc) nc[k] = nx + (c[k]-b0.x)*sx; });
        ['y','y1','y2'].forEach(k=>{ if(k in nc) nc[k] = ny + (c[k]-b0.y)*sy; });
        return nc;
      });
    } else {
      el.attrs.points = d.startAttrs.points.map(pt=>({ x: nx+(pt.x-b0.x)*sx, y: ny+(pt.y-b0.y)*sy }));
    }
  }
}

function clearSelection(){ state.selection = []; }
function deleteSelection(){
  if(!state.selection.length) return;
  state.elements = state.elements.filter(e=>!state.selection.includes(e.id));
  state.selection = [];
  pushHistory();
  renderAll();
}
function duplicateSelection(){
  if(!state.selection.length) return;
  const copies = [];
  state.selection.forEach(id=>{
    const el = state.elements.find(x=>x.id===id);
    if(!el) return;
    const clone = JSON.parse(JSON.stringify(el));
    clone.id = uid('el');
    translateElement(clone, 14, 14);
    copies.push(clone);
  });
  state.elements.push(...copies);
  state.selection = copies.map(c=>c.id);
  pushHistory();
  renderAll();
}
function copySelection(){
  if(!state.selection.length) return;
  state.clipboard = state.selection.map(id=>{
    const el = state.elements.find(x=>x.id===id);
    return JSON.parse(JSON.stringify(el));
  });
  toast('Copied '+state.clipboard.length+' element(s)');
}
function pasteClipboard(){
  if(!state.clipboard.length) return;
  const copies = state.clipboard.map(el=>{
    const clone = JSON.parse(JSON.stringify(el));
    clone.id = uid('el');
    translateElement(clone, 14, 14);
    return clone;
  });
  state.elements.push(...copies);
  state.selection = copies.map(c=>c.id);
  pushHistory();
  renderAll();
  toast('Pasted');
}

const TYPE_ABBR = { rect:'RECT', rrect:'RRECT', circle:'CIRC', ellipse:'ELLI', line:'LINE',
  polygon:'PGON', polyline:'PLIN', path:'PATH', text:'TEXT', raw:'RAW' };

function renderLayersPanel(){
  const list = document.getElementById('layersList');
  list.innerHTML = '';
  document.getElementById('layerCount').textContent = state.elements.length;

  const ordered = state.elements.slice().reverse();
  ordered.forEach(el=>{
    const row = document.createElement('div');
    row.className = 'layer-row' + (state.selection.includes(el.id)?' selected':'') + (el.locked?' locked':'') + (!el.visible?' hidden':'');
    row.innerHTML = `
      <button class="btn-vis" title="Toggle visibility">${el.visible? eyeIcon() : eyeOffIcon()}</button>
      <button class="btn-lock" title="Toggle lock">${el.locked? lockIcon() : unlockIcon()}</button>
      <span class="lname"><span class="ltype">${TYPE_ABBR[el.type]||el.type}</span>${displayName(el)}</span>
      <button class="btn-up" title="Move up">${upIcon()}</button>
      <button class="btn-down" title="Move down">${downIcon()}</button>
      <button class="btn-del" title="Delete">${trashIcon()}</button>
    `;
    row.addEventListener('click', (e)=>{
      if(e.target.closest('button')) return;
      if(e.shiftKey){
        if(state.selection.includes(el.id)) state.selection = state.selection.filter(id=>id!==el.id);
        else state.selection.push(el.id);
      } else state.selection = [el.id];
      renderAll();
    });
    row.querySelector('.btn-vis').addEventListener('click', ()=>{ el.visible=!el.visible; pushHistory(); renderAll(); });
    row.querySelector('.btn-lock').addEventListener('click', ()=>{ el.locked=!el.locked; renderAll(); });
    row.querySelector('.btn-del').addEventListener('click', ()=>{ state.elements = state.elements.filter(x=>x.id!==el.id); state.selection = state.selection.filter(id=>id!==el.id); pushHistory(); renderAll(); });
    row.querySelector('.btn-up').addEventListener('click', ()=>{ reorder(el.id, 1); });
    row.querySelector('.btn-down').addEventListener('click', ()=>{ reorder(el.id, -1); });
    list.appendChild(row);
  });
  if(!state.elements.length){
    list.innerHTML = `<div class="insp-empty">No elements yet.<br>Pick a tool and draw on the canvas.</div>`;
  }
}
function reorder(id, dir){
  const idx = state.elements.findIndex(e=>e.id===id);
  const newIdx = idx+dir;
  if(newIdx<0 || newIdx>=state.elements.length) return;
  const [item] = state.elements.splice(idx,1);
  state.elements.splice(newIdx,0,item);
  pushHistory();
  renderAll();
}
function eyeIcon(){ return `<svg viewBox="0 0 16 16"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>`; }
function eyeOffIcon(){ return `<svg viewBox="0 0 16 16"><path d="M2 2l12 12M1 8s3-5 7-5c1.3 0 2.5.4 3.5 1M15 8s-1.2 2-3 3.4M6.2 6.2a2 2 0 0 0 2.8 2.8"/></svg>`; }
function lockIcon(){ return `<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>`; }
function unlockIcon(){ return `<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5 7V5a3 3 0 0 1 5.5-1.8"/></svg>`; }
function upIcon(){ return `<svg viewBox="0 0 16 16"><path d="M8 3v10M4 7l4-4 4 4"/></svg>`; }
function downIcon(){ return `<svg viewBox="0 0 16 16"><path d="M8 3v10M4 9l4 4 4-4"/></svg>`; }
function trashIcon(){ return `<svg viewBox="0 0 16 16"><path d="M3 4h10M6 4V2h4v2M4 4l1 10h6l1-10"/></svg>`; }

function field(labelText, id, value, opts){
  opts = opts||{};
  return `<div class="field"><label>${labelText}${opts.unit?`<span>${opts.unit}</span>`:''}</label>
  <input type="${opts.type||'number'}" id="${id}" value="${value}" ${opts.step?`step="${opts.step}"`:'step="any"'} ${opts.attrs||''}></div>`;
}

function renderInspector(){
  const body = document.getElementById('inspectorBody');
  const typeLabel = document.getElementById('inspTypeLabel');
  const sel = state.elements.filter(e=>state.selection.includes(e.id));
  if(!sel.length){
    typeLabel.textContent = '';
    body.innerHTML = `<div class="insp-empty">Select an element to see its exact coordinates and properties here.</div>`;
    return;
  }
  if(sel.length>1){
    typeLabel.textContent = sel.length+' selected';
    body.innerHTML = `
      <div class="small-note">${sel.length} objects selected. Group transforms below apply to each object individually.</div>
      <div class="section-title">Transform (all selected)</div>
      <div class="btn-row">
        <button id="btnRotL">Rotate −90°</button>
        <button id="btnRotR">Rotate +90°</button>
      </div>
      <div class="btn-row">
        <button id="btnFlipH">Flip Horizontal</button>
        <button id="btnFlipV">Flip Vertical</button>
      </div>
      <div class="section-title">Style</div>
      ${colorFields(sel[0])}
    `;
    wireStyleFields(sel);
    document.getElementById('btnRotL').onclick = ()=>{ sel.forEach(e=>e.rotation=(e.rotation-90)); pushHistory(); renderAll(); };
    document.getElementById('btnRotR').onclick = ()=>{ sel.forEach(e=>e.rotation=(e.rotation+90)); pushHistory(); renderAll(); };
    document.getElementById('btnFlipH').onclick = ()=>{ sel.forEach(e=>e.flipX=!e.flipX); pushHistory(); renderAll(); };
    document.getElementById('btnFlipV').onclick = ()=>{ sel.forEach(e=>e.flipV=!e.flipV); sel.forEach(e=>e.flipY=!e.flipY); pushHistory(); renderAll(); };
    return;
  }

  const el = sel[0];
  typeLabel.textContent = displayName(el);
  let html = '';

  html += `<div class="section-title">Geometry</div>`;
  html += geometryFields(el);

  html += `<div class="section-title">Transform</div>`;
  html += `<div class="field-row triple">
    ${field('Rotation','field-rotation', round2(el.rotation), {unit:'°'})}
    <div class="field"><label>Flip H</label><button id="btnFlipHs" class="${el.flipX?'active':''}">${el.flipX?'On':'Off'}</button></div>
    <div class="field"><label>Flip V</label><button id="btnFlipVs" class="${el.flipY?'active':''}">${el.flipY?'On':'Off'}</button></div>
  </div>`;
  html += `<div class="btn-row">
    <button id="btnRotL">−90°</button><button id="btnRotR">+90°</button><button id="btnRotReset">Reset</button>
  </div>`;

  html += `<div class="section-title">Style</div>`;
  html += colorFields(el);

  body.innerHTML = html;
  wireGeometryFields(el);
  wireStyleFields([el]);

  document.getElementById('field-rotation').addEventListener('change', (e)=>{
    el.rotation = parseFloat(e.target.value)||0; pushHistory(); renderAll();
  });
  document.getElementById('field-rotation').addEventListener('input', (e)=>{
    el.rotation = parseFloat(e.target.value)||0; renderElements(); renderOverlay();
  });
  document.getElementById('btnFlipHs').onclick = ()=>{ el.flipX=!el.flipX; pushHistory(); renderAll(); };
  document.getElementById('btnFlipVs').onclick = ()=>{ el.flipY=!el.flipY; pushHistory(); renderAll(); };
  document.getElementById('btnRotL').onclick = ()=>{ el.rotation-=90; pushHistory(); renderAll(); };
  document.getElementById('btnRotR').onclick = ()=>{ el.rotation+=90; pushHistory(); renderAll(); };
  document.getElementById('btnRotReset').onclick = ()=>{ el.rotation=0; pushHistory(); renderAll(); };
}

function colorFields(el){
  return `<div class="field-row">
    <div class="field"><label>Fill</label><div class="color-row"><input type="color" id="field-fill" class="swatch" value="${toHex(el.style.fill)}"><input type="text" id="field-fillText" value="${el.style.fill}"></div></div>
    <div class="field"><label>Stroke</label><div class="color-row"><input type="color" id="field-stroke" class="swatch" value="${toHex(el.style.stroke)}"><input type="text" id="field-strokeText" value="${el.style.stroke}"></div></div>
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
  const set = (fn)=>{ sel.forEach(fn); pushHistory(); renderAll(); };
  const fill = document.getElementById('field-fill');
  const fillText = document.getElementById('field-fillText');
  const stroke = document.getElementById('field-stroke');
  const strokeText = document.getElementById('field-strokeText');
  const sw = document.getElementById('field-strokeWidth');
  const fo = document.getElementById('field-fillOpacity');
  if(fill) fill.addEventListener('input', ()=>{ sel.forEach(e=>e.style.fill=fill.value); renderElements(); if(fillText) fillText.value=fill.value; });
  if(fill) fill.addEventListener('change', ()=>set(e=>e.style.fill=fill.value));
  if(fillText) fillText.addEventListener('change', ()=>set(e=>e.style.fill=fillText.value));
  if(stroke) stroke.addEventListener('input', ()=>{ sel.forEach(e=>e.style.stroke=stroke.value); renderElements(); if(strokeText) strokeText.value=stroke.value; });
  if(stroke) stroke.addEventListener('change', ()=>set(e=>e.style.stroke=stroke.value));
  if(strokeText) strokeText.addEventListener('change', ()=>set(e=>e.style.stroke=strokeText.value));
  if(sw) sw.addEventListener('change', ()=>set(e=>e.style.strokeWidth=parseFloat(sw.value)||0));
  if(fo) fo.addEventListener('change', ()=>set(e=>e.style.fillOpacity=parseFloat(fo.value)));
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
      <div class="field-row">${field('Font Size','field-fontSize',round2(el.attrs.fontSize))}<div class="field"><label>Content</label><input type="text" id="field-content" value="${escapeAttr(el.attrs.content||'')}"></div></div>`;
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
  let html = `<div class="small-note">${el.attrs.commands.length} commands. Drag anchor/control nodes on canvas.</div>`;
  el.attrs.commands.forEach((c,i)=>{
    html += `<div class="cmd-block" data-idx="${i}">
      <div class="cmd-head"><span class="cmd-tag">${cmdLabel(c.type)}</span><button class="del" data-idx="${i}">✕</button></div>
      <div class="cmd-grid">${cmdParamFields(c,i)}</div>
    </div>`;
  });
  html += `<div class="btn-row">
    <button class="addcmd" data-t="L">+ Line</button>
    <button class="addcmd" data-t="H">+ Horiz</button>
    <button class="addcmd" data-t="V">+ Vert</button>
  </div>
  <div class="btn-row">
    <button class="addcmd" data-t="C">+ Cubic</button>
    <button class="addcmd" data-t="Q">+ Quadratic</button>
    <button class="addcmd" data-t="S">+ Smooth</button>
    <button class="addcmd" data-t="Z">+ Close</button>
  </div>
  <div class="section-title">Path Data (d)</div>
  <textarea id="pathDField">${pathToD(el.attrs.commands)}</textarea>`;
  return html;
}
function cmdLabel(t){
  const map = {M:'M — Move To', L:'L — Line To', H:'H — Horizontal', V:'V — Vertical', C:'C — Cubic Bézier', S:'S — Smooth Cubic', Q:'Q — Quadratic Bézier', T:'T — Smooth Quad', Z:'Z — Close Path'};
  return map[t]||t;
}
function cmdParamFields(c,i){
  const f = (label,key)=>`<div class="field"><label>${label}</label><input type="number" step="any" class="cmd-field" data-idx="${i}" data-key="${key}" value="${round2(c[key])}"></div>`;
  switch(c.type){
    case 'M': case 'L': case 'T': return f('X','x')+f('Y','y');
    case 'H': return f('X','x');
    case 'V': return f('Y','y');
    case 'C': return f('X1','x1')+f('Y1','y1')+f('X2','x2')+f('Y2','y2')+f('X','x')+f('Y','y');
    case 'S': return f('X2','x2')+f('Y2','y2')+f('X','x')+f('Y','y');
    case 'Q': return f('X1','x1')+f('Y1','y1')+f('X','x')+f('Y','y');
    case 'Z': return '<div class="small-note">No parameters.</div>';
  }
  return '';
}
function escapeAttr(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }

function wireGeometryFields(el){
  const commit = ()=>{ pushHistory(); renderAll(); };
  const live = ()=>{ renderElements(); renderOverlay(); };

  function bindNum(id, apply){
    const input = document.getElementById(id);
    if(!input) return;
    input.addEventListener('input', ()=>{ apply(parseFloat(input.value)||0); live(); });
    input.addEventListener('change', commit);
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
    case 'text':
      bindNum('field-x', v=>el.attrs.x=v);
      bindNum('field-y', v=>el.attrs.y=v);
      bindNum('field-fontSize', v=>el.attrs.fontSize=Math.max(v,1));
      const cField = document.getElementById('field-content');
      if(cField){
        cField.addEventListener('input', ()=>{ el.attrs.content=cField.value; live(); });
        cField.addEventListener('change', commit);
      }
      break;
    case 'polygon': case 'polyline':
      document.querySelectorAll('.pt-x').forEach(inp=>{
        inp.addEventListener('input', ()=>{ el.attrs.points[+inp.dataset.idx].x = parseFloat(inp.value)||0; live(); });
        inp.addEventListener('change', commit);
      });
      document.querySelectorAll('.pt-y').forEach(inp=>{
        inp.addEventListener('input', ()=>{ el.attrs.points[+inp.dataset.idx].y = parseFloat(inp.value)||0; live(); });
        inp.addEventListener('change', commit);
      });
      document.querySelectorAll('.pt-del').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          if(el.attrs.points.length<=2) return;
          el.attrs.points.splice(+btn.dataset.idx,1); commit();
        });
      });
      const addBtn = document.getElementById('btnAddPoint');
      if(addBtn) addBtn.addEventListener('click', ()=>{
        const pts = el.attrs.points;
        const last = pts[pts.length-1], prev = pts[pts.length-2]||last;
        pts.push({ x: round2(last.x + (last.x-prev.x||10)), y: round2(last.y + (last.y-prev.y||10)) });
        commit();
      });
      break;
    case 'path':
      document.querySelectorAll('.cmd-field').forEach(inp=>{
        inp.addEventListener('input', ()=>{
          const c = el.attrs.commands[+inp.dataset.idx];
          c[inp.dataset.key] = parseFloat(inp.value)||0;
          live();
        });
        inp.addEventListener('change', commit);
      });
      document.querySelectorAll('.cmd-block .del').forEach(btn=>{
        btn.addEventListener('click', ()=>{ el.attrs.commands.splice(+btn.dataset.idx,1); commit(); });
      });
      document.querySelectorAll('.addcmd').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const cmds = el.attrs.commands;
          const last = pathAllPoints(cmds).slice(-1)[0] || {x:0,y:0};
          const t = btn.dataset.t;
          let c;
          if(t==='Z') c = {type:'Z'};
          else if(t==='H') c = {type:'H', x:last.x+20, y:last.y};
          else if(t==='V') c = {type:'V', x:last.x, y:last.y+20};
          else if(t==='C') c = {type:'C', x1:last.x+10,y1:last.y-15,x2:last.x+20,y2:last.y+15,x:last.x+30,y:last.y};
          else if(t==='S') c = {type:'S', x2:last.x+20,y2:last.y+15,x:last.x+30,y:last.y};
          else if(t==='Q') c = {type:'Q', x1:last.x+15,y1:last.y-20,x:last.x+30,y:last.y};
          cmds.push(c);
          commit();
        });
      });
      const dField = document.getElementById('pathDField');
      if(dField){
        dField.addEventListener('change', ()=>{
          try{
            const cmds = parseDToCommands(dField.value);
            if(cmds.length){ el.attrs.commands = cmds; commit(); }
          }catch(err){ toast('Could not parse path data'); }
        });
      }
      break;
  }
}

const codeText = document.getElementById('codeText');
const codeHighlight = document.getElementById('codeHighlight').querySelector('code');
let codeEditingByUser = false;

function elementToMarkup(el, indent){
  if(!el.visible) return '';
  const pad = '  '.repeat(indent);
  const a = el.attrs;
  const styleAttrs = `fill="${el.style.fill}" stroke="${el.style.stroke}" stroke-width="${el.style.strokeWidth}"${el.style.fillOpacity!=null?` fill-opacity="${el.style.fillOpacity}"`:''}`;
  const t = elementTransform(el);
  const transformAttr = t? ` transform="${t}"` : '';
  let tag = '';
  switch(el.type){
    case 'rect': case 'rrect':
      tag = `<rect x="${round2(a.x)}" y="${round2(a.y)}" width="${round2(a.width)}" height="${round2(a.height)}"${el.type==='rrect'?` rx="${round2(a.rx||0)}" ry="${round2(a.ry!=null?a.ry:(a.rx||0))}"`:''} ${styleAttrs}${transformAttr}/>`; break;
    case 'circle':
      tag = `<circle cx="${round2(a.cx)}" cy="${round2(a.cy)}" r="${round2(a.r)}" ${styleAttrs}${transformAttr}/>`; break;
    case 'ellipse':
      tag = `<ellipse cx="${round2(a.cx)}" cy="${round2(a.cy)}" rx="${round2(a.rx)}" ry="${round2(a.ry)}" ${styleAttrs}${transformAttr}/>`; break;
    case 'line':
      tag = `<line x1="${round2(a.x1)}" y1="${round2(a.y1)}" x2="${round2(a.x2)}" y2="${round2(a.y2)}" ${styleAttrs}${transformAttr}/>`; break;
    case 'polygon': case 'polyline':
      tag = `<${el.type} points="${a.points.map(p=>`${round2(p.x)},${round2(p.y)}`).join(' ')}" ${styleAttrs}${transformAttr}/>`; break;
    case 'path':
      tag = `<path d="${pathToD(a.commands)}" ${styleAttrs}${transformAttr}/>`; break;
    case 'text':
      tag = `<text x="${round2(a.x)}" y="${round2(a.y)}" font-size="${a.fontSize}" font-family="${a.fontFamily||'monospace'}" fill="${el.style.fill}"${transformAttr}>${escapeXml(a.content||'')}</text>`; break;
    case 'raw':
      tag = a.html; break;
  }
  return pad + tag;
}
function escapeXml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function computeContentBounds(){
  if(!state.elements.length) return {x:0,y:0,w:400,h:300};
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  state.elements.forEach(el=>{
    const b = localBBox(el);
    minX=Math.min(minX,b.x); minY=Math.min(minY,b.y);
    maxX=Math.max(maxX,b.x+b.w); maxY=Math.max(maxY,b.y+b.h);
  });
  const pad = 10;
  return { x:round2(minX-pad), y:round2(minY-pad), w:round2(maxX-minX+pad*2), h:round2(maxY-minY+pad*2) };
}

function serializeSVG(){
  const b = computeContentBounds();
  const body = state.elements.map(el=>elementToMarkup(el,1)).filter(Boolean).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" width="${round2(b.w)}" height="${round2(b.h)}">\n${body}\n</svg>`;
}

function highlightXML(src){
  return src.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/(&lt;\/?)([a-zA-Z0-9]+)/g, '$1<span class="tok-tag">$2</span>')
    .replace(/([a-zA-Z-]+)(=)(&quot;|")([^"]*)(&quot;|")/g, '<span class="tok-attr">$1</span>$2<span class="tok-str">$3$4$5</span>')
    .replace(/(\/?&gt;)/g, '<span class="tok-punc">$1</span>');
}

function syncCodePanel(){
  if(codeEditingByUser) return;
  const src = serializeSVG();
  codeText.value = src;
  codeHighlight.innerHTML = highlightXML(src);
}
codeText.addEventListener('scroll', ()=>{
  codeHighlight.parentElement.scrollTop = codeText.scrollTop;
  codeHighlight.parentElement.scrollLeft = codeText.scrollLeft;
});
codeText.addEventListener('focus', ()=>{ codeEditingByUser = true; });
codeText.addEventListener('input', ()=>{
  codeHighlight.innerHTML = highlightXML(codeText.value);
});
codeText.addEventListener('blur', ()=>{
  codeEditingByUser = false;
  try{
    importSVGSource(codeText.value, true);
  }catch(err){
    toast('Could not parse SVG source');
    syncCodePanel();
  }
});

document.getElementById('codeTabHeader').addEventListener('click', (e)=>{
  if(e.target.id==='btnCopySvg') return;
  document.getElementById('bottomPanel').classList.toggle('collapsed');
});
document.getElementById('btnCopySvg').addEventListener('click', (e)=>{
  e.stopPropagation();
  navigator.clipboard.writeText(serializeSVG()).then(()=>toast('SVG copied to clipboard'));
});

function importSVGSource(src, keepView){
  const parser = new DOMParser();
  const doc = parser.parseFromString(src, 'image/svg+xml');
  const errNode = doc.querySelector('parsererror');
  if(errNode) throw new Error('parse error');
  const root = doc.documentElement;
  const newElements = [];
  function walk(node){
    Array.from(node.children).forEach(child=>{
      const tag = child.tagName.toLowerCase();
      if(tag==='rect'){
        const rx = parseFloat(child.getAttribute('rx'))||0;
        newElements.push(makeImportedElement(rx>0?'rrect':'rect', {
          x:num(child,'x'), y:num(child,'y'), width:num(child,'width'), height:num(child,'height'),
          rx, ry: parseFloat(child.getAttribute('ry'))||rx
        }, child));
      } else if(tag==='circle'){
        newElements.push(makeImportedElement('circle', { cx:num(child,'cx'), cy:num(child,'cy'), r:num(child,'r') }, child));
      } else if(tag==='ellipse'){
        newElements.push(makeImportedElement('ellipse', { cx:num(child,'cx'), cy:num(child,'cy'), rx:num(child,'rx'), ry:num(child,'ry') }, child));
      } else if(tag==='line'){
        newElements.push(makeImportedElement('line', { x1:num(child,'x1'), y1:num(child,'y1'), x2:num(child,'x2'), y2:num(child,'y2') }, child));
      } else if(tag==='polygon' || tag==='polyline'){
        const pts = (child.getAttribute('points')||'').trim().split(/\s+/).filter(Boolean).map(pair=>{
          const [x,y] = pair.split(',').map(parseFloat); return {x:x||0,y:y||0};
        });
        newElements.push(makeImportedElement(tag, { points:pts }, child));
      } else if(tag==='path'){
        const cmds = parseDToCommands(child.getAttribute('d')||'');
        newElements.push(makeImportedElement('path', { commands:cmds }, child));
      } else if(tag==='text'){
        newElements.push(makeImportedElement('text', { x:num(child,'x'), y:num(child,'y'), fontSize: parseFloat(child.getAttribute('font-size'))||16, fontFamily: child.getAttribute('font-family')||'ui-monospace, monospace', content: child.textContent }, child));
      } else if(tag==='g'){
        walk(child);
      } else {

      }
    });
  }
  function num(node, attr){ return parseFloat(node.getAttribute(attr))||0; }
  walk(root);
  state.elements = newElements;
  state.selection = [];
  pushHistory();
  if(!keepView) fitToContent(); else renderAll();
}

function makeImportedElement(type, attrs, node){
  const el = makeElement(type, attrs);
  el.style.fill = node.getAttribute('fill') || (type==='line'||type==='polyline'||type==='path' ? 'none' : el.style.fill);
  el.style.stroke = node.getAttribute('stroke') || el.style.stroke;
  const swAttr = node.getAttribute('stroke-width');
  if(swAttr) el.style.strokeWidth = parseFloat(swAttr);
  const foAttr = node.getAttribute('fill-opacity');
  if(foAttr) el.style.fillOpacity = parseFloat(foAttr);
  const tr = node.getAttribute('transform');
  if(tr){
    const rm = /rotate\(\s*([\-\d.]+)/.exec(tr);
    if(rm) el.rotation = parseFloat(rm[1]);
  }
  return el;
}

document.getElementById('btnNew').addEventListener('click', ()=>{
  if(state.elements.length && !confirm('Start a new document? This clears the current canvas.')) return;
  state.elements = []; state.selection = [];
  pushHistory(); initView(); renderAll();
});
document.getElementById('btnUndo').addEventListener('click', undo);
document.getElementById('btnRedo').addEventListener('click', redo);
document.getElementById('btnDuplicate').addEventListener('click', duplicateSelection);
document.getElementById('btnDelete').addEventListener('click', deleteSelection);

document.getElementById('btnZoomIn').addEventListener('click', ()=>setZoom(state.view.zoom*1.25));
document.getElementById('btnZoomOut').addEventListener('click', ()=>setZoom(state.view.zoom*0.8));
document.getElementById('btnZoomFit').addEventListener('click', fitToContent);
document.getElementById('btnZoom100').addEventListener('click', ()=>setZoom(1));
document.getElementById('zoomPct').addEventListener('change', (e)=>{
  const v = parseFloat(e.target.value)/100;
  if(v>0) setZoom(v);
});

document.getElementById('chkGrid').addEventListener('change', (e)=>{ state.gridVisible=e.target.checked; renderView(); });
document.getElementById('chkSnap').addEventListener('change', (e)=>{ state.snap=e.target.checked; });
document.getElementById('gridSizeInput').addEventListener('change', (e)=>{
  state.gridSize = Math.max(0.1, parseFloat(e.target.value)||10);
  renderView();
});

document.getElementById('btnExport').addEventListener('click', ()=>{
  const src = serializeSVG();
  const blob = new Blob([src], {type:'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'drawing.svg';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('SVG exported');
});
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

function handleResize(){
  const cs = containerSize();
  const oldW = state.view.w, oldH = state.view.h;
  state.view.w = cs.w/state.view.zoom;
  state.view.h = cs.h/state.view.zoom;
  renderView();
}
window.addEventListener('resize', handleResize);
new ResizeObserver(handleResize).observe(canvasScroll);

function seedExample(){
  const rect = makeElement('rrect', { x:40, y:40, width:160, height:100, rx:10, ry:10 });
  rect.style.fill = '#4fd1c5'; rect.style.fillOpacity = 0.18; rect.style.stroke = '#4fd1c5';
  const circle = makeElement('circle', { cx:320, cy:110, r:55 });
  circle.style.fill = '#e0a95a'; circle.style.fillOpacity=0.16; circle.style.stroke = '#e0a95a';
  const line = makeElement('line', { x1:40, y1:200, x2:400, y2:200 });
  const path = makeElement('path', { commands:[
    {type:'M', x:60, y:280}, {type:'C', x1:100,y1:220, x2:180,y2:340, x:220,y:280},
    {type:'S', x2:320,y2:340, x:360,y:280}
  ]});
  path.style.stroke = '#e05a9e';
  const text = makeElement('text', { x:60, y:340, fontSize:18, fontFamily:'ui-monospace, monospace', content:'Drag me. Then fine-tune →' });
  state.elements.push(rect, circle, line, path, text);
}

function init(){
  buildToolbar();
  seedExample();
  initView();
  pushHistory();
  renderAll();
  fitToContent();
}
init();

})();
