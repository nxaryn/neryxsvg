import { state } from '../app/State.js';
import { getChildren, getElement, displayName } from '../document/Element.js';
import { makeReplaceElementsCommand } from '../document/Commands.js';
import * as History from '../document/History.js';
import { renderAll } from '../app/renderAll.js';

const collapsed = new Set();

const TYPE_ABBR = { rect:'RECT', rrect:'RRECT', circle:'CIRC', ellipse:'ELLI', line:'LINE',
  polygon:'PGON', polyline:'PLIN', path:'PATH', text:'TEXT', raw:'RAW', group:'GRP' };























let rowById = new Map();




export function resetLayersRenderCache(){
  rowById.forEach(n=>n.remove());
  rowById = new Map();
}

function buildRows(doc, parentId, depth, out){
  const children = getChildren(doc, parentId).slice().reverse();
  children.forEach(el=>{
    out.push({ el, depth });
    if(el.type==='group' && !collapsed.has(el.id)){
      buildRows(doc, el.id, depth+1, out);
    }
  });
}

function reorderSibling(doc, id, dir){
  const el = getElement(doc, id);
  if(!el) return null;
  const siblings = getChildren(doc, el.parentId);
  const sIdx = siblings.findIndex(s=>s.id===id);
  const newSIdx = sIdx + dir;
  if(newSIdx<0 || newSIdx>=siblings.length) return null;
  const swapWith = siblings[newSIdx];
  const flatIdxA = doc.elements.indexOf(el);
  const flatIdxB = doc.elements.indexOf(swapWith);
  const after = doc.elements.slice();
  after[flatIdxA] = swapWith;
  after[flatIdxB] = el;
  return after;
}










function buildRowDom(el){
  const row = document.createElement('div');
  row.dataset.id = el.id;
  row.setAttribute('role', 'option');
  row.tabIndex = -1;

  const isGroup = el.type==='group';
  let collapseBtn = null;
  if(isGroup){
    collapseBtn = document.createElement('button');
    collapseBtn.className = 'btn-collapse';
    collapseBtn.title = 'Collapse/expand';
    collapseBtn.setAttribute('aria-label', 'Collapse or expand this group');
    row.appendChild(collapseBtn);
  } else {
    const spacer = document.createElement('span');
    spacer.style.display = 'inline-block';
    spacer.style.width = '20px';
    row.appendChild(spacer);
  }

  const visBtn = document.createElement('button');
  visBtn.className = 'btn-vis';
  visBtn.title = 'Toggle visibility';
  visBtn.setAttribute('aria-label', 'Toggle visibility');
  row.appendChild(visBtn);

  const lockBtn = document.createElement('button');
  lockBtn.className = 'btn-lock';
  lockBtn.title = 'Toggle lock';
  lockBtn.setAttribute('aria-label', 'Toggle lock');
  row.appendChild(lockBtn);

  const lname = document.createElement('span');
  lname.className = 'lname';
  row.appendChild(lname);

  const upBtn = document.createElement('button');
  upBtn.className = 'btn-up'; upBtn.title = 'Move up'; upBtn.setAttribute('aria-label', 'Move up in stacking order');
  upBtn.innerHTML = upIcon();
  row.appendChild(upBtn);

  const downBtn = document.createElement('button');
  downBtn.className = 'btn-down'; downBtn.title = 'Move down'; downBtn.setAttribute('aria-label', 'Move down in stacking order');
  downBtn.innerHTML = downIcon();
  row.appendChild(downBtn);

  const delBtn = document.createElement('button');
  delBtn.className = 'btn-del'; delBtn.title = 'Delete'; delBtn.setAttribute('aria-label', 'Delete');
  delBtn.innerHTML = trashIcon();
  row.appendChild(delBtn);

  row._refs = { collapseBtn, visBtn, lockBtn, lname };
  return row;
}

function getOrCreateRow(el){
  let row = rowById.get(el.id);
  if(!row){
    row = buildRowDom(el);
    rowById.set(el.id, row);
  }




  return row;
}

function updateRowContent(row, el, depth, isRovingTabStop){
  row.className = 'layer-row' + (state.selection.includes(el.id)?' selected':'') + (el.locked?' locked':'') + (!el.visible?' hidden':'');
  row.style.paddingLeft = (6 + depth*14) + 'px';
  row.setAttribute('aria-selected', state.selection.includes(el.id) ? 'true' : 'false');






  row.tabIndex = isRovingTabStop ? 0 : -1;

  const { collapseBtn, visBtn, lockBtn, lname } = row._refs;
  if(collapseBtn){
    const isCollapsed = collapsed.has(el.id);
    collapseBtn.textContent = isCollapsed ? '\u25b8' : '\u25be';
    collapseBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
  }
  visBtn.innerHTML = el.visible? eyeIcon() : eyeOffIcon();
  visBtn.setAttribute('aria-pressed', el.visible);
  lockBtn.innerHTML = el.locked? lockIcon() : unlockIcon();
  lockBtn.setAttribute('aria-pressed', el.locked);
  lname.innerHTML = `<span class="ltype">${TYPE_ABBR[el.type]||el.type}</span>${displayName(el)}`;
}

