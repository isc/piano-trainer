import { NOTE_NAMES, noteName } from './midi.js'

let osmdInstance = null
let allNotes = []
let currentMeasureIndex = 0
let trainingMode = false
let targetRepeatCount = 3
let repeatCount = 0
let currentRepetitionIsClean = true
let lastStaffY = null
let currentSystemIndex = null
let measureClickRectangles = []

// Set of MIDI note numbers currently held down by the player
let heldMidiNotes = new Set()

// Padding around measure notes for clickable area
const MEASURE_CLICK_PADDING = 15

// Delay in ms before resetting measure progress in training mode
const TRAINING_RESET_DELAY_MS = 200

let callbacks = {
  onScoreCompleted: null,
  onNoteError: null,
  onTrainingProgress: null,
  onTrainingComplete: null,
}

export function initMusicXML() {
  return {
    loadMusicXML,
    loadFromURL,
    renderScore,
    renderMusicXML,
    extractNotesFromScore,
    activateNote,
    deactivateNote,
    resetProgress,
    clearScore,
    setCallbacks,
    getOsmdInstance: () => osmdInstance,
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

      if (enabled) {
        setupMeasureClickHandlers()
        updateMeasureCursor()
      } else {
        removeMeasureClickHandlers()
        // Clean up repeat indicators
        const existingIndicators = document.getElementById('repeat-indicators')
        existingIndicators?.remove()
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
  currentSystemIndex = null
  heldMidiNotes.clear()
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

    await renderMusicXML(xmlContent)
  } catch (error) {
    console.error('Erreur lors du chargement du MusicXML:', error)
    alert('Erreur lors du chargement du fichier MusicXML')
  }
}

async function loadFromURL(url) {
  try {
    // Clear previous score before loading new one
    if (osmdInstance) {
      const scoreContainer = document.getElementById('score')
      if (scoreContainer) {
        scoreContainer.innerHTML = ''
      }
    }

    const scoreContainer = document.getElementById('score')
    const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(scoreContainer)

    // OSMD can load directly from URL (supports .mxl compressed files)
    await osmd.load(url)

    osmdInstance = osmd
    window.osmdInstance = osmd
  } catch (error) {
    console.error('Erreur lors du chargement du MusicXML depuis URL:', error)
    alert('Erreur lors du chargement de la partition')
  }
}

function renderScore() {
  if (!osmdInstance) return
  osmdInstance.render()
  extractNotesFromScore()
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
}

function extractFromSourceMeasures(sourceMeasures) {
  sourceMeasures.forEach((measure, measureIndex) => {
    const measureNotes = []

    measure.verticalSourceStaffEntryContainers.forEach((container) => {
      if (container.staffEntries) {
        for (let staffIndex = 0; staffIndex < container.staffEntries.length; staffIndex++) {
          const staffEntry = container.staffEntries[staffIndex]
          if (!staffEntry?.voiceEntries) continue
          for (const voiceEntry of staffEntry.voiceEntries) {
            if (!voiceEntry.notes) continue
            for (let noteIndex = 0; noteIndex < voiceEntry.notes.length; noteIndex++) {
              const note = voiceEntry.notes[noteIndex]
              if (!note.pitch) continue
              const noteInfo = pitchToMidiFromSourceNote(note.pitch)
              // Check if this note is a tie continuation (not the start of the tie)
              const isTieContinuation = note.NoteTie && note.NoteTie.StartNote !== note
              measureNotes.push({
                note,
                midiNumber: noteInfo.midiNote,
                noteName: noteInfo.noteName,
                timestamp: measureIndex + voiceEntry.timestamp.realValue,
                measureIndex,
                active: false,
                played: false,
                isTieContinuation,
                // Index of the notehead within the chord (for targeting individual noteheads in SVG)
                noteheadIndex: noteIndex,
                noteheadCount: voiceEntry.notes.filter((n) => n.pitch).length,
              })
            }
          }
        }
      }
    })

    if (measureNotes.length > 0) {
      allNotes.push({
        measureIndex,
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
    svgNotehead(noteData).classList.remove('played-note')
    svgNotehead(noteData).classList.remove('active-note')
    noteData.played = false
    noteData.active = false
  }

  if (resetRepeatCount) {
    repeatCount = 0
  }
  currentRepetitionIsClean = true
}

function updateMeasureCursor() {
  if (!osmdInstance) return

  // Remove existing repeat indicators before creating new ones
  const existingIndicators = document.getElementById('repeat-indicators')
  existingIndicators?.remove()

  if (trainingMode && currentMeasureIndex < allNotes.length) {
    // Remove 'selected' class from all measure rectangles
    measureClickRectangles.forEach((rect) => {
      rect.classList.remove('selected')
    })

    // Add 'selected' class to current measure rectangle
    if (currentMeasureIndex < measureClickRectangles.length) {
      const currentRect = measureClickRectangles[currentMeasureIndex]
      if (currentRect) {
        currentRect.classList.add('selected')

        const measureData = allNotes[currentMeasureIndex]
        if (measureData && measureData.notes && measureData.notes.length > 0) {
          const noteElements = measureData.notes.map((n) => svgNote(n.note))
          const svg = noteElements[0]?.ownerSVGElement
          if (svg) {
            createRepeatIndicators(noteElements, svg)
          }
        }
      }
    }
  }
}

function createRepeatIndicators(noteElements, svg) {
  const boxes = getBoundingBoxesForNotes(noteElements)

  if (boxes.length === 0) return

  const bounds = calculateCombinedBounds(boxes)
  const centerX = (bounds.minX + bounds.maxX) / 2
  const circleY = bounds.minY - 40
  const circleRadius = 6
  const circleSpacing = 18

  const indicatorsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  indicatorsGroup.id = 'repeat-indicators'

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

function updateRepeatIndicators() {
  if (!osmdInstance || !trainingMode) return

  const indicators = document.querySelectorAll('.repeat-indicator')
  indicators.forEach((circle, index) => {
    circle.classList.toggle('filled', index < repeatCount)
  })
}

function getBoundingBoxesForNotes(noteElements) {
  const boxes = []
  for (const el of noteElements) {
    try {
      if (el && el.getBBox) {
        boxes.push(el.getBBox())
      }
    } catch (error) {
      console.warn('Failed to get bounding box for note element:', error)
    }
  }
  return boxes
}

function calculateCombinedBounds(boxes) {
  return {
    minX: Math.min(...boxes.map((b) => b.x)),
    minY: Math.min(...boxes.map((b) => b.y)),
    maxX: Math.max(...boxes.map((b) => b.x + b.width)),
    maxY: Math.max(...boxes.map((b) => b.y + b.height)),
  }
}

function createMeasureRectangle(svg, bounds, measureIndex) {
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect.classList.add('measure-click-area')
  rect.setAttribute('x', bounds.minX - MEASURE_CLICK_PADDING)
  rect.setAttribute('y', bounds.minY - MEASURE_CLICK_PADDING)
  rect.setAttribute('width', bounds.maxX - bounds.minX + MEASURE_CLICK_PADDING * 1.5)
  rect.setAttribute('height', bounds.maxY - bounds.minY + MEASURE_CLICK_PADDING * 1.5)
  rect.dataset.measureIndex = measureIndex

  return rect
}

function setupMeasureClickHandlers() {
  if (!osmdInstance || allNotes.length === 0) return

  removeMeasureClickHandlers()

  allNotes.forEach((measureData, measureIndex) => {
    if (!measureData || !measureData.notes || measureData.notes.length === 0) return

    const noteElements = measureData.notes.map((n) => svgNote(n.note))
    if (noteElements.length === 0) return

    const boxes = getBoundingBoxesForNotes(noteElements)
    if (boxes.length === 0) return

    const bounds = calculateCombinedBounds(boxes)

    const svg = noteElements[0].ownerSVGElement
    if (!svg) return

    const rect = createMeasureRectangle(svg, bounds, measureIndex)
    rect.addEventListener('click', () => jumpToMeasure(measureIndex))

    svg.appendChild(rect)
    measureClickRectangles.push(rect)
  })
}

function removeMeasureClickHandlers() {
  measureClickRectangles.forEach((rect) => {
    rect.parentNode?.removeChild(rect)
  })

  measureClickRectangles = []
}

function jumpToMeasure(measureIndex) {
  if (measureIndex < 0 || measureIndex >= allNotes.length) return
  resetMeasureProgress()
  currentMeasureIndex = measureIndex
  updateMeasureCursor()

  // Notify callback
  callbacks.onTrainingProgress?.(currentMeasureIndex, repeatCount, targetRepeatCount)
}

// Activate a note when pressed (Note ON) - for polyphonic validation
function activateNote(midiNote) {
  // Track all held notes globally (for tie continuation validation)
  heldMidiNotes.add(midiNote)

  if (!osmdInstance || allNotes.length === 0) return false
  if (currentMeasureIndex >= allNotes.length) return false

  const measureData = allNotes[currentMeasureIndex]
  if (!measureData || !measureData.notes || measureData.notes.length === 0) return false

  const expectedNote = measureData.notes.find((n) => !n.played && !n.active)
  if (!expectedNote) return false

  const expectedTimestamp = expectedNote.timestamp

  // Find all notes at the expected timestamp with the matching MIDI number (not yet played or active)
  const matchingIndices = []
  for (let i = 0; i < measureData.notes.length; i++) {
    const noteData = measureData.notes[i]
    if (
      !noteData.played &&
      !noteData.active &&
      noteData.timestamp === expectedTimestamp &&
      noteData.midiNumber === midiNote
    ) {
      matchingIndices.push(i)
    }
  }

  if (matchingIndices.length > 0) {
    // Mark matching notes as active (highlighted but not validated yet)
    matchingIndices.forEach((index) => {
      const noteData = measureData.notes[index]
      svgNotehead(noteData).classList.add('active-note')
      measureData.notes[index].active = true
    })

    // Check if ALL notes at this timestamp are now active
    // For tie continuations, check if the MIDI note is currently held instead of requiring activation
    const notesAtTimestamp = measureData.notes.filter((n) => n.timestamp === expectedTimestamp)
    const allActiveAtTimestamp = notesAtTimestamp.every(
      (n) => n.played || n.active || (n.isTieContinuation && heldMidiNotes.has(n.midiNumber)),
    )

    if (allActiveAtTimestamp) {
      // All polyphonic notes are held together - validate them all
      notesAtTimestamp.forEach((noteData) => {
        if (!noteData.played) {
          svgNotehead(noteData).classList.remove('active-note')
          svgNotehead(noteData).classList.add('played-note')
          noteData.played = true
          noteData.active = false
        }
      })

      // Handle scroll and measure completion (use first validated note)
      const firstValidatedNote = notesAtTimestamp[0]
      handleNoteValidated(measureData, firstValidatedNote, notesAtTimestamp.length)
    }

    return true
  } else {
    // Wrong note - mark repetition as dirty in training mode
    if (trainingMode) {
      currentRepetitionIsClean = false
    }
    const expected = measureData.notes.find((n) => !n.played && !n.active)
    if (expected) {
      callbacks.onNoteError?.(expected.noteName, noteName(midiNote))
    }
    return false
  }
}

// Deactivate a note when released (Note OFF) - for polyphonic validation
function deactivateNote(midiNote) {
  // Remove from held notes set
  heldMidiNotes.delete(midiNote)

  if (!osmdInstance || allNotes.length === 0) return
  if (currentMeasureIndex >= allNotes.length) return

  const measureData = allNotes[currentMeasureIndex]
  if (!measureData || !measureData.notes || measureData.notes.length === 0) return

  // Find active notes with this MIDI number and deactivate them
  for (const noteData of measureData.notes) {
    if (noteData.active && noteData.midiNumber === midiNote) {
      svgNotehead(noteData).classList.remove('active-note')
      noteData.active = false
    }
  }
}

// Helper function to handle post-validation logic (scroll, measure completion)
function handleNoteValidated(measureData, noteData, validatedCount) {
  // Check if this was the first timestamp of the measure
  const playedCount = measureData.notes.filter((n) => n.played).length
  const isFirstNoteOfMeasure = playedCount === validatedCount

  if (isFirstNoteOfMeasure) {
    const noteSystemIndex = getSystemIndexForNote(noteData.note)

    // Scroll to score title when first note of first measure is played
    if (currentMeasureIndex === 0) {
      const scoreContainer = document.getElementById('score')
      if (scoreContainer) {
        scoreContainer.scrollIntoView({ behavior: 'smooth', block: 'start' })
        currentSystemIndex = noteSystemIndex
        const noteElement = svgNote(noteData.note)
        const bbox = noteElement.getBBox()
        lastStaffY = bbox.y
      }
    } else {
      // Only scroll if we've moved to a new visual system (line)
      if (currentSystemIndex !== null && noteSystemIndex !== currentSystemIndex) {
        const noteElement = svgNote(noteData.note)
        const bbox = noteElement.getBBox()
        const currentY = bbox.y

        if (lastStaffY !== null) {
          const scrollAmount = currentY - lastStaffY
          window.scrollBy({ top: scrollAmount, behavior: 'smooth' })
        }

        currentSystemIndex = noteSystemIndex
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
      callbacks.onTrainingProgress?.(currentMeasureIndex, repeatCount, targetRepeatCount)

      if (repeatCount >= targetRepeatCount) {
        if (currentMeasureIndex + 1 >= allNotes.length) {
          callbacks.onTrainingComplete?.()
        } else {
          setTimeout(() => {
            resetMeasureProgress()
            currentMeasureIndex++
            updateMeasureCursor()
            callbacks.onTrainingProgress?.(currentMeasureIndex, repeatCount, targetRepeatCount)
          }, TRAINING_RESET_DELAY_MS)
        }
      } else {
        setTimeout(() => {
          resetMeasureProgress(false)
          callbacks.onTrainingProgress?.(currentMeasureIndex, repeatCount, targetRepeatCount)
        }, TRAINING_RESET_DELAY_MS)
      }
    } else {
      if (currentMeasureIndex + 1 < allNotes.length) {
        currentMeasureIndex++
      } else {
        callbacks.onScoreCompleted?.(currentMeasureIndex)
      }
    }
  }
}

function svgNote(note) {
  return osmdInstance.rules.GNote(note).getSVGGElement()
}

// Get the specific notehead element for a note (handles chords correctly)
function svgNotehead(noteData) {
  const svgGroup = svgNote(noteData.note)
  if (!svgGroup) return null

  const noteheads = svgGroup.querySelectorAll('.vf-notehead')
  return noteheads[noteData.noteheadIndex]
}

function getSystemIndexForNote(note) {
  try {
    // Navigate up the OSMD hierarchy: note → parentVoiceEntry → parentStaffEntry → parentMeasure
    const graphicalNote = osmdInstance.rules.GNote(note)
    const parentMeasure = graphicalNote.parentVoiceEntry.parentStaffEntry.parentMeasure

    // Find which MusicSystem contains this measure (MusicSystems are in the first music page)
    const musicSystems = osmdInstance.graphic.musicPages[0].MusicSystems

    // Search for the measure in all systems
    for (let i = 0; i < musicSystems.length; i++) {
      const system = musicSystems[i]
      if (!system.graphicalMeasures) continue

      // graphicalMeasures is a 2D array: [staffIndex][measureIndex]
      for (const measureList of system.graphicalMeasures) {
        if (measureList?.includes(parentMeasure)) {
          return i
        }
      }
    }

    return 0
  } catch (error) {
    console.warn('Failed to get system index for note:', error)
    return 0
  }
}

function resetProgress() {
  if (!osmdInstance) return

  for (const measureData of allNotes) {
    for (const noteData of measureData.notes) {
      svgNotehead(noteData).classList.remove('played-note')
      svgNotehead(noteData).classList.remove('active-note')
      noteData.played = false
      noteData.active = false
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
