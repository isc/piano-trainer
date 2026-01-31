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

// Reinforcement mode variables
let reinforcementMode = false
let reinforcementMeasures = [] // List of sourceMeasureIndex to reinforce
let reinforcementIndex = 0 // Current index in reinforcementMeasures

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
  onPlaythroughRestart: null,
  onReinforcementComplete: null,
}

// Hand selection: by default both hands are active
let activeHands = { right: true, left: true }

export function initMusicXML() {
  return {
    loadMusicXML,
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
        updateMeasureCursor()
      } else {
        measureClickRectangles.forEach((rect) => rect.classList.remove('selected'))
        document.getElementById('repeat-indicators')?.remove()
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
    restoreNoteStates,
    updateFingeringSVG,
    setReinforcementMode: (measures) => {
      if (!measures || measures.length === 0) return

      reinforcementMode = true
      reinforcementMeasures = measures.map((m) => m.sourceMeasureIndex)
      reinforcementIndex = 0

      // Enable training mode (resets repeatCount and currentRepetitionIsClean)
      trainingMode = true
      repeatCount = 0
      currentRepetitionIsClean = true

      // Jump to the first measure to reinforce
      const firstMeasure = reinforcementMeasures[0]
      const playbackIndex = allNotes.findIndex((m) => m.sourceMeasureIndex === firstMeasure)
      if (playbackIndex >= 0) {
        jumpToMeasure(playbackIndex)
        scrollToMeasure(playbackIndex)
      }
    },
  }
}

function resetReinforcementState() {
  reinforcementMode = false
  reinforcementMeasures = []
  reinforcementIndex = 0
}

function setCallbacks(cbs) {
  callbacks = { ...callbacks, ...cbs }
}

