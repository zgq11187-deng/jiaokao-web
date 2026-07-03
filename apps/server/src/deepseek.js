import fs from "node:fs";
import { config } from "./config.js";

const RETRY_COUNT = 2;

export async function runDeepSeekJson({ prompt, schemaPath, step, maxTokens }) {
  if (!config.deepseek.apiKey) {
    throw new Error("DeepSeek API key 未配置：请在 .env 中设置 DEEPSEEK_API_KEY");
  }
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  let lastError;
  for (let attempt = 1; attempt <= RETRY_COUNT; attempt += 1) {
    try {
      return await requestDeepSeekJson({
        prompt,
        schema,
        step,
        maxTokens,
        retryReason: lastError?.message || "",
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`DeepSeek ${step} 输出校验失败：${lastError.message}`);
}

async function requestDeepSeekJson({ prompt, schema, step, maxTokens, retryReason }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.deepseek.timeoutMs);
  try {
    const response = await fetch(`${trimSlash(config.deepseek.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.deepseek.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.deepseek.model,
        messages: [
          {
            role: "system",
            content:
              "你是教考智联的教学内容结构化助手。只输出一个严格 JSON 对象，不输出 Markdown、解释或代码块。",
          },
          {
            role: "user",
            content: buildStrictJsonPrompt({ prompt, schema, step, retryReason }),
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: maxTokens || config.deepseek.maxTokens,
      }),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`DeepSeek API ${response.status}: ${redactSecret(raw).slice(0, 1000)}`);
    }
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error("DeepSeek API 响应不是 JSON");
    }
    const content = payload.choices?.[0]?.message?.content?.trim() || "";
    if (!content) throw new Error("DeepSeek 返回内容为空");
    const parsed = parseJsonContent(content);
    validateAgainstSchema(parsed, schema);
    return parsed;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`DeepSeek ${step} 超时`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildStrictJsonPrompt({ prompt, schema, step, retryReason }) {
  const template = buildTemplateFromSchema(schema);
  const requiredFields = (schema.required || []).join("、");
  return [
    prompt,
    "",
    "你必须严格返回符合下面 JSON Schema 的 JSON 对象：",
    JSON.stringify(schema, null, 2),
    "",
    "固定输出模板如下，字段名必须逐字使用英文 camelCase，不得改成中文字段名：",
    JSON.stringify(template, null, 2),
    "",
    "字段名硬性要求：",
    requiredFields ? `- 必须包含这些顶层字段：${requiredFields}。` : "",
    "- 字段名必须逐字使用 schema 中的英文 camelCase，不得改成中文字段名。",
    "- 不得添加 schema 之外的字段。",
    schema.properties?.changeType?.enum
      ? `- changeType 只能是：${schema.properties.changeType.enum.join("、")}。`
      : "",
    "- warnings 必须是字符串数组，没有问题时返回 []。",
    ...deepSeekStepRules(step),
    retryReason ? `\n上一次输出校验失败：${retryReason}。请按固定模板重新输出。` : "",
    "",
    "只输出 JSON 对象，不输出 Markdown、解释、代码块或额外文本。",
  ].filter(Boolean).join("\n");
}

function buildTemplateFromSchema(schema) {
  if (schema.type === "object") {
    const result = {};
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      result[key] = buildTemplateFromSchema(childSchema);
    }
    return result;
  }
  if (schema.type === "array") {
    return schema.items?.type === "object" ? [buildTemplateFromSchema(schema.items)] : [];
  }
  if (schema.enum?.length) return schema.enum.at(-1);
  if (schema.type === "string") return "";
  return null;
}

function parseJsonContent(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerError) {
        throw new Error(jsonParseMessage(innerError));
      }
    }
    throw new Error(jsonParseMessage(error));
  }
}

function deepSeekStepRules(step) {
  if (step === "deepseek-generate-teaching-page") {
    return [
      "",
      "DeepSeek C 教学页生成专用规则：",
      "- 必须返回合法 JSON 对象，顶层字段只能是 markdown、sourceSections、addedSections、warnings、summary。",
      "- markdown 必须是 JSON 字符串；内部换行必须正确转义，不能破坏 JSON.parse。",
      "- 不得用 ```json 或其他代码块包裹整个 JSON。",
      "- 不得在 JSON 外输出任何说明文字。",
      "- 为保证 JSON 合法，教学页控制在 12-18 页，优先保证主线完整和格式正确。",
      "- Markdown 内容可以包含 Notion 语法、表格、Mermaid、callout、details，但必须全部放在 markdown 字符串中。",
      "- 所有历年真题展示区必须按题型固定顺序排列：单选题、多选题、判断题、简答题、操作题。",
      "- 只有存在题目的题型才展示题型标题，不得为了凑齐题型而编造题目。",
      "- 题型标题使用加粗文本，例如 **单选题**，不要使用四级或更深 Markdown 标题。",
      "- 每个题型内部的题目编号必须单独从 1. 开始，例如 1. 题干、2. 题干。",
      "- 题干、选项、答案和解析必须完整保留，不得为满足排序或编号而删减内容。",
      "- 返回前自行检查：markdown 中的英文双引号、反斜杠、Mermaid 代码块和换行都不会破坏 JSON 字符串。",
    ];
  }
  if (step !== "deepseek-import-exam-questions") return [];
  return [
    "",
    "DeepSeek B 真题入库专用规则：",
    "- 必须按 5 步选题法筛选题目：锚定考纲关键词、排除相邻章节、判定边界题、按题型归类、形成入库摘要。",
    "- 第 1 步：从当前章节标题、新大纲考点、重点、难点中提取命中词；强命中词可优先入选，弱命中词必须继续做边界判定。",
    "- 第 2 步：先做排除。计算机发展史、第一台计算机、应用领域归计算机概述；进制转换、ASCII、位/字节换算归数据表示；Windows、Office、网络、安全类题归对应后续章节。判断主考点，不看顺带出现的词。",
    "- 第 3 步：边界题宁缺毋滥。只考存储单位换算的题不选；考 ROM/RAM 断电特性、存储器分类、CPU/总线/系统软件/多媒体核心概念的题可选；只考计算机语言通用性的不默认归软件分类。",
    "- 第 4 步：questions 输出顺序必须按题型排列：单选题、多选题、判断题、简答题、操作题；同题型内优先覆盖高频考点和不同问法。",
    "- 第 5 步：summary 必须用一句话说明选题依据，例如命中的高频考点、排除的相邻章节题、最终入库建议；不要输出完整推理过程。",
    "- questions 最多返回 8 题；如果可选题超过 8 题，只选最相关的 8 题。",
    "- 不要为了凑题型而编造题；没有操作题就不要输出操作题。",
    "- questions 数组中每个题目对象之间必须使用英文逗号分隔。",
    "- 每个字段都必须是单行字符串；字符串内部禁止出现真实换行。",
    "- options 必须使用单行格式，例如：A. 选项一 | B. 选项二 | C. 选项三 | D. 选项四。",
    "- analysis 控制在 120 个中文字符以内。",
    "- 不得输出 Markdown 表格、代码块、项目符号列表或编号列表。",
    '- 如果无法保证合法 JSON，返回 {"questions":[],"warnings":["无法生成合法 JSON"],"summary":"未入库"}。',
    "- 返回前自行检查：questions 数组逗号正确、字符串引号已转义、没有未转义换行。",
  ];
}

function jsonParseMessage(error) {
  return `JSON 语法错误：${error.message}。请只返回可被 JSON.parse 解析的对象，尤其检查 questions 数组逗号、markdown 字符串、字符串引号、反斜杠和换行转义`;
}

function validateAgainstSchema(value, schema, path = "$") {
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${path} 必须是对象`);
    }
    for (const key of schema.required || []) {
      if (!(key in value)) {
        throw new Error(`${path}.${key} 缺失，实际字段：${topLevelKeys(value)}`);
      }
    }
    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          throw new Error(`${path}.${key} 不允许出现，实际字段：${topLevelKeys(value)}`);
        }
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (key in value) validateAgainstSchema(value[key], childSchema, `${path}.${key}`);
    }
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value)) throw new Error(`${path} 必须是数组`);
    for (let index = 0; index < value.length; index += 1) {
      validateAgainstSchema(value[index], schema.items || {}, `${path}[${index}]`);
    }
    return;
  }
  if (schema.type === "string") {
    if (typeof value !== "string") throw new Error(`${path} 必须是字符串`);
    if (schema.enum && !schema.enum.includes(value)) {
      throw new Error(`${path} 必须是：${schema.enum.join("、")}`);
    }
  }
}

function trimSlash(value) {
  return value.replace(/\/+$/, "");
}

function topLevelKeys(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "无";
  const keys = Object.keys(value);
  return keys.length ? keys.join("、") : "无";
}

function redactSecret(text) {
  if (!config.deepseek.apiKey) return text;
  return text.replaceAll(config.deepseek.apiKey, "[REDACTED]");
}
