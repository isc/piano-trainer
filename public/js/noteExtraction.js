import { NOTE_NAMES } from './midi.js'

// Ornament types from OSMD
const OrnamentEnum = {
  Trill: 0,
  Turn: 1,
  InvertedTurn: 2,
  DelayedTurn: 3,
  DelayedInvertedTurn: 4,
  Mordent: 5,
  InvertedMordent: 6,
}

// Accidental types from OSMD
const AccidentalEnum = {
  SHARP: 0,
  FLAT: 1,
  NONE: 2,
  NATURAL: 3,
  DOUBLESHARP: 4,
  DOUBLEFLAT: 5,
}

// Diatonic note semitone offsets from C (C=0, D=2, E=4, F=5, G=7, A=9, B=11)
// OSMD's fundamentalNote is the semitone offset of the note name (ignoring accidentals)
const DIATONIC_NOTES = [0, 2, 4, 5, 7, 9, 11] // C, D, E, F, G, A, B

// Find the index in DIATONIC_NOTES for a given fundamentalNote value
function getDiatonicIndex(fundamentalNote) {
  return DIATONIC_NOTES.indexOf(fundamentalNote)
}

// Calculate diatonic interval to adjacent note based on pitch.fundamentalNote
// This follows the scale rather than using fixed semitone offsets
function getDiatonicOffset(pitch, direction) {
  const fundamentalNote = pitch?.fundamentalNote
  if (!pitch || fundamentalNote === undefined) return direction > 0 ? 2 : -2

  const currentHalfTone = pitch.halfTone
  const octave = Math.floor(currentHalfTone / 12)

  // Find current note's position in diatonic scale
  const currentIndex = getDiatonicIndex(fundamentalNote)
  if (currentIndex === -1) return direction > 0 ? 2 : -2 // fallback if not found

  // Calculate next/previous diatonic note index
  const adjacentIndex = direction > 0
    ? (currentIndex + 1) % 7
    : (currentIndex + 6) % 7 // +6 is same as -1 mod 7

  // Calculate halfTone for the adjacent diatonic note
  let adjacentHalfTone = octave * 12 + DIATONIC_NOTES[adjacentIndex]

  // Handle octave wrap (B→C goes up, C→B goes down)
  if (direction > 0 && adjacentHalfTone <= currentHalfTone) {
    adjacentHalfTone += 12
  } else if (direction < 0 && adjacentHalfTone >= currentHalfTone) {
    adjacentHalfTone -= 12
  }

  return adjacentHalfTone - currentHalfTone
}

// Check if an accidental is explicitly specified (not undefined or NONE)
function hasExplicitAccidental(accidental) {
  return accidental !== undefined && accidental !== AccidentalEnum.NONE
}

// Calculate upper/lower MIDI notes for ornaments
// When accidentals are explicitly marked, they modify the note chromatically:
// - FLAT lowers the note (upper: +1, lower: -2)
// - SHARP/NATURAL raises the note (upper: +2, lower: -1)
// Without explicit accidentals, use diatonic intervals (follow the scale)
function getOrnamentAuxiliaryNotes(mainMidi, ornamentContainer, pitch) {
  const { AccidentalAbove, AccidentalBelow } = ornamentContainer

  let upperMidi, lowerMidi

  if (hasExplicitAccidental(AccidentalAbove)) {
    upperMidi = AccidentalAbove === AccidentalEnum.FLAT ? mainMidi + 1 : mainMidi + 2
  } else {
    upperMidi = mainMidi + getDiatonicOffset(pitch, 1)
  }

  if (hasExplicitAccidental(AccidentalBelow)) {
    lowerMidi = AccidentalBelow === AccidentalEnum.FLAT ? mainMidi - 2 : mainMidi - 1
  } else {
    lowerMidi = mainMidi + getDiatonicOffset(pitch, -1)
  }

  return { upperMidi, lowerMidi }
}

