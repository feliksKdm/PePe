// GradioUpscaleEmbed.jsx
import { useEffect } from "react";

export default function GradioUpscaleEmbed() {
  useEffect(() => {
    // динамически подключаем gradio.js
    const s = document.createElement("script");
    s.type = "module";
    s.src = "https://gradio.s3-us-west-2.amazonaws.com/4.36.1/gradio.js";
    document.body.appendChild(s);
    return () => document.body.removeChild(s);
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
        Image Upscale (Real-ESRGAN)
      </h1>
      <p style={{ color: "#6b7280", marginBottom: 12 }}>
        Powered by Hugging Face Space.
      </p>

      <gradio-app
        src="https://nick088-real-esrgan-pytorch.hf.space?embed=1&theme=dark"
        style={{
          width: "100%",
          height: "720px",
          border: "none",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 8px 30px rgba(0,0,0,.08)",
        }}
      />
    </div>
  );
}
