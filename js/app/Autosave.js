





















import { state } from './State.js';
import { serializeProject, parseProject } from '../document/Project.js';
import { putRecord, getRecord, setMeta, getMeta, isIndexedDBAvailable } from './Storage.js';

export const AUTOSAVE_RECORD_ID = 'autosave';
const DEBOUNCE_MS = 1500;

let debounceTimer = null;
let saveInFlight = null;
let enabled = isIndexedDBAvailable();
let lastError = null;
let suspended = false;

function currentPayload(){
  return serializeProject(state.document, {
    view: state.view,
    gridVisible: state.gridVisible,
    snap: state.snap,
  });
}

function doSave(){
  if(!enabled || suspended) return Promise.resolve();
  const record = {
    recordId: AUTOSAVE_RECORD_ID,
    name: state.document.name,
    updatedAt: Date.now(),
    payload: currentPayload(),
  };
  saveInFlight = putRecord(record)
    .then(()=>{ lastError = null; return setMeta('cleanExit', false); })
    .catch(err=>{ lastError = err; });
  return saveInFlight;
}

export function scheduleAutosave(){
  if(suspended) return;





  state.projectDirty = true;
  if(!enabled) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(doSave, DEBOUNCE_MS);
}



export function flushAutosave(){
  clearTimeout(debounceTimer);
  return doSave();
}




export function suspendAutosave(){
  suspended = true;
  clearTimeout(debounceTimer);
}
export function resumeAutosave(){
  suspended = false;
}

export async function checkForRecovery(){
  if(!enabled) return null;
  try{
    const [cleanExit, record] = await Promise.all([getMeta('cleanExit'), getRecord(AUTOSAVE_RECORD_ID)]);
    if(cleanExit !== false || !record) return null;
    return record;
  }catch(err){
    return null;
  }
}

export function parseRecoveryRecord(record){
  return parseProject(record.payload);
}



export async function acknowledgeRecovery(){
  if(!enabled) return;
  try{ await setMeta('cleanExit', true); }catch(err){  }
}

export function markCleanExit(){
  if(!enabled) return;




  setMeta('cleanExit', true).catch(()=>{});
}

export function isAutosaveEnabled(){ return enabled; }
export function getLastAutosaveError(){ return lastError; }
