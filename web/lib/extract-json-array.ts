/**
 * 从 LLM 响应里提取 JSON 数组。
 * 处理：
 *   - <think>...</think> 块
 *   - ```json ... ``` 围栏
 *   - 字符串里未转义的控制字符（直接报 raw_decode 错）
 *   - 字符串里未转义的英文双引号（state machine 识别）
 *
 * 启发式：英文双引号若后面紧跟 JSON 结构字符（: , ] }）或空白+结构字符 → 边界
 *      否则 → 嵌入引号，escape 为 \"
 */

export function extractJsonArray(raw: string): any[] {
  let text = (raw || "").trim();

  // 1. 去 ``` 围栏
  if (text.startsWith("```")) {
    const lines = text.split("\n");
    if (lines[0].startsWith("```")) lines.shift();
    if (lines.length && lines[lines.length - 1].trim() === "```") lines.pop();
    text = lines.join("\n").trim();
  }

  // 2. 去 <think>...</think>（包含跨行）
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (text.includes("<think>")) {
    const idx = text.indexOf("[");
    if (idx >= 0) text = text.slice(idx);
  }

  // 3. 找第一个 [ 与最后一个 ]（用括号配对）
  const start = text.indexOf("[");
  if (start < 0) throw new Error("response does not contain a JSON array");
  const end = text.lastIndexOf("]");
  if (end < start) throw new Error("unbalanced brackets in response");
  let arrayText = text.slice(start, end + 1);

  // 4. 先尝试严格解析
  try {
    return JSON.parse(arrayText);
  } catch {
    // 5. 失败 → 启发式修复：一次扫描同时 escape 嵌入引号和控制字符
    arrayText = fixDirtyJson(arrayText);
    return JSON.parse(arrayText);
  }
}

const _WS = " \t\r\n";
const _DQ = '"';
const _BS = "\\";
const _STRUCTURAL = ":,]}";

/** 跳过空白后看下一个非空白字符；返回下标或 -1（EOF） */
function peekNonSpace(s: string, i: number): number {
  let k = i + 1;
  while (k < s.length && _WS.includes(s[k])) k++;
  return k < s.length ? k : -1;
}

function isClosingQuote(s: string, i: number): boolean {
  const k = peekNonSpace(s, i);
  return k === -1 || _STRUCTURAL.includes(s[k]);
}

/**
 * 一次扫描：识别字符串边界 / 嵌入引号 escape / 控制字符 escape
 * （与 Python 版本 server.py 的 extract_json_array 行为一致）
 */
function fixDirtyJson(text: string): string {
  let out = "";
  let inStr = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      out += ch;
      escape = false;
      continue;
    }
    if (ch === _BS) {
      out += ch;
      escape = true;
      continue;
    }
    if (ch === _DQ) {
      if (!inStr) {
        out += ch;
        inStr = true;
        continue;
      }
      // 在字符串内：判断是 boundary 还是嵌入引号
      if (isClosingQuote(text, i)) {
        out += ch;
        inStr = false;
      } else {
        out += _BS + _DQ;
      }
      continue;
    }
    if (inStr) {
      const code = ch.charCodeAt(0);
      if (ch === "\n") out += _BS + "n";
      else if (ch === "\r") out += _BS + "r";
      else if (ch === "\t") out += _BS + "t";
      else if (code < 0x20) out += _BS + "u" + code.toString(16).padStart(4, "0");
      else out += ch;
    } else {
      out += ch;
    }
  }
  return out;
}