// Check if a note should be considered based on active hands
// Staff 0 = right hand, Staff 1+ = left hand
function isNoteActiveForHands(noteData) {
  return noteData.staffIndex === 0 ? activeHands.right : activeHands.left
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
  resetReinforcementState()
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

function renderScore() {
  if (!osmdInstance) return
  osmdInstance.render()
  extractNotesFromScore()
  setupMeasureClickHandlers()
  styleMeasureNumbers()
}

async function renderMusicXML(xmlContent) {
  try {
    const scoreContainer = document.getElementById('score')
    const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(scoreContainer, {
      drawPartNames: false,
    })
    await osmd.load(xmlContent)
    osmdInstance = osmd
    window.osmdInstance = osmd
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

function styleMeasureNumbers() {
  if (!osmdInstance?.graphic?.musicPages) return

  for (const page of osmdInstance.graphic.musicPages) {
    for (const system of page.MusicSystems || []) {
      for (const label of system.MeasureNumberLabels || []) {
        label.SVGNode?.classList.add('measure-number')
      }
    }
  }
}

function resetMeasureProgress(resetRepeatCount = true) {
  if (currentMeasureIndex >= allNotes.length) return

  const measureData = allNotes[currentMeasureIndex]
  if (!measureData) return

  for (const noteData of measureData.notes) {
    const notehead = svgNotehead(noteData)
    notehead?.classList.remove('played-note', 'active-note')
    noteData.played = false
    noteData.active = false
  }

  if (resetRepeatCount) repeatCount = 0
  currentRepetitionIsClean = true

  // Reset practice tracking for new attempt
  measureStartTime = Date.now()
  measureWrongNotes = 0
  callbacks.onMeasureStarted?.(measureData.sourceMeasureIndex)
}

// Reset the visual state (played-note class) for notes of a specific source measure
// This is used when repeating a measure due to repeat endings (voltas)
function resetSourceMeasureVisualState(sourceMeasureIndex) {
  for (const measureData of allNotes) {
    if (measureData.sourceMeasureIndex !== sourceMeasureIndex) continue
    for (const noteData of measureData.notes) {
      svgNotehead(noteData)?.classList.remove('played-note', 'active-note')
    }
  }
}

function updateMeasureCursor() {
  if (!osmdInstance) return

  document.getElementById('repeat-indicators')?.remove()

  if (!trainingMode || currentMeasureIndex >= allNotes.length) return

  measureClickRectangles.forEach((rect) => rect.classList.remove('selected'))

  const currentRect = measureClickRectangles[currentMeasureIndex]
  if (!currentRect) return

  currentRect.classList.add('selected')

  const measureData = allNotes[currentMeasureIndex]
  if (!measureData?.notes?.length) return

  const noteElements = measureData.notes.map((n) => svgNote(n.note))
  const svg = noteElements[0]?.ownerSVGElement
  if (svg) createRepeatIndicators(noteElements, svg)
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
  return noteElements
    .filter((el) => el?.getBBox)
    .map((el) => {
      try {
        return el.getBBox()
      } catch {
        return null
      }
    })
    .filter(Boolean)
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

  const rectsBySvg = new Map()

  allNotes.forEach((measureData, measureIndex) => {
    if (!measureData?.notes?.length) return

    const noteElements = measureData.notes.map((n) => svgNote(n.note))
    const boxes = getBoundingBoxesForNotes(noteElements)
    if (boxes.length === 0) return

    const svg = noteElements[0].ownerSVGElement
    if (!svg) return

    const bounds = calculateCombinedBounds(boxes)
    const rect = createMeasureRectangle(svg, bounds, measureIndex)
    rect.addEventListener('click', () => jumpToMeasure(measureIndex))

    if (!rectsBySvg.has(svg)) rectsBySvg.set(svg, [])
    rectsBySvg.get(svg).push(rect)
    measureClickRectangles.push(rect)
  })

  for (const [svg, rects] of rectsBySvg) {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    group.classList.add('measure-click-areas')
    rects.forEach((rect) => group.appendChild(rect))
    svg.insertBefore(group, svg.firstChild)
  }
}

function removeMeasureClickHandlers() {
  document.querySelectorAll('g.measure-click-areas').forEach((g) => g.remove())
  measureClickRectangles = []
}

function jumpToMeasure(measureIndex) {
  if (measureIndex < 0 || measureIndex >= allNotes.length) return
  currentMeasureIndex = measureIndex
  // Don't clear playedSourceMeasures - we want to track all measures played across jumps
  resetNotesFromIndex(measureIndex)
  resetMeasureProgress()
  updateMeasureCursor()
  updateRepeatIndicators()
  // Notify tracker that user is restarting from measure 0
  if (measureIndex === 0) {
    callbacks.onPlaythroughRestart?.()
  }
}

function scrollToMeasure(measureIndex) {
  const rect = measureClickRectangles[measureIndex]
  if (!rect) return

  const bbox = rect.getBoundingClientRect()
  const targetY = window.scrollY + bbox.top - window.innerHeight / 2 + bbox.height / 2
  window.scrollTo({ top: targetY, behavior: 'smooth' })
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

  if (matchingIndices.length === 0) {
    // Wrong note - mark repetition as dirty in training mode
    if (trainingMode) currentRepetitionIsClean = false

    // Initialize practice tracking on first wrong note if not already set
    if (measureStartTime === null) {
      measureStartTime = Date.now()
      measureWrongNotes = 0
      callbacks.onMeasureStarted?.(measureData.sourceMeasureIndex)
    }

    measureWrongNotes++
    callbacks.onWrongNote?.()

    const expected = activeNotes.find((n) => !n.played && !n.active)
    if (expected) callbacks.onNoteError?.(expected.noteName, noteName(midiNote))
    return false
  }

  // Mark matching notes as active (highlighted but not validated yet)
  for (const index of matchingIndices) {
    const noteData = measureData.notes[index]
    svgNotehead(noteData)?.classList.add('active-note')
    noteData.active = true
  }

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
    for (const noteData of notesAtTimestamp) {
      if (noteData.played) continue
      const notehead = svgNotehead(noteData)
      // Turn notes without visual noteheads (noteheadIndex = -1) won't have a notehead element
      notehead?.classList.remove('active-note')
      notehead?.classList.add('played-note')
      noteData.played = true
      noteData.active = false
    }

    handleNoteValidated(measureData, notesAtTimestamp[0], notesAtTimestamp.length)
  }

  return true
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
      svgNotehead(noteData)?.classList.remove('active-note')
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
        if (reinforcementMode) {
          reinforcementIndex++
          if (reinforcementIndex >= reinforcementMeasures.length) {
            // All reinforcement measures completed
            resetReinforcementState()
            callbacks.onReinforcementComplete?.()
          } else {
            // Go to the next measure to reinforce
            const nextSourceMeasure = reinforcementMeasures[reinforcementIndex]
            const nextPlaybackIndex = allNotes.findIndex((m) => m.sourceMeasureIndex === nextSourceMeasure)
            setTimeout(() => {
              resetMeasureProgress()
              jumpToMeasure(nextPlaybackIndex)
              scrollToMeasure(nextPlaybackIndex)
            }, TRAINING_RESET_DELAY_MS)
          }
        } else if (currentMeasureIndex + 1 >= allNotes.length) {
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
        // Only trigger completion if all unique source measures were played
        const allSourceMeasures = new Set(allNotes.map((m) => m.sourceMeasureIndex))
        const allMeasuresPlayed = [...allSourceMeasures].every((sm) => playedSourceMeasures.has(sm))
        if (allMeasuresPlayed) {
          callbacks.onScoreCompleted?.(currentMeasureIndex)
        }
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

function resetNotesFromIndex(fromIndex = 0) {
  for (let i = fromIndex; i < allNotes.length; i++) {
    const measureData = allNotes[i]
    if (!measureData) continue
    for (const noteData of measureData.notes) {
      const notehead = svgNotehead(noteData)
      if (notehead) {
        notehead.classList.remove('played-note', 'active-note')
      }
      noteData.played = false
      noteData.active = false
    }
  }
}

function resetProgress() {
  if (!osmdInstance) return
  resetNotesFromIndex()
  resetPlaybackState()
}

function setupFingeringClickHandlers(cbs) {
  if (!osmdInstance || allNotes.length === 0) return

  removeFingeringClickHandlers()

  for (const { notes } of allNotes) {
    for (const noteData of notes) {
      const notehead = svgNotehead(noteData)
      if (!notehead) continue

      const handler = (e) => {
        e.stopPropagation()
        cbs.onNoteClick?.(noteData)
      }
      notehead.addEventListener('click', handler)
      fingeringClickHandlers.push({ element: notehead, handler })
    }
  }
}

function removeFingeringClickHandlers() {
  for (const { element, handler } of fingeringClickHandlers) {
    element.removeEventListener('click', handler)
  }
  fingeringClickHandlers = []
}

// Restore note states from a saved state map (fingeringKey -> { played, active })
function restoreNoteStates(noteStates) {
  for (const { notes } of allNotes) {
    for (const noteData of notes) {
      const savedState = noteStates.get(noteData.fingeringKey)
      if (!savedState) continue

      noteData.played = savedState.played
      noteData.active = savedState.active

      svgNotehead(noteData)?.classList.toggle('played-note', savedState.played)
      svgNotehead(noteData)?.classList.toggle('active-note', savedState.active)
    }
  }
}

// Find noteData in allNotes by fingeringKey
function findNoteDataByKey(fingeringKey) {
  for (const { notes } of allNotes) {
    const found = notes.find((n) => n.fingeringKey === fingeringKey)
    if (found) return found
  }
  return null
}

// Find the FingeringEntry for a note by its fingeringKey
// fingeringKey format: measureNumber:staffIndex:voiceIndex:noteIndex
function findFingeringEntry(fingeringKey) {
  if (!osmdInstance?.graphic?.MeasureList) return null

  const [measureNumber, staffIndex] = fingeringKey.split(':').map(Number)

  const sourceMeasures = osmdInstance.Sheet.SourceMeasures
  const sourceMeasureIndex = sourceMeasures.findIndex((m) => m.MeasureNumber === measureNumber)
  if (sourceMeasureIndex < 0) return null

  const graphicalMeasure = osmdInstance.graphic.MeasureList[sourceMeasureIndex]?.[staffIndex]
  if (!graphicalMeasure) return null

  const targetNoteData = findNoteDataByKey(fingeringKey)
  if (!targetNoteData) return null

  for (const staffEntry of graphicalMeasure.staffEntries || []) {
    // Collect all graphical notes in this staff entry
    const graphicalNotes = []
    for (const gve of staffEntry.graphicalVoiceEntries || []) {
      for (const gn of gve.notes || []) {
        if (gn.sourceNote?.Pitch) {
          graphicalNotes.push(gn)
        }
      }
    }

    // Find our target note among them
    const targetGn = graphicalNotes.find((gn) => gn.sourceNote === targetNoteData.note)
    if (!targetGn) continue

    // For chords with multiple fingerings, OSMD orders FingeringEntries by pitch (lowest to highest)
    // Sort notes by pitch to find the correct index
    graphicalNotes.sort((a, b) => a.sourceNote.Pitch.getHalfTone() - b.sourceNote.Pitch.getHalfTone())
    const noteIndex = graphicalNotes.indexOf(targetGn)

    return staffEntry.FingeringEntries?.[noteIndex] || null
  }

  return null
}

// Update an existing fingering's SVG directly without re-rendering
// Returns true if successful, false if no existing fingering found
function updateFingeringSVG(fingeringKey, newFinger) {
  const fingeringEntry = findFingeringEntry(fingeringKey)
  const textEl = fingeringEntry?.SVGNode?.querySelector('text')
  if (!textEl) return false

  const fingerText = newFinger.toString()
  textEl.textContent = fingerText

  // Also update the label text for consistency
  if (fingeringEntry.label) {
    fingeringEntry.label.text = fingerText
  }

  return true
}

