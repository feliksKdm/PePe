---
title: Video Studio
emoji: 🎬
colorFrom: purple
colorTo: red
sdk: gradio
sdk_version: 5.50.0
app_file: app.py
pinned: false
license: apache-2.0
short_description: Text-to-video with Wan2.1-T2V-1.3B on ZeroGPU
---

# Video Studio

Text-to-video backend for the Video Generator on Feliks Altymyshov's portfolio:
`Wan-AI/Wan2.1-T2V-1.3B-Diffusers` (Apache-2.0) on ZeroGPU, rendering short
480p clips.

- **Safety:** explicit prompts are refused, and sample frames are checked with
  `Falconsai/nsfw_image_detection`.
- **API:** `/generate` takes `(prompt, aspect, seconds, seed)` and returns
  `[video, meta, error]`.

Redeploy: `hf upload feliksKdm/video-studio hf-spaces/video-studio . --type space`
