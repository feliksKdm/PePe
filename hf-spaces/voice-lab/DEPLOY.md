# Deploying Voice Lab → huggingface.co/spaces/feliksKdm/voice-lab

Two files need to reach the Space. Both live in this folder.

## 1. Upload the default voice (do this first)

`default_voice.wav` — 9.7 s, mono, 24 kHz, converted from the WhatsApp `.ogg`.
It becomes the preloaded reference so visitors hear your voice in one click.

1. Open https://huggingface.co/spaces/feliksKdm/voice-lab/tree/main
2. **Add file → Upload files** → drop in `default_voice.wav`
3. Commit. Keep the filename exactly `default_voice.wav` — `app.py` looks for it
   next to itself.

## 2. Replace app.py

1. Open https://huggingface.co/spaces/feliksKdm/voice-lab/blob/main/app.py
2. Click **Edit**, select all, paste the contents of `app.py` from this folder
3. Commit. The Space rebuilds in ~2 min (models are cached, nothing re-downloads).

## What changes

- The upload slot starts pre-filled with `default_voice.wav`.
- The transcript of that clip is detected **once at boot**, not per visitor, so
  the preset costs no ZeroGPU quota per page view.
- A microphone recording now takes priority over the upload slot — without this,
  the pre-filled default would make recording impossible.
- If `default_voice.wav` is missing, the app falls back to the old behaviour
  (empty slot) instead of crashing.

## Voice presets

The left panel is a gallery of 10 voice × tone presets (see `PRESETS` in
`app.py`). They are built from two reference clips that are already in the Space:

- `default_voice.wav` — your voice (Natural, Cheerful, Soft & Calm, Hype,
  Deep Narrator, Robot)
- `zero_shot_prompt.wav` — the CosyVoice sample speaker, "Lumi" (Warm,
  Melancholic, Fired Up, Cartoon)

Deep Narrator, Robot and Cartoon clone a **pitch-shifted** copy of the clip.
Those copies are rendered once at boot on CPU into `voices/`, so nothing extra
needs uploading. Tones come from CosyVoice3 style instructions plus a
per-preset speed. If a preset sounds off, tweak its `style`, `pitch` or
`speed` in `PRESETS`. Choosing a preset never runs on ZeroGPU; only Generate
does.

## Verify after deploy

Open the Space and check the log line `default voice transcript: …` — it should
match what you actually say in the clip. If ASR got it wrong, fix it permanently:
set `DEFAULT_VOICE_TEXT = "the exact words"` near the top of `app.py`. The
transcript must match the audio or cloning quality degrades noticeably.

## Replacing the voice later

Convert any clip to the right format with ffmpeg (keep it under 10 s):

```bash
ffmpeg -y -i input.ogg -ss 0.3 -t 9.7 -ac 1 -ar 24000 -sample_fmt s16 default_voice.wav
```
