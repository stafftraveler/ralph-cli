// Ralph CLI Dashboard - Client-side JavaScript

// Track if user is actively typing to avoid refresh interruption
let isTyping = false;
let typingTimeout = null;

// Track verbose mode state
let verboseMode = false;

// Current iteration start time
let currentIterationStartTime = null;

// WebSocket connection state
let ws = null;
let wsConnected = false;
let reconnectAttempt = 0;
let reconnectTimeout = null;
const MAX_RECONNECT_DELAY = 30000; // 30 seconds max
const BASE_RECONNECT_DELAY = 1000; // 1 second base
let useFallbackPolling = false;
let sessionCompleted = false;

// Pause state (will be fetched from API)
let isPaused = false;

// Cached iterations for ETA calculation
let cachedIterations = [];

// Load verbose mode preference from localStorage
function loadVerbosePreference() {
  try {
    const saved = localStorage.getItem('ralph-verbose-mode');
    if (saved !== null) {
      verboseMode = saved === 'true';
      if (verboseMode) {
        const output = document.getElementById('verbose-output');
        const toggle = document.getElementById('verbose-toggle');
        if (output) output.classList.remove('hidden');
        if (toggle) toggle.textContent = 'Hide';
      }
    }
  } catch (err) {
    // localStorage not available, ignore
  }
}

// Save verbose mode preference to localStorage
function saveVerbosePreference() {
  try {
    localStorage.setItem('ralph-verbose-mode', verboseMode.toString());
  } catch (err) {
    // localStorage not available, ignore
  }
}

// Toggle verbose output visibility
function toggleVerbose() {
  verboseMode = !verboseMode;
  const output = document.getElementById('verbose-output');
  const toggle = document.getElementById('verbose-toggle');

  if (verboseMode) {
    if (output) output.classList.remove('hidden');
    if (toggle) toggle.textContent = 'Hide';
    // Immediately fetch output when showing
    fetchVerboseOutput();
  } else {
    if (output) output.classList.add('hidden');
    if (toggle) toggle.textContent = 'Show';
  }

  saveVerbosePreference();
}

// Format timestamp as relative time (e.g., "2m ago", "5h ago")
function formatRelativeTime(timestamp) {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now - then;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return diffSeconds === 1 ? '1s ago' : diffSeconds + 's ago';
  } else if (diffMinutes < 60) {
    return diffMinutes === 1 ? '1m ago' : diffMinutes + 'm ago';
  } else if (diffHours < 24) {
    return diffHours === 1 ? '1h ago' : diffHours + 'h ago';
  } else {
    return diffDays === 1 ? '1d ago' : diffDays + 'd ago';
  }
}

// Update all relative timestamps on the page
function updateRelativeTimestamps() {
  const timestampElements = document.querySelectorAll('.iteration-timestamp');
  for (const element of timestampElements) {
    const timestamp = element.getAttribute('data-timestamp');
    if (timestamp) {
      element.textContent = formatRelativeTime(timestamp);
    }
  }
}

// Fetch and update verbose output
async function fetchVerboseOutput() {
  if (!verboseMode) return;

  try {
    const response = await fetch('/api/output');
    if (response.ok) {
      const data = await response.json();
      const output = document.getElementById('verbose-output');
      if (output) {
        output.textContent = data.output ?? '';
        // Auto-scroll to bottom
        output.scrollTop = output.scrollHeight;
      }
    }
  } catch (err) {
    console.error('Failed to fetch verbose output:', err);
  }
}

