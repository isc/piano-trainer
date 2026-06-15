// Re-exports the caption catalog for the language currently being rendered.
// The build (build-video.mjs) rewrites this between language renders; it
// defaults to French so `npm run dev`/`render` works out of the box.
export { default as CAPS } from './captions/fr.js'
