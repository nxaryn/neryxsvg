import { getElement, getWorldBounds, getDescendantIds } from '../document/Element.js';

export function snapValue(v, gridSize){ return Math.round(v/gridSize)*gridSize; }








export function computeAlignmentSnap(doc, elId, scalePxPerUnit){
  const el = getElement(doc, elId);
  if(!el) return { adx:0, ady:0, guides:[] };
  const excluded = new Set([elId, ...getDescendantIds(doc, elId)]);
  const b = getWorldBounds(doc, el);
  const mySides = { left:b.x, right:b.x+b.w, cx:b.x+b.w/2 };
  const myVSides = { top:b.y, bottom:b.y+b.h, cy:b.y+b.h/2 };
  const thresh = 4/scalePxPerUnit;
  let bestV=null, bestH=null;
  doc.elements.forEach(other=>{
    if(excluded.has(other.id) || !other.visible) return;
    const ob = getWorldBounds(doc, other);
    const oSides = { left:ob.x, right:ob.x+ob.w, cx:ob.x+ob.w/2 };
    const oVSides = { top:ob.y, bottom:ob.y+ob.h, cy:ob.y+ob.h/2 };
    Object.keys(mySides).forEach(k1=>Object.keys(oSides).forEach(k2=>{
      const diff = oSides[k2]-mySides[k1];
      if(Math.abs(diff)<thresh && (!bestV||Math.abs(diff)<Math.abs(bestV.diff))) bestV={diff,x:oSides[k2]};
    }));
    Object.keys(myVSides).forEach(k1=>Object.keys(oVSides).forEach(k2=>{
      const diff = oVSides[k2]-myVSides[k1];
      if(Math.abs(diff)<thresh && (!bestH||Math.abs(diff)<Math.abs(bestH.diff))) bestH={diff,y:oVSides[k2]};
    }));
  });
  const guides = [];
  if(bestV) guides.push({type:'v', x:bestV.x});
  if(bestH) guides.push({type:'h', y:bestH.y});
  return { adx: bestV?bestV.diff:0, ady: bestH?bestH.diff:0, guides };
}
