









import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'https://neryxsvg.test/index.html', runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
window.ResizeObserver = class { observe(){} disconnect(){} };
window.navigator.clipboard = { writeText: async ()=>{} };
window.indexedDB = window.indexedDB || global.indexedDB;
const fakeCtx2D = new Proxy({}, { get: ()=>()=>fakeCtx2D });
window.HTMLCanvasElement.prototype.getContext = () => fakeCtx2D;
for(const key of ['window', 'document', 'navigator', 'DOMParser', 'Node', 'Element', 'SVGElement', 'HTMLElement', 'CustomEvent', 'Event', 'ResizeObserver', 'indexedDB', 'IDBKeyRange']){
  if(key in window){
    try{ global[key] = window[key]; }
    catch(err){ Object.defineProperty(global, key, { value: window[key], configurable: true }); }
  }
}

for(const script of window.document.querySelectorAll('script[type="module"]')){
  const modPath = path.resolve(path.join(root, script.getAttribute('src')));
  await import(modPath).catch(err=>{ console.error('Boot failed:', err); process.exit(1); });
}
await new Promise(r=>setTimeout(r, 20));

const { state } = await import('../js/app/State.js');
const { createElement } = await import('../js/document/Element.js');
const { serializeSVG } = await import('../js/svg/Serializer.js');
const { resetRenderCache } = await import('../js/canvas/Renderer.js');
const { resetLayersRenderCache, renderLayersPanel } = await import('../js/ui/Layers.js');
const { renderAll } = await import('../js/app/renderAll.js');

function genElements(n){
  const els = [];
  for(let i=0; i<n; i++){
    const kind = i % 4;
    if(kind===0) els.push(createElement('rect', { x:(i%100)*5, y:Math.floor(i/100)*5, width:4, height:4 }));
    else if(kind===1) els.push(createElement('circle', { cx:(i%100)*5, cy:Math.floor(i/100)*5, r:2 }));
    else if(kind===2) els.push(createElement('path', { commands:[
      {type:'M', x:(i%100)*5, y:Math.floor(i/100)*5}, {type:'L', x:(i%100)*5+4, y:Math.floor(i/100)*5+4},
    ]}));
    else els.push(createElement('text', { x:(i%100)*5, y:Math.floor(i/100)*5, fontSize:6, content:'x' }));
  }
  return els;
}

function time(fn){
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

console.log('n\tfirst renderAll\tno-op renderAll\tfirst layers panel\tno-op layers panel\tserializeSVG');
for(const n of [100, 500, 1000, 5000]){
  resetRenderCache();
  resetLayersRenderCache();
  state.document.elements = genElements(n);
  state.selection = [];
  const tFirst = time(()=>renderAll());
  const tNoOp = time(()=>renderAll());






  resetLayersRenderCache();
  const tLayersFirst = time(()=>renderLayersPanel());
  const tLayersNoOp = time(()=>renderLayersPanel());
  const tExport = time(()=>serializeSVG(state.document, state.document.elements));
  console.log(`${n}\t${tFirst.toFixed(1)}ms\t\t${tNoOp.toFixed(1)}ms\t\t${tLayersFirst.toFixed(1)}ms\t\t\t${tLayersNoOp.toFixed(1)}ms\t\t\t${tExport.toFixed(1)}ms`);
}

console.log('\nNote: absolute numbers are jsdom-in-Node, not a real browser\'s paint/layout cost —');
console.log('useful for spotting super-linear scaling or a broken diff (no-op cost should stay small');
console.log('and roughly flat relative to first-render cost as n grows), not as a target user-facing number.');
console.log('The v0.95 roadmap item this partially covers still calls for real-browser measurement.');
