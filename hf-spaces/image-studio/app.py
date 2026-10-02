"""
Image Studio — SDXL text-to-image on ZeroGPU, for Feliks Altymyshov's portfolio.

Three community checkpoints ("models", Civitai-style), style presets that
wrap the prompt, aspect-ratio presets, and a safety filter: explicit prompts
are refused up front, and every image passes an NSFW classifier before it is
returned.

The portfolio calls `/generate` through its own proxy. Like the other lab
Spaces, the API returns errors as data — [image, meta, error] — because
Gradio's HTTP API doesn't reliably forward exception text.
"""

import random
import re
import time
import traceback

import gradio as gr
import numpy as np
import spaces
import torch
from diffusers import (
    AutoencoderKL,
    DPMSolverMultistepScheduler,
    EulerAncestralDiscreteScheduler,
    StableDiffusionXLPipeline,
)
from huggingface_hub import hf_hub_download
from PIL import Image
from spandrel import ImageModelDescriptor, ModelLoader
from transformers import pipeline as hf_pipeline

MAX_PROMPT = 500
MAX_SEED = 2**31 - 1
NSFW_THRESHOLD = 0.5

BASE_NEGATIVE = "nsfw, nude, naked, explicit, lowres, worst quality, low quality, blurry, jpeg artifacts, watermark, signature, text, logo"

MODELS = {
    "dreamshaper": dict(
        repo="Lykon/dreamshaper-xl-lightning",
        label="DreamShaper XL Lightning",
        steps=6,
        cfg=2.0,
        scheduler="dpmpp_karras",
        negative="deformed, disfigured, bad anatomy, extra limbs",
        suffix="",
    ),
    "realvis": dict(
        repo="SG161222/RealVisXL_V4.0_Lightning",
        label="RealVisXL V4 Lightning",
        steps=6,
        cfg=1.5,
        scheduler="dpmpp_karras",
        negative="face asymmetry, eyes asymmetry, deformed eyes, deformed, disfigured, bad anatomy, cartoon, painting, illustration, 3d render",
        suffix="",
    ),
    "animagine": dict(
        repo="cagliostrolab/animagine-xl-4.0",
        label="Animagine XL 4.0",
        steps=24,
        cfg=5.0,
        scheduler="euler_a",
        negative="bad anatomy, bad hands, missing finger, extra digits, fewer digits, cropped, low score, bad score, average score, username",
        suffix=", masterpiece, high score, great score, absurdres",
    ),
}

# Prompt templates, applied around the visitor's prompt.
STYLES = {
    "none": ("No style", "{prompt}", ""),
    "cinematic": ("Cinematic", "cinematic film still of {prompt}, anamorphic lens, shallow depth of field, dramatic lighting, film grain, teal and orange color grading", "anime, cartoon, illustration, drawing"),
    "photo": ("Photographic", "professional photograph of {prompt}, 50mm lens, natural light, sharp focus, highly detailed, realistic", "drawing, painting, anime, cartoon, illustration"),
    "anime": ("Anime", "anime illustration of {prompt}, anime style, cel shading, vibrant colors, clean lineart, key visual", "photo, realistic, 3d"),
    "digital-art": ("Digital Art", "digital painting of {prompt}, concept art, illustrative, painterly brush strokes, matte painting, artstation", "photo, realistic"),
    "fantasy": ("Fantasy", "epic fantasy art of {prompt}, magical, ethereal glow, majestic, dreamlike, painterly, fantasy illustration", "photo, realistic, mundane"),
    "neon-punk": ("Neon Punk", "neon cyberpunk style {prompt}, glowing neon lights, magenta and cyan, synthwave, vaporwave, high contrast, dark background", "dull, desaturated, daylight"),
    "3d": ("3D Render", "stylized 3d render of {prompt}, cute 3d animation style, clay-like materials, soft studio lighting, octane render, blender", "photo, painting, sketch, realistic"),
    "pixel-art": ("Pixel Art", "pixel art of {prompt}, 16-bit retro video game style, pixelated, limited color palette, crisp pixels", "photo, realistic, smooth, blurry, 3d"),
    "watercolor": ("Watercolor", "watercolor painting of {prompt}, wet-on-wet watercolor, visible paper texture, soft bleeding edges, loose brushwork", "photo, 3d render, sharp, digital"),
    "line-art": ("Line Art", "black and white line art drawing of {prompt}, ink lineart, monochrome, clean outlines, minimalist, vector illustration, white background", "photo, color, colorful, shading, realistic"),
}

ASPECTS = {
    "1:1": (1024, 1024),
    "4:3": (1152, 896),
    "3:4": (896, 1152),
    "16:9": (1344, 768),
    "9:16": (768, 1344),
}

