// 6 段 prompt 拼装（与 server.py 保持一致，迁移到前端 hook 也复用同一逻辑）

export const SUBJECT_TRANSLATIONS: Record<string, string> = {
  child_boy: "a young boy", child_girl: "a young girl", teen_boy: "a teenage boy",
  teen_girl: "a teenage girl", man: "a man", woman: "a woman", elder_man: "an elderly man",
  elder_woman: "an elderly woman", baby: "a baby",
  cat: "a cat", dog: "a dog", rabbit: "a rabbit", bird: "a bird", fox: "a fox",
  deer: "a deer", horse: "a horse", tiger: "a tiger", wolf: "a wolf", panda: "a panda",
  dragon: "a dragon", phoenix: "a phoenix",
  car: "a car", building: "a building", flower: "a flower", book: "a book", cup: "a cup",
  sword: "a sword", lantern: "a lantern", tree: "a tree", moon: "the moon", star: "a star",
};

function pluralize(base: string, n: number): string {
  if (n === 1) return base;
  if (base.endsWith("y")) return base.slice(0, -1) + "ies";
  if (/(s|x|ch|sh)$/.test(base)) return base + "es";
  return base + "s";
}

export function renderSubject(s: { type?: string; number?: number; description?: string }): string {
  if (!s.type) return "";
  const base = SUBJECT_TRANSLATIONS[s.type] || "";
  if (!base) return "";
  const n = s.number || 1;
  let out = pluralize(base, n);
  if (n > 1) out += ` (${n} of them)`;
  const desc = (s.description || "").trim();
  if (desc) {
    out += /^(with|wearing|holding|in|at)/.test(desc) ? `, ${desc}` : `, with ${desc}`;
  }
  return out;
}

export function renderScene(s: { time?: string; location?: string; details?: string; weather?: string; light_dir?: string }): string {
  const parts: string[] = [];
  if (s.time && s.location) parts.push(`${s.time} ${s.location}`);
  else if (s.time) parts.push(s.time);
  else if (s.location) parts.push(s.location);
  if (s.details) parts.push(s.details);
  if (s.weather) parts.push(s.weather);
  if (s.light_dir) parts.push(s.light_dir);
  return parts.length ? `in ${parts.join(", ")}` : "";
}

export function renderAction(a: { timeline?: Array<{ time?: string; action?: string }>; expression?: string }): string {
  const acts = (a.timeline || [])
    .filter((t) => t.action && t.action.trim())
    .sort((x, y) => (x.time || "").localeCompare(y.time || ""))
    .map((t) => t.action!.trim());
  if (!acts.length) return "";
  let s = acts[0];
  for (let i = 1; i < acts.length; i++) {
    s += i === acts.length - 1 ? `, then ${acts[i]}` : `, ${acts[i]}`;
  }
  if (a.expression && a.expression.trim()) s += `, expression: ${a.expression.trim()}`;
  return s;
}

export function renderCamera(c: { shot?: string; movement?: string; angle?: string; focal?: string; depth?: string }): string {
  const parts: string[] = [];
  if (c.shot) parts.push(c.shot);
  if (c.movement) parts.push(c.movement);
  if (c.angle) parts.push(c.angle);
  if (c.focal) parts.push(c.focal);
  if (c.depth) parts.push(c.depth);
  return parts.length ? `Camera: ${parts.join(", ")}` : "";
}

export function renderStyle(s: { anchors?: string[]; tone?: string; saturation?: string; lighting?: string; moods?: string[] }): string {
  const parts: string[] = [];
  if (s.anchors && s.anchors.length) parts.push(s.anchors.join(", "));
  if (s.tone) parts.push(s.tone);
  if (s.saturation) parts.push(s.saturation);
  if (s.lighting) parts.push(s.lighting);
  if (s.moods && s.moods.length) parts.push(s.moods.join(", "));
  return parts.length ? `Style: ${parts.join(", ")}` : "";
}

export function renderMotion(motions: Array<{ code: string; group?: number }>): string {
  if (!motions || !motions.length) return "";
  return `Motion: ${motions.map((m) => m.code).join(", ")}`;
}

export function assemblePrompt(d: {
  subject: any; scene: any; action: any; camera: any; style: any;
  motion: any[]; extra?: string;
}): string {
  const parts = [
    renderSubject(d.subject),
    renderScene(d.scene),
    renderAction(d.action),
    renderCamera(d.camera),
    renderStyle(d.style),
    renderMotion(d.motion),
  ].filter(Boolean);
  let prompt = parts.join(". ");
  if (d.extra && d.extra.trim()) prompt += `. ${d.extra.trim()}`;
  return prompt;
}
