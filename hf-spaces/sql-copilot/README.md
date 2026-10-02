---
title: SQL Copilot
emoji: 🧮
colorFrom: purple
colorTo: blue
sdk: gradio
sdk_version: 5.50.0
app_file: app.py
pinned: false
license: apache-2.0
short_description: Plain-English questions to DuckDB SQL (Qwen2.5-Coder-7B)
---

# SQL Copilot

Natural-language to DuckDB SQL for the Data Lab on Feliks Altymyshov's
portfolio, using `Qwen/Qwen2.5-Coder-7B-Instruct` on ZeroGPU.

- **Privacy:** the site sends only table schemas and a few sample rows, never
  the full data. Queries run in the visitor's browser.
- **API:** `/ask` takes `(question, schema)` and returns `[sql, error]`.

Redeploy: `hf upload feliksKdm/sql-copilot hf-spaces/sql-copilot . --type space`
