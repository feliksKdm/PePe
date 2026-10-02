"""
Turbo text-to-image Space for Feliks Altymyshov's portfolio Image Studio.

One file serves two Spaces, picked by the MODEL_KEY variable:
  • zimage — Tongyi-MAI/Z-Image-Turbo (Apache-2.0), 8 steps
  • krea   — krea/Krea-2-Turbo (Krea 2 Community License, gated), 8 steps

Same API as the SDXL Image Studio Space: /generate → [image, meta, error],
plus /models → the model keys this Space can actually serve right now (Krea
stays unavailable until the owner accepts its license on the Hub; restart the
Space afterwards). Both licenses require deployers to filter content: explicit
prompts are refused and every image passes an NSFW classifier.
"""

import os
import random
import re
import time
import traceback

import gradio as gr
import spaces
import torch
from transformers import pipeline as hf_pipeline

MODEL_KEY = os.environ.get("MODEL_KEY", "zimage")
MAX_PROMPT = 800
MAX_SEED = 2**31 - 1
NSFW_THRESHOLD = 0.5

CONFIGS = {
    "zimage": dict(repo="Tongyi-MAI/Z-Image-Turbo", label="Z-Image Turbo", steps=9, cfg=0.0, pipeline="ZImagePipeline"),
    "krea": dict(repo="krea/Krea-2-Turbo", label="Krea 2 Turbo", steps=8, cfg=0.0, pipeline="Krea2Pipeline"),
}
CFG = CONFIGS[MODEL_KEY]

STYLES = {
    "none": "{prompt}",
    "cinematic": "cinematic film still of {prompt}, anamorphic lens, shallow depth of field, dramatic lighting, film grain",
    "photo": "professional photograph of {prompt}, 50mm lens, natural light, sharp focus, highly detailed, realistic",
    "anime": "anime illustration of {prompt}, anime style, cel shading, vibrant colors, clean lineart, key visual",
    "digital-art": "digital painting of {prompt}, concept art, painterly brush strokes, matte painting",
    "fantasy": "epic fantasy art of {prompt}, magical, ethereal glow, majestic, dreamlike",
    "neon-punk": "neon cyberpunk style {prompt}, glowing neon lights, magenta and cyan, synthwave, high contrast",
    "3d": "stylized 3d render of {prompt}, cute 3d animation style, soft studio lighting, octane render",
    "pixel-art": "pixel art of {prompt}, 16-bit retro video game style, pixelated, limited color palette",
    "watercolor": "watercolor painting of {prompt}, wet-on-wet watercolor, paper texture, soft bleeding edges",
    "line-art": "black and white line art drawing of {prompt}, ink lineart, monochrome, clean outlines, white background",
}
ASPECTS = {"1:1": (1024, 1024), "4:3": (1152, 896), "3:4": (896, 1152), "16:9": (1344, 768), "9:16": (768, 1344)}
BLOCKED = re.compile(
    r"\b(nude|nudity|naked|nsfw|porn\w*|sex\w*|hentai|genitals?|nipples?|topless|lingerie|erotic\w*|fetish\w*|gore|beheaded|dismember\w*|undress\w*)\b",
    re.IGNORECASE,
)

pipe = None
load_error = ""
try:
    import diffusers

    pipe = getattr(diffusers, CFG["pipeline"]).from_pretrained(CFG["repo"], torch_dtype=torch.bfloat16).to("cuda")
except Exception as exc:  # gated license not accepted yet, download failure…
    load_error = f"{type(exc).__name__}: {exc}"
    print(f"{CFG['label']} unavailable: {load_error}", flush=True)

safety = hf_pipeline("image-classification", model="Falconsai/nsfw_image_detection", device="cuda")


