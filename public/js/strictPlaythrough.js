import { tsToSeconds, buildCumStartTimes, syncCursorStyle } from './playback.js'
import { isOrnamentOrGrace, isNoteActiveForHands } from './noteExtraction.js'
import {
  findMatchingEvent,
  classifyMatch,
  EVENT_STATUS,
  CLASSIFICATION,
} from './strictMatching.js'

const DEFAULT_TOLERANCE_MS = 150
// Notes played beyond the strict tolerance but within this wider window are
// counted as "off-tempo" instead of wrong notes.
const DEFAULT_OFFTEMPO_WINDOW_MS = 450
const DEFAULT_COUNT_IN_BEATS = 4
const CLS_EXPECTED = 'expected-note'
const CLS_PLAYED = 'played-note'
const CLS_OFFTEMPO = 'offtempo-note'
const CLS_MISSED = 'missed-note'
const STRICT_CLASSES = [CLS_EXPECTED, CLS_PLAYED, CLS_OFFTEMPO, CLS_MISSED]

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
let currentOffTempoWindowMs = DEFAULT_OFFTEMPO_WINDOW_MS

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

function start({
  bpm,
  allNotes,
  osmdInstance,
  tolerance = DEFAULT_TOLERANCE_MS,
  offTempoWindow = DEFAULT_OFFTEMPO_WINDOW_MS,
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
  currentOffTempoWindowMs = offTempoWindow
  isRunning = true

  const sourceMeasures = osmdInstance.Sheet.SourceMeasures
  const cumStartTimes = buildCumStartTimes(allNotes, sourceMeasures)
  const beatMs = 60_000 / bpm
  const countInMs = countInBeats * beatMs

  pendingEvents = []
  const cursorTimesSet = new Set()

  // Single pass: look up each notehead once, clear residual strict-mode
  // classes from prior runs, push expected inputs into pendingEvents.
  for (let i = 0; i < allNotes.length; i++) {
    const measureData = allNotes[i]
    const measureOffset = cumStartTimes[i] - measureData.measureIndex

    for (const noteData of measureData.notes) {
      const ts = measureOffset + noteData.timestamp
      const noteTimeMs = countInMs + tsToSeconds(ts, bpm) * 1000

      cursorTimesSet.add(noteTimeMs)

      const noteheadEl = svgNoteheadFor(noteData)
      noteheadEl?.classList.remove(...STRICT_CLASSES)

      if (!shouldExpectInput(noteData)) continue

      pendingEvents.push({
        timeMs: noteTimeMs,
        midiNumber: noteData.midiNumber,
        noteData,
        noteheadEl,
        measureIndex: i,
        sourceMeasureIndex: measureData.sourceMeasureIndex,
        status: EVENT_STATUS.PENDING,
      })
    }
  }

  pendingEvents.sort((a, b) => a.timeMs - b.timeMs)
  stats = {
    total: pendingEvents.length,
    hit: 0,
    offTempoEarly: 0,
    offTempoLate: 0,
    missed: 0,
    wrongNotes: 0,
  }

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

  // Visual cue lights up at T (in sync with cursor). Match remains possible
  // until T + offTempoWindow — within tolerance is "in tempo", beyond is
  // "off tempo late". Past that, the event is genuinely missed.
  for (const event of pendingEvents) {
    timeouts.push(setTimeout(() => {
      if (event.status !== EVENT_STATUS.PENDING) return
      event.noteheadEl?.classList.add(CLS_EXPECTED)
    }, event.timeMs))

    timeouts.push(setTimeout(() => {
      if (event.status !== EVENT_STATUS.PENDING) return
      event.status = EVENT_STATUS.MISSED
      stats.missed++
      event.noteheadEl?.classList.remove(CLS_EXPECTED)
      event.noteheadEl?.classList.add(CLS_MISSED)
      onProgressCb?.({ ...stats })
    }, event.timeMs + offTempoWindow))
  }

  const lastEventTime = pendingEvents.length > 0
    ? pendingEvents[pendingEvents.length - 1].timeMs
    : countInMs
  // Finish only after every miss timeout has had a chance to fire.
  const tailMs = lastEventTime + offTempoWindow + 300
  timeouts.push(setTimeout(() => finish(false), tailMs))
}

function handleNoteOn(midiNumber) {
  if (!isRunning) return false
  const now = performance.now() - startedAtPerf
  const match = findMatchingEvent(pendingEvents, midiNumber, now, currentOffTempoWindowMs)
  if (!match) {
    stats.wrongNotes++
    onProgressCb?.({ ...stats })
    return false
  }
  const { event, delta } = match
  const classification = classifyMatch(delta, currentToleranceMs)
  event.noteheadEl?.classList.remove(CLS_EXPECTED)
  if (classification === CLASSIFICATION.HIT) {
    event.status = EVENT_STATUS.HIT
    stats.hit++
    event.noteheadEl?.classList.add(CLS_PLAYED)
  } else {
    // Single offtempo status; early vs late is captured in the stats only.
    event.status = EVENT_STATUS.OFFTEMPO
    if (classification === CLASSIFICATION.OFFTEMPO_EARLY) stats.offTempoEarly++
    else stats.offTempoLate++
    event.noteheadEl?.classList.add(CLS_OFFTEMPO)
  }
  onProgressCb?.({ ...stats })
  return true
}

function teardown() {
  for (const id of timeouts) clearTimeout(id)
  timeouts = []
  if (activeOsmd?.cursor) {
    activeOsmd.cursor.hide()
    activeOsmd.cursor.reset()
  }
  // Played/offtempo/missed marks stay visible after the run so the player can
  // see the breakdown; the next start() wipes them. Only clear the in-flight
  // expected-note highlight that no terminal status would have removed.
  for (const event of pendingEvents) {
    if (event.status === EVENT_STATUS.PENDING) {
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