export function renderLayersPanel(){
  const doc = state.document;
  const list = document.getElementById('layersList');
  document.getElementById('layerCount').textContent = doc.elements.length;

  const rows = [];
  buildRows(doc, null, 0, rows);

  if(!rows.length){
    list.innerHTML = `<div class="insp-empty">No elements yet.<br>Pick a tool and draw on the canvas.</div>`;
    rowById.forEach(n=>n.remove());
    rowById.clear();
    return;
  }


  if(list.firstElementChild && list.firstElementChild.classList && list.firstElementChild.classList.contains('insp-empty') && !list.firstElementChild.dataset.id){
    list.innerHTML = '';
  }







  const bulkFragment = list.children.length === 0 ? document.createDocumentFragment() : null;
  const seen = new Set();
  const tabStopId = state.selection.length ? state.selection[state.selection.length-1] : (rows[0] && rows[0].el.id);
  rows.forEach(({el, depth})=>{
    seen.add(el.id);
    const row = getOrCreateRow(el);
    updateRowContent(row, el, depth, el.id === tabStopId);
    if(bulkFragment) bulkFragment.appendChild(row);
    else if(row.parentNode !== list) list.appendChild(row);
  });
  if(bulkFragment) list.appendChild(bulkFragment);




  Array.from(list.children).forEach(node=>{
    const id = node.dataset && node.dataset.id;
    if(id && !seen.has(id)){ node.remove(); rowById.delete(id); }
  });
}




function rowFromEvent(e){
  const rowEl = e.target.closest ? e.target.closest('.layer-row') : null;
  if(!rowEl || !rowEl.dataset.id) return null;
  const el = getElement(state.document, rowEl.dataset.id);
  return el ? { row: rowEl, el } : null;
}







document.getElementById('layersList')?.addEventListener('keydown', (e)=>{
  const list = e.currentTarget;
  const rows = Array.from(list.children).filter(n=>n.dataset && n.dataset.id);
  if(!rows.length) return;
  const hit = rowFromEvent(e);
  const curIdx = hit ? rows.indexOf(hit.row) : -1;
  let nextIdx = null;
  if(e.key === 'ArrowDown') nextIdx = Math.min(rows.length-1, (curIdx<0?0:curIdx+1));
  else if(e.key === 'ArrowUp') nextIdx = Math.max(0, (curIdx<0?0:curIdx-1));
  else if(e.key === 'Home') nextIdx = 0;
  else if(e.key === 'End') nextIdx = rows.length-1;
  else return;
  e.preventDefault();
  const targetRow = rows[nextIdx];
  const el = getElement(state.document, targetRow.dataset.id);
  if(!el) return;
  state.selection = [el.id];
  renderAll();




  const freshRow = rowById.get(el.id);
  if(freshRow) freshRow.focus();
});

document.getElementById('layersList')?.addEventListener('click', (e)=>{
  const doc = state.document;
  const hit = rowFromEvent(e);
  if(!hit) return;
  const { el } = hit;

  const btn = e.target.closest('button');
  if(!btn){
    if(e.shiftKey){
      if(state.selection.includes(el.id)) state.selection = state.selection.filter(id=>id!==el.id);
      else state.selection.push(el.id);
    } else state.selection = [el.id];
    renderAll();
    return;
  }

  if(btn.classList.contains('btn-collapse')){
    if(collapsed.has(el.id)) collapsed.delete(el.id); else collapsed.add(el.id);
    renderLayersPanel();
  } else if(btn.classList.contains('btn-vis')){
    el.visible = !el.visible;
    History.push(state.history, makeToggleCommand(el.id, 'visible', !el.visible, el.visible));
    renderAll();
  } else if(btn.classList.contains('btn-lock')){
    el.locked = !el.locked;
    renderAll();
  } else if(btn.classList.contains('btn-del')){
    const before = doc.elements;
    const idsToRemove = new Set([el.id, ...getChildren(doc,el.id).map(c=>c.id)]);





    const after = doc.elements.filter(e2=>!idsToRemove.has(e2.id));
    History.execute(state.history, makeReplaceElementsCommand(doc, before, after));
    state.selection = state.selection.filter(id=>id!==el.id);
    renderAll();
  } else if(btn.classList.contains('btn-up')){
    const after = reorderSibling(doc, el.id, 1);
    if(after){ History.execute(state.history, makeReplaceElementsCommand(doc, doc.elements, after)); renderAll(); }
  } else if(btn.classList.contains('btn-down')){
    const after = reorderSibling(doc, el.id, -1);
    if(after){ History.execute(state.history, makeReplaceElementsCommand(doc, doc.elements, after)); renderAll(); }
  }
});

function makeToggleCommand(id, field, beforeVal, afterVal){
  return {
    execute(){ const e=getElement(state.document,id); if(e) e[field]=afterVal; },
    undo(){ const e=getElement(state.document,id); if(e) e[field]=beforeVal; },
  };
}

function eyeIcon(){ return `<svg viewBox="0 0 16 16"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>`; }
function eyeOffIcon(){ return `<svg viewBox="0 0 16 16"><path d="M2 2l12 12M1 8s3-5 7-5c1.3 0 2.5.4 3.5 1M15 8s-1.2 2-3 3.4M6.2 6.2a2 2 0 0 0 2.8 2.8"/></svg>`; }
function lockIcon(){ return `<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>`; }
function unlockIcon(){ return `<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5 7V5a3 3 0 0 1 5.5-1.8"/></svg>`; }
function upIcon(){ return `<svg viewBox="0 0 16 16"><path d="M8 3v10M4 7l4-4 4 4"/></svg>`; }
function downIcon(){ return `<svg viewBox="0 0 16 16"><path d="M8 3v10M4 9l4 4 4-4"/></svg>`; }
function trashIcon(){ return `<svg viewBox="0 0 16 16"><path d="M3 4h10M6 4V2h4v2M4 4l1 10h6l1-10"/></svg>`; }
