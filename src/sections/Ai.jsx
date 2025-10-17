import React, { useState } from "react";
import { Client } from "@gradio/client";

export default function HFUpscaleResilient() {
  const [file, setFile] = useState(null);
  const [outUrl, setOutUrl] = useState("");
  const [log, setLog] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [scale, setScale] = useState(2); // 2 или 4

  const SPACE_ID = "Nick088/Real-ESRGAN_Pytorch";
  const ROUTES = ["/predict", "/run/predict"];
  const FN_INDICES = [0, 1, 2, 3];
  const IMG_KEYS = ["img", "image", "input_image"];

  function extractUrlFrom(res) {
    if (!res) return "";
    const arr = Array.isArray(res.data) ? res.data : [res.data];
    for (const x of arr) {
      if (typeof x === "string" && (x.startsWith("http") || x.startsWith("data:"))) return x;
      if (x && typeof x === "object" && typeof x.url === "string") return x.url;
    }
    return "";
  }

  function buildScaleCandidates(sel) {
    return [
      {},
      { outscale: sel },
      { scale: `${sel}x` },
      { face_enhance: false },
    ];
  }

  async function handleUpscale() {
    if (!file) return;
    setErr(""); setOutUrl(""); setLog(""); setLoading(true);

    try {
      const app = await Client.connect(SPACE_ID);
      const SCALE_CANDIDATES = buildScaleCandidates(scale);

      for (const route of ROUTES) {
        for (const imgKey of IMG_KEYS) {
          for (const extra of SCALE_CANDIDATES) {
            try {
              const args = { [imgKey]: file, ...extra };
              const res = await app.predict(route, args);
              const url = extractUrlFrom(res);
              if (url) {
                setOutUrl(url);
                setLog(`OK via route="${route}", imgKey="${imgKey}", extra=${JSON.stringify(extra)}`);
                setLoading(false);
                return;
              }
            } catch {}
          }
        }
      }

      for (const idx of FN_INDICES) {
        for (const imgKey of IMG_KEYS) {
          for (const extra of SCALE_CANDIDATES) {
            try {
              const args = { [imgKey]: file, ...extra };
              const res = await app.predict(idx, args);
              const url = extractUrlFrom(res);
              if (url) {
                setOutUrl(url);
                setLog(`OK via fn_index=${idx}, imgKey="${imgKey}", extra=${JSON.stringify(extra)}`);
                setLoading(false);
                return;
              }
            } catch {}
          }
        }
      }

      throw new Error("Не найден рабочий endpoint/fn_index для этого Space.");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  const handleDownload = () => {
    if (!outUrl) return;
    const link = document.createElement("a");
    link.href = outUrl;
    link.download = `upscaled_${scale}x.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h3 className="text-heading">Image Upscale</h3>
      <p className="text-description text-neutral-400">Enhance your images with Real-ESRGAN (Resilient).</p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
        <label><input type="radio" name="scale" checked={scale === 2} onChange={() => setScale(2)} /> 2x</label>
        <label><input type="radio" name="scale" checked={scale === 4} onChange={() => setScale(4)} /> 4x</label>
      </div>

      <input
        type="file"
        accept="image/*"
        onChange={e => setFile(e.target.files?.[0] || null)}
        className="px-2 py-3 text-lg text-center rounded-md cursor-pointer bg-gradient-to-r from-indigo-400 to-indigo-600 hover-animation"
      />
      <button
        onClick={handleUpscale}
        disabled={!file || loading}
        style={{ marginLeft: 8 }}
        className="px-2 py-3 text-lg text-center rounded-md cursor-pointer bg-gradient-to-r from-indigo-400 to-indigo-600 hover-animation"
      >
        {loading ? "Обработка…" : `Upscale (${scale}x)`}
      </button>

      {err && <div style={{ color: "crimson", marginTop: 8 }}>{err}</div>}
      {log && <div style={{ color: "#155e75", marginTop: 8, fontSize: 12 }}>Debug: {log}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        {file && (
          <div>
            <p>Original</p>
            <img src={URL.createObjectURL(file)} alt="in" style={{ maxWidth: 420, borderRadius: 8 }} />
          </div>
        )}
        {outUrl && (
          <div>
            <p>Upscaled</p>
            <img src={outUrl} alt="out" style={{ maxWidth: 420, borderRadius: 8 }} />
            <button
              onClick={handleDownload}
              className="px-2 py-3 text-lg text-center rounded-md cursor-pointer bg-gradient-to-r from-indigo-400 to-indigo-600 hover-animation mt-4"
            >
              Download
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
