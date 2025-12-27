# Technical Documentation for Piano Trainer

This document provides a detailed technical overview of the Piano Trainer application, covering architecture, implementation details, and key algorithms.

## System Architecture

### High-Level Overview

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                                Piano Trainer Application                        │
├─────────────────┬─────────────────────────────────┬───────────────────────────┤
│  Backend (Ruby) │         Frontend (JavaScript)   │    External Dependencies  │
│                 │                                 │                           │
│  ┌─────────────┐ │  ┌───────────────────────────┐ │  ┌─────────────────────┐ │
│  │ Sinatra API │ │  │ MIDI Processing Engine     │ │  │ Web Bluetooth API   │ │
│  └─────────────┘ │  └───────────────────────────┘ │  └─────────────────────┘ │
│  ┌─────────────┐ │  ┌───────────────────────────┐ │  ┌─────────────────────┐ │
│  │ File System │ │  │ MusicXML Parser           │ │  │ VexFlow             │ │
│  └─────────────┘ │  └───────────────────────────┘ │  └─────────────────────┘ │
│  ┌─────────────┐ │  ┌───────────────────────────┐ │  ┌─────────────────────┐ │
│  │ CORS Middle │ │  │ Note Validation System   │ │  │ OpenSheetMusicDisplay│ │
│  └─────────────┘ │  └───────────────────────────┘ │  └─────────────────────┘ │
│                 │  ┌───────────────────────────┐ │  ┌─────────────────────┐ │
│                 │  │ Recording/Playback System │ │  │ Alpine.js           │ │
│                 │  └───────────────────────────┘ │  └─────────────────────┘ │
│                 │  ┌───────────────────────────┐ │  ┌─────────────────────┐ │
│                 │  │ UI State Management       │ │  │ Pico CSS            │ │
│                 │  └───────────────────────────┘ │  └─────────────────────┘ │
└─────────────────┴─────────────────────────────────┴───────────────────────────┘
```

## Backend Implementation

### Sinatra API Server (`app.rb`)

#### Key Components

1. **Configuration**:
   ```ruby
   configure do
     set :port, 4567
     set :bind, '0.0.0.0'
     set :public_folder, File.dirname(__FILE__) + '/public'
     set :static, true
   end
   ```

2. **CORS Middleware**:
   ```ruby
   before do
     response.headers['Access-Control-Allow-Origin'] = '*'
     response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
     response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
   end
   ```

3. **API Endpoints**:
   - `GET /api/cassettes`: Lists all MIDI recordings
   - `POST /api/cassettes`: Saves a new MIDI recording
   - `GET /`: Serves the main HTML page
   - `GET *`: Catch-all for static files

#### File Storage

Recordings are stored as JSON files in `public/cassettes/` with the following structure:

```json
{
  "name": "recording_name",
  "created_at": "ISO_8601_timestamp",
  "data": [
    {
      "timestamp": 123,
      "data": [144, 60, 100]  // MIDI message bytes
    }
  ]
}
```

## Frontend Implementation

### Modular Architecture

The frontend is organized into five specialized modules, each with a clear responsibility:

```
public/js/
├── app.js         (118 lines) - Alpine.js coordination layer
├── midi.js        (147 lines) - Bluetooth MIDI & recording
├── musicxml.js    (282 lines) - MusicXML parsing & validation
├── staff.js       (103 lines) - VexFlow rendering
└── cassettes.js   (103 lines) - Cassette management
```

#### Module Communication

Modules communicate through a callback system, ensuring loose coupling:

```javascript
// In app.js - Coordination layer
const midi = initMidi()
const musicxml = initMusicXML()
const cassettes = initCassettes()
const staff = initStaff()

// Set up inter-module communication
midi.setCallbacks({
  onNotePlayed: (noteName, midiNote) => {
    staff.addNoteToStaff(noteName)
    musicxml.validatePlayedNote(midiNote)
  }
})

musicxml.setCallbacks({
  onNotesExtracted: notes => {
    this.allNotes = notes
  }
})

