# Feliks Altymyshov — Portfolio & AI Lab

Personal site of **Feliks Altymyshov**, an AI engineer in New York City working on computer vision.
It has two parts: a 3D portfolio, and **The Lab**, a set of free AI tools for images, audio and data.
There's no sign-up and no paywall.

Built with React 19, Vite, Tailwind CSS v4 and React Three Fiber. Heavy models run on the author's
Hugging Face ZeroGPU Spaces; lighter ones run entirely in the visitor's browser.

---

## The Lab

| Tool | What it does | Runs on |
|---|---|---|
| 🎨 **Image Studio** | Civitai-style text-to-image with 5 models: Z-Image Turbo, Krea 2 Turbo (once its license is accepted), DreamShaper XL Lightning, RealVisXL V4 Lightning and Animagine XL 4.0. 11 style presets, aspect ratios, batches of up to 4, a 34-image gallery with prompts and seeds you can remix, history in your browser, and a safety filter | ⚡ GPU · `image-studio`, `zimage-turbo`, `krea-turbo` |
| 🎭 **Voice Lab** | Voice cloning and 10 voice/tone presets on Fun-CosyVoice3-0.5B; record or upload your own voice; 50 pre-rendered clips play instantly | ⚡ GPU · `voice-lab` |
| 🔊 **Text to Speech** | 10 Kokoro-82M neural voices, streamed sentence by sentence, gap-free playback, WAV download | ⚡ GPU · `kokoro-tts` (in-browser fallback) |
| 🎧 **Sound Studio** | Sound effects (Stable Audio Open, 44.1 kHz stereo) and complete songs with vocals (ACE-Step 1.5: writes the lyrics, picks tempo and key, sings, up to 2 min, or uses your lyrics). Loudness-mastered without clipping, with waveform players and a 16-clip library | ⚡ GPU · `sound-studio`, `song-studio` |
| 🪄 **Photo Editor** | Browser editor (adjustments, 10 filter presets, crop and rotate, text, brush, history with undo/redo, before/after, PNG/JPEG/WebP export) plus AI tools: edit by instruction (FLUX.1 Kontext, once its license is accepted), magic eraser (LaMa), background removal (on device) and Real-ESRGAN upscale | ⚡ GPU · `image-editor`, `image-studio` |
| 🎙️ **Transcriber** | Whisper large-v3-turbo transcription with timestamps synced to playback, search, and TXT/SRT/VTT export; audio is extracted and compressed in the browser | ⚡ GPU · `transcriber` |
| ✂️ **Background Remover** | RMBG-1.4 / MODNet cut-outs with a before/after slider and custom backgrounds (color, gradient, blur, image) | 🔒 Browser (ONNX Runtime) |
| 🔍 **Image Upscaler** | Real-ESRGAN ×2/×4 up to 4096px, with a comparison slider and ×3 zoom; any Image Studio image can be sent here in one click | ⚡ GPU · `image-studio` |
| 🧮 **Data Lab** | DuckDB-WASM: load CSV/Parquet/JSON or **any public Hugging Face dataset**, auto-profile columns, SQL with suggestions, bar/line/scatter charts, CSV export, and a plain-English **SQL copilot** (Qwen2.5-Coder-7B) | 🔒 Browser + ⚡ `sql-copilot` |
| 🎬 **Video Generator** | Wan2.1-T2V-1.3B text-to-video: 2–4 s 480p clips in landscape, portrait or square, with a gallery of ready-made clips | ⚡ GPU · `video-studio` |

Tools are listed in [`src/constants/index.js`](src/constants/index.js) (`tools`). Each one has a
`category` (audio / image / data), a `runs` badge (gpu / browser) and a `type`:

- **`custom`**: a React component under `src/components/`, lazy-loaded when its page opens.
- **`gradio`**: a Hugging Face Space embedded in an iframe.
- **`soon`**: a roadmap card with a "notify me" link.

---

## How the GPU tools are wired

```
 browser ──► /hf/<space>/…  (same origin)
               │
               ├─ production: api/space.js (Vercel function), routed by vercel.json
               └─ local dev:  Vite server.proxy (vite.config.js)
               │
               │  adds  Authorization: Bearer $HF_TOKEN  (server-side only)
               ▼
   https://felikskdm-<space>.hf.space/gradio_api/…   (Gradio HTTP API, ZeroGPU)
```

- **Quota:** ZeroGPU gives anonymous callers only a few runs a day. The proxy attaches the owner's
  token, so every visitor uses the owner's Pro allowance (40 GPU-minutes a day). The token never
  reaches the browser.
- **Allowlist:** the proxy only forwards the endpoints the tools use (`/info`, `/upload`,
  `/call/<allowed api>` and generated files under `/tmp/gradio`). Everything else returns 404.