# Refuse obviously explicit prompts before spending any GPU time. The image
# classifier below is the real backstop; this just saves quota.
BLOCKED = re.compile(
    r"\b(nude|nudity|naked|nsfw|porn\w*|sex\w*|hentai|genitals?|nipples?|topless|lingerie|erotic\w*|fetish\w*|gore|beheaded|dismember\w*)\b",
    re.IGNORECASE,
)

vae = AutoencoderKL.from_pretrained("madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16)
pipes = {}
for key, m in MODELS.items():
    pipe = StableDiffusionXLPipeline.from_pretrained(
        m["repo"], vae=vae, torch_dtype=torch.float16, use_safetensors=True
    )
    if m["scheduler"] == "euler_a":
        pipe.scheduler = EulerAncestralDiscreteScheduler.from_config(pipe.scheduler.config)
    else:
        pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True)
    pipes[key] = pipe.to("cuda")

safety = hf_pipeline("image-classification", model="Falconsai/nsfw_image_detection", device="cuda")

# Real-ESRGAN x4 (BSD-3) for the upscaler, loaded through spandrel.
MAX_UPSCALE_INPUT = 1024  # longest side; x4 → up to 4096px
_esrgan = ModelLoader().load_from_file(hf_hub_download("ai-forever/Real-ESRGAN", "RealESRGAN_x4.pth"))
assert isinstance(_esrgan, ImageModelDescriptor)
esrgan = _esrgan.model.to("cuda").eval().half()


@spaces.GPU(duration=30)
def render(model, prompt, negative, width, height, seed):
    m = MODELS[model]
    generator = torch.Generator("cuda").manual_seed(seed)
    image = pipes[model](
        prompt=prompt,
        negative_prompt=negative,
        width=width,
        height=height,
        num_inference_steps=m["steps"],
        guidance_scale=m["cfg"],
        generator=generator,
    ).images[0]
    scores = {r["label"]: r["score"] for r in safety(image)}
    return image, scores.get("nsfw", 0.0)


@spaces.GPU(duration=40)
def upscale_x4(image):
    """4x upscale in 384px tiles (with overlap) so any input fits in memory."""
    x = torch.from_numpy(np.asarray(image)).permute(2, 0, 1)[None].half().div(255).to("cuda")
    _, _, h, w = x.shape
    tile, pad, s = 384, 16, 4
    out = torch.zeros((1, 3, h * s, w * s), dtype=torch.half, device="cuda")
    with torch.inference_mode():
        for y0 in range(0, h, tile):
            for x0 in range(0, w, tile):
                y1, x1 = min(y0 + tile, h), min(x0 + tile, w)
                py0, px0 = max(y0 - pad, 0), max(x0 - pad, 0)
                py1, px1 = min(y1 + pad, h), min(x1 + pad, w)
                part = esrgan(x[:, :, py0:py1, px0:px1])
                out[:, :, y0 * s:y1 * s, x0 * s:x1 * s] = part[
                    :, :, (y0 - py0) * s:(y0 - py0 + y1 - y0) * s, (x0 - px0) * s:(x0 - px0 + x1 - x0) * s
                ]
        result = out.clamp(0, 1).mul(255).round().byte()[0].permute(1, 2, 0).cpu().numpy()
        scores = {r["label"]: r["score"] for r in safety(image)}
    return Image.fromarray(result), scores.get("nsfw", 0.0)


def upscale(path, scale):
    """API: upscale an uploaded image x2 or x4. Returns (image, meta, error)."""
    try:
        if not path:
            return None, None, "Upload an image first."
        scale = 4 if int(scale or 4) >= 4 else 2
        image = Image.open(path).convert("RGB")
        if max(image.size) > MAX_UPSCALE_INPUT:
            image.thumbnail((MAX_UPSCALE_INPUT, MAX_UPSCALE_INPUT), Image.LANCZOS)
        t0 = time.perf_counter()
        result, nsfw = upscale_x4(image)
        if nsfw > NSFW_THRESHOLD:
            return None, None, "The safety filter blocked this image."
        if scale == 2:
            result = result.resize((image.width * 2, image.height * 2), Image.LANCZOS)
        meta = {
            "scale": scale,
            "input": [image.width, image.height],
            "width": result.width,
            "height": result.height,
            "seconds": round(time.perf_counter() - t0, 2),
        }
        return result, meta, ""
    except gr.Error as exc:
        return None, None, str(exc.message)
    except Exception as exc:
        traceback.print_exc()
        return None, None, f"Upscaling failed ({type(exc).__name__}). Please try another image."


