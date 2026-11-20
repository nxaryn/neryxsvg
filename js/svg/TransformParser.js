import { Matrix } from '../utils/Matrix.js';











export function parseTransformAttr(str){
  let m = Matrix.identity();
  if(!str) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match;
  while((match = re.exec(str))){
    const fn = match[1];
    const args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let t = Matrix.identity();
    if(fn==='matrix' && args.length===6){
      t = { a:args[0], b:args[1], c:args[2], d:args[3], e:args[4], f:args[5] };
    } else if(fn==='translate'){
      t = Matrix.translate(args[0]||0, args[1]!=null ? args[1] : 0);
    } else if(fn==='scale'){
      const sx = args[0]!=null ? args[0] : 1;
      const sy = args[1]!=null ? args[1] : sx;
      t = Matrix.scale(sx, sy);
    } else if(fn==='rotate'){
      const ang = args[0]||0;
      t = args.length>=3 ? Matrix.rotate(ang, args[1], args[2]) : Matrix.rotate(ang, 0, 0);
    } else if(fn==='skewX'){
      t = Matrix.skewX(args[0]||0);
    } else if(fn==='skewY'){
      t = Matrix.skewY(args[0]||0);
    }
    m = Matrix.multiply(m, t);
  }
  return m;
}
