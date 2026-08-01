import { config } from "./config.js";

const DEFAULT_POINT = "本节综合题";

export async function generateMockExamAnalysis({ provider, chapters = [], results }) {
  const outlineContext = chapters.map((chapter) => ({
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    newOutlinePoints: chapter.outline?.new_outline_points || "",
    keyPoints: chapter.outline?.key_points || "",
    hardPoints: chapter.outline?.hard_points || "",
  }));
  const fallback = buildRuleAnalysis(results, outlineContext);
  const selectedProvider = provider || config.mockAnalysis.provider;
  const providerConfig = getProviderConfig(selectedProvider);
  if (!providerConfig?.apiKey) {
    return { ...fallback, provider: "rule", model: null, fallbackReason: "未配置成绩分析模型密钥" };
  }

  try {
    const ai = await requestAnalysis({ provider: selectedProvider, providerConfig, results, outlineContext });
    const pointStats = buildPointStats(results, ai.pointMapping, outlineContext);
    const weakPoints = pointStats
      .filter((item) => item.accuracy < 85 && item.wrong > 0)
      .sort((a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong || b.total - a.total)
      .slice(0, 3);
    return {
      ...fallback,
      provider: selectedProvider,
      model: providerConfig.model,
      basis: buildBasis(outlineContext),
      pointStats,
      weakPoints,
      aiSummary: ai.summary,
      aiSuggestions: ai.suggestions,
      nextPractice: ai.nextPractice,
      pointMapping: ai.pointMapping,
      fallbackReason: null,
    };
  } catch (error) {
    console.warn(`[mock-analysis] ${selectedProvider} unavailable: ${error.message}`);
    return {
      ...fallback,
      provider: "rule",
      model: null,
      basis: buildBasis(outlineContext),
      fallbackReason: "模型分析暂时不可用，已使用基础统计分析",
    };
  }
}

function getProviderConfig(provider) {
  if (provider === "deepseek") return config.mockAnalysis.deepseek;
  if (provider === "codex-luna") return config.mockAnalysis.codexLuna;
  return null;
}

function buildBasis(context) {
  return {
    newOutline: context.some((item) => Boolean(item.newOutlinePoints.trim())),
    keyPoints: context.some((item) => Boolean(item.keyPoints.trim())),
    hardPoints: context.some((item) => Boolean(item.hardPoints.trim())),
  };
}

function buildRuleAnalysis(results, outlineContext) {
  const total = results.length;
  const correct = results.filter((item) => item.isCorrect).length;
  const score = total ? Math.round((correct / total) * 100) : 0;
  const pointStats = buildPointStats(results, null, outlineContext);
  const typeStats = buildStats(results, (item) => [item.type || "其他题型"]);
  const weakPoints = pointStats
    .filter((item) => item.accuracy < 85 && item.wrong > 0)
    .sort((a, b) => a.accuracy - b.accuracy || b.wrong - a.wrong)
    .slice(0, 3);
  const suggestions = weakPoints.map((item) => `回看“${item.name}”相关教学重点和难点，并重做该考点错题。`);
  const weakTypes = typeStats
    .filter((item) => item.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy)
    .slice(0, 3);
  suggestions.push(...weakTypes.map((item) => `加强${item.name}专项练习，完成后再做一次本节模拟考试。`));
  if (!suggestions.length) suggestions.push("继续完成本节练习，保持对重点和难点的熟悉度。");

  let level = "需要继续巩固";
  let message = "建议回看本节教学页中的重点和难点，结合错题完成针对性练习。";
  if (score >= 85) {
    level = "掌握较好";
    message = "本节重点和难点整体掌握较好，建议保持练习并关注易错细节。";
  } else if (score >= 60) {
    level = "基础掌握";
    message = "本节基础已有掌握，建议根据薄弱考点复盘重点难点。";
  }
  return {
    basis: buildBasis(outlineContext),
    summary: { level, message, total, correct, wrong: total - correct, accuracy: score },
    pointStats,
    weakPoints,
    weakKnowledgeTags: weakPoints,
    typeStats,
    suggestions: suggestions.slice(0, 5),
    nextPractice: ["回看本节教学页重点与难点", "重做本次错题", "完成对应题型专项练习"],
    provider: "rule",
    model: null,
  };
}

function buildPointStats(results, pointMapping, outlineContext) {
  const allowedPoints = extractOutlinePoints(outlineContext);
  const mappingByQuestion = new Map((pointMapping || []).map((item) => [Number(item.questionId), item.points]));
  const stats = new Map();
  for (const result of results) {
    const mapped = mappingByQuestion.get(Number(result.questionId));
    const names = mapped?.length
      ? mapped.map((name) => resolveAllowedPoint(name, allowedPoints)).filter(Boolean)
      : [];
    const fallbackNames = names.length
      ? names
      : result.knowledgeTags?.length
        ? result.knowledgeTags.map((tag) => resolveAllowedPoint(tag, allowedPoints)).filter(Boolean)
        : [DEFAULT_POINT];
    for (const name of [...new Set(fallbackNames)]) {
      const item = stats.get(name) || { name, total: 0, correct: 0, wrong: 0, accuracy: 0, status: "" };
      item.total += 1;
      if (result.isCorrect) item.correct += 1;
      else item.wrong += 1;
      item.accuracy = Math.round((item.correct / item.total) * 100);
      item.status = item.accuracy >= 85 ? "掌握较好" : item.accuracy >= 60 ? "基础掌握" : "薄弱";
      stats.set(name, item);
    }
  }
  return [...stats.values()];
}

function extractOutlinePoints(context) {
  const points = [];
  for (const item of context) {
    for (const text of [item.newOutlinePoints, item.keyPoints, item.hardPoints]) {
      const parts = String(text || "")
        .replace(/\r/g, "")
        .split(/\n|；|;/)
        .map((part) => part.replace(/^\s*(?:[-*•]|\d+[.、)]|[一二三四五六七八九十]+[、.])\s*/, "").trim())
        .filter((part) => part.length >= 2 && part.length <= 120);
      points.push(...parts);
    }
  }
  return [...new Set(points)];
}