// Initialize WebSocket connection
function initWebSocket() {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = protocol + '//' + window.location.host;

    ws = new WebSocket(wsUrl);

    ws.onopen = function() {
      wsConnected = true;
      reconnectAttempt = 0;
      useFallbackPolling = false;
      updateConnectionStatus('connected');
    };

    ws.onmessage = function(event) {
      try {
        const message = JSON.parse(event.data);

        if (message.type === 'status') {
          updateDashboard(message.data);
          updateRelativeTimestamps();
        } else if (message.type === 'output') {
          appendVerboseOutput(message.data);
        } else if (message.type === 'tasks') {
          updateTasks(message.data);
        } else if (message.type === 'completed') {
          sessionCompleted = true;
          updateConnectionStatus('completed');
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    };

    ws.onerror = function(err) {
      console.error('WebSocket error:', err);
    };

    ws.onclose = function() {
      wsConnected = false;

      // Don't reconnect if session is completed
      if (sessionCompleted) {
        updateConnectionStatus('completed');
        return;
      }

      updateConnectionStatus('disconnected');

      // Attempt to reconnect with exponential backoff
      reconnectWebSocket();
    };
  } catch (err) {
    console.error('Failed to create WebSocket:', err);
    fallbackToPolling();
  }
}

// Reconnect WebSocket with exponential backoff
function reconnectWebSocket() {
  if (useFallbackPolling) return;

  reconnectAttempt++;

  // Calculate delay with exponential backoff
  const delay = Math.min(
    BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempt - 1),
    MAX_RECONNECT_DELAY
  );

  updateConnectionStatus('reconnecting');

  // After 3 failed attempts, fall back to polling
  if (reconnectAttempt > 3) {
    fallbackToPolling();
    return;
  }

  reconnectTimeout = setTimeout(() => {
    initWebSocket();
  }, delay);
}

// Fall back to polling if WebSocket fails
function fallbackToPolling() {
  // Don't start polling if session is completed
  if (sessionCompleted) {
    updateConnectionStatus('completed');
    return;
  }

  useFallbackPolling = true;
  updateConnectionStatus('polling');

  // Start polling
  setTimeout(refreshData, 2000);
}

// Toggle iteration details visibility
function toggleIterationDetails(iterationNumber) {
  const detailsEl = document.getElementById('iteration-details-' + iterationNumber);
  if (detailsEl) {
    detailsEl.classList.toggle('expanded');
  }
}

