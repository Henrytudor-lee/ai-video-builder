import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import fs from "node:fs/promises";
import path from "node:path";
import { loadProject, saveProject, charactersDir } from "@/lib/project";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const form = await req.formData();
  const name = String(form.get("name") || "").trim();
  const description = String(form.get("description") || "");
  const file = form.get("file");

  if (!name) return NextResponse.json({ detail: "角色名不能为空" }, { status: 400 });

  const cid = uuid().replace(/-/g, "").slice(0, 6);
  const char: any = {
    id: cid,
    name,
    description,
    reference_image: "",
    generated_images: [],
    selected: "",
  };

  if (file && file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ detail: "图片过大（>10MB）" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    let ext = path.extname(file.name).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) ext = ".jpg";
    const fname = `${cid}_ref${ext}`;
    await fs.mkdir(charactersDir(pid), { recursive: true });
    await fs.writeFile(path.join(charactersDir(pid), fname), buf);
    char.reference_image = `characters/${fname}`;
  }

  const project = await loadProject(pid);
  project.characters.push(char);
  await saveProject(project);
  return NextResponse.json(char);
}
