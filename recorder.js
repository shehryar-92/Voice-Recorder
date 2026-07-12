// DOM wiring for Voice Snap. All pure logic lives in recorder-helpers.js
// (formatDuration, buildFilename, getSupportedMimeType, transition).
// This file only touches the browser: getUserMedia, MediaRecorder, the DOM.

(function () {
  'use strict';

  // Preferred mime types, best first. Browsers vary in what they support.
  const MIME_CANDIDATES = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];

  const TIMER_UPDATE_INTERVAL_MS = 250;

  const elements = {
    recordButton: document.getElementById('record-button'),
    stopButton: document.getElementById('stop-button'),
    timer: document.getElementById('timer'),
    finalDuration: document.getElementById('final-duration'),
    playButton: document.getElementById('play-button'),
    playIcon: document.querySelector('.icon-play'),
    pauseIcon: document.querySelector('.icon-pause'),
    scrubBar: document.getElementById('scrub-bar'),
    elapsedTime: document.getElementById('elapsed-time'),
    totalTime: document.getElementById('total-time'),
    audioPlayer: document.getElementById('audio-player'),
    downloadButton: document.getElementById('download-button'),
    discardButton: document.getElementById('discard-button'),
    retryButton: document.getElementById('retry-button'),
    deniedMessage: document.getElementById('denied-message'),
  };

  let appState = createRecordingState();
  let mediaRecorder = null;
  let mediaStream = null;
  let recordedChunks = [];
  let recordingMimeType = '';
  let recordingStartTime = 0;
  let timerIntervalId = null;
  let recordedBlobUrl = null;
  let finalDurationSeconds = 0;

  function setAppState(nextState) {
    appState = nextState;
    document.body.dataset.appState = nextState;
  }

  function goTo(action) {
    setAppState(transition(appState, action));
  }

  // ---------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------

  async function startRecording() {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      showPermissionDenied(error);
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      stream.getTracks().forEach((track) => track.stop());
      showUnsupported();
      return;
    }

    const mimeType = getSupportedMimeType(MIME_CANDIDATES, (type) =>
      MediaRecorder.isTypeSupported(type)
    );

    mediaStream = stream;
    recordingMimeType = mimeType || ''; // '' lets MediaRecorder pick its own default
    recordedChunks = [];

    mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener('stop', handleRecordingStopped);

    mediaRecorder.start();
    recordingStartTime = Date.now();
    elements.timer.textContent = formatDuration(0);
    startTimer();
    goTo('start');
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    stopTimer();
  }

  function handleRecordingStopped() {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;

    finalDurationSeconds = (Date.now() - recordingStartTime) / 1000;

    const blob = new Blob(recordedChunks, {
      type: recordingMimeType || 'audio/webm',
    });
    recordedBlobUrl = URL.createObjectURL(blob);

    elements.audioPlayer.src = recordedBlobUrl;
    elements.finalDuration.textContent = formatDuration(finalDurationSeconds);

    goTo('stop');
  }

  function startTimer() {
    timerIntervalId = setInterval(() => {
      const elapsedSeconds = (Date.now() - recordingStartTime) / 1000;
      elements.timer.textContent = formatDuration(elapsedSeconds);
    }, TIMER_UPDATE_INTERVAL_MS);
  }

  function stopTimer() {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }

  // ---------------------------------------------------------------------
  // Errors
  // ---------------------------------------------------------------------

  function showPermissionDenied(error) {
    const messages = {
      NotAllowedError: 'Microphone access is required to record audio. Allow access in your browser settings, then retry.',
      PermissionDeniedError: 'Microphone access is required to record audio. Allow access in your browser settings, then retry.',
      NotFoundError: 'No microphone was found. Connect one, then retry.',
      DevicesNotFoundError: 'No microphone was found. Connect one, then retry.',
    };
    elements.deniedMessage.textContent =
      messages[error.name] || 'Microphone access is required to record audio.';
    goTo('permission-denied');
  }

  function showUnsupported() {
    elements.deniedMessage.textContent =
      "Recording isn't supported in this browser. Try the latest Chrome, Firefox, or Edge.";
    goTo('permission-denied');
  }

  // ---------------------------------------------------------------------
  // Discard / retry
  // ---------------------------------------------------------------------

  function discardRecording() {
    if (recordedBlobUrl) {
      URL.revokeObjectURL(recordedBlobUrl);
      recordedBlobUrl = null;
    }
    elements.audioPlayer.pause();
    elements.audioPlayer.removeAttribute('src');
    elements.audioPlayer.load();
    elements.scrubBar.value = 0;
    elements.scrubBar.max = 0;
    elements.elapsedTime.textContent = formatDuration(0);
    elements.totalTime.textContent = formatDuration(0);
    setPlayIcon(false);
    goTo('discard');
  }

  function retry() {
    goTo('retry');
  }

  // ---------------------------------------------------------------------
  // Playback
  // ---------------------------------------------------------------------

  function togglePlayback() {
    if (elements.audioPlayer.paused) {
      elements.audioPlayer.play();
    } else {
      elements.audioPlayer.pause();
    }
  }

  function setPlayIcon(isPlaying) {
    elements.playIcon.hidden = isPlaying;
    elements.pauseIcon.hidden = !isPlaying;
  }

  elements.audioPlayer.addEventListener('loadedmetadata', () => {
    // Some browsers report Infinity for blob durations until playback starts.
    const duration = Number.isFinite(elements.audioPlayer.duration)
      ? elements.audioPlayer.duration
      : finalDurationSeconds;
    elements.scrubBar.max = duration;
    elements.totalTime.textContent = formatDuration(duration);
  });

  elements.audioPlayer.addEventListener('timeupdate', () => {
    elements.scrubBar.value = elements.audioPlayer.currentTime;
    elements.elapsedTime.textContent = formatDuration(elements.audioPlayer.currentTime);
  });

  elements.audioPlayer.addEventListener('play', () => setPlayIcon(true));
  elements.audioPlayer.addEventListener('pause', () => setPlayIcon(false));
  elements.audioPlayer.addEventListener('ended', () => setPlayIcon(false));

  elements.scrubBar.addEventListener('input', () => {
    elements.audioPlayer.currentTime = Number(elements.scrubBar.value);
  });

  // ---------------------------------------------------------------------
  // Download
  // ---------------------------------------------------------------------

  function mapMimeTypeToExtension(mimeType) {
    const baseType = mimeType.split(';')[0];
    const extensions = {
      'audio/webm': 'webm',
      'audio/mp4': 'mp4',
      'audio/ogg': 'ogg',
    };
    return extensions[baseType] || 'webm';
  }

  function downloadRecording() {
    if (!recordedBlobUrl) return;

    const extension = mapMimeTypeToExtension(recordingMimeType || 'audio/webm');
    const filename = buildFilename(new Date(), extension);

    const link = document.createElement('a');
    link.href = recordedBlobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // ---------------------------------------------------------------------
  // Wire up events
  // ---------------------------------------------------------------------

  elements.recordButton.addEventListener('click', startRecording);
  elements.stopButton.addEventListener('click', stopRecording);
  elements.playButton.addEventListener('click', togglePlayback);
  elements.downloadButton.addEventListener('click', downloadRecording);
  elements.discardButton.addEventListener('click', discardRecording);
  elements.retryButton.addEventListener('click', retry);

  setAppState(appState);
})();
