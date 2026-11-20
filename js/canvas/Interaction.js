import { state } from '../app/State.js';
import { svgRoot, overlayLayer, pathHint } from '../app/dom.js';
import { Matrix } from '../utils/Matrix.js';
import { uid } from '../utils/ids.js';
import {
  createElement, getElement, getChildren, getDescendantIds, getTopLevelAncestor,
  getLocalBounds, getParentSpaceBounds, getParentWorldTransform, getWorldBounds,
  shapeLocalBounds,
} from '../document/Element.js';
import { canGroup, canUngroup, planGroup, planUngroup } from '../document/Groups.js';
import { createDocument } from '../document/Document.js';
import { snapshotElements, makeSetPropsCommand, makeReplaceElementsCommand } from '../document/Commands.js';
import * as History from '../document/History.js';
import { screenToSVG, scalePxPerUnit, setZoom, panBy, renderView } from './Navigation.js';
import { computeAlignmentSnap, snapValue } from './Snapping.js';
import { findNearestDataId } from './HitTest.js';
import { renderAll, renderOverlay } from '../app/renderAll.js';
import { resetRenderCache, renderElements } from './Renderer.js';
import { resetLayersRenderCache } from '../ui/Layers.js';
import { showMenu, closeMenu } from '../ui/ContextMenu.js';

function doc(){ return state.document; }
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), 1400);
}





export function clearSelection(){ state.selection = []; }

export function selectAll(){
  const scopeParent = state.activeGroupId || null;
  state.selection = getChildren(doc(), scopeParent).filter(e=>e.visible && !e.locked).map(e=>e.id);
  renderAll();
}









function resolveClickTarget(hitId){
  if(!hitId) return { id:null, exitGroup:false };
  const el = getElement(doc(), hitId);
  if(!el) return { id:null, exitGroup:false };
  if(state.activeGroupId){
    let cur = el;
    while(cur && cur.parentId !== state.activeGroupId){
      if(!cur.parentId) return { id:null, exitGroup:true };
      cur = getElement(doc(), cur.parentId);
    }
    return cur ? { id:cur.id, exitGroup:false } : { id:null, exitGroup:true };
  }
  return { id: getTopLevelAncestor(doc(), el).id, exitGroup:false };
}









function commitProps(ids, before, after){
  History.push(state.history, makeSetPropsCommand(doc(), before, after));
}

export function rotateElementsBy(ids, deltaDeg){
  const before = snapshotElements(doc(), ids);
  ids.forEach(id=>{
    const el = getElement(doc(), id);
    if(!el || el.locked) return;
    if(el.type === 'group'){
      const b = getParentSpaceBounds(doc(), el);
      const cx = b.x+b.w/2, cy = b.y+b.h/2;
      el.transform = Matrix.multiply(Matrix.rotate(deltaDeg, cx, cy), el.transform);
    } else {
      el.rotation = (el.rotation||0) + deltaDeg;
    }
  });
  const after = snapshotElements(doc(), ids);
  commitProps(ids, before, after);
  renderAll();
}

export function flipElements(ids, axis){
  const before = snapshotElements(doc(), ids);
  ids.forEach(id=>{
    const el = getElement(doc(), id);
    if(!el || el.locked) return;
    if(el.type === 'group'){
      const b = getParentSpaceBounds(doc(), el);
      const cx = b.x+b.w/2, cy = b.y+b.h/2;
      const s = axis==='x' ? Matrix.scale(-1,1) : Matrix.scale(1,-1);
      const delta = Matrix.multiply(Matrix.translate(cx,cy), Matrix.multiply(s, Matrix.translate(-cx,-cy)));
      el.transform = Matrix.multiply(delta, el.transform);
    } else if(axis==='x'){
      el.flipX = !el.flipX;
    } else {
      el.flipY = !el.flipY;
    }
  });
  const after = snapshotElements(doc(), ids);
  commitProps(ids, before, after);
  renderAll();
}

export function resetElementTransform(ids){
  const before = snapshotElements(doc(), ids);
  ids.forEach(id=>{
    const el = getElement(doc(), id);
    if(!el || el.locked) return;
    if(el.type === 'group') el.transform = Matrix.identity();
    else { el.rotation = 0; el.flipX = false; el.flipY = false; }
  });
  const after = snapshotElements(doc(), ids);
  commitProps(ids, before, after);
  renderAll();
}

export function setRotation(id, deg){
  const el = getElement(doc(), id);
  if(!el || el.locked || el.type==='group') return;
  const before = snapshotElements(doc(), [id]);
  el.rotation = deg;
  const after = snapshotElements(doc(), [id]);
  commitProps([id], before, after);
  renderAll();
}





export function groupSelection(){
  if(!canGroup(doc(), state.selection)){
    toast('Select two or more sibling objects to group');
    return;
  }
  const before = doc().elements;
  const { group, elements } = planGroup(doc(), state.selection);
  History.execute(state.history, makeReplaceElementsCommand(doc(), before, elements));
  state.selection = [group.id];
  renderAll();
}

export function ungroupSelection(){
  if(!canUngroup(doc(), state.selection)){ toast('Select a group to ungroup'); return; }
  const groupIds = state.selection.filter(id=>{
    const el = getElement(doc(), id);
    return el && el.type==='group' && !el.locked;
  });
  let newSelection = [];
  groupIds.forEach(gid=>{
    const before = doc().elements;
    const plan = planUngroup(doc(), gid);
    if(!plan) return;
    History.execute(state.history, makeReplaceElementsCommand(doc(), before, plan.elements));
    newSelection = newSelection.concat(plan.childrenIds);
  });
  state.selection = newSelection;
  if(state.activeGroupId && groupIds.includes(state.activeGroupId)) state.activeGroupId = null;
  renderAll();
}










