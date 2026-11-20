import { uid } from '../utils/ids.js';

export const DOCUMENT_VERSION = 1;

export function createDocument(){
  return {
    id: uid('doc'),
    version: DOCUMENT_VERSION,
    name: 'Untitled',
    width: 800,
    height: 600,




    viewBox: { x:0, y:0, width:800, height:600 },
    elements: [],
    defs: [],
    metadata: {},
    settings: {
      gridSize: 10,









      autoFitViewBox: true,
    },
  };
}





export function migrateDocument(doc){
  if(!doc || typeof doc !== 'object') return createDocument();
  if(doc.version == null) doc.version = 1;
  if(doc.version > DOCUMENT_VERSION){
    throw new Error(
      `This document was saved by a newer version of NeryxSVG (format v${doc.version}); ` +
      `this build only understands up to v${DOCUMENT_VERSION}. Please update the app before opening it.`
    );
  }

  doc.version = DOCUMENT_VERSION;
  return doc;
}
