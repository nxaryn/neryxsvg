














import { state } from './State.js';
import { serializeProject, parseProject } from '../document/Project.js';
import { replaceDocument } from '../canvas/Interaction.js';
import { renderAll } from './renderAll.js';
import { fitToContent } from '../canvas/Navigation.js';
import { computeContentBounds } from '../svg/Serializer.js';
import {
  scheduleAutosave, flushAutosave, suspendAutosave, resumeAutosave,
  checkForRecovery, parseRecoveryRecord, acknowledgeRecovery, markCleanExit,
} from './Autosave.js';
import {
  hasFileSystemAccess, pickSaveHandle, pickOpenHandle,
  writeTextToHandle, readTextFromHandle, downloadTextFile,
} from './FileSystemIO.js';

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), 1800);
}

function baseName(name){
  return (name || 'drawing').replace(/\.(nsvg|svg)$/i, '') || 'drawing';
}
function suggestedProjectFileName(){
  return `${baseName(state.document.name)}.nsvg`;
}

export function updateSaveUI(){
  const dirty = !!state.projectDirty;
  const btn = document.getElementById('btnSaveProject');
  if(btn) btn.textContent = dirty ? 'Save\u2009*' : 'Save';
  document.title = `${dirty ? '\u2022 ' : ''}${state.document.name || 'Untitled'} \u2014 NeryxSVG`;
}

function afterDocumentReplaced(parsed, sourceLabel){
  suspendAutosave();
  replaceDocument(parsed.document);
  if(parsed.view) state.view = { ...state.view, ...parsed.view };
  if(typeof parsed.gridVisible === 'boolean'){
    state.gridVisible = parsed.gridVisible;
    const chk = document.getElementById('chkGrid');
    if(chk) chk.checked = parsed.gridVisible;
  }
  if(typeof parsed.snap === 'boolean'){
    state.snap = parsed.snap;
    const chk = document.getElementById('chkSnap');
    if(chk) chk.checked = parsed.snap;
  }
  renderAll();
  const topLevel = parsed.document.elements.filter(e=>!e.parentId);
  fitToContent(topLevel.length ? computeContentBounds(parsed.document, topLevel) : null);
  state.projectDirty = false;
  resumeAutosave();
  updateSaveUI();
  if(sourceLabel) toast(sourceLabel);
}



async function openFromText(text, displayName){
  const lower = (displayName || '').toLowerCase();
  if(lower.endsWith('.svg')){





    const { importSVGSourceExternal } = await import('../ui/CodeEditor.js');
    importSVGSourceExternal(text, false);
    state.fileHandle = null;
    if(displayName) state.document.name = baseName(displayName);
    state.projectDirty = false;
    updateSaveUI();
    toast('SVG opened');
    return;
  }
  const parsed = parseProject(text);
  if(displayName) parsed.document.name = baseName(displayName);
  afterDocumentReplaced(parsed, 'Project opened');
}

async function openProject(){
  if(state.document.elements.length && state.projectDirty &&
     !confirm('Open a different file? Unsaved changes will be kept in autosave but replaced on screen.')){
    return;
  }
  if(hasFileSystemAccess()){
    let handle;
    try{
      handle = await pickOpenHandle();
    }catch(err){
      toast('Could not open file picker');
      return;
    }
    if(!handle) return;
    try{
      const text = await readTextFromHandle(handle);
      await openFromText(text, handle.name);
      if(handle.name.toLowerCase().endsWith('.nsvg')) state.fileHandle = handle;
    }catch(err){
      toast(err && err.message ? err.message : 'Failed to open file');
    }
    return;
  }
  document.getElementById('projectFileInput').click();
}



async function writeProject(handle){
  const text = serializeProject(state.document, {
    view: state.view, gridVisible: state.gridVisible, snap: state.snap,
  });
  await writeTextToHandle(handle, text);
}

