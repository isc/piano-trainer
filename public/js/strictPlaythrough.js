import { tsToSeconds, buildCumStartTimes, syncCursorStyle } from './playback.js'
import { isOrnamentOrGrace, isNoteActiveForHands } from './noteExtraction.js'

const DEFAULT_TOLERANCE_MS = 150
const DEFAULT_COUNT_IN_BEATS = 4
const CLS_EXPECTED = 'expected-note'
const CLS_PLAYED = 'played-note'
const CLS_MISSED = 'missed-note'

let timeouts = []
let isRunning = false
let activeOsmd = null
let pendingEvents = []
let stats = null
let onCompleteCb = null
let onProgressCb = null
let activeHands = { right: true, left: true }
let audioContext = null
let startedAtPerf = 0
let currentToleranceMs = DEFAULT_TOLERANCE_MS

export function initStrictPlaythrough() {
  return {
    start,
    stop,
    handleNoteOn,
    setActiveHands: (h) => { activeHands = { ...activeHands, ...h } },
    get isPlaying() { return isRunning },
  }
}

function ensureAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (audioContext.state === 'suspended') audioContext.resume()
}

function click({ accent = false } = {}) {
  if (!audioContext) return
  const t0 = audioContext.currentTime
  const osc = audioContext.createOscillator()
  const gain = audioContext.createGain()
  osc.frequency.value = accent ? 1500 : 1000
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05)
  osc.connect(gain).connect(audioContext.destination)
  osc.start(t0)
  osc.stop(t0 + 0.06)
}

function shouldExpectInput(noteData) {
  if (isOrnamentOrGrace(noteData)) return false
  if (noteData.isTieContinuation) return false
  return isNoteActiveForHands(noteData, activeHands)
}

function svgNoteheadFor(noteData) {
  if (!activeOsmd) return null
  const svgGroup = activeOsmd.rules.GNote(noteData.note)?.getSVGGElement()
  if (!svgGroup) return null
  const noteheads = svgGroup.querySelectorAll('.vf-notehead')
  return noteheads[noteData.noteheadIndex] ?? null
}

function clearAllVisualState(allNotes) {
  for (const measureData of allNotes) {
    for (const noteData of measureData.notes) {
      svgNoteheadFor(noteData)?.classList.remove(CLS_EXPECTED, CLS_PLAYED, CLS_MISSED)
    }
  }
}

