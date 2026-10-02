---
title: Transcriber
emoji: 🎙️
colorFrom: blue
colorTo: purple
sdk: gradio
sdk_version: 5.50.0
app_file: app.py
pinned: false
license: mit
short_description: Whisper large-v3-turbo transcription with timestamps
---

# Transcriber

Speech-to-text backend for the Transcriber on Feliks Altymyshov's portfolio:
`openai/whisper-large-v3-turbo` on ZeroGPU, with segment timestamps.

- **API:** `/transcribe` takes `(audio, language)`, where `language` is `"auto"`
  or a Whisper language name. It returns `[result, error]`, and `result` is
  `{text, language, duration, seconds, segments: [{start, end, text}]}`.
- **Limit:** 15 minutes of audio per request. The site compresses audio to
  16 kHz mono MP3 in the browser before uploading.

Redeploy: `hf upload feliksKdm/transcriber hf-spaces/transcriber . --type space`