async function saveProjectAs(){
  if(hasFileSystemAccess()){
    let handle;
    try{
      handle = await pickSaveHandle(suggestedProjectFileName());
    }catch(err){
      toast('Could not open save dialog');
      return;
    }
    if(!handle) return;
    try{
      await writeProject(handle);
      state.fileHandle = handle;
      state.document.name = baseName(handle.name);
      state.projectDirty = false;
      updateSaveUI();
      toast('Project saved');
    }catch(err){
      toast('Failed to save project');
    }
    return;
  }




  const text = serializeProject(state.document, {
    view: state.view, gridVisible: state.gridVisible, snap: state.snap,
  });
  downloadTextFile(text, suggestedProjectFileName(), 'application/json');
  state.projectDirty = false;
  updateSaveUI();
  toast('Project downloaded');
}

async function saveProject(){
  if(state.fileHandle){
    try{
      await writeProject(state.fileHandle);
      state.projectDirty = false;
      updateSaveUI();
      toast('Project saved');
      return;
    }catch(err){
      toast('Could not save to the original file \u2014 saving as a new file');

    }
  }
  await saveProjectAs();
}



function showRecoveryBanner(record, parsed){
  const bar = document.createElement('div');
  bar.setAttribute('role', 'alert');
  bar.style.cssText = [
    'position:fixed', 'left:0', 'right:0', 'top:0', 'z-index:9999',
    'display:flex', 'align-items:center', 'gap:12px', 'justify-content:center',
    'padding:10px 16px', 'font:14px/1.4 system-ui,sans-serif',
    'background:#3a2f0b', 'color:#ffe9a8', 'border-bottom:1px solid #7a5f12',
  ].join(';');
  const when = record.updatedAt ? new Date(record.updatedAt).toLocaleString() : 'a previous session';
  bar.innerHTML = `
    <span>It looks like NeryxSVG didn\u2019t close cleanly last time. Unsaved work from ${when} is available.</span>
  `;
  const restoreBtn = document.createElement('button');
  restoreBtn.textContent = 'Restore';
  restoreBtn.style.cssText = 'cursor:pointer;padding:4px 10px;';
  const discardBtn = document.createElement('button');
  discardBtn.textContent = 'Discard';
  discardBtn.style.cssText = 'cursor:pointer;padding:4px 10px;';
  bar.appendChild(restoreBtn);
  bar.appendChild(discardBtn);

  restoreBtn.addEventListener('click', ()=>{
    afterDocumentReplaced(parsed, 'Unsaved work restored');
    acknowledgeRecovery();
    bar.remove();
  });
  discardBtn.addEventListener('click', ()=>{
    acknowledgeRecovery();
    bar.remove();
  });
  document.body.appendChild(bar);
}

export async function runRecoveryCheck(){
  const record = await checkForRecovery();
  if(!record) return;
  let parsed;
  try{
    parsed = parseRecoveryRecord(record);
  }catch(err){


    acknowledgeRecovery();
    return;
  }
  showRecoveryBanner(record, parsed);
}



document.getElementById('btnOpenProject')?.addEventListener('click', openProject);
document.getElementById('btnSaveProject')?.addEventListener('click', saveProject);
document.getElementById('btnSaveProjectAs')?.addEventListener('click', saveProjectAs);

document.getElementById('projectFileInput')?.addEventListener('change', (e)=>{
  const file = e.target.files[0];
  e.target.value = '';
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{ openFromText(reader.result, file.name); };
  reader.onerror = ()=>toast('Failed to read file');
  reader.readAsText(file);
});

window.addEventListener('keydown', (e)=>{
  if(!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if(k === 's' && !e.shiftKey){ e.preventDefault(); saveProject(); }
  else if(k === 's' && e.shiftKey){ e.preventDefault(); saveProjectAs(); }
  else if(k === 'o'){ e.preventDefault(); openProject(); }
});



window.addEventListener('beforeunload', ()=>{
  flushAutosave();
  markCleanExit();
});





updateSaveUI();