export function alignSelection(mode){
  const ids = state.selection.filter(id=>{ const el=getElement(doc(),id); return el && !el.locked; });
  if(ids.length < 2) return;
  const bounds = {};
  ids.forEach(id=>{ bounds[id] = getWorldBounds(doc(), getElement(doc(), id)); });
  const minX = Math.min(...ids.map(id=>bounds[id].x));
  const maxX = Math.max(...ids.map(id=>bounds[id].x+bounds[id].w));
  const minY = Math.min(...ids.map(id=>bounds[id].y));
  const maxY = Math.max(...ids.map(id=>bounds[id].y+bounds[id].h));
  const targets = { left:minX, right:maxX, centerH:(minX+maxX)/2, top:minY, bottom:maxY, centerV:(minY+maxY)/2 };
  const target = targets[mode];
  if(target==null) return;

  const before = snapshotElements(doc(), ids);
  ids.forEach(id=>{
    const el = getElement(doc(), id);
    const b = bounds[id];
    let dx=0, dy=0;
    if(mode==='left') dx = target - b.x;
    else if(mode==='right') dx = target - (b.x+b.w);
    else if(mode==='centerH') dx = target - (b.x+b.w/2);
    else if(mode==='top') dy = target - b.y;
    else if(mode==='bottom') dy = target - (b.y+b.h);
    else if(mode==='centerV') dy = target - (b.y+b.h/2);
    translateInWorldSpace(el, dx, dy, el.attrs);
  });
  const after = snapshotElements(doc(), ids);
  commitProps(ids, before, after);
  renderAll();
}

export function distributeSelection(axis){
  const ids = state.selection.filter(id=>{ const el=getElement(doc(),id); return el && !el.locked; });
  if(ids.length < 3) return;
  const bounds = {};
  ids.forEach(id=>{ bounds[id] = getWorldBounds(doc(), getElement(doc(), id)); });
  const centerOf = (id)=> axis==='x' ? bounds[id].x+bounds[id].w/2 : bounds[id].y+bounds[id].h/2;
  const sorted = ids.slice().sort((a,b)=>centerOf(a)-centerOf(b));
  const firstCenter = centerOf(sorted[0]);
  const lastCenter = centerOf(sorted[sorted.length-1]);
  const gap = (lastCenter-firstCenter) / (sorted.length-1);

  const before = snapshotElements(doc(), ids);
  sorted.forEach((id,i)=>{
    if(i===0 || i===sorted.length-1) return;
    const el = getElement(doc(), id);
    const targetCenter = firstCenter + gap*i;
    const delta = targetCenter - centerOf(id);
    if(axis==='x') translateInWorldSpace(el, delta, 0, el.attrs);
    else translateInWorldSpace(el, 0, delta, el.attrs);
  });
  const after = snapshotElements(doc(), ids);
  commitProps(ids, before, after);
  renderAll();
}




