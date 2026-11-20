












function round2(n){ return Math.round(n*100)/100; }

export function pathToD(cmds){
  let d = '';
  cmds.forEach(c=>{
    switch(c.type){
      case 'M': d += `M ${round2(c.x)} ${round2(c.y)} `; break;
      case 'L': d += `L ${round2(c.x)} ${round2(c.y)} `; break;
      case 'H': d += `H ${round2(c.x)} `; break;
      case 'V': d += `V ${round2(c.y)} `; break;
      case 'C': d += `C ${round2(c.x1)} ${round2(c.y1)}, ${round2(c.x2)} ${round2(c.y2)}, ${round2(c.x)} ${round2(c.y)} `; break;
      case 'S': d += `S ${round2(c.x2)} ${round2(c.y2)}, ${round2(c.x)} ${round2(c.y)} `; break;
      case 'Q': d += `Q ${round2(c.x1)} ${round2(c.y1)}, ${round2(c.x)} ${round2(c.y)} `; break;
      case 'T': d += `T ${round2(c.x)} ${round2(c.y)} `; break;
      case 'A': d += `A ${round2(c.rx)} ${round2(c.ry)} ${round2(c.rotation)} ${c.largeArc?1:0} ${c.sweep?1:0} ${round2(c.x)} ${round2(c.y)} `; break;
      case 'Z': d += `Z `; break;
    }
  });
  return d.trim();
}

const NUMBER_RE = /[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?/y;
const WSP_COMMA_RE = /[\s,]*/y;
const FLAG_RE = /[01]/y;
const COMMAND_RE = /[MLHVCSQTAZmlhvcsqtaz]/y;

function makeScanner(d){
  let pos = 0;
  function skipSep(){ WSP_COMMA_RE.lastIndex = pos; WSP_COMMA_RE.exec(d); pos = WSP_COMMA_RE.lastIndex; }
  function atEnd(){ skipSep(); return pos >= d.length; }
  function peekCommand(){
    skipSep();
    COMMAND_RE.lastIndex = pos;
    const m = COMMAND_RE.exec(d);
    return m ? m[0] : null;
  }
  function readCommandLetter(){
    const c = peekCommand();
    if(c) pos += 1;
    return c;
  }
  function readNumber(){
    skipSep();
    NUMBER_RE.lastIndex = pos;
    const m = NUMBER_RE.exec(d);
    if(!m) throw new Error(`Expected a number at position ${pos} in path data`);
    pos = NUMBER_RE.lastIndex;
    return parseFloat(m[0]);
  }
  function readFlag(){
    skipSep();
    FLAG_RE.lastIndex = pos;
    const m = FLAG_RE.exec(d);
    if(!m) throw new Error(`Expected a flag (0 or 1) at position ${pos} in path data`);
    pos = FLAG_RE.lastIndex;
    return m[0] === '1';
  }
  return { atEnd, readCommandLetter, readNumber, readFlag, peekCommand };
}

export function parseDToCommands(d){
  const cmds = [];
  if(!d) return cmds;
  const s = makeScanner(d);
  let cur = { x:0, y:0 };
  let start = { x:0, y:0 };
  let cmdLetter = null;

  try{
    while(!s.atEnd()){
      const letter = s.peekCommand();
      if(letter){
        s.readCommandLetter();
        cmdLetter = letter;
      } else if(!cmdLetter){
        break;
      } else if(cmdLetter === 'M' || cmdLetter === 'm'){

        cmdLetter = cmdLetter === 'M' ? 'L' : 'l';
      } else if(cmdLetter === 'Z' || cmdLetter === 'z'){
        break;
      }

      const rel = cmdLetter === cmdLetter.toLowerCase();
      const T = cmdLetter.toUpperCase();

      if(T==='M'){
        const x = s.readNumber(), y = s.readNumber();
        cur = rel ? {x:cur.x+x, y:cur.y+y} : {x, y};
        cmds.push({type:'M', x:cur.x, y:cur.y});
        start = cur;
      } else if(T==='L'){
        const x = s.readNumber(), y = s.readNumber();
        cur = rel ? {x:cur.x+x, y:cur.y+y} : {x, y};
        cmds.push({type:'L', x:cur.x, y:cur.y});
      } else if(T==='H'){
        const x = s.readNumber();
        cur = { x: rel ? cur.x+x : x, y:cur.y };
        cmds.push({type:'H', x:cur.x, y:cur.y});
      } else if(T==='V'){
        const y = s.readNumber();
        cur = { x:cur.x, y: rel ? cur.y+y : y };
        cmds.push({type:'V', x:cur.x, y:cur.y});
      } else if(T==='C'){
        const x1=s.readNumber(),y1=s.readNumber(),x2=s.readNumber(),y2=s.readNumber(),x=s.readNumber(),y=s.readNumber();
        const X1= rel?cur.x+x1:x1, Y1= rel?cur.y+y1:y1, X2= rel?cur.x+x2:x2, Y2= rel?cur.y+y2:y2, X= rel?cur.x+x:x, Y= rel?cur.y+y:y;
        cmds.push({type:'C', x1:X1,y1:Y1,x2:X2,y2:Y2,x:X,y:Y});
        cur = {x:X, y:Y};
      } else if(T==='S'){
        const x2=s.readNumber(),y2=s.readNumber(),x=s.readNumber(),y=s.readNumber();
        const X2= rel?cur.x+x2:x2, Y2= rel?cur.y+y2:y2, X= rel?cur.x+x:x, Y= rel?cur.y+y:y;
        cmds.push({type:'S', x2:X2,y2:Y2,x:X,y:Y});
        cur = {x:X, y:Y};
      } else if(T==='Q'){
        const x1=s.readNumber(),y1=s.readNumber(),x=s.readNumber(),y=s.readNumber();
        const X1= rel?cur.x+x1:x1, Y1= rel?cur.y+y1:y1, X= rel?cur.x+x:x, Y= rel?cur.y+y:y;
        cmds.push({type:'Q', x1:X1,y1:Y1,x:X,y:Y});
        cur = {x:X, y:Y};
      } else if(T==='T'){
        const x=s.readNumber(),y=s.readNumber();
        const X= rel?cur.x+x:x, Y= rel?cur.y+y:y;
        cmds.push({type:'T', x:X, y:Y});
        cur = {x:X, y:Y};
      } else if(T==='A'){
        const rx=s.readNumber(), ry=s.readNumber(), rotation=s.readNumber();
        const largeArc=s.readFlag(), sweep=s.readFlag();
        const x=s.readNumber(), y=s.readNumber();
        const X= rel?cur.x+x:x, Y= rel?cur.y+y:y;
        cmds.push({type:'A', rx, ry, rotation, largeArc, sweep, x:X, y:Y});
        cur = {x:X, y:Y};
      } else if(T==='Z'){
        cmds.push({type:'Z'});
        cur = {x:start.x, y:start.y};
      } else {
        break;
      }
    }
  }catch(err){



  }
  return cmds;
}

export function pathAllPoints(cmds){
  const pts = [];
  cmds.forEach(c=>{
    if(c.type==='Z') return;
    if('x1' in c) pts.push({x:c.x1,y:c.y1});
    if('x2' in c) pts.push({x:c.x2,y:c.y2});
    if('x' in c) pts.push({x:c.x, y:c.y});
  });
  return pts.filter(p=>isFinite(p.x)&&isFinite(p.y));
}
