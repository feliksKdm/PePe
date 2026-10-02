# Copyright (c) 2024 Alibaba Inc (authors: Xiang Lyu, Liu Yue)
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# UI restyled for latent.space — Feliks Altymyshov's portfolio lab.
# Inference core is unchanged from the official Fun-CosyVoice3 demo.
import spaces
import os
import sys
import tempfile
import gradio as gr
import numpy as np
import torch
import torchaudio
import random
import functools
import traceback
import librosa
import soundfile as sf
from funasr import AutoModel

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append('{}/third_party/Matcha-TTS'.format(ROOT_DIR))

from modelscope import snapshot_download
from huggingface_hub import snapshot_download as hf_snapshot_download

hf_snapshot_download('FunAudioLLM/Fun-CosyVoice3-0.5B-2512', local_dir='pretrained_models/Fun-CosyVoice3-0.5B')
snapshot_download('iic/SenseVoiceSmall', local_dir='pretrained_models/SenseVoiceSmall')
hf_snapshot_download('FunAudioLLM/CosyVoice-ttsfrd', local_dir='pretrained_models/CosyVoice-ttsfrd')
os.system(
    "cd pretrained_models/CosyVoice-ttsfrd/ && "
    "pip install ttsfrd_dependency-0.1-py3-none-any.whl && "
    "pip install ttsfrd-0.4.2-cp310-cp310-linux_x86_64.whl && "
    "apt install -y unzip && "
    "rm -rf resource && "
    "unzip resource.zip -d ."
)

from cosyvoice.cli.cosyvoice import AutoModel as CosyVoiceAutoModel
from cosyvoice.utils.file_utils import logging, load_wav
from cosyvoice.utils.common import set_all_random_seed, instruct_list

MODE_ZERO_SHOT = "zero_shot"
# Clone from the reference audio alone, without its transcript. Slightly less
# exact than zero-shot, but robust when the transcript is unknown or wrong — a
# mismatched transcript makes CosyVoice truncate speech or fail outright.
MODE_CROSS = "cross_lingual"
MODE_INSTRUCT = "instruct"
MAX_CHARS = 200

# Default reference voice — my own recording, used when a visitor doesn't
# supply one, so the tool is playable in a single click.
# The transcript must match the audio exactly or cloning quality drops; it is
# auto-detected once at boot (see __main__). Hardcode it here to skip that.
DEFAULT_VOICE = os.path.join(ROOT_DIR, "default_voice.wav")
DEFAULT_VOICE_TEXT = ""

# Second base voice: the sample speaker that ships with the CosyVoice repo
# (already used for the warm-up pass, so it is always present in the Space).
LUMI_VOICE = os.path.join(ROOT_DIR, "zero_shot_prompt.wav")
LUMI_VOICE_TEXT = "希望你以后能够做的比我还好呦。"

# Pitch-shifted copies of the base voices are rendered here once at boot.
# Kept inside the app dir (not /tmp) so Gradio is allowed to serve them.
VOICE_DIR = os.path.join(ROOT_DIR, "voices")


def instruct(text):
    """Wrap a style instruction in the prompt format CosyVoice3 was trained on."""
    return "You are a helpful assistant. {}<|endofprompt|>".format(text)