def generate(prompt, model, style, aspect, seed):
    """API: one image. Returns (image, meta, error)."""
    try:
        prompt = (prompt or "").strip()
        if not prompt:
            return None, None, "Describe what you want to see first."
        if len(prompt) > MAX_PROMPT:
            return None, None, f"Keep the prompt under {MAX_PROMPT} characters."
        if model not in MODELS or style not in STYLES or aspect not in ASPECTS:
            return None, None, "Unknown model, style or aspect ratio."
        if BLOCKED.search(prompt):
            return None, None, "This lab only makes safe-for-work images — try a different prompt."

        seed = int(seed) if seed not in (None, "", -1) and int(seed) >= 0 else random.randint(0, MAX_SEED)
        seed = min(seed, MAX_SEED)
        m = MODELS[model]
        _, template, style_negative = STYLES[style]
        full_prompt = template.format(prompt=prompt) + m["suffix"]
        negative = ", ".join(x for x in (BASE_NEGATIVE, m["negative"], style_negative) if x)
        width, height = ASPECTS[aspect]

        t0 = time.perf_counter()
        image, nsfw = render(model, full_prompt, negative, width, height, seed)
        if nsfw > NSFW_THRESHOLD:
            print(f"blocked by safety filter (nsfw={nsfw:.2f}): {prompt!r}", flush=True)
            return None, None, "The safety filter blocked this image. Try rephrasing your prompt."
        meta = {
            "model": model,
            "model_label": m["label"],
            "style": style,
            "aspect": aspect,
            "seed": seed,
            "steps": m["steps"],
            "cfg": m["cfg"],
            "width": width,
            "height": height,
            "prompt": prompt,
            "seconds": round(time.perf_counter() - t0, 2),
        }
        return image, meta, ""
    except gr.Error as exc:  # e.g. ZeroGPU quota
        return None, None, str(exc.message)
    except Exception as exc:
        traceback.print_exc()
        return None, None, f"Generation failed ({type(exc).__name__}). Please try again."


def ui_generate(prompt, model_label, style_label, aspect, seed):
    model = next(k for k, m in MODELS.items() if m["label"] == model_label)
    style = next(k for k, s in STYLES.items() if s[0] == style_label)
    image, meta, error = generate(prompt, model, style, aspect, -1 if seed is None else seed)
    if error:
        raise gr.Error(error)
    return image, f"Seed {meta['seed']} · {meta['seconds']}s"


with gr.Blocks(title="Image Studio") as demo:
    gr.Markdown(
        "# 🎨 Image Studio\nSDXL Lightning text-to-image on ZeroGPU. Part of "
        "[Feliks Altymyshov's](https://github.com/feliksKdm) portfolio lab."
    )
    with gr.Row():
        with gr.Column():
            prompt = gr.Textbox(label="Prompt", lines=3, max_length=MAX_PROMPT)
            model = gr.Dropdown([m["label"] for m in MODELS.values()], value=MODELS["dreamshaper"]["label"], label="Model")
            style = gr.Dropdown([s[0] for s in STYLES.values()], value="No style", label="Style")
            aspect = gr.Radio(list(ASPECTS), value="1:1", label="Aspect ratio")
            seed = gr.Number(value=-1, label="Seed (-1 = random)", precision=0)
            btn = gr.Button("Generate", variant="primary")
        with gr.Column():
            out = gr.Image(label="Result", format="webp")
            info = gr.Markdown()
    btn.click(ui_generate, [prompt, model, style, aspect, seed], [out, info], api_name=False)

    # Headless endpoint for the portfolio site.
    with gr.Group(visible=False):
        a_prompt, a_model, a_style, a_aspect = gr.Textbox(), gr.Textbox(), gr.Textbox(), gr.Textbox()
        a_seed = gr.Number()
        a_image = gr.Image(type="pil", format="webp")
        a_meta = gr.JSON()
        a_error = gr.Textbox()
        a_btn = gr.Button()
    a_btn.click(generate, [a_prompt, a_model, a_style, a_aspect, a_seed], [a_image, a_meta, a_error], api_name="generate")

    with gr.Group(visible=False):
        u_in = gr.Image(type="filepath")
        u_scale = gr.Number()
        u_out = gr.Image(type="pil", format="webp")
        u_meta = gr.JSON()
        u_error = gr.Textbox()
        u_btn = gr.Button()
    u_btn.click(upscale, [u_in, u_scale], [u_out, u_meta, u_error], api_name="upscale")

if __name__ == "__main__":
    demo.queue(default_concurrency_limit=2).launch()
