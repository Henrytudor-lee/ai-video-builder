"use client";
import { useEffect, useState } from "react";
import ModalRoot, { modal } from "@/components/Modal";

const SUBJECT_TRANSLATIONS: Record<string, string> = {
  child_boy: "a young boy", child_girl: "a young girl", man: "a man", woman: "a woman",
  cat: "a cat", dog: "a dog", car: "a car", building: "a building", tree: "a tree",
};
function pluralize(base: string, n: number) {
  if (n === 1) return base;
  if (/(s|x|ch|sh)$/.test(base)) return base + "es";
  return base + "s";
}
function assemblePrompt(d: any) {
  const parts: string[] = [];
  if (d.subject?.type) {
    const base = SUBJECT_TRANSLATIONS[d.subject.type] || d.subject.type;
    let s = pluralize(base, d.subject.number || 1);
    if ((d.subject.number || 1) > 1) s += ` (${d.subject.number} of them)`;
    if (d.subject.description?.trim()) s += `, with ${d.subject.description.trim()}`;
    parts.push(s);
  }
  if (d.scene?.location) parts.push(`in ${d.scene.location}`);
  if (d.action?.timeline?.length) {
    const acts = d.action.timeline.filter((t: any) => t.action?.trim()).map((t: any) => t.action.trim());
    if (acts.length) parts.push(acts.join(", then "));
  }
  if (d.camera?.shot) parts.push(`Camera: ${d.camera.shot}`);
  if (d.style?.anchors?.length) parts.push(`Style: ${d.style.anchors.join(", ")}`);
  if (d.motion?.length) parts.push(`Motion: ${d.motion.join(", ")}`);
  if (d.extra?.trim()) parts.push(d.extra.trim());
  return parts.join(". ");
}

