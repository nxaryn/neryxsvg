let counter = 1;

export function uid(prefix){
  return `${prefix}${counter++}`;
}

export function seedCounter(n){
  if(n > counter) counter = n;
}
