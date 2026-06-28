import type { Project } from "@/lib/types";
"use client";
import { useState } from "react";
import { modal } from "@/components/Modal";


export default function StepScript({
  project,
  onSave,
  onOpenBrainstorm,
}: {
  project: Project;
  onSave: (p: Project) => Promise<void> | void;
  onOpenBrainstorm: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const r = await fetch(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: project.script }),
    });
    if (r.ok) {
      const p = await r.json();
      onSave(p);
    }
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-xl border border-[var(--color-line)] p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-sm flex items-center gap-2">📝 剧本</h2>
        <button onClick={onOpenBrainstorm} className="px-3 py-1.5 text-xs rounded-md border border-[var(--color-line)] hover:bg-[var(--color-bg-soft)] text-[var(--color-ink-2)]">
          💡 AI 头脑风暴
        </button>
      </div>
      <textarea
        value={project.script || ""}
        onChange={(e) => onSave({ ...project, script: e.target.value })}
        onBlur={save}
        rows={14}
        placeholder="在这里写你的短片剧本…"
        className="w-full px-3 py-2.5 text-sm font-mono leading-relaxed rounded-lg border border-[var(--color-line)] bg-[var(--color-bg-soft)] outline-none focus:border-[var(--color-brand)] focus:bg-white resize-y"
      />
      <div className="flex items-center justify-between mt-2 text-xs text-[var(--color-ink-3)]">
        <span className="font-mono">{(project.script || "").length} 字</span>
        <span>{saving ? "保存中…" : "已自动保存"}</span>
      </div>
    </div>
  );
}
