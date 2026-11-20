import { migrateDocument } from './Document.js';



















export const PROJECT_FORMAT = 'nsvg';
export const PROJECT_VERSION = 1;

export function serializeProject(doc, extra){
  const envelope = {
    format: PROJECT_FORMAT,
    projectVersion: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    document: doc,
  };
  if(extra && extra.view) envelope.view = extra.view;
  if(extra && typeof extra.gridVisible === 'boolean') envelope.gridVisible = extra.gridVisible;
  if(extra && typeof extra.snap === 'boolean') envelope.snap = extra.snap;
  return JSON.stringify(envelope);
}





export function parseProject(text){
  let data;
  try{
    data = JSON.parse(text);
  }catch(err){
    throw new Error('That file isn\u2019t a valid NeryxSVG project (not JSON).');
  }
  if(!data || typeof data !== 'object' || data.format !== PROJECT_FORMAT){
    throw new Error('That file isn\u2019t a NeryxSVG project (.nsvg).');
  }
  const pv = data.projectVersion == null ? 1 : data.projectVersion;
  if(pv > PROJECT_VERSION){
    throw new Error(
      `This project was saved by a newer version of NeryxSVG (project format v${pv}); ` +
      `this build only understands up to v${PROJECT_VERSION}. Please update the app before opening it.`
    );
  }
  const document = migrateDocument(data.document);
  return {
    document,
    view: data.view || null,
    gridVisible: typeof data.gridVisible === 'boolean' ? data.gridVisible : null,
    snap: typeof data.snap === 'boolean' ? data.snap : null,
    savedAt: data.savedAt || null,
  };
}