export function reorderSelectionToEdge(dir){
  const ids = state.selection.filter(id=>{ const el=getElement(doc(),id); return el && !el.locked; });
  if(!ids.length) return;
  const before = doc().elements;
  let after = before.slice();
  ids.forEach(id=>{
    const idx = after.findIndex(e=>e.id===id);
    if(idx===-1) return;
    const el = after[idx];
    after.splice(idx, 1);
    if(dir==='front'){
      let lastSiblingIdx = -1;
      for(let i=after.length-1;i>=0;i--){ if(after[i].parentId===el.parentId){ lastSiblingIdx=i; break; } }
      after.splice(lastSiblingIdx+1, 0, el);
    } else {
      let firstSiblingIdx = after.findIndex(e=>e.parentId===el.parentId);
      after.splice(firstSiblingIdx===-1 ? 0 : firstSiblingIdx, 0, el);
    }
  });
  History.execute(state.history, makeReplaceElementsCommand(doc(), before, after));
  renderAll();
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



function translateInWorldSpace(el, worldDx, worldDy, startAttrs){
  if(el.type === 'group'){
    const parentWorld = getParentWorldTransform(doc(), el);
    const d = Matrix.applyToVector(Matrix.invert(parentWorld), {x:worldDx, y:worldDy});
    el.transform = Matrix.multiply(Matrix.translate(d.x, d.y), el.transform);
  } else {







    const parentWorld = getParentWorldTransform(doc(), el);
    const d = Matrix.applyToVector(Matrix.invert(parentWorld), {x:worldDx, y:worldDy});
    setElementFromBase(el, startAttrs, d.x, d.y);
  }
}

function nudgeSelection(dx, dy){
  const ids = state.selection.filter(id=>{ const e=getElement(doc(),id); return e && !e.locked; });
  if(!ids.length) return;
  const before = snapshotElements(doc(), ids);
  ids.forEach(id=>{
    const el = getElement(doc(), id);
    translateInWorldSpace(el, dx, dy, el.attrs);
  });
  const after = snapshotElements(doc(), ids);
  commitProps(ids, before, after);
  renderAll();
}





const HANDLE_ANCHOR = {
  nw:{x:'right',y:'bottom',sx:true,sy:true}, n:{x:'center',y:'bottom',sx:false,sy:true},
  ne:{x:'left',y:'bottom',sx:true,sy:true}, w:{x:'right',y:'center',sx:true,sy:false},
  e:{x:'left',y:'center',sx:true,sy:false}, sw:{x:'right',y:'top',sx:true,sy:true},
  s:{x:'center',y:'top',sx:false,sy:true}, se:{x:'left',y:'top',sx:true,sy:true},
};
function anchorPoint(b, spec){
  const x = spec.x==='left' ? b.x : spec.x==='right' ? b.x+b.w : b.x+b.w/2;
  const y = spec.y==='top' ? b.y : spec.y==='bottom' ? b.y+b.h : b.y+b.h/2;
  return { x, y };
}

function startHandleDrag(handleId, pointerWorld, e){
  if(state.selection.length > 1){
    startMultiHandleDrag(handleId, pointerWorld, e);
    return;
  }
  const el = getElement(doc(), state.selection[0]);
  if(!el || el.locked) return;
  state.dragging = {
    mode: 'handle', handleId, el,
    startAttrs: JSON.parse(JSON.stringify(el.attrs)),
    startLocalBounds: getLocalBounds(doc(), el),
    startParentBounds: getParentSpaceBounds(doc(), el),
    startTransform: el.type==='group' ? { ...el.transform } : null,
    startFontSize: el.attrs.fontSize,
    startPointerWorld: pointerWorld,
    startRotation: el.rotation,
    shift: e.shiftKey,
  };
}






function startMultiHandleDrag(handleId, pointerWorld, e){
  const ids = state.selection.filter(id=>{ const el=getElement(doc(),id); return el && !el.locked; });
  if(ids.length < 2) return;
  const perEl = {};
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  ids.forEach(id=>{
    const el = getElement(doc(), id);
    const worldBounds = getWorldBounds(doc(), el);
    minX=Math.min(minX,worldBounds.x); minY=Math.min(minY,worldBounds.y);
    maxX=Math.max(maxX,worldBounds.x+worldBounds.w); maxY=Math.max(maxY,worldBounds.y+worldBounds.h);
    perEl[id] = {
      startAttrs: el.type!=='group' ? JSON.parse(JSON.stringify(el.attrs)) : null,
      startLocalBounds: getLocalBounds(doc(), el),
      startWorldBounds: worldBounds,
      startTransform: el.type==='group' ? { ...el.transform } : null,
      startRotation: el.rotation, startFlipX: el.flipX, startFlipY: el.flipY,
      startFontSize: el.attrs && el.attrs.fontSize,
    };
  });
  state.dragging = {
    mode: 'multiHandle', handleId, ids, perEl,
    startSelBox: { x:minX, y:minY, w:maxX-minX, h:maxY-minY },
    startPointerWorld: pointerWorld,
  };
}

function applyMultiHandleDrag(d, pointerWorld, shift){
  if(d.handleId === 'rotate'){ applyMultiRotateDrag(d, pointerWorld, shift); return; }
  const spec = HANDLE_ANCHOR[d.handleId];
  if(!spec) return;
  const b0 = d.startSelBox;
  const anchor = anchorPoint(b0, spec);
  let scaleX = 1, scaleY = 1;
  if(spec.sx) scaleX = Math.max(Math.abs(pointerWorld.x - anchor.x), 2) / b0.w;
  if(spec.sy) scaleY = Math.max(Math.abs(pointerWorld.y - anchor.y), 2) / b0.h;
  if(shift && spec.sx && spec.sy){ const s = Math.max(scaleX, scaleY); scaleX = s; scaleY = s; }
  const worldDelta = Matrix.multiply(Matrix.translate(anchor.x,anchor.y), Matrix.multiply(Matrix.scale(scaleX,scaleY), Matrix.translate(-anchor.x,-anchor.y)));

  d.ids.forEach(id=>{
    const el = getElement(doc(), id);
    if(!el) return;
    const info = d.perEl[id];
    if(el.type==='group'){
      const parentWorld = getParentWorldTransform(doc(), el);
      const localDelta = Matrix.conjugate(worldDelta, parentWorld);
      el.transform = Matrix.multiply(localDelta, info.startTransform);
    } else {
      applyLeafScaleInPlace(el, info, scaleX, scaleY, worldDelta);
    }
  });
}












function applyLeafScaleInPlace(el, info, scaleX, scaleY, worldDelta){
  const b0 = info.startLocalBounds;
  const lcx = b0.x + b0.w/2, lcy = b0.y + b0.h/2;
  const nw = Math.max(b0.w * Math.abs(scaleX), 2), nh = Math.max(b0.h * Math.abs(scaleY), 2);
  const nx = lcx - nw/2, ny = lcy - nh/2;
  resizeLeafGeometry(el, info.startAttrs, b0, nx, ny, nw, nh, info.startFontSize, null);
  if(scaleX<0) el.flipX = !info.startFlipX;
  if(scaleY<0) el.flipY = !info.startFlipY;

  const startCenter = { x: info.startWorldBounds.x+info.startWorldBounds.w/2, y: info.startWorldBounds.y+info.startWorldBounds.h/2 };
  const targetCenter = Matrix.applyToPoint(worldDelta, startCenter);
  const newLocal = shapeLocalBounds(el);
  const newMatrix = Matrix.fromRotateFlip(el.rotation||0, !!el.flipX, !!el.flipY, newLocal.x+newLocal.w/2, newLocal.y+newLocal.h/2);
  const parentWorld = getParentWorldTransform(doc(), el);
  const currentCenter = Matrix.applyToPoint(Matrix.multiply(parentWorld, newMatrix), { x:newLocal.x+newLocal.w/2, y:newLocal.y+newLocal.h/2 });
  const worldVec = { x: targetCenter.x-currentCenter.x, y: targetCenter.y-currentCenter.y };
  const localVec = Matrix.applyToVector(Matrix.invert(parentWorld), worldVec);
  setElementFromBase(el, el.attrs, localVec.x, localVec.y);
}










function applyMultiRotateDrag(d, pointerWorld, shift){
  const b0 = d.startSelBox;
  const cx = b0.x+b0.w/2, cy = b0.y+b0.h/2;
  let deltaDeg = (Math.atan2(pointerWorld.y-cy,pointerWorld.x-cx) - Math.atan2(d.startPointerWorld.y-cy,d.startPointerWorld.x-cx)) * 180/Math.PI;
  if(shift) deltaDeg = Math.round(deltaDeg/15)*15;
  const worldDelta = Matrix.rotate(deltaDeg, cx, cy);

  d.ids.forEach(id=>{
    const el = getElement(doc(), id);
    if(!el) return;
    const info = d.perEl[id];
    if(el.type==='group'){
      const parentWorld = getParentWorldTransform(doc(), el);
      const localDelta = Matrix.conjugate(worldDelta, parentWorld);
      el.transform = Matrix.multiply(localDelta, info.startTransform);
    } else {
      el.rotation = round2((info.startRotation||0) + deltaDeg);
      const startCenter = { x: info.startWorldBounds.x+info.startWorldBounds.w/2, y: info.startWorldBounds.y+info.startWorldBounds.h/2 };
      const targetCenter = Matrix.applyToPoint(worldDelta, startCenter);



      const newLocal = shapeLocalBounds(el);
      const newMatrix = Matrix.fromRotateFlip(el.rotation, !!el.flipX, !!el.flipY, newLocal.x+newLocal.w/2, newLocal.y+newLocal.h/2);
      const parentWorld = getParentWorldTransform(doc(), el);
      const currentCenter = Matrix.applyToPoint(Matrix.multiply(parentWorld, newMatrix), { x:newLocal.x+newLocal.w/2, y:newLocal.y+newLocal.h/2 });
      const worldVec = { x: targetCenter.x-currentCenter.x, y: targetCenter.y-currentCenter.y };
      const localVec = Matrix.applyToVector(Matrix.invert(parentWorld), worldVec);


      setElementFromBase(el, info.startAttrs, localVec.x, localVec.y);
    }
  });
}

function applyHandleDrag(d, pointerWorld, shift){
  const el = d.el;
  const hid = d.handleId;

  if(hid === 'rotate'){
    applyRotateDrag(d, pointerWorld, shift);
    return;
  }
  if(hid.startsWith('pt')){
    const idx = parseInt(hid.slice(2),10);
    const local = toLocalPoint(el, d, pointerWorld);
    el.attrs.points[idx] = local;
    return;
  }
  if(hid==='p1' || hid==='p2'){
    const local = toLocalPoint(el, d, pointerWorld);
    if(hid==='p1'){ el.attrs.x1=local.x; el.attrs.y1=local.y; } else { el.attrs.x2=local.x; el.attrs.y2=local.y; }
    return;
  }
  if(hid.startsWith('node')){
    const idx = parseInt(hid.slice(4),10);
    const c = el.attrs.commands[idx];
    const local = toLocalPoint(el, d, pointerWorld);
    if(c.type==='H'){ c.x=local.x; } else if(c.type==='V'){ c.y=local.y; } else { c.x=local.x; c.y=local.y; }
    return;
  }
  if(hid.startsWith('c') && (hid.endsWith('a')||hid.endsWith('b'))){
    const idx = parseInt(hid.slice(1,-1),10);
    const which = hid.endsWith('a') ? '1' : '2';
    const c = el.attrs.commands[idx];
    const local = toLocalPoint(el, d, pointerWorld);
    c['x'+which] = local.x; c['y'+which] = local.y;
    return;
  }
  if(hid==='move-text'){
    const local = toLocalPoint(el, d, pointerWorld);
    el.attrs.x = local.x; el.attrs.y = local.y;
    return;
  }



  const spec = HANDLE_ANCHOR[hid];
  if(!spec) return;

  if(el.type === 'group'){
    applyGroupResize(el, d, spec, pointerWorld, shift);
    return;
  }

  const b0 = d.startLocalBounds;
  const localP = toLocalPoint(el, d, pointerWorld);
  let nx=b0.x, ny=b0.y, nw=b0.w, nh=b0.h;
  const minSize = 2;
  if(hid.includes('w')){ nw = Math.max(b0.x+b0.w-localP.x, minSize); nx = b0.x+b0.w-nw; }
  if(hid.includes('e')){ nw = Math.max(localP.x-b0.x, minSize); }
  if(hid.includes('n')){ nh = Math.max(b0.y+b0.h-localP.y, minSize); ny = b0.y+b0.h-nh; }
  if(hid.includes('s')){ nh = Math.max(localP.y-b0.y, minSize); }
  if(shift && (hid==='se'||hid==='nw'||hid==='ne'||hid==='sw')){
    const ratio = (b0.w>1e-6 && b0.h>1e-6) ? (b0.w/b0.h) : 1;
    if(nw/nh > ratio){ nh = nw/ratio; } else { nw = nh*ratio; }
    if(hid.includes('n')) ny = b0.y+b0.h-nh;
    if(hid.includes('w')) nx = b0.x+b0.w-nw;
  }
  resizeLeafGeometry(el, d.startAttrs, b0, nx, ny, nw, nh, d.startFontSize, localP);
}









function resizeLeafGeometry(el, startAttrsSnap, b0, nx, ny, nw, nh, startFontSize, localPointer){
  if(el.type==='rect' || el.type==='rrect'){
    el.attrs.x = nx; el.attrs.y = ny; el.attrs.width = nw; el.attrs.height = nh;
  } else if(el.type==='circle'){
    const cx=b0.x+b0.w/2, cy=b0.y+b0.h/2;
    const r = localPointer
      ? Math.max(Math.hypot(localPointer.x-cx, localPointer.y-cy), 1)
      : Math.max(Math.min(nw,nh)/2, 1);
    el.attrs.cx=cx; el.attrs.cy=cy; el.attrs.r=r;
  } else if(el.type==='ellipse'){
    el.attrs.cx = nx+nw/2; el.attrs.cy = ny+nh/2; el.attrs.rx = nw/2; el.attrs.ry = nh/2;
  } else if(el.type==='text'){
    const scale = nh / b0.h;
    el.attrs.fontSize = Math.max(4, round2((startFontSize||el.attrs.fontSize)*scale));
  } else if(el.type==='polygon' || el.type==='polyline' || el.type==='path'){
    const sx = b0.w? nw/b0.w : 1, sy = b0.h? nh/b0.h : 1;
    if(el.type==='path'){
      el.attrs.commands = startAttrsSnap.commands.map(c=>{
        const nc = Object.assign({}, c);
        ['x','x1','x2'].forEach(k=>{ if(k in nc) nc[k] = nx + (c[k]-b0.x)*sx; });
        ['y','y1','y2'].forEach(k=>{ if(k in nc) nc[k] = ny + (c[k]-b0.y)*sy; });
        if('rx' in nc) nc.rx = Math.abs(nc.rx*sx);
        if('ry' in nc) nc.ry = Math.abs(nc.ry*sy);
        return nc;
      });
    } else {
      el.attrs.points = startAttrsSnap.points.map(pt=>({ x: nx+(pt.x-b0.x)*sx, y: ny+(pt.y-b0.y)*sy }));
    }
  }
}







function toLocalPoint(el, d, pointerWorld){
  const parentWorld = getParentWorldTransform(doc(), el);
  const ownMatrix = Matrix.fromRotateFlip(d.startRotation||0, !!el.flipX, !!el.flipY,
    d.startLocalBounds.x+d.startLocalBounds.w/2, d.startLocalBounds.y+d.startLocalBounds.h/2);
  const fullInverse = Matrix.invert(Matrix.multiply(parentWorld, ownMatrix));
  return Matrix.applyToPoint(fullInverse, pointerWorld);
}

function applyGroupResize(el, d, spec, pointerWorld, shift){
  const b0 = d.startParentBounds;
  const anchor = anchorPoint(b0, spec);
  const parentWorld = getParentWorldTransform(doc(), el);
  const pointerInParent = Matrix.applyToPoint(Matrix.invert(parentWorld), pointerWorld);

  let scaleX = 1, scaleY = 1;
  if(spec.sx) scaleX = Math.max(Math.abs(pointerInParent.x - anchor.x), 2) / b0.w;
  if(spec.sy) scaleY = Math.max(Math.abs(pointerInParent.y - anchor.y), 2) / b0.h;
  if(shift && spec.sx && spec.sy){
    const s = Math.max(scaleX, scaleY);
    scaleX = s; scaleY = s;
  }
  const delta = Matrix.multiply(Matrix.translate(anchor.x,anchor.y), Matrix.multiply(Matrix.scale(scaleX,scaleY), Matrix.translate(-anchor.x,-anchor.y)));
  el.transform = Matrix.multiply(delta, d.startTransform);
}

function applyRotateDrag(d, pointerWorld, shift){
  const el = d.el;
  if(el.type === 'group'){
    const b0 = d.startParentBounds;
    const cx = b0.x+b0.w/2, cy = b0.y+b0.h/2;
    const parentWorld = getParentWorldTransform(doc(), el);
    const inv = Matrix.invert(parentWorld);
    const startP = Matrix.applyToPoint(inv, d.startPointerWorld);
    const curP = Matrix.applyToPoint(inv, pointerWorld);
    let deltaDeg = (Math.atan2(curP.y-cy,curP.x-cx) - Math.atan2(startP.y-cy,startP.x-cx)) * 180/Math.PI;
    if(shift) deltaDeg = Math.round(deltaDeg/15)*15;
    el.transform = Matrix.multiply(Matrix.rotate(deltaDeg, cx, cy), d.startTransform);
  } else {
    const b = d.startLocalBounds;
    const cx = b.x+b.w/2, cy = b.y+b.h/2;
    const parentWorld = getParentWorldTransform(doc(), el);
    const p = Matrix.applyToPoint(Matrix.invert(parentWorld), pointerWorld);
    let ang = Math.atan2(p.y-cy, p.x-cx)*180/Math.PI + 90;
    if(shift) ang = Math.round(ang/15)*15;
    el.rotation = round2(ang);
  }
}

function round2(n){ return Math.round(n*100)/100; }





function maybeSnap(p, altKey){
  if(!state.snap || altKey) return p;
  const g = doc().settings.gridSize;
  return { x: snapValue(p.x,g), y: snapValue(p.y,g) };
}

function startDrawing(tool, p, e){
  const sp = maybeSnap(p, e.altKey);
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
    finishNewElement(createElement('text', { x:sp.x, y:sp.y, fontSize:20, fontFamily:'ui-monospace, monospace', content:'Text' }));
    setTimeout(()=>{ const f = document.getElementById('field-content'); if(f){ f.focus(); f.select(); } }, 30);
  }
}