// Format elapsed time in seconds to human-readable string
function formatElapsedTime(seconds) {
  if (seconds < 60) {
    return seconds + 's';
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return minutes + 'm ' + remainingSeconds + 's';
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours + 'h ' + remainingMinutes + 'm';
}

// Format duration for iteration display (matches server-side formatDuration)
function formatDuration(seconds) {
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return minutes + 'm ' + remainingSeconds + 's';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours + 'h ' + remainingMinutes + 'm';
}

// Update elapsed time display
function updateElapsedTime() {
  const elapsedTimeEl = document.getElementById('elapsed-time');
  if (!elapsedTimeEl) return;

  if (!currentIterationStartTime) {
    elapsedTimeEl.textContent = '';
    return;
  }

  const now = new Date();
  const startTime = new Date(currentIterationStartTime);
  const elapsedSeconds = Math.floor((now - startTime) / 1000);

  if (elapsedSeconds >= 0) {
    elapsedTimeEl.textContent = 'Elapsed: ' + formatElapsedTime(elapsedSeconds);
  } else {
    elapsedTimeEl.textContent = '';
  }
}

function calculateAverageDuration(iterations) {
  if (!iterations || iterations.length === 0) return null;

  // Only use successful iterations for ETA calculation
  const successfulIterations = iterations.filter(iter => iter.durationSeconds > 0);
  if (successfulIterations.length === 0) return null;

  const totalDuration = successfulIterations.reduce((sum, iter) => sum + iter.durationSeconds, 0);
  return Math.floor(totalDuration / successfulIterations.length);
}

// Update ETA display
function updateEta() {
  const etaEl = document.getElementById('eta-time');
  if (!etaEl) return;

  if (!currentIterationStartTime || cachedIterations.length === 0) {
    etaEl.textContent = '';
    return;
  }

  const avgDuration = calculateAverageDuration(cachedIterations);
  if (!avgDuration) {
    etaEl.textContent = '';
    return;
  }

  const now = new Date();
  const startTime = new Date(currentIterationStartTime);
  const elapsedSeconds = Math.floor((now - startTime) / 1000);

  const remainingSeconds = avgDuration - elapsedSeconds;

  if (remainingSeconds > 0) {
    etaEl.textContent = 'ETA: ' + formatElapsedTime(remainingSeconds);
  } else {
    // Show that we're past the expected time
    etaEl.textContent = 'ETA: +' + formatElapsedTime(Math.abs(remainingSeconds));
  }
}

// Update connection status indicator
function updateConnectionStatus(status) {
  const dot = document.getElementById('connection-dot');
  const text = document.getElementById('connection-text');
  const footerStatus = document.getElementById('footer-status');

  if (!dot || !text) return;

  // Remove all status classes
  dot.classList.remove('connected', 'disconnected', 'reconnecting', 'polling', 'completed');

  // Add appropriate class and update text
  switch (status) {
    case 'connected':
      dot.classList.add('connected');
      text.textContent = 'Connected';
      if (footerStatus) footerStatus.textContent = 'Real-time updates via WebSocket';
      break;
    case 'disconnected':
      dot.classList.add('disconnected');
      text.textContent = 'Disconnected';
      if (footerStatus) footerStatus.textContent = 'Disconnected';
      break;
    case 'reconnecting':
      dot.classList.add('reconnecting');
      text.textContent = 'Reconnecting...';
      if (footerStatus) footerStatus.textContent = 'Reconnecting...';
      break;
    case 'polling':
      dot.classList.add('polling');
      text.textContent = 'HTTP Polling';
      if (footerStatus) footerStatus.textContent = 'Polling every 2 seconds (WebSocket unavailable)';
      break;
    case 'completed':
      dot.classList.add('completed');
      text.textContent = 'Completed';
      if (footerStatus) footerStatus.textContent = 'Session completed';
      break;
    default:
      text.textContent = 'Unknown';
  }
}

// Append output chunk to verbose display (for real-time streaming)
function appendVerboseOutput(chunk) {
  if (!verboseMode) return;

  const output = document.getElementById('verbose-output');
  if (output) {
    // Empty chunk signals a reset (from clearOutput)
    if (chunk === '') {
      output.textContent = '';
      return;
    }
    output.textContent += chunk;
    // Auto-scroll to bottom
    output.scrollTop = output.scrollHeight;
  }
}

// Auto-refresh every 2 seconds (fallback when WebSocket disconnected)
async function refreshData() {
  // Only poll if we're using fallback polling
  if (!useFallbackPolling) {
    return;
  }

  // Skip refresh if user is typing
  if (isTyping) {
    setTimeout(refreshData, 2000);
    return;
  }

  try {
    // Fetch status
    const response = await fetch('/api/status');
    if (response.ok) {
      const data = await response.json();
      // Update only the dynamic parts instead of reloading entire page
      updateDashboard(data);
    }

    // Also refresh tasks
    const tasksResponse = await fetch('/api/tasks');
    if (tasksResponse.ok) {
      const tasksData = await tasksResponse.json();
      updateTasks(tasksData);
    }

    // Refresh verbose output if visible
    if (verboseMode) {
      await fetchVerboseOutput();
    }

    // Update relative timestamps
    updateRelativeTimestamps();
  } catch (err) {
    console.error('Polling error:', err);
  }

  // Continue polling
  setTimeout(refreshData, 2000);
}

function updateDashboard(data) {
  // Update session ID
  const sessionIdEl = document.getElementById('session-id');
  if (sessionIdEl && data.sessionId) {
    sessionIdEl.textContent = data.sessionId;
  }

  // Update progress
  const progressPercent = data.totalIterations > 0
    ? (data.currentIteration / data.totalIterations) * 100
    : 0;
  const progressFill = document.getElementById('progress-fill');
  if (progressFill) {
    progressFill.style.width = progressPercent + '%';

    // Add pulsing animation when iteration is actively running
    if (data.currentIterationStartedAt) {
      progressFill.classList.add('active');
    } else {
      progressFill.classList.remove('active');
    }
  }

  // Update current iteration
  const currentIterationEl = document.getElementById('current-iteration');
  if (currentIterationEl) {
    currentIterationEl.textContent = data.currentIteration;
  }

  // Update iterations value (both in header and controls)
  updateIterationsValue(data.totalIterations);

  // Update status
  const statusText = document.getElementById('status-text');
  if (statusText) {
    statusText.textContent = data.status;
  }

  // Update current iteration start time
  if (data.currentIterationStartedAt !== currentIterationStartTime) {
    currentIterationStartTime = data.currentIterationStartedAt;
    updateElapsedTime();
  }

  // Cache iterations for ETA calculation
  if (data.iterations && data.iterations.length > 0) {
    cachedIterations = data.iterations;
  } else {
    cachedIterations = [];
  }
  updateEta();

  // Update cost
  const costValue = document.getElementById('cost-value');
  if (costValue) {
    costValue.textContent = '$' + data.totalCost.toFixed(4);
  }

  // Update pause state
  if (data.isPausedAfterIteration !== isPaused) {
    isPaused = data.isPausedAfterIteration;
    updatePauseButton(isPaused);
  }

  // Update iterations list
  if (data.iterations) {
    updateIterations(data.iterations);
  }
}

function updateTasks(data) {
  const tasksCount = document.getElementById('tasks-count');
  if (tasksCount) {
    tasksCount.textContent = data.completedCount + ' of ' + data.totalCount + ' complete';
  }

  // Update progress bar
  const progressFill = document.getElementById('tasks-progress-fill');
  if (progressFill) {
    const percentage = data.totalCount > 0
      ? (data.completedCount / data.totalCount) * 100
      : 0;
    progressFill.style.width = percentage + '%';
  }

  const tasksList = document.getElementById('tasks-list');
  if (!tasksList) return;

  // Group tasks by phase
  const tasksByPhase = {};
  for (const task of data.tasks) {
    const phase = task.phase || 'Other';
    if (!tasksByPhase[phase]) {
      tasksByPhase[phase] = [];
    }
    tasksByPhase[phase].push(task);
  }

  // Rebuild the tasks list
  let html = '';
  for (const phase in tasksByPhase) {
    html += '<div class="phase-header">' + escapeHtml(phase) + '</div>';
    for (const task of tasksByPhase[phase]) {
      const completedClass = task.completed ? ' completed' : '';
      html += '<div class="task-item">';
      html += '<div class="task-checkbox' + completedClass + '"></div>';
      html += '<div class="task-text' + completedClass + '">' + escapeHtml(task.text) + '</div>';
      html += '</div>';
    }
  }
  tasksList.innerHTML = html;
}

function updateIterations(iterations) {
  const iterationsList = document.getElementById('iterations-list');
  if (!iterationsList) return;

  if (!iterations || iterations.length === 0) {
    iterationsList.innerHTML = '<div class="no-iterations">No completed iterations yet</div>';
    return;
  }

  // Track which iterations are currently expanded before updating DOM
  const expandedIterations = new Set();
  const existingDetails = iterationsList.querySelectorAll('.iteration-details.expanded');
  for (const detail of existingDetails) {
    const id = detail.id; // e.g., "iteration-details-1"
    const match = id.match(/iteration-details-(\d+)/);
    if (match) {
      expandedIterations.add(parseInt(match[1], 10));
    }
  }

  let html = '';
  for (const iter of iterations) {
    const statusClass = iter.success ? 'success' : 'failure';
    const statusIcon = iter.success ? '✓' : '✗';
    const duration = formatDuration(iter.durationSeconds || 0);
    const cost = iter.cost ? iter.cost.toFixed(4) : '0.0000';
    const inputTokens = iter.inputTokens ? iter.inputTokens.toLocaleString() : 'N/A';
    const outputTokens = iter.outputTokens ? iter.outputTokens.toLocaleString() : 'N/A';

    // Check if this iteration was previously expanded
    const isExpanded = expandedIterations.has(iter.number);
    const expandedClass = isExpanded ? ' expanded' : '';

    html += '<div class="iteration-item" onclick="toggleIterationDetails(' + iter.number + ')">';
    html += '<div class="iteration-summary">';
    html += '<span class="iteration-status ' + statusClass + '">' + statusIcon + '</span>';
    html += '<div class="iteration-info">';
    html += '<span class="iteration-number">Iteration ' + iter.number + '</span>';
    html += '<span class="iteration-timestamp" data-timestamp="' + iter.timestamp + '"></span>';
    html += '</div>';
    html += '<span class="iteration-duration">' + duration + '</span>';
    html += '<span class="iteration-cost">$' + cost + '</span>';
    html += '</div>';
    html += '<div class="iteration-details' + expandedClass + '" id="iteration-details-' + iter.number + '">';

    if (iter.inputTokens || iter.outputTokens) {
      html += '<div class="iteration-details-row">';
      html += '<span class="iteration-details-label">Input Tokens:</span>';
      html += '<span class="iteration-details-value">' + inputTokens + '</span>';
      html += '</div>';
      html += '<div class="iteration-details-row">';
      html += '<span class="iteration-details-label">Output Tokens:</span>';
      html += '<span class="iteration-details-value">' + outputTokens + '</span>';
      html += '</div>';
    }

    if (iter.status) {
      html += '<div class="iteration-details-row">';
      html += '<span class="iteration-details-label">Status:</span>';
      html += '<span class="iteration-details-value">' + escapeHtml(iter.status) + '</span>';
      html += '</div>';
    }

    html += '</div>';
    html += '</div>';
  }

  iterationsList.innerHTML = html;
  updateRelativeTimestamps();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Iteration adjustment functions
async function incrementIterations() {
  try {
    const response = await fetch('/api/iterations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'increment' })
    });

    if (response.ok) {
      const result = await response.json();
      // Update will come through WebSocket, but update immediately for responsiveness
      updateIterationsValue(result.totalIterations);
    }
  } catch (err) {
    console.error('Failed to increment iterations:', err);
  }
}

async function decrementIterations() {
  try {
    const response = await fetch('/api/iterations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'decrement' })
    });

    if (response.ok) {
      const result = await response.json();
      // Update will come through WebSocket, but update immediately for responsiveness
      updateIterationsValue(result.totalIterations);
    }
  } catch (err) {
    console.error('Failed to decrement iterations:', err);
  }
}

