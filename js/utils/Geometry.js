import { arcBounds } from './ArcMath.js';

function rectBounds(x,y,w,h){
  return { x:Math.min(x,x+w), y:Math.min(y,y+h), w:Math.abs(w), h:Math.abs(h) };
}
function circleBounds(cx,cy,r){
  r = Math.abs(r);
  return { x:cx-r, y:cy-r, w:r*2, h:r*2 };
}
function ellipseBounds(cx,cy,rx,ry){
  rx = Math.abs(rx); ry = Math.abs(ry);
  return { x:cx-rx, y:cy-ry, w:rx*2, h:ry*2 };
}
function lineBounds(x1,y1,x2,y2){
  const x = Math.min(x1,x2), y = Math.min(y1,y2);
  return { x, y, w:Math.abs(x2-x1), h:Math.abs(y2-y1) };
}
function pointsBounds(points){
  if(!points || !points.length) return { x:0, y:0, w:0, h:0 };
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for(let i=0;i<points.length;i++){
    const p = points[i];
    if(!p || !isFinite(p.x) || !isFinite(p.y)) continue;
    if(p.x<minX) minX=p.x; if(p.x>maxX) maxX=p.x;
    if(p.y<minY) minY=p.y; if(p.y>maxY) maxY=p.y;
  }
  if(minX===Infinity) return { x:0, y:0, w:0, h:0 };
  return { x:minX, y:minY, w:Math.max(maxX-minX,0), h:Math.max(maxY-minY,0) };
}
function mergeBounds(list){
  const real = list.filter(b=>b && isFinite(b.x) && isFinite(b.y) && isFinite(b.w) && isFinite(b.h));
  if(!real.length) return { x:0, y:0, w:0, h:0 };
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  real.forEach(b=>{
    minX=Math.min(minX,b.x); minY=Math.min(minY,b.y);
    maxX=Math.max(maxX,b.x+b.w); maxY=Math.max(maxY,b.y+b.h);
  });
  return { x:minX, y:minY, w:maxX-minX, h:maxY-minY };
}

function cubicAt(p0,p1,p2,p3,t){
  const mt = 1-t;
  const a = mt*mt*mt, b = 3*mt*mt*t, c = 3*mt*t*t, d = t*t*t;
  return { x: a*p0.x+b*p1.x+c*p2.x+d*p3.x, y: a*p0.y+b*p1.y+c*p2.y+d*p3.y };
}
function cubicExtrema(p0,p1,p2,p3){
  const pts = [p0,p3];
  ['x','y'].forEach(axis=>{
    const a = -p0[axis] + 3*p1[axis] - 3*p2[axis] + p3[axis];
    const b = 2*(p0[axis] - 2*p1[axis] + p2[axis]);
    const c = p1[axis] - p0[axis];
    if(Math.abs(a) < 1e-9){
      if(Math.abs(b) > 1e-9){
        const t = -c/b;
        if(t>0 && t<1) pts.push(cubicAt(p0,p1,p2,p3,t));
      }
    } else {
      const disc = b*b - 4*a*c;
      if(disc >= 0){
        const sq = Math.sqrt(disc);
        [(-b+sq)/(2*a), (-b-sq)/(2*a)].forEach(t=>{
          if(t>0 && t<1) pts.push(cubicAt(p0,p1,p2,p3,t));
        });
      }
    }
  });
  return pts;
}
function quadAt(p0,p1,p2,t){
  const mt = 1-t;
  return { x: mt*mt*p0.x+2*mt*t*p1.x+t*t*p2.x, y: mt*mt*p0.y+2*mt*t*p1.y+t*t*p2.y };
}
function quadExtrema(p0,p1,p2){
  const pts = [p0,p2];
  ['x','y'].forEach(axis=>{
    const denom = p0[axis] - 2*p1[axis] + p2[axis];
    if(Math.abs(denom) > 1e-9){
      const t = (p0[axis]-p1[axis])/denom;
      if(t>0 && t<1) pts.push(quadAt(p0,p1,p2,t));
    }
  });
  return pts;
}

