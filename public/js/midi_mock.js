// Mock for Web MIDI API used in tests
let messageCallback = null

const mockMIDI = {
  connect: (callback) => {
    messageCallback = callback

    // Listen for mock MIDI input events
    window.addEventListener('mock-midi-input', (e) => {
      const dataArray = e.detail.data
      if (messageCallback) {
        // Convert to Uint8Array for consistency with Web MIDI API
        const uint8Array = new Uint8Array(dataArray)
        messageCallback(uint8Array)
      }
    })

    return Promise.resolve()
  },

  disconnect: () => {
    messageCallback = null
  },

  // Utility to send test MIDI messages
  sendTestNote: (note, velocity = 100, channel = 0) => {
    const noteOn = new Uint8Array([0x90 | channel, note, velocity])
    if (messageCallback) {
      messageCallback(noteOn)
    }
  },
}

export default mockMIDI