// Update all iterations value displays
function updateIterationsValue(value) {
  const iterationsValue = document.getElementById('iterations-value');
  const iterationsValueControls = document.getElementById('iterations-value-controls');
  if (iterationsValue) iterationsValue.textContent = value;
  if (iterationsValueControls) iterationsValueControls.textContent = value;
}

async function togglePause() {
  try {
    const response = await fetch('/api/pause', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pause: !isPaused })
    });

    if (response.ok) {
      const result = await response.json();
      isPaused = result.isPaused;
      updatePauseButton(isPaused);
    }
  } catch (err) {
    console.error('Failed to toggle pause:', err);
  }
}

function updatePauseButton(paused) {
  const pauseBtn = document.getElementById('pause-btn');
  const pauseBtnText = document.getElementById('pause-btn-text');
  const pauseBtnIcon = document.getElementById('pause-btn-icon');

  if (pauseBtn) {
    if (paused) {
      pauseBtn.classList.add('active');
      if (pauseBtnIcon) pauseBtnIcon.textContent = '▶︎';
      if (pauseBtnText) pauseBtnText.textContent = 'Resume';
    } else {
      pauseBtn.classList.remove('active');
      if (pauseBtnIcon) pauseBtnIcon.textContent = '⏸︎';
      if (pauseBtnText) pauseBtnText.textContent = 'Pause After Iteration';
    }
  }
}