function finishNewElement(el){
  el.parentId = state.activeGroupId || null;
  const before = doc().elements;
  const after = before.concat([el]);
  History.execute(state.history, makeReplaceElementsCommand(doc(), before, after));
  state.selection = [el.id];
  setTool('select');
  renderAll();
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
    d.liveEl = createElement(d.type, d.previewAttrs, state.activeGroupId);
    d.liveEl.style.fillOpacity = 0.5;
    doc().elements.push(d.liveEl);
  } else {
    d.liveEl.attrs = d.previewAttrs;
  }
}

function finalizeDragShape(){
  const d = state.drawing;
  if(!d || !d.liveEl){ state.drawing=null; state.dragging=null; return; }
  const localB = getLocalBounds(doc(), d.liveEl);
  if(localB.w<1 && localB.h<1 && d.type!=='line'){
    doc().elements = doc().elements.filter(e=>e.id!==d.liveEl.id);
    state.drawing = null; state.dragging = null;
    renderAll();
    return;
  }
  const finalEl = d.liveEl;
  doc().elements = doc().elements.filter(e=>e.id!==finalEl.id);
  state.drawing = null; state.dragging = null;
  finishNewElement(finalEl);
}

function finishDrawingPath(closePath){
  const d = state.drawing;
  if(!d) return;
  if(d.type==='polygon' || d.type==='polyline'){
    if(d.points.length<2){ cancelDrawing(); return; }
    finishNewElement(createElement(d.type, { points: d.points.slice() }));
  } else if(d.type==='path'){
    if(d.commands.length<2){ cancelDrawing(); return; }
    const cmds = d.commands.slice();
    if(closePath) cmds.push({type:'Z'});
    finishNewElement(createElement('path', { commands: cmds }));
  }
  state.drawing = null;
  pathHint.classList.remove('show');
}
function cancelDrawing(){
  if(state.drawing && state.drawing.liveEl){
    doc().elements = doc().elements.filter(e=>e.id!==state.drawing.liveEl.id);
  }
  state.drawing = null;
  state.dragging = null;
  pathHint.classList.remove('show');
  renderAll();
}

