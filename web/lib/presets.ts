import fs from "node:fs/promises";
import path from "node:path";

const PRESETS_DIR = path.join(process.cwd(), "lib", "presets");

export type SubjectCategory = Record<string, Array<{ code: string; label: string; emoji: string }>>;
export type SimpleOption = Array<{ code: string; label: string; desc?: string; emoji?: string }>;
export type GroupedOptions = Record<string, SimpleOption>;
export type Preset = {
  name: string;
  description: string;
  subject: any; scene: any; action: any; camera: any; style: any;
  motion: any[]; extra: string; duration: number; resolution: string;
};

export type Presets = {
  subjects: SubjectCategory;
  scenes: GroupedOptions;
  actions: SimpleOption;
  cameras: GroupedOptions;
  styles: GroupedOptions;
  motions: SimpleOption;
  atmospheres: SimpleOption;
  presets: Preset[];
};

let cache: Presets | null = null;

export async function loadPresets(): Promise<Presets> {
  if (cache) return cache;
  const [subjects, scenes, actions, cameras, styles, motions, atmospheres, presets] = await Promise.all([
    fs.readFile(path.join(PRESETS_DIR, "subjects.json"), "utf-8").then(JSON.parse),
    fs.readFile(path.join(PRESETS_DIR, "scenes.json"), "utf-8").then(JSON.parse),
    fs.readFile(path.join(PRESETS_DIR, "actions.json"), "utf-8").then(JSON.parse),
    fs.readFile(path.join(PRESETS_DIR, "cameras.json"), "utf-8").then(JSON.parse),
    fs.readFile(path.join(PRESETS_DIR, "styles.json"), "utf-8").then(JSON.parse),
    fs.readFile(path.join(PRESETS_DIR, "motions.json"), "utf-8").then(JSON.parse),
    fs.readFile(path.join(PRESETS_DIR, "atmospheres.json"), "utf-8").then(JSON.parse),
    fs.readFile(path.join(PRESETS_DIR, "presets.json"), "utf-8").then(JSON.parse),
  ]);
  cache = { subjects, scenes, actions, cameras, styles, motions, atmospheres, presets };
  return cache;
}
