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
import spaces
import torch
from diffusers import (
    AutoencoderKL,
    DPMSolverMultistepScheduler,
    EulerAncestralDiscreteScheduler,
    StableDiffusionXLPipeline,
)
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

if __name__ == "__main__":
    demo.queue(default_concurrency_limit=2).launch()
