import { Matrix } from '../utils/Matrix.js';
import { createGroup, getElement, getChildren, getElementMatrix } from './Element.js';



export function canGroup(doc, ids){
  if(ids.length < 2) return false;
  const els = ids.map(id=>getElement(doc,id)).filter(Boolean);
  if(els.length !== ids.length) return false;
  const parentId = els[0].parentId;
  return els.every(e => e.parentId === parentId && !e.locked);
}

export function canUngroup(doc, ids){
  return ids.some(id => {
    const el = getElement(doc, id);
    return el && el.type === 'group' && !el.locked;
  });
}





export function planGroup(doc, ids){
  const idSet = new Set(ids);
  const group = createGroup(doc.elements.find(e=>idSet.has(e.id)).parentId);
  const indices = doc.elements
    .map((e,i)=>({e,i}))
    .filter(x=>idSet.has(x.e.id))
    .map(x=>x.i);
  const insertAt = Math.max(...indices);
  const after = doc.elements.map(e => idSet.has(e.id) ? Object.assign({}, e, { parentId: group.id }) : e);
  after.splice(insertAt+1, 0, group);
  return { group, elements: after };
}














export function planUngroup(doc, groupId){
  const group = getElement(doc, groupId);
  if(!group || group.type !== 'group') return null;
  const children = getChildren(doc, groupId);
  const groupMatrix = getElementMatrix(doc, group);
  const isIdentity = Matrix.isIdentity(groupMatrix);

  const after = [];
  doc.elements.forEach(e=>{
    if(e.id === groupId) return;
    if(e.parentId !== groupId){ after.push(e); return; }
    if(isIdentity){

      after.push(Object.assign({}, e, { parentId: group.parentId }));
      return;
    }
    if(e.type === 'group'){

      after.push(Object.assign({}, e, {
        parentId: group.parentId,
        transform: Matrix.multiply(groupMatrix, e.transform),
      }));
      return;
    }



    const wrapper = createGroup(group.parentId);
    wrapper.transform = groupMatrix;
    after.push(wrapper);
    after.push(Object.assign({}, e, { parentId: wrapper.id }));
  });
  return { elements: after, childrenIds: children.map(c=>c.id) };
}
