# Landing hero video

Build pipeline for the animated product video on the landing page
(`public/video/hero.mp4`). The video is a [HyperFrames](https://github.com/heygen-com/hyperframes)
composition (HTML/CSS/GSAP → MP4) whose scenes are **real screenshots of the
app**, captured with Playwright while driving the app's own MIDI engine.

Only the final MP4 + poster are committed (under `public/`). The intermediate
screenshots live in `composition/assets/` and are **gitignored** — they're
derived from a personal practice-data backup, and regenerable from it.

```
landing-video/
  capture/
    lib.mjs            shared Playwright helpers (launch, openScore, mock-MIDI cookie)
    build-assets.mjs   seed the app from a backup, capture every screenshot
  composition/
    index.html         the HyperFrames composition (5 scenes + GSAP timeline)
    design.md          brand/design system (colours, type, motion)
    assets/            generated screenshots (gitignored)
  encode.sh            newest render → public/video/hero.mp4 + poster
```

## Prerequisites

- Node 22+ and FFmpeg (`ffmpeg -version`)
- `npm install` here, then `npx playwright install chromium`
  (or set `PT_CHROMIUM=/path/to/Chromium` to reuse an existing binary)
- A backup export: in the app, **Bibliothèque → ⚙️ Gestion des données →
  Exporter sauvegarde**. It lands in `~/Downloads/piano-trainer-backup-*.json`.

## Regenerate

```bash
# 1. Run the app (from the repo root, in another terminal)
bundle exec ruby app.rb            # serves http://localhost:4567

# 2. Capture the app states into composition/assets/
cd landing-video
npm install
PT_BACKUP=~/Downloads/piano-trainer-backup-2026-06-12.json npm run capture

# 3. Render the composition to MP4 (composition/renders/*.mp4)
npm run render

# 4. Encode the web-ready hero assets into ../public/
npm run encode
```

Then commit the updated `public/video/hero.mp4` and `public/img/hero-poster.jpg`.

## Notes

- **Scenes** (see `composition/index.html`): library → real-time note feedback →
  training mode (3× per measure) → practice history → brand lockup.
- **Real engine feedback**: `build-assets.mjs` sets the `test-env` cookie to
  enable the in-app mock MIDI keyboard, reads expected pitches from the OSMD
  cursor (`Pitch.halfTone + 12`), and dispatches real `mock-midi-input` events
  so the app's matching engine colours the played notes — no fake overlays.
- **Score URLs load without a leading slash** (`scores/…`, the way the library
  links them) so `scoreUrl` matches the stored session ids and the history
  chart resolves.
- **Editing the video**: tweak `composition/index.html` and preview live with
  `cd composition && npm run dev`, or `npm run check` to lint. Keep the brand in
  `composition/design.md`.
- The landing page autoplays the result muted/looping and honours
  `prefers-reduced-motion` (poster fallback) — that lives in `public/index.html`.
