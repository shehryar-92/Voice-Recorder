# Voice Snap

A privacy-first voice recorder that runs entirely in your browser. Record, play back, and download audio — nothing is uploaded or stored anywhere.

## Features

- Record audio using your microphone
- Live recording timer
- Play back your recording before deciding what to do with it
- Scrub through playback with a progress bar
- Download the recording as an audio file
- Discard and re-record in one click
- Clear messaging if microphone access is denied, unavailable, or unsupported

## How to run locally

No build step, no dependencies. Just serve the folder:

```bash
python3 -m http.server
```

Then open `http://localhost:8000` in your browser. (Opening `index.html` directly via `file://` will not work — `getUserMedia` requires a proper origin.)

## Running the tests

Pure logic (formatting, filenames, state transitions) is covered by a plain Node.js test suite — no framework required:

```bash
node --test tests/
```

## Tech stack

- Vanilla HTML, CSS, and JavaScript
- Web Audio: `getUserMedia` + `MediaRecorder`
- Node's built-in test runner (`node:test`) for the helper logic

## Privacy

Everything happens client-side. No audio is ever sent to a server, and closing the tab permanently deletes any unsaved recording.
