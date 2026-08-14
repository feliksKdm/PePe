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
import librosa
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
MODE_INSTRUCT = "instruct"

# Default reference voice — my own recording, used when a visitor doesn't
# supply one, so the tool is playable in a single click.
# The transcript must match the audio exactly or cloning quality drops; it is
# auto-detected once at boot (see __main__). Hardcode it here to skip that.
DEFAULT_VOICE = os.path.join(ROOT_DIR, "default_voice.wav")
DEFAULT_VOICE_TEXT = ""

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
}

body, .gradio-container {
  background: var(--vl-bg) !important;
  color: var(--vl-ink) !important;
}
.gradio-container { max-width: 1080px !important; margin: 0 auto !important; }

/* Hide gradio chrome we don't want inside the portfolio iframe */
footer { display: none !important; }

/* Panels */
.block, .form, .panel, .accordion {
  background: var(--vl-panel) !important;
  border: 1px solid var(--vl-line) !important;
  border-radius: 16px !important;
  box-shadow: none !important;
}

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

/* Header / footer blocks */
.vl-header { text-align: left; padding: 4px 4px 12px; }
.vl-kicker {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--vl-aqua);
  margin-bottom: 10px;
}
.vl-header h1 {
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 8px;
  background: linear-gradient(90deg, #33c2cc, #7a57db);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.vl-header p { color: var(--vl-muted); margin: 0 0 6px; max-width: 640px; }
.vl-note {
  font-size: 12px;
  color: #d6995c !important;
}
.vl-step {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  color: var(--vl-aqua);
}
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
  <p>Clone a voice from a few seconds of audio, or steer it with a natural-language
  style instruction — powered by Fun-CosyVoice3-0.5B.</p>
  <p><strong style="color:#57db96">My voice is already loaded</strong> — just hit
  Generate to hear it, or drop in your own clip to clone something else.</p>
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
):
    if len(tts_text) > 200:
        gr.Warning("Your input text is too long; please keep it within 200 characters.")
        return (target_sr, default_data)

    speed = 1.0

    # A recording wins over the upload slot: the upload slot is pre-filled with
    # the default voice, so preferring it would make recording impossible.
    if prompt_wav_record is not None:
        prompt_wav = prompt_wav_record
    elif prompt_wav_upload is not None:
        prompt_wav = prompt_wav_upload
    else:
        prompt_wav = None

    if mode_value == MODE_INSTRUCT:
        if instruct_text == "":
            gr.Warning("You are using Style control; please pick or type a style instruction.")
            return (target_sr, default_data)
        if prompt_wav is None:
            gr.Info("You are using Style control; please provide a reference recording first.")
            return (target_sr, default_data)

    if mode_value == MODE_ZERO_SHOT:
        if prompt_wav is None:
            gr.Warning("Reference audio is empty — record or upload a short clip first.")
            return (target_sr, default_data)

        import soundfile as _sf
        info = _sf.info(prompt_wav)
        if info.samplerate < prompt_sr:
            gr.Warning(
                "Reference sample rate {} is below {}.".format(info.samplerate, prompt_sr)
            )
            return (target_sr, default_data)

        if info.frames / info.samplerate > 10:
            gr.Warning("Please keep the reference clip within 10 seconds for best quality.")
            return (target_sr, default_data)

        if prompt_text == "":
            gr.Warning("Reference transcript is empty — wait for auto-detection or type it in.")
            return (target_sr, default_data)

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


def on_mode_change(mode_value):
    return gr.update(visible=(mode_value == MODE_INSTRUCT))


def main():
    with gr.Blocks(theme=THEME, css=CSS, title="Voice Lab — Feliks Altymyshov") as demo:
        gr.HTML(HEADER_HTML)

        with gr.Row(equal_height=False):
            # Step 1 — reference voice
            with gr.Column():
                gr.HTML(
                    '<div class="vl-step">Step 1 · Reference voice '
                    '<span style="color:#57db96">· my voice is preloaded</span></div>'
                )
                with gr.Row():
                    prompt_wav_upload = gr.Audio(
                        sources="upload",
                        type="filepath",
                        label="Reference clip (≤ 10 s, ≥ 16 kHz)",
                        value=DEFAULT_VOICE if os.path.exists(DEFAULT_VOICE) else None,
                    )
                    prompt_wav_record = gr.Audio(
                        sources="microphone",
                        type="filepath",
                        label="…or record your own",
                    )
                prompt_text = gr.Textbox(
                    label="What the reference says",
                    lines=2,
                    placeholder="Auto-detected from your clip — fix it here if it's wrong…",
                    value=DEFAULT_VOICE_TEXT,
                )

            # Step 2 — what to say
            with gr.Column():
                gr.HTML('<div class="vl-step">Step 2 · What to generate</div>')
                tts_text = gr.Textbox(
                    label="Text to speak (≤ 200 characters)",
                    lines=4,
                    value="Hi, I'm Feliks. This voice was cloned from a ten second clip — welcome to my lab.",
                )
                mode_radio = gr.Radio(
                    choices=[
                        ("Voice cloning", MODE_ZERO_SHOT),
                        ("Style control", MODE_INSTRUCT),
                    ],
                    value=MODE_ZERO_SHOT,
                    label="Mode",
                )
                instruct_text = gr.Dropdown(
                    choices=instruct_list,
                    value=instruct_list[0],
                    label="Style instruction",
                    visible=False,
                )
                with gr.Accordion("Advanced", open=False):
                    with gr.Row():
                        seed = gr.Number(value=0, label="Seed")
                        seed_button = gr.Button("🎲 Randomize", size="sm")

        generate_button = gr.Button("Generate speech", variant="primary", size="lg")
        audio_output = gr.Audio(label="Result", autoplay=True, streaming=False)

        gr.HTML(FOOTER_HTML)

        # Wiring — identical to the original demo
        seed_button.click(generate_seed, inputs=[], outputs=seed)
        mode_radio.change(fn=on_mode_change, inputs=[mode_radio], outputs=[instruct_text])
        prompt_wav_upload.change(
            fn=prompt_wav_recognition, inputs=[prompt_wav_upload], outputs=[prompt_text]
        )
        prompt_wav_record.change(
            fn=prompt_wav_recognition, inputs=[prompt_wav_record], outputs=[prompt_text]
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
            ],
            outputs=[audio_output],
        )

    demo.queue(default_concurrency_limit=4).launch()


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

    main()