document.getElementById('btnFinishPath').addEventListener('click', ()=>finishDrawingPath(false));
document.getElementById('btnClosePath').addEventListener('click', ()=>finishDrawingPath(true));





export function setTool(id){
  cancelDrawingSilent();
  state.tool = id;
  document.querySelectorAll('#toolbar button').forEach(b=>b.classList.toggle('active', b.dataset.tool===id));
  svgRoot.classList.toggle('tool-select', id==='select');
  svgRoot.style.cursor = id==='select'? 'default' : 'crosshair';
  pathHint.classList.remove('show');
  renderAll();
}
function cancelDrawingSilent(){
  if(state.drawing && state.drawing.liveEl){
    doc().elements = doc().elements.filter(e=>e.id!==state.drawing.liveEl.id);
  }
  state.drawing = null;
  state.dragging = null;
}









export function newDocument(){
  resetRenderCache();
  resetLayersRenderCache();
  state.document = createDocument();
  state.selection = [];
  state.activeGroupId = null;
  state.history = History.createHistory(100);




  state.fileHandle = null;
  state.projectDirty = false;
  renderAll();
}






export function replaceDocument(newDoc){
  resetRenderCache();
  resetLayersRenderCache();
  state.document = newDoc;
  state.selection = [];
  state.activeGroupId = null;
  state.history = History.createHistory(100);






  state.fileHandle = null;
  state.projectDirty = false;
}

export function deleteSelection(){
  if(!state.selection.length) return;
  const idsToRemove = new Set();
  state.selection.forEach(id=>{
    idsToRemove.add(id);
    getDescendantIds(doc(), id).forEach(d=>idsToRemove.add(d));
  });
  const before = doc().elements;
  const after = before.filter(e=>!idsToRemove.has(e.id));
  History.execute(state.history, makeReplaceElementsCommand(doc(), before, after));
  state.selection = [];
  renderAll();
}

