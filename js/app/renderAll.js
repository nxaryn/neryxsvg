





import { renderElements, renderOverlay } from '../canvas/Renderer.js';
import { renderView } from '../canvas/Navigation.js';
import { renderLayersPanel } from '../ui/Layers.js';
import { renderInspector } from '../ui/Inspector.js';
import { syncCodePanel } from '../ui/CodeEditor.js';






import { scheduleAutosave } from './Autosave.js';
import { updateSaveUI } from './ProjectIO.js';

export function renderAll(){
  renderElements();
  renderView();
  renderLayersPanel();
  renderInspector();
  syncCodePanel();
  scheduleAutosave();
  updateSaveUI();
}

export { renderOverlay };