cassettes.setCallbacks({
  onReplayStart: () => this.isReplaying = true,
  onReplayEnd: () => this.isReplaying = false
})
```

### Core Application (`public/js/app.js`)

#### State Management

The application uses Alpine.js for reactive UI state:

```javascript
function midiApp() {
  return {
    bluetoothConnected: false,
    device: null,
    osmdInstance: null,
    currentNoteIndex: 0,
    allNotes: [],
    isRecording: false,
    recordingData: [],
    recordingStartTime: null,
    recordingDuration: 0,
    recordingTimer: null,
    isReplaying: false,
    cassettes: [],
    selectedCassette: ''
  }
}
```

### MIDI Module (`public/js/midi.js`)

Handles all Bluetooth MIDI communication and recording:

```javascript
// Module exports
export function initMidi() {
  return {
    connectBluetooth,
    parseMidiBLE,
    noteName,
    startRecording,
    stopRecording,
    setCallbacks,
    state
  }
}
```

##### Bluetooth Connection

```javascript
async function connectBluetooth() {
  state.device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [MIDI_BLE_UUID] }]
  });
  const server = await state.device.gatt.connect();
  const service = await server.getPrimaryService(MIDI_BLE_UUID);
  const characteristic = await service.getCharacteristic(
    '7772e5db-3868-4112-a1a9-f2669d106bf3'
  );
  await characteristic.startNotifications();
  characteristic.addEventListener('characteristicvaluechanged', event => {
    parseMidiBLE(event.target.value);
  });
  state.bluetoothConnected = true;
}
```

##### MIDI Message Parsing

```javascript
function parseMidiBLE(dataView, isReplay = false) {
  let arr = [];
  for (let k = 0; k < dataView.byteLength; k++) {
    arr.push(dataView.getUint8(k));
  }

  // Store recording data
  if (state.isRecording && !isReplay) {
    const timestamp = Date.now() - state.recordingStartTime;
    state.recordingData.push({ timestamp, data: arr });
  }

  // Parse MIDI messages
  arr.shift();
  while (arr.length) {
    arr.shift();
    const status = arr.shift();
    const note = arr.shift();
    const velocity = arr.shift();

    if (status >= 128 && status <= 239) {
      if (status === NOTE_ON && velocity > 0 && note < 128) {
        const noteNameStr = noteName(note);
        if (callbacks.onNotePlayed) {
          callbacks.onNotePlayed(noteNameStr, note);
        }
      }
    }
  }
}
```

### MusicXML Module (`public/js/musicxml.js`)

Handles parsing and validation of MusicXML scores:

```javascript
// Module exports
export function initMusicXML() {
  return {
    loadMusicXML,
    renderMusicXML,
    extractNotesFromScore,
    validatePlayedNote,
    resetProgress,
    clearScore,
    setCallbacks,
    getOsmdInstance: () => osmdInstance,
    getAllNotes: () => allNotes,
    getCurrentNoteIndex: () => currentNoteIndex
  };
}
```

##### Loading and Rendering

```javascript
async function loadMusicXML(event) {
  const file = event.target.files[0];
  if (!file) return;

  const xmlContent = await file.text();
  if (!xmlContent.includes('score-partwise') &&
      !xmlContent.includes('score-timewise')) {
    alert('Ce fichier ne semble pas être un fichier MusicXML valide');
    return;
  }

  await renderMusicXML(xmlContent);
}

async function renderMusicXML(xmlContent) {
  const scoreContainer = document.getElementById('score');
  const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(scoreContainer);
  await osmd.load(xmlContent);
  osmdInstance = osmd;
  extractNotesFromScore();
  addPlaybackControls(osmd);
}
```

##### Note Extraction Algorithm

```javascript
function extractNotesFromScore() {
  allNotes = [];
  currentNoteIndex = 0;

  if (!osmdInstance) return;

  extractFromSourceMeasures(osmdInstance.Sheet.SourceMeasures);
  allNotes.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  if (callbacks.onNotesExtracted) {
    callbacks.onNotesExtracted(allNotes);
  }
}

function extractFromSourceMeasures(sourceMeasures) {
  sourceMeasures.forEach((measure, measureIndex) => {
    measure.verticalSourceStaffEntryContainers.forEach(container => {
      extractNotesFromContainer(container, measureIndex);
    });
  });
}

