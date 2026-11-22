








import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'editor.html'), 'utf8');
const dom = new JSDOM(html, { url: 'https://neryxsvg.test/editor.html', runScripts: 'dangerously', pretendToBeVisual: true });
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
  const modPath = path.resolve(root, '.' + script.getAttribute('src'));
  await import(pathToFileURL(modPath).href).catch(err=>{ console.error('Boot failed:', err); process.exit(1); });
}
await new Promise(r=>setTimeout(r, 20));

const { importSVGSourceExternal } = await import('../js/ui/CodeEditor.js');
const { state } = await import('../js/app/State.js');

let failed = false;
function assert(cond, msg){
  if(!cond){ console.error('FAIL:', msg); failed = true; }
  else console.log('ok  -', msg);
}
function withTimeout(fn, ms){
  return Promise.race([
    Promise.resolve().then(fn),
    new Promise((_, reject)=>setTimeout(()=>reject(new Error('timed out — likely hung')), ms)),
  ]);
}


{
  const src = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">
    <symbol id="A"><use href="#B"/><rect x="0" y="0" width="1" height="1"/></symbol>
    <symbol id="B"><use href="#A"/><circle cx="1" cy="1" r="1"/></symbol>
    <use href="#A"/>
  </svg>`;
  let threw = null;
  try{
    await withTimeout(()=>importSVGSourceExternal(src, false), 2000);
  }catch(err){ threw = err; }
  assert(!threw, `mutually-referencing <symbol>s import without hanging or throwing (${threw && threw.message})`);
  assert(state.document.elements.length > 0, 'the cycle still produces SOME content (the non-cyclic rect/circle inside each symbol)');
}


{
  const src = `<svg xmlns="http://www.w3.org/2000/svg"><use id="u1" href="#u1"/></svg>`;
  let threw = null;
  try{ await withTimeout(()=>importSVGSourceExternal(src, false), 2000); }
  catch(err){ threw = err; }
  assert(!threw, `a <use> referencing itself directly does not hang or throw (${threw && threw.message})`);
}


{
  const N = 20;
  let defs = '';
  for(let i=0;i<N;i++) defs += `<symbol id="s${i}">${i<N-1?`<use href="#s${i+1}"/>`:'<rect x="0" y="0" width="1" height="1"/>'}</symbol>`;
  const src = `<svg xmlns="http://www.w3.org/2000/svg">${defs}<use href="#s0"/></svg>`;
  let threw = null;
  try{ await withTimeout(()=>importSVGSourceExternal(src, false), 2000); }
  catch(err){ threw = err; }
  assert(!threw, `a long (20-deep) non-cyclic <use> chain does not hang (${threw && threw.message})`);
}


{
  const src = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
    <symbol id="dot"><circle cx="1" cy="1" r="1"/></symbol>
    <use href="#dot" x="0" y="0"/>
    <use href="#dot" x="5" y="5"/>
  </svg>`;
  await importSVGSourceExternal(src, false);
  assert(state.document.elements.some(e=>e.type==='circle'), 'a legitimate (non-cyclic) <use> of a <symbol> still resolves to real content');
}

console.log(failed ? '\nUSE-CYCLE IMPORT TESTS: FAILED' : '\nUSE-CYCLE IMPORT TESTS: PASSED');
if(failed) process.exitCode = 1;
