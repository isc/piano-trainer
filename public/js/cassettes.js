let state = {
  cassettes: [],
  selectedCassette: '',
  isReplaying: false
}

let callbacks = {
  onReplayStart: null,
  onReplayEnd: null
}

export function initCassettes() {
  return {
    loadCassettesList,
    saveCassette,
    replayCassette,
    setCallbacks,
    getState: () => state
  }
}

function setCallbacks(cbs) {
  callbacks = { ...callbacks, ...cbs }
}

async function loadCassettesList() {
  try {
    const response = await fetch('/api/cassettes')
    state.cassettes = await response.json()
    return state.cassettes
  } catch (error) {
    console.error('Erreur lors du chargement des cassettes:', error)
    state.cassettes = []
    return []
  }
}

async function saveCassette(name, recordingData) {
  try {
    const response = await fetch('/api/cassettes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        data: recordingData
      })
    })

    if (response.ok) {
      await loadCassettesList()
      return { success: true, name }
    } else {
      const error = await response.json()
      return { success: false, error: error.error }
    }
  } catch (error) {
    console.error('Erreur lors de la sauvegarde:', error)
    return { success: false, error: 'Erreur lors de la sauvegarde de la cassette' }
  }
}

async function replayCassette(cassetteFile, midiParser, staffController) {
  if (!cassetteFile) return

  state.isReplaying = true
  if (callbacks.onReplayStart) {
    callbacks.onReplayStart()
  }

  try {
    const response = await fetch(`/${cassetteFile}`)
    const cassette = await response.json()

    // Clear staff before replay
    if (staffController) {
      staffController.getStaffState().notes = []
      staffController.redrawStaff()
    }

    // Replay each MIDI message with proper timing
    for (let i = 0; i < cassette.data.length; i++) {
      const message = cassette.data[i]

      if (i > 0) {
        const delay = message.timestamp - cassette.data[i - 1].timestamp
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }

      const uint8Array = new Uint8Array(message.data)
      const dataView = new DataView(uint8Array.buffer)
      await new Promise(resolve => setTimeout(resolve, 10)) // Small delay to ensure validation completes
      midiParser(dataView, true)
    }
  } catch (error) {
    console.error('Erreur lors du rejeu:', error)
  }

  state.isReplaying = false
  if (callbacks.onReplayEnd) {
    callbacks.onReplayEnd()
  }
}
