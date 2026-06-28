import type { Project, Storyboard, Character } from "@/lib/types";
"use client";
import { useEffect, useState } from "react";
import { modal } from "@/components/Modal";




export default function StepStoryboards({
  project,
  onUpdate,
  onOpenLightbox,
}: {
  project: Project;
  onUpdate: (p: Project) => void;
  onOpenLightbox: (opts: { kind: "sb"; sbId: string; idx: number }) => void;
}) {
  const [artStyles, setArtStyles] = useState<Array<{ code: string; name: string; description?: string }>>([]);
  const [selectedStyle, setSelectedStyle] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatingSb, setGeneratingSb] = useState<string | null>(null);
  const [renderingSb, setRenderingSb] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newSb, setNewSb] = useState({ name: "", script: "" });

  useEffect(() => {
    // 风格选择器硬编码（与 server.py 保持一致）
    setArtStyles([
      { code: "cinematic", name: "电影质感", description: "Cinematic, film grain" },
      { code: "ghibli", name: "吉卜力", description: "Studio Ghibli style" },
      { code: "anime", name: "日系动漫", description: "Anime style" },
      { code: "pixar", name: "皮克斯 3D", description: "Pixar 3D animation" },
      { code: "realistic", name: "写实摄影", description: "Photorealistic" },
      { code: "noir", name: "黑白 noir", description: "Black and white noir" },
      { code: "watercolor", name: "水彩画", description: "Watercolor painting" },
      { code: "oil_painting", name: "油画", description: "Oil painting" },
    ]);
  }, []);

  async function aiGenerate() {
    if (!selectedStyle) {
      await modal.alert("请先选择风格", { title: "提示" });
      return;
    }
    const ok = await modal.confirm(
      "AI 将读剧本 + 角色列表 + 所选风格，按剧情顺序拆分多个分镜并追加到列表。继续？",
      { title: "请确认" }
    );
    if (!ok) return;
    setGenerating(true);
    try {
      const r = await fetch(`/api/projects/${project.id}/storyboards/ai-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style_hint: selectedStyle }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "生成失败");
      const sbList: Storyboard[] = project.storyboards;
      onUpdate({ ...project, storyboards: [...sbList, ...(d.added || [])] });
      await modal.alert(`已添加 ${d.added?.length || 0} 个分镜`, { title: "完成" });
    } catch (e: any) {
      await modal.alert("生成失败：" + e.message, { title: "出错了", danger: true });
    } finally {
      setGenerating(false);
    }
  }

  async function addStoryboard() {
    if (!newSb.script.trim() && !newSb.name.trim()) {
      await modal.alert("请至少填一个字段", { title: "提示" });
      return;
    }
    const r = await fetch(`/api/projects/${project.id}/storyboards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSb.name, script: newSb.script, prompt_data: { simple_prompt: newSb.script } }),
    });
    const d = await r.json();
    if (!r.ok) {
      await modal.alert("添加失败：" + (d.detail || `HTTP ${r.status}`), { title: "出错了", danger: true });
      return;
    }
    onUpdate({ ...project, storyboards: [...project.storyboards, d] });
    setNewSb({ name: "", script: "" });
    setShowAdd(false);
  }

  async function genCandidates(sid: string, n: number) {
    setGeneratingSb(sid);
    try {
      const sb = project.storyboards.find((x) => x.id === sid);
      const useRef = sb?.use_subject_reference || "";
      const r = await fetch(`/api/projects/${project.id}/storyboards/${sid}/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n, use_subject_reference: useRef }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "生成失败");
      const sbRef = project.storyboards.find((x) => x.id === sid);
      if (sbRef) {
        sbRef.candidates = [...(sbRef.candidates || []), ...(d.candidates || [])];
        onUpdate({ ...project });
      }
    } catch (e: any) {
      await modal.alert("生成失败：" + e.message, { title: "出错了", danger: true });
    } finally {
      setGeneratingSb(null);
    }
  }

  async function updateDuration(sid: string, value: string) {
    const num = Math.max(0.5, Math.min(10, parseFloat(value) || 6));
    const r = await fetch(`/api/projects/${project.id}/storyboards/${sid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duration: num }),
    });
    if (r.ok) {
      const sb = project.storyboards.find((x) => x.id === sid);
      if (sb) sb.duration = num;
      onUpdate({ ...project });
    }
  }

  async function saveScript(sid: string, script: string) {
    const r = await fetch(`/api/projects/${project.id}/storyboards/${sid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script, prompt_data: { simple_prompt: script } }),
    });
    if (r.ok) {
      const sb = project.storyboards.find((x) => x.id === sid);
      if (sb) {
        sb.script = script;
        sb.prompt_data = { ...(sb.prompt_data || {}), simple_prompt: script };
      }
      onUpdate({ ...project });
    }
  }

  async function deleteSb(sid: string) {
    const ok = await modal.confirm("删除此分镜？", { title: "删除确认", danger: true });
    if (!ok) return;
    const r = await fetch(`/api/projects/${project.id}/storyboards/${sid}`, { method: "DELETE" });
    if (r.ok) onUpdate({ ...project, storyboards: project.storyboards.filter((s) => s.id !== sid) });
  }

  async function renderSb(sid: string) {
    const sb = project.storyboards.find((x) => x.id === sid);
    if (!sb?.selected) {
      await modal.alert("请先选定候选图", { title: "提示" });
      return;
    }
    setRenderingSb(sid);
    try {
      // 1. 发起 render
      const r = await fetch(`/api/projects/${project.id}/storyboards/${sid}/render`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "渲染失败");

      // 2. 客户端轮询
      const start = Date.now();
      while (Date.now() - start < 10 * 60 * 1000) {
        await new Promise((res) => setTimeout(res, 5000));
        const pollR = await fetch(`/api/projects/${project.id}/storyboards/${sid}/video`);
        const pollD = await pollR.json();
        if (pollD.status === "Success") {
          await modal.alert("视频已生成！", { title: "成功" });
          const sbRef = project.storyboards.find((x) => x.id === sid);
          if (sbRef) {
            sbRef.video_status = "Success";
            sbRef.video_file = pollD.video_file;
          }
          onUpdate({ ...project });
          break;
        }
        if (pollD.status === "Fail") {
          await modal.alert("渲染失败", { title: "出错了", danger: true });
          break;
        }
      }
    } catch (e: any) {
      await modal.alert("渲染失败：" + e.message, { title: "出错了", danger: true });
    } finally {
      setRenderingSb(null);
    }
  }

  function imageUrl(sid: string) {
    return `/api/projects/${project.id}/storyboards/${sid}/image`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-semibold text-sm flex items-center gap-2">🎬 分镜</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedStyle}
            onChange={(e) => setSelectedStyle(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)]"
          >
            <option value="">—— 选择风格 ——</option>
            {artStyles.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
          <button onClick={aiGenerate} disabled={generating || !selectedStyle} className="px-3 py-1.5 text-xs rounded-md border border-[var(--color-line)] hover:bg-[var(--color-bg-soft)] disabled:opacity-50">
            {generating ? "✨ 生成中…" : "✨ AI 生成分镜"}
          </button>
          <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 text-xs rounded-md bg-[var(--color-brand)] text-white">＋ 添加分镜</button>
        </div>
      </div>

      {project.storyboards.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-[var(--color-line)] rounded-2xl">
          <div className="text-4xl mb-2">🎬</div>
          <div className="text-sm text-[var(--color-ink-3)]">暂无分镜，先选风格然后用 AI 生成，或手动添加</div>
        </div>
      ) : (
        <div className="space-y-4">
          {project.storyboards.map((sb, idx) => {
            const isGen = generatingSb === sb.id;
            const isRendering = renderingSb === sb.id;
            return (
              <div key={sb.id} className="bg-white rounded-xl border border-[var(--color-line)] p-4">
                <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-[var(--color-brand)] text-white">#{idx + 1}</span>
                    <div className="font-semibold text-sm truncate">{sb.name || `分镜 ${idx + 1}`}</div>
                    <span className="text-xs text-[var(--color-ink-3)] font-mono">{sb.duration}s</span>
                    {sb.video_status === "Success" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-success-soft)] text-[var(--color-success)]">已渲染</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-[var(--color-ink-3)]">
                      时长
                      <input
                        type="number" min={0.5} max={10} step={0.5}
                        defaultValue={sb.duration}
                        onBlur={(e) => updateDuration(sb.id, e.target.value)}
                        className="w-16 px-2 py-1 text-xs rounded border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)]"
                      />
                      s
                    </label>
                    <button onClick={() => deleteSb(sb.id)} className="w-6 h-6 flex items-center justify-center text-[var(--color-ink-3)] hover:text-[var(--color-danger)] rounded">×</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
                  <div className="aspect-video rounded-lg overflow-hidden bg-[var(--color-bg-soft)] border border-[var(--color-line)]">
                    {sb.selected ? (
                      <img src={imageUrl(sb.id)} onClick={() => onOpenLightbox({ kind: "sb", sbId: sb.id, idx: 0 })}
                        className="w-full h-full object-cover cursor-zoom-in" alt="" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-[var(--color-ink-4)]">
                        {isGen ? "生成中…" : "点右侧生成候选图"}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <textarea
                      defaultValue={sb.script || ""}
                      onBlur={(e) => saveScript(sb.id, e.target.value)}
                      rows={3}
                      placeholder="这个分镜的简要描述…"
                      className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)] focus:bg-white resize-y"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => genCandidates(sb.id, 4)} disabled={isGen} className="px-2.5 py-1 text-xs rounded border border-[var(--color-line)] hover:bg-[var(--color-bg-soft)] disabled:opacity-50">
                        {isGen ? "生成中…" : "🎨 生成 4 张候选"}
                      </button>
                      {sb.candidates && sb.candidates.length > 0 && (
                        <button onClick={() => onOpenLightbox({ kind: "sb", sbId: sb.id, idx: 0 })} className="px-2.5 py-1 text-xs rounded bg-[var(--color-brand)] text-white">
                          选图（{sb.candidates.length} 张）
                        </button>
                      )}
                      <button onClick={() => renderSb(sb.id)} disabled={isRendering || !sb.selected} className="px-2.5 py-1 text-xs rounded border border-[var(--color-line)] hover:bg-[var(--color-bg-soft)] disabled:opacity-50">
                        {isRendering ? "渲染中…" : "🎬 渲染视频"}
                      </button>
                    </div>
                    {sb.video_file && (
                      <video src={`/api/projects/${project.id}/storyboards/${sb.id}/video-file`} controls className="w-full rounded-md aspect-video bg-black mt-2" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--color-line)] flex items-center justify-between">
              <h3 className="font-semibold text-sm">添加分镜</h3>
              <button onClick={() => setShowAdd(false)} className="w-7 h-7 flex items-center justify-center text-[var(--color-ink-3)] hover:bg-[var(--color-bg-soft)] rounded">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-[var(--color-ink-3)] mb-1 block">分镜名（可选）</label>
                <input value={newSb.name} onChange={(e) => setNewSb({ ...newSb, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)]" />
              </div>
              <div>
                <label className="text-xs text-[var(--color-ink-3)] mb-1 block">镜头描述 *</label>
                <textarea value={newSb.script} onChange={(e) => setNewSb({ ...newSb, script: e.target.value })}
                  rows={4} className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)]" />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[var(--color-line)] bg-[var(--color-bg-soft)] flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm rounded-lg border border-[var(--color-line)] bg-white">取消</button>
              <button onClick={addStoryboard} className="px-4 py-2 text-sm rounded-lg text-white bg-[var(--color-brand)]">添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
