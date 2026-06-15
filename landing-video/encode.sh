#!/usr/bin/env bash
# Encode the newest HyperFrames render into the web-ready, per-language hero
# assets the landing serves: a small 720p MP4 + a poster frame.
#   bash encode.sh <lang>   (e.g. en, fr) → public/video/hero.<lang>.mp4
# Run from landing-video/.
set -euo pipefail
cd "$(dirname "$0")"

LANG_CODE="${1:?usage: encode.sh <lang>  (e.g. en, fr)}"

SRC=$(ls -t composition/renders/*.mp4 2>/dev/null | head -1)
if [ -z "${SRC:-}" ]; then
  echo "No render found. Run: (cd composition && npm run render)" >&2
  exit 1
fi
echo "Encoding ($LANG_CODE) from: $SRC"

ffmpeg -y -i "$SRC" -vf "scale=1280:720:flags=lanczos" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 27 -preset slow \
  -movflags +faststart -an "../public/video/hero.${LANG_CODE}.mp4"

# Poster frame from the opening (library) scene.
ffmpeg -y -ss 1.9 -i "$SRC" -frames:v 1 -update 1 -vf "scale=1280:720:flags=lanczos" \
  -q:v 4 "../public/img/hero-poster.${LANG_CODE}.jpg"

echo "Wrote ../public/video/hero.${LANG_CODE}.mp4 and ../public/img/hero-poster.${LANG_CODE}.jpg"