function extractNotesFromContainer(container, measureIndex) {
  if (container.staffEntries) {
    for (const staffEntry of container.staffEntries) {
      if (!staffEntry?.voiceEntries) continue;
      for (const voiceEntry of staffEntry.voiceEntries) {
        extractNotesFromVoiceEntry(voiceEntry, measureIndex);
      }
    }
  }
}

function extractNotesFromVoiceEntry(voiceEntry, measureIndex) {
  if (!voiceEntry.notes) return;
  for (const note of voiceEntry.notes) {
    if (!note.pitch) continue;
    const noteInfo = pitchToMidiFromSourceNote(note.pitch);
    allNotes.push({
      note: note,
      midiNumber: noteInfo.midiNote,
      noteName: noteInfo.noteName,
      timestamp: measureIndex + voiceEntry.timestamp.realValue,
      measureIndex: measureIndex
    });
  }
}

function pitchToMidiFromSourceNote(pitch) {
  const midiNote = pitch.halfTone + 12;
  const noteNameStd = NOTE_NAMES[midiNote % 12];
  const octaveStd = Math.floor(midiNote / 12) - 1;
  return { noteName: `${noteNameStd}${octaveStd}`, midiNote: midiNote };
}
```

### Staff Module (`public/js/staff.js`)

Handles VexFlow rendering of the musical staff:

```javascript
// Module exports
export function initStaff() {
  return {
    initStaff: initStaffInternal,
    addNoteToStaff,
    redrawStaff,
    getStaffState
  }
}
```

#### VexFlow Integration

```javascript
function initStaffInternal() {
  const div = document.getElementById('staff');
  div.innerHTML = '';
  const renderer = new VexFlow.Renderer(div, VexFlow.Renderer.Backends.SVG);
  renderer.resize(600, 200);
  const context = renderer.getContext();

  staffState = {
    renderer,
    context,
    stave: new VexFlow.Stave(10, 40, 580),
    notes: []
  };

  staffState.stave.addClef('treble').addTimeSignature('4/4');
  staffState.stave.setContext(context).draw();
}

function addNoteToStaff(noteName) {
  const vexNote = convertToVexFlowNote(noteName);
  staffState.notes.push(vexNote);

  if (staffState.notes.length > 8) {
    staffState.notes.shift();
  }

  redrawStaff();
}
```

### Cassettes Module (`public/js/cassettes.js`)

Manages recording storage and playback:

```javascript
// Module exports
export function initCassettes() {
  return {
    loadCassettesList,
    saveCassette,
    replayCassette,
    setCallbacks,
    getState: () => state
  }
}
```

#### Cassette Management

```javascript
async function loadCassettesList() {
  try {
    const response = await fetch('/api/cassettes');
    state.cassettes = await response.json();
    return state.cassettes;
  } catch (error) {
    console.error('Erreur lors du chargement des cassettes:', error);
    state.cassettes = [];
    return [];
  }
}

async function saveCassette(name, recordingData) {
  try {
    const response = await fetch('/api/cassettes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, data: recordingData })
    });

    if (response.ok) {
      await loadCassettesList();
      return { success: true, name };
    } else {
      const error = await response.json();
      return { success: false, error: error.error };
    }
  } catch (error) {
    return { success: false, error: 'Erreur lors de la sauvegarde' };
  }
}