export default function Home() {
  const [config, setConfig] = useState<{ has_key: boolean; key_preview: string; ffmpeg_available: boolean } | null>(null);
  const [options, setOptions] = useState<any>(null);
  const [subject, setSubject] = useState({ category: "人物", type: "child_boy", number: 1, description: "" });
  const [scene, setScene] = useState({ location: "", time: "", weather: "", details: "" });
  const [action, setAction] = useState({ timeline: [{ time: "0-2s", action: "" }, { time: "3-4s", action: "" }, { time: "5-6s", action: "" }] });
  const [camera, setCamera] = useState({ shot: "medium shot" });
  const [style, setStyle] = useState({ anchors: [] as string[] });
  const [motion, setMotion] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const [duration, setDuration] = useState(6);
  const [resolution, setResolution] = useState("768P");
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKey, setNewKey] = useState("");

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setConfig);
    fetch("/api/options").then((r) => r.json()).then(setOptions);
  }, []);

  const prompt = assemblePrompt({ subject, scene, action, camera, style, motion, extra });
  const promptLength = prompt.length;

  async function generate() {
    if (!prompt) { setError("Prompt 为空"); return; }
    if (promptLength > 2000) { setError(`Prompt 过长（${promptLength}/2000）`); return; }
    setGenerating(true); setError(""); setResult(null);
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, scene, action, camera, style, motion, extra, duration, resolution }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || "生成失败"); }
      setResult(await r.json());
      setStatus("完成 ✓");
    } catch (e: any) {
      setError(e.message);
      setStatus("失败");
    } finally {
      setGenerating(false);
    }
  }

  async function saveKey() {
    if (!newKey.trim()) return;
    const r = await fetch("/api/config/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: newKey.trim() }),
    });
    if (r.ok) {
      setShowKeyModal(false);
      setNewKey("");
      fetch("/api/config").then((r) => r.json()).then(setConfig);
    }
  }

  return (
    <>
      <ModalRoot />
      <header className="border-b border-[var(--color-line)] bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--color-brand)] text-white flex items-center justify-center text-lg">🎬</div>
            <div>
              <div className="font-semibold text-sm">Video Prompt Builder</div>
              <div className="text-xs text-[var(--color-ink-3)]">海螺 2.3 · 视频提示词工坊</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="/project" className="px-3 py-1.5 text-sm rounded-md hover:bg-[var(--color-bg-soft)] text-[var(--color-ink-2)]">📂 分镜工作流</a>
            {config?.has_key ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-[var(--color-success-soft)] text-[var(--color-success)]">{config.key_preview}</span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-xs bg-[var(--color-warn-soft)] text-[var(--color-warn)]">未配置 API key</span>
            )}
            <button onClick={() => setShowKeyModal(true)} className="px-3 py-1.5 text-sm rounded-md border border-[var(--color-line)] hover:bg-[var(--color-bg-soft)]">
              {config?.has_key ? "更换" : "设置"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <section className="space-y-4">
          {/* 主体 */}
          <div className="bg-white rounded-xl border border-[var(--color-line)] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-[var(--color-brand)] text-white text-xs flex items-center justify-center font-semibold">1</span>
              <h2 className="font-semibold text-sm">主体（Subject）</h2>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-[var(--color-ink-3)] mb-1.5">分类</div>
                <div className="flex flex-wrap gap-1.5">
                  {options && Object.keys(options.subjects || {}).map((cat) => (
                    <button key={cat} onClick={() => setSubject({ ...subject, category: cat })}
                      className={`px-3 py-1 text-sm rounded-md border transition ${
                        subject.category === cat ? "bg-[var(--color-brand)] text-white border-[var(--color-brand)]" : "bg-white border-[var(--color-line)] hover:border-[var(--color-line-strong)]"
                      }`}>{cat}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--color-ink-3)] mb-1.5">具体对象</div>
                <div className="flex flex-wrap gap-1.5">
                  {options && (options.subjects?.[subject.category] || []).map((item: any) => (
                    <button key={item.code} onClick={() => setSubject({ ...subject, type: item.code })}
                      className={`px-3 py-1 text-sm rounded-md border ${
                        subject.type === item.code ? "bg-[var(--color-brand-soft)] border-[var(--color-brand)] text-[var(--color-brand-ink)]" : "bg-white border-[var(--color-line)]"
                      }`}>
                      <span className="mr-1">{item.emoji}</span>{item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <div>
                  <label className="text-xs text-[var(--color-ink-3)] mb-1.5 block">数量</label>
                  <input type="number" min={1} max={20} value={subject.number} onChange={(e) => setSubject({ ...subject, number: +e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)]" />
                </div>
                <div>
                  <label className="text-xs text-[var(--color-ink-3)] mb-1.5 block">外貌/衣着/姿态</label>
                  <input type="text" value={subject.description} onChange={(e) => setSubject({ ...subject, description: e.target.value })}
                    placeholder="例：棕色短发、穿宽松 T 恤"
                    className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)]" />
                </div>
              </div>
            </div>
          </div>

          {/* 场景 */}
          <div className="bg-white rounded-xl border border-[var(--color-line)] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-[var(--color-brand)] text-white text-xs flex items-center justify-center font-semibold">2</span>
              <h2 className="font-semibold text-sm">场景（Scene）</h2>
            </div>
            <input type="text" value={scene.location} onChange={(e) => setScene({ ...scene, location: e.target.value })}
              placeholder="例：上海弄堂，雨夜"
              className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)]" />
          </div>

          {/* 动作 */}
          <div className="bg-white rounded-xl border border-[var(--color-line)] p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-[var(--color-brand)] text-white text-xs flex items-center justify-center font-semibold">3</span>
              <h2 className="font-semibold text-sm">动作（Action）</h2>
            </div>
            <div className="space-y-2">
              {action.timeline.map((t, i) => (
                <div key={i} className="grid grid-cols-[80px_1fr] gap-2">
                  <input type="text" value={t.time} onChange={(e) => { const tl = [...action.timeline]; tl[i] = { ...t, time: e.target.value }; setAction({ ...action, timeline: tl }); }}
                    className="px-2 py-1.5 text-sm rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)] font-mono" />
                  <input type="text" value={t.action} onChange={(e) => { const tl = [...action.timeline]; tl[i] = { ...t, action: e.target.value }; setAction({ ...action, timeline: tl }); }}
                    placeholder="动作描述"
                    className="px-2 py-1.5 text-sm rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)]" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          {/* Prompt 预览 */}
          <div className="bg-white rounded-xl border border-[var(--color-line)] p-5 sticky top-20">
            <div className="text-xs text-[var(--color-ink-3)] mb-1.5">Prompt（{promptLength}/2000）</div>
            <div className="text-sm font-mono text-[var(--color-ink-1)] leading-relaxed min-h-[60px] max-h-[240px] overflow-y-auto whitespace-pre-wrap">
              {prompt || <span className="text-[var(--color-ink-4)]">（填写左侧字段自动拼装）</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div>
                <label className="text-xs text-[var(--color-ink-3)] block mb-1">时长</label>
                <select value={duration} onChange={(e) => setDuration(+e.target.value)} className="w-full px-2 py-1.5 text-sm rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)]">
                  <option value={6}>6 秒</option>
                  <option value={10}>10 秒</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--color-ink-3)] block mb-1">分辨率</label>
                <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="w-full px-2 py-1.5 text-sm rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)]">
                  <option value="768P">768P</option>
                  <option value="1080P">1080P（仅 6s）</option>
                </select>
              </div>
            </div>
            <button onClick={generate} disabled={generating || !config?.has_key}
              className="w-full mt-3 py-2.5 rounded-lg font-medium text-sm text-white bg-[var(--color-brand)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed">
              {generating ? "生成中…" : "🎬 生成视频"}
            </button>
            {!config?.has_key && <div className="text-xs text-[var(--color-ink-3)] text-center mt-2">请先在右上角设置 API key</div>}
            {error && <div className="text-xs text-[var(--color-danger)] text-center mt-2">{error}</div>}
            {result?.local_file && (
              <div className="mt-3 space-y-2">
                <video src={`/api/outputs/${result.local_file}`} controls className="w-full rounded-md aspect-video bg-black" />
                <a href={`/api/outputs/${result.local_file}`} download={result.local_file} className="block text-center text-xs px-3 py-1.5 rounded-md border border-[var(--color-line)] hover:bg-[var(--color-bg-soft)]">下载 ↓</a>
              </div>
            )}
          </div>
        </aside>
      </main>

      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowKeyModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--color-line)] flex items-center justify-between">
              <h3 className="font-semibold text-sm">设置 MiniMax API Key</h3>
              <button onClick={() => setShowKeyModal(false)} className="w-7 h-7 flex items-center justify-center text-[var(--color-ink-3)] hover:bg-[var(--color-bg-soft)] rounded">×</button>
            </div>
            <div className="px-5 py-4 space-y-2">
              <p className="text-xs text-[var(--color-ink-3)]">
                在 <a href="https://platform.minimaxi.com/user-center/basic-information/interface-key" target="_blank" className="font-mono text-[var(--color-brand)]">platform.minimaxi.com</a> 用户中心 → 接口密钥获取
              </p>
              <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)}
                placeholder="eyJhbGciOi..." className="w-full px-3 py-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-soft)] text-sm font-mono outline-none focus:border-[var(--color-brand)] focus:bg-white" />
              <p className="text-[10px] text-[var(--color-ink-4)]">保存在项目 config.json + .env 文件里（仅本地）</p>
            </div>
            <div className="px-5 py-3 border-t border-[var(--color-line)] bg-[var(--color-bg-soft)] flex justify-end gap-2">
              <button onClick={() => setShowKeyModal(false)} className="px-4 py-2 text-sm rounded-lg border border-[var(--color-line)] bg-white">取消</button>
              <button onClick={saveKey} className="px-4 py-2 text-sm rounded-lg text-white bg-[var(--color-brand)]">保存</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
