import { state } from '../app/State.js';
import { svgRoot, canvasScroll, gridLayer, rulerTop, rulerLeft } from '../app/dom.js';

const SVG_NS = "http://www.w3.org/2000/svg";

export function containerSize(){
  const r = canvasScroll.getBoundingClientRect();
  return { w:r.width||800, h:r.height||600 };
}
export function screenToSVG(clientX, clientY){
  const r = svgRoot.getBoundingClientRect();
  const cs = containerSize();
  const sx = state.view.w / cs.w;
  const sy = state.view.h / cs.h;
  return {
    x: state.view.x + (clientX - r.left) * sx,
    y: state.view.y + (clientY - r.top) * sy
  };
}
export function scalePxPerUnit(){
  const cs = containerSize();
  return cs.w / state.view.w;
}
export function setZoom(newZoom, centerClientX, centerClientY){
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
export function initView(){
  const cs = containerSize();
  state.view.zoom = 1;
  state.view.w = cs.w;
  state.view.h = cs.h;
  state.view.x = -cs.w*0.1;
  state.view.y = -cs.h*0.1;
}
export function panBy(dxSvg, dySvg){
  state.view.x += dxSvg;
  state.view.y += dySvg;
  renderView();
}
export function fitToContent(bounds){
  if(!bounds){ initView(); renderView(); return; }
  let { x:minX, y:minY, w, h } = bounds;
  let maxX = minX+w, maxY = minY+h;
  const pad = Math.max(w,h) * 0.15 || 40;
  minX-=pad; minY-=pad; maxX+=pad; maxY+=pad;
  const cs = containerSize();
  const bw = Math.max(maxX-minX, 10), bh = Math.max(maxY-minY, 10);
  const zoom = Math.min(cs.w/bw, cs.h/bh);
  state.view.zoom = zoom;
  state.view.w = cs.w/zoom; state.view.h = cs.h/zoom;
  state.view.x = minX - (state.view.w - bw)/2;
  state.view.y = minY - (state.view.h - bh)/2;
  document.getElementById('zoomPct').value = Math.round(zoom*100)+'%';
  renderView();
}

function niceStep(){
  const base = state.document.settings.gridSize;
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

let overlayRenderCallback = null;
export function setOverlayRenderCallback(fn){ overlayRenderCallback = fn; }

export function renderView(){
  svgRoot.setAttribute('viewBox', `${state.view.x} ${state.view.y} ${state.view.w} ${state.view.h}`);
  renderGrid();
  renderRulers();
  if(overlayRenderCallback) overlayRenderCallback();
}
