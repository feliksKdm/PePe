---
title: Image Studio
emoji: 🎨
colorFrom: purple
colorTo: pink
sdk: gradio
sdk_version: 5.50.0
app_file: app.py
pinned: false
license: openrail++
short_description: SDXL Lightning text-to-image for Feliks's portfolio lab
---

# Image Studio

Text-to-image backend for the Image Studio on Feliks Altymyshov's portfolio.

- **Models:** DreamShaper XL Lightning (versatile art), RealVisXL V4 Lightning
  (photoreal), Animagine XL 4.0 (anime). All are SDXL and CreativeML OpenRAIL++-M.
- **Hardware:** ZeroGPU.
- **Safety:** explicit prompts are refused before any GPU time is spent, and
  every image is checked with `Falconsai/nsfw_image_detection` before it is
  returned.
- **API:** `/generate` takes `(prompt, model, style, aspect, seed)` and returns
  `[image, meta, error]`. Errors come back as data, not exceptions.

Redeploy: `hf upload feliksKdm/image-studio hf-spaces/image-studio . --type space`
