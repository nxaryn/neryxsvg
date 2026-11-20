




import 'fake-indexeddb/auto';

global.window = global.window || globalThis;
if(typeof window.indexedDB === 'undefined') window.indexedDB = globalThis.indexedDB;

let failed = false;
function assert(cond, msg){
  if(!cond){ console.error('FAIL:', msg); failed = true; }
  else console.log('ok  -', msg);
}

const { createDocument, migrateDocument, DOCUMENT_VERSION } = await import('../js/document/Document.js');
const { serializeProject, parseProject, PROJECT_VERSION } = await import('../js/document/Project.js');


{
  const doc = createDocument();
  doc.name = 'My Drawing';
  doc.elements.push({ id:'el1', type:'circle', attrs:{ cx:10, cy:10, r:5 }, style:{ fill:'#fff', stroke:'#000', strokeWidth:1 }, visible:true });
  const text = serializeProject(doc, { view: { x:0,y:0,w:800,h:600,zoom:1 }, gridVisible: false, snap: true });
  const parsed = parseProject(text);
  assert(parsed.document.name === 'My Drawing', 'round-tripped document keeps its name');
  assert(parsed.document.elements.length === 1 && parsed.document.elements[0].type === 'circle', 'round-tripped document keeps its elements');
  assert(parsed.view && parsed.view.w === 800, 'round-tripped project keeps view state');
  assert(parsed.gridVisible === false, 'round-tripped project keeps gridVisible=false (falsy value survives)');
}


{
  let threw = false;
  try{ parseProject('{"not":"a project"}'); }catch(err){ threw = true; }
  assert(threw, 'parseProject rejects a JSON file that is not an .nsvg envelope');

  threw = false;
  try{ parseProject('not even json'); }catch(err){ threw = true; }
  assert(threw, 'parseProject rejects invalid JSON');

  threw = false;
  try{
    parseProject(JSON.stringify({ format:'nsvg', projectVersion: PROJECT_VERSION + 1, document: createDocument() }));
  }catch(err){ threw = true; }
  assert(threw, 'parseProject rejects a project from a newer, not-yet-understood format version');
}


{
  let threw = false;
  try{ migrateDocument({ version: DOCUMENT_VERSION + 1 }); }catch(err){ threw = true; }
  assert(threw, 'migrateDocument still rejects a too-new document version (unchanged v0.6 behavior)');
}


{
  const { state } = await import('../js/app/State.js');
  const {
    scheduleAutosave, flushAutosave, checkForRecovery, parseRecoveryRecord,
    acknowledgeRecovery, markCleanExit, isAutosaveEnabled,
  } = await import('../js/app/Autosave.js');

  assert(isAutosaveEnabled(), 'autosave reports enabled when indexedDB is present');

  state.document.name = 'Crash Test Doc';
  state.document.elements.push({ id:'el2', type:'rect', attrs:{x:0,y:0,width:1,height:1}, style:{fill:'#000',stroke:'none',strokeWidth:0}, visible:true });
  scheduleAutosave();
  await flushAutosave();



  const record = await checkForRecovery();
  assert(!!record, 'checkForRecovery finds an autosave after a simulated crash (no markCleanExit call)');
  if(record){
    const parsed = parseRecoveryRecord(record);
    assert(parsed.document.name === 'Crash Test Doc', 'recovered document matches what was autosaved');
  }

  await acknowledgeRecovery();
  const again = await checkForRecovery();
  assert(again === null, 'checkForRecovery returns null after acknowledgeRecovery (no repeat prompt)');


  scheduleAutosave();
  await flushAutosave();
  markCleanExit();
  await new Promise(r=>setTimeout(r, 10));
  const afterClean = await checkForRecovery();
  assert(afterClean === null, 'checkForRecovery finds nothing to recover after a clean exit');
}

console.log(failed ? '\nSCENARIO TESTS: FAILED' : '\nSCENARIO TESTS: PASSED');
if(failed) process.exitCode = 1;