function resolveAllowedPoint(value, allowedPoints) {
  const name = String(value || "").trim();
  if (!name) return null;
  if (!allowedPoints.length) return name;
  return allowedPoints.find((point) => point === name) ||
    allowedPoints.find((point) => point.includes(name) || name.includes(point)) ||
    DEFAULT_POINT;
}

function buildStats(results, getNames) {
  const stats = new Map();
  for (const result of results) {
    for (const name of getNames(result)) {
      const item = stats.get(name) || { name, total: 0, correct: 0, wrong: 0, accuracy: 0 };
      item.total += 1;
      if (result.isCorrect) item.correct += 1;
      else item.wrong += 1;
      item.accuracy = Math.round((item.correct / item.total) * 100);
      stats.set(name, item);
    }
  }
  return [...stats.values()];
}

async function requestAnalysis({ provider, providerConfig, results, outlineContext }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), providerConfig.timeoutMs);
  const prompt = [
    "请分析专升本《计算机应用基础》学生的一次模拟考试。",
    "必须依据提供的章节新大纲考点、重点、难点进行归因，不得编造考点。",
    "只输出严格 JSON：summary 字符串，pointMapping 数组，weakPoints 字符串数组，suggestions 字符串数组，nextPractice 字符串数组。",
    "pointMapping 必须覆盖所有 questionId；每道题的 points 只能填写上下文中出现的考点名称，无法匹配时填写“本节综合题”。",
    `章节考点上下文：${JSON.stringify(outlineContext)}`,
    `逐题作答结果：${JSON.stringify(results.map((item) => ({ questionId: item.questionId, type: item.type, stem: item.stem, knowledgeTags: item.knowledgeTags, selectedAnswer: item.selectedAnswer, correctAnswer: item.correctAnswer, isCorrect: item.isCorrect })))}`,
    "weakPoints 最多 3 条，suggestions 最多 4 条，nextPractice 最多 3 条。建议必须明确指出回看考点、重做错题或加强题型练习。",
  ].join("\n");
  try {
    const response = await fetch(`${providerConfig.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${providerConfig.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: providerConfig.model,
        messages: [
          { role: "system", content: "你是教考智联的学习诊断助手，只输出合法 JSON。" },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 1600,
      }),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = JSON.parse(raw);
    const content = payload?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("模型未返回内容");
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || content);
    return {
      summary: String(parsed.summary || "").trim(),
      pointMapping: normalizePointMapping(parsed.pointMapping, results),
      suggestions: normalizeStringArray(parsed.suggestions, 4),
      nextPractice: normalizeStringArray(parsed.nextPractice, 3),
    };
  } finally {
    clearTimeout(timer);
  }
}

function normalizePointMapping(value, results) {
  const resultIds = new Set(results.map((item) => Number(item.questionId)));
  const mappings = Array.isArray(value) ? value : [];
  const normalized = new Map();
  for (const item of mappings) {
    const questionId = Number(item?.questionId);
    if (!resultIds.has(questionId)) continue;
    const points = Array.isArray(item?.points) ? item.points.map((point) => String(point).trim()).filter(Boolean) : [];
    normalized.set(questionId, [...new Set(points)]);
  }
  return results.map((item) => ({
    questionId: item.questionId,
    points: normalized.get(Number(item.questionId))?.length ? normalized.get(Number(item.questionId)) : [DEFAULT_POINT],
  }));
}

function normalizeStringArray(value, limit) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).slice(0, limit);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}
