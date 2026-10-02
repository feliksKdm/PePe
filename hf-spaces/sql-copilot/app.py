"""
SQL Copilot — plain-English questions to DuckDB SQL with Qwen2.5-Coder-7B on
ZeroGPU. The portfolio's Data Lab sends table schemas (plus a few sample rows)
and runs the returned SQL locally in DuckDB-WASM. Errors travel as data.
"""

import re
import traceback

import gradio as gr
import spaces
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct"
MAX_QUESTION = 500
MAX_SCHEMA = 8000

tokenizer = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForCausalLM.from_pretrained(MODEL, torch_dtype=torch.bfloat16).to("cuda")

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
        out = model.generate(**inputs, max_new_tokens=400, do_sample=False, pad_token_id=tokenizer.eos_token_id)
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


def ui_ask(question, schema):
    sql, error = ask(question, schema)
    if error:
        raise gr.Error(error)
    return sql


with gr.Blocks(title="SQL Copilot") as demo:
    gr.Markdown(
        "# 🧮 SQL Copilot\nPlain-English questions to DuckDB SQL with Qwen2.5-Coder-7B. Part of "
        "[Feliks Altymyshov's](https://github.com/feliksKdm) portfolio lab."
    )
    schema = gr.Textbox(label="Schema", lines=6, placeholder='orders(order_id BIGINT, order_date DATE, store VARCHAR, revenue DOUBLE)')
    question = gr.Textbox(label="Question", placeholder="Which store had the highest revenue last month?")
    btn = gr.Button("Write SQL", variant="primary")
    out = gr.Code(label="SQL", language="sql")
    btn.click(ui_ask, [question, schema], out, api_name=False)

    with gr.Group(visible=False):
        a_q, a_s, a_sql, a_err = gr.Textbox(), gr.Textbox(), gr.Textbox(), gr.Textbox()
        a_btn = gr.Button()
    a_btn.click(ask, [a_q, a_s], [a_sql, a_err], api_name="ask")

if __name__ == "__main__":
    demo.queue(default_concurrency_limit=2).launch()
