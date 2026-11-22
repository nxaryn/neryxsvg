import { state } from '../app/State.js';
import * as History from '../document/History.js';
import { renderAll } from '../app/renderAll.js';
import { setZoom, fitToContent, initView, renderView } from '../canvas/Navigation.js';
import { getWorldBounds } from '../document/Element.js';
import { fitDocumentToContent } from '../svg/Serializer.js';
import {
  setTool, deleteSelection, duplicateSelection, groupSelection, ungroupSelection,
  newDocument,
} from '../canvas/Interaction.js';

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

export function buildToolbar(){
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

export function wireTopbar(){
  document.getElementById('btnNew').addEventListener('click', ()=>{




    if(state.projectDirty && !confirm('Start a new document? Unsaved changes will be kept in autosave but replaced on screen.')) return;
    newDocument();
    initView();
    renderAll();
  });
  document.getElementById('btnUndo').addEventListener('click', ()=>{ History.undo(state.history); renderAll(); });
  document.getElementById('btnRedo').addEventListener('click', ()=>{ History.redo(state.history); renderAll(); });
  document.getElementById('btnDuplicate').addEventListener('click', duplicateSelection);
  document.getElementById('btnDelete').addEventListener('click', deleteSelection);

  document.getElementById('btnZoomIn').addEventListener('click', ()=>setZoom(state.view.zoom*1.25));
  document.getElementById('btnZoomOut').addEventListener('click', ()=>setZoom(state.view.zoom*0.8));
  document.getElementById('btnZoomFit').addEventListener('click', ()=>{
    const topLevel = state.document.elements.filter(e=>!e.parentId);
    if(!topLevel.length){ fitToContent(null); return; }
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    topLevel.forEach(el=>{
      const b = getWorldBounds(state.document, el);
      minX=Math.min(minX,b.x); minY=Math.min(minY,b.y);
      maxX=Math.max(maxX,b.x+b.w); maxY=Math.max(maxY,b.y+b.h);
    });
    fitToContent({ x:minX, y:minY, w:maxX-minX, h:maxY-minY });
  });
  document.getElementById('btnZoom100').addEventListener('click', ()=>setZoom(1));
  document.getElementById('zoomPct').addEventListener('change', (e)=>{
    const v = parseFloat(e.target.value)/100;
    if(v>0) setZoom(v);
  });

  // Grid / snap / spacing controls live in the Settings popup and are wired in
  // ui/CodeEditor.js, which owns the localStorage-backed values and mirrors
  // them onto `state`. Wiring them here too would double-handle every change.

  const btnGroup = document.getElementById('btnGroup');
  const btnUngroup = document.getElementById('btnUngroup');
  if(btnGroup) btnGroup.addEventListener('click', groupSelection);
  if(btnUngroup) btnUngroup.addEventListener('click', ungroupSelection);

  const btnFitPage = document.getElementById('btnFitPage');
  if(btnFitPage) btnFitPage.addEventListener('click', ()=>{
    const topLevel = state.document.elements.filter(e=>!e.parentId);
    fitDocumentToContent(state.document, topLevel);
    renderAll();
    const t = document.getElementById('toast');
    t.textContent = 'Page fitted to content — future exports keep this size until you fit again';
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(()=>t.classList.remove('show'), 2200);
  });

  function handleResize(){
    const cs = document.getElementById('canvasScroll').getBoundingClientRect();
    state.view.w = cs.width/state.view.zoom;
    state.view.h = cs.height/state.view.zoom;
    renderView();
  }
  window.addEventListener('resize', handleResize);
  new ResizeObserver(handleResize).observe(document.getElementById('canvasScroll'));
}
