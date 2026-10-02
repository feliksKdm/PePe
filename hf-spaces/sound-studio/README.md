---
title: Sound Studio
emoji: 🎧
colorFrom: indigo
colorTo: pink
sdk: gradio
sdk_version: 5.50.0
app_file: app.py
pinned: false
license: cc-by-nc-4.0
short_description: Text-to-sound effects and music (AudioLDM2, MusicGen)
---

# Sound Studio

Text-to-audio backend for the Sound Studio on Feliks Altymyshov's portfolio.

- **Sound effects:** `cvssp/audioldm2` (CC BY-NC-SA 4.0), 16 kHz.
- **Music:** `facebook/musicgen-medium` (CC BY-NC 4.0), 32 kHz.
- **Hardware:** ZeroGPU. Non-commercial models: for demos and personal use.
- **API:** `/generate` takes `(prompt, kind, seconds, seed)` and returns
  `[audio, meta, error]`, where `kind` is `"sfx"` or `"music"`.

Redeploy: `hf upload feliksKdm/sound-studio hf-spaces/sound-studio . --type space`
