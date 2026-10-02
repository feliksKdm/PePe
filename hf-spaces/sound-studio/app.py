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
from scipy.signal import butter, sosfilt
from transformers import AutoProcessor, MusicgenForConditionalGeneration

MAX_PROMPT = 300
LIMITS = {"sfx": (1, 10), "music": (5, 20)}  # seconds

sfx_pipe = AudioLDM2Pipeline.from_pretrained("cvssp/audioldm2", torch_dtype=torch.float16).to("cuda")
SFX_RATE = 16_000

# Stable Audio Open (44.1 kHz stereo) sounds far more natural for effects, but
# it's gated: it loads only once the owner has accepted its license and the
# Space has an HF_TOKEN secret. Until then, effects fall back to AudioLDM2.
stable_audio = None
try:
    from diffusers import StableAudioPipeline

    stable_audio = StableAudioPipeline.from_pretrained(
        "stabilityai/stable-audio-open-1.0", torch_dtype=torch.float16
    ).to("cuda")
    print("Stable Audio Open loaded", flush=True)
except Exception as exc:
    print(f"Stable Audio Open unavailable, using AudioLDM2 for effects: {type(exc).__name__}: {exc}", flush=True)

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
    if kind == "sfx" and stable_audio is not None:
        generator = torch.Generator("cuda").manual_seed(seed)
        audio = stable_audio(
            prompt,
            negative_prompt="low quality, distorted, noisy, clipping, music",
            num_inference_steps=100,
            audio_end_in_s=float(seconds),
            num_waveforms_per_prompt=1,
            generator=generator,
        ).audios[0]  # (channels, samples)
        return stable_audio.vae.sampling_rate, audio.float().cpu().numpy().T
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


# Loudness targets (RMS, dBFS). Peak-normalizing every clip to full scale made
# quiet effects and background noise blast at maximum volume.
TARGET_RMS_DB = {"sfx": -20.0, "music": -18.0}
# -4 dBFS leaves headroom for MP3 overshoot on sharp transients (clicks, glass).
PEAK_CEILING = 10 ** (-4.0 / 20)


def _master(audio, rate, kind):
    """Remove rumble, level by loudness, cap the peak, and fade the edges."""
    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim == 1:
        audio = audio[:, None]
    audio = audio - audio.mean(axis=0, keepdims=True)
    sos = butter(2, 30, btype="highpass", fs=rate, output="sos")
    audio = sosfilt(sos, audio, axis=0).astype(np.float32)

    # Measure loudness on the louder half of 50 ms windows, so silence and
    # gaps don't make a sparse effect get boosted.
    win = max(1, int(rate * 0.05))
    mono = audio.mean(axis=1)
    frames = mono[: len(mono) // win * win].reshape(-1, win) if len(mono) >= win else mono[None, :]
    rms = np.sqrt((frames**2).mean(axis=1) + 1e-12)
    active = np.sort(rms)[len(rms) // 2 :]
    level = float(np.sqrt((active**2).mean())) if active.size else 0.0
    if level > 0:
        audio *= 10 ** (TARGET_RMS_DB[kind] / 20) / level
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > PEAK_CEILING:
        audio *= PEAK_CEILING / peak

    # Short fade-in; a longer, natural fade-out (2 s for music).
    fade_in = min(len(audio) // 4, int(rate * 0.03))
    fade_out = min(len(audio) // 3, int(rate * (2.0 if kind == "music" else 0.3)))
    if fade_in:
        audio[:fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)[:, None]
    if fade_out:
        audio[-fade_out:] *= (np.linspace(1, 0, fade_out, dtype=np.float32) ** 2)[:, None]
    return audio if audio.shape[1] > 1 else audio[:, 0]


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
        audio = _master(audio, rate, kind)
        meta = {
            "kind": kind,
            "prompt": prompt,
            "seconds": seconds,
            "seed": seed,
            "rate": rate,
            "model": ("Stable Audio Open" if stable_audio is not None else "AudioLDM2") if kind == "sfx" else "MusicGen Medium",
            "elapsed": round(time.perf_counter() - t0, 2),
        }
        # Hand Gradio int16: given float audio it rescales to full scale on
        # export, which undoes the mastering above.
        pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16)
        return (rate, pcm), meta, ""
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