# -----------------------------
# Voice presets — 10 voice × tone combinations
# base:  which reference clip to clone ("feliks" | "lumi")
# pitch: semitone shift applied to the reference → a new timbre, not just a filter
# mode:  plain cloning, or cloning + a natural-language style instruction
# -----------------------------
PRESETS = {
    "feliks-natural": dict(
        emoji="🎙️", name="Feliks · Natural", base="feliks", pitch=0,
        mode=MODE_CROSS, style=None, speed=1.0,
        voice="My real voice", tone="Neutral, conversational",
        blurb="A straight clone of my own 10-second recording — no styling on top.",
        sample="Hi, I'm Feliks. This voice was cloned from a ten second clip — welcome to my lab.",
    ),
    "feliks-cheerful": dict(
        emoji="😄", name="Feliks · Cheerful", base="feliks", pitch=0,
        mode=MODE_INSTRUCT, style=instruct("请非常开心地说一句话。"), speed=1.05,
        voice="My real voice", tone="Bright, upbeat",
        blurb="Same voice, steered to sound genuinely happy.",
        sample="Guess what? The model finally converged and the demo works on the first try!",
    ),
    "feliks-calm": dict(
        emoji="🌙", name="Feliks · Soft & Calm", base="feliks", pitch=0,
        mode=MODE_INSTRUCT, style=instruct("Please say a sentence in a very soft voice."), speed=0.9,
        voice="My real voice", tone="Gentle, hushed",
        blurb="A quiet, gentle delivery — think late-night podcast.",
        sample="Take a slow breath in… and let it go. There's no rush tonight.",
    ),
    "feliks-hype": dict(
        emoji="⚡", name="Feliks · Hype", base="feliks", pitch=0,
        mode=MODE_INSTRUCT, style=instruct("请用尽可能快地语速说一句话。"), speed=1.15,
        voice="My real voice", tone="Fast, high-energy",
        blurb="Rapid-fire delivery for trailers and launch announcements.",
        sample="Ladies and gentlemen, it's live! New tools, new models, zero paywalls — go try it right now!",
    ),
    "deep-narrator": dict(
        emoji="🎬", name="Deep Narrator", base="feliks", pitch=-4,
        mode=MODE_CROSS, style=None, speed=0.9,
        voice="My voice, pitched down 4 semitones", tone="Low, cinematic",
        blurb="A deeper, slower variant of my voice for documentary-style narration.",
        sample="In a world of endless data, one small model learned to speak.",
    ),
    "robot": dict(
        emoji="🤖", name="Robot", base="feliks", pitch=-1,
        mode=MODE_INSTRUCT, style=instruct("你可以尝试用机器人的方式解答吗？"), speed=0.95,
        voice="My voice, slightly lowered", tone="Flat, mechanical",
        blurb="Measured and monotone — a friendly android reading its status report.",
        sample="System check complete. All circuits nominal. Hello, human.",
    ),
    "lumi-warm": dict(
        emoji="🌸", name="Lumi · Warm", base="lumi", pitch=0,
        mode=MODE_ZERO_SHOT, style=None, speed=1.0,
        voice="Lumi — CosyVoice studio sample", tone="Warm, friendly",
        blurb="A second voice from the CosyVoice sample library, speaking English cross-lingually.",
        sample="Welcome back! I saved your seat — let me tell you what's new today.",
    ),
    "lumi-melancholic": dict(
        emoji="🌧️", name="Lumi · Melancholic", base="lumi", pitch=0,
        mode=MODE_INSTRUCT, style=instruct("请非常伤心地说一句话。"), speed=0.92,
        voice="Lumi — CosyVoice studio sample", tone="Sad, wistful",
        blurb="Slow and wistful, with a heavy heart.",
        sample="I kept the letter for years, but I never found the courage to open it.",
    ),
    "lumi-fired-up": dict(
        emoji="🔥", name="Lumi · Fired Up", base="lumi", pitch=0,
        mode=MODE_INSTRUCT, style=instruct("请非常生气地说一句话。"), speed=1.05,
        voice="Lumi — CosyVoice studio sample", tone="Angry, intense",
        blurb="Sharp and intense — someone has definitely touched her keyboard.",
        sample="Who pushed directly to main on a Friday afternoon? I want names. Now.",
    ),
    "cartoon": dict(
        emoji="🎈", name="Cartoon", base="lumi", pitch=4,
        mode=MODE_INSTRUCT, style=instruct("我想体验一下小猪佩奇风格，可以吗？"), speed=1.05,
        voice="Lumi, pitched up 4 semitones", tone="Playful, animated",
        blurb="A bouncy, animated-character voice built on a pitched-up reference.",
        sample="Oh, look! A big muddy puddle! Let's jump in it together!",
    ),
}
DEFAULT_PRESET = "feliks-natural"
SAMPLE_TEXTS = {p["sample"] for p in PRESETS.values()}

# Tones a visitor can put on their own cloned voice (portfolio API).
# Keys only — the API never accepts free-form instructions.
STYLES = {
    "natural": None,
    "cheerful": instruct("请非常开心地说一句话。"),
    "calm": instruct("Please say a sentence in a very soft voice."),
    "fast": instruct("请用尽可能快地语速说一句话。"),
    "sad": instruct("请非常伤心地说一句话。"),
    "angry": instruct("请非常生气地说一句话。"),
    "robot": instruct("你可以尝试用机器人的方式解答吗？"),
}

# Resolved at boot by build_preset_voices(): preset key → (wav path, transcript)
PRESET_REFS = {}

