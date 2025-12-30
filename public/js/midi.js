const NOTE_ON = 144
const NOTE_OFF = 128
const MIDI_BLE_UUID = '03b80e5a-ede8-4b33-a751-6ce34ec4c700'
const NOTE_NAMES = 'C C# D D# E F F# G G# A A# B'.split(' ')

let state = {
  bluetoothConnected: false,
  device: null,
  isRecording: false,
  recordingData: [],
  recordingStartTime: null,
  recordingDuration: 0,
  recordingTimer: null,
}

let callbacks = {
  onNotePlayed: null,
  onNoteValidation: null,
}

export function initMidi() {
  return {
    connectBluetooth,
    parseMidiBLE,
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

async function connectBluetooth() {
  if (!navigator.bluetooth) {
    console.error('Web Bluetooth API non supportée')
    return
  }

  try {
    state.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [MIDI_BLE_UUID] }],
    })

    const server = await state.device.gatt.connect()
    const service = await server.getPrimaryService(MIDI_BLE_UUID)
    const characteristic = await service.getCharacteristic(
      '7772e5db-3868-4112-a1a9-f2669d106bf3'
    )

    await characteristic.startNotifications()
    characteristic.addEventListener('characteristicvaluechanged', (event) => {
      parseMidiBLE(event.target.value)
    })

    state.bluetoothConnected = true
    console.log('Bluetooth MIDI connected')
  } catch (e) {
    console.error('Erreur Bluetooth: ' + e)
  }
}

function parseMidiBLE(dataView, isReplay = false) {
  let arr = []
  for (let k = 0; k < dataView.byteLength; k++) {
    arr.push(dataView.getUint8(k))
  }

  if (state.isRecording && !isReplay) {
    const timestamp = Date.now() - state.recordingStartTime
    state.recordingData.push({ timestamp: timestamp, data: arr })
  }

  // Parse MIDI messages
  arr.shift() // Remove header
  while (arr.length) {
    arr.shift() // Remove timestamp bytes
    const status = arr.shift()
    const note = arr.shift()
    const velocity = arr.shift()

    if (status >= 128 && status <= 239) {
      if (status === NOTE_ON && velocity > 0 && note < 128) {
        const noteNameStr = noteName(note)
        if (callbacks.onNotePlayed) {
          callbacks.onNotePlayed(noteNameStr, note)
        }
        console.log(
          `Note ON ${isReplay ? 'replayed' : 'detected'}:`,
          noteNameStr
        )
      }
      if (status === NOTE_OFF) {
        console.log(
          `Note OFF ${isReplay ? 'replayed' : 'detected'}:`,
          noteName(note)
        )
      }
    }
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
  state.recordingDuration = 0

  state.recordingTimer = setInterval(() => {
    state.recordingDuration = Math.floor(
      (Date.now() - state.recordingStartTime) / 1000
    )
  }, 1000)
}

async function stopRecording() {
  state.isRecording = false
  clearInterval(state.recordingTimer)

  if (state.recordingData.length === 0) {
    alert('Aucune donnée enregistrée !')
    return null
  }

  const cassetteName = prompt(
    'Nom de la cassette :',
    `Cassette_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}`
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

export { NOTE_ON, NOTE_OFF, MIDI_BLE_UUID, NOTE_NAMES, noteName }
