import { isTestEnv } from './utils.js'
import mockMIDI from './midi_mock.js'

const NOTE_ON = 144
const NOTE_OFF = 128
const NOTE_NAMES = 'C C# D D# E F F# G G# A A# B'.split(' ')

let state = {
  midiConnected: false,
  midiAccess: null,
  midiInput: null,
  isRecording: false,
  recordingData: [],
  recordingStartTime: null,
}

let callbacks = {
  onNotePlayed: null,
  onNoteReleased: null,
}

export function initMidi() {
  return {
    connectMIDI,
    parseMidiMessage,
    noteName,
    startRecording,
    stopRecording,
    setCallbacks,
    state,
  }
}

function setCallbacks(cbs) {
  callbacks = { ...callbacks, ...cbs }
}

async function connectMIDI(options = {}) {
  const { silent = false, autoSelectFirst = false } = options

  if (isTestEnv()) {
    return connectMIDIMock()
  }

  if (!navigator.requestMIDIAccess) {
    console.error('Web MIDI API non supportée')
    if (!silent) alert('Web MIDI API non supportée par ce navigateur')
    return
  }

  try {
    state.midiAccess = await navigator.requestMIDIAccess()

    // Get available MIDI inputs
    const inputs = Array.from(state.midiAccess.inputs.values())

    if (inputs.length === 0) {
      console.log('Aucun périphérique MIDI trouvé')
      return { status: 'no_devices' }
    }

    // If only one input or autoSelectFirst, use the first one
    if (inputs.length === 1 || autoSelectFirst) {
      selectMIDIInput(inputs[0])
    } else {
      // Show selection dialog
      const inputNames = inputs.map((input, i) => `${i + 1}. ${input.name || 'Périphérique inconnu'}`).join('\n')
      const choice = prompt(
        `Plusieurs périphériques MIDI trouvés:\n${inputNames}\n\nEntrez le numéro (1-${inputs.length}):`,
        '1',
      )

      if (choice) {
        const index = parseInt(choice, 10) - 1
        if (index >= 0 && index < inputs.length) {
          selectMIDIInput(inputs[index])
        } else {
          if (!silent) alert('Choix invalide')
          return
        }
      } else {
        return // User cancelled
      }
    }

    // Listen for device changes and auto-reconnect
    state.midiAccess.onstatechange = (event) => {
      console.log('MIDI device state change:', event.port.name, event.port.state)
      if (event.port.state === 'disconnected' && event.port === state.midiInput) {
        state.midiConnected = false
        state.midiInput = null
        console.log('MIDI device disconnected')
      } else if (event.port.state === 'connected' && event.port.type === 'input' && !state.midiConnected) {
        // Auto-connect to newly connected device
        console.log('New MIDI device detected, auto-connecting:', event.port.name)
        selectMIDIInput(event.port)
      }
    }
  } catch (e) {
    console.error('Erreur MIDI:', e)
    if (!silent) alert('Erreur lors de la connexion MIDI: ' + e.message)
  }
}

function selectMIDIInput(input) {
  state.midiInput = input

  input.onmidimessage = (event) => {
    parseMidiMessage(event.data)
  }

  state.midiConnected = true
  console.log('MIDI connected:', input.name)
}

async function connectMIDIMock() {
  // Use mock for testing
  mockMIDI.connect((data) => {
    parseMidiMessage(data)
  })
  state.midiInput = { name: 'Mock MIDI Keyboard' }
  state.midiConnected = true
  console.log('Mock MIDI connected')
}

// Parse standard MIDI messages (from Web MIDI API)
function parseMidiMessage(data, isReplay = false) {
  if (state.isRecording && !isReplay) {
    const timestamp = Date.now() - state.recordingStartTime
    state.recordingData.push({ timestamp, data: Array.from(data) })
  }

  const status = data[0]
  const note = data[1]
  const velocity = data[2]

  // Note On: status 144-159 (0x90-0x9F)
  // Note Off: status 128-143 (0x80-0x8F)
  const statusType = status & 0xf0

  if (statusType === NOTE_ON && velocity > 0 && note < 128) {
    const noteNameStr = noteName(note)
    if (callbacks.onNotePlayed) {
      callbacks.onNotePlayed(noteNameStr, note)
    }
    console.log(`Note ON ${isReplay ? 'replayed' : 'detected'}:`, noteNameStr)
  }
  if (statusType === NOTE_OFF || (statusType === NOTE_ON && velocity === 0)) {
    const noteNameStr = noteName(note)
    if (callbacks.onNoteReleased) {
      callbacks.onNoteReleased(noteNameStr, note)
    }
    console.log(`Note OFF ${isReplay ? 'replayed' : 'detected'}:`, noteNameStr)
  }
}

// Convert MIDI note number to name
function noteName(n) {
  const octave = Math.floor(n / 12) - 1
  return NOTE_NAMES[n % 12] + octave
}

function startRecording() {
  state.isRecording = true
  state.recordingData = []
  state.recordingStartTime = Date.now()
}

async function stopRecording() {
  state.isRecording = false

  if (state.recordingData.length === 0) {
    alert('Aucune donnée enregistrée !')
    return null
  }

  const cassetteName = prompt(
    'Nom de la cassette :',
    `Cassette_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}`,
  )

  if (!cassetteName) {
    console.log('Enregistrement annulé')
    return null
  }

  return {
    name: cassetteName,
    data: state.recordingData,
  }
}

export { NOTE_ON, NOTE_OFF, NOTE_NAMES, noteName }