# -----------------------------
# Brand theme — matches feliks' portfolio palette
# (primary #030412, storm #282b4b, aqua #33c2cc, lavender #7a57db, royal #5c33cc)
# -----------------------------
THEME = gr.themes.Base(
    primary_hue=gr.themes.colors.violet,
    secondary_hue=gr.themes.colors.cyan,
    neutral_hue=gr.themes.colors.slate,
    font=[gr.themes.GoogleFont("Funnel Display"), "ui-sans-serif", "system-ui", "sans-serif"],
    font_mono=[gr.themes.GoogleFont("JetBrains Mono"), "ui-monospace", "monospace"],
)

CSS = """
:root, .dark {
  --vl-bg: #030412;
  --vl-panel: rgba(255, 255, 255, 0.03);
  --vl-line: rgba(255, 255, 255, 0.10);
  --vl-ink: #e8e8f0;
  --vl-muted: #9aa0b4;
  --vl-aqua: #33c2cc;
  --vl-lavender: #7a57db;
  --vl-royal: #5c33cc;
  --vl-mint: #57db96;
  --vl-sand: #d6995c;
}

body, .gradio-container {
  background: var(--vl-bg) !important;
  color: var(--vl-ink) !important;
}
.gradio-container { max-width: 1120px !important; margin: 0 auto !important; }

/* Hide gradio chrome we don't want inside the portfolio iframe */
footer { display: none !important; }

/* Panels */
.block, .form, .panel, .accordion {
  background: var(--vl-panel) !important;
  border: 1px solid var(--vl-line) !important;
  border-radius: 16px !important;
  box-shadow: none !important;
}
.vl-card { padding: 18px !important; gap: 14px !important; }

/* Labels */
label > span, .block-title, span[data-testid="block-info"] {
  color: var(--vl-muted) !important;
  font-size: 12px !important;
  letter-spacing: 0.08em !important;
  text-transform: uppercase !important;
}

/* Inputs */
input, textarea, select {
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid var(--vl-line) !important;
  color: var(--vl-ink) !important;
  border-radius: 10px !important;
}
input:focus, textarea:focus {
  border-color: rgba(51, 194, 204, 0.5) !important;
  box-shadow: none !important;
}

/* Buttons */
button.primary, button[variant="primary"] {
  background: linear-gradient(135deg, var(--vl-lavender) 0%, var(--vl-royal) 100%) !important;
  color: #fff !important;
  border: none !important;
  border-radius: 9999px !important;
  font-weight: 500 !important;
  transition: transform 0.2s ease, box-shadow 0.3s ease !important;
}
button.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 28px -6px rgba(122, 87, 219, 0.7) !important;
}
button.secondary {
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  border-radius: 9999px !important;
  color: var(--vl-ink) !important;
}

a { color: var(--vl-aqua) !important; }

/* Header */
.vl-header { text-align: left; padding: 4px 4px 8px; }
.vl-kicker, .vl-step {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--vl-aqua);
}
.vl-kicker { margin-bottom: 10px; }
.vl-header h1 {
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 8px;
  background: linear-gradient(90deg, #33c2cc, #7a57db);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.vl-header p { color: var(--vl-muted); margin: 0 0 6px; max-width: 680px; }
.vl-note { font-size: 12px; color: var(--vl-sand) !important; }
.vl-step b { color: var(--vl-ink); font-weight: 600; letter-spacing: 0.12em; }

/* Voice gallery — the radio rendered as a grid of selectable cards */
#vl-presets { background: transparent !important; border: none !important; padding: 0 !important; }
#vl-presets .wrap {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px !important;
}
#vl-presets label {
  position: relative;
  margin: 0 !important;
  padding: 11px 12px !important;
  border: 1px solid var(--vl-line) !important;
  border-radius: 12px !important;
  background: rgba(255, 255, 255, 0.03) !important;
  color: var(--vl-ink) !important;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.15s ease;
}
#vl-presets label span {
  color: var(--vl-ink) !important;
  font-size: 13.5px !important;
  letter-spacing: 0 !important;
  text-transform: none !important;
}
#vl-presets label:hover { border-color: rgba(51, 194, 204, 0.45) !important; transform: translateY(-1px); }
#vl-presets label.selected, #vl-presets label:has(input:checked) {
  border-color: var(--vl-lavender) !important;
  background: linear-gradient(135deg, rgba(122, 87, 219, 0.28), rgba(51, 194, 204, 0.08)) !important;
  box-shadow: 0 0 22px -10px rgba(122, 87, 219, 0.9);
}
#vl-presets input[type="radio"] { position: absolute; opacity: 0; pointer-events: none; }

/* Selected-voice card */
.vl-voice {
  border: 1px solid var(--vl-line);
  border-radius: 14px;
  padding: 14px 16px;
  background: linear-gradient(135deg, rgba(122, 87, 219, 0.10), rgba(51, 194, 204, 0.04));
}
.vl-voice-title { font-size: 1.05rem; font-weight: 600; color: var(--vl-ink); }
.vl-voice p { margin: 6px 0 10px; color: var(--vl-muted); font-size: 13.5px; }
.vl-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.vl-chip {
  font-family: "JetBrains Mono", monospace;
  font-size: 10.5px;
  padding: 3px 9px;
  border-radius: 9999px;
  border: 1px solid var(--vl-line);
  background: rgba(255, 255, 255, 0.04);
  color: var(--vl-muted);
}
.vl-chip.aqua { color: var(--vl-aqua); border-color: rgba(51, 194, 204, 0.35); }
.vl-chip.lav { color: #b9a3f5; border-color: rgba(122, 87, 219, 0.45); }
.vl-chip.mint { color: var(--vl-mint); border-color: rgba(87, 219, 150, 0.35); }

/* Character counter */
#vl-count { text-align: right; font-family: "JetBrains Mono", monospace; font-size: 11px; color: var(--vl-muted); }
#vl-count.over { color: #e5484d; }

/* Generate */
#vl-generate { min-height: 52px; font-size: 1rem !important; }

.vl-footer {
  text-align: center;
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: var(--vl-muted);
  padding-top: 10px;
}
"""

