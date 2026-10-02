export const myProjects = [
  {
    id: 1,
    title: "License Plate Recognition",
    emoji: "🚗",
    gradient: "from-cyan-500/30 via-indigo to-storm",
    accent: "#33c2cc",
    description:
      "Real-time ANPR system: a fine-tuned YOLO detector finds plates in video, OpenCV rectifies the crops, and an OCR engine turns pixels into validated, queryable records.",
    subDescription: [
      "Fine-tuned a YOLO model to detect license plates in motion-blurred, low-light and skewed frames.",
      "Built an OpenCV preprocessing stage — perspective correction, denoising, CLAHE contrast equalization — that moved accuracy more than any model swap.",
      "Validated OCR output against plate-format rules with per-character confidence fusion.",
      "Served the pipeline through a FastAPI service with structured, honest-confidence records.",
    ],
    tags: ["Python", "PyTorch", "YOLO", "OpenCV", "OCR", "FastAPI"],
    href: "https://github.com/feliksKdm/License_plate_recognition_US",
  },
  {
    id: 2,
    title: "Face Recognition API",
    emoji: "🧑‍💻",
    gradient: "from-royal/40 via-indigo to-storm",
    accent: "#7a57db",
    description:
      "Face-recognition authentication as a clean, documented API — InsightFace embeddings, PostgreSQL vector search, and JWT sessions behind FastAPI.",
    subDescription: [
      "Detect & align faces with InsightFace, embed into 512-d ArcFace vectors via ONNX Runtime.",
      "Store embeddings in PostgreSQL and verify with cosine-similarity search close to the data.",
      "Apply configurable decision thresholds and issue JWTs on success, with a full audit log.",
      "Small deliberate surface — enroll, verify, revoke — fully typed and documented via OpenAPI.",
    ],
    tags: ["Python", "FastAPI", "InsightFace", "PostgreSQL", "JWT", "Docker"],
    href: "https://github.com/feliksKdm",
  },
  {
    id: 3,
    title: "Credit Card Fraud Detection",
    emoji: "💳",
    gradient: "from-coral/30 via-indigo to-storm",
    accent: "#ea4884",
    description:
      "Supervised ML pipeline that flags fraudulent transactions in heavily imbalanced data — feature engineering, resampling and model evaluation done honestly.",
    subDescription: [
      "Explored and cleaned real anonymized transaction data with Pandas and NumPy.",
      "Handled extreme class imbalance with resampling strategies instead of accuracy theater.",
      "Trained and compared classification models in scikit-learn against a fixed test set.",
      "Evaluated with precision/recall and ROC-AUC — the metrics that actually matter for fraud.",
    ],
    tags: ["Python", "scikit-learn", "Pandas", "NumPy", "Jupyter"],
    href: "https://github.com/feliksKdm/CreditCard_FroudDetection",
  },
  {
    id: 4,
    title: "Chemical Hazard Lot Priority",
    emoji: "🧪",
    gradient: "from-mint/25 via-indigo to-storm",
    accent: "#57db96",
    description:
      "Data-science competition project: predicting which chemical lots need priority hazard handling from tabular production data.",
    subDescription: [
      "Built the full tabular ML workflow — EDA, feature engineering, model training and submission.",
      "Engineered domain features from lot metadata to boost signal in a noisy target.",
      "Cross-validated models to keep the leaderboard score honest against overfitting.",
    ],
    tags: ["Python", "Pandas", "scikit-learn", "Feature Engineering"],
    href: "https://github.com/feliksKdm",
  },
];

export const mySocials = [
  {
    name: "GitHub",
    href: "https://github.com/feliksKdm",
    icon: "/assets/logos/github.svg",
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/in/feliks-altymyshov-405146283/",
    icon: "/assets/socials/linkedIn.svg",
  },
];

