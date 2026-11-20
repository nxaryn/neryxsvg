
























const ALLOWED_TAGS = new Set([
  'svg','g','defs','symbol','use',
  'rect','circle','ellipse','line','polygon','polyline','path','text','tspan',
  'lineargradient','radialgradient','stop',
  'filter','fegaussianblur',
  'pattern',
  'title','desc',
]);






const ALLOWED_ATTRS = new Set([
  'id','class','transform','viewbox','width','height','x','y',
  'x1','y1','x2','y2','cx','cy','r','rx','ry','points','d',
  'fill','stroke','stroke-width','fill-opacity','stroke-opacity','opacity',
  'stroke-linecap','stroke-linejoin','stroke-dasharray','stroke-dashoffset',
  'font-size','font-family','font-weight','font-style','text-anchor',
  'letter-spacing',
  'offset','stop-color','stop-opacity','gradientunits',
  'filterunits','patternunits','patterncontentunits',
  'filter',
  'href','xlink:href',
]);

const SAFE_FRAGMENT_REF = /^#[A-Za-z0-9_\-:.]+$/;

function isSafeHrefValue(value){
  if(!value) return false;
  const v = value.trim();





  return SAFE_FRAGMENT_REF.test(v);
}

const URL_PAINT_REF = /^\s*url\(\s*(['"]?)([^'")]+)\1\s*\)/i;











function sanitizeUrlRefAttr(node, name){
  const value = node.getAttribute(name);
  if(value == null) return;
  const m = URL_PAINT_REF.exec(value);
  if(!m) return;
  if(!SAFE_FRAGMENT_REF.test(m[2].trim())) node.removeAttribute(name);
}








const DANGEROUS_XML_DECLARATION = /<!DOCTYPE|<!ENTITY/i;

export function assertNoDangerousXmlDeclarations(src){
  if(DANGEROUS_XML_DECLARATION.test(src)){
    throw new Error('This SVG contains a DOCTYPE/ENTITY declaration, which NeryxSVG doesn\u2019t accept.');
  }
}

export function sanitizeElementTree(rootEl){


  const all = Array.from(rootEl.querySelectorAll('*'));
  all.reverse().forEach(node=>{
    const tag = node.tagName.toLowerCase();
    if(!ALLOWED_TAGS.has(tag)){
      node.remove();
      return;
    }
    Array.from(node.attributes || []).forEach(attr=>{
      const name = attr.name.toLowerCase();
      if(name==='href' || name==='xlink:href'){
        if(!isSafeHrefValue(attr.value)) node.removeAttribute(attr.name);
        return;
      }
      if(!ALLOWED_ATTRS.has(name)) node.removeAttribute(attr.name);
    });
    sanitizeUrlRefAttr(node, 'fill');
    sanitizeUrlRefAttr(node, 'stroke');
    sanitizeUrlRefAttr(node, 'filter');
  });

  Array.from(rootEl.attributes || []).forEach(attr=>{
    const name = attr.name.toLowerCase();
    if(!ALLOWED_ATTRS.has(name) && name!=='xmlns') rootEl.removeAttribute(attr.name);
  });
  return rootEl;
}