HEADER_HTML = """
<div class="vl-header">
  <div class="vl-kicker">The Lab // Voice</div>
  <h1>Voice Lab</h1>
  <p>Pick one of ten voices and tones, type a line, hit Generate. Or clone your own
  voice from a few seconds of audio — powered by Fun-CosyVoice3-0.5B.</p>
  <p class="vl-note">⚠ Only clone your own voice or one you have explicit permission to use.
  Generated audio is synthetic.</p>
</div>
"""

FOOTER_HTML = """
<div class="vl-footer">
  BUILT BY <a href="https://github.com/feliksKdm" target="_blank">FELIKS ALTYMYSHOV</a>
  &nbsp;·&nbsp; FUN-COSYVOICE3-0.5B (APACHE-2.0) &nbsp;·&nbsp; RUNS ON ZEROGPU
</div>
"""

CUSTOM_VOICE_HTML = """
<div class="vl-voice">
  <div class="vl-voice-title">🎧 Your voice</div>
  <p>Using the clip you uploaded or recorded. Check the transcript below matches it word for word.
  Pick a preset again any time to switch back.</p>
  <div class="vl-chips"><span class="vl-chip mint">Custom clone</span></div>
</div>
"""

# Counts characters in the browser so typing never round-trips to the Space.
COUNT_JS = """
(text) => {
  const n = (text || "").length;
  const el = document.querySelector("#vl-count");
  if (el) el.classList.toggle("over", n > %d);
  return `${n} / %d characters`;
}
""" % (MAX_CHARS, MAX_CHARS)


def preset_card(key):
    p = PRESETS[key]
    mode_label = "Clone + style" if p["mode"] == MODE_INSTRUCT else "Pure clone"
    return """
<div class="vl-voice">
  <div class="vl-voice-title">{emoji} {name}</div>
  <p>{blurb}</p>
  <div class="vl-chips">
    <span class="vl-chip aqua">Voice · {voice}</span>
    <span class="vl-chip lav">Tone · {tone}</span>
    <span class="vl-chip">{mode_label} · {speed:.2f}×</span>
  </div>
</div>
""".format(mode_label=mode_label, **p)


# -----------------------------
# Audio post-process (unchanged)
# -----------------------------
max_val = 0.8
top_db = 60
hop_length = 220
win_length = 440


def generate_seed():
    seed = random.randint(1, 100000000)
    return {"__type__": "update", "value": seed}


def postprocess(wav):
    speech = load_wav(wav, target_sr=target_sr, min_sr=16000)
    speech, _ = librosa.effects.trim(
        speech, top_db=top_db, frame_length=win_length, hop_length=hop_length
    )
    if speech.abs().max() > max_val:
        speech = speech / speech.abs().max() * max_val
    speech = torch.concat([speech, torch.zeros(1, int(target_sr * 0.2))], dim=1)
    # Write to a fresh temp file rather than overwriting the source. The preset
    # reference is a repo file shared by every request, so in-place edits would
    # degrade it on each run and race between concurrent generations.
    out_path = tempfile.NamedTemporaryFile(suffix=".wav", delete=False).name
    torchaudio.save(out_path, speech, target_sr)
    return out_path


