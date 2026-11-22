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
for(const key of ['window','document','navigator','DOMParser','Node','Element','SVGElement','HTMLElement','CustomEvent','Event','MouseEvent','KeyboardEvent','ResizeObserver','indexedDB','IDBKeyRange']){
  if(key in window){
    try{ global[key] = window[key]; }
    catch(err){ Object.defineProperty(global, key, { value: window[key], configurable: true }); }
  }
}
for(const script of window.document.querySelectorAll('script[type="module"]')){
  const modPath = path.resolve(root, '.' + script.getAttribute('src'));
  await import(pathToFileURL(modPath).href).catch(err=>{ console.error('Boot failed:', err); process.exit(1); });
}
await new Promise(r=>setTimeout(r, 30));

const { state } = await import('../js/app/State.js');

let failed = false;
function assert(cond, msg){
  if(!cond){ console.error('FAIL:', msg); failed = true; }
  else console.log('ok  -', msg);
}
function fire(el, type){ el.dispatchEvent(new window.Event(type, { bubbles: true })); }

// The settings popup controls must drive the same `state` fields that
// Navigation.js (grid) and Interaction.js (snapping) actually read. Before
// v1.0.1 they only wrote to localStorage, so the controls did nothing.
{
  const spacing = window.document.getElementById('gridSizeInput');
  spacing.value = '25';
  fire(spacing, 'change');
  assert(state.document.settings.gridSize === 25, `grid spacing writes through to state.document.settings.gridSize (got ${state.document.settings.gridSize})`);
  assert(window.localStorage.getItem('neryxsvg:gridSize') === '25', 'grid spacing persists to localStorage');
}

{
  const grid = window.document.getElementById('chkGrid');
  grid.checked = false;
  fire(grid, 'change');
  assert(state.gridVisible === false, 'Show Grid toggle writes through to state.gridVisible');
  grid.checked = true;
  fire(grid, 'change');
  assert(state.gridVisible === true, 'Show Grid toggle back on restores state.gridVisible');
}

{
  const snap = window.document.getElementById('chkSnap');
  snap.checked = false;
  fire(snap, 'change');
  assert(state.snap === false, 'Snap to Grid toggle writes through to state.snap');
  snap.checked = true;
  fire(snap, 'change');
  assert(state.snap === true, 'Snap to Grid toggle back on restores state.snap');
}

// The canvas background must go through the .bg-* / .grid-* classes that
// editor.css already defines, not inline styles that override them and ignore
// the active theme.
{
  const bg = window.document.getElementById('selCanvasBg');
  const scroll = window.document.getElementById('canvasScroll');
  bg.value = 'white';
  fire(bg, 'change');
  assert(scroll.classList.contains('bg-white'), 'canvas background applies the .bg-white class');
  assert(scroll.style.backgroundColor === '', 'canvas background no longer writes an inline background-color');
  bg.value = 'transparent';
  fire(bg, 'change');
  assert(scroll.classList.contains('bg-transparent'), 'canvas background applies .bg-transparent');
}

{
  const style = window.document.getElementById('selGridStyle');
  const scroll = window.document.getElementById('canvasScroll');
  style.value = 'dots';
  fire(style, 'change');
  assert(scroll.classList.contains('grid-dots'), 'grid style applies the .grid-dots class');
  assert(!scroll.classList.contains('grid-squares'), 'grid style removes the previous .grid-squares class');
}

// applyTheme used to do `document.body.className = ''`, wiping any unrelated
// class another feature had put on <body>.
{
  window.document.body.classList.add('some-other-class');
  const theme = window.document.getElementById('selTheme');
  theme.value = 'light';
  fire(theme, 'change');
  assert(window.document.body.classList.contains('theme-light'), 'theme applies .theme-light');
  assert(window.document.body.classList.contains('some-other-class'), 'theme no longer wipes unrelated body classes');
  theme.value = 'dark';
  fire(theme, 'change');
  assert(!window.document.body.classList.contains('theme-light'), 'switching back to dark removes .theme-light');
}

{
  const popup = window.document.getElementById('settingsPopup');
  const btn = window.document.getElementById('btnSettings');
  btn.click();
  assert(popup.classList.contains('show'), 'settings button opens the popup');
  assert(popup.getAttribute('aria-hidden') !== 'true', 'opening the popup clears aria-hidden');
  window.document.getElementById('settingsClose').click();
  assert(!popup.classList.contains('show'), 'Close button dismisses the popup');
}

console.log(failed ? '\nSETTINGS TESTS: FAILED' : '\nSETTINGS TESTS: PASSED');
if(failed) process.exitCode = 1;