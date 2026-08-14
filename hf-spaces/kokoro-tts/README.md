---
title: Feliks TTS
emoji: 🔊
colorFrom: purple
colorTo: blue
sdk: gradio
app_file: app.py
pinned: false
license: apache-2.0
short_description: Neural text-to-speech on Kokoro-82M
---

# Feliks TTS — neural text-to-speech (Kokoro-82M)

The neural upgrade for the portfolio's Text-to-Speech tool. Kokoro-82M is a
small open TTS model with near-studio quality — it runs fine on the free
Hugging Face CPU tier.

## Deploy (one-time, ~10 minutes)

1. Create a free account at https://huggingface.co (if you don't have one).
2. Go to https://huggingface.co/new-space →
   - Space name: `kokoro-tts`
   - License: apache-2.0
   - SDK: **Gradio**
   - Hardware: **CPU basic (free)**
3. On the Space page, open **Files** → **Add file** → upload these four files:
   `README.md`, `app.py`, `requirements.txt`, `packages.txt`
   (packages.txt installs `espeak-ng`, which Kokoro needs — don't skip it).
4. Wait for the build (first build downloads the model, ~5 min).
   Test it on the Space page.
5. Your embed URL is: `https://<your-username>-kokoro-tts.hf.space`

## Wire it into the portfolio

In `src/constants/index.js`, replace the `text-to-speech` entry's fields:

```js
type: "gradio",
src: "https://<your-username>-kokoro-tts.hf.space",
```

(or keep the in-browser tool and add the Space as a *second* tool entry,
e.g. slug `neural-tts` — both can coexist in The Lab).

## Notes

- Free CPU Spaces sleep after ~48h of inactivity; the first visit wakes them
  (takes ~30s). That's normal.
- English voices only for now. Kokoro also supports ja/zh/es/fr/hi/it/pt —
  add voices to the `VOICES` dict and matching `lang_code` pipelines.