def build_preset_voices():
    """Resolve every preset to a reference clip, rendering pitch variants once.

    Runs on CPU at boot so selecting a preset never costs ZeroGPU quota.
    Presets whose base clip is missing are dropped instead of crashing the app.
    """
    bases = {
        "feliks": (DEFAULT_VOICE, DEFAULT_VOICE_TEXT),
        "lumi": (LUMI_VOICE, LUMI_VOICE_TEXT),
    }
    os.makedirs(VOICE_DIR, exist_ok=True)
    for key, p in PRESETS.items():
        path, text = bases[p["base"]]
        if not os.path.exists(path):
            logging.warning("preset %s skipped: missing %s", key, path)
            continue
        if p["pitch"]:
            shifted = os.path.join(VOICE_DIR, "{}_{:+d}.wav".format(p["base"], p["pitch"]))
            if not os.path.exists(shifted):
                try:
                    y, sr = librosa.load(path, sr=None, mono=True)
                    y = librosa.effects.pitch_shift(y, sr=sr, n_steps=p["pitch"])
                    sf.write(shifted, y, sr)
                except Exception as exc:
                    logging.warning("preset %s pitch shift failed: %s", key, exc)
                    continue
            path = shifted
        PRESET_REFS[key] = (path, text)


@spaces.GPU
def prompt_wav_recognition(prompt_wav):
    if prompt_wav is None:
        return ""
    res = asr_model.generate(
        input=prompt_wav,
        language="auto",
        use_itn=True,
    )
    text = res[0]["text"].split("|>")[-1]
    return text


@spaces.GPU
def generate_audio(
    tts_text,
    mode_value,
    prompt_text,
    prompt_wav_upload,
    prompt_wav_record,
    instruct_text,
    seed,
    speed,
):
    if not tts_text.strip():
        gr.Warning("Type something for the voice to say first.")
        return (target_sr, default_data)

    if len(tts_text) > MAX_CHARS:
        gr.Warning("Your input text is too long; please keep it within {} characters.".format(MAX_CHARS))
        return (target_sr, default_data)

    speed = float(speed or 1.0)

    # A recording wins over the upload slot: the upload slot is pre-filled with
    # the default voice, so preferring it would make recording impossible.
    if prompt_wav_record is not None:
        prompt_wav = prompt_wav_record
    elif prompt_wav_upload is not None:
        prompt_wav = prompt_wav_upload
    else:
        prompt_wav = None

    if mode_value == MODE_INSTRUCT:
        if not instruct_text:
            gr.Warning("You are using Style control; please pick or type a style instruction.")
            return (target_sr, default_data)
        if prompt_wav is None:
            gr.Info("You are using Style control; please provide a reference recording first.")
            return (target_sr, default_data)

    if mode_value in (MODE_ZERO_SHOT, MODE_CROSS):
        if prompt_wav is None:
            gr.Warning("Reference audio is empty — pick a preset, or record/upload a short clip.")
            return (target_sr, default_data)

        info = sf.info(prompt_wav)
        if info.samplerate < prompt_sr:
            gr.Warning(
                "Reference sample rate {} is below {}.".format(info.samplerate, prompt_sr)
            )
            return (target_sr, default_data)

        if info.frames / info.samplerate > 10:
            gr.Warning("Please keep the reference clip within 10 seconds for best quality.")
            return (target_sr, default_data)

        if mode_value == MODE_ZERO_SHOT and prompt_text == "":
            gr.Warning("Reference transcript is empty — wait for auto-detection or type it in.")
            return (target_sr, default_data)

    if mode_value == MODE_CROSS:
        logging.info("get cross_lingual inference request")
        set_all_random_seed(seed)
        speech_list = []
        for i in cosyvoice.inference_cross_lingual(
            "You are a helpful assistant.<|endofprompt|>" + tts_text,
            postprocess(prompt_wav),
            stream=False,
            speed=speed,
        ):
            speech_list.append(i["tts_speech"])
        return (target_sr, torch.concat(speech_list, dim=1).numpy().flatten())

    if mode_value == MODE_ZERO_SHOT:
        logging.info("get zero_shot inference request")
        set_all_random_seed(seed)
        speech_list = []
        for i in cosyvoice.inference_zero_shot(
            tts_text,
            "You are a helpful assistant.<|endofprompt|>" + prompt_text,
            postprocess(prompt_wav),
            stream=False,
            speed=speed,
        ):
            speech_list.append(i["tts_speech"])
        return (target_sr, torch.concat(speech_list, dim=1).numpy().flatten())

    if mode_value == MODE_INSTRUCT:
        logging.info("get instruct inference request")
        set_all_random_seed(seed)
        speech_list = []
        for i in cosyvoice.inference_instruct2(
            tts_text,
            instruct_text,
            postprocess(prompt_wav),
            stream=False,
            speed=speed,
        ):
            speech_list.append(i["tts_speech"])
        return (target_sr, torch.concat(speech_list, dim=1).numpy().flatten())

    gr.Warning("Invalid mode selection.")
    return (target_sr, default_data)