function cloneSubtree(doc_, id, newParentId, idMap){
  const el = getElement(doc_, id);
  const clone = JSON.parse(JSON.stringify(el));
  clone.id = uid('el');
  idMap.set(id, clone.id);
  clone.parentId = newParentId;
  const out = [clone];
  getChildren(doc_, id).forEach(c=>{
    out.push(...cloneSubtree(doc_, c.id, clone.id, idMap));
  });
  return out;
}







function nudgeCloneRoots(clones, rootIds, dx, dy){
  rootIds.forEach(id=>{
    const clone = clones.find(c=>c.id===id);
    if(!clone) return;
    if(clone.type==='group') clone.transform = Matrix.multiply(Matrix.translate(dx,dy), clone.transform);
    else translateInWorldSpace(clone, dx, dy, clone.attrs);
  });
}

export function duplicateSelection(){
  if(!state.selection.length) return;
  const before = doc().elements;
  const idMap = new Map();
  let clones = [];
  state.selection.forEach(id=>{
    const el = getElement(doc(), id);
    if(!el) return;
    clones = clones.concat(cloneSubtree(doc(), id, el.parentId, idMap));
  });
  const rootIds = state.selection.map(id=>idMap.get(id)).filter(Boolean);
  nudgeCloneRoots(clones, rootIds, 14, 14);
  const after = before.concat(clones);
  History.execute(state.history, makeReplaceElementsCommand(doc(), before, after));
  state.selection = rootIds;
  renderAll();
}

export function copySelection(){
  if(!state.selection.length) return;
  const idMap = new Map();
  let clones = [];
  state.selection.forEach(id=>{
    clones = clones.concat(cloneSubtree(doc(), id, null, idMap));
  });




  state.clipboard = { items: clones, roots: state.selection.map(id=>idMap.get(id)) };
  toast('Copied '+state.selection.length+' element(s)');
}

export function pasteClipboard(){
  if(!state.clipboard.items || !state.clipboard.items.length) return;
  const before = doc().elements;
  const idMap = new Map();
  const clones = state.clipboard.items.map(el=>{
    const clone = JSON.parse(JSON.stringify(el));
    const newId = uid('el');
    idMap.set(el.id, newId);
    clone.id = newId;
    return clone;
  });
  clones.forEach((c,i)=>{
    const origParentId = state.clipboard.items[i].parentId;
    c.parentId = (origParentId!=null && idMap.has(origParentId)) ? idMap.get(origParentId) : (state.activeGroupId || null);
  });
  const rootIds = state.clipboard.roots.map(id=>idMap.get(id)).filter(Boolean);
  nudgeCloneRoots(clones, rootIds, 14, 14);
  const after = before.concat(clones);
  History.execute(state.history, makeReplaceElementsCommand(doc(), before, after));
  state.selection = rootIds;
  renderAll();
  toast('Pasted');
}

export function cutSelection(){
  if(!state.selection.length) return;
  copySelection();
  deleteSelection();
  toast('Cut');
}





let spaceHeld = false;
let panState = null;

svgRoot.addEventListener('wheel', (e)=>{
  e.preventDefault();
  if(e.shiftKey){ panBy(e.deltaY / scalePxPerUnit(), 0); return; }
  const factor = Math.pow(1.0015, -e.deltaY);
  setZoom(state.view.zoom*factor, e.clientX, e.clientY);
}, {passive:false});

svgRoot.addEventListener('pointermove', (e)=>{
  const p = screenToSVG(e.clientX, e.clientY);
  state.mouseSvg = p;
  const coordReadout = document.getElementById('coordReadout');
  coordReadout.innerHTML = `<span>X</span>${round2(p.x)}  <span>Y</span>${round2(p.y)}`;
});
svgRoot.addEventListener('pointerleave', ()=>{ state.mouseSvg=null; });

svgRoot.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', onPointerUp);
svgRoot.addEventListener('dblclick', onDblClick);
svgRoot.addEventListener('contextmenu', (e)=>e.preventDefault());

function onPointerDown(e){
  if(e.button===1 || spaceHeld || e.button===2){
    panState = { startX:e.clientX, startY:e.clientY, vx:state.view.x, vy:state.view.y, button:e.button, moved:false };
    svgRoot.classList.add('panning-active');
    try{ svgRoot.setPointerCapture(e.pointerId); }catch(err){}
    return;
  }
  if(e.button!==0) return;
  const p = screenToSVG(e.clientX, e.clientY);
  const handleId = e.target.getAttribute && e.target.getAttribute('data-handle');
  try{ svgRoot.setPointerCapture(e.pointerId); }catch(err){}

  if(handleId){ startHandleDrag(handleId, p, e); return; }

  if(state.tool==='select'){
    const hitId = findNearestDataId(svgRoot, e.target);
    const resolved = resolveClickTarget(hitId);
    if(resolved.exitGroup) state.activeGroupId = null;
    if(resolved.id){
      const el = getElement(doc(), resolved.id);
      if(el && el.locked) return;
      if(e.shiftKey){
        if(state.selection.includes(resolved.id)) state.selection = state.selection.filter(id=>id!==resolved.id);
        else state.selection.push(resolved.id);
      } else if(!state.selection.includes(resolved.id)){
        state.selection = [resolved.id];
      }
      renderAll();
      const startPositions = {};
      const startTransforms = {};
      state.selection.forEach(id=>{
        const el2 = getElement(doc(), id);
        if(!el2) return;
        startPositions[id] = JSON.parse(JSON.stringify(el2.attrs));
        if(el2.type==='group') startTransforms[id] = { ...el2.transform };
      });
      state.dragging = { mode:'move', startSvg:p, startPositions, startTransforms };
    } else {
      if(!e.shiftKey) clearSelection();
      state.dragging = { mode:'rubberband', startSvg:p, rect:{x:p.x,y:p.y,w:0,h:0} };
      renderAll();
    }
    return;
  }
  startDrawing(state.tool, p, e);
}

