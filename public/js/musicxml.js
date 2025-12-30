import { NOTE_NAMES, noteName } from './midi.js'

let osmdInstance = null
let allNotes = []
let currentMeasureIndex = 0
let trainingMode = false
let targetRepeatCount = 3
let repeatCount = 0
let currentRepetitionIsClean = true
let lastStaffY = null
let measureClickHandlers = new Map()
let measureClickRectangles = []

let callbacks = {
  onNotesExtracted: null,
  onNoteValidation: null,
  onMeasureCompleted: null,
  onNoteError: null,
  onTrainingProgress: null,
  onTrainingComplete: null,
}

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
    getNotesByMeasure: () => allNotes,
    getTrainingState: () => ({
      trainingMode,
      currentMeasureIndex,
      repeatCount,
      targetRepeatCount,
    }),
    updateRepeatIndicators: () => updateRepeatIndicators(),
    setTrainingMode: (enabled) => {
      trainingMode = enabled
      repeatCount = 0
      currentMeasureIndex = 0
      currentRepetitionIsClean = true
      resetProgress()
      updateMeasureCursor()

      if (enabled) {
        setupMeasureClickHandlers()
      } else {
        removeMeasureClickHandlers()
      }
    },
    jumpToMeasure: (measureIndex) => jumpToMeasure(measureIndex),
    resetMeasureProgress: () => {
      for (const measureData of allNotes) {
        for (const noteData of measureData.notes) {
          noteData.played = false
        }
      }
    },
  }
}

function setCallbacks(cbs) {
  callbacks = { ...callbacks, ...cbs }
}

function resetPlaybackState() {
  currentMeasureIndex = 0
  repeatCount = 0
  currentRepetitionIsClean = true
  lastStaffY = null
}

async function loadMusicXML(event) {
  const file = event.target.files[0]
  if (!file) return

  try {
    const xmlContent = await file.text()

    if (!xmlContent.includes('score-partwise') && !xmlContent.includes('score-timewise')) {
      alert('Ce fichier ne semble pas être un fichier MusicXML valide')
      return
    }

    // Clear previous score before loading new one
    if (osmdInstance) {
      const scoreContainer = document.getElementById('score')
      if (scoreContainer) {
        scoreContainer.innerHTML = ''
      }
    }

    await renderMusicXML(xmlContent)
  } catch (error) {
    console.error('Erreur lors du chargement du MusicXML:', error)
    alert('Erreur lors du chargement du fichier MusicXML')
  }
}

async function renderMusicXML(xmlContent) {
  try {
    const scoreContainer = document.getElementById('score')
    const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(scoreContainer)

    await osmd.load(xmlContent)
    osmdInstance = osmd
    window.osmdInstance = osmd

    extractNotesFromScore()
  } catch (error) {
    console.error('Erreur lors du rendu MusicXML avec OSMD:', error)
  }
}

function extractNotesFromScore() {
  allNotes = []
  trainingMode = false
  resetPlaybackState()

  if (!osmdInstance) return

  const sheet = osmdInstance.Sheet
  extractFromSourceMeasures(sheet.SourceMeasures)

  if (callbacks.onNotesExtracted) {
    console.log('Calling onNotesExtracted callback')
    callbacks.onNotesExtracted(allNotes, {
      title: sheet.Title?.text || '',
      composer: sheet.Composer || '',
    })
  }
}

function extractFromSourceMeasures(sourceMeasures) {
  sourceMeasures.forEach((measure, measureIndex) => {
    const measureNotes = []

    measure.verticalSourceStaffEntryContainers.forEach((container) => {
      if (container.staffEntries) {
        for (const staffEntry of container.staffEntries) {
          if (!staffEntry?.voiceEntries) continue
          for (const voiceEntry of staffEntry.voiceEntries) {
            if (!voiceEntry.notes) continue
            for (const note of voiceEntry.notes) {
              if (!note.pitch) continue
              const noteInfo = pitchToMidiFromSourceNote(note.pitch)
              measureNotes.push({
                note: note,
                midiNumber: noteInfo.midiNote,
                noteName: noteInfo.noteName,
                timestamp: measureIndex + voiceEntry.timestamp.realValue,
                measureIndex: measureIndex,
                played: false,
              })
            }
          }
        }
      }
    })

    if (measureNotes.length > 0) {
      allNotes.push({
        measureIndex: measureIndex,
        notes: measureNotes,
      })
    }
  })
}

function pitchToMidiFromSourceNote(pitch) {
  const midiNote = pitch.halfTone + 12
  const noteNameStd = NOTE_NAMES[midiNote % 12]
  const octaveStd = Math.floor(midiNote / 12) - 1
  return { noteName: `${noteNameStd}${octaveStd}`, midiNote: midiNote }
}

