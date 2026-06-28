"use client";
import { useState } from "react";
import { modal } from "@/components/Modal";

interface Idea {
  title?: string;
  script?: string;
  tone?: string;
}

export default function BrainstormModal({
  initialBrief,
  aspectRatio,
  onClose,
  onApply,
}: {
  initialBrief: string;
  aspectRatio: string;
  onClose: () => void;
  onApply: (idea: Idea) => void;
}) {
  const [brief, setBrief] = useState(initialBrief);
  const [count, setCount] = useState(8);
  const [styleHint, setStyleHint] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    if (!brief.trim()) {
      setError("请输入简报");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, count, style_hint: styleHint, aspect_ratio: aspectRatio }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "生成失败");
      setIdeas(d.ideas || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--color-line)] flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-base">💡 AI 头脑风暴</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-[var(--color-ink-3)] hover:bg-[var(--color-bg-soft)] rounded">×</button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          <div>
            <label className="text-xs text-[var(--color-ink-3)] mb-1 block">简短描述（1-3 句）</label>
            <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
              placeholder="例：5 岁男孩在雨夜追逐一只流浪猫"
              className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)] focus:bg-white" />
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <div>
              <label className="text-xs text-[var(--color-ink-3)] mb-1 block">数量</label>
              <input type="number" min={3} max={12} value={count} onChange={(e) => setCount(+e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-ink-3)] mb-1 block">风格提示（可选）</label>
              <input value={styleHint} onChange={(e) => setStyleHint(e.target.value)}
                placeholder="如：吉卜力风格、黑色幽默"
                className="w-full px-2 py-1.5 text-sm rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)]" />
            </div>
          </div>
          <button onClick={run} disabled={loading} className="w-full py-2 rounded-md text-sm font-medium text-white bg-[var(--color-brand)] disabled:opacity-50">
            {loading ? "💡 思考中…" : "✨ 开始头脑风暴"}
          </button>
          {error && <div className="text-xs text-[var(--color-danger)]">{error}</div>}
          {ideas.length > 0 && (
            <div>
              <div className="text-xs text-[var(--color-ink-3)] mb-2">选择一个方向（会作为新项目剧本）</div>
              <div className="space-y-2">
                {ideas.map((idea, i) => (
                  <button key={i} onClick={() => onApply(idea)}
                    className="block w-full text-left p-3 rounded-lg border border-[var(--color-line)] hover:border-[var(--color-brand)] hover:bg-[var(--color-brand-soft)] transition">
                    <div className="font-semibold text-sm text-[var(--color-ink-1)]">#{i + 1} {idea.title || ""}</div>
                    {idea.tone && <div className="text-xs text-[var(--color-brand)] mt-0.5">调性：{idea.tone}</div>}
                    <p className="text-xs text-[var(--color-ink-2)] mt-1.5 leading-relaxed">{idea.script || ""}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
