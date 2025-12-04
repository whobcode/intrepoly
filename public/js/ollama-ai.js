// Ollama AI Integration for Intrepoly

let selectedModel = 'deepseek-v3.1:671b-cloud';
let availableModels = [];

// DOM Elements
const modelSelect = document.getElementById('ollamaModelSelect');
const promptInput = document.getElementById('aiPromptInput');
const askBtn = document.getElementById('aiAskBtn');
const statusEl = document.getElementById('aiStatus');
const responsePopup = document.getElementById('ai-response-popup');
const responseContent = document.getElementById('ai-response-content');
const responseClose = document.getElementById('ai-response-close');
const responseOverlay = document.getElementById('ai-response-overlay');

// Load available Ollama models
async function loadModels() {
  try {
    const response = await fetch('/api/ollama/models');
    const data = await response.json();

    availableModels = data.models || [];
    const defaultModel = data.default || 'deepseek-v3.1:671b-cloud';

    // Populate dropdown
    modelSelect.innerHTML = '';
    availableModels.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name + (model.type === 'vision' ? ' 👁️' : '');
      modelSelect.appendChild(option);
    });

    // Set selected model
    modelSelect.value = defaultModel;
    selectedModel = defaultModel;

    // Save to localStorage
    const savedModel = localStorage.getItem('ollama_selected_model');
    if (savedModel && availableModels.some(m => m.id === savedModel)) {
      modelSelect.value = savedModel;
      selectedModel = savedModel;
    }

    setStatus('✓ Models loaded', 'success');
  } catch (error) {
    console.error('Error loading models:', error);
    setStatus('⚠ Failed to load models', 'error');
    modelSelect.innerHTML = '<option value="">Error loading models</option>';
  }
}

// Set status message
function setStatus(message, type = 'info') {
  statusEl.textContent = message;
  statusEl.style.color = type === 'error' ? '#c32222' : type === 'success' ? '#4caf50' : '#b08f3b';

  // Clear status after 3 seconds
  if (type !== 'loading') {
    setTimeout(() => {
      statusEl.textContent = '';
    }, 3000);
  }
}

// Show AI response popup
function showResponse(response) {
  responseContent.textContent = response;
  responsePopup.style.display = 'block';
  responseOverlay.style.display = 'block';
}

// Hide AI response popup
function hideResponse() {
  responsePopup.style.display = 'none';
  responseOverlay.style.display = 'none';
}

// Ask AI for advice
async function askAI() {
  const prompt = promptInput.value.trim();

  if (!prompt) {
    setStatus('Please enter a question', 'error');
    return;
  }

  setStatus('🤖 Asking AI...', 'loading');
  askBtn.disabled = true;
  promptInput.disabled = true;

  try {
    const response = await fetch('/api/ollama/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        prompt: prompt
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();

    if (data.success && data.response) {
      setStatus('✓ Response received', 'success');
      showResponse(data.response);
      promptInput.value = ''; // Clear input
    } else {
      throw new Error(data.error || 'No response from AI');
    }
  } catch (error) {
    console.error('Error asking AI:', error);
    setStatus(`⚠ Error: ${error.message}`, 'error');
  } finally {
    askBtn.disabled = false;
    promptInput.disabled = false;
  }
}

// Event Listeners
modelSelect.addEventListener('change', () => {
  selectedModel = modelSelect.value;
  localStorage.setItem('ollama_selected_model', selectedModel);
  setStatus(`Switched to ${modelSelect.options[modelSelect.selectedIndex].text}`, 'success');
});

askBtn.addEventListener('click', askAI);

promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    askAI();
  }
});

responseClose.addEventListener('click', hideResponse);
responseOverlay.addEventListener('click', hideResponse);

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  loadModels();
});
