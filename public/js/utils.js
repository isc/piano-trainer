export function isTestEnv() {
  return document.cookie.includes('test-env')
}

export function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000)
  const totalMinutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (totalMinutes === 0) return `${seconds}s`
  if (totalMinutes < 60) return `${totalMinutes}m ${seconds}s`
  // Past an hour, seconds become noise — show "Xh Ym" only.
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

// Compact relative date for table cells: "aujourd'hui" / "hier" / "il y a Nj" / "il y a Nmois".
// Distinct from formatDate (which gives a full "vendredi 8 mai" for older dates)
// because table rows need to stay narrow.
export function formatRelativeDate(date) {
  if (!date) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const compareDate = new Date(date)
  compareDate.setHours(0, 0, 0, 0)

  const diffDays = Math.floor((today - compareDate) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return "aujourd'hui"
  if (diffDays === 1) return 'hier'
  if (diffDays < 30) return `il y a ${diffDays} j`
  if (diffDays < 365) return `il y a ${Math.floor(diffDays / 30)} mois`
  return `il y a ${Math.floor(diffDays / 365)} an${diffDays >= 730 ? 's' : ''}`
}

export function formatDate(date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const compareDate = new Date(date)
  compareDate.setHours(0, 0, 0, 0)

  const diffTime = today - compareDate
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "aujourd'hui"
  if (diffDays === 1) return 'hier'

  const options = { weekday: 'long', day: 'numeric', month: 'long' }
  return compareDate.toLocaleDateString('fr-FR', options)
}