function onPointerMove(e){
  if(panState){
    if(Math.hypot(e.clientX-panState.startX, e.clientY-panState.startY) > 4) panState.moved = true;
    const cs = { w: svgRoot.clientWidth||800, h: svgRoot.clientHeight||600 };
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
      state.drawing.cursor = maybeSnap(p, e.altKey);
      renderOverlay();
    }
    return;
  }
  let p = screenToSVG(e.clientX, e.clientY);
  const d = state.dragging;
  const snapOn = state.snap && !e.altKey;

  if(d.mode==='move'){
    let dx = p.x - d.startSvg.x, dy = p.y - d.startSvg.y;
    if(snapOn){ const g = doc().settings.gridSize; dx = snapValue(dx,g); dy = snapValue(dy,g); }
    state.selection.forEach(id=>{
      const el = getElement(doc(), id);
      if(!el) return;
      if(el.type==='group'){
        const parentWorld = getParentWorldTransform(doc(), el);
        const delta = Matrix.applyToVector(Matrix.invert(parentWorld), {x:dx,y:dy});
        el.transform = Matrix.multiply(Matrix.translate(delta.x,delta.y), d.startTransforms[id]);
      } else {
        const parentWorld = getParentWorldTransform(doc(), el);
        const delta = Matrix.applyToVector(Matrix.invert(parentWorld), {x:dx,y:dy});
        setElementFromBase(el, d.startPositions[id], delta.x, delta.y);
      }
    });
    if(snapOn && state.selection.length===1){
      const { adx, ady, guides } = computeAlignmentSnap(doc(), state.selection[0], scalePxPerUnit());
      state.guides = guides;
      if(adx || ady){
        const el = getElement(doc(), state.selection[0]);
        const extraDx = dx+adx, extraDy = dy+ady;
        if(el.type==='group'){
          const parentWorld = getParentWorldTransform(doc(), el);
          const delta = Matrix.applyToVector(Matrix.invert(parentWorld), {x:extraDx,y:extraDy});
          el.transform = Matrix.multiply(Matrix.translate(delta.x,delta.y), d.startTransforms[el.id]);
        } else {
          const parentWorld = getParentWorldTransform(doc(), el);
          const delta = Matrix.applyToVector(Matrix.invert(parentWorld), {x:extraDx,y:extraDy});
          setElementFromBase(el, d.startPositions[el.id], delta.x, delta.y);
        }
      }
    } else {
      state.guides = [];
    }
    renderElementsAndOverlay();
  } else if(d.mode==='rubberband'){
    d.rect = { x:Math.min(d.startSvg.x,p.x), y:Math.min(d.startSvg.y,p.y), w:Math.abs(p.x-d.startSvg.x), h:Math.abs(p.y-d.startSvg.y) };
    renderRubberband(d.rect);
  } else if(d.mode==='handle'){
    if(snapOn){ const g = doc().settings.gridSize; p = { x:snapValue(p.x,g), y:snapValue(p.y,g) }; }
    applyHandleDrag(d, p, e.shiftKey);
    renderElementsAndOverlay();
  } else if(d.mode==='multiHandle'){
    if(snapOn){ const g = doc().settings.gridSize; p = { x:snapValue(p.x,g), y:snapValue(p.y,g) }; }
    applyMultiHandleDrag(d, p, e.shiftKey);
    renderElementsAndOverlay();
  } else if(d.mode==='drawShape'){
    if(snapOn){ const g = doc().settings.gridSize; p = { x:snapValue(p.x,g), y:snapValue(p.y,g) }; }
    updateDrawingShape(state.drawing, p, e.shiftKey);
    renderElementsAndOverlay();
  }
}

function renderElementsAndOverlay(){
  renderElements();
  renderOverlay();
}
function renderRubberband(rect){
  overlayLayer.innerHTML = '';
  const svgEl = (tag,attrs)=>{ const n=document.createElementNS('http://www.w3.org/2000/svg',tag); for(const k in attrs) n.setAttribute(k,attrs[k]); return n; };
  const strokeW = 1/scalePxPerUnit();
  overlayLayer.appendChild(svgEl('rect', {x:rect.x,y:rect.y,width:rect.w,height:rect.h,fill:'rgba(79,209,197,0.08)',stroke:'#4fd1c5','stroke-width':strokeW}));
}

