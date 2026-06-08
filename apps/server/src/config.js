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
  codex: {
    bin:
      process.env.CODEX_BIN ||
      "/Applications/Codex.app/Contents/Resources/codex",
    model: process.env.CODEX_MODEL || "",
    timeoutMs: Number(process.env.CODEX_TIMEOUT_MS || 600000),
  },
};

export function ensureRuntimeDirs() {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  fs.mkdirSync(config.uploadDir, { recursive: true });
}
