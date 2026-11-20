import { state } from '../app/State.js';
import { Matrix } from '../utils/Matrix.js';
import { uid } from '../utils/ids.js';
import { createElement, createGroup, shapeLocalBounds } from '../document/Element.js';
import { createDocument } from '../document/Document.js';
import { serializeSVG, computeContentBounds } from '../svg/Serializer.js';
import { parseDToCommands } from '../svg/PathParser.js';
import { parseTransformAttr } from '../svg/TransformParser.js';
import { sanitizeElementTree, assertNoDangerousXmlDeclarations } from '../svg/Sanitizer.js';
import { renderAll } from '../app/renderAll.js';
import { fitToContent } from '../canvas/Navigation.js';
import { replaceDocument } from '../canvas/Interaction.js';

function doc(){ return state.document; }
function round2(n){ return Math.round(n*100)/100; }
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), 1400);
}

const codeText = document.getElementById('codeText');
const codeHighlight = document.getElementById('codeHighlight').querySelector('code');
let codeEditingByUser = false;

function highlightXML(src){
  return src.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/(&lt;\/?)([a-zA-Z0-9]+)/g, '$1<span class="tok-tag">$2</span>')
    .replace(/([a-zA-Z-]+)(=)(&quot;|")([^"]*)(&quot;|")/g, '<span class="tok-attr">$1</span>$2<span class="tok-str">$3$4$5</span>')
    .replace(/(\/?&gt;)/g, '<span class="tok-punc">$1</span>');
}

export function syncCodePanel(){
  if(codeEditingByUser) return;
  const topLevel = doc().elements.filter(e=>!e.parentId);
  const src = serializeSVG(doc(), topLevel);
  codeText.value = src;
  codeHighlight.innerHTML = highlightXML(src);
}

const codeHighlightPre = document.getElementById('codeHighlight');
codeText.addEventListener('scroll', ()=>{
  codeHighlightPre.scrollTop = codeText.scrollTop;
  codeHighlightPre.scrollLeft = codeText.scrollLeft;
});
codeText.addEventListener('focus', ()=>{ codeEditingByUser = true; });
codeText.addEventListener('input', ()=>{ codeHighlight.innerHTML = highlightXML(codeText.value); });
codeText.addEventListener('blur', ()=>{
  codeEditingByUser = false;
  try{
    importSVGSource(codeText.value, true);
  }catch(err){
    toast('Could not parse SVG source');
    syncCodePanel();
  }
});

document.getElementById('codeTabHeader').addEventListener('click', (e)=>{
  if(e.target.id==='btnCopySvg') return;
  document.getElementById('bottomPanel').classList.toggle('collapsed');
});
document.getElementById('btnCopySvg').addEventListener('click', (e)=>{
  e.stopPropagation();
  const topLevel = doc().elements.filter(e=>!e.parentId);

  if(!navigator.clipboard || !navigator.clipboard.writeText){
    toast('Clipboard access isn\u2019t available in this browser');
    return;
  }
  navigator.clipboard.writeText(serializeSVG(doc(), topLevel))
    .then(()=>toast('SVG copied to clipboard'))
    .catch(()=>toast('Could not copy to clipboard'));
});


function matricesApproxEqual(a,b,eps){
  return Math.abs(a.a-b.a)<eps && Math.abs(a.b-b.b)<eps && Math.abs(a.c-b.c)<eps &&
    Math.abs(a.d-b.d)<eps && Math.abs(a.e-b.e)<eps && Math.abs(a.f-b.f)<eps;
}


function applyImportedTransform(el, transformAttr) {
  if (!transformAttr) return null;
  const m = parseTransformAttr(transformAttr);
  if (Matrix.isIdentity(m)) return null;
  const b = shapeLocalBounds(el);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const dec = Matrix.decompose(m);
  const flipX = dec.scaleX < 0, flipY = dec.scaleY < 0;
  const candidate = Matrix.fromRotateFlip(dec.rotation, flipX, flipY, cx, cy);
  if (matricesApproxEqual(candidate, m, 1e-3)) {
    el.rotation = round2(dec.rotation);
    el.flipX = flipX; el.flipY = flipY;
    return null;
  }
  return m;
}

function num(node, attr){ return parseFloat(node.getAttribute(attr))||0; }