function onPointerUp(e){
  try{ if(svgRoot.hasPointerCapture && svgRoot.hasPointerCapture(e.pointerId)) svgRoot.releasePointerCapture(e.pointerId); }catch(err){}
  if(panState){
    const wasRightClickNoDrag = panState.button===2 && !panState.moved;
    panState = null;
    svgRoot.classList.remove('panning-active');
    if(wasRightClickNoDrag) openContextMenuAt(e);
    return;
  }
  if(state.dragging){
    const d = state.dragging;
    if(d.mode==='rubberband'){
      const r = d.rect;
      if(r.w>1 || r.h>1){
        const ids = [];
        (state.activeGroupId ? getChildren(doc(), state.activeGroupId) : getChildren(doc(), null)).forEach(el=>{
          if(!el.visible || el.locked) return;
          const b = getWorldBounds(doc(), el);
          if(b.x < r.x+r.w && b.x+b.w > r.x && b.y < r.y+r.h && b.y+b.h > r.y) ids.push(el.id);
        });
        state.selection = ids;
      }
    }
    if(d.mode==='move'){
      const ids = state.selection;
      const before = {};
      const after = {};
      ids.forEach(id=>{
        const el = getElement(doc(), id);
        if(!el) return;
        if(el.type==='group'){ before[id]={transform:d.startTransforms[id]}; after[id]={transform:el.transform}; }
        else { before[id]={attrs:d.startPositions[id]}; after[id]={attrs:el.attrs}; }
      });
      History.push(state.history, makeSetPropsCommand(doc(), before, after));
    }
    if(d.mode==='handle'){
      const el = d.el;
      const before = {};
      const after = {};
      if(el.type==='group'){ before[el.id]={transform:d.startTransform}; after[el.id]={transform:el.transform}; }
      else { before[el.id]={attrs:d.startAttrs, rotation:d.startRotation}; after[el.id]={attrs:el.attrs, rotation:el.rotation}; }
      History.push(state.history, makeSetPropsCommand(doc(), before, after));
    }
    if(d.mode==='multiHandle'){
      const before = {}, after = {};
      d.ids.forEach(id=>{
        const el = getElement(doc(), id);
        if(!el) return;
        const info = d.perEl[id];
        if(el.type==='group'){ before[id]={transform:info.startTransform}; after[id]={transform:el.transform}; }
        else { before[id]={attrs:info.startAttrs, rotation:info.startRotation, flipX:info.startFlipX, flipY:info.startFlipY}; after[id]={attrs:el.attrs, rotation:el.rotation, flipX:el.flipX, flipY:el.flipY}; }
      });
      History.push(state.history, makeSetPropsCommand(doc(), before, after));
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








function openContextMenuAt(e){
  const p = screenToSVG(e.clientX, e.clientY);
  const hitId = findNearestDataId(svgRoot, e.target);
  const resolved = resolveClickTarget(hitId);
  if(resolved.exitGroup) state.activeGroupId = null;
  if(resolved.id && !state.selection.includes(resolved.id)){
    const el = getElement(doc(), resolved.id);
    if(!el || !el.locked) state.selection = [resolved.id];
    renderAll();
  } else if(!resolved.id && !e.shiftKey){



  }
  showMenu(e.clientX, e.clientY, buildContextMenuItems());
}

function buildContextMenuItems(){
  const hasSelection = state.selection.length > 0;
  const multi = state.selection.length > 1;
  const hasClipboard = !!(state.clipboard.items && state.clipboard.items.length);
  const canGroupNow = canGroup(doc(), state.selection);
  const canUngroupNow = canUngroup(doc(), state.selection);
  return [
    { label:'Cut', action:cutSelection, disabled:!hasSelection },
    { label:'Copy', action:copySelection, disabled:!hasSelection },
    { label:'Paste', action:pasteClipboard, disabled:!hasClipboard },
    { label:'Duplicate', action:duplicateSelection, disabled:!hasSelection },
    { separator:true },
    { label:'Delete', action:deleteSelection, disabled:!hasSelection },
    { separator:true },
    { label:'Group', action:groupSelection, disabled:!canGroupNow },
    { label:'Ungroup', action:ungroupSelection, disabled:!canUngroupNow },
    { separator:true },
    { label:'Bring to Front', action:()=>reorderSelectionToEdge('front'), disabled:!hasSelection },
    { label:'Send to Back', action:()=>reorderSelectionToEdge('back'), disabled:!hasSelection },
    { separator:true },
    { label:'Align Left', action:()=>alignSelection('left'), disabled:!multi },
    { label:'Align Center', action:()=>alignSelection('centerH'), disabled:!multi },
    { label:'Align Right', action:()=>alignSelection('right'), disabled:!multi },
    { label:'Align Top', action:()=>alignSelection('top'), disabled:!multi },
    { label:'Align Middle', action:()=>alignSelection('centerV'), disabled:!multi },
    { label:'Align Bottom', action:()=>alignSelection('bottom'), disabled:!multi },
    { separator:true },
    { label:'Distribute Horizontally', action:()=>distributeSelection('x'), disabled: state.selection.length<3 },
    { label:'Distribute Vertically', action:()=>distributeSelection('y'), disabled: state.selection.length<3 },
  ];
}

function onDblClick(e){
  if(state.drawing && (state.drawing.type==='polygon' || state.drawing.type==='polyline' || state.drawing.type==='path')){
    finishDrawingPath(false);
    return;
  }
  if(state.tool!=='select') return;
  const hitId = findNearestDataId(svgRoot, e.target);
  if(!hitId) return;
  const resolved = resolveClickTarget(hitId);
  if(!resolved.id) return;
  const el = getElement(doc(), resolved.id);
  if(el && el.type==='group'){
    state.activeGroupId = el.id;
    state.selection = [];
    renderAll();
    return;
  }
  if(el && el.type==='text'){
    state.selection=[hitId]; renderAll();
    setTimeout(()=>{ const f=document.getElementById('field-content'); if(f){f.focus(); f.select();} },20);
  }
}





window.addEventListener('keydown', (e)=>{
  const tag = (e.target.tagName||'').toLowerCase();
  const typing = tag==='input' || tag==='textarea' || e.target.isContentEditable;
  if(e.code==='Space' && !typing){ spaceHeld = true; svgRoot.classList.add('panning'); }
  if(typing){ if(e.key==='Enter' && tag==='input') e.target.blur(); return; }

  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); e.shiftKey ? History.redo(state.history) : History.undo(state.history); renderAll(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y'){ e.preventDefault(); History.redo(state.history); renderAll(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='d'){ e.preventDefault(); duplicateSelection(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='c'){ e.preventDefault(); copySelection(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='x'){ e.preventDefault(); cutSelection(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='v'){ e.preventDefault(); pasteClipboard(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='a'){ e.preventDefault(); selectAll(); return; }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='g'){
    e.preventDefault();
    e.shiftKey ? ungroupSelection() : groupSelection();
    return;
  }
  if(e.key==='Delete' || e.key==='Backspace'){
    if(state.drawing){ cancelDrawing(); return; }
    if(state.selection.length){ e.preventDefault(); deleteSelection(); }
    return;
  }
  if(e.key==='Escape'){
    if(state.drawing){ cancelDrawing(); return; }
    if(state.activeGroupId){ state.activeGroupId = null; state.selection=[]; renderAll(); return; }
    clearSelection(); renderAll(); return;
  }
  if(e.key==='Enter' && state.drawing){ finishDrawingPath(false); renderAll(); return; }
  if(['v','r','o','c','e','l','g','y','p','t'].includes(e.key.toLowerCase()) && !e.ctrlKey && !e.metaKey){
    const map = {v:'select',r:'rect',o:'rrect',c:'circle',e:'ellipse',l:'line',g:'polygon',y:'polyline',p:'path',t:'text'};
    if(map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
  }
  if(state.selection.length && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
    e.preventDefault();
    const step = e.shiftKey? (doc().settings.gridSize||10) : 1;
    let dx=0,dy=0;
    if(e.key==='ArrowUp') dy=-step; if(e.key==='ArrowDown') dy=step;
    if(e.key==='ArrowLeft') dx=-step; if(e.key==='ArrowRight') dx=step;
    nudgeSelection(dx,dy);
  }
});
window.addEventListener('keyup', (e)=>{
  if(e.code==='Space'){ spaceHeld = false; svgRoot.classList.remove('panning','panning-active'); }
});