function resetMeasureProgress(resetRepeatCount = true) {
  if (currentMeasureIndex >= allNotes.length) return

  const measureData = allNotes[currentMeasureIndex]
  if (!measureData) return

  for (const noteData of measureData.notes) {
    svgNote(noteData.note).classList.remove('played-note')
    noteData.played = false
  }

  if (resetRepeatCount) {
    repeatCount = 0
  }
  currentRepetitionIsClean = true
}

function updateMeasureCursor() {
  if (!osmdInstance) return

  // Remove existing highlight rectangle and repeat indicators
  const existingHighlight = document.getElementById('measure-highlight-rect')
  if (existingHighlight) {
    existingHighlight.remove()
  }
  const existingIndicators = document.getElementById('repeat-indicators')
  if (existingIndicators) {
    existingIndicators.remove()
  }

  if (trainingMode && currentMeasureIndex < allNotes.length) {
    const measureData = allNotes[currentMeasureIndex]
    if (measureData && measureData.notes && measureData.notes.length > 0) {
      // Get bounding boxes of all notes in the measure
      const noteElements = measureData.notes.map((n) => svgNote(n.note))
      const boxes = noteElements.map((el) => el.getBBox())

      if (boxes.length > 0) {
        // Calculate combined bounding box
        const minX = Math.min(...boxes.map((b) => b.x))
        const minY = Math.min(...boxes.map((b) => b.y))
        const maxX = Math.max(...boxes.map((b) => b.x + b.width))
        const maxY = Math.max(...boxes.map((b) => b.y + b.height))

        const svg = noteElements[0].ownerSVGElement

        // Create highlight rectangle
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        rect.id = 'measure-highlight-rect'
        rect.setAttribute('x', minX - 10)
        rect.setAttribute('y', minY - 10)
        rect.setAttribute('width', maxX - minX + 20)
        rect.setAttribute('height', maxY - minY + 20)

        // Insert at beginning so it's behind notes
        svg.insertBefore(rect, svg.firstChild)

        // Create repeat indicators (circles)
        const indicatorsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        indicatorsGroup.id = 'repeat-indicators'

        const centerX = (minX + maxX) / 2
        const circleY = minY - 40
        const circleRadius = 6
        const circleSpacing = 18

        for (let i = 0; i < targetRepeatCount; i++) {
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
          const offsetX = (i - (targetRepeatCount - 1) / 2) * circleSpacing
          circle.setAttribute('cx', centerX + offsetX)
          circle.setAttribute('cy', circleY)
          circle.setAttribute('r', circleRadius)
          circle.className.baseVal = i < repeatCount ? 'repeat-indicator filled' : 'repeat-indicator'
          circle.dataset.index = i
          indicatorsGroup.appendChild(circle)
        }

        svg.appendChild(indicatorsGroup)
      }
    }
  }
}

function updateRepeatIndicators() {
  if (!osmdInstance || !trainingMode) return

  const indicators = document.querySelectorAll('.repeat-indicator')
  indicators.forEach((circle, index) => {
    circle.classList.toggle('filled', index < repeatCount)
  })
}

function setupMeasureClickHandlers() {
  if (!osmdInstance || allNotes.length === 0) return

  // Clear existing handlers first
  removeMeasureClickHandlers()

  // Create invisible clickable rectangles for each measure
  allNotes.forEach((measureData, measureIndex) => {
    if (!measureData || !measureData.notes || measureData.notes.length === 0) return

    // Get bounding boxes of all notes in the measure
    const noteElements = measureData.notes.map((n) => svgNote(n.note))
    const boxes = noteElements.map((el) => el.getBBox())

    if (boxes.length === 0) return

    // Calculate combined bounding box
    const minX = Math.min(...boxes.map((b) => b.x))
    const minY = Math.min(...boxes.map((b) => b.y))
    const maxX = Math.max(...boxes.map((b) => b.x + b.width))
    const maxY = Math.max(...boxes.map((b) => b.y + b.height))

    const svg = noteElements[0].ownerSVGElement

    // Create invisible clickable rectangle
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    rect.classList.add('measure-click-area')
    rect.setAttribute('x', minX - 10)
    rect.setAttribute('y', minY - 10)
    rect.setAttribute('width', maxX - minX + 20)
    rect.setAttribute('height', maxY - minY + 20)
    rect.dataset.measureIndex = measureIndex

    // Create and store handler
    const handler = () => jumpToMeasure(measureIndex)
    measureClickHandlers.set(rect, handler)
    rect.addEventListener('click', handler)

    // Insert at beginning so it's behind notes
    svg.insertBefore(rect, svg.firstChild)
    measureClickRectangles.push(rect)
  })
}

function removeMeasureClickHandlers() {
  // Remove click handlers and rectangles
  measureClickHandlers.forEach((handler, rect) => {
    rect.removeEventListener('click', handler)
    if (rect.parentNode) {
      rect.parentNode.removeChild(rect)
    }
  })

  measureClickHandlers.clear()
  measureClickRectangles = []
}

