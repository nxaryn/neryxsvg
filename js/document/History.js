



















export function createHistory(limit){
  return { stack: [], index: -1, limit: limit || 100 };
}

function pushInternal(history, command){
  history.stack = history.stack.slice(0, history.index+1);
  history.stack.push(command);
  if(history.stack.length > history.limit) history.stack.shift();
  history.index = history.stack.length - 1;
}

export function push(history, command){
  pushInternal(history, command);
}

export function execute(history, command){
  command.execute();
  pushInternal(history, command);
}

export function undo(history){
  if(history.index < 0) return false;
  history.stack[history.index].undo();
  history.index--;
  return true;
}

export function redo(history){
  if(history.index >= history.stack.length-1) return false;
  history.index++;
  history.stack[history.index].execute();
  return true;
}

export function canUndo(history){ return history.index >= 0; }
export function canRedo(history){ return history.index < history.stack.length-1; }
