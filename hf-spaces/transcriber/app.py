"""
Transcriber — Whisper large-v3-turbo on ZeroGPU, for Feliks Altymyshov's
portfolio. Long audio is transcribed in 30-second chunks, batched on the GPU,
and returned as timestamped segments.

The portfolio calls `/transcribe` through its own proxy. The API returns
[result, error], with errors as data, like the other lab Spaces.
"""

import time
import traceback

import gradio as gr
import librosa
import spaces
import torch
from transformers import pipeline as hf_pipeline

SAMPLE_RATE = 16_000
MAX_SECONDS = 15 * 60

# The most common Whisper languages; anything else still works with "auto".
LANGUAGES = [
    "auto", "english", "russian", "spanish", "french", "german", "italian", "portuguese",
    "turkish", "ukrainian", "polish", "dutch", "arabic", "hindi", "chinese", "japanese",
    "korean", "kazakh", "uzbek",
]

asr = hf_pipeline(
    "automatic-speech-recognition",
    model="openai/whisper-large-v3-turbo",
    torch_dtype=torch.float16,
    device="cuda",
)


def _duration(audio, language):
    # Reserve GPU time in proportion to the audio, so short clips stay cheap.
    return min(120, 15 + int(len(audio) / SAMPLE_RATE / 20))


@spaces.GPU(duration=_duration)
def run(audio, language):
    generate_kwargs = {"task": "transcribe"}
    if language != "auto":
        generate_kwargs["language"] = language
    return asr(
        {"raw": audio, "sampling_rate": SAMPLE_RATE},
        chunk_length_s=30,
        batch_size=16,
        return_timestamps=True,
        return_language=True,
        generate_kwargs=generate_kwargs,
    )


def transcribe(path, language):
    """API: returns (result, error)."""
    try:
        if not path:
            return None, "Upload an audio or video file first."
        if language not in LANGUAGES:
            return None, "Unknown language."
        audio, _ = librosa.load(path, sr=SAMPLE_RATE, mono=True)
        duration = len(audio) / SAMPLE_RATE
        if duration < 0.5:
            return None, "That file has no audible speech."
        if duration > MAX_SECONDS + 1:
            return None, f"Keep files under {MAX_SECONDS // 60} minutes."

        t0 = time.perf_counter()
        out = run(audio, language)
        segments = []
        detected = None
        for chunk in out.get("chunks", []):
            start, end = chunk["timestamp"]
            text = chunk["text"].strip()
            if not text:
                continue
            detected = detected or chunk.get("language")
            segments.append({
                "start": round(start or 0.0, 2),
                "end": round(end if end is not None else duration, 2),
                "text": text,
            })
        return {
            "text": out["text"].strip(),
            "language": detected or (language if language != "auto" else None),
            "duration": round(duration, 2),
            "seconds": round(time.perf_counter() - t0, 2),
            "segments": segments,
        }, ""
    except gr.Error as exc:  # e.g. ZeroGPU quota
        return None, str(exc.message)
    except Exception as exc:
        traceback.print_exc()
        return None, f"Transcription failed ({type(exc).__name__}). Please try another file."


def ui_transcribe(path, language):
    result, error = transcribe(path, language)
    if error:
        raise gr.Error(error)
    lines = [f"[{s['start']:.1f}s → {s['end']:.1f}s] {s['text']}" for s in result["segments"]]
    return result["text"], "\n".join(lines)


with gr.Blocks(title="Transcriber") as demo:
    gr.Markdown(
        "# 🎙️ Transcriber\nWhisper large-v3-turbo on ZeroGPU. Part of "
        "[Feliks Altymyshov's](https://github.com/feliksKdm) portfolio lab."
    )
    with gr.Row():
        with gr.Column():
            audio = gr.Audio(type="filepath", label="Audio")
            language = gr.Dropdown(LANGUAGES, value="auto", label="Language")
            btn = gr.Button("Transcribe", variant="primary")
        with gr.Column():
            text = gr.Textbox(label="Transcript", lines=8)
            segments = gr.Textbox(label="Segments", lines=8)
    btn.click(ui_transcribe, [audio, language], [text, segments], api_name=False)

    # Headless endpoint for the portfolio site.
    with gr.Group(visible=False):
        a_audio = gr.Audio(type="filepath")
        a_language = gr.Textbox()
        a_result = gr.JSON()
        a_error = gr.Textbox()
        a_btn = gr.Button()
    a_btn.click(transcribe, [a_audio, a_language], [a_result, a_error], api_name="transcribe")

if __name__ == "__main__":
    demo.queue(default_concurrency_limit=2).launch()