@spaces.GPU(duration=40)
def render(prompt, width, height, seed):
    generator = torch.Generator("cuda").manual_seed(seed)
    image = pipe(
        prompt=prompt,
        width=width,
        height=height,
        num_inference_steps=CFG["steps"],
        guidance_scale=CFG["cfg"],
        generator=generator,
    ).images[0]
    scores = {r["label"]: r["score"] for r in safety(image)}
    return image, scores.get("nsfw", 0.0)


def models():
    """API: model keys this Space can serve right now."""
    return [MODEL_KEY] if pipe is not None else []


def generate(prompt, model, style, aspect, seed):
    """API: one image. Returns (image, meta, error)."""
    try:
        if pipe is None:
            return None, None, f"{CFG['label']} isn't available on this Space yet."
        prompt = (prompt or "").strip()
        if not prompt:
            return None, None, "Describe what you want to see first."
        if len(prompt) > MAX_PROMPT:
            return None, None, f"Keep the prompt under {MAX_PROMPT} characters."
        if model != MODEL_KEY or style not in STYLES or aspect not in ASPECTS:
            return None, None, "Unknown model, style or aspect ratio."
        if BLOCKED.search(prompt):
            return None, None, "This lab only makes safe-for-work images — try a different prompt."
        seed = int(seed) if seed not in (None, "", -1) and int(seed) >= 0 else random.randint(0, MAX_SEED)
        seed = min(seed, MAX_SEED)
        width, height = ASPECTS[aspect]

        t0 = time.perf_counter()
        image, nsfw = render(STYLES[style].format(prompt=prompt), width, height, seed)
        if nsfw > NSFW_THRESHOLD:
            print(f"blocked by safety filter (nsfw={nsfw:.2f}): {prompt!r}", flush=True)
            return None, None, "The safety filter blocked this image. Try rephrasing your prompt."
        meta = {
            "model": MODEL_KEY,
            "model_label": CFG["label"],
            "style": style,
            "aspect": aspect,
            "seed": seed,
            "steps": CFG["steps"],
            "cfg": CFG["cfg"],
            "width": width,
            "height": height,
            "prompt": prompt,
            "seconds": round(time.perf_counter() - t0, 2),
        }
        return image, meta, ""
    except gr.Error as exc:
        return None, None, str(exc.message)
    except Exception as exc:
        traceback.print_exc()
        return None, None, f"Generation failed ({type(exc).__name__}). Please try again."


def ui_generate(prompt, aspect):
    image, meta, error = generate(prompt, MODEL_KEY, "none", aspect, -1)
    if error:
        raise gr.Error(error)
    return image


with gr.Blocks(title=CFG["label"]) as demo:
    gr.Markdown(
        f"# {CFG['label']}\nTurbo text-to-image on ZeroGPU for the Image Studio on "
        "[Feliks Altymyshov's](https://github.com/feliksKdm) portfolio."
        + ("" if pipe is not None else f"\n\n**Unavailable:** {load_error[:200]}")
    )
    with gr.Row():
        with gr.Column():
            prompt = gr.Textbox(label="Prompt", lines=3, max_length=MAX_PROMPT)
            aspect = gr.Radio(list(ASPECTS), value="1:1", label="Aspect ratio")
            btn = gr.Button("Generate", variant="primary")
        out = gr.Image(label="Result", format="webp")
    btn.click(ui_generate, [prompt, aspect], out, api_name=False)

    with gr.Group(visible=False):
        a_prompt, a_model, a_style, a_aspect = gr.Textbox(), gr.Textbox(), gr.Textbox(), gr.Textbox()
        a_seed = gr.Number()
        a_image = gr.Image(type="pil", format="webp")
        a_meta = gr.JSON()
        a_error = gr.Textbox()
        a_btn = gr.Button()
        m_out = gr.JSON()
        m_btn = gr.Button()
    a_btn.click(generate, [a_prompt, a_model, a_style, a_aspect, a_seed], [a_image, a_meta, a_error], api_name="generate")
    m_btn.click(models, [], m_out, api_name="models")

if __name__ == "__main__":
    demo.queue(default_concurrency_limit=2).launch()