function jumpToMeasure(measureIndex) {
  if (measureIndex < 0 || measureIndex >= allNotes.length) return

  // Reset progress for current measure before jumping
  resetMeasureProgress()

  // Jump to new measure
  currentMeasureIndex = measureIndex

  // Update visual cursor
  updateMeasureCursor()

  // Notify callback
  if (callbacks.onTrainingProgress) {
    callbacks.onTrainingProgress(currentMeasureIndex, repeatCount, targetRepeatCount)
  }
}

function validatePlayedNote(midiNote) {
  if (!osmdInstance || allNotes.length === 0) return false
  if (currentMeasureIndex >= allNotes.length) return false

  const measureData = allNotes[currentMeasureIndex]
  if (!measureData || !measureData.notes || measureData.notes.length === 0) return false

  const expectedNote = measureData.notes.find((n) => !n.played)
  if (!expectedNote) return false

  const expectedTimestamp = expectedNote.timestamp

  let foundIndex = -1
  for (let i = 0; i < measureData.notes.length; i++) {
    const noteData = measureData.notes[i]
    if (!noteData.played && noteData.timestamp === expectedTimestamp && noteData.midiNumber === midiNote) {
      foundIndex = i
      break
    }
  }

  if (foundIndex !== -1) {
    const noteData = measureData.notes[foundIndex]
    svgNote(noteData.note).classList.add('played-note')
    measureData.notes[foundIndex].played = true

    // Check if this is the first note of the measure
    const isFirstNoteOfMeasure = measureData.notes.filter((n) => n.played).length === 1

    if (isFirstNoteOfMeasure) {
      // Scroll to score title when first note of first measure is played
      if (currentMeasureIndex === 0) {
        const scoreContainer = document.getElementById('score')
        if (scoreContainer) {
          scoreContainer.scrollIntoView({ behavior: 'smooth', block: 'start' })
          // Store initial Y position
          const noteElement = svgNote(noteData.note)
          const bbox = noteElement.getBBox()
          lastStaffY = bbox.y
        }
      } else {
        // Check if we've moved to a new staff (Y position changed significantly)
        const noteElement = svgNote(noteData.note)
        const bbox = noteElement.getBBox()
        const currentY = bbox.y

        if (lastStaffY !== null && Math.abs(currentY - lastStaffY) > 50) {
          // We've moved to a new staff, scroll by one staff height
          const staffHeight = Math.abs(currentY - lastStaffY)
          window.scrollBy({ top: staffHeight, behavior: 'smooth' })
          lastStaffY = currentY
        }
      }
    }

    const allNotesPlayed = measureData.notes.every((note) => note.played)

    if (allNotesPlayed) {
      if (trainingMode) {
        if (currentRepetitionIsClean) {
          repeatCount++
        }
        if (callbacks.onTrainingProgress) {
          callbacks.onTrainingProgress(currentMeasureIndex, repeatCount, targetRepeatCount)
        }

        if (repeatCount >= targetRepeatCount) {
          if (currentMeasureIndex + 1 >= allNotes.length) {
            if (callbacks.onTrainingComplete) {
              callbacks.onTrainingComplete()
            }
          } else {
            setTimeout(() => {
              resetMeasureProgress()
              currentMeasureIndex++
              updateMeasureCursor()
              if (callbacks.onTrainingProgress) {
                callbacks.onTrainingProgress(currentMeasureIndex, repeatCount, targetRepeatCount)
              }
            }, 500)
          }
        } else {
          setTimeout(() => {
            resetMeasureProgress(false)
            if (callbacks.onTrainingProgress) {
              callbacks.onTrainingProgress(currentMeasureIndex, repeatCount, targetRepeatCount)
            }
          }, 500)
        }
      } else {
        if (currentMeasureIndex + 1 < allNotes.length) {
          currentMeasureIndex++
        } else {
          if (callbacks.onMeasureCompleted) {
            callbacks.onMeasureCompleted(currentMeasureIndex)
          }
        }
      }
    }
    return true
  } else {
    if (trainingMode) {
      currentRepetitionIsClean = false
    }
    const expectedNote = measureData.notes.find((n) => !n.played)
    if (expectedNote && callbacks.onNoteError) {
      callbacks.onNoteError(expectedNote.noteName, noteName(midiNote))
    }
    return false
  }
}

function svgNote(note) {
  return osmdInstance.rules.GNote(note).getSVGGElement()
}

function resetProgress() {
  if (!osmdInstance) return

  for (const measureData of allNotes) {
    for (const noteData of measureData.notes) {
      svgNote(noteData.note).classList.remove('played-note')
      noteData.played = false
    }
  }
  resetPlaybackState()
}

function clearScore() {
  osmdInstance = null
  allNotes = []
  trainingMode = false
  resetPlaybackState()
  const scoreContainer = document.getElementById('score')
  if (scoreContainer) {
    scoreContainer.innerHTML = ''
  }
  document.getElementById('musicxml-upload').value = ''
}