async function replayCassette(cassetteFile, midiParser, staffController) {
  state.isReplaying = true;
  if (callbacks.onReplayStart) callbacks.onReplayStart();

  try {
    const response = await fetch(`/${cassetteFile}`);
    const cassette = await response.json();

    if (staffController) {
      staffController.getStaffState().notes = [];
      staffController.redrawStaff();
    }

    for (let i = 0; i < cassette.data.length; i++) {
      const message = cassette.data[i];

      if (i > 0) {
        const delay = message.timestamp - cassette.data[i - 1].timestamp;
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      const uint8Array = new Uint8Array(message.data);
      const dataView = new DataView(uint8Array.buffer);
      midiParser(dataView, true);
    }
  } catch (error) {
    console.error('Erreur lors du rejeu:', error);
  }

  state.isReplaying = false;
  if (callbacks.onReplayEnd) callbacks.onReplayEnd();
}
```

#### Note Validation System

```javascript
function validatePlayedNote(midiNote) {
  if (!this.osmdInstance || this.allNotes.length === 0) return;
  if (this.currentNoteIndex >= this.allNotes.length) return;
  
  const expectedNote = this.allNotes[this.currentNoteIndex];
  const currentTimestamp = expectedNote.timestamp;
  
  // Find matching note at current timestamp
  const matchingNoteIndex = this.allNotes.findIndex(
    (note, index) =>
      index >= this.currentNoteIndex &&
      note.timestamp === currentTimestamp &&
      note.midiNumber === midiNote
  );
  
  if (matchingNoteIndex !== -1) {
    const matchingNote = this.allNotes[matchingNoteIndex];
    this.svgNote(matchingNote.note).classList.add('played-note');
    
    // Handle out-of-order notes
    if (matchingNoteIndex !== this.currentNoteIndex) {
      [this.allNotes[this.currentNoteIndex], 
       this.allNotes[matchingNoteIndex]] = 
      [this.allNotes[matchingNoteIndex], 
       this.allNotes[this.currentNoteIndex]];
    }
    
    this.currentNoteIndex++;
    
    if (this.currentNoteIndex >= this.allNotes.length)
      this.showCompletionMessage();
  } else {
    // Show error for incorrect note
    const notesAtSameTimestamp = this.allNotes.filter(
      (note, index) =>
        index >= this.currentNoteIndex &&
        note.timestamp === currentTimestamp
    );
    const expectedNoteNames = notesAtSameTimestamp
      .map(note => note.noteName)
      .join(' ou ');
    this.showErrorFeedback(expectedNoteNames, this.noteName(midiNote));
  }
}
```

#### Visual Feedback

```javascript
function svgNote(note) {
  return osmdInstance.rules.GNote(note).getSVGGElement();
}

function updateProgressDisplay() {
  const progressDiv = document.getElementById('score-progress');
  if (!progressDiv) return;

  const total = allNotes.length;
  const completed = currentNoteIndex;
  const percentage = Math.round((completed / total) * 100);

  if (completed >= total) {
    progressDiv.innerHTML = `🎉 Partition terminée ! (${total}/${total} notes - 100%)`;
    progressDiv.style.color = '#22c55e';
  } else {
    const nextNote = allNotes[currentNoteIndex]?.noteName || '?';
    progressDiv.innerHTML = `Note suivante: <strong>${nextNote}</strong> |
                             Progression: ${completed}/${total} (${percentage}%)`;
    progressDiv.style.color = '#3b82f6';
  }
}
```

## Data Structures

### MIDI Note Representation

```javascript
const NOTE_NAMES = 'C C# D D# E F F# G G# A A# B'.split(' ');

// MIDI note number to name conversion
noteName(n) {
  const octave = Math.floor(n / 12) - 1;
  return NOTE_NAMES[n % 12] + octave;
}
```

### Extracted Note Structure

```javascript
{
  note: Object,          // OSMD note object
  midiNumber: Number,    // MIDI note number (0-127)
  noteName: String,      // e.g., "C4", "D#3"
  timestamp: Number,     // Measure index + voice entry timestamp
  measureIndex: Number   // Measure number
}
```

### Recording Data Structure

```javascript
{
  timestamp: Number,     // Milliseconds since recording start
  data: Array            // Raw MIDI message bytes
}
```

## Algorithms

### Note Validation Algorithm

1. **Input**: MIDI note number from played note
2. **Current State**: `currentNoteIndex` pointing to expected note
3. **Process**:
   - Find all notes at the same timestamp as the expected note
   - Check if played note matches any of these notes
   - If match found:
     - Highlight the note in the score
     - Handle out-of-order notes by swapping positions
     - Increment `currentNoteIndex`
     - Check for completion
   - If no match:
     - Show error message with expected vs. played notes
     - Do not increment index

### MusicXML Extraction Algorithm

1. **Input**: OSMD `SourceMeasures` array
2. **Process**:
   - Iterate through each measure
   - For each measure, iterate through vertical containers
   - For each container, iterate through staff entries
   - For each staff entry, iterate through voice entries
   - For each voice entry, extract notes with pitch information
   - Convert pitch to MIDI note number
   - Calculate timestamp (measure index + voice entry timestamp)
3. **Output**: Sorted array of notes with timing information

### Recording Playback Algorithm

1. **Input**: Array of recorded MIDI messages with timestamps
2. **Process**:
   - Initialize staff display
   - For each message:
     - Calculate delay from previous message
     - Wait for the calculated delay
     - Parse and process the MIDI message
     - Update visual display
3. **Output**: Real-time playback of recorded performance

## Performance Considerations

### Memory Management

- **Note Buffer**: Only keeps last 8 notes in the staff display
- **Recording Data**: Cleared after saving or canceling
- **MusicXML Processing**: Large scores are processed incrementally

### Rendering Optimization

- **SVG Rendering**: Uses VexFlow's SVG backend for efficient rendering
- **Incremental Updates**: Only redraws necessary parts of the staff
- **CSS Transitions**: Smooth visual feedback without JavaScript animation

### Error Handling

- **Bluetooth Errors**: Graceful fallback with console logging
- **MusicXML Validation**: Checks for valid MusicXML structure
- **API Errors**: User-friendly error messages
- **MIDI Parsing**: Robust handling of malformed messages

## Testing Strategy

### Test Coverage

1. **MusicXML Parsing**: Tests note extraction from simple and complex scores
2. **Note Validation**: Tests correct/incorrect note detection
3. **Playback**: Tests cassette replay functionality
4. **Integration**: Tests full workflow from loading to completion

### Test Implementation

```ruby
class PianoTrainerTest < CapybaraTestBase
  def test_musicxml_note_extraction
    visit '/'
    attach_file('musicxml-upload', File.expand_path('../simple-score.xml', __dir__))
    assert_text 'Extraction terminée: 4 notes trouvées'
    select 'oh-when-the-saints'
    click_on 'Rejouer cassette'
    assert_text 'Partition terminée'
  end

  def test_musicxml_note_extraction_two_parts
    visit '/'
    attach_file('musicxml-upload', File.expand_path('../schumann-melodie.xml', __dir__))
    assert_text 'Extraction terminée: 256 notes trouvées'
  end
end
```

## Security Considerations

### CORS
- Open CORS policy (`Access-Control-Allow-Origin: *`) for development
- Should be restricted in production to specific domains

### File Uploads
- MusicXML files are processed client-side
- No server-side file storage for uploaded MusicXML
- Cassette names are sanitized to prevent path traversal

### Bluetooth Access
- Requires explicit user permission
- Limited to MIDI service UUID
- No persistent device access

## Future Enhancements

### Technical Improvements

1. **Performance**:
   - Web Workers for MusicXML parsing
   - Virtual scrolling for large scores
   - Optimized MIDI message processing

2. **Features**:
   - Multi-track support
   - Tempo detection and adjustment
   - Metronome integration
   - Pedal support (sustain, soft, sostenuto)

3. **UI/UX**:
   - Mobile-responsive design
   - Touch-friendly controls
   - Dark mode support
   - Localization

4. **Data**:
   - Practice statistics and analytics
   - User accounts and progress tracking
   - Cloud sync for recordings

### Architecture Evolution

- **State Management**: Consider Redux or similar for complex state
- **Backend**: Potential migration to Rails for more features
- **Real-time**: WebSocket support for collaborative features
- **TypeScript**: Add type safety across modules

## Troubleshooting

### Common Issues

1. **Bluetooth Connection Problems**:
   - Ensure device is discoverable
   - Check browser Bluetooth permissions
   - Verify device supports BLE MIDI

2. **MusicXML Loading Errors**:
   - Validate MusicXML structure
   - Check for corrupt files
   - Verify file encoding (UTF-8)

3. **Note Detection Issues**:
   - Check MIDI device configuration
   - Verify note velocity thresholds
   - Test with different instruments

### Debugging Tools

- **Browser Console**: Shows MIDI messages and errors
- **Test Logs**: Capture browser output during tests
- **Network Tab**: Monitor API requests and responses

## Conclusion

The Piano Trainer application demonstrates a sophisticated integration of web technologies for music education. By combining Web Bluetooth API for MIDI device connectivity, MusicXML parsing for sheet music display, and real-time note validation, it provides a comprehensive practice tool for musicians.

The architecture separates concerns between backend (file management and API) and frontend (MIDI processing and UI), while maintaining a cohesive user experience. The use of modern web standards and libraries enables rich functionality without requiring native applications.