# -----------------------------
# Portfolio API — the site's native Voice Lab UI calls these instead of
# embedding the Gradio page. Each returns (result, error_message): Gradio's
# HTTP API doesn't reliably forward exception text, so errors travel as data.
# -----------------------------
def _api(fn):
    @functools.wraps(fn)
    def wrapper(*args):
        try:
            return fn(*args), ""
        except gr.Error as exc:
            print("API {} rejected: {}".format(fn.__name__, exc.message), flush=True)
            return None, str(exc.message)
        except Exception as exc:
            traceback.print_exc()
            return None, "Generation failed ({}). Please try again.".format(type(exc).__name__)
    return wrapper


def _check_text(text):
    text = (text or "").strip()
    if not text:
        raise gr.Error("Type something for the voice to say first.")
    if len(text) > MAX_CHARS:
        raise gr.Error("Keep the text within {} characters.".format(MAX_CHARS))
    return text


def _check_seed(seed):
    try:
        return int(seed or 0)
    except (TypeError, ValueError):
        return 0


def _check_speed(speed):
    try:
        return float(min(max(float(speed), 0.7), 1.3))
    except (TypeError, ValueError):
        return 1.0


@_api
def api_preset(text, preset, speed, seed):
    text = _check_text(text)
    if preset not in PRESET_REFS:
        raise gr.Error("Unknown voice preset.")
    p = PRESETS[preset]
    path, transcript = PRESET_REFS[preset]
    speed = _check_speed(speed if speed else p["speed"])
    return generate_audio(text, p["mode"], transcript, path, None, p["style"] or "", _check_seed(seed), speed)


@_api
def api_transcribe(audio):
    if not audio:
        raise gr.Error("No audio received.")
    return (prompt_wav_recognition(audio) or "").strip()


@_api
def api_clone(text, audio, transcript, style, speed, seed):
    text = _check_text(text)
    if not audio:
        raise gr.Error("Upload or record a reference clip first.")
    if style not in STYLES:
        raise gr.Error("Unknown style.")
    info = sf.info(audio)
    if info.samplerate < 16000:
        raise gr.Error("The reference clip's sample rate is too low (need at least 16 kHz).")
    if info.frames / info.samplerate > 10.5:
        raise gr.Error("Keep the reference clip within 10 seconds.")
    transcript = (transcript or "").strip()
    instruction = STYLES[style]
    seed, speed = _check_seed(seed), _check_speed(speed)
    if instruction:
        return generate_audio(text, MODE_INSTRUCT, transcript, audio, None, instruction, seed, speed)
    if transcript:
        try:
            return generate_audio(text, MODE_ZERO_SHOT, transcript, audio, None, "", seed, speed)
        except Exception as exc:  # usually: transcript doesn't match the audio
            # (ZeroGPU re-raises worker errors as gr.Error, so catch broadly;
            # a quota error simply fails again below and is reported.)
            print("zero-shot failed, retrying without transcript:", exc, flush=True)
    return generate_audio(text, MODE_CROSS, "", audio, None, "", seed, speed)


def on_mode_change(mode_value):
    return gr.update(visible=(mode_value == MODE_INSTRUCT))


