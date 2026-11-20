




import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'https://neryxsvg.test/index.html',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
});
const { window } = dom;



window.ResizeObserver = class { observe(){} disconnect(){} };





const fakeCtx2D = new Proxy({}, { get: ()=>()=>fakeCtx2D });
window.HTMLCanvasElement.prototype.getContext = () => fakeCtx2D;
window.navigator.clipboard = { writeText: async ()=>{} };
window.indexedDB = window.indexedDB || global.indexedDB;





for(const key of ['window', 'document', 'navigator', 'DOMParser', 'Node', 'Element', 'SVGElement', 'HTMLElement', 'CustomEvent', 'Event', 'ResizeObserver', 'indexedDB', 'IDBKeyRange']){
  if(key in window){
    try{ global[key] = window[key]; }
    catch(err){ Object.defineProperty(global, key, { value: window[key], configurable: true }); }
  }
}

let bootError = null;
window.addEventListener('error', (e)=>{ bootError = e.error || e.message; });
process.on('unhandledRejection', (err)=>{ bootError = bootError || err; });


for(const script of window.document.querySelectorAll('script[type="module"]')){
  const src = script.getAttribute('src');
  const modPath = path.join(root, src);
  await import(modPath.startsWith('/') ? modPath : path.resolve(modPath))
    .catch(err=>{ bootError = err; });
}

await new Promise(r=>setTimeout(r, 50));

function assert(cond, msg){
  if(!cond){ console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('ok  -', msg);
}

assert(!bootError, `no boot-time error thrown (${bootError && bootError.stack || bootError})`);
assert(window.document.querySelectorAll('#elementsLayer > *').length > 0, 'seed example rendered at least one element');
assert(window.document.getElementById('btnSaveProject'), 'Save button exists in DOM');
assert(window.document.getElementById('btnOpenProject'), 'Open button exists in DOM');
assert(window.document.getElementById('btnSaveProjectAs'), 'Save As button exists in DOM');
assert(window.document.title.includes('NeryxSVG'), `document.title reflects app (got "${window.document.title}")`);

console.log(process.exitCode ? '\nBOOT TEST: FAILED' : '\nBOOT TEST: PASSED');
