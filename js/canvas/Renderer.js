import { state } from '../app/State.js';
import { elementsLayer, overlayLayer, defsLayer } from '../app/dom.js';
import { Matrix } from '../utils/Matrix.js';
import {
  getChildren, getElement, getElementMatrix, getLocalBounds, getWorldTransform,
  getWorldBounds,
} from '../document/Element.js';
import { pathToD } from '../svg/PathParser.js';
import { scalePxPerUnit, setOverlayRenderCallback } from './Navigation.js';

const SVG_NS = "http://www.w3.org/2000/svg";
const TAGS = { rect:'rect', rrect:'rect', circle:'circle', ellipse:'ellipse', line:'line',
  polygon:'polygon', polyline:'polyline', path:'path', text:'text', group:'g' };

let nodeById = new Map();
let gradientNodeById = new Map();



export function resetRenderCache(){
  nodeById.forEach(n=>n.remove());
  nodeById = new Map();
  gradientNodeById.forEach(n=>n.remove());
  gradientNodeById = new Map();
}





export function renderDefs(){
  const defs = state.document.defs || [];
  const seen = new Set();
  defs.forEach(g=>{
    seen.add(g.id);
    const tag = g.kind==='radial' ? 'radialGradient' : 'linearGradient';
    let node = gradientNodeById.get(g.id);
    if(node && node.tagName.toLowerCase()!==tag.toLowerCase()){
      node.remove(); gradientNodeById.delete(g.id); node = null;
    }
    if(!node){
      node = document.createElementNS(SVG_NS, tag);
      node.setAttribute('id', g.id);
      gradientNodeById.set(g.id, node);
    }
    if(g.kind==='radial'){
      node.setAttribute('cx', g.cx); node.setAttribute('cy', g.cy); node.setAttribute('r', g.r);
    } else {
      node.setAttribute('x1', g.x1); node.setAttribute('y1', g.y1);
      node.setAttribute('x2', g.x2); node.setAttribute('y2', g.y2);
    }

    node.innerHTML = '';
    g.stops.forEach(s=>{
      const stopNode = document.createElementNS(SVG_NS, 'stop');
      stopNode.setAttribute('offset', s.offset);
      stopNode.setAttribute('stop-color', s.color);
      if(s.opacity!=null && s.opacity<1) stopNode.setAttribute('stop-opacity', s.opacity);
      node.appendChild(stopNode);
    });
    if(node.parentNode !== defsLayer) defsLayer.appendChild(node);
  });
  Array.from(defsLayer.children).forEach(node=>{
    const id = node.getAttribute('id');
    if(id && !seen.has(id)){ node.remove(); gradientNodeById.delete(id); }
  });
}

function getOrCreateNode(el){
  let node = nodeById.get(el.id);
  const tag = el.type==='raw' ? (el.attrs.tag||'g') : TAGS[el.type];
  if(node && node.tagName.toLowerCase() !== tag.toLowerCase()){
    node.remove(); nodeById.delete(el.id); node = null;
  }
  if(!node){
    node = document.createElementNS(SVG_NS, tag);
    node.setAttribute('data-id', el.id);
    nodeById.set(el.id, node);
  }
  return node;
}

function applyShapeAttrs(node, el){
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






    node.setAttribute('font-weight', a.fontWeight || 'normal');
    node.setAttribute('font-style', a.fontStyle || 'normal');
    node.setAttribute('text-anchor', a.textAnchor || 'start');
    if(a.letterSpacing) node.setAttribute('letter-spacing', a.letterSpacing);
    else node.removeAttribute('letter-spacing');
    node.textContent = a.content!=null? a.content : 'Text';
  } else if(el.type==='raw'){
    if(node.getAttribute('data-raw-html') !== a.html){
      node.innerHTML = a.html;
      node.setAttribute('data-raw-html', a.html);
    }
  }
  if(el.style){
    node.setAttribute('fill', el.style.fill);
    node.setAttribute('stroke', el.style.stroke);
    node.setAttribute('stroke-width', el.style.strokeWidth);
    if(el.style.fillOpacity!=null) node.setAttribute('fill-opacity', el.style.fillOpacity);
    if(el.style.strokeOpacity!=null && el.style.strokeOpacity<1) node.setAttribute('stroke-opacity', el.style.strokeOpacity);
    else node.removeAttribute('stroke-opacity');
    if(el.style.strokeLinecap && el.style.strokeLinecap!=='butt') node.setAttribute('stroke-linecap', el.style.strokeLinecap);
    else node.removeAttribute('stroke-linecap');
    if(el.style.strokeLinejoin && el.style.strokeLinejoin!=='miter') node.setAttribute('stroke-linejoin', el.style.strokeLinejoin);
    else node.removeAttribute('stroke-linejoin');
    if(el.style.strokeDasharray) node.setAttribute('stroke-dasharray', el.style.strokeDasharray);
    else node.removeAttribute('stroke-dasharray');
    if(el.style.strokeDashoffset) node.setAttribute('stroke-dashoffset', el.style.strokeDashoffset);
    else node.removeAttribute('stroke-dashoffset');
  }
}
function round2(n){ return Math.round(n*100)/100; }