// Build the MIDI note sequence for an ornament
// Returns { sequence, flag } where flag is the property name to mark expanded notes
function getOrnamentSequence(mainMidi, ornamentContainer, pitch) {
  const ornamentType = ornamentContainer.GetOrnament

  const { upperMidi, lowerMidi } = getOrnamentAuxiliaryNotes(mainMidi, ornamentContainer, pitch)

  // Turn ornaments: 4-5 notes alternating around the main note
  switch (ornamentType) {
    case OrnamentEnum.Turn:
      return { sequence: [upperMidi, mainMidi, lowerMidi, mainMidi], flag: 'isTurnNote' }
    case OrnamentEnum.InvertedTurn:
      return { sequence: [lowerMidi, mainMidi, upperMidi, mainMidi], flag: 'isTurnNote' }
    case OrnamentEnum.DelayedTurn:
      return { sequence: [mainMidi, upperMidi, mainMidi, lowerMidi, mainMidi], flag: 'isTurnNote' }
    case OrnamentEnum.DelayedInvertedTurn:
      return { sequence: [mainMidi, lowerMidi, mainMidi, upperMidi, mainMidi], flag: 'isTurnNote' }
    // Mordent ornaments: 3 notes with a quick auxiliary note
    case OrnamentEnum.Mordent:
      return { sequence: [mainMidi, lowerMidi, mainMidi], flag: 'isMordentNote' }
    case OrnamentEnum.InvertedMordent:
      return { sequence: [mainMidi, upperMidi, mainMidi], flag: 'isMordentNote' }
    default:
      return null
  }
}

// Expand ornament notes (turns and mordents) into their constituent notes
function expandOrnamentNotes(measureNotes) {
  const ORNAMENT_NOTE_OFFSET = 0.00001
  const expandedNotes = []

  for (const noteData of measureNotes) {
    const ornamentContainer = noteData.voiceEntry?.OrnamentContainer
    const pitch = noteData.note?.pitch
    const ornamentInfo = ornamentContainer ? getOrnamentSequence(noteData.midiNumber, ornamentContainer, pitch) : null

    if (!ornamentInfo) {
      expandedNotes.push(noteData)
      continue
    }

    const { sequence, flag } = ornamentInfo
    for (let i = 0; i < sequence.length; i++) {
      const midiNumber = sequence[i]
      const noteNameStd = NOTE_NAMES[midiNumber % 12]
      const octaveStd = Math.floor(midiNumber / 12) - 1

      expandedNotes.push({
        ...noteData,
        midiNumber,
        noteName: `${noteNameStd}${octaveStd}`,
        timestamp: noteData.timestamp + i * ORNAMENT_NOTE_OFFSET,
        [flag]: true,
        // Only the last note should highlight the original notehead
        noteheadIndex: i === sequence.length - 1 ? noteData.noteheadIndex : -1,
      })
    }
  }

  return expandedNotes
}

// Repetition instruction types from OSMD
const RepetitionType = {
  StartLine: 0,
  ForwardJump: 1,
  BackJumpLine: 2,
  Ending: 3,
  DaCapo: 4,
  DalSegno: 5,
  Fine: 6,
  ToCoda: 7,
  DalSegnoAlFine: 8,
  DaCapoAlFine: 9,
  DalSegnoAlCoda: 10,
  DaCapoAlCoda: 11,
  Coda: 12,
  Segno: 13,
  None: 14,
}

