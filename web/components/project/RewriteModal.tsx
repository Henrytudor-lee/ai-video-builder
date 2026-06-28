"use client";
import { useEffect, useState } from "react";
import { modal } from "@/components/Modal";

interface RewriteModalProps {
  pid: string;
  cid: string;
  characterName: string;
  currentDescription: string;
  scriptContext: string;
  onClose: () => void;
  onApply: (newDesc: string) => void;
}

export default function RewriteModal({ pid, cid, characterName, currentDescription, scriptContext, onClose, onApply }: RewriteModalProps) {
  const [options, setOptions] = useState<Array<{ description: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(-1);
  const [count, setCount] = useState(3);

  async function runRewrite() {
    setLoading(true);
    setError("");
    setOptions([]);
    setSelected(-1);
    try {
      const r = await fetch(`/api/projects/${pid}/characters/${cid}/ai-rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: characterName, description: currentDescription, script: scriptContext, count }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "生成失败");
      setOptions(d.options || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runRewrite(); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[var(--color-line)] flex items-center justify-between flex-shrink-0">
          <h3 className="font-semibold text-base">✍️ AI 改写描述 · {characterName}</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-[var(--color-ink-3)] hover:bg-[var(--color-bg-soft)] rounded">×</button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-3">
          <div className="text-xs text-[var(--color-ink-3)]">当前描述</div>
          <div className="text-sm px-3 py-2 rounded-md bg-[var(--color-bg-soft)] border border-[var(--color-line)]">
            {currentDescription || <span className="italic text-[var(--color-ink-4)]">（无）</span>}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-[var(--color-ink-3)]">
              候选数
              <input type="number" min={1} max={6} value={count} onChange={(e) => setCount(Math.max(1, Math.min(6, +e.target.value)))}
                className="w-14 px-2 py-1 text-sm rounded border border-[var(--color-line)] bg-[var(--color-bg-soft)]" />
            </div>
            <button onClick={runRewrite} disabled={loading} className="px-3 py-1.5 text-xs rounded-md border border-[var(--color-line)] hover:bg-[var(--color-bg-soft)] disabled:opacity-50">
              {loading ? "生成中…" : "🔄 重新生成"}
            </button>
          </div>
          {error && <div className="text-xs text-[var(--color-danger)]">{error}</div>}
          {loading ? (
            <div className="py-12 flex flex-col items-center gap-2 text-[var(--color-ink-3)]">
              <div className="w-6 h-6 border-2 border-[var(--color-brand)] border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">AI 正在构思新版本…</span>
            </div>
          ) : options.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--color-ink-3)]">暂无候选</div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-[var(--color-ink-3)]">选择一个版本（点击应用）</div>
              {options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className={`block w-full text-left p-3 rounded-lg border transition ${
                    selected === i
                      ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]"
                      : "border-[var(--color-line)] hover:border-[var(--color-line-strong)]"
                  }`}
                >
                  <div className="text-xs text-[var(--color-brand)] mb-1">版本 {i + 1}</div>
                  <p className="text-sm text-[var(--color-ink-1)] leading-relaxed">{opt.description}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-[var(--color-line)] bg-[var(--color-bg-soft)] flex justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-[var(--color-line)] bg-white">取消</button>
          <button
            onClick={async () => {
              if (selected < 0) {
                await modal.alert("请先选择一个版本", { title: "提示" });
                return;
              }
              onApply(options[selected].description);
              onClose();
            }}
            disabled={selected < 0}
            className="px-4 py-2 text-sm rounded-lg text-white bg-[var(--color-brand)] disabled:opacity-50"
          >
            应用
          </button>
        </div>
      </div>
    </div>
  );
}
