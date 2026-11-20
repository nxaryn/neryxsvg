import { createDocument } from '../document/Document.js';
import { createHistory } from '../document/History.js';










export const state = {
  document: createDocument(),
  selection: [],
  activeGroupId: null,
  tool: 'select',
  view: { x:-20, y:-20, w:800, h:600, zoom:1 },
  gridVisible: true,
  snap: true,
  clipboard: { items: [], roots: [] },
  drawing: null,
  dragging: null,
  guides: [],
  mouseSvg: null,
  history: createHistory(100),








  fileHandle: null,
  projectDirty: false,
};
