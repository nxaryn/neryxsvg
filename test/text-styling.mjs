





import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.DOMParser = dom.window.DOMParser;

const { createElement, shapeLocalBounds } = await import('../js/document/Element.js');
const { createDocument } = await import('../js/document/Document.js');
const { serializeSVG } = await import('../js/svg/Serializer.js');
const { sanitizeElementTree, assertNoDangerousXmlDeclarations } = await import('../js/svg/Sanitizer.js');
const { parseTransformAttr } = await import('../js/svg/TransformParser.js');

let failed = false;
function assert(cond, msg){
  if(!cond){ console.error('FAIL:', msg); failed = true; }
  else console.log('ok  -', msg);
}
function approx(a, b, eps=0.01){ return Math.abs(a-b) < eps; }


{
  const start = createElement('text', { x:100, y:50, fontSize:20, content:'Hello' });
  const middle = createElement('text', { x:100, y:50, fontSize:20, content:'Hello', textAnchor:'middle' });
  const end = createElement('text', { x:100, y:50, fontSize:20, content:'Hello', textAnchor:'end' });
  const bStart = shapeLocalBounds(start), bMid = shapeLocalBounds(middle), bEnd = shapeLocalBounds(end);
  assert(approx(bStart.x, 100), '"start" anchor: box begins at x');
  assert(approx(bMid.x, 100 - bMid.w/2), '"middle" anchor: box centered on x');
  assert(approx(bEnd.x, 100 - bEnd.w), '"end" anchor: box ends at x');

  const plain = createElement('text', { x:0, y:0, fontSize:20, content:'Hello' });
  const spaced = createElement('text', { x:0, y:0, fontSize:20, content:'Hello', letterSpacing:5 });
  assert(shapeLocalBounds(spaced).w > shapeLocalBounds(plain).w, 'positive letter-spacing widens the estimated box');
}


{
  const doc = createDocument();
  const el = createElement('text', {
    x:10, y:20, fontSize:14, fontFamily:'Georgia, serif', content:'Styled',
    fontWeight:'bold', fontStyle:'italic', textAnchor:'middle', letterSpacing:1.5,
  });
  doc.elements.push(el);
  const svgSrc = serializeSVG(doc, [el]);

  assert(/font-weight="bold"/.test(svgSrc), 'export emits font-weight when non-default');
  assert(/font-style="italic"/.test(svgSrc), 'export emits font-style when non-default');
  assert(/text-anchor="middle"/.test(svgSrc), 'export emits text-anchor when non-default');
  assert(/letter-spacing="1.5"/.test(svgSrc), 'export emits letter-spacing when non-zero');





  assertNoDangerousXmlDeclarations(svgSrc);
  const parsedDoc = new DOMParser().parseFromString(svgSrc, 'image/svg+xml');
  sanitizeElementTree(parsedDoc.documentElement);
  const textNode = parsedDoc.querySelector('text');
  assert(textNode.getAttribute('font-weight')==='bold', 'font-weight survives sanitize + re-parse');
  assert(textNode.getAttribute('font-style')==='italic', 'font-style survives sanitize + re-parse');
  assert(textNode.getAttribute('text-anchor')==='middle', 'text-anchor survives sanitize + re-parse');
  assert(textNode.getAttribute('letter-spacing')==='1.5', 'letter-spacing survives sanitize + re-parse (was missing from the allowlist before v0.95)');
}


{
  const doc = createDocument();
  const el = createElement('text', { x:0, y:0, fontSize:16, content:'Plain' });
  doc.elements.push(el);
  const svgSrc = serializeSVG(doc, [el]);
  assert(!/font-weight=/.test(svgSrc) && !/font-style=/.test(svgSrc) && !/text-anchor=/.test(svgSrc) && !/letter-spacing=/.test(svgSrc),
    'a text element that never touched the new controls exports exactly as cleanly as before v0.95');
}

console.log(failed ? '\nTEXT STYLING TESTS: FAILED' : '\nTEXT STYLING TESTS: PASSED');
if(failed) process.exitCode = 1;
