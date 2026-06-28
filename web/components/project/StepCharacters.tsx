import type { Project, Character } from "@/lib/types";
"use client";
import { useState } from "react";
import { modal } from "@/components/Modal";



export default function StepCharacters({
  project,
  onUpdate,
  onOpenLightbox,
  onOpenRewrite,
}: {
  project: Project;
  onUpdate: (p: Project) => void;
  onOpenLightbox: (opts: { kind: "single"; src: string; title: string }) => void;
  onOpenRewrite: (cid: string) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newChar, setNewChar] = useState({ name: "", description: "" });
  const [newFile, setNewFile] = useState<File | null>(null);

  async function aiGenerate() {
    const ok = await modal.confirm("AI 将读剧本并追加所有识别出的角色（已有角色不会被覆盖）。继续？", { title: "请确认" });
    if (!ok) return;
    setGenerating(true);
    try {
      const r = await fetch(`/api/projects/${project.id}/characters/ai-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: project.script }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "生成失败");
      onUpdate(d);
      await modal.alert(`已添加 ${d.added?.length || 0} 个新角色`, { title: "完成" });
    } catch (e: any) {
      await modal.alert("生成失败：" + e.message, { title: "出错了", danger: true });
    } finally {
      setGenerating(false);
    }
  }

  async function addChar() {
    if (!newChar.name.trim()) {
      await modal.alert("角色名不能为空", { title: "提示" });
      return;
    }
    const form = new FormData();
    form.append("name", newChar.name);
    form.append("description", newChar.description);
    if (newFile) form.append("file", newFile);
    const r = await fetch(`/api/projects/${project.id}/characters`, {
      method: "POST",
      body: form,
    });
    const d = await r.json();
    if (!r.ok) {
      await modal.alert("添加失败：" + (d.detail || `HTTP ${r.status}`), { title: "出错了", danger: true });
      return;
    }
    onUpdate({ ...project, characters: [...project.characters, d] });
    setNewChar({ name: "", description: "" });
    setNewFile(null);
    setShowAdd(false);
  }

  async function genImages(cid: string) {
    setGeneratingId(cid);
    try {
      const r = await fetch(`/api/projects/${project.id}/characters/${cid}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n: 3, aspect_ratio: "1:1" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.detail || "生成失败");
      const c = project.characters.find((x) => x.id === cid);
      if (c) {
        c.generated_images = [...(c.generated_images || []), ...(d.images || [])];
        onUpdate({ ...project });
      }
    } catch (e: any) {
      await modal.alert("生成失败：" + e.message, { title: "出错了", danger: true });
    } finally {
      setGeneratingId(null);
    }
  }

  async function selectImage(cid: string, imagePath: string) {
    const r = await fetch(`/api/projects/${project.id}/characters/${cid}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_path: imagePath }),
    });
    if (r.ok) {
      const c = project.characters.find((x) => x.id === cid);
      if (c) c.selected = imagePath;
      onUpdate({ ...project });
    }
  }

  async function deleteChar(cid: string, name: string) {
    const ok = await modal.confirm(`删除角色"${name}"？`, { title: "删除确认", danger: true });
    if (!ok) return;
    const r = await fetch(`/api/projects/${project.id}/characters/${cid}`, { method: "DELETE" });
    if (r.ok) onUpdate({ ...project, characters: project.characters.filter((c) => c.id !== cid) });
  }

  function imageUrl(cid: string) {
    return `/api/projects/${project.id}/characters/${cid}/image`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-sm flex items-center gap-2">👤 角色</h2>
        <div className="flex items-center gap-2">
          <button onClick={aiGenerate} disabled={generating} className="px-3 py-1.5 text-xs rounded-md border border-[var(--color-line)] hover:bg-[var(--color-bg-soft)] disabled:opacity-50">
            {generating ? "✨ 生成中…" : "✨ AI 抽取角色"}
          </button>
          <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 text-xs rounded-md bg-[var(--color-brand)] text-white">＋ 添加角色</button>
        </div>
      </div>

      {project.characters.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-[var(--color-line)] rounded-2xl">
          <div className="text-4xl mb-2">👤</div>
          <div className="text-sm text-[var(--color-ink-3)]">暂无角色，先写剧本然后用 AI 抽取，或手动添加</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {project.characters.map((c) => {
            const hasImage = c.selected || c.reference_image || (c.generated_images && c.generated_images.length > 0);
            const isGen = generatingId === c.id;
            return (
              <div key={c.id} className="bg-white rounded-xl border border-[var(--color-line)] overflow-hidden">
                <div className="relative aspect-square bg-[var(--color-bg-soft)]">
                  {hasImage ? (
                    <img
                      src={imageUrl(c.id)}
                      onClick={() => onOpenLightbox({ kind: "single", src: imageUrl(c.id), title: c.name })}
                      className="w-full h-full object-cover cursor-zoom-in"
                      alt={c.name}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--color-ink-4)] text-xs">
                      {isGen ? "生成中…" : "暂无图"}
                    </div>
                  )}
                  {isGen && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="font-semibold text-sm truncate">{c.name}</div>
                    <button onClick={() => deleteChar(c.id, c.name)} className="w-5 h-5 flex items-center justify-center text-[var(--color-ink-3)] hover:text-[var(--color-danger)]">×</button>
                  </div>
                  <p className="text-xs text-[var(--color-ink-2)] leading-relaxed line-clamp-3 min-h-[3em]">
                    {c.description || <span className="italic text-[var(--color-ink-4)]">（无描述）</span>}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <button onClick={() => genImages(c.id)} disabled={isGen} className="px-2 py-1 text-[11px] rounded border border-[var(--color-line)] hover:bg-[var(--color-bg-soft)] disabled:opacity-50">
                      {isGen ? "生成中…" : "🎨 候选"}
                    </button>
                    <button onClick={() => onOpenRewrite(c.id)} className="px-2 py-1 text-[11px] rounded border border-[var(--color-line)] hover:bg-[var(--color-bg-soft)]">✍️ 改写</button>
                    {c.generated_images && c.generated_images.length > 1 && (
                      <select
                        value={c.selected || ""}
                        onChange={(e) => selectImage(c.id, e.target.value)}
                        className="px-1.5 py-1 text-[11px] rounded border border-[var(--color-line)] bg-[var(--color-bg-soft)] max-w-[80px]"
                      >
                        <option value="">选图</option>
                        {c.generated_images.map((img, i) => <option key={i} value={img}>v{i + 1}</option>)}
                      </select>
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
              <h3 className="font-semibold text-sm">添加角色</h3>
              <button onClick={() => setShowAdd(false)} className="w-7 h-7 flex items-center justify-center text-[var(--color-ink-3)] hover:bg-[var(--color-bg-soft)] rounded">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs text-[var(--color-ink-3)] mb-1 block">角色名 *</label>
                <input value={newChar.name} onChange={(e) => setNewChar({ ...newChar, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)]" />
              </div>
              <div>
                <label className="text-xs text-[var(--color-ink-3)] mb-1 block">描述</label>
                <textarea value={newChar.description} onChange={(e) => setNewChar({ ...newChar, description: e.target.value })}
                  rows={3} className="w-full px-3 py-2 text-sm rounded-md border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)]" />
              </div>
              <div>
                <label className="text-xs text-[var(--color-ink-3)] mb-1 block">参考图（可选）</label>
                <input type="file" accept="image/*" onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                  className="text-xs" />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[var(--color-line)] bg-[var(--color-bg-soft)] flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm rounded-lg border border-[var(--color-line)] bg-white">取消</button>
              <button onClick={addChar} className="px-4 py-2 text-sm rounded-lg text-white bg-[var(--color-brand)]">添加</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
