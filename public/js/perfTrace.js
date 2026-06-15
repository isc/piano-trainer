// TEMPORARY diagnostic — hunts an intermittent multi-second freeze while playing.
// Logs any wrapped op or browser "long task" over the threshold, plus the JS heap
// and sudden heap drops (the signature of a major garbage collection — the prime
// suspect, since a DevTools Performance recording suppresses the freeze).
//
// Everything is also pushed (with a timestamp) to `window.__ptFreezeLog`, so after
// a freeze you can open the console and type `__ptFreezeLog` to see the history —
// even if the console messages have scrolled away.
//
// Remove this file + its imports in musicxml.js once the freeze is captured.
const SLOW_MS = 120
const heapMb = () => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : '?')

if (typeof window !== 'undefined') window.__ptFreezeLog = window.__ptFreezeLog || []

function record(msg) {
  const line = `${new Date().toLocaleTimeString()} ${msg}`
  if (typeof window !== 'undefined') window.__ptFreezeLog?.push(line)
  console.warn(line)
}

export function traced(label, fn) {
  const start = performance.now()
  try {
    return fn()
  } finally {
    const dt = performance.now() - start
    if (dt > SLOW_MS) record(`🐌 ${label}: ${Math.round(dt)}ms (heap ${heapMb()}MB)`)
  }
}

if (typeof PerformanceObserver !== 'undefined') {
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration > 150) record(`⏱ long task: ${Math.round(e.duration)}ms (heap ${heapMb()}MB)`)
      }
    }).observe({ entryTypes: ['longtask'] })

    // Heap-drop detector: a large drop between samples = V8 ran a major GC, which
    // stops the main thread. A freeze coinciding with one of these IS the GC pause.
    if (performance.memory) {
      let prev = 0
      setInterval(() => {
        const h = Math.round(performance.memory.usedJSHeapSize / 1048576)
        if (prev && prev - h > 25) record(`🗑️ chute heap ${prev}→${h}MB (GC probable)`)
        prev = h
      }, 1000)
    }
    console.info('🐌 perfTrace actif — en cas de freeze, ouvre la console ou tape window.__ptFreezeLog')
  } catch {
    /* longtask not supported */
  }
}
