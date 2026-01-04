export function libraryApp() {
  return {
    scores: [],
    searchQuery: '',
    baseUrl: '',

    async init() {
      const response = await fetch('/data/scores.json')
      const data = await response.json()
      this.scores = data.scores
      this.baseUrl = data.baseUrl
    },

    get filteredScores() {
      if (!this.searchQuery) return this.scores
      const q = this.searchQuery.toLowerCase()
      return this.scores.filter((s) => s.title.toLowerCase().includes(q) || s.composer.toLowerCase().includes(q))
    },

    getScoreUrl(score) {
      return this.baseUrl + score.file
    },

    loadScoreWithFullscreen(scoreUrl) {
      // Request fullscreen while still in user gesture context
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('Fullscreen non disponible:', err)
        })
      }
      // Navigate to score page
      window.location.href = 'score.html?url=' + encodeURIComponent(scoreUrl)
    },
  }
}
