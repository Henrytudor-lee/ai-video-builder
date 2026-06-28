import { spawn } from "node:child_process";

export async function hasFFmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", ["-version"]);
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
}

export async function hasFFprobe(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", ["-version"]);
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
}

export async function probeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error("ffprobe failed"));
      resolve(parseFloat(out.trim()) || 0);
    });
  });
}

export type Transition = "fade" | "wipeleft" | "wiperight" | "slideup" | "slidedown" | "circlecrop" | "none";

/** 用 xfade 滤镜拼接多段视频 */
export async function concatVideos(
  inputs: string[],
  output: string,
  transition: Transition = "fade",
  transitionDur: number = 0.5
): Promise<void> {
  if (inputs.length === 1) {
    // 只有一个就直接复制
    return new Promise((resolve, reject) => {
      const p = spawn("ffmpeg", ["-y", "-i", inputs[0], "-c", "copy", output]);
      p.on("error", reject);
      p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
    });
  }

  if (transition === "none" || inputs.length < 2) {
    // 简单 concat demuxer
    const listFile = output + ".list.txt";
    const { writeFile } = await import("node:fs/promises");
    await writeFile(listFile, inputs.map((f) => `file '${f}'`).join("\n"));
    return new Promise((resolve, reject) => {
      const p = spawn("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", output]);
      p.on("error", reject);
      p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
    });
  }

  // xfade 链式拼接
  const durations = await Promise.all(inputs.map(probeDuration));
  // 构造滤镜链：n 段视频 -> 1 段
  const N = inputs.length;
  // offset[i] 表示第 i 段视频开始的时刻
  // offset[0]=0, offset[i] = offset[i-1] + durations[i-1] - transitionDur
  const offsets: number[] = [];
  for (let i = 0; i < N; i++) {
    offsets.push(i === 0 ? 0 : offsets[i - 1] + durations[i - 1] - transitionDur);
  }
  // 构造 -i inputs[i] -i inputs[i+1] ... + filter_complex
  const filterParts: string[] = [];
  // 第一步：两两 xfade
  let lastLabel = "[0:v]";
  let lastAudio = "[0:a]";
  for (let i = 1; i < N; i++) {
    const outV = i === N - 1 ? "[vout]" : `[v${i}]`;
    const outA = i === N - 1 ? "[aout]" : `[a${i}]`;
    filterParts.push(
      `${lastLabel}[${i}:v]xfade=transition=${transition}:duration=${transitionDur}:offset=${offsets[i]}${outV}`
    );
    filterParts.push(`${lastAudio}[${i}:a]acrossfade=d=${transitionDur}${outA}`);
    lastLabel = outV;
    lastAudio = outA;
  }
  const filter = filterParts.join(";");
  const args = ["-y"];
  inputs.forEach((f) => args.push("-i", f));
  args.push(
    "-filter_complex", filter,
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-c:a", "aac",
    output
  );
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args);
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${err.slice(-300)}`));
    });
  });
}
