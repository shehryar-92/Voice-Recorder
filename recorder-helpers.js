// Pure logic for Voice Snap — no DOM, no MediaRecorder, no browser APIs here.
// Keeps everything testable with plain Node. DOM wiring lives in recorder.js.

/**
 * Formats a duration in seconds as "MM:SS" (minutes zero-padded to at least
 * 2 digits, seconds always zero-padded to 2 digits).
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatDuration(totalSeconds) {
  if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds)) {
    throw new TypeError('formatDuration expects a finite number of seconds');
  }

  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Builds a filesystem-safe, sortable filename for a downloaded recording.
 * Colons are avoided in the time portion since they're invalid in Windows
 * filenames.
 * @param {Date} date
 * @param {string} extension - with or without a leading dot, e.g. "webm" or ".webm"
 * @returns {string}
 */
function buildFilename(date, extension) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('buildFilename expects a valid Date instance');
  }
  if (typeof extension !== 'string' || extension.replace(/^\./, '').length === 0) {
    throw new TypeError('buildFilename expects a non-empty extension string');
  }

  const cleanExtension = extension.replace(/^\./, '');
  const pad = (n) => String(n).padStart(2, '0');

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `voice-snap_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.${cleanExtension}`;
}

/**
 * Returns the first mime type in `candidates` for which `isTypeSupportedFn`
 * returns true, or null if none are supported. A throwing isTypeSupportedFn
 * call is treated as "unsupported" for that candidate rather than fatal,
 * since real browser implementations can be inconsistent here.
 * @param {string[]} candidates
 * @param {(mimeType: string) => boolean} isTypeSupportedFn
 * @returns {string|null}
 */
function getSupportedMimeType(candidates, isTypeSupportedFn) {
  if (typeof isTypeSupportedFn !== 'function') {
    throw new TypeError('getSupportedMimeType expects isTypeSupportedFn to be a function');
  }
  if (!Array.isArray(candidates)) {
    throw new TypeError('getSupportedMimeType expects candidates to be an array');
  }

  for (const candidate of candidates) {
    try {
      if (isTypeSupportedFn(candidate)) {
        return candidate;
      }
    } catch {
      // Treat a throwing check as "not supported" and keep looking.
    }
  }

  return null;
}

/**
 * Returns the initial recording state.
 * @returns {'idle'}
 */
function createRecordingState() {
  return 'idle';
}

// Explicit allow-list of valid { state: { action: nextState } } transitions.
const VALID_TRANSITIONS = {
  idle: {
    start: 'recording',
    'permission-denied': 'permission-denied',
  },
  recording: {
    stop: 'stopped',
  },
  stopped: {
    discard: 'idle',
  },
  'permission-denied': {
    retry: 'idle',
  },
};

/**
 * Pure state machine transition. Throws on any transition not explicitly
 * allowed, including unknown states and unknown actions.
 * @param {string} currentState
 * @param {string} action
 * @returns {string} nextState
 */
function transition(currentState, action) {
  const nextState = VALID_TRANSITIONS[currentState]?.[action];

  if (!nextState) {
    throw new Error(`Invalid transition: cannot "${action}" from state "${currentState}"`);
  }

  return nextState;
}

// Node (tests) uses module.exports. Browser <script> tags get these as
// plain global function declarations with no export step needed.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    formatDuration,
    buildFilename,
    getSupportedMimeType,
    createRecordingState,
    transition,
  };
}
