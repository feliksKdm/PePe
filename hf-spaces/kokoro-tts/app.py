"""
Feliks TTS — neural text-to-speech on Kokoro-82M, served from a ZeroGPU Space.

Two ways in:
  • the Gradio UI on the Space page, for people visiting it directly;
  • the `/speak` API, which the portfolio's Text-to-Speech tool streams from.
    It takes pre-split chunks and yields one audio chunk at a time, so the
    site can start playing the first sentence while the rest is rendered.

GPU calls go through ZeroGPU; if a visitor's GPU quota runs out, each chunk
falls back to the CPU copy of the model instead of failing.
"""

import base64
import json
import time

import gradio as gr
import numpy as np
import spaces
import torch
from kokoro import KModel, KPipeline

SAMPLE_RATE = 24_000
MAX_CHARS = 5_000
CUDA_AVAILABLE = torch.cuda.is_available()

# The ten voices offered on the portfolio — the best-graded Kokoro voices,
# balanced across accent and gender. Prefix: a = US English, b = UK English.
VOICES = {
    "Heart · US female": "af_heart",
    "Bella · US female": "af_bella",
    "Nicole · US female": "af_nicole",
    "Aoede · US female": "af_aoede",
    "Sarah · US female": "af_sarah",
    "Emma · UK female": "bf_emma",
    "Michael · US male": "am_michael",
    "Fenrir · US male": "am_fenrir",
    "Puck · US male": "am_puck",
    "George · UK male": "bm_george",
}
VOICE_IDS = set(VOICES.values())

models = {gpu: KModel().to("cuda" if gpu else "cpu").eval() for gpu in [False] + ([True] if CUDA_AVAILABLE else [])}
pipelines = {code: KPipeline(lang_code=code, model=False) for code in "ab"}
pipelines["a"].g2p.lexicon.golds["kokoro"] = "kˈOkəɹO"
pipelines["b"].g2p.lexicon.golds["kokoro"] = "kˈQkəɹQ"
for v in VOICE_IDS:  # cache voice packs at boot, not on a visitor's first request
    pipelines[v[0]].load_voice(v)


# A short reservation keeps calls inside even an anonymous visitor's quota;
# one chunk takes well under a second on the GPU.
@spaces.GPU(duration=10)
def forward_gpu(ps, ref_s, speed):
    return models[True](ps, ref_s, speed)


def synthesize(text, voice, speed, use_gpu):
    """Render one piece of text; returns (float32 audio, used_gpu)."""
    pipeline = pipelines[voice[0]]
    pack = pipeline.load_voice(voice)
    parts = []
    for _, ps, _ in pipeline(text, voice, speed):
        ref_s = pack[len(ps) - 1]
        audio = None
        if use_gpu:
            try:
                audio = forward_gpu(ps, ref_s, speed)
            except Exception as exc:  # quota exhausted, GPU busy… — degrade, don't fail
                print("GPU unavailable, using CPU:", exc)
                use_gpu = False
        if audio is None:
            audio = models[False](ps, ref_s, speed)
        parts.append(audio.cpu().numpy())
    audio = np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)
    return audio.astype(np.float32), use_gpu


def validate(voice, speed):
    if voice not in VOICE_IDS:
        raise gr.Error("Unknown voice.")
    return float(min(max(speed or 1.0, 0.5), 2.0))


def speak(chunks_json, voice, speed):
    """API: stream audio for a JSON list of text chunks, one event per chunk.

    Each event is {"i", "sr", "pcm" (base64 little-endian int16), "gen" (seconds)}.
    """
    speed = validate(voice, speed)
    try:
        chunks = [str(c) for c in json.loads(chunks_json)]
    except (TypeError, ValueError):
        raise gr.Error("chunks must be a JSON list of strings.")
    if sum(len(c) for c in chunks) > MAX_CHARS:
        raise gr.Error(f"Keep it under {MAX_CHARS} characters.")

    use_gpu = CUDA_AVAILABLE
    for i, chunk in enumerate(chunks):
        t0 = time.perf_counter()
        audio, use_gpu = synthesize(chunk, voice, speed, use_gpu)
        pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
        yield {
            "i": i,
            "sr": SAMPLE_RATE,
            "pcm": base64.b64encode(pcm).decode("ascii"),
            "gen": round(time.perf_counter() - t0, 3),
        }


def ui_generate(text, voice_label, speed):
    text = (text or "").strip()
    if not text:
        raise gr.Error("Type some text first.")
    if len(text) > MAX_CHARS:
        raise gr.Error(f"Keep it under {MAX_CHARS} characters ({len(text)} given).")
    voice = VOICES[voice_label]
    audio, _ = synthesize(text, voice, validate(voice, speed), CUDA_AVAILABLE)
    return SAMPLE_RATE, audio


with gr.Blocks(title="Feliks TTS") as demo:
    gr.Markdown(
        "# Feliks TTS\nNeural text-to-speech on **Kokoro-82M**, running on ZeroGPU. "
        "Part of [Feliks Altymyshov's](https://github.com/feliksKdm) portfolio lab."
    )
    with gr.Row():
        with gr.Column():
            text = gr.Textbox(lines=6, max_length=MAX_CHARS, label="Text", placeholder="Type or paste anything…")
            voice = gr.Dropdown(choices=list(VOICES), value="Heart · US female", label="Voice")
            speed = gr.Slider(0.5, 2.0, value=1.0, step=0.1, label="Speed")
            btn = gr.Button("Speak", variant="primary")
        out = gr.Audio(label="Speech", type="numpy", autoplay=True)
    btn.click(ui_generate, [text, voice, speed], out, api_name="generate")

    # Headless streaming endpoint for the portfolio site.
    api_in = [gr.Textbox(visible=False), gr.Textbox(visible=False), gr.Number(visible=False)]
    api_out = gr.JSON(visible=False)
    gr.Button(visible=False).click(speak, api_in, api_out, api_name="speak")

if __name__ == "__main__":
    demo.queue(default_concurrency_limit=4).launch()