def apply_preset(key, current_text):
    """Load a preset into every control. CPU-only — no ZeroGPU cost."""
    if key not in PRESET_REFS:
        return [gr.update()] * 9
    p = PRESETS[key]
    path, transcript = PRESET_REFS[key]
    # Only swap the script if the visitor hasn't written their own.
    keep_text = current_text.strip() and current_text not in SAMPLE_TEXTS
    return [
        preset_card(key),
        gr.update(value=path),                     # reference clip
        gr.update(value=None),                     # clear any recording
        transcript,                                # reference transcript
        p["mode"],                                 # mode radio
        gr.update(
            value=p["style"] or instruct_list[0],
            visible=p["mode"] == MODE_INSTRUCT,
        ),                                         # style instruction
        p["speed"],                                # speed slider
        gr.update() if keep_text else p["sample"], # script
        gr.update(open=False),                     # collapse "use your own voice"
    ]


def mark_custom_voice():
    return CUSTOM_VOICE_HTML, gr.update(value=None)


def main():
    available = [k for k in PRESETS if k in PRESET_REFS]
    initial = DEFAULT_PRESET if DEFAULT_PRESET in available else (available[0] if available else None)
    init = PRESETS[initial] if initial else PRESETS[DEFAULT_PRESET]
    init_ref = PRESET_REFS.get(initial, (None, ""))

    with gr.Blocks(theme=THEME, css=CSS, title="Voice Lab — Feliks Altymyshov") as demo:
        gr.HTML(HEADER_HTML)

        with gr.Row(equal_height=False):
            # Step 1 — pick a voice
            with gr.Column(scale=6, elem_classes="vl-card"):
                gr.HTML('<div class="vl-step">Step 1 · <b>Choose a voice</b></div>')
                preset_radio = gr.Radio(
                    choices=[("{} {}".format(PRESETS[k]["emoji"], PRESETS[k]["name"]), k) for k in available],
                    value=initial,
                    show_label=False,
                    container=False,
                    elem_id="vl-presets",
                )
                voice_card = gr.HTML(preset_card(initial) if initial else CUSTOM_VOICE_HTML)

                with gr.Accordion("🎧 Use your own voice instead", open=not available) as own_voice:
                    gr.Markdown(
                        "Upload or record **5–10 seconds** of clean speech. "
                        "The transcript fills in automatically — fix any wrong words."
                    )
                    with gr.Row():
                        prompt_wav_upload = gr.Audio(
                            sources="upload",
                            type="filepath",
                            label="Reference clip (≤ 10 s, ≥ 16 kHz)",
                            value=init_ref[0],
                        )
                        prompt_wav_record = gr.Audio(
                            sources="microphone",
                            type="filepath",
                            label="…or record yourself",
                        )
                    prompt_text = gr.Textbox(
                        label="What the reference says",
                        lines=2,
                        placeholder="Auto-detected from your clip — fix it here if it's wrong…",
                        value=init_ref[1],
                    )

            # Step 2 — what to say
            with gr.Column(scale=5, elem_classes="vl-card"):
                gr.HTML('<div class="vl-step">Step 2 · <b>Write the script</b></div>')
                tts_text = gr.Textbox(
                    label="Text to speak",
                    lines=5,
                    value=init["sample"],
                    placeholder="Type anything up to {} characters…".format(MAX_CHARS),
                )
                char_count = gr.HTML(
                    "{} / {} characters".format(len(init["sample"]), MAX_CHARS),
                    elem_id="vl-count",
                )
                gr.Examples(
                    examples=[[PRESETS[k]["sample"]] for k in available[:5]],
                    inputs=[tts_text],
                    label="Need a line? Try one of these",
                )

                with gr.Accordion("⚙️ Fine-tune", open=False):
                    mode_radio = gr.Radio(
                        choices=[
                            ("Pure clone", MODE_ZERO_SHOT),
                            ("Clone (audio only)", MODE_CROSS),
                            ("Clone + style", MODE_INSTRUCT),
                        ],
                        value=init["mode"],
                        label="Mode",
                    )
                    instruct_text = gr.Dropdown(
                        choices=instruct_list,
                        value=init["style"] or instruct_list[0],
                        label="Style instruction",
                        allow_custom_value=True,
                        visible=init["mode"] == MODE_INSTRUCT,
                    )
                    speed = gr.Slider(
                        minimum=0.7, maximum=1.3, step=0.05,
                        value=init["speed"], label="Speed",
                    )
                    with gr.Row():
                        seed = gr.Number(value=0, label="Seed")
                        seed_button = gr.Button("🎲 Randomize", size="sm")

                generate_button = gr.Button(
                    "▶ Generate speech", variant="primary", size="lg", elem_id="vl-generate"
                )
                audio_output = gr.Audio(label="Result", autoplay=True, streaming=False)

        gr.HTML(FOOTER_HTML)

        # Headless endpoints for the portfolio site (see api_* above).
        with gr.Group(visible=False):
            a_text = gr.Textbox()
            a_preset = gr.Textbox()
            a_style = gr.Textbox()
            a_transcript = gr.Textbox()
            a_speed = gr.Number()
            a_seed = gr.Number()
            a_audio = gr.Audio(type="filepath")
            a_out = gr.Audio(type="numpy", format="wav")
            a_text_out = gr.Textbox()
            a_err = gr.Textbox()
            a_btn = gr.Button()
        a_btn.click(api_preset, [a_text, a_preset, a_speed, a_seed], [a_out, a_err], api_name="preset")
        a_btn.click(api_transcribe, [a_audio], [a_text_out, a_err], api_name="transcribe")
        a_btn.click(
            api_clone, [a_text, a_audio, a_transcript, a_style, a_speed, a_seed], [a_out, a_err], api_name="clone"
        )

        # Wiring
        seed_button.click(generate_seed, inputs=[], outputs=seed)
        mode_radio.change(fn=on_mode_change, inputs=[mode_radio], outputs=[instruct_text])
        preset_radio.input(
            fn=apply_preset,
            inputs=[preset_radio, tts_text],
            outputs=[
                voice_card,
                prompt_wav_upload,
                prompt_wav_record,
                prompt_text,
                mode_radio,
                instruct_text,
                speed,
                tts_text,
                own_voice,
            ],
        )
        tts_text.change(fn=None, inputs=[tts_text], outputs=[char_count], js=COUNT_JS)

        # .upload / .stop_recording (not .change) so that loading a preset
        # programmatically doesn't trigger a paid ASR pass on ZeroGPU.
        for audio, event in ((prompt_wav_upload, "upload"), (prompt_wav_record, "stop_recording")):
            getattr(audio, event)(
                fn=prompt_wav_recognition, inputs=[audio], outputs=[prompt_text]
            )
            getattr(audio, event)(
                fn=mark_custom_voice, inputs=[], outputs=[voice_card, preset_radio]
            )

        generate_button.click(
            generate_audio,
            inputs=[
                tts_text,
                mode_radio,
                prompt_text,
                prompt_wav_upload,
                prompt_wav_record,
                instruct_text,
                seed,
                speed,
            ],
            outputs=[audio_output],
        )

    demo.queue(default_concurrency_limit=4).launch(allowed_paths=[VOICE_DIR], show_error=True)


