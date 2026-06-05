import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/js/**/*.test.js'],
    environment: 'node',
    alias: {
      // Browser-only dependency resolved via the page's import map at runtime;
      // stub it so modules that import it (playback.js) load under Node.
      '@tonejs/piano': fileURLToPath(new URL('./test/js/stubs/tonejs-piano.js', import.meta.url)),
    },
  },
})
