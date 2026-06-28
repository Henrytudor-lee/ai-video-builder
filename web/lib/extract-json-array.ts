/**
 * 从 LLM 响应里提取 JSON 数组。
 * 处理：
 *   - <think>...</think> 块
 *   - ```json ... ``` 围栏
 *   - 字符串里未转义的控制字符（直接报 raw_decode 错）
 *   - 字符串里未转义的英文双引号（state machine 识别）
 */

export function extractJsonArray(raw: string): any[] {
  let text = (raw || "").trim();

  // 1. 去 <think>...</think>（包含跨行）
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // 2. 找第一个 [ 与最后一个匹配的 ]
  const start = text.indexOf("[");
  if (start < 0) throw new Error("response does not contain a JSON array");
  let depth = 0;
  let end = -1;
  let inStr = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === "[") depth++;
      else if (ch === "]") { depth--; if (depth === 0) { end = i; break; } }
    }
  }
  if (end < 0) throw new Error("unbalanced brackets in response");
  let arrayText = text.slice(start, end + 1);

  // 3. 先尝试严格解析
  try {
    return JSON.parse(arrayText);
  } catch {
    // 4. 失败 → 启发式修复：转义未转义控制字符 + 未转义英文引号
    arrayText = escapeUnescapedControlChars(arrayText);
    arrayText = escapeUnescapedQuotes(arrayText);
    return JSON.parse(arrayText);
  }
}

/** 字符串字面量内的控制字符 → \\n \\t \\r */
function escapeUnescapedControlChars(s: string): string {
  let out = "";
  let inStr = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = ch.charCodeAt(0);
    if (inStr) {
      if (escape) { out += ch; escape = false; continue; }
      if (ch === "\\") { out += ch; escape = true; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (code === 0x0a) { out += "\\n"; continue; }
      if (code === 0x0d) { out += "\\r"; continue; }
      if (code === 0x09) { out += "\\t"; continue; }
      if (code < 0x20) { out += `\\u${code.toString(16).padStart(4, "0")}`; continue; }
      out += ch;
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return out;
}

/**
 * 字符串字面量内的未转义英文引号 → \"
 * 关键洞察：真正的字符串边界引号后面一定跟 JSON 结构字符（, ] } : 空白 / EOF）
 * 而内容里的引号后面大概率是中文字符 / 标点。
 */
function escapeUnescapedQuotes(s: string): string {
  let out = "";
  let inStr = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escape) { out += ch; escape = false; continue; }
      if (ch === "\\") { out += ch; escape = true; continue; }
      if (ch === '"') {
        // 判断这是边界还是嵌入引号
        const next = s[i + 1];
        const isBoundary = next === undefined || /[\s,\]\}:]/.test(next);
        if (isBoundary) {
          inStr = false;
          out += ch;
        } else {
          out += '\\"';
        }
      } else {
        out += ch;
      }
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return out;
}
