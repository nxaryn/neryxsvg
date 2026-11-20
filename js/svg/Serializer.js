import { getChildren, getWorldBounds, shapeLocalBounds } from '../document/Element.js';
import { gradientIdFromRef } from '../document/Gradients.js';
import { Matrix } from '../utils/Matrix.js';
import { pathToD } from './PathParser.js';

function round2(n){ return Math.round(n*100)/100; }
function escapeXml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }





function leafTransformAttr(el, cx, cy){
  const parts = [];
  if(el.rotation) parts.push(`rotate(${round2(el.rotation)} ${round2(cx)} ${round2(cy)})`);
  if(el.flipX || el.flipY){
    parts.push(`translate(${round2(cx)} ${round2(cy)})`);
    parts.push(`scale(${el.flipX?-1:1} ${el.flipY?-1:1})`);
    parts.push(`translate(${round2(-cx)} ${round2(-cy)})`);
  }
  return parts.join(' ');
}

function elementToMarkup(doc, el, indent){
  if(!el.visible) return '';
  const pad = '  '.repeat(indent);

  if(el.type === 'group'){
    const t = Matrix.toAttrString(el.transform);
    const transformAttr = t ? ` transform="${t}"` : '';
    const children = getChildren(doc, el.id)
      .map(c=>elementToMarkup(doc, c, indent+1))
      .filter(Boolean)
      .join('\n');
    if(!children) return '';
    return `${pad}<g${transformAttr}>\n${children}\n${pad}</g>`;
  }

  const a = el.attrs;
  const styleAttrs = [
    `fill="${el.style.fill}"`,
    `stroke="${el.style.stroke}"`,
    `stroke-width="${el.style.strokeWidth}"`,
    el.style.fillOpacity!=null ? `fill-opacity="${el.style.fillOpacity}"` : '',
    el.style.strokeOpacity!=null && el.style.strokeOpacity<1 ? `stroke-opacity="${el.style.strokeOpacity}"` : '',
    el.style.strokeLinecap && el.style.strokeLinecap!=='butt' ? `stroke-linecap="${el.style.strokeLinecap}"` : '',
    el.style.strokeLinejoin && el.style.strokeLinejoin!=='miter' ? `stroke-linejoin="${el.style.strokeLinejoin}"` : '',
    el.style.strokeDasharray ? `stroke-dasharray="${el.style.strokeDasharray}"` : '',
    el.style.strokeDashoffset ? `stroke-dashoffset="${el.style.strokeDashoffset}"` : '',
  ].filter(Boolean).join(' ');
  const b = shapeLocalBounds(el);
  const cx = b.x+b.w/2, cy = b.y+b.h/2;
  const t = leafTransformAttr(el, cx, cy);
  const transformAttr = t ? ` transform="${t}"` : '';
  let tag = '';
  switch(el.type){
    case 'rect': case 'rrect':
      tag = `<rect x="${round2(a.x)}" y="${round2(a.y)}" width="${round2(a.width)}" height="${round2(a.height)}"${el.type==='rrect'?` rx="${round2(a.rx||0)}" ry="${round2(a.ry!=null?a.ry:(a.rx||0))}"`:''} ${styleAttrs}${transformAttr}/>`; break;
    case 'circle':
      tag = `<circle cx="${round2(a.cx)}" cy="${round2(a.cy)}" r="${round2(a.r)}" ${styleAttrs}${transformAttr}/>`; break;
    case 'ellipse':
      tag = `<ellipse cx="${round2(a.cx)}" cy="${round2(a.cy)}" rx="${round2(a.rx)}" ry="${round2(a.ry)}" ${styleAttrs}${transformAttr}/>`; break;
    case 'line':
      tag = `<line x1="${round2(a.x1)}" y1="${round2(a.y1)}" x2="${round2(a.x2)}" y2="${round2(a.y2)}" ${styleAttrs}${transformAttr}/>`; break;
    case 'polygon': case 'polyline':
      tag = `<${el.type} points="${a.points.map(p=>`${round2(p.x)},${round2(p.y)}`).join(' ')}" ${styleAttrs}${transformAttr}/>`; break;
    case 'path':
      tag = `<path d="${pathToD(a.commands)}" ${styleAttrs}${transformAttr}/>`; break;
    case 'text': {





      const textAttrs = [
        a.fontWeight && a.fontWeight!=='normal' ? `font-weight="${a.fontWeight}"` : '',
        a.fontStyle && a.fontStyle!=='normal' ? `font-style="${a.fontStyle}"` : '',
        a.textAnchor && a.textAnchor!=='start' ? `text-anchor="${a.textAnchor}"` : '',
        a.letterSpacing ? `letter-spacing="${round2(a.letterSpacing)}"` : '',
      ].filter(Boolean).join(' ');
      tag = `<text x="${round2(a.x)}" y="${round2(a.y)}" font-size="${a.fontSize}" font-family="${a.fontFamily||'monospace'}"${textAttrs?` ${textAttrs}`:''} fill="${el.style.fill}"${transformAttr}>${escapeXml(a.content||'')}</text>`; break;
    }
    case 'raw':
      tag = a.html; break;
  }
  return pad + tag;
}

