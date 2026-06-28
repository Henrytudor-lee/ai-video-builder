import path from "node:path";

/** 项目根目录（video-prompt-builder/） */
export const ROOT_DIR = path.resolve(process.cwd(), "..");

/** 持久化数据目录：data/projects/{pid}/ */
export const DATA_DIR = path.join(ROOT_DIR, "data");
export const PROJECTS_DIR = path.join(DATA_DIR, "projects");

/** v1 Builder 输出视频目录 */
export const OUTPUTS_DIR = path.join(ROOT_DIR, "outputs");

/** 单文件任务表（轮询时回填 prompt/duration/resolution） */
export const TASKS_PATH = path.join(DATA_DIR, "tasks.json");

/** v1 Builder 历史记录 */
export const HISTORY_PATH = path.join(DATA_DIR, "history.json");
