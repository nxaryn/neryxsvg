










export function hasFileSystemAccess(){
  return typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function';
}

const NSVG_TYPE = { description: 'NeryxSVG project', accept: { 'application/json': ['.nsvg'] } };
const SVG_TYPE = { description: 'SVG image', accept: { 'image/svg+xml': ['.svg'] } };



export async function pickSaveHandle(suggestedName){
  try{
    return await window.showSaveFilePicker({ suggestedName, types: [NSVG_TYPE] });
  }catch(err){
    if(err && err.name === 'AbortError') return null;
    throw err;
  }
}




export async function pickOpenHandle(){
  try{
    const [handle] = await window.showOpenFilePicker({
      types: [NSVG_TYPE, SVG_TYPE],
      excludeAcceptAllOption: false,
      multiple: false,
    });
    return handle || null;
  }catch(err){
    if(err && err.name === 'AbortError') return null;
    throw err;
  }
}

export async function writeTextToHandle(handle, text){
  const writable = await handle.createWritable();
  try{
    await writable.write(text);
  }finally{
    await writable.close();
  }
}

export async function readTextFromHandle(handle){
  const file = await handle.getFile();
  return file.text();
}





export function downloadTextFile(text, filename, mimeType){
  const blob = new Blob([text], { type: mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