function start({
  bpm,
  allNotes,
  osmdInstance,
  tolerance = DEFAULT_TOLERANCE_MS,
  countInBeats = DEFAULT_COUNT_IN_BEATS,
  onComplete,
  onProgress,
}) {
  if (isRunning) return
  if (!osmdInstance || !allNotes?.length) return

  ensureAudio()
  activeOsmd = osmdInstance
  onCompleteCb = onComplete
  onProgressCb = onProgress
  currentToleranceMs = tolerance
  isRunning = true

  clearAllVisualState(allNotes)

  const sourceMeasures = osmdInstance.Sheet.SourceMeasures
  const cumStartTimes = buildCumStartTimes(allNotes, sourceMeasures)
  const beatMs = 60_000 / bpm
  const countInMs = countInBeats * beatMs

  pendingEvents = []
  const cursorTimesSet = new Set()

  for (let i = 0; i < allNotes.length; i++) {
    const measureData = allNotes[i]
    const measureOffset = cumStartTimes[i] - measureData.measureIndex

    for (const noteData of measureData.notes) {
      const ts = measureOffset + noteData.timestamp
      const noteTimeMs = countInMs + tsToSeconds(ts, bpm) * 1000

      cursorTimesSet.add(noteTimeMs)

      if (!shouldExpectInput(noteData)) continue

      pendingEvents.push({
        timeMs: noteTimeMs,
        midiNumber: noteData.midiNumber,
        noteData,
        noteheadEl: svgNoteheadFor(noteData),
        measureIndex: i,
        sourceMeasureIndex: measureData.sourceMeasureIndex,
        status: 'pending',
      })
    }
  }

  pendingEvents.sort((a, b) => a.timeMs - b.timeMs)
  stats = { total: pendingEvents.length, hit: 0, missed: 0, wrongNotes: 0 }

  startedAtPerf = performance.now()

  for (let i = 0; i < countInBeats; i++) {
    const t = i * beatMs
    timeouts.push(setTimeout(() => click({ accent: i === 0 }), t))
  }

  if (pendingEvents.length > 0) {
    const lastTimeMs = pendingEvents[pendingEvents.length - 1].timeMs
    const beatsDuringMusic = Math.ceil((lastTimeMs - countInMs) / beatMs) + 1
    for (let i = 0; i <= beatsDuringMusic; i++) {
      const t = countInMs + i * beatMs
      timeouts.push(setTimeout(() => click({ accent: false }), t))
    }
  }

  const cursor = osmdInstance.cursor
  if (cursor) {
    cursor.reset()
    cursor.show()
    syncCursorStyle(cursor)
    const sortedCursorTimes = [...cursorTimesSet].sort((a, b) => a - b)
    let lastCursorTop = null
    for (let i = 0; i < sortedCursorTimes.length; i++) {
      timeouts.push(setTimeout(() => {
        if (i > 0) cursor.next()
        syncCursorStyle(cursor)
        const el = cursor.cursorElement
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY
          if (lastCursorTop === null || Math.abs(top - lastCursorTop) > 10) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
          lastCursorTop = top
        }
      }, sortedCursorTimes[i]))
    }
  }

  // Match window is [T - tol, T + tol] but the visual cue lights up at T,
  // in sync with the cursor — otherwise the blue appears tol ms ahead of
  // the cursor and the player tracks it instead of the cursor.
  for (const event of pendingEvents) {
    timeouts.push(setTimeout(() => {
      if (event.status !== 'pending') return
      event.noteheadEl?.classList.add(CLS_EXPECTED)
    }, event.timeMs))

    timeouts.push(setTimeout(() => {
      if (event.status !== 'pending') return
      event.status = 'missed'
      stats.missed++
      event.noteheadEl?.classList.remove(CLS_EXPECTED)
      event.noteheadEl?.classList.add(CLS_MISSED)
      onProgressCb?.({ ...stats })
    }, event.timeMs + tolerance))
  }

  const lastEventTime = pendingEvents.length > 0
    ? pendingEvents[pendingEvents.length - 1].timeMs
    : countInMs
  const tailMs = lastEventTime + tolerance + 300
  timeouts.push(setTimeout(() => finish(false), tailMs))
}

function findMatchingEvent(midiNumber, now) {
  for (const event of pendingEvents) {
    if (event.status !== 'pending') continue
    // pendingEvents is sorted by timeMs; once we're past the next window we can stop
    if (now < event.timeMs - currentToleranceMs) break
    if (event.midiNumber !== midiNumber) continue
    if (now <= event.timeMs + currentToleranceMs) return event
  }
  return null
}

function handleNoteOn(midiNumber) {
  if (!isRunning) return false
  const now = performance.now() - startedAtPerf
  const event = findMatchingEvent(midiNumber, now)
  if (event) {
    event.status = 'hit'
    stats.hit++
    event.noteheadEl?.classList.remove(CLS_EXPECTED)
    event.noteheadEl?.classList.add(CLS_PLAYED)
    onProgressCb?.({ ...stats })
    return true
  }
  stats.wrongNotes++
  onProgressCb?.({ ...stats })
  return false
}

function teardown() {
  for (const id of timeouts) clearTimeout(id)
  timeouts = []
  if (activeOsmd?.cursor) {
    activeOsmd.cursor.hide()
    activeOsmd.cursor.reset()
  }
  for (const event of pendingEvents) {
    if (event.status === 'pending') {
      event.noteheadEl?.classList.remove(CLS_EXPECTED)
    }
  }
  activeOsmd = null
  pendingEvents = []
}

function finish(aborted) {
  if (!isRunning) return
  isRunning = false
  const finalStats = stats
  teardown()
  onCompleteCb?.({ ...finalStats, aborted })
}

function stop() {
  finish(true)
}