// Build the playback sequence considering repeats and endings (voltas)
// Returns an array of { sourceMeasureIndex, playbackIndex } objects
function buildPlaybackSequence(sourceMeasures) {
  const sequence = []
  let currentPass = 1 // Track which repetition pass we're on (1 = first, 2 = second, etc.)
  let repeatStartIndex = 0 // Where to jump back to on BackJumpLine
  let i = 0

  while (i < sourceMeasures.length) {
    const measure = sourceMeasures[i]
    const firstInstructions = measure.FirstRepetitionInstructions || []
    const lastInstructions = measure.LastRepetitionInstructions || []

    // Check for StartLine at the beginning of this measure
    const hasStartLine = firstInstructions.some((ri) => ri.type === RepetitionType.StartLine)
    if (hasStartLine) {
      // Check before updating repeatStartIndex: are we returning from a backward jump?
      const isReturningToRepeatStart = currentPass === 2 && i === repeatStartIndex
      repeatStartIndex = i
      // Only reset pass if we're starting a new repeat section (not coming back from a jump)
      if (!isReturningToRepeatStart) {
        currentPass = 1
      }
    }

    // Check if this measure is an ending (volta)
    const endingInstruction = firstInstructions.find((ri) => ri.type === RepetitionType.Ending)
    const endingIndices = endingInstruction?.endingIndices || []

    // Only include this measure if:
    // 1. It's not an ending (no volta bracket), OR
    // 2. It's an ending that matches the current pass
    const shouldIncludeMeasure = endingIndices.length === 0 || endingIndices.includes(currentPass)

    if (shouldIncludeMeasure) {
      sequence.push({
        sourceMeasureIndex: i,
        playbackIndex: sequence.length,
      })
    }

    // Check for BackJumpLine at the end of this measure
    const hasBackJump = lastInstructions.some((ri) => ri.type === RepetitionType.BackJumpLine)

    if (hasBackJump && currentPass === 1) {
      // Jump back to repeat start for second pass
      currentPass = 2
      i = repeatStartIndex
      continue
    }

    // After completing pass 2 of a section, reset for next potential repeat section
    if (currentPass === 2 && endingIndices.includes(2)) {
      currentPass = 1
      repeatStartIndex = i + 1
    }

    i++
  }

  return sequence
}

function pitchToMidiFromSourceNote(pitch) {
  const midiNote = pitch.halfTone + 12
  const noteNameStd = NOTE_NAMES[midiNote % 12]
  const octaveStd = Math.floor(midiNote / 12) - 1
  return { noteName: `${noteNameStd}${octaveStd}`, midiNote: midiNote }
}

// Grace notes should be played before the main note, not held together with it.
// This function adjusts their timestamps to be slightly earlier than the main note.
function adjustGraceNoteTimestamps(measureNotes) {
  const GRACE_NOTE_OFFSET = 0.0001

  // Group grace notes by their original timestamp
  const graceNotesByTimestamp = new Map()
  for (const noteData of measureNotes) {
    if (noteData.isGrace) {
      const ts = noteData.timestamp
      if (!graceNotesByTimestamp.has(ts)) {
        graceNotesByTimestamp.set(ts, [])
      }
      graceNotesByTimestamp.get(ts).push(noteData)
    }
  }

  // Adjust timestamps: each grace note gets an earlier timestamp
  for (const [timestamp, graceNotes] of graceNotesByTimestamp) {
    // Grace notes are ordered, first one should be played first (earliest timestamp)
    for (let i = 0; i < graceNotes.length; i++) {
      // Subtract offset so grace notes come before main note
      // Earlier grace notes get larger offset (played first)
      graceNotes[i].timestamp = timestamp - (graceNotes.length - i) * GRACE_NOTE_OFFSET
    }
  }
}

