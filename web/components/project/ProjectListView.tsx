"use client";
import { useEffect, useState } from "react";
import { modal } from "@/components/Modal";

interface ProjectItem {
  id: string;
  name: string;
  script: string;
  aspect_ratio: string;
  character_count: number;
  storyboard_count: number;
  created_at: string;
  updated_at: string;
}

export default function ProjectListView({ onOpen }: { onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/projects");
    setProjects(await r.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedIds([]);
  }
  function onCardClick(p: ProjectItem) {
    if (selectMode) {
      setSelectedIds((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]));
    } else {
      onOpen(p.id);
    }
  }
  function isAllSelected() {
    return projects.length > 0 && selectedIds.length === projects.length;
  }
  function selectAll() {
    setSelectedIds(isAllSelected() ? [] : projects.map((p) => p.id));
  }
  function invertSelection() {
    setSelectedIds(projects.filter((p) => !selectedIds.includes(p.id)).map((p) => p.id));
  }
  async function batchDelete() {
    if (selectedIds.length === 0) return;
    const names = selectedIds.map((id) => projects.find((x) => x.id === id)?.name || id);
    const preview = names.slice(0, 5).join("、");
    const more = names.length > 5 ? ` 等 ${names.length} 个项目` : "";
    const ok = await modal.confirm(
      `将永久删除：${preview}${more}。此操作不可恢复！`,
      { title: `批量删除 ${selectedIds.length} 个项目`, danger: true, confirmText: "全部删除" }
    );
    if (!ok) return;
    const r = await fetch("/api/projects/batch-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    const data = await r.json();
    if (data.ok) {
      await modal.alert(`已删除 ${data.deleted_count} 个项目${data.missing?.length ? `（${data.missing.length} 个不存在）` : ""}`, { title: "删除完成" });
      setSelectMode(false);
      setSelectedIds([]);
      load();
    } else {
      await modal.alert("批量删除失败：" + (data.detail || "未知错误"), { title: "出错了", danger: true });
    }
  }
  async function createProject() {
    const name = await modal.prompt("项目名？", { defaultValue: "我的第一部短片", title: "请输入" });
    if (!name) return;
    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, script: "", aspect_ratio: "16:9" }),
    });
    const p = await r.json();
    if (p.detail) {
      await modal.alert("创建失败：" + p.detail, { title: "出错了", danger: true });
      return;
    }
    load();
    onOpen(p.id);
  }
  async function deleteOne(id: string, name: string) {
    const ok = await modal.confirm(`确认删除项目"${name}"？此操作不可恢复！`, { title: "删除确认", danger: true });
    if (!ok) return;
    const r = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (r.ok) load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-bold tracking-tight">项目列表</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSelectMode}
            className={`px-3 py-1.5 text-sm rounded-md border transition ${
              selectMode
                ? "bg-[var(--color-brand)] text-white border-[var(--color-brand)]"
                : "bg-white border-[var(--color-line)] hover:border-[var(--color-line-strong)]"
            }`}
          >
            {selectMode ? "✓ 完成" : "☑ 管理"}
          </button>
          {!selectMode && (
            <button onClick={createProject} className="px-3 py-1.5 text-sm rounded-md bg-[var(--color-brand)] text-white hover:opacity-90">
              ＋ 新建项目
            </button>
          )}
        </div>
      </div>

      {selectMode && (
        <div className="sticky top-0 z-10 mb-4 px-4 py-2.5 rounded-lg bg-white/80 backdrop-blur border border-[var(--color-line)] flex items-center gap-3">
          <span className="text-sm text-[var(--color-ink-2)]">
            已选 <span className="font-mono font-semibold text-[var(--color-brand)]">{selectedIds.length}</span> 个 / 共 <span className="font-mono">{projects.length}</span> 个
          </span>
          <button onClick={selectAll} className="px-2.5 py-1 text-xs rounded border border-[var(--color-line)] bg-white hover:bg-[var(--color-bg-soft)]">
            {isAllSelected() ? "取消全选" : "全选"}
          </button>
          <button onClick={invertSelection} className="px-2.5 py-1 text-xs rounded border border-[var(--color-line)] bg-white hover:bg-[var(--color-bg-soft)]">
            反选
          </button>
          <div className="flex-1" />
          <button
            onClick={batchDelete}
            disabled={selectedIds.length === 0}
            className="px-3 py-1.5 text-xs rounded-md bg-[var(--color-danger)] text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🗑 删除选中 {selectedIds.length > 0 && `(${selectedIds.length})`}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-[var(--color-ink-3)]">加载中…</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-[var(--color-line)] rounded-2xl">
          <div className="text-5xl mb-3">🎬</div>
          <div className="text-[var(--color-ink-3)] mb-4">还没有项目，点右上角"＋ 新建项目"开始</div>
          <button onClick={createProject} className="px-4 py-2 text-sm rounded-md bg-[var(--color-brand)] text-white">
            ＋ 新建第一个项目
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            return (
              <div
                key={p.id}
                onClick={() => onCardClick(p)}
                className={`group relative bg-white rounded-xl border p-4 cursor-pointer transition min-h-[156px] flex flex-col gap-3 ${
                  isSelected
                    ? "border-[var(--color-brand)] bg-[var(--color-brand-soft)]"
                    : "border-[var(--color-line)] hover:border-[var(--color-line-strong)] hover:shadow-sm"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {selectMode && (
                      <div
                        onClick={(e) => { e.stopPropagation(); onCardClick(p); }}
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer ${
                          isSelected ? "bg-[var(--color-brand)] border-[var(--color-brand)]" : "border-[var(--color-line-strong)] hover:border-[var(--color-brand)]"
                        }`}
                      >
                        {isSelected && <span className="text-white text-xs">✓</span>}
                      </div>
                    )}
                    <div className="font-semibold text-[15px] truncate text-[var(--color-ink-1)]">{p.name}</div>
                  </div>
                  {!selectMode && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteOne(p.id, p.name); }}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-[var(--color-ink-3)] hover:text-[var(--color-danger)] rounded transition"
                      title="删除"
                    >×</button>
                  )}
                </div>
                <div className="text-[13px] leading-relaxed text-[var(--color-ink-2)] line-clamp-2 min-h-[2.6em]">
                  {p.script || <span className="italic text-[var(--color-ink-4)]">（暂无剧本）</span>}
                </div>
                <div className="mt-auto flex items-center justify-between text-[11px] text-[var(--color-ink-3)]">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">▭ {p.aspect_ratio || "16:9"}</span>
                    <span className="flex items-center gap-1">👤 <span className="font-mono">{p.character_count}</span></span>
                    <span className="flex items-center gap-1">🎬 <span className="font-mono">{p.storyboard_count}</span></span>
                  </div>
                  <span>{(p.updated_at || p.created_at || "").slice(5, 16)}</span>
                </div>
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--color-brand)] text-white text-xs flex items-center justify-center">✓</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
