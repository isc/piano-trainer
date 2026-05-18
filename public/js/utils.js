export function isTestEnv() {
  return document.cookie.includes('test-env')
}

// Pixel offset for the currently-visible sticky bars (topbar + modebar +
// optional mode-context band), used both by scrollToMeasure() and by the
// CSS scroll-margin-top via the --pt-sticky-offset variable.
// Headroom kept above the auto-scrolled measure. Has to cover the fingering
// numerals that hover above the top staff line (~20px) plus a few pixels
// breathing — otherwise the modebar clips them right where the eyes look.
const STICKY_BREATHING_PX = 28

export function getStickyOffset() {
  let offset = STICKY_BREATHING_PX
  for (const el of document.querySelectorAll('.pt-topbar, .pt-modebar, .pt-context')) {
    if (getComputedStyle(el).display === 'none') continue
    offset += el.getBoundingClientRect().height
  }
  return offset
}

export function applyStickyOffset() {
  document.documentElement.style.setProperty('--pt-sticky-offset', `${getStickyOffset()}px`)
}

export function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const totalMinutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (totalMinutes === 0) return `${seconds}s`
  if (totalMinutes < 60) return `${totalMinutes}m ${seconds}s`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes}m`
}

const STATUS_LABELS = {
  dechiffrage: 'Déchiffrage',
  perfectionnement: 'Perfectionnement',
  repertoire: 'Répertoire',
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status
}

function daysAgo(date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const compareDate = new Date(date)
  compareDate.setHours(0, 0, 0, 0)
  return { compareDate, diffDays: Math.floor((today - compareDate) / (1000 * 60 * 60 * 24)) }
}

// Compact relative date for table cells. formatDate is the verbose
// counterpart ("vendredi 8 mai") used for headings.
export function formatRelativeDate(date) {
  if (!date) return ''
  const { diffDays } = daysAgo(date)
  if (diffDays === 0) return "aujourd'hui"
  if (diffDays === 1) return 'hier'
  if (diffDays < 30) return `il y a ${diffDays} j`
  if (diffDays < 365) return `il y a ${Math.floor(diffDays / 30)} mois`
  return `il y a ${Math.floor(diffDays / 365)} an${diffDays >= 730 ? 's' : ''}`
}

export function formatDate(date) {
  const { compareDate, diffDays } = daysAgo(date)
  if (diffDays === 0) return "aujourd'hui"
  if (diffDays === 1) return 'hier'
  return compareDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
}
