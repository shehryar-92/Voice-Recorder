// Plain Node.js test suite — no framework, run with: node --test tests/
// Tests the pure logic in recorder-helpers.js. recorder-helpers.js does not
// exist yet — that's the point. Write these first, then implement until green.

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatDuration,
  buildFilename,
  getSupportedMimeType,
  createRecordingState,
  transition,
} = require('../recorder-helpers');

// ---------------------------------------------------------------------------
// formatDuration(seconds) -> "MM:SS", both parts zero-padded to at least 2 digits
// ---------------------------------------------------------------------------
test('formatDuration', async (t) => {
  await t.test('formats zero seconds', () => {
    assert.equal(formatDuration(0), '00:00');
  });

  await t.test('formats single-digit seconds', () => {
    assert.equal(formatDuration(5), '00:05');
  });

  await t.test('formats exactly one minute', () => {
    assert.equal(formatDuration(60), '01:00');
  });

  await t.test('formats minutes and seconds', () => {
    assert.equal(formatDuration(88), '01:28');
  });

  await t.test('formats 59 seconds (just under a minute)', () => {
    assert.equal(formatDuration(59), '00:59');
  });

  await t.test('formats 9 minutes 59 seconds', () => {
    assert.equal(formatDuration(599), '09:59');
  });

  await t.test('formats 10 minutes exactly', () => {
    assert.equal(formatDuration(600), '10:00');
  });

  await t.test('formats past 99 minutes without truncating (3-digit minutes)', () => {
    assert.equal(formatDuration(6000), '100:00');
  });

  await t.test('floors fractional seconds instead of rounding', () => {
    assert.equal(formatDuration(59.9), '00:59');
  });

  await t.test('clamps negative input to 00:00', () => {
    assert.equal(formatDuration(-5), '00:00');
  });

  await t.test('throws on NaN', () => {
    assert.throws(() => formatDuration(NaN), TypeError);
  });

  await t.test('throws on Infinity', () => {
    assert.throws(() => formatDuration(Infinity), TypeError);
  });

  await t.test('throws on non-number input', () => {
    assert.throws(() => formatDuration('88'), TypeError);
    assert.throws(() => formatDuration(null), TypeError);
    assert.throws(() => formatDuration(undefined), TypeError);
  });
});

// ---------------------------------------------------------------------------
// buildFilename(date, extension) -> "voice-snap_YYYY-MM-DD_HH-MM-SS.ext"
// Colons are filesystem-unsafe on Windows, so time uses hyphens, not colons.
// ---------------------------------------------------------------------------
test('buildFilename', async (t) => {
  await t.test('builds a sortable, filesystem-safe filename', () => {
    const date = new Date(2026, 6, 12, 9, 5, 3); // July 12 2026, 09:05:03 local
    assert.equal(buildFilename(date, 'webm'), 'voice-snap_2026-07-12_09-05-03.webm');
  });

  await t.test('strips a leading dot if the extension includes one', () => {
    const date = new Date(2026, 0, 1, 0, 0, 0);
    assert.equal(buildFilename(date, '.wav'), 'voice-snap_2026-01-01_00-00-00.wav');
  });

  await t.test('pads single-digit month, day, hour, minute, second', () => {
    const date = new Date(2026, 2, 4, 1, 2, 3); // March 4 2026, 01:02:03
    assert.equal(buildFilename(date, 'webm'), 'voice-snap_2026-03-04_01-02-03.webm');
  });

  await t.test('throws on an invalid Date', () => {
    assert.throws(() => buildFilename(new Date('not-a-date'), 'webm'), TypeError);
  });

  await t.test('throws when extension is missing or empty', () => {
    const date = new Date(2026, 6, 12);
    assert.throws(() => buildFilename(date, ''), TypeError);
    assert.throws(() => buildFilename(date, undefined), TypeError);
  });

  await t.test('throws when date is not a Date instance', () => {
    assert.throws(() => buildFilename(1752307200000, 'webm'), TypeError);
    assert.throws(() => buildFilename('2026-07-12', 'webm'), TypeError);
  });
});

// ---------------------------------------------------------------------------
// getSupportedMimeType(candidates, isTypeSupportedFn)
// Pure wrapper around MediaRecorder.isTypeSupported so it's testable without
// a real browser. Returns the first supported candidate, or null.
// ---------------------------------------------------------------------------
test('getSupportedMimeType', async (t) => {
  await t.test('returns the first supported type in priority order', () => {
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
    const isSupported = (type) => type === 'audio/webm';
    assert.equal(getSupportedMimeType(candidates, isSupported), 'audio/webm');
  });

  await t.test('skips unsupported types and finds a later match', () => {
    const candidates = ['audio/webm;codecs=opus', 'audio/mp4'];
    const isSupported = (type) => type === 'audio/mp4';
    assert.equal(getSupportedMimeType(candidates, isSupported), 'audio/mp4');
  });

  await t.test('returns null when nothing is supported', () => {
    const candidates = ['audio/webm', 'audio/mp4'];
    const isSupported = () => false;
    assert.equal(getSupportedMimeType(candidates, isSupported), null);
  });

  await t.test('returns null for an empty candidate list', () => {
    assert.equal(getSupportedMimeType([], () => true), null);
  });

  await t.test('throws if isTypeSupportedFn is not a function', () => {
    assert.throws(() => getSupportedMimeType(['audio/webm'], null), TypeError);
  });

  await t.test('treats a throwing isTypeSupportedFn call as unsupported, not fatal', () => {
    const candidates = ['audio/webm', 'audio/mp4'];
    const isSupported = (type) => {
      if (type === 'audio/webm') throw new Error('boom');
      return type === 'audio/mp4';
    };
    assert.equal(getSupportedMimeType(candidates, isSupported), 'audio/mp4');
  });
});

// ---------------------------------------------------------------------------
// Recording state machine
// States: idle -> recording -> stopped -> idle (via discard or re-record)
//         idle -> permission-denied -> idle (via retry)
// ---------------------------------------------------------------------------
test('createRecordingState', async (t) => {
  await t.test('starts in idle', () => {
    assert.equal(createRecordingState(), 'idle');
  });
});

test('transition', async (t) => {
  await t.test('idle --start--> recording', () => {
    assert.equal(transition('idle', 'start'), 'recording');
  });

  await t.test('recording --stop--> stopped', () => {
    assert.equal(transition('recording', 'stop'), 'stopped');
  });

  await t.test('stopped --discard--> idle', () => {
    assert.equal(transition('stopped', 'discard'), 'idle');
  });

  await t.test('idle --permission-denied--> permission-denied', () => {
    assert.equal(transition('idle', 'permission-denied'), 'permission-denied');
  });

  await t.test('permission-denied --retry--> idle', () => {
    assert.equal(transition('permission-denied', 'retry'), 'idle');
  });

  await t.test('rejects starting from an already-recording state', () => {
    assert.throws(() => transition('recording', 'start'), /invalid transition/i);
  });

  await t.test('rejects stopping when idle', () => {
    assert.throws(() => transition('idle', 'stop'), /invalid transition/i);
  });

  await t.test('rejects discarding while still recording', () => {
    assert.throws(() => transition('recording', 'discard'), /invalid transition/i);
  });

  await t.test('rejects retry from a non-permission-denied state', () => {
    assert.throws(() => transition('idle', 'retry'), /invalid transition/i);
  });

  await t.test('rejects an unrecognized action', () => {
    assert.throws(() => transition('idle', 'fly'), /invalid transition/i);
  });

  await t.test('rejects an unrecognized starting state', () => {
    assert.throws(() => transition('paused', 'start'), /invalid transition/i);
  });
});
