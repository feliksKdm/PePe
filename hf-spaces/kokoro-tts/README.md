---
title: Feliks TTS
emoji: 🔊
colorFrom: purple
colorTo: blue
sdk: gradio
sdk_version: 5.50.0
app_file: app.py
pinned: false
license: apache-2.0
short_description: Neural text-to-speech on Kokoro-82M (ZeroGPU)
---

# Feliks TTS — neural text-to-speech (Kokoro-82M)

Backend for the Text-to-Speech tool on Feliks Altymyshov's portfolio, plus a
small UI for anyone visiting the Space directly.

- **Hardware:** ZeroGPU. If a visitor's GPU quota runs out, generation falls
  back to the CPU copy of the model instead of failing.
- **Voices:** the ten best-graded Kokoro voices (US/UK, female/male).
- **API:** `/speak` takes `chunks` (a JSON list of strings), `voice`
  (e.g. `af_heart`) and `speed`, and streams one event per chunk:
  `{"i", "sr", "pcm" (base64 int16 LE), "gen"}`. The portfolio uses it through
  Gradio's HTTP API (`POST /gradio_api/call/speak`, then read the SSE stream).

## Redeploy

```bash
hf upload feliksKdm/kokoro-tts hf-spaces/kokoro-tts . --type space
```