function expandCommands(cmds){
  const out = [];
  let cur = {x:0,y:0}, start = {x:0,y:0}, prevCtrl = null, prevType = null;
  (cmds||[]).forEach(c=>{
    if(c.type==='M'){
      out.push({type:'M', x:c.x, y:c.y});
      cur = {x:c.x,y:c.y}; start = cur; prevCtrl=null; prevType='M';
    } else if(c.type==='L'){
      out.push({type:'L', x:c.x, y:c.y});
      cur = {x:c.x,y:c.y}; prevCtrl=null; prevType='L';
    } else if(c.type==='H'){
      out.push({type:'L', x:c.x, y:cur.y});
      cur = {x:c.x,y:cur.y}; prevCtrl=null; prevType='H';
    } else if(c.type==='V'){
      out.push({type:'L', x:cur.x, y:c.y});
      cur = {x:cur.x,y:c.y}; prevCtrl=null; prevType='V';
    } else if(c.type==='C'){
      out.push({type:'C', x1:c.x1, y1:c.y1, x2:c.x2, y2:c.y2, x:c.x, y:c.y});
      cur = {x:c.x,y:c.y}; prevCtrl = {x:c.x2,y:c.y2}; prevType='C';
    } else if(c.type==='S'){
      const rc = (prevType==='C'||prevType==='S') && prevCtrl
        ? { x: 2*cur.x-prevCtrl.x, y: 2*cur.y-prevCtrl.y }
        : { x: cur.x, y: cur.y };
      out.push({type:'C', x1:rc.x, y1:rc.y, x2:c.x2, y2:c.y2, x:c.x, y:c.y});
      cur = {x:c.x,y:c.y}; prevCtrl = {x:c.x2,y:c.y2}; prevType='S';
    } else if(c.type==='Q'){
      out.push({type:'Q', x1:c.x1, y1:c.y1, x:c.x, y:c.y});
      cur = {x:c.x,y:c.y}; prevCtrl = {x:c.x1,y:c.y1}; prevType='Q';
    } else if(c.type==='T'){
      const rc = (prevType==='Q'||prevType==='T') && prevCtrl
        ? { x: 2*cur.x-prevCtrl.x, y: 2*cur.y-prevCtrl.y }
        : { x: cur.x, y: cur.y };
      out.push({type:'Q', x1:rc.x, y1:rc.y, x:c.x, y:c.y});
      cur = {x:c.x,y:c.y}; prevCtrl = {x:rc.x,y:rc.y}; prevType='T';
    } else if(c.type==='Z'){
      out.push({type:'Z'});
      cur = {x:start.x,y:start.y}; prevCtrl=null; prevType='Z';
    } else if(c.type==='A'){
      out.push({type:'A', rx:c.rx, ry:c.ry, rotation:c.rotation, largeArc:c.largeArc, sweep:c.sweep, x:c.x, y:c.y});
      cur = {x:c.x,y:c.y}; prevCtrl=null; prevType='A';
    }
  });
  return out;
}

function pathBounds(commands){
  const expanded = expandCommands(commands);
  let cur = {x:0,y:0};
  const boxes = [];
  expanded.forEach(c=>{
    if(c.type==='M'){
      boxes.push({x:c.x,y:c.y,w:0,h:0}); cur = {x:c.x,y:c.y};
    } else if(c.type==='L'){
      boxes.push(pointsBounds([cur,{x:c.x,y:c.y}])); cur = {x:c.x,y:c.y};
    } else if(c.type==='C'){
      const pts = cubicExtrema(cur, {x:c.x1,y:c.y1}, {x:c.x2,y:c.y2}, {x:c.x,y:c.y});
      boxes.push(pointsBounds(pts)); cur = {x:c.x,y:c.y};
    } else if(c.type==='Q'){
      const pts = quadExtrema(cur, {x:c.x1,y:c.y1}, {x:c.x,y:c.y});
      boxes.push(pointsBounds(pts)); cur = {x:c.x,y:c.y};
    } else if(c.type==='A'){
      const box = arcBounds(cur.x, cur.y, c.rx, c.ry, c.rotation, c.largeArc, c.sweep, c.x, c.y);

      boxes.push(box || pointsBounds([cur, {x:c.x,y:c.y}]));
      cur = {x:c.x,y:c.y};
    }
  });
  return mergeBounds(boxes);
}

export const Geometry = {
  rectBounds, circleBounds, ellipseBounds, lineBounds, pointsBounds, mergeBounds,
  cubicExtrema, quadExtrema, expandCommands, pathBounds
};
