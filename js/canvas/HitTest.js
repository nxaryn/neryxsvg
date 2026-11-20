






export function findNearestDataId(root, target){
  let node = target;
  while(node && node !== root){
    if(node.getAttribute && node.getAttribute('data-id')) return node.getAttribute('data-id');
    node = node.parentNode;
  }
  return null;
}
