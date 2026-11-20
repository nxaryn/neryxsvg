import { getElement } from './Element.js';






const TRACKED_FIELDS = ['attrs','style','rotation','flipX','flipY','transform','visible','locked','name','parentId'];

export function snapshotElements(doc, ids){
  const snap = {};
  ids.forEach(id=>{
    const el = getElement(doc, id);
    if(!el) return;
    const captured = {};
    TRACKED_FIELDS.forEach(f=>{ if(f in el) captured[f] = el[f]; });
    snap[id] = JSON.parse(JSON.stringify(captured));
  });
  return snap;
}

function applySnapshot(doc, snap){
  Object.keys(snap).forEach(id=>{
    const el = getElement(doc, id);
    if(!el) return;
    Object.assign(el, JSON.parse(JSON.stringify(snap[id])));
  });
}

export function makeSetPropsCommand(doc, before, after){
  return {
    type: 'setProps',
    execute(){ applySnapshot(doc, after); },
    undo(){ applySnapshot(doc, before); },
  };
}






export function makeReplaceElementsCommand(doc, beforeElements, afterElements){
  const before = JSON.parse(JSON.stringify(beforeElements));
  const after = JSON.parse(JSON.stringify(afterElements));
  return {
    type: 'replaceElements',
    execute(){ doc.elements = JSON.parse(JSON.stringify(after)); },
    undo(){ doc.elements = JSON.parse(JSON.stringify(before)); },
  };
}





export function makeReplaceDefsCommand(doc, beforeDefs, afterDefs){
  const before = JSON.parse(JSON.stringify(beforeDefs));
  const after = JSON.parse(JSON.stringify(afterDefs));
  return {
    type: 'replaceDefs',
    execute(){ doc.defs = JSON.parse(JSON.stringify(after)); },
    undo(){ doc.defs = JSON.parse(JSON.stringify(before)); },
  };
}
