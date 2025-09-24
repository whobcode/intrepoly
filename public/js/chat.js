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
});

