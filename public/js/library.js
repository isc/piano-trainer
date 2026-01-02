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
      return this.scores.filter(
        (s) => s.title.toLowerCase().includes(q) || s.composer.toLowerCase().includes(q)
      )
    },

    getScoreUrl(score) {
      return this.baseUrl + score.file
    },
  }
}
