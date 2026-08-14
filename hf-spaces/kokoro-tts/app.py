"""
Feliks TTS — neural text-to-speech on Kokoro-82M.
Deployed as a Hugging Face Space (free CPU tier is enough for this model).
"""

import gradio as gr
import numpy as np
from kokoro import KPipeline

SAMPLE_RATE = 24_000
MAX_CHARS = 3_000

# label -> kokoro voice id (prefix letter = language: a=US English, b=UK English)
VOICES = {
    "Heart — US female": "af_heart",
    "Bella — US female": "af_bella",
    "Nicole — US female (whisper)": "af_nicole",
    "Adam — US male": "am_adam",
    "Michael — US male": "am_michael",
    "Emma — UK female": "bf_emma",
    "George — UK male": "bm_george",
}

# One pipeline per language code, created on first use
_pipelines: dict[str, KPipeline] = {}


def get_pipeline(lang_code: str) -> KPipeline:
    if lang_code not in _pipelines:
        _pipelines[lang_code] = KPipeline(lang_code=lang_code, repo_id="hexgrad/Kokoro-82M")
    return _pipelines[lang_code]


def synthesize(text: str, voice_label: str, speed: float):
    text = (text or "").strip()
    if not text:
        raise gr.Error("Type some text first.")
    if len(text) > MAX_CHARS:
        raise gr.Error(f"Keep it under {MAX_CHARS} characters ({len(text)} given).")

    voice = VOICES[voice_label]
    pipeline = get_pipeline(voice[0])  # 'a' or 'b'

    segments = [audio.numpy() for _, _, audio in pipeline(text, voice=voice, speed=speed)]
    if not segments:
        raise gr.Error("Nothing to synthesize — try different text.")
    return SAMPLE_RATE, np.concatenate(segments)


demo = gr.Interface(
    fn=synthesize,
    inputs=[
        gr.Textbox(
            lines=6,
            max_length=MAX_CHARS,
            label="Text",
            placeholder="Type or paste anything…",
        ),
        gr.Dropdown(
            choices=list(VOICES.keys()),
            value="Heart — US female",
            label="Voice",
        ),
        gr.Slider(0.5, 2.0, value=1.0, step=0.1, label="Speed"),
    ],
    outputs=gr.Audio(label="Speech", type="numpy"),
    title="Feliks TTS",
    description=(
        "Neural text-to-speech on **Kokoro-82M**. "
        "Part of [Feliks Altymyshov's](https://github.com/feliksKdm) portfolio lab."
    ),
    flagging_mode="never",
)

if __name__ == "__main__":
    demo.launch()