export const experiences = [
  {
    title: "Freelance & personal products",
    job: "Full-Stack Developer",
    date: "2021 — 2023",
    contents: [
      "Built web applications end to end — where I learned that shipping, deploying and maintaining software is a different sport from writing it.",
      "Developed an e-commerce platform with product catalogs, payments and localization.",
      "Implemented authentication and role-based access control (OAuth, JWT, MFA).",
      "Delivered responsive frontends with React and Tailwind backed by SQL databases.",
    ],
  },
  {
    title: "New York City",
    job: "Computer Science Student",
    date: "2023 — PRESENT",
    contents: [
      "International student studying CS in NYC — data structures, algorithms, and the math underneath machine learning.",
      "Coursework: data structures & algorithms, databases (SQL), linear algebra and statistics for ML.",
      "Self-directed track alongside classes: deep learning, computer vision, system design and distributed-systems fundamentals.",
    ],
  },
  {
    title: "Independent projects",
    job: "AI / ML Engineer",
    date: "2024 — PRESENT",
    contents: [
      "Designing and shipping end-to-end computer-vision systems — from dataset curation and model fine-tuning to the APIs that serve them.",
      "Built a real-time license-plate recognition pipeline: YOLO detection, OpenCV rectification, OCR with confidence fusion.",
      "Built a face-recognition authentication service on InsightFace embeddings with PostgreSQL vector search.",
      "Adopted an evaluation-first workflow: fixed test sets, one-command scoring, honest metrics.",
    ],
  },
];

// ---------------------------------------------------------------------------
// The Lab — AI tools. Add a new entry here and it appears on /tools
// automatically. type: "gradio" embeds a Hugging Face Space; "soon" renders
// a roadmap page until you ship it (then switch the type and add src).
// ---------------------------------------------------------------------------
export const tools = [
  {
    slug: "image-upscaler",
    name: "Image Upscaler",
    emoji: "🖼️",
    status: "live",
    type: "gradio",
    src: "https://nick088-real-esrgan-pytorch.hf.space",
    tagline: "Upscale low-resolution images with Real-ESRGAN.",
    description:
      "Drop in a blurry or low-res image and get a sharper, upscaled version back. Runs Real-ESRGAN (PyTorch) on a Hugging Face Space — free to use, right in the browser.",
    tags: ["Computer Vision", "Real-ESRGAN", "PyTorch"],
  },
  {
    slug: "voice-lab",
    name: "Voice Lab",
    emoji: "🎭",
    status: "live",
    type: "custom",
    // Native UI (src/components/voicelab) driving the API of
    // https://huggingface.co/spaces/feliksKdm/voice-lab (ZeroGPU)
    tagline: "10 ready-made voices and tones, or clone your own — CosyVoice 3.",
    description:
      "Zero-shot voice cloning and style control on Fun-CosyVoice3-0.5B (Apache-2.0). Pick from 10 preset voices and tones — my own voice natural, cheerful, calm or hyped, a deep narrator, a robot, a cartoon and more — type any text and hear it in one click, or drop in a 10-second clip to clone a different voice. Supports cross-lingual synthesis in 9 languages and natural-language style instructions. Runs on Hugging Face ZeroGPU.",
    notice:
      "Only clone your own voice or a voice you have explicit permission to use. Generated audio is synthetic and must not be used to impersonate anyone.",
    tags: ["Voice Cloning", "10 Voice Presets", "CosyVoice 3", "ZeroGPU", "Multilingual"],
  },
  {
    slug: "video-transcriber",
    name: "Video Transcriber",
    emoji: "🎙️",
    status: "soon",
    type: "soon",
    tagline: "Turn any video or audio into accurate, timestamped text.",
    description:
      "Upload a video or audio file and get a clean transcript with timestamps — built on Whisper-class speech recognition. Currently in development.",
    tags: ["Speech-to-Text", "Whisper", "Audio"],
  },
  {
    slug: "text-to-speech",
    name: "Text to Speech",
    emoji: "🔊",
    status: "live",
    type: "custom",
    tagline: "10 natural neural voices, generated on a GPU in about a second.",
    description:
      "Type or paste up to 5,000 characters and hear them in one of 10 hand-picked neural voices — US and UK, male and female. Preview any voice in one tap, tune speed and volume, follow along with live highlighting and download the result as a WAV. Powered by Kokoro-82M on a Hugging Face ZeroGPU Space, streaming sentence by sentence so playback starts almost instantly — with an in-browser fallback if the server is unreachable. Free, and nothing is stored.",
    tags: ["Kokoro-82M", "Neural TTS", "ZeroGPU", "Streaming"],
  },
  {
    slug: "video-generator",
    name: "Video Generator",
    emoji: "🎬",
    status: "soon",
    type: "soon",
    tagline: "Generate short video clips from text prompts.",
    description:
      "Describe a scene and generate a short clip. Exploring open video-diffusion models to make this practical in the browser. Currently in development.",
    tags: ["Generative AI", "Diffusion", "Video"],
  },
];
