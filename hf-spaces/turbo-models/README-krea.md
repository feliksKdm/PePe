---
title: Krea 2 Turbo
emoji: ⚡
colorFrom: purple
colorTo: blue
sdk: gradio
sdk_version: 5.50.0
app_file: app.py
pinned: false
license: other
short_description: Krea 2 Turbo text-to-image (8 steps) on ZeroGPU
---

# Krea 2 Turbo

Turbo text-to-image backend for the Image Studio on Feliks Altymyshov's portfolio.
Source: `hf-spaces/turbo-models`, with the Space variable `MODEL_KEY=krea`.
API: `/generate` returns `[image, meta, error]`; `/models` returns the model keys this Space can serve.
