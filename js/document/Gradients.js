import { uid } from '../utils/ids.js';















export function createLinearGradient(){
  return {
    id: uid('grad'), kind: 'linear',
    x1: 0, y1: 0, x2: 1, y2: 0,
    stops: [
      { offset:0, color:'#4fd1c5', opacity:1 },
      { offset:1, color:'#0b0d10', opacity:1 },
    ],
  };
}

export function createRadialGradient(){
  return {
    id: uid('grad'), kind: 'radial',
    cx: 0.5, cy: 0.5, r: 0.5,
    stops: [
      { offset:0, color:'#4fd1c5', opacity:1 },
      { offset:1, color:'#0b0d10', opacity:1 },
    ],
  };
}

export function getGradient(doc, id){
  return (doc.defs||[]).find(g=>g.id===id) || null;
}

const URL_REF_RE = /^url\(#([^)]+)\)$/;

export function gradientIdFromRef(value){
  if(!value) return null;
  const m = URL_REF_RE.exec(value.trim());
  return m ? m[1] : null;
}
export function refFromGradientId(id){
  return `url(#${id})`;
}
export function isGradientRef(value){
  return !!gradientIdFromRef(value);
}




export function pruneUnusedGradients(doc){
  const used = new Set();
  doc.elements.forEach(el=>{
    if(!el.style) return;
    const fid = gradientIdFromRef(el.style.fill);
    const sid = gradientIdFromRef(el.style.stroke);
    if(fid) used.add(fid);
    if(sid) used.add(sid);
  });
  doc.defs = (doc.defs||[]).filter(g=>used.has(g.id));
}