// Stop modal functions
function showStopModal() {
  const modal = document.getElementById('stop-modal');
  if (modal) {
    modal.classList.remove('hidden');
  }
}

function hideStopModal() {
  const modal = document.getElementById('stop-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

async function confirmStop() {
  try {
    const response = await fetch('/api/stop', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      hideStopModal();
      // Update connection status to show stopping
      updateConnectionStatus('completed');
    }
  } catch (err) {
    console.error('Failed to stop session:', err);
  }
}

// Set up button event listeners
function setupButtonListeners() {
  const incrementBtn = document.getElementById('increment-btn');
  const decrementBtn = document.getElementById('decrement-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const stopBtn = document.getElementById('stop-btn');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const modalConfirmBtn = document.getElementById('modal-confirm-btn');
  const verboseToggle = document.getElementById('verbose-toggle');
  const addTaskForm = document.getElementById('add-task-form');
  const taskInput = document.getElementById('task-input');

  if (incrementBtn) {
    incrementBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      incrementIterations();
    });
  }

  if (decrementBtn) {
    decrementBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      decrementIterations();
    });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      togglePause();
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      showStopModal();
    });
  }

  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      hideStopModal();
    });
  }

  if (modalConfirmBtn) {
    modalConfirmBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      confirmStop();
    });
  }

  if (verboseToggle) {
    verboseToggle.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleVerbose();
    });
  }

  if (addTaskForm) {
    addTaskForm.addEventListener('submit', addTask);
  }

  if (taskInput) {
    taskInput.addEventListener('input', handleInput);
  }

  // Close modal when clicking outside
  document.addEventListener('click', function(event) {
    const modal = document.getElementById('stop-modal');
    if (modal && event.target === modal) {
      hideStopModal();
    }
  });
}

