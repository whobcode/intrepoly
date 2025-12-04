// Simple in-session chat UI for humans and AI
import { sendChat } from './api.js';

let listEl, inputEl, formEl, badgeEl;

function ensureElements() {
  listEl = document.getElementById('chat-list');
  inputEl = document.getElementById('chat-input');
  formEl = document.getElementById('chat-form');
  badgeEl = document.getElementById('chat-badge');
}

export function initChatUI() {
  ensureElements();
  if (!formEl || !inputEl || !listEl) return;
  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = inputEl.value.trim();
    if (!v) return;
    sendChat(v);
    inputEl.value = '';
  });
}

export function appendChatMessage(msg) {
  ensureElements();
  if (!listEl) return;
  const name = (msg?.name || 'Player').toString();
  const text = (msg?.text || '').toString();
  const time = new Date(msg?.ts || Date.now());
  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
  const item = document.createElement('div');
  item.className = 'chat-item';
  item.innerHTML = `<span class="chat-time">[${hh}:${mm}]</span> <span class="chat-name">${escapeHtml(name)}</span>: <span class="chat-text">${escapeHtml(text)}</span>`;
  listEl.appendChild(item);
  listEl.scrollTop = listEl.scrollHeight;
  // Increment unread badge if chat panel collapsed
  const panel = document.getElementById('chat');
  if (panel && panel.getAttribute('data-collapsed') === '1' && badgeEl) {
    const n = parseInt(badgeEl.textContent || '0', 10) || 0;
    badgeEl.textContent = String(n + 1);
    badgeEl.style.display = '';
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Toggle behavior for the floating panel
window.addEventListener('DOMContentLoaded', () => {
  const tab = document.getElementById('chat-tab');
  const panel = document.getElementById('chat');
  if (!tab || !panel) return;
  tab.addEventListener('click', () => {
    const collapsed = panel.getAttribute('data-collapsed') === '1';
    panel.setAttribute('data-collapsed', collapsed ? '0' : '1');
    if (!collapsed && badgeEl) { badgeEl.textContent = '0'; badgeEl.style.display = 'none'; }
  });

  // Make chat draggable
  makeDraggable(panel, tab);

  // Make chat resizable
  makeResizable(panel);

  // Load saved position and size from localStorage
  loadPanelState(panel);
});

function makeDraggable(element, handle) {
  let offsetX = 0, offsetY = 0;

  handle.addEventListener('mousedown', (e) => {
    const rect = element.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    function onMouseMove(evt) {
      const newX = evt.clientX - offsetX;
      const newY = evt.clientY - offsetY;
      element.style.position = 'fixed';
      element.style.left = Math.max(0, newX) + 'px';
      element.style.top = Math.max(0, newY) + 'px';
      element.style.right = 'auto';
      element.style.bottom = 'auto';
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      savePanelState(element);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function makeResizable(element) {
  const handle = document.createElement('div');
  handle.style.cssText = `
    position: absolute;
    bottom: 0;
    right: 0;
    width: 20px;
    height: 20px;
    cursor: se-resize;
    background: linear-gradient(135deg, transparent 50%, #ccc 50%);
    pointer-events: auto;
  `;
  element.appendChild(handle);

  let isResizing = false;
  let startX, startY, startWidth, startHeight;

  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startWidth = element.offsetWidth;
    startHeight = element.offsetHeight;

    function onMouseMove(evt) {
      if (!isResizing) return;
      const newWidth = Math.max(280, startWidth + (evt.clientX - startX));
      const newHeight = Math.max(200, startHeight + (evt.clientY - startY));
      element.style.width = newWidth + 'px';
      element.style.maxHeight = newHeight + 'px';
    }

    function onMouseUp() {
      isResizing = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      savePanelState(element);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

function savePanelState(element) {
  const state = {
    left: element.style.left,
    top: element.style.top,
    width: element.style.width,
    maxHeight: element.style.maxHeight
  };
  localStorage.setItem('chat-panel-state', JSON.stringify(state));
}

function loadPanelState(element) {
  const saved = localStorage.getItem('chat-panel-state');
  if (saved) {
    try {
      const state = JSON.parse(saved);
      if (state.left) element.style.left = state.left;
      if (state.top) element.style.top = state.top;
      if (state.width) element.style.width = state.width;
      if (state.maxHeight) element.style.maxHeight = state.maxHeight;
    } catch (e) {
      // Silently ignore parse errors
    }
  }
}

