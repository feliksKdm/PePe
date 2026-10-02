---
title: Z-Image Turbo
emoji: ⚡
colorFrom: purple
colorTo: blue
sdk: gradio
sdk_version: 5.50.0
app_file: app.py
pinned: false
license: apache-2.0
short_description: Z-Image-Turbo text-to-image (8 steps) on ZeroGPU
---

# Z-Image Turbo

Turbo text-to-image backend for the Image Studio on Feliks Altymyshov's portfolio.
Source: `hf-spaces/turbo-models`, with the Space variable `MODEL_KEY=zimage`.
API: `/generate` returns `[image, meta, error]`; `/models` returns the model keys this Space can serve.
