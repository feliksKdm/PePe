"""
Transcriber — Whisper large-v3-turbo on ZeroGPU, for Feliks Altymyshov's
portfolio. Long audio is transcribed in 30-second chunks, batched on the GPU,
and returned as timestamped segments.

The portfolio calls `/transcribe` through its own proxy. The API returns
[result, error], with errors as data, like the other lab Spaces.
"""

import re
import time
import traceback

import gradio as gr
import librosa
import spaces
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
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


# ---------------------------------------------------------------------------
# SQL copilot (moved here from the sql-copilot Space to stay within the
# 10-ZeroGPU-Spaces limit). Plain-English questions → DuckDB SQL for the Data
# Lab; the site still calls it at /hf/sql-copilot (the proxy routes it here).
# ---------------------------------------------------------------------------
COPILOT_MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct"
MAX_QUESTION = 500
MAX_SCHEMA = 8000
tokenizer = AutoTokenizer.from_pretrained(COPILOT_MODEL)
copilot = AutoModelForCausalLM.from_pretrained(COPILOT_MODEL, torch_dtype=torch.bfloat16).to("cuda")

SYSTEM = """You are an expert data analyst who writes DuckDB SQL.
Rules:
- Answer with ONE DuckDB SQL query and nothing else: no explanation, no comments.
- Use only the tables and columns in the schema. Quote identifiers with double quotes when they contain capitals, spaces or symbols.
- Prefer readable column aliases, ORDER BY for rankings, and LIMIT 100 for row listings.
- For dates use DuckDB functions such as date_trunc, strftime, extract.
- Round averages and percentages to 2 decimals.
- Read-only: never write CREATE, INSERT, UPDATE, DELETE, DROP, ALTER, COPY, ATTACH or INSTALL."""

WRITE = re.compile(r"\b(create|insert|update|delete|drop|alter|copy|attach|install|load|pragma|export)\b", re.I)



@spaces.GPU(duration=20)
def complete(messages):
    text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tokenizer([text], return_tensors="pt").to("cuda")
    with torch.inference_mode():
        out = copilot.generate(**inputs, max_new_tokens=400, do_sample=False, pad_token_id=tokenizer.eos_token_id)
    return tokenizer.decode(out[0][inputs.input_ids.shape[1]:], skip_special_tokens=True)


def extract_sql(reply):
    m = re.search(r"```(?:sql)?\s*(.*?)```", reply, re.S | re.I)
    sql = (m.group(1) if m else reply).strip().rstrip(";").strip()
    return sql


def ask(question, schema):
    """API: returns (sql, error)."""
    try:
        question = (question or "").strip()
        schema = (schema or "").strip()
        if not question:
            return "", "Ask a question about your data first."
        if len(question) > MAX_QUESTION:
            return "", f"Keep the question under {MAX_QUESTION} characters."
        if not schema:
            return "", "Load a table first."
        schema = schema[:MAX_SCHEMA]
        reply = complete([
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Schema:\n{schema}\n\nQuestion: {question}"},
        ])
        sql = extract_sql(reply)
        if not sql or not re.match(r"^\s*(with|select|from|summarize|describe|pivot|unpivot)\b", sql, re.I):
            return "", "Couldn't turn that into a query. Try rephrasing it."
        if WRITE.search(re.sub(r"'[^']*'", "''", sql)):
            return "", "The copilot only writes read-only queries."
        return sql, ""
    except gr.Error as exc:
        return "", str(exc.message)
    except Exception as exc:
        traceback.print_exc()
        return "", f"The copilot failed ({type(exc).__name__}). Please try again."



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

    with gr.Group(visible=False):
        q_q, q_s, q_sql, q_err = gr.Textbox(), gr.Textbox(), gr.Textbox(), gr.Textbox()
        q_btn = gr.Button()
    q_btn.click(ask, [q_q, q_s], [q_sql, q_err], api_name="ask")

if __name__ == "__main__":
    demo.queue(default_concurrency_limit=2).launch()
