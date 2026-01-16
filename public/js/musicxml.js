import { noteName } from './midi.js'
import { extractNotesFromScore as extractNotes } from './noteExtraction.js'

let osmdInstance = null
let allNotes = []
let playbackSequence = [] // Ordered list of source measure indices for playback (handles repeats)
let currentMeasureIndex = 0
let trainingMode = false
let targetRepeatCount = 3
let repeatCount = 0
let currentRepetitionIsClean = true
let lastStaffY = null
let currentSystemIndex = null
let measureClickRectangles = []
let playedSourceMeasures = new Set() // Track source measures that have been fully played

// Set of MIDI note numbers currently held down by the player
let heldMidiNotes = new Set()

// Fingering click handlers
let fingeringClickHandlers = []

// Practice tracking variables
let measureStartTime = null
let measureWrongNotes = 0

// Padding around measure notes for clickable area
const MEASURE_CLICK_PADDING = 15

// Delay in ms before resetting measure progress in training mode
const TRAINING_RESET_DELAY_MS = 200

let callbacks = {
  onScoreCompleted: null,
  onNoteError: null,
  onTrainingComplete: null,
  onMeasureStarted: null,
  onMeasureCompleted: null,
  onWrongNote: null,
}

// Hand selection: by default both hands are active
let activeHands = { right: true, left: true }

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
    setCallbacks,
    setActiveHands: (hands) => {
      activeHands = { ...activeHands, ...hands }
    },
    getOsmdInstance: () => osmdInstance,
    getAllNotes: () => allNotes,
    getScoreMetadata: () => ({
      title: osmdInstance?.Sheet?.Title?.text || null,
      composer: osmdInstance?.Sheet?.Composer?.text || null,
      totalMeasures: new Set(allNotes.map((m) => m.sourceMeasureIndex)).size,
    }),
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
    setupFingeringClickHandlers,
    removeFingeringClickHandlers,
  }
}

function setCallbacks(cbs) {
  callbacks = { ...callbacks, ...cbs }
}

// Check if a note should be considered based on active hands
function isNoteActiveForHands(noteData) {
  // Staff 0 = right hand, Staff 1+ = left hand
  if (noteData.staffIndex === 0) {
    return activeHands.right
  }
  return activeHands.left
}

function resetPlaybackState() {
  currentMeasureIndex = 0
  repeatCount = 0
  currentRepetitionIsClean = true
  lastStaffY = null
  currentSystemIndex = null
  heldMidiNotes.clear()
  playedSourceMeasures.clear()
  measureStartTime = null
  measureWrongNotes = 0
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
  trainingMode = false
  resetPlaybackState()

  const result = extractNotes(osmdInstance)
  allNotes = result.allNotes
  playbackSequence = result.playbackSequence
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

  // Reset practice tracking for new attempt
  measureStartTime = Date.now()
  measureWrongNotes = 0
  callbacks.onMeasureStarted?.(measureData.sourceMeasureIndex)
}

// Reset the visual state (played-note class) for notes of a specific source measure
// This is used when repeating a measure due to repeat endings (voltas)
function resetSourceMeasureVisualState(sourceMeasureIndex) {
  // Find all playback entries that reference this source measure and reset their SVG visual state
  for (const measureData of allNotes) {
    if (measureData.sourceMeasureIndex === sourceMeasureIndex) {
      for (const noteData of measureData.notes) {
        const notehead = svgNotehead(noteData)
        if (notehead) {
          notehead.classList.remove('played-note')
          notehead.classList.remove('active-note')
        }
      }
    }
  }
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

    // Store the playback index (measureIndex) for click handling
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
  updateRepeatIndicators()
}

