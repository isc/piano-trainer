import { Piano } from '@tonejs/piano'

let piano = null
let scheduledTimeouts = []
let isPlaying = false
let onPlaybackEnd = null

const GRACE_NOTE_DURATION_S = 0.08
// Must match GRACE_NOTE_OFFSET in noteExtraction.js adjustGraceNoteTimestamps
const GRACE_NOTE_OFFSET_WN = 0.0001

export function initPlayback() {
  return {
    togglePlayback,
    stop,
    setOnPlaybackEnd: (fn) => { onPlaybackEnd = fn },
    get isPlaying() { return isPlaying },
  }
}

async function ensurePianoLoaded() {
  if (piano) return
  piano = new Piano({ velocities: 1 })
  piano.toDestination()
  await piano.load()
}

function getBPM(osmdInstance) {
  return osmdInstance.Sheet?.SourceMeasures?.[0]?.TempoInBPM || 120
}

function tsToSeconds(ts, bpm) {
  return ts * 4 * 60 / bpm
}

// Build cumulative start times (in whole-note fractions) for each measure in playback order.
// Each measure's actual duration comes from OSMD, so time signatures other than 4/4 work correctly.
function buildCumStartTimes(allNotes, sourceMeasures) {
  const cumTimes = []
  let cumulativeTime = 0
  for (const measureData of allNotes) {
    cumTimes.push(cumulativeTime)
    const duration = sourceMeasures[measureData.sourceMeasureIndex]?.Duration?.RealValue ?? 1.0
    cumulativeTime += duration
  }
  return cumTimes
}

// Fixed ornament note duration (in whole-note fractions) for mordents.
// Mordents have a conventional speed independent of the parent note's value.
// Trills and turns are different: they span the full duration of the note.
const ORNAMENT_NOTE_DURATION_WN = 1 / 16

// Recalculate timings for ornaments and grace notes for audio playback.
//
// Ornaments: the note extractor uses ORNAMENT_NOTE_OFFSET=0.00001 between notes (for keyboard
// matching order), which collapses them to the same instant for audio.
// - Mordents: fixed duration per note (tempo-relative, not parent-note-relative)
// - Turns/trills: evenly spread over the full parent note duration
// - isTrillEnd sentinels: skipped (only used by the keyboard matching engine)
//
// Grace notes: the extractor places them GRACE_NOTE_OFFSET_WN before their main note
// (≈0.2ms at 120 BPM — effectively simultaneous). Here we schedule them so the last
// grace note ends exactly at the main note's start time.
function expandOrnamentTimings(notes) {
  const ornamentGroups = new Map()
  const result = []
  let graceGroup = []

  function flushGraceGroup() {
    if (graceGroup.length === 0) return
    const n = graceGroup.length
    // mainTs is the timestamp of the note the grace notes precede
    const mainTs = graceGroup[n - 1].timestamp + GRACE_NOTE_OFFSET_WN
    for (let i = 0; i < n; i++) {
      // _graceOffset: how many grace note durations before mainTs this note starts
      // Last note (i=n-1): starts 1 duration before mainTs, ends exactly at mainTs
      result.push({ ...graceGroup[i], _graceMainTs: mainTs, _graceOffset: n - i })
    }
    graceGroup = []
  }

  for (const noteData of notes) {
    if (noteData.isTrillEnd) continue
    if (noteData.isTrillNote || noteData.isTurnNote || noteData.isMordentNote) {
      flushGraceGroup()
      const group = ornamentGroups.get(noteData.note) ?? []
      if (group.length === 0) ornamentGroups.set(noteData.note, group)
      group.push(noteData)
    } else if (noteData.isGrace) {
      graceGroup.push(noteData)
    } else {
      flushGraceGroup()
      result.push(noteData)
    }
  }
  flushGraceGroup()

  for (const [parentNote, groupNotes] of ornamentGroups) {
    const baseTs = groupNotes[0].timestamp
    const isTrill = groupNotes[0].isTrillNote
    const isTurn = groupNotes[0].isTurnNote
    const noteDuration = (isTrill || isTurn)
      ? parentNote.Length.RealValue / groupNotes.length
      : ORNAMENT_NOTE_DURATION_WN
    for (let i = 0; i < groupNotes.length; i++) {
      result.push({ ...groupNotes[i], timestamp: baseTs + i * noteDuration, _ornamentDuration: noteDuration })
    }
  }

  result.sort((a, b) => a.timestamp - b.timestamp)
  return result
}

function stop() {
  for (const id of scheduledTimeouts) clearTimeout(id)
  scheduledTimeouts = []
  isPlaying = false
  piano?.pedalUp()
}

async function togglePlayback(allNotes, osmdInstance) {
  if (isPlaying) { stop(); return }

  await ensurePianoLoaded()

  const bpm = getBPM(osmdInstance)
  const sourceMeasures = osmdInstance.Sheet.SourceMeasures
  const cumStartTimes = buildCumStartTimes(allNotes, sourceMeasures)
  let maxEndMs = 0

  for (let i = 0; i < allNotes.length; i++) {
    const measureData = allNotes[i]
    const measureStartTs = cumStartTimes[i]
    const measureOffset = measureStartTs - measureData.measureIndex
    const notes = expandOrnamentTimings(measureData.notes)

    for (const n of notes) {
      let startMs, durationMs

      if (n._graceMainTs !== undefined) {
        const mainMs = tsToSeconds(measureOffset + n._graceMainTs, bpm) * 1000
        startMs = Math.max(0, mainMs - n._graceOffset * GRACE_NOTE_DURATION_S * 1000)
        durationMs = GRACE_NOTE_DURATION_S * 1000
      } else {
        startMs = tsToSeconds(measureOffset + n.timestamp, bpm) * 1000
        durationMs = tsToSeconds(n._ornamentDuration ?? n.note.Length.RealValue, bpm) * 1000
      }

      if (!n.isTieContinuation) {
        scheduledTimeouts.push(setTimeout(() => piano.keyDown({ midi: n.midiNumber, velocity: 0.7 }), startMs))
      }
      scheduledTimeouts.push(setTimeout(() => piano.keyUp({ midi: n.midiNumber }), startMs + durationMs))

      maxEndMs = Math.max(maxEndMs, startMs + durationMs)
    }
  }

  isPlaying = true
  scheduledTimeouts.push(setTimeout(() => { isPlaying = false; onPlaybackEnd?.() }, maxEndMs + 500))
}
