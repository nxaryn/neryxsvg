





import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.DOMParser = dom.window.DOMParser;

const { sanitizeElementTree, assertNoDangerousXmlDeclarations } = await import('../js/svg/Sanitizer.js');

let failed = false;
function assert(cond, msg){
  if(!cond){ console.error('FAIL:', msg); failed = true; }
  else console.log('ok  -', msg);
}

function sanitize(src){
  const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
  const root = doc.documentElement;
  sanitizeElementTree(root);
  return root.outerHTML || new dom.window.XMLSerializer().serializeToString(root);
}

const cases = [
  {
    name: 'strips <script> entirely',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect x="0" y="0" width="1" height="1"/></svg>`,
    check: out => !/script/i.test(out) && /rect/.test(out),
  },
  {
    name: 'strips onload/onclick/on* event handler attributes',
    src: `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect onclick="alert(2)" onmouseover="alert(3)" x="0" y="0" width="1" height="1"/></svg>`,
    check: out => !/onload|onclick|onmouseover/i.test(out),
  },
  {
    name: 'strips a javascript: URL in xlink:href',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="javascript:alert(1)"><rect x="0" y="0" width="1" height="1"/></a></svg>`,
    check: out => !/javascript:/i.test(out),
  },
  {
    name: 'strips a <use> pointing at a non-fragment (absolute URL) href',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.example/x.svg#y"/></svg>`,
    check: out => !/evil\.example/i.test(out),
  },
  {
    name: 'keeps a <use> pointing at a safe same-document fragment',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><circle id="c1" cx="1" cy="1" r="1"/><use href="#c1"/></svg>`,
    check: out => /href="#c1"/.test(out),
  },
  {
    name: 'strips <image> entirely (external or data: URI image content)',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/svg+xml;base64,AAAA" x="0" y="0" width="1" height="1"/></svg>`,
    check: out => !/<image/i.test(out),
  },
  {
    name: 'strips <foreignObject> (arbitrary embedded HTML/script)',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject></svg>`,
    check: out => !/foreignObject/i.test(out),
  },
  {
    name: 'strips a <style> element (CSS-based exfiltration/injection)',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><style>rect{fill:url(https://evil.example/track)}</style><rect x="0" y="0" width="1" height="1"/></svg>`,
    check: out => !/<style/i.test(out) && !/evil\.example/i.test(out),
  },
  {
    name: 'strips a bare style="" attribute (no allowlisted CSS surface at all)',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:red" x="0" y="0" width="1" height="1"/></svg>`,
    check: out => !/style=/i.test(out),
  },
  {
    name: 'strips SMIL <animate>/onbegin (animation entirely out of scope through v1.0)',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="1" height="1"><animate attributeName="x" onbegin="alert(1)" to="5" dur="1s"/></rect></svg>`,
    check: out => !/animate/i.test(out) && !/onbegin/i.test(out),
  },
  {
    name: 'v0.95: strips an external url(...) fill reference (paint-server SSRF/tracking)',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://evil.example/track.svg#x)" x="0" y="0" width="1" height="1"/></svg>`,
    check: out => !/evil\.example/i.test(out),
  },
  {
    name: 'v0.95: strips an external url(...) stroke reference too',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><rect stroke="url(//evil.example/track.svg#x)" x="0" y="0" width="1" height="1"/></svg>`,
    check: out => !/evil\.example/i.test(out),
  },
  {
    name: 'v0.95: keeps a local url(#gradientId) fill reference (legitimate, same-document)',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g1"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect fill="url(#g1)" x="0" y="0" width="1" height="1"/></svg>`,
    check: out => /fill="url\(#g1\)"/.test(out),
  },
  {
    name: 'v0.95: keeps a plain color fill untouched (not a url() reference at all)',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#ff0000" x="0" y="0" width="1" height="1"/></svg>`,
    check: out => /fill="#ff0000"/.test(out),
  },
  {
    name: 'v0.95: strips <script> even with mixed-case tag name (SCRipt)',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><SCRipt>alert(1)</SCRipt><rect x="0" y="0" width="1" height="1"/></svg>`,
    check: out => !/alert\(1\)/i.test(out),
  },
  {
    name: 'v0.95: strips an on* handler even with mixed-case attribute name (OnLoad)',
    src: `<svg xmlns="http://www.w3.org/2000/svg" OnLoad="alert(1)"><rect x="0" y="0" width="1" height="1"/></svg>`,
    check: out => !/alert\(1\)/i.test(out),
  },
  {
    name: 'v0.95: strips javascript: with embedded whitespace/control chars (a common filter-bypass trick)',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><a xlink:href="jav&#x09;ascript:alert(1)"><rect x="0" y="0" width="1" height="1"/></a></svg>`,
    check: out => !/alert\(1\)/i.test(out),
  },
  {
    name: 'v0.95: a <script> tag survives as inert text only if quoted inside CDATA in a DROPPED element (still removed, content included)',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><script><![CDATA[alert(1)]]></script><rect x="0" y="0" width="1" height="1"/></svg>`,
    check: out => !/alert\(1\)/i.test(out),
  },
  {
    name: 'v0.95: strips <set> (SMIL, same as <animate> — attribute-value injection via timed set)',
    src: `<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="1" height="1"><set attributeName="fill" to="url(https://evil.example/x)" begin="0s"/></rect></svg>`,
    check: out => !/<set/i.test(out) && !/evil\.example/i.test(out),
  },
  {
    name: 'v0.95: nested <svg> (legitimate SVG feature) is kept, not treated as suspicious',
    src: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><svg x="1" y="1" width="5" height="5"><rect x="0" y="0" width="1" height="1"/></svg></svg>`,
    check: out => (out.match(/<svg/gi)||[]).length >= 2,
  },
  {
    name: 'legitimate control: a normal shapes+group+gradient document survives untouched',
    src: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><radialGradient id="rg"><stop offset="0" stop-color="#000"/></radialGradient></defs><g transform="translate(1,1)"><rect x="0" y="0" width="2" height="2" fill="url(#rg)" stroke="#000" stroke-width="1"/><text x="1" y="1" font-size="2" font-family="serif">hi</text></g></svg>`,
    check: out => /rect/.test(out) && /radialGradient/.test(out) && />hi</.test(out),
  },
];

cases.forEach(c=>{
  let out;
  try{ out = sanitize(c.src); }
  catch(err){ assert(false, `${c.name} (threw: ${err.message})`); return; }
  assert(c.check(out), c.name);
});


{
  let threw = false;
  try{
    assertNoDangerousXmlDeclarations(
      `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]><svg xmlns="http://www.w3.org/2000/svg"><text>&lol2;</text></svg>`
    );
  }catch(err){ threw = true; }
  assert(threw, 'assertNoDangerousXmlDeclarations rejects a DOCTYPE/ENTITY payload before parsing');

  threw = false;
  try{ assertNoDangerousXmlDeclarations(`<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`); }
  catch(err){ threw = true; }
  assert(!threw, 'assertNoDangerousXmlDeclarations does not flag a normal SVG with no DOCTYPE');
}

console.log(failed ? '\nSANITIZER TESTS: FAILED' : '\nSANITIZER TESTS: PASSED');
if(failed) process.exitCode = 1;
