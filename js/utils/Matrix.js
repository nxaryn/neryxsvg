function identity(){ return { a:1, b:0, c:0, d:1, e:0, f:0 }; }

function isIdentity(m){
  return m.a===1 && m.b===0 && m.c===0 && m.d===1 && m.e===0 && m.f===0;
}

function multiply(A, B){
  return {
    a: A.a*B.a + A.c*B.b,
    b: A.b*B.a + A.d*B.b,
    c: A.a*B.c + A.c*B.d,
    d: A.b*B.c + A.d*B.d,
    e: A.a*B.e + A.c*B.f + A.e,
    f: A.b*B.e + A.d*B.f + A.f,
  };
}

function translate(tx, ty){
  return { a:1, b:0, c:0, d:1, e:tx||0, f:ty||0 };
}

function scale(sx, sy){
  if(sy==null) sy = sx;
  return { a:sx, b:0, c:0, d:sy, e:0, f:0 };
}

function rotate(deg, cx, cy){
  const rad = deg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const r = { a:cos, b:sin, c:-sin, d:cos, e:0, f:0 };
  if(!cx && !cy) return r;
  return multiply(multiply(translate(cx,cy), r), translate(-cx,-cy));
}

function skewX(deg){
  return { a:1, b:0, c:Math.tan(deg*Math.PI/180), d:1, e:0, f:0 };
}
function skewY(deg){
  return { a:1, b:Math.tan(deg*Math.PI/180), c:0, d:1, e:0, f:0 };
}


function fromRotateFlip(deg, flipX, flipY, cx, cy){
  let m = identity();
  if(flipX || flipY){
    m = multiply(translate(cx,cy), multiply(scale(flipX?-1:1, flipY?-1:1), translate(-cx,-cy)));
  }
  if(deg){
    m = multiply(rotate(deg, cx, cy), m);
  }
  return m;
}

function applyToPoint(m, p){
  return { x: m.a*p.x + m.c*p.y + m.e, y: m.b*p.x + m.d*p.y + m.f };
}

function applyToVector(m, v){
  return { x: m.a*v.x + m.c*v.y, y: m.b*v.x + m.d*v.y };
}

function invert(m){
  const det = m.a*m.d - m.b*m.c;
  if(Math.abs(det) < 1e-12) return identity();
  return {
    a: m.d/det, b: -m.b/det, c: -m.c/det, d: m.a/det,
    e: (m.c*m.f - m.d*m.e)/det, f: (m.b*m.e - m.a*m.f)/det,
  };
}


function transformBounds(m, b){
  const pts = [
    applyToPoint(m, {x:b.x, y:b.y}),
    applyToPoint(m, {x:b.x+b.w, y:b.y}),
    applyToPoint(m, {x:b.x, y:b.y+b.h}),
    applyToPoint(m, {x:b.x+b.w, y:b.y+b.h}),
  ];
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  pts.forEach(p=>{
    if(p.x<minX) minX=p.x; if(p.x>maxX) maxX=p.x;
    if(p.y<minY) minY=p.y; if(p.y>maxY) maxY=p.y;
  });
  return { x:minX, y:minY, w:maxX-minX, h:maxY-minY };
}


function decompose(m){
  let { a, b, c, d, e, f } = m;
  let scaleX = Math.hypot(a, b);
  if(scaleX){ a/=scaleX; b/=scaleX; }
  let skewVal = a*c + b*d;
  c -= a*skewVal; d -= b*skewVal;
  let scaleY = Math.hypot(c, d);
  if(scaleY){ c/=scaleY; d/=scaleY; skewVal/=scaleY; }
  if(a*d < b*c){ a=-a; b=-b; skewVal=-skewVal; scaleX=-scaleX; }
  const rotationDeg = Math.atan2(b, a) * 180/Math.PI;
  const skewXDeg = Math.atan(skewVal) * 180/Math.PI;
  return { translateX:e, translateY:f, rotation:rotationDeg, scaleX, scaleY, skewX:skewXDeg };
}

function round(n){ return Math.round(n*1000)/1000; }


function toAttrString(m){
  if(!m || isIdentity(m)) return '';
  return `matrix(${round(m.a)} ${round(m.b)} ${round(m.c)} ${round(m.d)} ${round(m.e)} ${round(m.f)})`;
}


function conjugate(delta, frame){
  return multiply(multiply(invert(frame), delta), frame);
}

export const Matrix = {
  identity, isIdentity, multiply, translate, scale, rotate, skewX, skewY,
  fromRotateFlip, applyToPoint, applyToVector, invert, transformBounds,
  decompose, toAttrString, conjugate,
};
