import { DatabaseSync } from "node:sqlite";
import { config, ensureRuntimeDirs } from "./config.js";

ensureRuntimeDirs();

export const db = new DatabaseSync(config.dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  chapter_no TEXT,
  section_no TEXT,
  notion_page_id TEXT UNIQUE,
  notion_url TEXT,
  status TEXT DEFAULT '待生成',
  student_visible INTEGER NOT NULL DEFAULT 0 CHECK(student_visible IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  markdown TEXT NOT NULL,
  source_name TEXT,
  source_type TEXT,
  notion_page_id TEXT,
  notion_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS outline_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  new_outline_points TEXT,
  old_outline_points TEXT,
  change_type TEXT,
  change_description TEXT,
  key_points TEXT,
  hard_points TEXT,
  warnings_json TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exam_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  stem TEXT NOT NULL,
  type TEXT NOT NULL,
  options TEXT,
  answer TEXT,
  analysis TEXT,
  difficulty TEXT,
  source TEXT,
  year TEXT,
  knowledge_tags_json TEXT DEFAULT '[]',
  notion_page_id TEXT,
  notion_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chapter_id, stem, source)
);

CREATE TABLE IF NOT EXISTS teaching_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  markdown TEXT NOT NULL,
  source_sections_json TEXT DEFAULT '[]',
  added_sections_json TEXT DEFAULT '[]',
  warnings_json TEXT DEFAULT '[]',
  summary TEXT,
  notion_page_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS question_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('practice', 'mock')),
  selected_answer TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK(is_correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('teacher', 'student')),
  authorization_status TEXT NOT NULL DEFAULT 'approved'
    CHECK(authorization_status IN ('pending', 'approved', 'rejected')),
  class_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS student_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  class_note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending', 'approved', 'rejected')),
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

migrateExamQuestionUniqueConstraint();
migrateChapterStudentVisible();

function migrateChapterStudentVisible() {
  const columns = db.prepare(`PRAGMA table_info(chapters)`).all();
  if (columns.some((column) => column.name === "student_visible")) return;
  db.exec(`ALTER TABLE chapters ADD COLUMN student_visible INTEGER NOT NULL DEFAULT 0`);
}

function migrateExamQuestionUniqueConstraint() {
  const table = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'exam_questions'`,
  ).get();
  if (!table?.sql?.includes("UNIQUE(chapter_id, source)")) return;
  db.exec(`
    PRAGMA foreign_keys = OFF;
    CREATE TABLE IF NOT EXISTS exam_questions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      stem TEXT NOT NULL,
      type TEXT NOT NULL,
      options TEXT,
      answer TEXT,
      analysis TEXT,
      difficulty TEXT,
      source TEXT,
      year TEXT,
      knowledge_tags_json TEXT DEFAULT '[]',
      notion_page_id TEXT,
      notion_url TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(chapter_id, stem, source)
    );
    INSERT OR IGNORE INTO exam_questions_new
      (id, chapter_id, stem, type, options, answer, analysis, difficulty, source, year, knowledge_tags_json, notion_page_id, notion_url, created_at)
    SELECT id, chapter_id, stem, type, options, answer, analysis, difficulty, source, year, knowledge_tags_json, notion_page_id, notion_url, created_at
    FROM exam_questions;
    DROP TABLE exam_questions;
    ALTER TABLE exam_questions_new RENAME TO exam_questions;
    PRAGMA foreign_keys = ON;
  `);
}

export function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}

export function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

export function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

export function logStep(chapterId, step, status, message, payload = null) {
  run(
    `INSERT INTO generation_logs (chapter_id, step, status, message, payload_json)
     VALUES (?, ?, ?, ?, ?)`,
    [
      chapterId || null,
      step,
      status,
      message || "",
      payload ? JSON.stringify(payload) : null,
    ],
  );
}