// Activate a note when pressed (Note ON) - for polyphonic validation
function activateNote(midiNote) {
  // Track all held notes globally (for tie continuation validation)
  heldMidiNotes.add(midiNote)

  if (!osmdInstance || allNotes.length === 0) return false
  if (currentMeasureIndex >= allNotes.length) return false

  const measureData = allNotes[currentMeasureIndex]
  if (!measureData || !measureData.notes || measureData.notes.length === 0) return false

  // Filter notes by active hands
  const activeNotes = measureData.notes.filter((n) => isNoteActiveForHands(n))
  const expectedNote = activeNotes.find((n) => !n.played && !n.active)
  if (!expectedNote) return false

  const expectedTimestamp = expectedNote.timestamp

  // Find all notes at the expected timestamp with the matching MIDI number (not yet played or active)
  // Only consider notes from active hands
  const matchingIndices = []
  for (let i = 0; i < measureData.notes.length; i++) {
    const noteData = measureData.notes[i]
    if (
      isNoteActiveForHands(noteData) &&
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

    // Check if ALL notes at this timestamp are now active (only for active hands)
    // For tie continuations, check if the MIDI note is currently held instead of requiring activation
    const notesAtTimestamp = measureData.notes.filter(
      (n) => n.timestamp === expectedTimestamp && isNoteActiveForHands(n),
    )
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
    // Track wrong note for practice statistics
    measureWrongNotes++
    callbacks.onWrongNote?.()

    const expected = activeNotes.find((n) => !n.played && !n.active)
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

// Helper function to scroll to next measure if it's on a different system
function scrollToNextMeasureIfNeeded(currentIndex, nextIndex) {
  if (nextIndex >= allNotes.length) return

  const nextMeasureData = allNotes[nextIndex]
  if (!nextMeasureData || !nextMeasureData.notes || nextMeasureData.notes.length === 0) return

  const nextMeasureFirstNote = nextMeasureData.notes[0].note
  const nextSystemIndex = getSystemIndexForNote(nextMeasureFirstNote)

  // Scroll if we're moving to a new system
  if (currentSystemIndex !== null && nextSystemIndex !== currentSystemIndex) {
    const nextNoteElement = svgNote(nextMeasureFirstNote)
    const nextBbox = nextNoteElement.getBBox()
    const nextY = nextBbox.y

    if (lastStaffY !== null) {
      const scrollAmount = nextY - lastStaffY
      window.scrollBy({ top: scrollAmount, behavior: 'smooth' })
    }

    currentSystemIndex = nextSystemIndex
    lastStaffY = nextY
  }
}

// Helper function to handle post-validation logic (scroll, measure completion)
function handleNoteValidated(measureData, noteData, validatedCount) {
  // Initialize system tracking on first note of first measure
  const playedCount = measureData.notes.filter((n) => n.played).length
  const isFirstNoteOfMeasure = playedCount === validatedCount

  if (isFirstNoteOfMeasure) {
    // Initialize/update system tracking on first note of each measure
    const noteSystemIndex = getSystemIndexForNote(noteData.note)
    currentSystemIndex = noteSystemIndex
    const noteElement = svgNote(noteData.note)
    const bbox = noteElement.getBBox()
    lastStaffY = bbox.y

    // Initialize practice tracking if not already set
    if (measureStartTime === null) {
      measureStartTime = Date.now()
      measureWrongNotes = 0
      callbacks.onMeasureStarted?.(measureData.sourceMeasureIndex)
    }
  }

  // Only consider notes from active hands when checking if measure is complete
  const activeNotesInMeasure = measureData.notes.filter((n) => isNoteActiveForHands(n))
  const allNotesPlayed = activeNotesInMeasure.every((note) => note.played)

  if (allNotesPlayed) {
    // Notify practice tracking that measure is completed
    const attemptDuration = measureStartTime ? Date.now() - measureStartTime : 0
    callbacks.onMeasureCompleted?.({
      sourceMeasureIndex: measureData.sourceMeasureIndex,
      durationMs: attemptDuration,
      wrongNotes: measureWrongNotes,
      clean: currentRepetitionIsClean,
    })

    if (trainingMode) {
      if (currentRepetitionIsClean) {
        repeatCount++
      }
      updateRepeatIndicators()

      if (repeatCount >= targetRepeatCount) {
        if (currentMeasureIndex + 1 >= allNotes.length) {
          callbacks.onTrainingComplete?.()
          setTimeout(() => {
            resetProgress()
          }, TRAINING_RESET_DELAY_MS)
        } else {
          setTimeout(() => {
            resetMeasureProgress()
            // Scroll to next measure before incrementing
            scrollToNextMeasureIfNeeded(currentMeasureIndex, currentMeasureIndex + 1)
            currentMeasureIndex++
            updateMeasureCursor()
            updateRepeatIndicators()
          }, TRAINING_RESET_DELAY_MS)
        }
      } else {
        setTimeout(() => {
          resetMeasureProgress(false)
          updateRepeatIndicators()
        }, TRAINING_RESET_DELAY_MS)
      }
    } else {
      // Mark current source measure as played
      const currentSourceMeasure = measureData.sourceMeasureIndex
      playedSourceMeasures.add(currentSourceMeasure)

      if (currentMeasureIndex + 1 < allNotes.length) {
        // Check if next measure's source has been played before (repeat)
        const nextSourceMeasure = allNotes[currentMeasureIndex + 1].sourceMeasureIndex
        if (playedSourceMeasures.has(nextSourceMeasure)) {
          // Check if current measure will be replayed (appears later in playback sequence)
          // If yes (simple repeat), reset it. If no (volta 1 ending), don't reset it.
          const currentMeasureWillBeReplayed = allNotes
            .slice(currentMeasureIndex + 1)
            .some((m) => m.sourceMeasureIndex === currentSourceMeasure)

          // Reset visual state for source measures that will be replayed
          for (const sourceMeasureIndex of playedSourceMeasures) {
            const shouldReset =
              sourceMeasureIndex >= nextSourceMeasure &&
              (sourceMeasureIndex < currentSourceMeasure ||
                (sourceMeasureIndex === currentSourceMeasure && currentMeasureWillBeReplayed))
            if (shouldReset) {
              resetSourceMeasureVisualState(sourceMeasureIndex)
            }
          }
        }
        // Scroll to next measure before incrementing
        scrollToNextMeasureIfNeeded(currentMeasureIndex, currentMeasureIndex + 1)
        currentMeasureIndex++
        // Reset practice tracking for next measure in free mode
        measureStartTime = null
        measureWrongNotes = 0
      } else {
        callbacks.onScoreCompleted?.(currentMeasureIndex)
        setTimeout(() => {
          resetProgress()
        }, TRAINING_RESET_DELAY_MS)
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
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// Setup click handlers for fingering annotation
function setupFingeringClickHandlers(cbs) {
  if (!osmdInstance || allNotes.length === 0) return

  removeFingeringClickHandlers()

  // Build a map from SVG notehead element to noteData for quick lookup
  const noteheadToData = new Map()

  for (const measureData of allNotes) {
    for (const noteData of measureData.notes) {
      const notehead = svgNotehead(noteData)
      if (notehead) {
        noteheadToData.set(notehead, noteData)

        // Add click handler to notehead
        const handler = (e) => {
          e.stopPropagation()
          cbs.onNoteClick?.(noteData)
        }
        notehead.addEventListener('click', handler)
        fingeringClickHandlers.push({ element: notehead, handler })
      }
    }
  }

  // Also handle clicks on existing fingering elements
  const scoreContainer = document.getElementById('score')
  if (scoreContainer) {
    const fingerings = scoreContainer.querySelectorAll('.vf-fingering')
    for (const fingering of fingerings) {
      // Find the associated noteData by traversing up to the note group
      // OSMD structure: vf-fingering is inside a group, sibling to vf-notehead
      const parentGroup = fingering.closest('g')
      if (parentGroup) {
        // Look for a sibling notehead in the same parent group or ancestors
        let noteGroup = parentGroup
        let noteData = null

        // Walk up to find the note's SVG group and match with noteheadToData
        while (noteGroup && !noteData) {
          const noteheads = noteGroup.querySelectorAll('.vf-notehead')
          for (const nh of noteheads) {
            if (noteheadToData.has(nh)) {
              noteData = noteheadToData.get(nh)
              break
            }
          }
          noteGroup = noteGroup.parentElement
        }

        if (noteData) {
          const handler = (e) => {
            e.stopPropagation()
            cbs.onFingeringClick?.(noteData)
          }
          fingering.addEventListener('click', handler)
          fingeringClickHandlers.push({ element: fingering, handler })
        }
      }
    }
  }
}

function removeFingeringClickHandlers() {
  for (const { element, handler } of fingeringClickHandlers) {
    element.removeEventListener('click', handler)
  }
  fingeringClickHandlers = []
}

