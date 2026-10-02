# Song Studio (ACE-Step 1.5)

Fork of the official ZeroGPU Space [`ACE-Step/Ace-Step-v1.5`](https://huggingface.co/spaces/ACE-Step/Ace-Step-v1.5),
deployed as [`feliksKdm/song-studio`](https://huggingface.co/spaces/feliksKdm/song-studio). Only
`app.py` is kept here; it adds a headless `/song` endpoint for the portfolio's Sound Studio:

- **Inputs:** `(description, lyrics, instrumental, seconds, seed)`.
- **Simple mode:** with empty lyrics, ACE-Step's LM writes the caption and lyrics itself.
- **Output:** `[audio, meta, error]`. Audio is mastered to about −14 dBFS (loud half, −3 dBFS ceiling)
  and returned as int16, so Gradio doesn't renormalize it.

Update: `hf upload feliksKdm/song-studio hf-spaces/song-studio/app.py app.py --type space`