export function computeContentBounds(doc, topLevelEls){
  if(!topLevelEls.length) return { x:0, y:0, w:400, h:300 };
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  topLevelEls.forEach(el=>{
    const b = getWorldBounds(doc, el);
    minX=Math.min(minX,b.x); minY=Math.min(minY,b.y);
    maxX=Math.max(maxX,b.x+b.w); maxY=Math.max(maxY,b.y+b.h);
  });
  const pad = 10;
  return { x:round2(minX-pad), y:round2(minY-pad), w:round2(maxX-minX+pad*2), h:round2(maxY-minY+pad*2) };
}






export function resolvePageBounds(doc, topLevelEls){
  if(!doc.settings.autoFitViewBox){
    return { x:doc.viewBox.x, y:doc.viewBox.y, w:doc.viewBox.width, h:doc.viewBox.height };
  }
  return computeContentBounds(doc, topLevelEls);
}




export function fitDocumentToContent(doc, topLevelEls){
  const b = computeContentBounds(doc, topLevelEls);
  doc.viewBox = { x:b.x, y:b.y, width:b.w, height:b.h };
  doc.width = b.w; doc.height = b.h;
  doc.settings.autoFitViewBox = false;
  return b;
}

function usedGradientIds(doc, topLevelEls){
  const ids = new Set();
  const visit = (el)=>{
    if(el.style){
      const f = gradientIdFromRef(el.style.fill), s = gradientIdFromRef(el.style.stroke);
      if(f) ids.add(f);
      if(s) ids.add(s);
    }
    if(el.type==='group') getChildren(doc, el.id).forEach(visit);
  };
  topLevelEls.forEach(visit);
  return ids;
}

function gradientToMarkup(g){
  const stops = g.stops.map(s=>
    `    <stop offset="${s.offset}" stop-color="${s.color}"${s.opacity!=null && s.opacity<1 ? ` stop-opacity="${s.opacity}"`:''}/>`
  ).join('\n');
  if(g.kind==='radial'){
    return `  <radialGradient id="${g.id}" cx="${g.cx}" cy="${g.cy}" r="${g.r}">\n${stops}\n  </radialGradient>`;
  }
  return `  <linearGradient id="${g.id}" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}">\n${stops}\n  </linearGradient>`;
}

export function serializeSVG(doc, topLevelEls){
  const b = resolvePageBounds(doc, topLevelEls);
  const usedIds = usedGradientIds(doc, topLevelEls);
  const defsBlock = (doc.defs||[]).filter(g=>usedIds.has(g.id)).map(gradientToMarkup).join('\n');
  const defs = defsBlock ? `<defs>\n${defsBlock}\n</defs>\n` : '';
  const body = topLevelEls.map(el=>elementToMarkup(doc, el, 1)).filter(Boolean).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${round2(b.x)} ${round2(b.y)} ${round2(b.w)} ${round2(b.h)}" width="${round2(b.w)}" height="${round2(b.h)}">\n${defs}${body}\n</svg>`;
}
