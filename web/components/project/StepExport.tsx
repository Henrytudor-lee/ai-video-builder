import type { Project } from "@/lib/types";
"use client";
import { useState } from "react";
import { modal } from "@/components/Modal";


export default function StepExport({ project }: { project: Project }) {
  const [rendering, setRendering] = useState(false);
  const [composing, setComposing] = useState(false);
  const [transition, setTransition] = useState("fade");
  const [transitionDur, setTransitionDur] = useState(0.5);

  const readyCount = project.storyboards.filter((s) => s.video_file).length;
  const selectedCount = project.storyboards.filter((s) => s.selected).length;

  async function stitch() {
    if (selectedCount === 0) {
      await modal.alert("请先为分镜选定候选图", { title: "提示" });
      return;
    }
    setRendering(true);
    try {
      const r = await fetch(`/api/projects/${project.id}/stitch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transition, transition_duration: transitionDur }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "拼接失败");
      await modal.alert("成片已生成！", { title: "成功" });
    } catch (e: any) {
      await modal.alert("拼接失败：" + e.message, { title: "出错了", danger: true });
    } finally {
      setRendering(false);
    }
  }

  async function compositeGrid() {
    if (selectedCount < 1) {
      await modal.alert("请先为分镜选定候选图", { title: "提示" });
      return;
    }
    if (selectedCount > 9) {
      const ok = await modal.confirm(`当前有 ${selectedCount} 个分镜已选图，只会用前 9 个填入九宫格。继续？`, { title: "请确认" });
      if (!ok) return;
    }
    setComposing(true);
    try {
      const r = await fetch(`/api/projects/${project.id}/grid-bundle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration: 10, resolution: "768P" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "合成失败");
      await modal.alert(`九宫格已合成（${d.bundle?.panel_count || 9} 格）`, { title: "完成" });
    } catch (e: any) {
      await modal.alert("九宫格合并失败：" + e.message, { title: "出错了", danger: true });
    } finally {
      setComposing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[var(--color-line)] p-5">
        <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">🎞️ 自动拼接成片</h2>
        <p className="text-xs text-[var(--color-ink-3)] mb-4">把已渲染的分镜视频按转场拼接为完整短片。需要 ffmpeg + ffprobe。</p>
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--color-ink-3)]">转场</span>
            <select value={transition} onChange={(e) => setTransition(e.target.value)} className="px-2 py-1 text-sm rounded border border-[var(--color-line)] bg-[var(--color-bg-soft)]">
              <option value="fade">淡入淡出</option>
              <option value="wipeleft">左擦</option>
              <option value="wiperight">右擦</option>
              <option value="slideup">上推</option>
              <option value="slidedown">下推</option>
              <option value="circlecrop">圆形展开</option>
              <option value="none">无</option>
            </select>
          </label>
          {transition !== "none" && (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-[var(--color-ink-3)]">时长</span>
              <input type="number" min={0.1} max={3} step={0.1} value={transitionDur} onChange={(e) => setTransitionDur(+e.target.value)}
                className="w-16 px-2 py-1 text-sm rounded border border-[var(--color-line)] bg-[var(--color-bg-soft)]" />
              <span className="text-[var(--color-ink-3)]">秒</span>
            </label>
          )}
        </div>
        <div className="text-xs text-[var(--color-ink-3)] mb-3">
          已就绪 {readyCount} / {project.storyboards.length} 个分镜视频
        </div>
        <button onClick={stitch} disabled={rendering || readyCount === 0} className="px-4 py-2 text-sm rounded-md bg-[var(--color-brand)] text-white disabled:opacity-50">
          {rendering ? "拼接中…" : "🎬 开始拼接成片"}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[var(--color-line)] p-5">
        <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">🎞️ 九宫格合并</h2>
        <p className="text-xs text-[var(--color-ink-3)] mb-4">把已选候选图的分镜合成 3×3 大图，发一次视频即可展示所有分镜（自动选 9 宫格）。</p>
        <div className="text-xs text-[var(--color-ink-3)] mb-3">
          已选图 {selectedCount} / {project.storyboards.length} 个分镜
        </div>
        <button onClick={compositeGrid} disabled={composing || selectedCount === 0} className="px-4 py-2 text-sm rounded-md border border-[var(--color-line)] hover:bg-[var(--color-bg-soft)] disabled:opacity-50">
          {composing ? "合成中…" : "🧩 合成九宫格"}
        </button>
      </div>
    </div>
  );
}