- **Errors as data:** every Space returns `[result…, errorMessage]` instead of raising, because
  Gradio's HTTP API doesn't reliably forward exception text.
- **Large results:** images and audio can be fetched straight from the Space. Gradio allows the
  site's origin via CORS, which avoids Vercel's 4.5 MB body limit.
- **Saving quota:** the Voice Lab, Sound Studio, TTS previews and Image Studio gallery ship
  pre-rendered files (`public/`), and repeated requests are cached in the session.

Client helpers: [`src/lib/gradio.js`](src/lib/gradio.js) (call/upload/SSE),
[`src/lib/wav.js`](src/lib/wav.js) and [`src/lib/idb.js`](src/lib/idb.js) (local history).

### Text to Speech pipeline

```
 text ─► chunkText() ─► kokoro-tts Space (streams one chunk per event) ─► shapeSilence()
                     └► fallback: kokoro-js Web Worker (WebGPU / WASM)          │
                                                                                ▼
                         Web Audio scheduler: gap-free playback, live highlighting, WAV export
```

If a device generates slower than real time, the player measures that speed and delays the start
just long enough that playback never stalls. Kokoro's padding is trimmed and pauses are capped at
0.18 s.

---

## Getting started

Requires Node 20+.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build into dist/
npm run preview   # serve the build (with the same /hf proxy)
npm run lint
```

GPU tools work locally as long as you're logged in with the
[`hf` CLI](https://huggingface.co/docs/huggingface_hub/guides/cli) (`hf auth login`). The dev
server reads the saved token automatically, or `HF_TOKEN` if it's set.

### Deploying (Vercel)

1. Create a **Read** token at https://huggingface.co/settings/tokens.
2. In Vercel → Project → Settings → Environment Variables, add `HF_TOKEN` with that token.
3. Redeploy. `vercel.json` routes `/hf/*` to the proxy and serves the SPA for every other path,
   so deep links like `/tools/image-studio` work.

---

## Hugging Face Spaces

All Spaces live under [`hf-spaces/`](hf-spaces) and run on **ZeroGPU**. Pro accounts can run at most
**10 ZeroGPU Spaces**, so related models share a Space: the SQL copilot lives on `transcriber`, and the
proxy still exposes it as `/hf/sql-copilot`. The old `sql-copilot` Space is paused on CPU.

| Space | Models | API |
|---|---|---|
| `image-studio` | DreamShaper XL Lightning, RealVisXL V4 Lightning, Animagine XL 4.0, Real-ESRGAN ×4, Falconsai NSFW classifier | `generate`, `upscale` |
| `voice-lab` | Fun-CosyVoice3-0.5B, SenseVoice | `preset`, `transcribe`, `clone` |
| `kokoro-tts` | Kokoro-82M | `speak` (streaming) |
| `sound-studio` | Stable Audio Open 1.0 (gated, optional), AudioLDM2, MusicGen Medium | `generate` |
| `zimage-turbo` | Z-Image-Turbo (`MODEL_KEY=zimage`, source `turbo-models/`) | `generate`, `models` |
| `krea-turbo` | Krea-2-Turbo (`MODEL_KEY=krea`, gated, source `turbo-models/`) | `generate`, `models` |
| `transcriber` | Whisper large-v3-turbo + Qwen2.5-Coder-7B-Instruct (the Data Lab SQL copilot) | `transcribe`, `ask` |
| `song-studio` | ACE-Step 1.5 (fork of the official Space, source `song-studio/app.py`) | `song` |
| `image-editor` | LaMa (big-lama), FLUX.1 Kontext [dev] (gated, optional) | `erase`, `edit`, `models` |
| `video-studio` | Wan2.1-T2V-1.3B, Falconsai NSFW classifier | `generate` |

Deploy or update one with:

```bash
hf upload feliksKdm/<space> hf-spaces/<space> . --type space
hf spaces logs feliksKdm/<space> --build    # follow the build
hf spaces zero-gpu quota                     # remaining GPU time today
```

The Voice Lab also needs `default_voice.wav`; see `hf-spaces/voice-lab/DEPLOY.md`.

**Gated models** (Krea 2 Turbo, Stable Audio Open, FLUX.1 Kontext) need two things before they load: accept the license
on the model's Hub page, and add an `HF_TOKEN` secret (a read token) to the Space. Then restart it:
`hf spaces restart feliksKdm/krea-turbo`. Until then those Spaces report the model as unavailable,
and the site shows it as "Soon" (or falls back to AudioLDM2 for effects).

---

## Project structure

```
api/space.js             Vercel function: allowlisted proxy to the Spaces (adds HF_TOKEN)
vercel.json              /hf/* → proxy, everything else → SPA
src/
├── App.jsx              routes: /, /tools, /tools/:slug
├── pages/               Home, Tools (The Lab), ToolDetail
├── sections/            Hero, About, Projects, Experiences, Contact, Navbar, Footer, ToolsTeaser
├── components/
│   ├── imagestudio/     Image Studio (+ gallery.json)
│   ├── voicelab/        Voice Lab
│   ├── tts/             Text to Speech (+ worker, chunking, remote engine)
│   ├── soundstudio/     Sound Studio (+ library.json)
│   ├── transcriber/     Transcriber (+ MP3 worker, subtitle formats)
│   ├── bgremover/       Background Remover (+ ONNX worker)
│   ├── upscaler/        Image Upscaler
│   ├── editor/          Photo Editor (canvas ops + AI tools)
│   ├── videostudio/     Video Generator (+ clips.json)
│   └── datalab/         Data Lab (DuckDB engine, SVG charts)
├── lib/                 gradio.js, wav.js, idb.js
└── constants/index.js   all content: projects, socials, experience, tools
public/
├── image-studio/        gallery, model covers, style thumbnails
├── voice-lab/ voices/   pre-rendered voice clips
├── sound-studio/        pre-rendered sound library
└── video-studio/        pre-rendered video gallery
hf-spaces/               source of every Space (see above)
```

To change the site's content (projects, experience, tools), edit `src/constants/index.js`.

---

## Safety and privacy

- **Image Studio** refuses explicit prompts before using any GPU time and runs every result (and
  every upscale input) through an NSFW classifier.
- **Voice Lab** asks the visitor to confirm that a cloned voice is theirs.
- **Browser-only tools** (Background Remover, Data Lab queries) never upload anything. The SQL
  copilot only sees table schemas and three sample rows.
- **Local history** (generated images, transcripts) is stored in the visitor's IndexedDB only.

---

## Tech stack

**Frontend:** React 19 · Vite 7 · Tailwind CSS 4 · React Router 7 · Motion · Three.js / React Three Fiber / drei · cobe

**In the browser:** DuckDB-WASM · Transformers.js / ONNX Runtime Web · kokoro-js · lamejs · Web Audio · IndexedDB

**On the GPU:** Diffusers (SDXL) · Transformers (Whisper, MusicGen, Qwen) · spandrel (Real-ESRGAN) · CosyVoice · Gradio · Hugging Face ZeroGPU

---

## Credits and licenses

| Model | Author | License |
|---|---|---|
| Z-Image-Turbo | Tongyi-MAI (Alibaba) | Apache-2.0 |
| Krea 2 Turbo | Krea | Krea 2 Community License (requires content filtering) |
| DreamShaper XL Lightning | Lykon | CreativeML OpenRAIL++-M |
| RealVisXL V4.0 Lightning | SG161222 | CreativeML OpenRAIL++-M |
| Animagine XL 4.0 | Cagliostro Lab | CreativeML OpenRAIL++-M |
| Real-ESRGAN ×4 | ai-forever, after Xintao Wang et al. | BSD-3-Clause (per the GitHub repo) |
| Kokoro-82M | hexgrad | Apache-2.0 |
| Fun-CosyVoice3 | Alibaba FunAudioLLM | Apache-2.0 |
| Whisper large-v3-turbo | OpenAI | MIT |
| Stable Audio Open 1.0 | Stability AI | Stability AI Community License |
| ACE-Step 1.5 | ACE Studio & StepFun | MIT |
| FLUX.1 Kontext [dev] | Black Forest Labs | FLUX.1 [dev] Non-Commercial License |
| LaMa (big-lama) | Samsung AI | Apache-2.0 |
| AudioLDM2 (fallback) | CVSSP | CC BY-NC-SA 4.0 (non-commercial) |
| MusicGen Medium (legacy) | Meta | CC BY-NC 4.0 (non-commercial) |
| RMBG-1.4 | BRIA AI | bria-rmbg-1.4 (non-commercial) |
| MODNet | Ke et al. | Apache-2.0 |
| Qwen2.5-Coder-7B-Instruct | Alibaba Qwen | Apache-2.0 |
| Wan2.1-T2V-1.3B | Wan-AI (Alibaba) | Apache-2.0 |
| Falconsai NSFW image detection | Falconsai | Apache-2.0 |

Voice tools generate synthetic audio. Only clone your own voice, or a voice you have explicit
permission to use.

---

**Feliks Altymyshov** · [GitHub](https://github.com/feliksKdm) · [LinkedIn](https://www.linkedin.com/in/feliks-altymyshov-405146283/)