// Extract notes from source measures into a Map (sourceMeasureIndex -> notes array)
// This is the raw extraction without considering playback order
function extractNotesFromSourceMeasures(sourceMeasures) {
  const notesByMeasure = new Map()

  sourceMeasures.forEach((measure, measureIndex) => {
    const measureNotes = []
    // Use MeasureNumberXML to match the XML's measure number attribute
    // (MeasureNumber is OSMD's internal numbering which starts from 0 for pickups)
    const measureNumber = measure.MeasureNumberXML
    // Track sequential note index for each (staff, voice) combination
    const noteCounters = new Map()

    measure.verticalSourceStaffEntryContainers.forEach((container) => {
      if (container.staffEntries) {
        for (let staffIndex = 0; staffIndex < container.staffEntries.length; staffIndex++) {
          const staffEntry = container.staffEntries[staffIndex]
          if (!staffEntry?.voiceEntries) continue
          for (const voiceEntry of staffEntry.voiceEntries) {
            if (!voiceEntry.notes) continue
            // Get voice ID from OSMD (1-based in MusicXML), convert to 0-indexed
            const voiceId = voiceEntry.ParentVoice?.VoiceId ?? 1
            const voiceIndex = voiceId - 1
            for (let noteIndex = 0; noteIndex < voiceEntry.notes.length; noteIndex++) {
              const note = voiceEntry.notes[noteIndex]
              // Skip notes without pitch, rests, or cue notes (editorial guide notes not meant to be played)
              if (!note.pitch || note.isRest() || note.IsCueNote) continue
              const noteInfo = pitchToMidiFromSourceNote(note.pitch)
              // Check if this note is a tie continuation (not the start of the tie)
              const isTieContinuation = note.NoteTie && note.NoteTie.StartNote !== note
              // Get sequential note index for this (staff, voice) combination
              const counterKey = `${staffIndex}:${voiceIndex}`
              if (!noteCounters.has(counterKey)) {
                noteCounters.set(counterKey, 0)
              }
              const sequentialNoteIndex = noteCounters.get(counterKey)
              noteCounters.set(counterKey, sequentialNoteIndex + 1)
              // Fingering key format: measureNumber:staffIndex:voiceIndex:sequentialNoteIndex
              const fingeringKey = `${measureNumber}:${staffIndex}:${voiceIndex}:${sequentialNoteIndex}`
              measureNotes.push({
                note,
                voiceEntry,
                midiNumber: noteInfo.midiNote,
                noteName: noteInfo.noteName,
                timestamp: measureIndex + voiceEntry.timestamp.realValue,
                measureIndex,
                active: false,
                played: false,
                isTieContinuation,
                isGrace: voiceEntry.isGrace === true,
                // Index of the notehead within the chord (for targeting individual noteheads in SVG)
                noteheadIndex: noteIndex,
                noteheadCount: voiceEntry.notes.filter((n) => n.pitch).length,
                // Staff 0 = right hand (treble clef), Staff 1 = left hand (bass clef)
                staffIndex,
                // Key for fingering storage
                fingeringKey,
                voiceIndex,
              })
            }
          }
        }
      }
    })

    // Adjust grace note timestamps so they are played sequentially before main notes
    adjustGraceNoteTimestamps(measureNotes)

    // Expand ornaments (turns and mordents) into their constituent notes
    const expandedNotes = expandOrnamentNotes(measureNotes)

    // Ensure notes are ordered by (possibly adjusted) timestamp for sequential validation
    expandedNotes.sort((a, b) => a.timestamp - b.timestamp)

    if (expandedNotes.length > 0) {
      notesByMeasure.set(measureIndex, expandedNotes)
    }
  })

  return notesByMeasure
}

// Extract notes from the score and build the playback sequence
// Returns { allNotes, playbackSequence }
export function extractNotesFromScore(osmdInstance) {
  if (!osmdInstance) {
    return { allNotes: [], playbackSequence: [] }
  }

  const sheet = osmdInstance.Sheet
  const sourceMeasures = sheet.SourceMeasures

  // Build the playback sequence (handles repeats and endings)
  const playbackSequence = buildPlaybackSequence(sourceMeasures)

  // Extract notes from each source measure into a map
  const notesBySourceMeasure = extractNotesFromSourceMeasures(sourceMeasures)

  // Build allNotes array following the playback sequence
  const allNotes = []
  playbackSequence.forEach((seqItem, playbackIndex) => {
    const sourceNotes = notesBySourceMeasure.get(seqItem.sourceMeasureIndex)
    if (!sourceNotes || sourceNotes.length === 0) return

    // Create a copy of the notes for this playback position
    // Each occurrence in the sequence needs independent played/active state
    const measureNotes = sourceNotes.map((noteData) => ({
      ...noteData,
      // Update timestamp to use playback index, preserving grace note adjustments
      // The offset within measure includes grace note timing adjustments
      timestamp: playbackIndex + (noteData.timestamp - noteData.measureIndex),
      // Keep reference to source measure for SVG highlighting
      sourceMeasureIndex: seqItem.sourceMeasureIndex,
      // Reset state for this occurrence
      active: false,
      played: false,
    }))

    allNotes.push({
      measureIndex: playbackIndex,
      sourceMeasureIndex: seqItem.sourceMeasureIndex,
      notes: measureNotes,
    })
  })

  return { allNotes, playbackSequence }
}
