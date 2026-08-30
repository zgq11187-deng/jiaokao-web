import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const rootDir = path.resolve(import.meta.dirname, "../../..");
const envPath = path.join(rootDir, ".env");
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
else dotenv.config();

export const config = {
  rootDir,
  port: Number(process.env.PORT || 37200),
  webOrigin: process.env.WEB_ORIGIN || "http://127.0.0.1:5174",
  dbPath: path.resolve(rootDir, process.env.APP_DB_PATH || "data/app.db"),
  uploadDir: path.resolve(rootDir, process.env.UPLOAD_DIR || "uploads"),
  notion: {
    token: process.env.NOTION_TOKEN || "",
    chapterDbId: process.env.CHAPTER_DATABASE_ID || "",
    originalPageDbId: process.env.ORIGINAL_PAGE_DB_ID || "",
    rawMaterialsDbId: process.env.RAW_MATERIALS_DATABASE_ID || "",
    examQuestionsDbId: process.env.EXAM_QUESTIONS_DATABASE_ID || "",
    outlineDbId: process.env.OUTLINE_DATABASE_ID || "",
  },
  qwen: {
    apiKey: process.env.QWEN_API_KEY || "",
    baseUrl:
      process.env.QWEN_BASE_URL ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
    visionModel: process.env.QWEN_VISION_MODEL || "qwen3-vl-flash",
    textModel:
      process.env.QWEN_TEXT_MODEL ||
      process.env.QWEN_VISION_MODEL ||
      "qwen3-vl-flash",
  },
  mockAnalysis: {
    provider: process.env.MOCK_ANALYSIS_PROVIDER || "codex-luna",
    codexLuna: {
      apiKey: process.env.CODEX_LUNA_API_KEY || "",
      baseUrl: process.env.CODEX_LUNA_BASE_URL || "https://api.openai.com/v1",
      model: process.env.CODEX_LUNA_MODEL || "gpt-5.6-luna",
      timeoutMs: Number(process.env.CODEX_LUNA_TIMEOUT_MS || 12000),
    },
    deepseek: {
      apiKey: process.env.DEEPSEEK_ANALYSIS_API_KEY || "",
      baseUrl: process.env.DEEPSEEK_ANALYSIS_BASE_URL || "https://api.deepseek.com",
      model: process.env.DEEPSEEK_ANALYSIS_MODEL || "deepseek-chat",
      timeoutMs: Number(process.env.DEEPSEEK_ANALYSIS_TIMEOUT_MS || 12000),
    },
  },
  codex: {
    bin: resolveCodexBin(),
    model: process.env.CODEX_MODEL || "",
    timeoutMs: Number(process.env.CODEX_TIMEOUT_MS || 600000),
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-v4-pro",
    teachingModel: process.env.DEEPSEEK_TEACHING_MODEL || "deepseek-chat",
    timeoutMs: Number(process.env.DEEPSEEK_TIMEOUT_MS || 600000),
    maxTokens: Number(process.env.DEEPSEEK_MAX_TOKENS || 4000),
    teachingMaxTokens: Number(process.env.DEEPSEEK_TEACHING_MAX_TOKENS || 12000),
  },
};

function resolveCodexBin() {
  const configured = String(process.env.CODEX_BIN || "").trim();
  if (configured) return configured;

  const pathBin = String(process.env.PATH || "")
    .split(path.delimiter)
    .map((directory) => directory.trim())
    .filter(Boolean)
    .map((directory) => path.join(directory, "codex"))
    .find(isExecutableFile);
  if (pathBin) return pathBin;

  const appBins = [
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    "/Applications/Codex.app/Contents/Resources/codex",
  ];
  return appBins.find(isExecutableFile) || "codex";
}

function isExecutableFile(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function ensureRuntimeDirs() {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  fs.mkdirSync(config.uploadDir, { recursive: true });
}
