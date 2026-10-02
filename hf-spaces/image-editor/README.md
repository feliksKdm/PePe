---
title: Image Editor AI
emoji: 🪄
colorFrom: purple
colorTo: pink
sdk: gradio
sdk_version: 5.50.0
app_file: app.py
pinned: false
license: other
short_description: AI tools for the portfolio photo editor (Kontext, LaMa)
---

# Image Editor AI

AI backend for the Photo Editor on Feliks Altymyshov's portfolio.

- **`/erase`:** removes objects with LaMa (big-lama, Apache-2.0), given an image and a mask.
- **`/edit`:** instruction-based editing with FLUX.1 Kontext [dev], which is gated (FLUX.1 [dev]
  Non-Commercial License). It loads only once the owner has accepted the license and the Space has an
  `HF_TOKEN` secret; restart the Space afterwards.
- **`/models`:** lists the tools this Space can serve right now.

All endpoints return errors as data. Edit prompts are filtered, and every result passes an NSFW
classifier.

Redeploy: `hf upload feliksKdm/image-editor hf-spaces/image-editor . --type space`
