"""
Video Studio — text-to-video with Wan2.1-T2V-1.3B on ZeroGPU, for Feliks
Altymyshov's portfolio. Short 480p clips; errors travel as data:
[video, meta, error].
"""

import random
import re
import tempfile
import time
import traceback

import gradio as gr
import spaces
import torch
from diffusers import AutoencoderKLWan, UniPCMultistepScheduler, WanPipeline
from diffusers.utils import export_to_video
from transformers import pipeline as hf_pipeline

MODEL = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"
FPS = 16
MAX_PROMPT = 400
STEPS = 30
ASPECTS = {"16:9": (832, 480), "9:16": (480, 832), "1:1": (624, 624)}
SECONDS = {2: 33, 3: 49, 4: 65}  # Wan wants 4k+1 frames

NEGATIVE = (
    "nsfw, nude, explicit, gore, bright colors, overexposed, static, blurred details, subtitles, watermark, text, "
    "worst quality, low quality, jpeg artifacts, ugly, deformed, disfigured, extra fingers, poorly drawn hands, "
    "poorly drawn face, fused fingers, messy background, three legs, many people in the background, walking backwards"
)
BLOCKED = re.compile(
    r"\b(nude|nudity|naked|nsfw|porn\w*|sex\w*|hentai|genitals?|nipples?|topless|lingerie|erotic\w*|fetish\w*|gore|beheaded|dismember\w*)\b",
    re.IGNORECASE,
)

vae = AutoencoderKLWan.from_pretrained(MODEL, subfolder="vae", torch_dtype=torch.float32)
pipe = WanPipeline.from_pretrained(MODEL, vae=vae, torch_dtype=torch.bfloat16)
pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config, flow_shift=3.0)  # 3.0 suits 480p
pipe.to("cuda")
safety = hf_pipeline("image-classification", model="Falconsai/nsfw_image_detection", device="cuda")


def _duration(prompt, width, height, frames, seed):
    return 45 + frames  # ~1 s of GPU per frame at 30 steps, plus headroom


@spaces.GPU(duration=_duration)
def render(prompt, width, height, frames, seed):
    generator = torch.Generator("cuda").manual_seed(seed)
    video = pipe(
        prompt=prompt,
        negative_prompt=NEGATIVE,
        width=width,
        height=height,
        num_frames=frames,
        num_inference_steps=STEPS,
        guidance_scale=5.0,
        generator=generator,
    ).frames[0]
    checks = [video[i] for i in (0, len(video) // 2, len(video) - 1)]
    from PIL import Image
    import numpy as np
    images = [Image.fromarray((np.asarray(f) * 255).astype("uint8")) if np.asarray(f).dtype != np.uint8 else Image.fromarray(np.asarray(f)) for f in checks]
    nsfw = max({r["label"]: r["score"] for r in safety(im)}.get("nsfw", 0.0) for im in images)
    return video, nsfw


def generate(prompt, aspect, seconds, seed):
    """API: returns (video_path, meta, error)."""
    try:
        prompt = (prompt or "").strip()
        if not prompt:
            return None, None, "Describe the scene first."
        if len(prompt) > MAX_PROMPT:
            return None, None, f"Keep the prompt under {MAX_PROMPT} characters."
        if aspect not in ASPECTS:
            return None, None, "Unknown aspect ratio."
        if BLOCKED.search(prompt):
            return None, None, "This lab only makes safe-for-work videos — try a different prompt."
        seconds = int(seconds or 2)
        if seconds not in SECONDS:
            seconds = 2
        seed = int(seed) if seed not in (None, "", -1) and int(seed) >= 0 else random.randint(0, 2**31 - 1)
        width, height = ASPECTS[aspect]

        t0 = time.perf_counter()
        frames, nsfw = render(prompt, width, height, SECONDS[seconds], seed)
        if nsfw > 0.5:
            print(f"blocked by safety filter (nsfw={nsfw:.2f}): {prompt!r}", flush=True)
            return None, None, "The safety filter blocked this video. Try rephrasing your prompt."
        path = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False).name
        export_to_video(frames, path, fps=FPS)
        meta = {
            "prompt": prompt,
            "aspect": aspect,
            "width": width,
            "height": height,
            "frames": len(frames),
            "fps": FPS,
            "seconds": round(len(frames) / FPS, 2),
            "seed": seed,
            "steps": STEPS,
            "elapsed": round(time.perf_counter() - t0, 2),
        }
        return path, meta, ""
    except gr.Error as exc:
        return None, None, str(exc.message)
    except Exception as exc:
        traceback.print_exc()
        return None, None, f"Generation failed ({type(exc).__name__}). Please try again."


def ui_generate(prompt, aspect, seconds):
    path, meta, error = generate(prompt, aspect, seconds, -1)
    if error:
        raise gr.Error(error)
    return path


with gr.Blocks(title="Video Studio") as demo:
    gr.Markdown(
        "# 🎬 Video Studio\nText-to-video with Wan2.1-T2V-1.3B on ZeroGPU. Part of "
        "[Feliks Altymyshov's](https://github.com/feliksKdm) portfolio lab."
    )
    with gr.Row():
        with gr.Column():
            prompt = gr.Textbox(label="Prompt", lines=3, max_length=MAX_PROMPT)
            aspect = gr.Radio(list(ASPECTS), value="16:9", label="Aspect ratio")
            seconds = gr.Radio([2, 3, 4], value=2, label="Seconds")
            btn = gr.Button("Generate", variant="primary")
        out = gr.Video(label="Result")
    btn.click(ui_generate, [prompt, aspect, seconds], out, api_name=False)

    with gr.Group(visible=False):
        a_prompt, a_aspect = gr.Textbox(), gr.Textbox()
        a_seconds, a_seed = gr.Number(), gr.Number()
        a_video = gr.Video()
        a_meta = gr.JSON()
        a_error = gr.Textbox()
        a_btn = gr.Button()
    a_btn.click(generate, [a_prompt, a_aspect, a_seconds, a_seed], [a_video, a_meta, a_error], api_name="generate")

if __name__ == "__main__":
    demo.queue(default_concurrency_limit=1).launch()
