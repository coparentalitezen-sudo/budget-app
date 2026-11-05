#!/bin/sh
# Rebuild the promo from its source: sh build.sh   (needs Node 20+, ffmpeg 7+, the Lemo-Opuscar library with deps voice + instruments)
set -e
LIB=${LIB:-$HOME/lemo-opuscar}; export LIB
HERE=$(cd "$(dirname "$0")" && pwd); PY="$LIB/.venv/bin/python"
[ -f "$LIB/core/render/video.mjs" ] || { echo "set LIB to the Lemo-Opuscar library folder"; exit 1; }
cd "$LIB"
# 1. voice (online, Microsoft neural voice). Offline fallback: set "voice":"ff_siwis","lang":"fr-fr" in lines.json and use core/tts/tts.py
"$PY" -I "$HERE/tools/tts_edge.py" "$HERE/lines.json" "$HERE/voices"
"$PY" core/tts/asr_check.py "$HERE/lines.json" "$HERE/voices" --lang fr --model small
# 2. score, events, mix
"$PY" "$HERE/music/score.py"
node core/render/events.mjs "$HERE" --size 1080x1920
"$PY" "$HERE/mix.py"
# 3. subtitles, picture, master
mkdir -p "$HERE/out"
node "$HERE/tools/cues.mjs" "$HERE" > "$HERE/out/cues.json" && "$PY" core/render/srt.py "$HERE/out/cues.json" "$HERE/coparentalite-zen-promo.srt"
node core/render/video.mjs "$HERE" --fps 24 --workers 3 --size 1080x1920 --out "$HERE/out/video.mp4"
sh core/render/mux.sh "$HERE/out/video.mp4" "$HERE/out/mix.wav" "$HERE/coparentalite-zen-promo.mp4" 24 2
node core/render/still.mjs "$HERE" 33.5 --size 1080x1920 --q nosubs=1 --out "$HERE/out" && cp "$HERE/out/t_33.5.jpg" "$HERE/poster.jpg"
