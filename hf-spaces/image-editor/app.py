"""
Image Editor AI — backend for the portfolio's Photo Editor.

  /erase  (image, mask)              → LaMa object removal
  /edit   (image, instruction, seed) → FLUX.1 Kontext [dev] instruction editing (gated; optional)
  /models ()                         → which of "erase" / "edit" this Space can serve

Results are [image, meta, error] with errors as data, like the other lab Spaces.
"""

import random
import re
import time
import traceback

import gradio as gr
import numpy as np
import spaces
import torch
from PIL import Image, ImageFilter
from transformers import pipeline as hf_pipeline

MAX_SIDE = 1536
NSFW_THRESHOLD = 0.5
BLOCKED = re.compile(
    r"\b(nude|nudity|naked|nsfw|porn\w*|sex\w*|hentai|genitals?|nipples?|topless|lingerie|erotic\w*|fetish\w*|undress\w*|strip\w*|gore|beheaded|dismember\w*)\b",
    re.IGNORECASE,
)

lama = None
try:
    from simple_lama_inpainting import SimpleLama

    # TorchScript load needs a real device; ZeroGPU only has one inside
    # @spaces.GPU calls, so load on CPU and move it there per call.
    lama = SimpleLama(device=torch.device("cpu"))
except Exception as exc:
    print(f"LaMa unavailable: {type(exc).__name__}: {exc}", flush=True)

kontext = None
try:
    from diffusers import FluxKontextPipeline

    kontext = FluxKontextPipeline.from_pretrained("black-forest-labs/FLUX.1-Kontext-dev", torch_dtype=torch.bfloat16).to("cuda")
except Exception as exc:  # license not accepted / no HF_TOKEN secret yet
    print(f"Kontext unavailable: {type(exc).__name__}: {exc}", flush=True)

safety = hf_pipeline("image-classification", model="Falconsai/nsfw_image_detection", device="cuda")


def _load(path, mode="RGB"):
    image = Image.open(path).convert(mode)
    if max(image.size) > MAX_SIDE:
        image.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    return image


def _nsfw(image):
    return {r["label"]: r["score"] for r in safety(image)}.get("nsfw", 0.0)


@spaces.GPU(duration=30)
def _erase(image, mask):
    # Grow the mask a little so the object's soft edges go too.
    mask = mask.filter(ImageFilter.MaxFilter(9))
    lama.model.to("cuda")
    lama.device = torch.device("cuda")
    result = lama(image, mask)
    return result.crop((0, 0, image.width, image.height)), _nsfw(result)


@spaces.GPU(duration=90)
def _edit(image, instruction, seed):
    generator = torch.Generator("cuda").manual_seed(seed)
    result = kontext(image=image, prompt=instruction, guidance_scale=2.5, num_inference_steps=24, generator=generator).images[0]
    return result, max(_nsfw(image), _nsfw(result))


def models():
    """API: tools available right now."""
    return [k for k, v in (("erase", lama), ("edit", kontext)) if v is not None]


def erase(image_path, mask_path):
    try:
        if lama is None:
            return None, None, "The eraser isn't available right now."
        if not image_path or not mask_path:
            return None, None, "Paint over what you want to remove first."
        image = _load(image_path)
        mask = Image.open(mask_path).convert("L").resize(image.size, Image.NEAREST)
        if np.asarray(mask).max() < 128:
            return None, None, "Paint over what you want to remove first."
        t0 = time.perf_counter()
        result, nsfw = _erase(image, mask.point(lambda v: 255 if v >= 128 else 0))
        if nsfw > NSFW_THRESHOLD:
            return None, None, "The safety filter blocked this image."
        return result, {"tool": "erase", "width": result.width, "height": result.height, "seconds": round(time.perf_counter() - t0, 2)}, ""
    except gr.Error as exc:
        return None, None, str(exc.message)
    except Exception as exc:
        traceback.print_exc()
        return None, None, f"Erase failed ({type(exc).__name__}). Please try again."


def edit(image_path, instruction, seed):
    try:
        if kontext is None:
            return None, None, "AI edit isn't available yet."
        instruction = (instruction or "").strip()
        if not image_path or not instruction:
            return None, None, "Describe the change you want."
        if len(instruction) > 400:
            return None, None, "Keep the instruction under 400 characters."
        if BLOCKED.search(instruction):
            return None, None, "This editor only makes safe-for-work edits — try a different instruction."
        image = _load(image_path)
        seed = int(seed) if seed not in (None, "", -1) and int(seed) >= 0 else random.randint(0, 2**31 - 1)
        t0 = time.perf_counter()
        result, nsfw = _edit(image, instruction, seed)
        if nsfw > NSFW_THRESHOLD:
            return None, None, "The safety filter blocked this edit."
        return result, {"tool": "edit", "instruction": instruction, "seed": seed, "width": result.width, "height": result.height,
                        "seconds": round(time.perf_counter() - t0, 2)}, ""
    except gr.Error as exc:
        return None, None, str(exc.message)
    except Exception as exc:
        traceback.print_exc()
        return None, None, f"Edit failed ({type(exc).__name__}). Please try again."


with gr.Blocks(title="Image Editor AI") as demo:
    gr.Markdown(
        "# 🪄 Image Editor AI\nLaMa object removal and FLUX.1 Kontext editing for "
        "[Feliks Altymyshov's](https://github.com/feliksKdm) portfolio photo editor. "
        f"Available now: **{', '.join(models()) or 'nothing'}**."
    )
    with gr.Group(visible=False):
        e_img, e_mask = gr.Image(type="filepath"), gr.Image(type="filepath")
        k_img = gr.Image(type="filepath")
        k_text, k_seed = gr.Textbox(), gr.Number()
        out_img = gr.Image(type="pil", format="png")
        out_meta, out_err = gr.JSON(), gr.Textbox()
        m_out = gr.JSON()
        b1, b2, b3 = gr.Button(), gr.Button(), gr.Button()
    b1.click(erase, [e_img, e_mask], [out_img, out_meta, out_err], api_name="erase")
    b2.click(edit, [k_img, k_text, k_seed], [out_img, out_meta, out_err], api_name="edit")
    b3.click(models, [], m_out, api_name="models")

if __name__ == "__main__":
    demo.queue(default_concurrency_limit=2).launch()
