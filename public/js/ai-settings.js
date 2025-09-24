// AI task + model selector wired to /api/ai/models

const STORAGE_TASK = 'AI_TASK';
const STORAGE_MODEL = 'AI_MODEL';

function save(key, val) {
  try { localStorage.setItem(key, val); } catch {}
}
function load(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

async function fetchModels() {
  try {
    const res = await fetch('/api/ai/models');
    if (!res.ok) throw new Error('Failed to load models');
    return await res.json();
  } catch (e) {
    console.error('AI models fetch failed', e);
    return { default: '', allowed: [], byTask: {} };
  }
}

function fillSelect(sel, options, value) {
  sel.innerHTML = '';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt; o.textContent = opt;
    if (opt === value) o.selected = true;
    sel.appendChild(o);
  }
}

function canonicalTaskName(k) {
  const map = {
    'text-generation': 'chat',
    'image-generation': 'image',
    'image-to-text': 'i2t',
    'embeddings': 'embeddings',
    'reranker': 'rerank',
    'tts': 'tts',
    'asr': 'asr',
    'translation': 'translate',
    'classification': 'classify',
  };
  return map[k] || k;
}

function prettyTaskLabel(k) {
  const map = {
    'text-generation': 'Chat',
    'image-generation': 'Image',
    'image-to-text': 'Image→Text',
    'embeddings': 'Embeddings',
    'reranker': 'Rerank',
    'tts': 'TTS',
    'asr': 'ASR',
    'translation': 'Translate',
    'classification': 'Classify',
  };
  return map[k] || k;
}

async function initSelectors() {
  const taskSel = document.getElementById('aiTask');
  const modelSel = document.getElementById('aiModel');
  if (!taskSel || !modelSel) return;

  const data = await fetchModels();
  const tasks = Object.keys(data.byTask || {});
  // Prefer text-generation in UI by default
  const defaultTask = load(STORAGE_TASK) || (tasks.includes('text-generation') ? 'text-generation' : tasks[0] || '');

  // Populate tasks (pretty labels)
  taskSel.innerHTML = '';
  for (const t of tasks) {
    const o = document.createElement('option');
    o.value = t; o.textContent = prettyTaskLabel(t);
    if (t === defaultTask) o.selected = true;
    taskSel.appendChild(o);
  }

  function refreshModels() {
    const task = taskSel.value;
    const models = (data.byTask?.[task] || []).slice();
    const savedModel = load(STORAGE_MODEL);
    // Default to server default if it belongs to this task; otherwise first
    const preferred = models.includes(data.default) ? data.default : (savedModel && models.includes(savedModel) ? savedModel : models[0] || '');
    fillSelect(modelSel, models, preferred);
    save(STORAGE_TASK, task);
    if (preferred) save(STORAGE_MODEL, preferred);
  }

  taskSel.onchange = refreshModels;
  modelSel.onchange = () => save(STORAGE_MODEL, modelSel.value);

  refreshModels();

  // Expose helpers for other modules
  window.getSelectedAiTask = () => taskSel.value;
  window.getSelectedAiModel = () => modelSel.value;
  window.getTaskEndpoint = () => `/api/ai/${canonicalTaskName(taskSel.value)}`;
}

window.addEventListener('DOMContentLoaded', initSelectors);

