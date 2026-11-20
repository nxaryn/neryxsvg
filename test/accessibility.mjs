




import fs from 'node:fs';
import path from 'node:path';
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
for(const key of ['window', 'document', 'navigator', 'DOMParser', 'Node', 'Element', 'SVGElement', 'HTMLElement', 'CustomEvent', 'Event', 'KeyboardEvent', 'ResizeObserver', 'indexedDB', 'IDBKeyRange']){
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
const { resetRenderCache } = await import('../js/canvas/Renderer.js');
const { resetLayersRenderCache } = await import('../js/ui/Layers.js');
const { renderAll } = await import('../js/app/renderAll.js');
const { showMenu, closeMenu } = await import('../js/ui/ContextMenu.js');

let failed = false;
function assert(cond, msg){
  if(!cond){ console.error('FAIL:', msg); failed = true; }
  else console.log('ok  -', msg);
}
function fireKey(el, key){
  el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}
function fireClick(el, opts){
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, ...opts }));
}


resetRenderCache();
resetLayersRenderCache();
state.document.elements = [
  createElement('rect', { x:0, y:0, width:1, height:1 }),
  createElement('circle', { cx:0, cy:0, r:1 }),
  createElement('text', { x:0, y:0, fontSize:10, content:'hi' }),
];
state.selection = [];
renderAll();

const list = window.document.getElementById('layersList');
assert(list.getAttribute('role') === 'listbox', 'layers list has role="listbox"');
assert(list.getAttribute('aria-multiselectable') === 'true', 'layers list declares aria-multiselectable (shift-click multi-select exists)');

const rows = () => Array.from(list.children).filter(n=>n.dataset && n.dataset.id);
assert(rows().length === 3, 'three layer rows rendered for three document elements');
rows().forEach(r=>assert(r.getAttribute('role')==='option', `row for ${r.dataset.id} has role="option"`));


{
  const tabbable = rows().filter(r=>r.tabIndex===0);
  assert(tabbable.length === 1, 'exactly one row has tabIndex=0 (roving tabindex) with no selection');
}


{
  const secondRow = rows()[1];
  fireClick(secondRow);
  const r = rows();
  assert(r[1].getAttribute('aria-selected') === 'true', 'clicked row reports aria-selected=true');
  assert(r[0].getAttribute('aria-selected') === 'false' && r[2].getAttribute('aria-selected') === 'false', 'other rows report aria-selected=false');
  assert(r[1].tabIndex === 0 && r[0].tabIndex === -1 && r[2].tabIndex === -1, 'roving tabindex follows selection');
}


{
  const selectedRow = rows().find(r=>r.tabIndex===0);
  fireKey(selectedRow, 'ArrowDown');
  const r = rows();
  assert(r[2].getAttribute('aria-selected') === 'true', 'ArrowDown selects the next row');
  assert(window.document.activeElement === r[2], 'ArrowDown moves DOM focus to the newly-selected row');
}


{
  fireKey(rows()[2], 'Home');
  const r = rows();
  assert(r[0].getAttribute('aria-selected') === 'true', 'Home selects the first row');
  fireKey(r[0], 'ArrowUp');
  const r2 = rows();
  assert(r2[0].getAttribute('aria-selected') === 'true', 'ArrowUp at the first row stays on the first row (no out-of-bounds)');
}


{
  state.selection = [state.document.elements[0].id];
  renderAll();
  const xLabel = window.document.querySelector('label[for="field-x"]');
  const xInput = window.document.getElementById('field-x');
  assert(!!xLabel && !!xInput, 'Inspector renders a for/id-associated label+input pair for a geometry field');
}


{
  const opener = window.document.getElementById('btnNew');
  opener.focus();
  assert(window.document.activeElement === opener, 'precondition: opener button is focused before the menu opens');

  let clicked = false;
  showMenu(10, 10, [
    { label: 'Do thing', action: ()=>{ clicked = true; } },
    { label: 'Do other thing', action: ()=>{} },
    { separator: true },
    { label: 'Disabled thing', action: ()=>{}, disabled: true },
  ]);
  await new Promise(r=>setTimeout(r, 5));

  const menu = window.document.querySelector('.context-menu');
  assert(!!menu, 'context menu renders');
  assert(menu.getAttribute('role') === 'menu', 'context menu has role="menu"');
  const items = Array.from(menu.querySelectorAll('.context-menu-item'));
  assert(items.every(i=>i.getAttribute('role')==='menuitem'), 'every menu row has role="menuitem"');
  assert(items[2].disabled && items[2].getAttribute('aria-disabled')==='true', 'disabled item is both disabled and aria-disabled');
  assert(window.document.activeElement === items[0], 'opening the menu moves focus to its first item');

  fireKey(items[0], 'ArrowDown');
  assert(window.document.activeElement === items[1], 'ArrowDown moves focus to the next ENABLED menu item');

  fireKey(window.document.activeElement, 'ArrowDown');
  assert(window.document.activeElement === items[0], 'ArrowDown wraps past the disabled item back to the first enabled one (disabled items are skipped, never focused)');

  fireKey(window.document.activeElement, 'Escape');
  assert(!window.document.querySelector('.context-menu'), 'Escape closes the menu');
  assert(window.document.activeElement === opener, 'closing the menu restores focus to whatever opened it');
  assert(!clicked, 'Escape does not fire the focused item\'s action');
}

console.log(failed ? '\nACCESSIBILITY TESTS: FAILED' : '\nACCESSIBILITY TESTS: PASSED');
if(failed) process.exitCode = 1;
