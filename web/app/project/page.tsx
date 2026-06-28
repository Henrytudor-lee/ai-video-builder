import type { Project } from "@/lib/types";
"use client";
import { useState, useEffect } from "react";
import ModalRoot from "@/components/Modal";
import ProjectListView from "@/components/project/ProjectListView";
import StepNav from "@/components/project/StepNav";
import StepScript from "@/components/project/StepScript";
import StepCharacters from "@/components/project/StepCharacters";
import StepStoryboards from "@/components/project/StepStoryboards";
import StepExport from "@/components/project/StepExport";
import BrainstormModal from "@/components/project/BrainstormModal";
import Lightbox from "@/components/Lightbox";
import { modal } from "@/components/Modal";


export default function ProjectPage() {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [config, setConfig] = useState<{ has_key: boolean; ffmpeg_available: boolean } | null>(null);
  const [showBrainstorm, setShowBrainstorm] = useState(false);
  const [lightbox, setLightbox] = useState<any>(null);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then(setConfig);
  }, []);

  async function openProject(id: string) {
    const r = await fetch(`/api/projects/${id}`);
    if (!r.ok) return;
    const p = await r.json();
    if (!p.grid_bundles) p.grid_bundles = [];
    setCurrentProject(p);
    setCurrentStep(1);
  }

  function closeProject() {
    setCurrentProject(null);
    setCurrentStep(1);
  }

  async function updateProject(p: Project) {
    setCurrentProject(p);
  }

  async function applyBrainstormIdea(idea: any) {
    if (!currentProject) return;
    const scriptText = idea.script || "";
    const r = await fetch(`/api/projects/${currentProject.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: scriptText }),
    });
    if (r.ok) {
      const updated = await r.json();
      setCurrentProject({ ...currentProject, ...updated });
      setCurrentStep(1);
      setShowBrainstorm(false);
      await modal.alert("已应用此方向到剧本", { title: "完成" });
    }
  }

  async function saveName(newName: string) {
    if (!currentProject) return;
    const r = await fetch(`/api/projects/${currentProject.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    if (r.ok) {
      const updated = await r.json();
      setCurrentProject({ ...currentProject, name: updated.name });
    }
  }

  async function saveAspect(ar: string) {
    if (!currentProject) return;
    const r = await fetch(`/api/projects/${currentProject.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aspect_ratio: ar }),
    });
    if (r.ok) {
      const updated = await r.json();
      setCurrentProject({ ...currentProject, aspect_ratio: updated.aspect_ratio });
    }
  }

  async function deleteProject() {
    if (!currentProject) return;
    const ok = await modal.confirm(`确认删除项目"${currentProject.name}"？此操作不可恢复！`, { title: "删除确认", danger: true });
    if (!ok) return;
    const r = await fetch(`/api/projects/${currentProject.id}`, { method: "DELETE" });
    if (r.ok) closeProject();
  }

  if (!currentProject) {
    return (
      <>
        <ModalRoot />
        <main className="max-w-6xl mx-auto px-6 py-8">
          <ProjectListView onOpen={openProject} />
        </main>
      </>
    );
  }

  return (
    <>
      <ModalRoot />
      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={closeProject} className="px-2 py-1 text-sm rounded-md hover:bg-[var(--color-bg-soft)] text-[var(--color-ink-2)]">← 返回</button>
            <input
              defaultValue={currentProject.name}
              onBlur={(e) => e.target.value !== currentProject.name && saveName(e.target.value)}
              className="text-lg font-semibold px-2 py-1 rounded-md bg-transparent hover:bg-[var(--color-bg-soft)] outline-none focus:bg-white border border-transparent focus:border-[var(--color-line)] max-w-[280px]"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={currentProject.aspect_ratio}
              onChange={(e) => saveAspect(e.target.value)}
              className="px-2.5 py-1.5 text-sm rounded-md border border-[var(--color-line)] bg-white"
            >
              <option value="16:9">16:9 横屏</option>
              <option value="9:16">9:16 竖屏</option>
              <option value="1:1">1:1 方形</option>
              <option value="4:3">4:3 传统</option>
              <option value="3:2">3:2 照片</option>
            </select>
            <button onClick={() => setShowBrainstorm(true)} className="px-3 py-1.5 text-sm rounded-md border border-[var(--color-line)] hover:bg-[var(--color-bg-soft)]">💡 头脑风暴</button>
            <button onClick={deleteProject} className="px-3 py-1.5 text-sm rounded-md text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]">删除</button>
          </div>
        </div>

        <StepNav currentStep={currentStep} steps={["剧本", "角色", "分镜", "导出"]} onChange={setCurrentStep} />

        {!config?.has_key && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-[var(--color-warn-soft)] text-sm text-[var(--color-warn)] border border-[var(--color-warn)]/20">
            ⚠️ 未配置 API key，AI 生成/视频生成将无法工作。请在主页右上角设置。
          </div>
        )}

        {currentStep === 1 && (
          <StepScript
            project={currentProject}
            onSave={updateProject}
            onOpenBrainstorm={() => setShowBrainstorm(true)}
          />
        )}
        {currentStep === 2 && (
          <StepCharacters
            project={currentProject}
            onUpdate={updateProject}
            onOpenLightbox={(opts) => setLightbox(opts)}
            onOpenRewrite={(cid) => modal.alert("改写功能待实现", { title: "TODO" })}
          />
        )}
        {currentStep === 3 && (
          <StepStoryboards
            project={currentProject}
            onUpdate={updateProject}
            onOpenLightbox={(opts) => setLightbox({ ...opts, pid: currentProject.id, allSb: currentProject.storyboards })}
          />
        )}
        {currentStep === 4 && <StepExport project={currentProject} />}
      </main>

      {showBrainstorm && (
        <BrainstormModal
          initialBrief={currentProject.script || ""}
          aspectRatio={currentProject.aspect_ratio}
          onClose={() => setShowBrainstorm(false)}
          onApply={applyBrainstormIdea}
        />
      )}

      {lightbox && (
        <Lightbox
          state={lightbox}
          onClose={() => setLightbox(null)}
          onSelect={async (path) => {
            if (lightbox.kind === "sb" && currentProject) {
              const idx = currentProject.storyboards
                .find((s: any) => s.id === lightbox.sbId)?.candidates?.indexOf(path) ?? -1;
              if (idx >= 0) {
                await fetch(`/api/projects/${currentProject.id}/storyboards/${lightbox.sbId}/select`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ candidate_index: idx }),
                });
                // 刷新项目
                const r = await fetch(`/api/projects/${currentProject.id}`);
                if (r.ok) setCurrentProject(await r.json());
              }
            }
          }}
        />
      )}
    </>
  );
}
