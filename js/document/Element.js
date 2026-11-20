import { uid } from '../utils/ids.js';
import { Matrix } from '../utils/Matrix.js';
import { Geometry } from '../utils/Geometry.js';


























export function defaultStyle(){
  return {
    fill:'#4fd1c5', stroke:'#0b0d10', strokeWidth:1.5, fillOpacity:0.85,




    strokeOpacity: 1, strokeLinecap:'butt', strokeLinejoin:'miter',
    strokeDasharray: '', strokeDashoffset: 0,
  };
}

export function createElement(type, attrs, parentId){
  const el = {
    id: uid('el'), type, name: null, parentId: parentId || null,
    attrs, style: defaultStyle(),
    rotation: 0, flipX: false, flipY: false,
    visible: true, locked: false,
  };
  if(type==='line'){ el.style.fill='none'; el.style.stroke='#4fd1c5'; el.style.strokeWidth=2; }
  if(type==='text'){ el.style.fill='#cfd6dd'; el.style.stroke='none'; }
  if(type==='polyline' || type==='path'){ el.style.fill='none'; el.style.stroke='#4fd1c5'; el.style.strokeWidth=2; }
  return el;
}

export function createGroup(parentId){
  return {
    id: uid('grp'), type:'group', name:null, parentId: parentId || null,
    attrs: {}, style: null,
    transform: Matrix.identity(),
    visible: true, locked: false,
  };
}

export function displayName(el){
  const map = { rect:'Rectangle', rrect:'Rounded Rect', circle:'Circle', ellipse:'Ellipse',
    line:'Line', polygon:'Polygon', polyline:'Polyline', path:'Path', text:'Text',
    raw:'Imported', group:'Group' };
  return el.name || map[el.type] || el.type;
}



export function getElement(doc, id){
  return doc.elements.find(e=>e.id===id) || null;
}
export function getChildren(doc, parentId){
  return doc.elements.filter(e=>e.parentId === (parentId||null));
}

export function getAncestors(doc, el){
  const chain = [];
  let p = el.parentId ? getElement(doc, el.parentId) : null;
  while(p){
    chain.unshift(p);
    p = p.parentId ? getElement(doc, p.parentId) : null;
  }
  return chain;
}
export function getDescendantIds(doc, id){
  const out = [];
  const stack = [id];
  while(stack.length){
    const cur = stack.pop();
    getChildren(doc, cur).forEach(c=>{ out.push(c.id); stack.push(c.id); });
  }
  return out;
}


export function getTopLevelAncestor(doc, el){
  let cur = el;
  while(cur.parentId){
    const p = getElement(doc, cur.parentId);
    if(!p) break;
    cur = p;
  }
  return cur;
}



function shapeLocalBounds(el){
  const a = el.attrs;
  switch(el.type){
    case 'rect': case 'rrect':
      return Geometry.rectBounds(a.x, a.y, Math.max(a.width,0.0001), Math.max(a.height,0.0001));
    case 'circle':
      return Geometry.circleBounds(a.cx, a.cy, Math.max(a.r,0.0001));
    case 'ellipse':
      return Geometry.ellipseBounds(a.cx, a.cy, Math.max(a.rx,0.0001), Math.max(a.ry,0.0001));
    case 'line': {
      const b = Geometry.lineBounds(a.x1,a.y1,a.x2,a.y2);
      return { x:b.x, y:b.y, w:Math.max(b.w,0.0001), h:Math.max(b.h,0.0001) };
    }
    case 'polygon': case 'polyline': {
      const b = Geometry.pointsBounds(a.points);
      return { x:b.x, y:b.y, w:Math.max(b.w,0.0001), h:Math.max(b.h,0.0001) };
    }
    case 'path': {
      const b = Geometry.pathBounds(a.commands);
      return { x:b.x, y:b.y, w:Math.max(b.w,0.0001), h:Math.max(b.h,0.0001) };
    }
    case 'text': {








      const fs = a.fontSize || 16;
      const len = (a.content||'').length;
      const isBold = a.fontWeight==='bold' || (typeof a.fontWeight==='number' && a.fontWeight>=600);
      const ls = a.letterSpacing || 0;
      const w = Math.max(len * fs * 0.58 * (isBold?1.08:1) + Math.max(len-1,0)*ls, fs*0.6);
      const anchor = a.textAnchor || 'start';
      const x0 = anchor==='middle' ? a.x - w/2 : anchor==='end' ? a.x - w : a.x;
      return { x:x0, y:a.y-fs*0.8, w, h:fs*1.2 };
    }
    case 'raw':
      return a.bbox || {x:0,y:0,w:10,h:10};
  }
  return {x:0,y:0,w:0,h:0};
}
export { shapeLocalBounds };





export function getElementMatrix(doc, el){
  if(el.type === 'group') return el.transform;
  const b = shapeLocalBounds(el);
  const cx = b.x + b.w/2, cy = b.y + b.h/2;
  return Matrix.fromRotateFlip(el.rotation||0, !!el.flipX, !!el.flipY, cx, cy);
}




export function getLocalBounds(doc, el){
  if(el.type === 'group'){
    const children = getChildren(doc, el.id).filter(c=>c.visible);
    if(!children.length) return {x:0,y:0,w:0,h:0};
    const boxes = children.map(c=>getParentSpaceBounds(doc, c));
    return Geometry.mergeBounds(boxes);
  }
  return shapeLocalBounds(el);
}




export function getParentSpaceBounds(doc, el){
  const local = getLocalBounds(doc, el);
  const m = getElementMatrix(doc, el);
  return Matrix.transformBounds(m, local);
}



export function getWorldTransform(doc, el){
  let m = Matrix.identity();
  getAncestors(doc, el).forEach(a=>{ m = Matrix.multiply(m, getElementMatrix(doc, a)); });
  return Matrix.multiply(m, getElementMatrix(doc, el));
}





export function getParentWorldTransform(doc, el){
  const parent = el.parentId ? getElement(doc, el.parentId) : null;
  return parent ? getWorldTransform(doc, parent) : Matrix.identity();
}







export function getWorldBounds(doc, el){
  const local = getLocalBounds(doc, el);
  const world = getWorldTransform(doc, el);
  return Matrix.transformBounds(world, local);
}
