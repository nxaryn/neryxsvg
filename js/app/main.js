import { state } from './State.js';
import { createElement } from '../document/Element.js';
import * as History from '../document/History.js';
import { snapshotElements, makeReplaceElementsCommand } from '../document/Commands.js';
import { renderAll } from './renderAll.js';
import { initView, fitToContent } from '../canvas/Navigation.js';
import { getWorldBounds } from '../document/Element.js';
import { buildToolbar, wireTopbar } from '../ui/Toolbar.js';




import '../canvas/Interaction.js';
import '../ui/CodeEditor.js';
import { runRecoveryCheck } from './ProjectIO.js';
import { registerServiceWorker } from './PWA.js';

function seedExample(){
  const rect = createElement('rrect', { x:40, y:40, width:160, height:100, rx:10, ry:10 });
  rect.style.fill = '#4fd1c5'; rect.style.fillOpacity = 0.18; rect.style.stroke = '#4fd1c5';
  const circle = createElement('circle', { cx:320, cy:110, r:55 });
  circle.style.fill = '#e0a95a'; circle.style.fillOpacity = 0.16; circle.style.stroke = '#e0a95a';
  const line = createElement('line', { x1:40, y1:200, x2:400, y2:200 });
  const path = createElement('path', { commands:[
    {type:'M', x:60, y:280}, {type:'C', x1:100,y1:220, x2:180,y2:340, x:220,y:280},
    {type:'S', x2:320,y2:340, x:360,y:280}
  ]});
  path.style.stroke = '#e05a9e';
  const text = createElement('text', { x:60, y:340, fontSize:18, fontFamily:'ui-monospace, monospace', content:'Drag me. Then group and rotate →' });
  state.document.elements.push(rect, circle, line, path, text);
}

function init(){
  buildToolbar();
  wireTopbar();
  seedExample();
  initView();
  History.push(state.history, makeReplaceElementsCommand(state.document, [], state.document.elements));
  renderAll();
  const topLevel = state.document.elements.filter(e=>!e.parentId);
  if(topLevel.length){
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    topLevel.forEach(el=>{
      const b = getWorldBounds(state.document, el);
      minX=Math.min(minX,b.x); minY=Math.min(minY,b.y);
      maxX=Math.max(maxX,b.x+b.w); maxY=Math.max(maxY,b.y+b.h);
    });
    fitToContent({ x:minX, y:minY, w:maxX-minX, h:maxY-minY });
  }
}
init();





runRecoveryCheck();




registerServiceWorker();
