const TAU = Math.PI * 2;

function vectorAngle(ux, uy, vx, vy){
  const sign = (ux*vy - uy*vx) < 0 ? -1 : 1;
  let dot = ux*vx + uy*vy;
  const lenU = Math.hypot(ux,uy), lenV = Math.hypot(vx,vy);
  dot = Math.min(1, Math.max(-1, dot/(lenU*lenV || 1)));
  return sign * Math.acos(dot);
}


export function endpointToCenter(x1,y1, rx,ry, phiDeg, largeArc, sweep, x2,y2){
  rx = Math.abs(rx); ry = Math.abs(ry);
  if(rx < 1e-9 || ry < 1e-9) return null;
  if(x1===x2 && y1===y2) return null;

  const phi = (phiDeg % 360) * Math.PI/180;
  const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);

  const dx2 = (x1-x2)/2, dy2 = (y1-y2)/2;
  const x1p = cosPhi*dx2 + sinPhi*dy2;
  const y1p = -sinPhi*dx2 + cosPhi*dy2;

  let rxSq = rx*rx, rySq = ry*ry;
  const x1pSq = x1p*x1p, y1pSq = y1p*y1p;
  const lambda = x1pSq/rxSq + y1pSq/rySq;
  if(lambda > 1){
    const s = Math.sqrt(lambda);
    rx *= s; ry *= s;
    rxSq = rx*rx; rySq = ry*ry;
  }

  const sign = (largeArc !== sweep) ? 1 : -1;
  const num = rxSq*rySq - rxSq*y1pSq - rySq*x1pSq;
  const den = rxSq*y1pSq + rySq*x1pSq;
  const coef = sign * Math.sqrt(Math.max(0, num/den || 0));
  const cxp = coef * (rx*y1p/ry);
  const cyp = coef * (-ry*x1p/rx);

  const cx = cosPhi*cxp - sinPhi*cyp + (x1+x2)/2;
  const cy = sinPhi*cxp + cosPhi*cyp + (y1+y2)/2;

  const theta1 = vectorAngle(1,0, (x1p-cxp)/rx, (y1p-cyp)/ry);
  let dtheta = vectorAngle((x1p-cxp)/rx, (y1p-cyp)/ry, (-x1p-cxp)/rx, (-y1p-cyp)/ry);
  if(!sweep && dtheta > 0) dtheta -= TAU;
  if(sweep && dtheta < 0) dtheta += TAU;

  return { cx, cy, rx, ry, phi, theta1, dtheta };
}

function pointAtAngle(c, theta){
  const cosPhi = Math.cos(c.phi), sinPhi = Math.sin(c.phi);
  const cosT = Math.cos(theta), sinT = Math.sin(theta);
  return {
    x: c.cx + c.rx*cosPhi*cosT - c.ry*sinPhi*sinT,
    y: c.cy + c.rx*sinPhi*cosT + c.ry*cosPhi*sinT,
  };
}


function angleInSweep(theta, c){
  let t = theta - c.theta1;

  t = t % TAU;
  if(c.dtheta >= 0){
    if(t < 0) t += TAU;
    return t <= c.dtheta;
  } else {
    if(t > 0) t -= TAU;
    return t >= c.dtheta;
  }
}


export function arcBounds(x1,y1, rx,ry, phiDeg, largeArc, sweep, x2,y2){
  const c = endpointToCenter(x1,y1, rx,ry, phiDeg, largeArc, sweep, x2,y2);
  if(!c) return null;
  const pts = [{x:x1,y:y1}, {x:x2,y:y2}];
  const phi = c.phi;

  const tx = Math.atan2(-c.ry*Math.sin(phi), c.rx*Math.cos(phi));
  const ty = Math.atan2(c.ry*Math.cos(phi), c.rx*Math.sin(phi));
  [tx, tx+Math.PI, ty, ty+Math.PI].forEach(theta=>{
    if(angleInSweep(theta, c)) pts.push(pointAtAngle(c, theta));
  });
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  pts.forEach(p=>{
    if(p.x<minX) minX=p.x; if(p.x>maxX) maxX=p.x;
    if(p.y<minY) minY=p.y; if(p.y>maxY) maxY=p.y;
  });
  return { x:minX, y:minY, w:maxX-minX, h:maxY-minY };
}
