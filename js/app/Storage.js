

















const DB_NAME = 'neryxsvg';
const DB_VERSION = 1;
const STORE_DOCS = 'documents';
const STORE_META = 'meta';

let dbPromise = null;

export function isIndexedDBAvailable(){
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDB(){
  if(dbPromise) return dbPromise;
  if(!isIndexedDBAvailable()){
    dbPromise = Promise.reject(new Error('IndexedDB is not available in this browser.'));
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      if(!db.objectStoreNames.contains(STORE_DOCS)) db.createObjectStore(STORE_DOCS, { keyPath: 'recordId' });
      if(!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' });
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error || new Error('Failed to open the local storage database.'));
    req.onblocked = ()=>reject(new Error('Local storage database upgrade was blocked by another open tab.'));
  });
  return dbPromise;
}

function reqToPromise(req){
  return new Promise((resolve, reject)=>{
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error || new Error('Local storage request failed.'));
  });
}

async function store(name, mode){
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function putRecord(record){
  const s = await store(STORE_DOCS, 'readwrite');
  await reqToPromise(s.put(record));
  return record;
}

export async function getRecord(recordId){
  const s = await store(STORE_DOCS, 'readonly');
  const result = await reqToPromise(s.get(recordId));
  return result || null;
}

export async function deleteRecord(recordId){
  const s = await store(STORE_DOCS, 'readwrite');
  return reqToPromise(s.delete(recordId));
}



export async function listRecords(){
  const s = await store(STORE_DOCS, 'readonly');
  const all = await reqToPromise(s.getAll());
  return (all || []).sort((a, b)=>(b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function setMeta(key, value){
  const s = await store(STORE_META, 'readwrite');
  return reqToPromise(s.put({ key, value }));
}

export async function getMeta(key){
  const s = await store(STORE_META, 'readonly');
  const row = await reqToPromise(s.get(key));
  return row ? row.value : undefined;
}