function applyElementNode(doc, el, node){
  if(el.type !== 'group') applyShapeAttrs(node, el);
  node.setAttribute('visibility', el.visible? 'visible':'hidden');
  const t = Matrix.toAttrString(getElementMatrix(doc, el));
  if(t) node.setAttribute('transform', t); else node.removeAttribute('transform');
  node.style.cursor = el.locked ? 'not-allowed' : (state.tool==='select' ? 'move' : 'inherit');
}

function syncLevel(doc, parentId, container){
  const children = getChildren(doc, parentId);






  const bulkFragment = container.children.length === 0 ? document.createDocumentFragment() : null;
  const seen = new Set();
  children.forEach(el=>{
    const node = getOrCreateNode(el);
    seen.add(el.id);
    applyElementNode(doc, el, node);
    if(bulkFragment) bulkFragment.appendChild(node);
    else if(node.parentNode !== container) container.appendChild(node);
    if(el.type === 'group') syncLevel(doc, el.id, node);
  });
  if(bulkFragment) container.appendChild(bulkFragment);
  Array.from(container.children).forEach(node=>{
    const id = node.getAttribute && node.getAttribute('data-id');
    if(id && !seen.has(id)){ node.remove(); nodeById.delete(id); }
  });
  children.forEach(el=>{
    const node = nodeById.get(el.id);
    if(node) container.appendChild(node);
  });
}

export function renderElements(){
  renderDefs();
  syncLevel(state.document, null, elementsLayer);
}



const HANDLE_PX = 7;
function handlePxToSvg(){ return HANDLE_PX/scalePxPerUnit(); }
function svgEl(tag, attrs){
  const n = document.createElementNS(SVG_NS, tag);
  for(const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
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

function renderSingleSelectionHandles(doc, el){
  const b = getLocalBounds(doc, el);
  const parentWorld = el.parentId ? getWorldTransform(doc, getElement(doc, el.parentId)) : Matrix.identity();
  const worldT = Matrix.multiply(parentWorld, getElementMatrix(doc, el));
  const t = Matrix.toAttrString(worldT);
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
  } else if(el.type==='group'){


    addBoxHandles(g, b, hs);
  } else {
    addBoxHandles(g, b, hs);
  }
  overlayLayer.appendChild(g);
}

function addBoxHandles(g, b, hs){
  const pts = {
    nw:[b.x,b.y], n:[b.x+b.w/2,b.y], ne:[b.x+b.w,b.y],
    w:[b.x,b.y+b.h/2], e:[b.x+b.w,b.y+b.h/2],
    sw:[b.x,b.y+b.h], s:[b.x+b.w/2,b.y+b.h], se:[b.x+b.w,b.y+b.h],
  };
  const cursors = {nw:'nwse-resize',n:'ns-resize',ne:'nesw-resize',w:'ew-resize',e:'ew-resize',sw:'nesw-resize',s:'ns-resize',se:'nwse-resize'};
  Object.keys(pts).forEach(k=>{
    g.appendChild(makeHandle(pts[k][0],pts[k][1],hs,k,cursors[k]));
  });
  const strokeW = 1/scalePxPerUnit();
  const rx = b.x+b.w/2, ry = b.y - 26/scalePxPerUnit();
  g.appendChild(svgEl('line',{x1:b.x+b.w/2,y1:b.y,x2:rx,y2:ry,stroke:'#4fd1c5','stroke-width':strokeW}));
  g.appendChild(makeHandle(rx,ry,hs,'rotate','grab','#e0a95a', true));
}

function renderMultiSelectionBox(doc, sel){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  sel.forEach(el=>{
    const b = getWorldBounds(doc, el);
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
    const b = getWorldBounds(doc, el);
    overlayLayer.appendChild(svgEl('rect',{x:b.x,y:b.y,width:b.w,height:b.h,fill:'none',stroke:'#4fd1c5','stroke-width':strokeW*0.8,'stroke-dasharray':`${strokeW*2},${strokeW*2}`,'pointer-events':'none'}));
  });




  const hs = handlePxToSvg();
  addBoxHandles(overlayLayer, { x:minX, y:minY, w:maxX-minX, h:maxY-minY }, hs);
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

function renderActiveGroupIndicator(doc){
  if(!state.activeGroupId) return;
  const group = getElement(doc, state.activeGroupId);
  if(!group) return;
  const b = getLocalBounds(doc, group);
  const worldT = getWorldTransform(doc, group);
  const t = Matrix.toAttrString(worldT);
  const g = svgEl('g', {});
  if(t) g.setAttribute('transform', t);
  const strokeW = 1.5/scalePxPerUnit();
  g.appendChild(svgEl('rect', {
    x:b.x-4, y:b.y-4, width:b.w+8, height:b.h+8, fill:'none',
    stroke:'#e0a95a', 'stroke-width':strokeW, 'stroke-dasharray':`${strokeW*2},${strokeW*1.5}`,
    'pointer-events':'none'
  }));
  overlayLayer.appendChild(g);
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

export function renderOverlay(){
  overlayLayer.innerHTML = '';
  const doc = state.document;
  renderActiveGroupIndicator(doc);
  if(state.drawing) renderDrawingPreview();
  const sel = state.selection.map(id=>getElement(doc,id)).filter(Boolean);
  if(!sel.length) return;
  if(sel.length===1){
    renderSingleSelectionHandles(doc, sel[0]);
  } else {
    renderMultiSelectionBox(doc, sel);
  }
  renderAlignmentGuides();
}

setOverlayRenderCallback(renderOverlay);
