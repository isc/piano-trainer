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
