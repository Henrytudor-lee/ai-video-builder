import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuid } from "uuid";
import { PROJECTS_DIR } from "./paths";
import { loadJson, saveJson, removeIfExists } from "./storage";

// ===== 类型 =====
export interface Character {
  id: string;
  name: string;
  description: string;
  reference_image: string; // 相对项目根的路径
  generated_images: string[];
  selected: string;
}

export interface Storyboard {
  id: string;
  order: number;
  name: string;
  script: string;
  prompt_data: Record<string, any>;
  use_subject_reference: string; // char.id
  duration: number;
  resolution: string;
  candidates: string[];
  selected: string;
  video_task_id: string;
  video_status: string;
  video_file: string;
}

export interface GridBundle {
  id: string;
  grid_image: string;
  duration: number;
  resolution: string;
  storyboard_ids: string[];
  panel_count: number;
  video_task_id: string;
  video_status: string;
  video_file: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  script: string;
  aspect_ratio: string;
  characters: Character[];
  storyboards: Storyboard[];
  grid_bundles: GridBundle[];
  created_at: string;
  updated_at: string;
}

export interface ProjectListItem {
  id: string;
  name: string;
  script: string;
  aspect_ratio: string;
  character_count: number;
  storyboard_count: number;
  created_at: string;
  updated_at: string;
}

// ===== 路径 =====
export function projectDir(pid: string) {
  return path.join(PROJECTS_DIR, pid);
}
export function projectJsonPath(pid: string) {
  return path.join(projectDir(pid), "project.json");
}
export function charactersDir(pid: string) {
  return path.join(projectDir(pid), "characters");
}
export function storyboardDir(pid: string, sid: string) {
  return path.join(projectDir(pid), "storyboards", sid);
}

// ===== 列表 =====
export async function listProjects(): Promise<ProjectListItem[]> {
  try {
    await fs.mkdir(PROJECTS_DIR, { recursive: true });
  } catch {}
  const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  // 按修改时间倒序
  const stats = await Promise.all(
    dirs.map(async (d) => {
      const p = path.join(PROJECTS_DIR, d.name, "project.json");
      try {
        const st = await fs.stat(p);
        return { name: d.name, mtime: st.mtimeMs };
      } catch {
        return { name: d.name, mtime: 0 };
      }
    })
  );
  stats.sort((a, b) => b.mtime - a.mtime);

  const out: ProjectListItem[] = [];
  for (const s of stats) {
    try {
      const data: Project = await loadJson(path.join(PROJECTS_DIR, s.name, "project.json"), null as any);
      if (!data) continue;
      out.push({
        id: data.id,
        name: data.name,
        script: (data.script || "").slice(0, 100),
        aspect_ratio: data.aspect_ratio,
        character_count: (data.characters || []).length,
        storyboard_count: (data.storyboards || []).length,
        created_at: data.created_at,
        updated_at: data.updated_at,
      });
    } catch {}
  }
  return out;
}

// ===== 读 / 写 =====
export async function loadProject(pid: string): Promise<Project> {
  const p = projectJsonPath(pid);
  try {
    const data: Project = await loadJson(p, null as any);
    if (!data) throw new Error("not found");
    // back-compat
    if (!data.grid_bundles) data.grid_bundles = [];
    return data;
  } catch {
    throw new Error("项目不存在");
  }
}

export async function saveProject(p: Project): Promise<void> {
  p.updated_at = new Date().toISOString();
  await saveJson(projectJsonPath(p.id), p);
}

export async function createProject(input: { name: string; script?: string; aspect_ratio?: string }): Promise<Project> {
  const now = new Date().toISOString();
  const p: Project = {
    id: uuid().replace(/-/g, "").slice(0, 8),
    name: input.name,
    script: input.script || "",
    aspect_ratio: input.aspect_ratio || "16:9",
    characters: [],
    storyboards: [],
    grid_bundles: [],
    created_at: now,
    updated_at: now,
  };
  await saveProject(p);
  return p;
}

export async function updateProject(pid: string, patch: Partial<Pick<Project, "name" | "script" | "aspect_ratio">>): Promise<Project> {
  const p = await loadProject(pid);
  Object.assign(p, patch);
  await saveProject(p);
  return p;
}

/** 递归删项目目录 */
export async function deleteProject(pid: string): Promise<void> {
  await fs.rm(projectDir(pid), { recursive: true, force: true });
}

export async function batchDeleteProjects(ids: string[]): Promise<{ deleted: string[]; missing: string[]; errors: string[] }> {
  const deleted: string[] = [];
  const missing: string[] = [];
  const errors: string[] = [];
  for (const id of ids) {
    try {
      const exists = await fs.stat(projectDir(id)).then(() => true).catch(() => false);
      if (!exists) { missing.push(id); continue; }
      await deleteProject(id);
      deleted.push(id);
    } catch (e: any) {
      errors.push(`${id}: ${e.message}`);
    }
  }
  return { deleted, missing, errors };
}