// Add task form handling
async function addTask(event) {
  event.preventDefault();
  const input = document.getElementById('task-input');
  const button = document.getElementById('task-button');
  const feedback = document.getElementById('task-feedback');
  const task = input.value.trim();

  if (!task) {
    feedback.textContent = 'Please enter a task';
    feedback.className = 'add-task-feedback error';
    return;
  }

  // Disable form while submitting
  input.disabled = true;
  button.disabled = true;
  feedback.textContent = 'Adding task...';
  feedback.className = 'add-task-feedback';

  try {
    const response = await fetch('/api/task', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ task })
    });

    const result = await response.json();

    if (response.ok) {
      input.value = '';
      feedback.textContent = 'Task added successfully!';
      feedback.className = 'add-task-feedback success';
      // Clear success message after 3 seconds
      setTimeout(() => {
        feedback.textContent = '';
      }, 3000);
    } else {
      feedback.textContent = result.error || 'Failed to add task';
      feedback.className = 'add-task-feedback error';
    }
  } catch (err) {
    feedback.textContent = 'Network error - please try again';
    feedback.className = 'add-task-feedback error';
  } finally {
    input.disabled = false;
    button.disabled = false;
    input.focus();
  }
}

// Track typing state
function handleInput() {
  isTyping = true;
  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
  }, 1000);
}

// Load initial status data from API
async function loadInitialStatus() {
  try {
    const response = await fetch('/api/status');
    if (response.ok) {
      const data = await response.json();
      updateDashboard(data);
    }
  } catch (err) {
    console.error('Failed to load initial status:', err);
  }
}

// Load tasks on page load
async function loadInitialTasks() {
  try {
    const response = await fetch('/api/tasks');
    if (response.ok) {
      const data = await response.json();
      updateTasks(data);
    }
  } catch (err) {
    console.error('Failed to load initial tasks:', err);
  }
}

// Initialize the dashboard
function init() {
  loadVerbosePreference();
  loadInitialStatus();
  loadInitialTasks();
  updateRelativeTimestamps();
  updateElapsedTime();
  initWebSocket();
  setupButtonListeners();

  // Update elapsed time and ETA every second
  setInterval(function() {
    updateElapsedTime();
    updateEta();
  }, 1000);

  // Update relative timestamps every 2 seconds
  setInterval(updateRelativeTimestamps, 2000);
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
