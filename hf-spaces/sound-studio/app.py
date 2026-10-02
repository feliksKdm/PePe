"""
Sound Studio — text-to-sound-effects (AudioLDM2) and text-to-music (MusicGen)
on ZeroGPU, for Feliks Altymyshov's portfolio.

The portfolio calls `/generate` through its own proxy; errors travel as data:
[audio, meta, error].
"""

import random
import time
import traceback

import gradio as gr
import numpy as np
import spaces
import torch
from diffusers import AudioLDM2Pipeline
from transformers import AutoProcessor, MusicgenForConditionalGeneration

MAX_PROMPT = 300
LIMITS = {"sfx": (1, 10), "music": (5, 20)}  # seconds

sfx_pipe = AudioLDM2Pipeline.from_pretrained("cvssp/audioldm2", torch_dtype=torch.float16).to("cuda")
SFX_RATE = 16_000

music_processor = AutoProcessor.from_pretrained("facebook/musicgen-medium")
music_model = MusicgenForConditionalGeneration.from_pretrained(
    "facebook/musicgen-medium", torch_dtype=torch.float16
).to("cuda")
MUSIC_RATE = music_model.config.audio_encoder.sampling_rate


def _duration(prompt, kind, seconds, seed):
    return 30 if kind == "sfx" else min(90, 20 + int(seconds) * 2)


@spaces.GPU(duration=_duration)
def render(prompt, kind, seconds, seed):
    torch.manual_seed(seed)
    if kind == "sfx":
        generator = torch.Generator("cuda").manual_seed(seed)
        audio = sfx_pipe(
            prompt,
            negative_prompt="low quality, noise, distortion",
            num_inference_steps=100,
            audio_length_in_s=float(seconds),
            num_waveforms_per_prompt=1,
            generator=generator,
        ).audios[0]
        return SFX_RATE, np.asarray(audio, dtype=np.float32)
    inputs = music_processor(text=[prompt], padding=True, return_tensors="pt").to("cuda")
    tokens = int(seconds * music_model.config.audio_encoder.frame_rate)
    with torch.inference_mode():
        out = music_model.generate(**inputs, do_sample=True, guidance_scale=3.0, max_new_tokens=tokens)
    return MUSIC_RATE, out[0, 0].float().cpu().numpy()


def _normalize(audio):
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 0:
        audio = audio / peak * 0.95
    # 15 ms fades so clips start and stop without clicks.
    n = min(len(audio) // 2, 240)
    if n:
        ramp = np.linspace(0, 1, n, dtype=np.float32)
        audio[:n] *= ramp
        audio[-n:] *= ramp[::-1]
    return audio


def generate(prompt, kind, seconds, seed):
    """API: returns (audio, meta, error)."""
    try:
        prompt = (prompt or "").strip()
        if not prompt:
            return None, None, "Describe the sound you want first."
        if len(prompt) > MAX_PROMPT:
            return None, None, f"Keep the prompt under {MAX_PROMPT} characters."
        if kind not in LIMITS:
            return None, None, "Unknown kind — use sfx or music."
        lo, hi = LIMITS[kind]
        seconds = int(min(max(float(seconds or lo), lo), hi))
        seed = int(seed) if seed not in (None, "", -1) and int(seed) >= 0 else random.randint(0, 2**31 - 1)

        t0 = time.perf_counter()
        rate, audio = render(prompt, kind, seconds, seed)
        audio = _normalize(np.asarray(audio, dtype=np.float32))
        meta = {
            "kind": kind,
            "prompt": prompt,
            "seconds": seconds,
            "seed": seed,
            "rate": rate,
            "model": "AudioLDM2" if kind == "sfx" else "MusicGen Medium",
            "elapsed": round(time.perf_counter() - t0, 2),
        }
        return (rate, audio), meta, ""
    except gr.Error as exc:
        return None, None, str(exc.message)
    except Exception as exc:
        traceback.print_exc()
        return None, None, f"Generation failed ({type(exc).__name__}). Please try again."


def ui_generate(prompt, kind_label, seconds):
    audio, meta, error = generate(prompt, "sfx" if kind_label.startswith("Sound") else "music", seconds, -1)
    if error:
        raise gr.Error(error)
    return audio


with gr.Blocks(title="Sound Studio") as demo:
    gr.Markdown(
        "# 🎧 Sound Studio\nText-to-sound effects (AudioLDM2) and text-to-music (MusicGen) on ZeroGPU. "
        "Part of [Feliks Altymyshov's](https://github.com/feliksKdm) portfolio lab."
    )
    with gr.Row():
        with gr.Column():
            prompt = gr.Textbox(label="Prompt", lines=3, max_length=MAX_PROMPT)
            kind = gr.Radio(["Sound effect", "Music"], value="Sound effect", label="Kind")
            seconds = gr.Slider(1, 30, value=8, step=1, label="Seconds")
            btn = gr.Button("Generate", variant="primary")
        out = gr.Audio(label="Result", format="mp3")
    btn.click(ui_generate, [prompt, kind, seconds], out, api_name=False)

    with gr.Group(visible=False):
        a_prompt, a_kind = gr.Textbox(), gr.Textbox()
        a_seconds, a_seed = gr.Number(), gr.Number()
        a_audio = gr.Audio(type="numpy", format="mp3")
        a_meta = gr.JSON()
        a_error = gr.Textbox()
        a_btn = gr.Button()
    a_btn.click(generate, [a_prompt, a_kind, a_seconds, a_seed], [a_audio, a_meta, a_error], api_name="generate")

if __name__ == "__main__":
    demo.queue(default_concurrency_limit=2).launch()