if __name__ == "__main__":
    cosyvoice = CosyVoiceAutoModel(
        model_dir="pretrained_models/Fun-CosyVoice3-0.5B",
        load_trt=False,
        fp16=False,
    )
    sft_spk = cosyvoice.list_available_spks()

    # Warm-up pass (unchanged from the official demo)
    for stream in [False]:
        for i, j in enumerate(
            cosyvoice.inference_zero_shot(
                "收到好友从远方寄来的生日礼物，那份意外的惊喜与深深的祝福让我心中充满了甜蜜的快乐，笑容如花儿般绽放。",
                "You are a helpful assistant.<|endofprompt|>希望你以后能够做的比我还好呦。",
                "zero_shot_prompt.wav",
                stream=stream,
            )
        ):
            continue

    prompt_sr = 16000
    target_sr = 24000
    default_data = np.zeros(target_sr)

    model_dir = "pretrained_models/SenseVoiceSmall"
    asr_model = AutoModel(
        model=model_dir,
        disable_update=True,
        log_level="DEBUG",
        device="cuda:0",
    )

    # Transcribe the default reference once at boot, not per visitor — this
    # keeps the preset voice free of any per-request ZeroGPU cost.
    if not DEFAULT_VOICE_TEXT and os.path.exists(DEFAULT_VOICE):
        try:
            _res = asr_model.generate(input=DEFAULT_VOICE, language="auto", use_itn=True)
            DEFAULT_VOICE_TEXT = _res[0]["text"].split("|>")[-1].strip()
            logging.info("default voice transcript: %s", DEFAULT_VOICE_TEXT)
        except Exception as exc:  # never block startup on the preset
            logging.warning("default voice transcription failed: %s", exc)
            DEFAULT_VOICE_TEXT = ""

    build_preset_voices()
    logging.info("voice presets ready: %s", ", ".join(PRESET_REFS))

    main()