function readFillOrStroke(node, attr, gradientIdRemap){
  const v = node.getAttribute(attr);
  if(!v) return null;
  const m = /^url\(#([^)]+)\)$/.exec(v.trim());
  if(m) return `url(#${gradientIdRemap.get(m[1]) || m[1]})`;
  return v;
}

function makeImportedElement(type, attrs, node, parentId, gradientIdRemap){
  const el = createElement(type, attrs, parentId);
  const fill = readFillOrStroke(node, 'fill', gradientIdRemap);
  const stroke = readFillOrStroke(node, 'stroke', gradientIdRemap);
  el.style.fill = fill || (type==='line'||type==='polyline'||type==='path' ? 'none' : el.style.fill);
  el.style.stroke = stroke || el.style.stroke;
  const swAttr = node.getAttribute('stroke-width');
  if(swAttr) el.style.strokeWidth = parseFloat(swAttr);
  const foAttr = node.getAttribute('fill-opacity');
  if(foAttr) el.style.fillOpacity = parseFloat(foAttr);
  const soAttr = node.getAttribute('stroke-opacity');
  if(soAttr) el.style.strokeOpacity = parseFloat(soAttr);
  const capAttr = node.getAttribute('stroke-linecap');
  if(capAttr) el.style.strokeLinecap = capAttr;
  const joinAttr = node.getAttribute('stroke-linejoin');
  if(joinAttr) el.style.strokeLinejoin = joinAttr;
  const dashAttr = node.getAttribute('stroke-dasharray');
  if(dashAttr) el.style.strokeDasharray = dashAttr;
  const dashOffAttr = node.getAttribute('stroke-dashoffset');
  if(dashOffAttr) el.style.strokeDashoffset = parseFloat(dashOffAttr);
  return el;
}


function parseGradients(root){
  const gradients = [];
  const idRemap = new Map();
  root.querySelectorAll('linearGradient, radialGradient').forEach(node=>{
    const origId = node.getAttribute('id');
    if(!origId) return;
    const kind = node.tagName.toLowerCase()==='radialgradient' ? 'radial' : 'linear';
    const stops = Array.from(node.querySelectorAll('stop')).map(s=>({
      offset: parseFloat(s.getAttribute('offset'))||0,
      color: s.getAttribute('stop-color') || '#000000',
      opacity: s.getAttribute('stop-opacity')!=null ? parseFloat(s.getAttribute('stop-opacity')) : 1,
    }));
    if(!stops.length) return;
    const g = kind==='radial'
      ? { id: uid('grad'), kind, cx: numOr(node,'cx',0.5), cy: numOr(node,'cy',0.5), r: numOr(node,'r',0.5), stops }
      : { id: uid('grad'), kind, x1: numOr(node,'x1',0), y1: numOr(node,'y1',0), x2: numOr(node,'x2',1), y2: numOr(node,'y2',0), stops };
    gradients.push(g);
    idRemap.set(origId, g.id);
  });
  return { gradients, idRemap };
}
function numOr(node, attr, fallback){
  const v = node.getAttribute(attr);
  return v!=null ? parseFloat(v) : fallback;
}

const MAX_USE_DEPTH = 8;

function importSVGSource(src, keepView){

  assertNoDangerousXmlDeclarations(src);
  const parser = new DOMParser();
  const parsed = parser.parseFromString(src, 'image/svg+xml');
  if(parsed.querySelector('parsererror')) throw new Error('parse error');
  const root = parsed.documentElement;
  sanitizeElementTree(root);

  const { gradients, idRemap: gradientIdRemap } = parseGradients(root);


  const byId = new Map();
  root.querySelectorAll('[id]').forEach(n=>{ if(!byId.has(n.getAttribute('id'))) byId.set(n.getAttribute('id'), n); });

  const newElements = [];

  function pushLeafWithTransform(el, transformAttr){
    const overflowMatrix = applyImportedTransform(el, transformAttr);
    if(overflowMatrix){
      const wrapper = createGroup(el.parentId);
      wrapper.transform = overflowMatrix;
      el.parentId = wrapper.id;
      newElements.push(wrapper);
    }
    newElements.push(el);
  }

  function convertOneNode(child, parentId, ancestorIds){
    const tag = child.tagName.toLowerCase();
    if(tag==='g'){

      const group = createGroup(parentId);
      group.transform = parseTransformAttr(child.getAttribute('transform'));
      newElements.push(group);
      walk(child, group.id, ancestorIds);
    } else if(tag==='rect'){
      const rx = parseFloat(child.getAttribute('rx'))||0;
      const el = makeImportedElement(rx>0?'rrect':'rect', {
        x:num(child,'x'), y:num(child,'y'), width:num(child,'width'), height:num(child,'height'),
        rx, ry: parseFloat(child.getAttribute('ry'))||rx
      }, child, parentId, gradientIdRemap);
      pushLeafWithTransform(el, child.getAttribute('transform'));
    } else if(tag==='circle'){
      const el = makeImportedElement('circle', { cx:num(child,'cx'), cy:num(child,'cy'), r:num(child,'r') }, child, parentId, gradientIdRemap);
      pushLeafWithTransform(el, child.getAttribute('transform'));
    } else if(tag==='ellipse'){
      const el = makeImportedElement('ellipse', { cx:num(child,'cx'), cy:num(child,'cy'), rx:num(child,'rx'), ry:num(child,'ry') }, child, parentId, gradientIdRemap);
      pushLeafWithTransform(el, child.getAttribute('transform'));
    } else if(tag==='line'){
      const el = makeImportedElement('line', { x1:num(child,'x1'), y1:num(child,'y1'), x2:num(child,'x2'), y2:num(child,'y2') }, child, parentId, gradientIdRemap);
      pushLeafWithTransform(el, child.getAttribute('transform'));
    } else if(tag==='polygon' || tag==='polyline'){
      const pts = (child.getAttribute('points')||'').trim().split(/\s+/).filter(Boolean).map(pair=>{
        const [x,y] = pair.split(',').map(parseFloat); return {x:x||0,y:y||0};
      });
      const el = makeImportedElement(tag, { points:pts }, child, parentId, gradientIdRemap);
      pushLeafWithTransform(el, child.getAttribute('transform'));
    } else if(tag==='path'){
      const cmds = parseDToCommands(child.getAttribute('d')||'');
      const el = makeImportedElement('path', { commands:cmds }, child, parentId, gradientIdRemap);
      pushLeafWithTransform(el, child.getAttribute('transform'));
    } else if(tag==='text'){

      const fontWeight = child.getAttribute('font-weight');
      const fontStyle = child.getAttribute('font-style');
      const textAnchor = child.getAttribute('text-anchor');
      const letterSpacingAttr = child.getAttribute('letter-spacing');
      const el = makeImportedElement('text', {
        x:num(child,'x'), y:num(child,'y'), fontSize: parseFloat(child.getAttribute('font-size'))||16,
        fontFamily: child.getAttribute('font-family')||'ui-monospace, monospace', content: child.textContent,
        ...(fontWeight ? { fontWeight } : {}),
        ...(fontStyle ? { fontStyle } : {}),
        ...(textAnchor ? { textAnchor } : {}),
        ...(letterSpacingAttr!=null ? { letterSpacing: parseFloat(letterSpacingAttr)||0 } : {}),
      }, child, parentId, gradientIdRemap);
      pushLeafWithTransform(el, child.getAttribute('transform'));
    } else if(tag==='use'){
      convertUse(child, parentId, ancestorIds);
    }
  }


  function convertUse(useNode, parentId, ancestorIds){
    const href = useNode.getAttribute('href') || useNode.getAttribute('xlink:href');
    if(!href || href[0]!=='#') return;
    const targetId = href.slice(1);
    if(ancestorIds.has(targetId) || ancestorIds.size >= MAX_USE_DEPTH) return;
    const target = byId.get(targetId);
    if(!target || target === useNode) return;
    const tag = target.tagName.toLowerCase();
    if(!['g','symbol','rect','circle','ellipse','line','polygon','polyline','path','text','use'].includes(tag)) return;


    const ux = num(useNode,'x'), uy = num(useNode,'y');
    const useTransform = Matrix.multiply(parseTransformAttr(useNode.getAttribute('transform')), Matrix.translate(ux,uy));
    const wrapper = createGroup(parentId);
    wrapper.transform = useTransform;
    newElements.push(wrapper);

    const nextAncestors = new Set(ancestorIds);
    nextAncestors.add(targetId);

    if(tag==='use'){
      convertUse(target, wrapper.id, nextAncestors);
    } else if(tag==='g' || tag==='symbol'){
      walk(target, wrapper.id, nextAncestors);
    } else {
      convertOneNode(target, wrapper.id, nextAncestors);
    }
  }

  function walk(node, parentId, ancestorIds){
    Array.from(node.children).forEach(child=>{
      const tag = child.tagName.toLowerCase();

      if(tag==='defs' || tag==='symbol') return;
      convertOneNode(child, parentId, ancestorIds);
    });
  }
  walk(root, null, new Set());

  const newDoc = createDocument();
  newDoc.elements = newElements;
  newDoc.defs = gradients;
  const importedViewBox = root.getAttribute('viewBox');
  if(importedViewBox){
    const parts = importedViewBox.trim().split(/[\s,]+/).map(Number);
    if(parts.length===4 && parts.every(n=>isFinite(n))){
      newDoc.viewBox = { x:parts[0], y:parts[1], width:parts[2], height:parts[3] };
      newDoc.width = parts[2]; newDoc.height = parts[3];

      newDoc.settings.autoFitViewBox = false;
    }
  }
  replaceDocument(newDoc);
  if(!keepView){
    const topLevel = newDoc.elements.filter(e=>!e.parentId);
    fitToContent(topLevel.length ? computeContentBounds(newDoc, topLevel) : null);
  }
  renderAll();
}

export function importSVGSourceExternal(src, keepView){
  importSVGSource(src, keepView);
}

document.getElementById('btnImport').addEventListener('click', ()=>document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{ importSVGSource(reader.result, false); toast('SVG imported'); }
    catch(err){ toast('Failed to import SVG'); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('btnExport').addEventListener('click', ()=>{
  const topLevel = doc().elements.filter(e=>!e.parentId);
  const src = serializeSVG(doc(), topLevel);
  const blob = new Blob([src], {type:'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'drawing.svg';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('SVG exported');
});
