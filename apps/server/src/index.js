import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import mammoth from "mammoth";
import { config, ensureRuntimeDirs } from "./config.js";
import { all, get, logStep, run } from "./db.js";
import { generateRawMarkdownWithQwen } from "./qwen.js";
import { runCodexJson } from "./codex.js";
import {
  addPageComment,
  appendMarkdownToPage,
  createChapter,
  createExamQuestion,
  createOriginalPage,
  createRawMaterialRecord,
  findOriginalPageByTitleAndChapter,
  getTitle,
  linkExamQuestionToChapter,
  notion,
  propValue,
  queryCheckboxTriggerPages,
  queryChapterPages,
  queryExamQuestionCandidates,
  readPageMarkdown,
  replacePageMarkdown,
  requireNotion,
  setChapterStatus,
  updatePageCheckbox,
  updateChapterOutline,
} from "./notion.js";
import {
  fillOutlinePrompt,
  importExamPrompt,
  teachingPagePrompt,
} from "./prompts.js";
import {
  buildHtmlDownload,
  buildMarkdownDownload,
  buildPptx,
  buildQuestionBankHtml,
} from "./exports.js";
import {
  attachCurrentUser,
  clearSession,
  createSession,
  hashPassword,
  publicUser,
  requireAuthorized,
  requireTeacher,
  teacherCount,
  verifyPassword,
} from "./auth.js";

ensureRuntimeDirs();
const app = express();
const sharedDir = path.resolve(config.rootDir, "packages/shared/schemas");
const RAW_PAGE_PLACEHOLDER = "未提取到文本内容，请检查 PDF 是否为扫描件";
const EXAM_CANDIDATE_SCOPE_LIMIT = 100;
const TEACHING_PAGE_QUESTION_LIMIT = 30;
const MIXED_WRITTEN_QUESTION_TYPE = "简答/操作题";

app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(attachCurrentUser);
app.use(express.static(path.join(import.meta.dirname, "../public")));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "jiaokao-web-server" });
});

app.get("/api/auth/me", (req, res) => {
  res.json({
    ok: true,
    user: publicUser(req.user),
    needsTeacherSetup: teacherCount() === 0,
  });
});

app.post("/api/auth/bootstrap-teacher", (req, res) => {
  try {
    if (teacherCount() > 0) {
      return res.status(409).json({ error: "老师账号已存在" });
    }
    const { name, phone, password } = req.body || {};
    validateNamePhonePassword({ name, phone, password });
    const result = run(
      `INSERT INTO users (name, phone, password_hash, role, authorization_status)
       VALUES (?, ?, ?, 'teacher', 'approved')`,
      [name.trim(), normalizePhone(phone), hashPassword(password)],
    );
    createSession(res, result.lastInsertRowid);
    const user = get(`SELECT * FROM users WHERE id = ?`, [result.lastInsertRowid]);
    res.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/auth/register", (req, res) => {
  try {
    const { name, phone, password, classNote } = req.body || {};
    validateNamePhonePassword({ name, phone, password });
    if (!String(classNote || "").trim()) {
      return res.status(400).json({ error: "请填写班级/身份说明" });
    }
    const normalizedPhone = normalizePhone(phone);
    const existing = get(`SELECT * FROM users WHERE phone = ?`, [normalizedPhone]);
    if (existing) return res.status(409).json({ error: "该手机号已注册" });
    const result = run(
      `INSERT INTO users (name, phone, password_hash, role, authorization_status, class_note)
       VALUES (?, ?, ?, 'student', 'pending', ?)`,
      [name.trim(), normalizedPhone, hashPassword(password), classNote.trim()],
    );
    run(
      `INSERT INTO student_applications (user_id, name, phone, class_note)
       VALUES (?, ?, ?, ?)`,
      [result.lastInsertRowid, name.trim(), normalizedPhone, classNote.trim()],
    );
    createSession(res, result.lastInsertRowid);
    const user = get(`SELECT * FROM users WHERE id = ?`, [result.lastInsertRowid]);
    res.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || "");
    const user = get(`SELECT * FROM users WHERE phone = ?`, [phone]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "手机号或密码不正确，请重新输入" });
    }
    createSession(res, user.id);
    res.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/auth/logout", (req, res) => {
  clearSession(req, res);
  res.json({ ok: true });
});

app.get("/api/teacher/applications", requireTeacher, (_req, res) => {
  const applications = all(
    `SELECT student_applications.*, users.authorization_status
     FROM student_applications
     JOIN users ON users.id = student_applications.user_id
     ORDER BY student_applications.created_at DESC, student_applications.id DESC`,
  );
  res.json({ ok: true, applications });
});

app.post("/api/teacher/applications/:id/approve", requireTeacher, (req, res) => {
  reviewApplication(req, res, "approved");
});

app.post("/api/teacher/applications/:id/reject", requireTeacher, (req, res) => {
  reviewApplication(req, res, "rejected");
});

app.post("/api/teacher/students", requireTeacher, (req, res) => {
  try {
    const { name, phone, password, classNote } = req.body || {};
    validateNamePhonePassword({ name, phone, password });
    const normalizedPhone = normalizePhone(phone);
    if (get(`SELECT id FROM users WHERE phone = ?`, [normalizedPhone])) {
      return res.status(409).json({ error: "该手机号已存在" });
    }
    const result = run(
      `INSERT INTO users (name, phone, password_hash, role, authorization_status, class_note)
       VALUES (?, ?, ?, 'student', 'approved', ?)`,
      [name.trim(), normalizedPhone, hashPassword(password), classNote || ""],
    );
    const user = get(`SELECT * FROM users WHERE id = ?`, [result.lastInsertRowid]);
    res.json({ ok: true, user: publicUser(user) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/teacher/students", requireTeacher, (_req, res) => {
  const students = all(
    `SELECT id, name, phone, role, authorization_status, class_note, created_at, updated_at
     FROM users
     WHERE role = 'student'
     ORDER BY updated_at DESC, created_at DESC, id DESC`,
  );
  res.json({ ok: true, students });
});

app.post("/api/teacher/students/:id/authorize", requireTeacher, (req, res) => {
  updateStudentAuthorization(req, res, "approved");
});

app.post("/api/teacher/students/:id/revoke", requireTeacher, (req, res) => {
  updateStudentAuthorization(req, res, "rejected");
});

app.delete("/api/teacher/students/:id", requireTeacher, (req, res) => {
  try {
    const student = mustStudentUser(req.params.id);
    run(`DELETE FROM sessions WHERE user_id = ?`, [student.id]);
    run(`DELETE FROM users WHERE id = ?`, [student.id]);
    res.json({ ok: true, deletedId: student.id });
  } catch (error) {
    res.status(/不存在/.test(error.message) ? 404 : 400).json({ error: error.message });
  }
});

app.post("/api/teacher/sync-chapters-from-notion", requireTeacher, async (_req, res) => {
  try {
    const syncResult = await syncChaptersFromNotion();
    const chapters = listChaptersForUser({ role: "teacher" });
    res.json({ ok: true, chapters, syncResult });
  } catch (error) {
    res.status(500).json({ error: `Notion 章节库同步失败：${error.message}` });
  }
});

app.post("/api/teacher/chapters/:id/show-to-students", requireTeacher, (req, res) => {
  updateChapterStudentVisibility(req, res, 1);
});

app.post("/api/teacher/chapters/:id/hide-from-students", requireTeacher, (req, res) => {
  updateChapterStudentVisibility(req, res, 0);
});

app.get("/api/chapters", requireAuthorized, async (req, res) => {
  const chapters = listChaptersForUser(req.user);
  res.json({ ok: true, chapters, syncWarning: "" });
});

app.post("/api/chapters", requireTeacher, async (req, res) => {
  try {
    const { title, chapterNo, sectionNo } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: "章节标题不能为空" });
    let notionPage = null;
    if (notion && config.notion.chapterDbId) {
      notionPage = await createChapter({ title, chapterNo, sectionNo });
    }
    const result = run(
      `INSERT INTO chapters (title, chapter_no, section_no, notion_page_id, notion_url)
       VALUES (?, ?, ?, ?, ?)`,
      [
        title.trim(),
        chapterNo || "",
        sectionNo || "",
        notionPage?.id || null,
        notionPage?.url || null,
      ],
    );
    const chapter = get(`SELECT * FROM chapters WHERE id = ?`, [
      result.lastInsertRowid,
    ]);
    res.json({ ok: true, chapter });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/chapters/:id", requireAuthorized, (req, res) => {
  const chapter = get(`SELECT * FROM chapters WHERE id = ?`, [req.params.id]);
  if (!chapter) return res.status(404).json({ error: "章节不存在" });
  if (!canAccessChapter(req.user, chapter)) {
    return res.status(403).json({ error: "该章节暂未对学生开放" });
  }
  res.json({
    ok: true,
    chapter,
    rawPages: all(`SELECT * FROM raw_pages WHERE chapter_id = ? ORDER BY id DESC`, [chapter.id]),
    outlines: all(`SELECT * FROM outline_analyses WHERE chapter_id = ? ORDER BY id DESC`, [chapter.id]),
    questions: all(`SELECT * FROM exam_questions WHERE chapter_id = ? ORDER BY id DESC`, [chapter.id]),
    teachingPages: all(`SELECT * FROM teaching_pages WHERE chapter_id = ? ORDER BY id DESC`, [chapter.id]),
    logs: all(`SELECT * FROM generation_logs WHERE chapter_id = ? ORDER BY id DESC LIMIT 50`, [chapter.id]),
  });
});

app.get("/api/student/summary", requireAuthorized, (req, res) => {
  const visibleOnly = req.user.role === "teacher" ? "" : " AND chapters.student_visible = 1";
  const totalAttempts = get(
    `SELECT COUNT(*) AS count
     FROM question_attempts
     JOIN chapters ON chapters.id = question_attempts.chapter_id
     WHERE question_attempts.user_id = ?${visibleOnly}`,
    [req.user.id],
  )?.count || 0;
  const wrongAttempts = get(
    `SELECT COUNT(*) AS count
     FROM question_attempts
     JOIN chapters ON chapters.id = question_attempts.chapter_id
     WHERE question_attempts.user_id = ? AND is_correct = 0${visibleOnly}`,
    [req.user.id],
  )?.count || 0;
  const practicedChapters = get(
    `SELECT COUNT(DISTINCT question_attempts.chapter_id) AS count
     FROM question_attempts
     JOIN chapters ON chapters.id = question_attempts.chapter_id
     WHERE question_attempts.user_id = ?${visibleOnly}`,
    [req.user.id],
  )?.count || 0;
  const latestAttempts = all(
    `SELECT question_attempts.*, exam_questions.stem, exam_questions.type, chapters.title AS chapter_title
     FROM question_attempts
     JOIN exam_questions ON exam_questions.id = question_attempts.question_id
     JOIN chapters ON chapters.id = question_attempts.chapter_id
     WHERE question_attempts.user_id = ?${visibleOnly}
     ORDER BY question_attempts.created_at DESC, question_attempts.id DESC
     LIMIT 8`,
    [req.user.id],
  );
  res.json({
    ok: true,
    summary: {
      totalAttempts,
      wrongAttempts,
      practicedChapters,
      accuracy: totalAttempts ? Math.round(((totalAttempts - wrongAttempts) / totalAttempts) * 100) : 0,
    },
    latestAttempts,
  });
});

app.post("/api/questions/:id/attempt", requireAuthorized, (req, res) => {
  try {
    const question = mustQuestion(req.params.id);
    ensureCanAccessChapter(req.user, question.chapter_id);
    const selectedAnswer = String(req.body?.selectedAnswer || "").trim();
    if (!selectedAnswer) return res.status(400).json({ error: "请先选择或填写答案" });
    const mode = req.body?.mode === "mock" ? "mock" : "practice";
    const isCorrect = isAnswerCorrect(selectedAnswer, question.answer);
    const saved = saveQuestionAttempt({
      userId: req.user.id,
      question,
      mode,
      selectedAnswer,
      isCorrect,
    });
    res.json({
      ok: true,
      attempt: saved,
      result: {
        isCorrect,
        correctAnswer: question.answer || "未填写",
        analysis: question.analysis || "暂无解析",
      },
    });
  } catch (error) {
    res.status(/不存在/.test(error.message) ? 404 : 500).json({ error: error.message });
  }
});

app.get("/api/student/wrong-questions", requireAuthorized, (req, res) => {
  const chapterId = Number(req.query.chapterId || 0);
  if (chapterId && !canAccessChapter(req.user, mustChapter(chapterId))) {
    return res.status(403).json({ error: "该章节暂未对学生开放" });
  }
  const params = [req.user.id];
  const chapterFilter = chapterId ? "AND question_attempts.chapter_id = ?" : "";
  if (chapterId) params.push(chapterId);
  const wrongQuestions = all(
    `SELECT
       exam_questions.*,
       chapters.title AS chapter_title,
       question_attempts.selected_answer AS last_selected_answer,
       question_attempts.created_at AS last_wrong_at,
       latest.wrong_count AS wrong_count
     FROM (
       SELECT question_id, MAX(id) AS latest_attempt_id, COUNT(*) AS wrong_count
       FROM question_attempts
       WHERE user_id = ? AND is_correct = 0 ${chapterFilter}
       GROUP BY question_id
     ) latest
     JOIN question_attempts ON question_attempts.id = latest.latest_attempt_id
     JOIN exam_questions ON exam_questions.id = latest.question_id
     JOIN chapters ON chapters.id = exam_questions.chapter_id
     WHERE (? = 'teacher' OR chapters.student_visible = 1)
     ORDER BY latest.latest_attempt_id DESC
     LIMIT 80`,
    [...params, req.user.role],
  );
  res.json({ ok: true, wrongQuestions });
});

app.get("/api/mock-exam/questions", requireAuthorized, (req, res) => {
  const limit = clampInt(req.query.limit, 6, 30, 12);
  const chapterId = Number(req.query.chapterId || 0);
  if (chapterId && !canAccessChapter(req.user, mustChapter(chapterId))) {
    return res.status(403).json({ error: "该章节暂未对学生开放" });
  }
  const params = [];
  const filters = [];
  if (chapterId) filters.push("exam_questions.chapter_id = ?");
  if (req.user.role !== "teacher") filters.push("chapters.student_visible = 1");
  const chapterFilter = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  if (chapterId) params.push(chapterId);
  params.push(limit);
  const questions = all(
    `SELECT exam_questions.*, chapters.title AS chapter_title
     FROM exam_questions
     JOIN chapters ON chapters.id = exam_questions.chapter_id
     ${chapterFilter}
     ORDER BY
       CASE exam_questions.type
         WHEN '单选题' THEN 1
         WHEN '多选题' THEN 2
         WHEN '判断题' THEN 3
         WHEN '简答题' THEN 4
         WHEN '操作题' THEN 5
         ELSE 9
       END,
       exam_questions.year DESC,
       exam_questions.id DESC
     LIMIT ?`,
    params,
  );
  res.json({ ok: true, questions });
});

app.post("/api/mock-exam/submit", requireAuthorized, (req, res) => {
  try {
    const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    if (!answers.length) return res.status(400).json({ error: "请至少提交 1 道题" });
    const results = answers.map((answer) => {
      const question = mustQuestion(answer.questionId);
      ensureCanAccessChapter(req.user, question.chapter_id);
      const selectedAnswer = String(answer.selectedAnswer || "").trim();
      const isCorrect = selectedAnswer ? isAnswerCorrect(selectedAnswer, question.answer) : false;
      const attempt = saveQuestionAttempt({
        userId: req.user.id,
        question,
        mode: "mock",
        selectedAnswer: selectedAnswer || "未作答",
        isCorrect,
      });
      return {
        attemptId: attempt.id,
        questionId: question.id,
        chapterId: question.chapter_id,
        stem: question.stem,
        type: question.type,
        selectedAnswer: selectedAnswer || "未作答",
        correctAnswer: question.answer || "未填写",
        analysis: question.analysis || "暂无解析",
        isCorrect,
      };
    });
    const correct = results.filter((item) => item.isCorrect).length;
    const weakChapterCounts = new Map();
    for (const item of results.filter((result) => !result.isCorrect)) {
      weakChapterCounts.set(item.chapterId, (weakChapterCounts.get(item.chapterId) || 0) + 1);
    }
    const weakChapters = [...weakChapterCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([chapterId, wrongCount]) => ({
        chapterId,
        title: get(`SELECT title FROM chapters WHERE id = ?`, [chapterId])?.title || "未知章节",
        wrongCount,
      }));
    res.json({
      ok: true,
      result: {
        total: results.length,
        correct,
        wrong: results.length - correct,
        score: Math.round((correct / results.length) * 100),
        weakChapters,
        questions: results,
      },
    });
  } catch (error) {
    res.status(/不存在/.test(error.message) ? 404 : 500).json({ error: error.message });
  }
});

app.post("/raw-materials/create-lecture-page", requireTeacher, createLecturePage);
app.post("/api/raw-materials/create-lecture-page", requireTeacher, createLecturePage);

app.post(
  "/api/chapters/:id/raw-pages/from-file",
  requireTeacher,
  rawMultipart(),
  async (req, res) => {
    try {
      const chapter = mustChapter(req.params.id);
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ error: "请上传文件" });
      const title = normalizeRawPageTitle(req.body.title || chapter.title, chapter.title);
      const legacyTitle = legacyRawPageTitle(chapter.title);
      logStep(chapter.id, "qwen-raw-page", "running", "Qwen 生成原始页面");
      const qwen = await generateRawMarkdownWithQwen({
        filePaths: files.map((file) => file.path),
        prompt: req.body.prompt,
        title,
      });
      let notionPage = null;
      let createdMarkdown = qwen.markdown;
      let migratedLegacyMarkdown = "";
      let migratedLegacySourceName = "";
      let targetRawPage = get(
        `SELECT * FROM raw_pages
         WHERE chapter_id = ? AND title = ? AND notion_page_id IS NOT NULL
         ORDER BY id DESC LIMIT 1`,
        [chapter.id, title],
      );
      let legacyRawPage = null;
      if (legacyTitle !== title) {
        legacyRawPage = get(
          `SELECT * FROM raw_pages
           WHERE chapter_id = ? AND title = ? AND notion_page_id IS NOT NULL
           ORDER BY id DESC LIMIT 1`,
          [chapter.id, legacyTitle],
        );
      }
      const placeholder = get(
        `SELECT * FROM raw_pages
         WHERE chapter_id = ? AND source_type = 'notion-placeholder' AND notion_page_id IS NOT NULL
         ORDER BY id DESC LIMIT 1`,
        [chapter.id],
      );
      if (chapter.notion_page_id && notion) {
        if (!targetRawPage) {
          const existingNotionPage = await findOriginalPageByTitleAndChapter({
            title,
            chapterPageId: chapter.notion_page_id,
          });
          if (existingNotionPage) {
            targetRawPage = get(
              `SELECT * FROM raw_pages
               WHERE chapter_id = ? AND notion_page_id = ?
               ORDER BY id DESC LIMIT 1`,
              [chapter.id, existingNotionPage.id],
            ) || {
              title,
              markdown: "",
              source_name: "",
              source_type: "",
              notion_page_id: existingNotionPage.id,
              notion_url: existingNotionPage.url || null,
            };
          }
        }
        if (!legacyRawPage && legacyTitle !== title) {
          const existingLegacyNotionPage = await findOriginalPageByTitleAndChapter({
            title: legacyTitle,
            chapterPageId: chapter.notion_page_id,
          });
          if (existingLegacyNotionPage) {
            legacyRawPage = get(
              `SELECT * FROM raw_pages
               WHERE chapter_id = ? AND notion_page_id = ?
               ORDER BY id DESC LIMIT 1`,
              [chapter.id, existingLegacyNotionPage.id],
            ) || {
              title: legacyTitle,
              markdown: "",
              source_name: "历史后缀原始页面",
              source_type: "",
              notion_page_id: existingLegacyNotionPage.id,
              notion_url: existingLegacyNotionPage.url || null,
            };
          }
        }
        if (!targetRawPage && placeholder?.notion_page_id) {
          targetRawPage = placeholder;
        }
        if (targetRawPage?.notion_page_id) {
          if (shouldMigrateLegacyRawPage(targetRawPage, legacyRawPage)) {
            migratedLegacyMarkdown = await loadLegacyRawPageMarkdown(legacyRawPage);
            if (migratedLegacyMarkdown.trim()) {
              migratedLegacySourceName = legacyRawPage.source_name || "历史后缀原始页面";
              await appendMarkdownToPage(
                targetRawPage.notion_page_id,
                buildRawPageAppendMarkdown(migratedLegacyMarkdown, migratedLegacySourceName),
              );
            }
          }
          await appendMarkdownToPage(
            targetRawPage.notion_page_id,
            buildRawPageAppendMarkdown(qwen.markdown, qwen.sourceName),
          );
          notionPage = {
            id: targetRawPage.notion_page_id,
            url: targetRawPage.notion_url || null,
          };
        } else {
          if (legacyRawPage?.notion_page_id) {
            migratedLegacyMarkdown = await loadLegacyRawPageMarkdown(legacyRawPage);
            migratedLegacySourceName = legacyRawPage.source_name || "历史后缀原始页面";
          }
          if (migratedLegacyMarkdown.trim()) {
            createdMarkdown = mergeRawPageMarkdown(
              migratedLegacyMarkdown,
              qwen.markdown,
              qwen.sourceName,
            );
          }
          notionPage = await createOriginalPage({
            title,
            markdown: createdMarkdown,
            chapterPageId: chapter.notion_page_id,
          });
        }
      }
      if (targetRawPage?.id) {
        const baseMarkdown = migratedLegacyMarkdown.trim()
          ? mergeRawPageMarkdown(
            targetRawPage.markdown,
            migratedLegacyMarkdown,
            migratedLegacySourceName,
          )
          : targetRawPage.markdown;
        const mergedMarkdown = mergeRawPageMarkdown(
          baseMarkdown,
          qwen.markdown,
          qwen.sourceName,
        );
        run(
          `UPDATE raw_pages
           SET title = ?, markdown = ?, source_name = ?, source_type = ?, notion_page_id = ?, notion_url = ?
           WHERE id = ?`,
          [
            title,
            mergedMarkdown,
            mergeSourceName(
              mergeSourceName(targetRawPage.source_name, migratedLegacySourceName),
              qwen.sourceName,
            ),
            qwen.model,
            notionPage?.id || targetRawPage.notion_page_id,
            notionPage?.url || targetRawPage.notion_url,
            targetRawPage.id,
          ],
        );
        logStep(chapter.id, "qwen-raw-page", "success", "原始页面已追加到同名 Notion 页面", {
          ...qwen,
          targetRawPageId: targetRawPage.id,
          targetNotionPageId: notionPage?.id || targetRawPage.notion_page_id,
        });
        return res.json({
          ok: true,
          rawPage: get(`SELECT * FROM raw_pages WHERE id = ?`, [targetRawPage.id]),
        });
      }
      if (targetRawPage?.notion_page_id && !targetRawPage.id) {
        const mergedMarkdown = migratedLegacyMarkdown.trim()
          ? mergeRawPageMarkdown(migratedLegacyMarkdown, qwen.markdown, qwen.sourceName)
          : qwen.markdown;
        const savedExisting = run(
          `INSERT INTO raw_pages
           (chapter_id, title, markdown, source_name, source_type, notion_page_id, notion_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            chapter.id,
            title,
            mergedMarkdown,
            mergeSourceName(migratedLegacySourceName, qwen.sourceName),
            qwen.model,
            targetRawPage.notion_page_id,
            targetRawPage.notion_url,
          ],
        );
        logStep(chapter.id, "qwen-raw-page", "success", "原始页面已追加到 Notion 同名页面并同步本地记录", {
          ...qwen,
          targetNotionPageId: targetRawPage.notion_page_id,
        });
        return res.json({
          ok: true,
          rawPage: get(`SELECT * FROM raw_pages WHERE id = ?`, [
            savedExisting.lastInsertRowid,
          ]),
        });
      }
      const saved = run(
        `INSERT INTO raw_pages
         (chapter_id, title, markdown, source_name, source_type, notion_page_id, notion_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          chapter.id,
          title,
          createdMarkdown,
          mergeSourceName(migratedLegacySourceName, qwen.sourceName),
          qwen.model,
          notionPage?.id || null,
          notionPage?.url || null,
        ],
      );
      logStep(chapter.id, "qwen-raw-page", "success", "原始页面已生成", qwen);
      res.json({
        ok: true,
        rawPage: get(`SELECT * FROM raw_pages WHERE id = ?`, [
          saved.lastInsertRowid,
        ]),
      });
    } catch (error) {
      logStep(Number(req.params.id), "qwen-raw-page", "error", error.message);
      res.status(500).json({ error: error.message });
    }
  },
);

async function createLecturePage(req, res) {
  let chapterId = null;
  try {
    const { chapterId: bodyChapterId, pageTitle, chapterUrl } = req.body || {};
    const chapter = findLectureChapter({ chapterId: bodyChapterId, chapterUrl });
    chapterId = chapter.id;
    if (!chapter.notion_page_id) {
      logStep(
        chapter.id,
        "create-lecture-page",
        "error",
        "当前章节还没有 Notion 页面 ID，请先创建或同步章节 Notion 页面",
      );
      return res.status(400).json({
        error: "当前章节还没有 Notion 页面 ID，请先创建或同步章节 Notion 页面",
      });
    }
    if (!notion) throw new Error("NOTION_TOKEN 未配置");
    if (!config.notion.originalPageDbId) {
      throw new Error("ORIGINAL_PAGE_DB_ID 未配置");
    }
    if (!config.notion.rawMaterialsDbId) {
      throw new Error("RAW_MATERIALS_DATABASE_ID 未配置");
    }

    const title = String(pageTitle || chapter.title || "").trim();
    if (!title) {
      logStep(chapter.id, "create-lecture-page", "error", "讲义页面标题不能为空");
      return res.status(400).json({ error: "讲义页面标题不能为空" });
    }

    logStep(chapter.id, "create-lecture-page", "running", "创建 Notion 讲义原始页");
    const originalPage = await createOriginalPage({
      title,
      markdown: RAW_PAGE_PLACEHOLDER,
      chapterPageId: chapter.notion_page_id,
    });
    const rawMaterial = await createRawMaterialRecord({
      title,
      originalPageId: originalPage.id,
      chapterPageId: chapter.notion_page_id,
    });
    const saved = run(
      `INSERT INTO raw_pages
       (chapter_id, title, markdown, source_name, source_type, notion_page_id, notion_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        chapter.id,
        title,
        RAW_PAGE_PLACEHOLDER,
        "Notion 原始页面库占位讲义页",
        "notion-placeholder",
        originalPage.id,
        originalPage.url || null,
      ],
    );
    logStep(chapter.id, "create-lecture-page", "success", "Notion 讲义原始页已创建", {
      originalPageId: originalPage.id,
      originalPageUrl: originalPage.url || null,
      rawMaterialId: rawMaterial.id,
      rawMaterialUrl: rawMaterial.url || null,
    });
    res.json({
      ok: true,
      rawPage: get(`SELECT * FROM raw_pages WHERE id = ?`, [saved.lastInsertRowid]),
      notion: {
        originalPageId: originalPage.id,
        originalPageUrl: originalPage.url || null,
        rawMaterialId: rawMaterial.id,
        rawMaterialUrl: rawMaterial.url || null,
      },
    });
  } catch (error) {
    logStep(chapterId, "create-lecture-page", "error", error.message);
    const status = /章节不存在|找不到/.test(error.message) ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
}

function findLectureChapter({ chapterId, chapterUrl }) {
  if (chapterId) return mustChapter(chapterId);
  const notionPageId = normalizeNotionPageId(chapterUrl);
  if (!notionPageId) throw new Error("请选择章节，或传入章节 Notion 页面 ID");
  const chapter = get(
    `SELECT * FROM chapters WHERE notion_page_id = ? OR replace(notion_page_id, '-', '') = ?`,
    [notionPageId, notionPageId.replace(/-/g, "")],
  );
  if (!chapter) throw new Error("找不到对应的本地章节，请先同步章节");
  return chapter;
}

function normalizeNotionPageId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const idFromUrl = raw.match(/[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0];
  return (idFromUrl || raw).trim();
}

function rawMultipart() {
  return async (req, res, next) => {
    if (!req.headers["content-type"]?.includes("multipart/form-data")) {
      return res.status(400).json({ error: "请使用 multipart/form-data 上传文件" });
    }
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      const boundary = /boundary=([^;]+)/.exec(req.headers["content-type"])?.[1];
      if (!boundary) throw new Error("缺少 multipart boundary");
      const parsed = parseMultipart(buffer, boundary);
      req.body = parsed.fields;
      req.files = parsed.files;
      next();
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };
}

function parseMultipart(buffer, boundary) {
  const delimiter = `--${boundary}`;
  const body = buffer.toString("binary");
  const parts = body.split(delimiter).slice(1, -1);
  const fields = {};
  const files = [];
  for (const part of parts) {
    const trimmed = part.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const splitAt = trimmed.indexOf("\r\n\r\n");
    if (splitAt === -1) continue;
    const rawHeaders = trimmed.slice(0, splitAt);
    const rawContent = trimmed.slice(splitAt + 4);
    const name = /name="([^"]+)"/.exec(rawHeaders)?.[1];
    const filename = /filename="([^"]*)"/.exec(rawHeaders)?.[1];
    if (!name) continue;
    if (filename) {
      const safeName = path.basename(filename).replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
      const filePath = path.join(
        config.uploadDir,
        `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeName}`,
      );
      fs.writeFileSync(filePath, Buffer.from(rawContent, "binary"));
      files.push({ fieldname: name, originalname: filename, path: filePath });
    } else {
      fields[name] = Buffer.from(rawContent, "binary").toString("utf8");
    }
  }
  return { fields, files };
}

app.post("/api/chapters/:id/fill-outline", requireTeacher, async (req, res) => {
  try {
    const chapter = mustChapter(req.params.id);
    const result = await runFillOutlineAgent(chapter);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chapters/:id/import-exam-questions", requireTeacher, async (req, res) => {
  try {
    const chapter = mustChapter(req.params.id);
    const result = await runImportExamAgent(chapter);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chapters/:id/import-teaching-questions", requireTeacher, async (req, res) => {
  try {
    const chapter = mustChapter(req.params.id);
    const result = await importTeachingQuestions(chapter);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chapters/:id/generate-teaching-page", requireTeacher, async (req, res) => {
  try {
    const chapter = mustChapter(req.params.id);
    const result = await runGenerateTeachingAgent(chapter);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/chapters/:id/generate-all", requireTeacher, async (req, res) => {
  try {
    const chapter = mustChapter(req.params.id);
    const outline = await runFillOutlineAgent(chapter);
    const questions = await runImportExamAgent(chapter);
    const teaching = await runGenerateTeachingAgent(chapter);
    res.json({ ok: true, outline, questions, teaching });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/notion-agent/scan-triggers", requireTeacher, async (_req, res) => {
  try {
    const result = await scanNotionAgentTriggers();
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function runFillOutlineAgent(chapter, options = {}) {
  const warnings = [];
  try {
    assertChapterNotionPage(chapter);
    logStep(chapter.id, "fill-outline", "running", "Codex 分析新旧大纲");
    const context = await buildOutlineContext(chapter);
    if (!context.outlinePages.length) {
      throw new Error("当前章节未关联大纲，无法执行自动填充考点");
    }
    const result = await runCodexJson({
      step: "fill-outline",
      schemaPath: path.join(sharedDir, "fill-outline.schema.json"),
      prompt: fillOutlinePrompt(context),
    });
    await safeNotionStep(
      warnings,
      "写入章节考点字段",
      () => updateChapterOutline(chapter.notion_page_id, result),
    );
    if (options.clearTrigger) {
      await safeNotionStep(warnings, "清勾自动填充考点", () =>
        updatePageCheckbox(chapter.notion_page_id, ["自动填充考点"], false),
      );
    }
    run(
      `INSERT INTO outline_analyses
       (chapter_id, new_outline_points, old_outline_points, change_type, change_description, key_points, hard_points, warnings_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chapter.id,
        result.newOutlinePoints,
        result.oldOutlinePoints,
        result.changeType,
        result.changeDescription,
        result.keyPoints,
        result.hardPoints,
        JSON.stringify([...(result.warnings || []), ...warnings]),
      ],
    );
    const finalResult = { ...result, warnings: [...(result.warnings || []), ...warnings] };
    logStep(chapter.id, "fill-outline", "success", "考点已生成", finalResult);
    await safeComment(warnings, chapter.id, "fill-outline", "评论 A 结果", () =>
      addPageComment(
        options.commentPageId || chapter.notion_page_id,
        [
          "A 自动填充考点完成。",
          `新大纲考点：${countNonEmptyLines(result.newOutlinePoints)} 条。`,
          `旧大纲考点：${countNonEmptyLines(result.oldOutlinePoints)} 条。`,
          `变化标记：${result.changeType}。`,
          warnings.length ? `Warnings：${warnings.join("；")}` : "",
        ].filter(Boolean).join("\n"),
      ),
    );
    return finalResult;
  } catch (error) {
    logStep(chapter?.id, "fill-outline", "error", error.message);
    await commentFailure(options.commentPageId || chapter?.notion_page_id, "A 自动填充考点失败", error);
    throw error;
  }
}

async function runImportExamAgent(chapter, options = {}) {
  const warnings = [];
  try {
    assertChapterNotionPage(chapter);
    logStep(chapter.id, "import-exam-questions", "running", "Codex 筛选真题");
    const context = await buildExamContext(chapter);
    warnings.push(...(context.warnings || []));
    if (!hasExamScope(context)) {
      throw new Error("当前章节重点、难点、新大纲考点均为空，请先执行 A 自动填充考点");
    }
    if (!hasExamSources(context)) {
      throw new Error(
        "未找到可用真题来源：历年真题库候选题为空，且当前章节没有关联类型为真题卷/试题/题库的原始资料",
      );
    }
    const result = await runCodexJson({
      step: "import-exam-questions",
      schemaPath: path.join(sharedDir, "import-exam-questions.schema.json"),
      prompt: importExamPrompt(context),
    });
    let imported = 0;
    let skipped = 0;
    const notionWarnings = [];
    for (const question of result.questions || []) {
      const existingCandidate = findExamCandidate(context.examQuestionCandidates, question);
      const exists = get(
        `SELECT id FROM exam_questions
         WHERE chapter_id = ? AND (stem = ? OR (source IS NOT NULL AND source = ?))`,
        [chapter.id, question.stem, question.source],
      );
      if (exists) {
        if (existingCandidate?.pageId && chapter.notion_page_id && notion) {
          await safeNotionStep(notionWarnings, "关联已存在真题", () =>
            linkExamQuestionToChapter(existingCandidate.pageId, chapter.notion_page_id),
          );
        }
        skipped++;
        continue;
      }
      let notionPage = null;
      if (existingCandidate?.pageId && chapter.notion_page_id && notion) {
        await safeNotionStep(notionWarnings, "关联 Notion 候选真题", async () => {
          await linkExamQuestionToChapter(existingCandidate.pageId, chapter.notion_page_id);
          notionPage = { id: existingCandidate.pageId, url: existingCandidate.url || null };
        });
        if (!notionPage) {
          notionPage = { id: existingCandidate.pageId, url: existingCandidate.url || null };
        }
      } else if (chapter.notion_page_id && notion) {
        await safeNotionStep(notionWarnings, "新建 Notion 真题", async () => {
          notionPage = await createExamQuestion(chapter.notion_page_id, question);
        });
      }
      run(
        `INSERT INTO exam_questions
         (chapter_id, stem, type, options, answer, analysis, difficulty, source, year, knowledge_tags_json, notion_page_id, notion_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          chapter.id,
          question.stem,
          question.type,
          question.options,
          question.answer,
          question.analysis,
          question.difficulty,
          question.source,
          question.year,
          JSON.stringify(question.knowledgeTags || []),
          notionPage?.id || null,
          notionPage?.url || null,
        ],
      );
      imported++;
    }
    if (options.clearTriggerPageId) {
      await safeNotionStep(warnings, "清勾原始资料入库", () =>
        updatePageCheckbox(options.clearTriggerPageId, ["入库"], false),
      );
    }
    const finalWarnings = [...(result.warnings || []), ...notionWarnings, ...warnings];
    logStep(chapter.id, "import-exam-questions", "success", imported || skipped ? "真题入库完成" : "未命中可入库真题", {
      imported,
      skipped,
      examCandidateStats: context.examCandidateStats,
      warnings: finalWarnings,
      summary: result.summary || "",
    });
    await safeComment(warnings, chapter.id, "import-exam-questions", "评论 B 结果", () =>
      addPageComment(
        options.commentPageId || options.clearTriggerPageId || chapter.notion_page_id,
        [
          "B 真题自动入库完成。",
          `命中新增：${imported} 题；跳过重复：${skipped} 题。`,
          result.summary || "",
          finalWarnings.length ? `Warnings：${finalWarnings.join("；")}` : "",
        ].filter(Boolean).join("\n"),
      ),
    );
    return {
      imported,
      skipped,
      result: { ...result, warnings: finalWarnings },
    };
  } catch (error) {
    logStep(chapter?.id, "import-exam-questions", "error", error.message);
    await commentFailure(
      options.commentPageId || options.clearTriggerPageId || chapter?.notion_page_id,
      "B 真题自动入库失败",
      error,
    );
    throw error;
  }
}

async function importTeachingQuestions(chapter) {
  const warnings = [];
  try {
    logStep(chapter.id, "import-teaching-questions", "running", "导入教学页自编题");
    const { markdown, source } = await loadTeachingQuestionSource(chapter);
    if (!markdown.trim()) {
      throw new Error("未找到可读取的教学页正文，无法导入自编题");
    }
    const parsed = parseTeachingQuestions(markdown, chapter, warnings);
    if (!parsed.questions.length) {
      throw new Error("未在教学页中解析到自编题，请检查是否包含“本节巩固练习 / 自编题 / 非历年真题 / 随堂练习”区块");
    }
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    for (const question of parsed.questions.slice(0, TEACHING_PAGE_QUESTION_LIMIT)) {
      const existing = findExistingTeachingQuestion(chapter.id, question);
      if (existing) {
        const patch = buildQuestionPatch(existing, question);
        if (patch.fields.length) {
          run(
            `UPDATE exam_questions SET ${patch.fields.join(", ")} WHERE id = ?`,
            [...patch.values, existing.id],
          );
          updated++;
        } else {
          skipped++;
        }
        continue;
      }
      run(
        `INSERT INTO exam_questions
         (chapter_id, stem, type, options, answer, analysis, difficulty, source, year, knowledge_tags_json, notion_page_id, notion_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          chapter.id,
          question.stem,
          question.type,
          question.options,
          question.answer,
          question.analysis,
          question.difficulty,
          question.source,
          question.year,
          JSON.stringify(question.knowledgeTags || []),
          null,
          null,
        ],
      );
      imported++;
    }
    if (parsed.expectedCount && parsed.questions.length < parsed.expectedCount) {
      warnings.push(`页面说明共有 ${parsed.expectedCount} 道题，但本次只解析到 ${parsed.questions.length} 道，请人工检查格式`);
    }
    if (parsed.questions.length > TEACHING_PAGE_QUESTION_LIMIT) {
      warnings.push(`解析到 ${parsed.questions.length} 道题，本次最多导入 ${TEACHING_PAGE_QUESTION_LIMIT} 道`);
    }
    const result = {
      source,
      expectedCount: parsed.expectedCount || null,
      parsed: parsed.questions.length,
      imported,
      updated,
      skipped,
      warnings,
    };
    logStep(chapter.id, "import-teaching-questions", "success", "教学页自编题导入完成", result);
    return result;
  } catch (error) {
    logStep(chapter?.id, "import-teaching-questions", "error", error.message);
    throw error;
  }
}

async function loadTeachingQuestionSource(chapter) {
  const latest = get(
    `SELECT * FROM teaching_pages WHERE chapter_id = ? ORDER BY id DESC LIMIT 1`,
    [chapter.id],
  );
  const localMarkdown = latest?.markdown || "";
  let notionMarkdown = "";
  if (chapter.notion_page_id && notion) {
    notionMarkdown = await readPageMarkdown(chapter.notion_page_id).catch(() => "");
  }
  const localScore = teachingQuestionSourceScore(localMarkdown);
  const notionScore = teachingQuestionSourceScore(notionMarkdown);
  if (notionScore > localScore) return { markdown: notionMarkdown, source: "notion-page" };
  if (localScore > 0 || localMarkdown.trim()) return { markdown: localMarkdown, source: "local-teaching-page" };
  return { markdown: notionMarkdown, source: notionMarkdown ? "notion-page" : "none" };
}

function teachingQuestionSourceScore(markdown) {
  const text = String(markdown || "");
  const markers = ["本节巩固练习", "按本节内容自编", "非历年真题", "自编题", "随堂练习"];
  const markerScore = markers.reduce((score, marker) => score + (text.includes(marker) ? 8 : 0), 0);
  const questionScore = (text.match(/<details\b|答案与解析|参考答案|^[\s\t]*\d+[.、]\s+/gm) || []).length;
  return markerScore + questionScore;
}

function parseTeachingQuestions(markdown, chapter, warnings = []) {
  const normalized = normalizeTeachingQuestionMarkdown(markdown);
  const scoped = scopeTeachingQuestionMarkdown(normalized);
  const expectedCount = parseExpectedQuestionCount(scoped) || parseExpectedQuestionCount(normalized);
  const lines = scoped.split(/\r?\n/);
  const questions = [];
  let currentType = "";
  let current = null;

  function finishCurrent() {
    if (!current) return;
    const built = buildTeachingQuestion(current, chapter);
    if (built?.stem) questions.push(built);
    current = null;
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    const typeFromHeading = detectQuestionTypeHeading(line);
    if (typeFromHeading) {
      finishCurrent();
      currentType = typeFromHeading;
      continue;
    }
    if (/^<details>\s*$/i.test(line)) {
      const parsed = collectDetailsText(lines, index);
      if (current) current.details = parsed.text;
      index = parsed.endIndex;
      finishCurrent();
      continue;
    }
    if (/^(?:参考答案|答案与解析|答案)[：:]?\s*/.test(line) && current) {
      const parsed = collectLooseAnswerText(lines, index);
      current.details = parsed.text;
      index = parsed.endIndex;
      finishCurrent();
      continue;
    }
    const questionStart = parseNumberedQuestionStart(line);
    if (questionStart && currentType) {
      finishCurrent();
      const stem = questionStart[2].trim();
      current = {
        type: inferQuestionTypeFromStem(stem, currentType),
        stemLines: [stem],
        options: [],
        details: "",
      };
      continue;
    }
    if (!current) continue;
    const option = /^([A-H])[.．、]\s*(.+)$/.exec(line);
    if (option && /单选|多选/.test(current.type)) {
      current.options.push(`${option[1].toUpperCase()}. ${option[2].trim()}`);
      continue;
    }
    current.stemLines.push(line);
  }
  finishCurrent();

  const deduped = [];
  const seen = new Set();
  for (const question of questions) {
    const key = normalizeText(question.stem);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(question);
  }
  if (!deduped.length && scoped.trim()) {
    warnings.push("已找到自编题区块，但未能解析题干；请检查题目是否按“1. 题干 + A/B/C/D + details 答案解析”书写");
  }
  return { questions: deduped, expectedCount };
}

function normalizeTeachingQuestionMarkdown(markdown) {
  return String(markdown || "")
    .replace(/\\</g, "<")
    .replace(/\\>/g, ">")
    .replace(/\\\|/g, "|")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?callout\b[^>]*>/gi, "\n")
    .replace(/<\/?columns>/gi, "\n")
    .replace(/<\/?column>/gi, "\n")
    .replace(/\t/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .join("\n");
}

function scopeTeachingQuestionMarkdown(markdown) {
  const markers = ["本节巩固练习", "按本节内容自编", "非历年真题", "自编题"];
  const starts = markers
    .map((marker) => markdown.indexOf(marker))
    .filter((index) => index >= 0);
  if (starts.length) return markdown.slice(Math.min(...starts));
  const fallback = markdown.lastIndexOf("随堂练习");
  return fallback >= 0 ? markdown.slice(fallback) : markdown;
}

function parseExpectedQuestionCount(markdown) {
  const match = /共\s*(\d+)\s*道题/.exec(markdown);
  return match ? Number(match[1]) : null;
}

function detectQuestionTypeHeading(line) {
  if (parseNumberedQuestionStart(line) || /^[A-H][.．、]\s*/i.test(line)) return "";
  const normalized = line
    .replace(/^#+\s*/, "")
    .replace(/[*_`]/g, "")
    .replace(/[：:]/g, "")
    .trim();
  const headingLike =
    /^#{1,6}\s*/.test(line) ||
    /^[一二三四五六七八九十]+[、.．]\s*/.test(normalized) ||
    /^(单选题?|多选题?|判断题?|简答题?|操作题?)$/.test(normalized) ||
    /简答\s*[/／]\s*操作题?/.test(normalized);
  if (!headingLike) return "";
  if (/简答/.test(normalized) && /操作/.test(normalized)) return MIXED_WRITTEN_QUESTION_TYPE;
  if (/单选题|单选/.test(normalized)) return "单选题";
  if (/多选题|多选/.test(normalized)) return "多选题";
  if (/判断题|判断/.test(normalized)) return "判断题";
  if (/操作题|操作/.test(normalized)) return "操作题";
  if (/简答题|简答/.test(normalized)) return "简答题";
  return "";
}

function inferQuestionTypeFromStem(stem, currentType) {
  if (/^操作题[：:]/.test(stem)) return "操作题";
  if (/^简答题[：:]/.test(stem) || /^(简述|说明|写出)/.test(stem)) return "简答题";
  if (currentType === MIXED_WRITTEN_QUESTION_TYPE) return "简答题";
  return currentType || "简答题";
}

function parseNumberedQuestionStart(line) {
  const cleaned = String(line || "")
    .trim()
    .replace(/^[-*]\s*/, "")
    .replace(/^[^\d]+(?=\d+[.、])/u, "");
  return /^(\d+)[.、]\s*(.+)$/.exec(cleaned);
}

function collectDetailsText(lines, startIndex) {
  const body = [];
  let endIndex = startIndex;
  for (let index = startIndex + 1; index < lines.length; index++) {
    const line = lines[index].trim();
    if (/^<\/details>\s*$/i.test(line)) {
      endIndex = index;
      break;
    }
    if (/^<summary>.*<\/summary>$/i.test(line)) {
      continue;
    }
    body.push(line);
    endIndex = index;
  }
  return { text: body.join("\n").trim(), endIndex };
}

function collectLooseAnswerText(lines, startIndex) {
  const body = [lines[startIndex].trim()];
  let endIndex = startIndex;
  for (let index = startIndex + 1; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) {
      endIndex = index;
      continue;
    }
    if (detectQuestionTypeHeading(line) || parseNumberedQuestionStart(line) || /^<details>\s*$/i.test(line)) {
      endIndex = index - 1;
      break;
    }
    body.push(line);
    endIndex = index;
  }
  return { text: body.join("\n").trim(), endIndex };
}

function buildTeachingQuestion(raw, chapter) {
  const detail = parseAnswerAndAnalysis(raw.details || "");
  const split = splitInlineChoiceOptions(raw.stemLines.join("\n"));
  const stem = split.stem
    .replace(/^操作题[：:]\s*/, "")
    .replace(/^简答题[：:]\s*/, "")
    .trim();
  if (!stem) return null;
  const options = raw.options.length ? raw.options : split.options;
  const type = inferFinalTeachingQuestionType({
    stem: split.stem.trim(),
    currentType: raw.type,
    options,
    answer: detail.answer,
  });
  return {
    stem,
    type,
    options: /单选|多选/.test(type) ? options.join("\n") : "",
    answer: detail.answer,
    analysis: detail.analysis,
    difficulty: "中",
    source: `Notion AI 自编题：${chapter.title}`,
    year: "自编",
    knowledgeTags: deriveTeachingQuestionTags(stem, chapter),
  };
}

function splitInlineChoiceOptions(text) {
  const source = String(text || "").trim();
  const matches = [...source.matchAll(/(?:^|\s)([A-H])[.．、]\s*/g)];
  if (matches.length < 2) return { stem: source, options: [] };
  const firstOptionIndex = matches[0].index + matches[0][0].search(/[A-H]/);
  const stem = source.slice(0, firstOptionIndex).trim();
  const options = matches
    .map((match, index) => {
      const labelIndex = match.index + match[0].search(/[A-H]/);
      const contentStart = match.index + match[0].length;
      const next = matches[index + 1];
      const contentEnd = next ? next.index : source.length;
      return `${source[labelIndex].toUpperCase()}. ${source.slice(contentStart, contentEnd).trim()}`;
    })
    .filter((option) => /[A-H]\.\s*\S/.test(option));
  return { stem: stem || source, options };
}

function inferFinalTeachingQuestionType({ stem, currentType, options, answer }) {
  const normalizedAnswer = String(answer || "").replace(/[^A-Ha-h]/g, "").toUpperCase();
  if (options.length >= 2) {
    if (currentType === "多选题" || normalizedAnswer.length > 1) return "多选题";
    return "单选题";
  }
  if (/^操作题[：:]/.test(stem)) return "操作题";
  if (/^简答题[：:]/.test(stem) || /^(简述|说明|写出)/.test(stem)) return "简答题";
  if (currentType === MIXED_WRITTEN_QUESTION_TYPE) return "简答题";
  return currentType || "简答题";
}

function parseAnswerAndAnalysis(details) {
  const text = String(details || "").trim();
  const answerMatch = /(?:参考答案|答案)[：:]\s*([\s\S]*?)(?=\n\s*(?:解析|考点归属)[：:]|$)/.exec(text);
  const analysisMatch = /解析[：:]\s*([\s\S]*?)(?=\n\s*考点归属[：:]|$)/.exec(text);
  const answer = (answerMatch?.[1] || "").trim();
  const analysis = (analysisMatch?.[1] || text.replace(answerMatch?.[0] || "", "").trim()).trim();
  return {
    answer: answer || "未填写",
    analysis: analysis || text || "未填写",
  };
}

function deriveTeachingQuestionTags(stem, chapter) {
  const text = `${chapter.title || ""} ${stem || ""}`;
  const candidates = [
    "图片",
    "文字环绕",
    "形状",
    "艺术字",
    "文本框",
    "公式",
    "SmartArt",
    "图表",
    "对象组合",
    "叠放次序",
    "Word 2016",
  ];
  return candidates.filter((tag) => text.includes(tag)).slice(0, 4);
}

function findExistingTeachingQuestion(chapterId, question) {
  const exact = get(
    `SELECT * FROM exam_questions WHERE chapter_id = ? AND stem = ?`,
    [chapterId, question.stem],
  );
  if (exact) return exact;
  const targetKey = normalizeQuestionDedupKey(question.stem);
  const candidates = all(`SELECT * FROM exam_questions WHERE chapter_id = ?`, [chapterId])
    .filter((candidate) => isTeachingAiQuestion(candidate.source));
  return candidates.find((candidate) => normalizeQuestionDedupKey(candidate.stem) === targetKey) || null;
}

function normalizeQuestionDedupKey(stem) {
  const split = splitInlineChoiceOptions(stem);
  return normalizeText(split.stem || stem);
}

function buildQuestionPatch(existing, question) {
  const fields = [];
  const values = [];
  const canCorrect = isTeachingAiQuestion(existing.source);
  const updates = [
    ["stem", question.stem],
    ["type", question.type],
    ["options", question.options],
    ["answer", question.answer],
    ["analysis", question.analysis],
    ["difficulty", question.difficulty],
    ["source", question.source],
    ["year", question.year],
    ["knowledge_tags_json", JSON.stringify(question.knowledgeTags || [])],
  ];
  for (const [field, value] of updates) {
    const next = String(value || "").trim();
    if (!next) continue;
    const current = String(existing[field] || "").trim();
    const nextIsMeaningful = !isMissingQuestionValue(next);
    const shouldUpdate =
      (isMissingQuestionValue(existing[field]) && nextIsMeaningful) ||
      (canCorrect && nextIsMeaningful && isCorrectableTeachingQuestionField(field) && current !== next);
    if (shouldUpdate) {
      fields.push(`${field} = ?`);
      values.push(value);
    }
  }
  return { fields, values };
}

function isTeachingAiQuestion(source) {
  return String(source || "").startsWith("Notion AI 自编题");
}

function isCorrectableTeachingQuestionField(field) {
  return ["stem", "type", "options", "answer", "analysis", "difficulty", "source", "year", "knowledge_tags_json"].includes(field);
}

function isMissingQuestionValue(value) {
  const text = String(value || "").trim();
  return !text || text === "未填写" || text === "暂无" || text === "暂无解析" || text === "[]";
}

async function runGenerateTeachingAgent(chapter, options = {}) {
  const warnings = [];
  try {
    assertChapterNotionPage(chapter);
    logStep(chapter.id, "generate-teaching-page", "running", "Codex 生成教学页");
    const context = await buildTeachingContext(chapter);
    if (!context.outlineIds.length) {
      throw new Error("当前章节未关联大纲，无法生成教学页");
    }
    if (!context.originalMaterials.length) {
      throw new Error("当前章节没有关联类型为原始课件的资料，无法生成教学页");
    }
    if (!context.skeletonSource?.markdown?.trim()) {
      throw new Error("原始课件缺少可读取的讲义页面或文件，无法生成教学页骨架");
    }
    const result = await runCodexJson({
      step: "generate-teaching-page",
      schemaPath: path.join(sharedDir, "teaching-page.schema.json"),
      prompt: teachingPagePrompt(context),
    });
    if (!result.markdown?.trim()) throw new Error("Codex 未返回教学页 Markdown");
    const shapeWarnings = validateTeachingMarkdownShape(result.markdown);
    let blockCount = 0;
    if (chapter.notion_page_id && notion) {
      await safeNotionStep(warnings, "追加教学页正文", async () => {
        blockCount = await appendMarkdownToPage(chapter.notion_page_id, result.markdown);
      });
      await safeNotionStep(warnings, "更新章节状态", () =>
        setChapterStatus(chapter.notion_page_id, "已生成草稿"),
      );
    }
    run(`UPDATE chapters SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
      "已生成草稿",
      chapter.id,
    ]);
    if (options.clearGenerateFlag) {
      await safeNotionStep(warnings, "清勾生成课件", () =>
        updatePageCheckbox(chapter.notion_page_id, ["生成课件"], false),
      );
    }
    const finalResult = {
      ...result,
      warnings: [...(result.warnings || []), ...shapeWarnings, ...warnings],
    };
    const saved = run(
      `INSERT INTO teaching_pages
       (chapter_id, markdown, source_sections_json, added_sections_json, warnings_json, summary, notion_page_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        chapter.id,
        result.markdown,
        JSON.stringify(result.sourceSections || []),
        JSON.stringify(result.addedSections || []),
        JSON.stringify(finalResult.warnings),
        result.summary,
        chapter.notion_page_id || null,
      ],
    );
    logStep(chapter.id, "generate-teaching-page", "success", "教学页已生成", {
      blockCount,
      summary: result.summary,
      warnings: finalResult.warnings,
      shapeWarnings,
      shapeCheck: {
        passed: shapeWarnings.length === 0,
        required: [
          "分页",
          "本节学习目标",
          "知识结构",
          "重点难点",
          "答案与解析",
          "课后作业",
          "教师备课卡",
        ],
      },
    });
    await safeComment(warnings, chapter.id, "generate-teaching-page", "评论 C 结果", () =>
      addPageComment(
        options.commentPageId || chapter.notion_page_id,
        [
          "C 生成教学页完成，状态为已生成草稿，请人工检查后再发布或导出。",
          `原文小节：${(result.sourceSections || []).join("、") || "未返回"}`,
          `新增小节：${(result.addedSections || []).join("、") || "未返回"}`,
          finalResult.warnings.length ? `Warnings：${finalResult.warnings.join("；")}` : "",
        ].filter(Boolean).join("\n"),
      ),
    );
    return {
      teachingPage: get(`SELECT * FROM teaching_pages WHERE id = ?`, [
        saved.lastInsertRowid,
      ]),
      blockCount,
      result: finalResult,
    };
  } catch (error) {
    logStep(chapter?.id, "generate-teaching-page", "error", error.message);
    await commentFailure(options.commentPageId || chapter?.notion_page_id, "C 生成教学页失败", error);
    throw error;
  }
}

function validateTeachingMarkdownShape(markdown) {
  const text = String(markdown || "");
  const warnings = [];
  const checks = [
    { label: "缺少 `---` 分页符", pattern: /(^|\n)---(\n|$)/ },
    { label: "缺少“本节学习目标”", pattern: /本节学习目标/ },
    { label: "缺少“本节知识结构”", pattern: /本节知识结构|知识结构/ },
    { label: "缺少“重点 vs 难点”对照", pattern: /重点[\s\S]{0,80}难点|难点[\s\S]{0,80}重点/ },
    { label: "缺少彩色 callout 结构", pattern: /<callout\b[\s\S]*color="[^"]+_bg"/ },
    { label: "缺少真题“答案与解析”折叠块", pattern: /<details\b[\s\S]*<summary>答案与解析<\/summary>/ },
    { label: "缺少“课后作业”", pattern: /课后作业/ },
    { label: "缺少“教师备课卡”", pattern: /教师备课卡/ },
  ];
  for (const check of checks) {
    if (!check.pattern.test(text)) warnings.push(check.label);
  }
  if (/^#{4,6}\s+/m.test(text)) {
    warnings.push("存在 #### 或更深层级标题，可能影响 Notion Presentation Mode 版式");
  }
  if (hasLooseMarkdownTable(text)) {
    warnings.push("存在疑似未按标准 Markdown 表格输出的管道文本，请人工检查表格渲染");
  }
  if (/```mermaid[\s\S]*?(?!```)/i.test(text) && !/```mermaid\s+[\s\S]*?\n```/i.test(text)) {
    warnings.push("Mermaid 知识结构图代码块格式可能不完整，请人工检查图是否显示");
  }
  const openCallouts = (text.match(/<callout\b/g) || []).length;
  const closeCallouts = (text.match(/<\/callout>/g) || []).length;
  if (openCallouts !== closeCallouts) {
    warnings.push("callout 开闭标签数量不一致，请人工检查 Notion 渲染");
  }
  const openColumns = (text.match(/<columns>/g) || []).length;
  const closeColumns = (text.match(/<\/columns>/g) || []).length;
  const openColumn = (text.match(/<column>/g) || []).length;
  const closeColumn = (text.match(/<\/column>/g) || []).length;
  if (openColumns !== closeColumns || openColumn !== closeColumn) {
    warnings.push("columns / column 双栏标签数量不一致，请人工检查 Notion 渲染");
  }
  const detailsCount = (text.match(/<details\b/g) || []).length;
  const summaryCount = (text.match(/<summary>答案与解析<\/summary>/g) || []).length;
  const questionLikeDetails = text.match(
    /<details\b[\s\S]*?<summary>(?!答案与解析<\/summary>)[\s\S]*?<\/details>/g,
  ) || [];
  if (detailsCount > summaryCount && questionLikeDetails.some(isLikelyExamDetails)) {
    warnings.push("存在疑似真题 details 折叠块未使用固定“答案与解析”summary");
  }
  return warnings;
}

function hasLooseMarkdownTable(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!isPipeTableLikeLine(line)) continue;
    const next = lines[index + 1]?.trim() || "";
    if (isMarkdownTableSeparator(next)) {
      index = skipMarkdownTable(lines, index + 2);
      continue;
    }
    if (!isInsideMarkdownTable(lines, index)) return true;
  }
  return false;
}

function skipMarkdownTable(lines, startIndex) {
  let index = startIndex;
  while (index < lines.length && isPipeTableLikeLine(lines[index].trim())) {
    index++;
  }
  return index - 1;
}

function isInsideMarkdownTable(lines, rowIndex) {
  for (let index = rowIndex - 1; index >= 0; index--) {
    const line = lines[index].trim();
    if (!isPipeTableLikeLine(line) && !isMarkdownTableSeparator(line)) return false;
    if (isMarkdownTableSeparator(line)) return true;
  }
  return false;
}

function isLikelyExamDetails(detailsMarkdown) {
  return /解析|考点归属|真题|单选|多选|判断题|简答题|操作题/.test(detailsMarkdown);
}

function isPipeTableLikeLine(line) {
  if (!line.startsWith("|") || !line.endsWith("|")) return false;
  return (line.match(/\|/g) || []).length >= 3;
}

function isMarkdownTableSeparator(line) {
  if (!line.startsWith("|") || !line.endsWith("|")) return false;
  return /^\|[\s:|-]+\|$/.test(line);
}

async function scanNotionAgentTriggers() {
  requireNotion();
  if (!config.notion.chapterDbId) throw new Error("CHAPTER_DATABASE_ID 未配置");
  if (!config.notion.rawMaterialsDbId) throw new Error("RAW_MATERIALS_DATABASE_ID 未配置");
  const tasks = [];
  const outlinePages = await queryCheckboxTriggerPages(config.notion.chapterDbId, [
    "自动填充考点",
  ]);
  for (const page of outlinePages) tasks.push({ type: "A", page });
  const generatePages = await queryCheckboxTriggerPages(config.notion.chapterDbId, [
    "生成课件",
  ]);
  for (const page of generatePages) tasks.push({ type: "ABC", page });
  const rawPages = await queryCheckboxTriggerPages(config.notion.rawMaterialsDbId, ["入库"]);
  for (const page of rawPages) {
    if (propValue(page, "类型") === "原始课件") tasks.push({ type: "B", page });
  }

  const results = [];
  for (const task of tasks) {
    const label = `${task.type}:${getTitle(task.page, task.page.id)}`;
    try {
      if (task.type === "A") {
        const chapter = ensureLocalChapterFromNotionPage(task.page);
        const result = await runFillOutlineAgent(chapter, {
          clearTrigger: true,
          commentPageId: task.page.id,
        });
        results.push({ label, type: task.type, status: "success", result });
      } else if (task.type === "B") {
        const chapter = await chapterFromRawMaterialPage(task.page);
        const result = await runImportExamAgent(chapter, {
          clearTriggerPageId: task.page.id,
          commentPageId: task.page.id,
        });
        results.push({ label, type: task.type, status: "success", result });
      } else {
        const chapter = ensureLocalChapterFromNotionPage(task.page);
        const outline = await runFillOutlineAgent(chapter, {
          clearTrigger: true,
          commentPageId: task.page.id,
        });
        const originalMaterialPageId = await findFirstOriginalMaterialPageId(chapter);
        const questions = await runImportExamAgent(chapter, {
          clearTriggerPageId: originalMaterialPageId,
          commentPageId: task.page.id,
        });
        const teaching = await runGenerateTeachingAgent(chapter, {
          clearGenerateFlag: true,
          commentPageId: task.page.id,
        });
        results.push({
          label,
          type: task.type,
          status: "success",
          result: { outline, questions, teaching },
        });
      }
    } catch (error) {
      results.push({ label, type: task.type, status: "error", error: error.message });
    }
  }
  return {
    total: results.length,
    success: results.filter((item) => item.status === "success").length,
    failed: results.filter((item) => item.status === "error").length,
    results,
  };
}

app.get("/api/chapters/:id/export/:kind", requireAuthorized, async (req, res) => {
  try {
    const chapter = mustChapter(req.params.id);
    if (!canAccessChapter(req.user, chapter)) {
      return res.status(403).json({ error: "该章节暂未对学生开放" });
    }
    const latest = get(
      `SELECT * FROM teaching_pages WHERE chapter_id = ? ORDER BY id DESC LIMIT 1`,
      [chapter.id],
    );
    const markdown = latest?.markdown || "";
    if (!markdown) return res.status(400).json({ error: "还没有可导出的教学页" });
    const kind = req.params.kind;
    if (kind === "markdown") {
      sendDownload(res, buildMarkdownDownload(markdown), `${chapter.title}.md`, "text/markdown; charset=utf-8");
    } else if (kind === "site") {
      sendDownload(res, buildHtmlDownload(chapter.title, markdown), `${chapter.title}.html`, "text/html; charset=utf-8");
    } else if (kind === "question-bank") {
      const questions = all(`SELECT * FROM exam_questions WHERE chapter_id = ?`, [chapter.id]);
      sendDownload(res, buildQuestionBankHtml(chapter.title, questions), `${chapter.title}-题库.html`, "text/html; charset=utf-8");
    } else if (kind === "ppt") {
      const buffer = await buildPptx(chapter.title, markdown);
      sendDownload(res, buffer, `${chapter.title}-演示版.pptx`, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    } else {
      res.status(404).json({ error: "未知导出类型" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function mustChapter(id) {
  const chapter = get(`SELECT * FROM chapters WHERE id = ?`, [id]);
  if (!chapter) throw new Error("章节不存在");
  return chapter;
}

function mustQuestion(id) {
  const question = get(`SELECT * FROM exam_questions WHERE id = ?`, [id]);
  if (!question) throw new Error("题目不存在");
  return question;
}

function saveQuestionAttempt({ userId, question, mode, selectedAnswer, isCorrect }) {
  const saved = run(
    `INSERT INTO question_attempts
     (user_id, chapter_id, question_id, mode, selected_answer, is_correct)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      userId,
      question.chapter_id,
      question.id,
      mode,
      selectedAnswer,
      isCorrect ? 1 : 0,
    ],
  );
  return get(`SELECT * FROM question_attempts WHERE id = ?`, [saved.lastInsertRowid]);
}

function isAnswerCorrect(selectedAnswer, correctAnswer) {
  const expected = normalizeAnswerForCompare(correctAnswer);
  if (!expected) return false;
  return normalizeAnswerForCompare(selectedAnswer) === expected;
}

function normalizeAnswerForCompare(answer) {
  const raw = String(answer || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (/^(√|对|正确|true|t|yes|y)$/i.test(lower)) return "TRUE";
  if (/^(×|x|错|错误|false|f|no|n)$/i.test(lower)) return "FALSE";
  const letters = raw.match(/[A-H]/gi);
  if (letters?.length) {
    return [...new Set(letters.map((letter) => letter.toUpperCase()))].sort().join("");
  }
  return raw
    .replace(/\s+/g, "")
    .replace(/[。．.、，,；;：:（）()【】[\]]/g, "")
    .toUpperCase();
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

async function syncChaptersFromNotion() {
  if (!notion || !config.notion.chapterDbId) {
    throw new Error("NOTION_TOKEN 或 CHAPTER_DATABASE_ID 未配置");
  }
  const pages = await queryChapterPages();
  const result = { created: 0, updated: 0, hidden: 0, kept: 0 };
  const notionPageIds = new Set(pages.map((page) => page.id));
  for (const page of pages) {
    const action = upsertChapterFromNotionPage(page);
    result[action] = (result[action] || 0) + 1;
  }
  const localNotionChapters = all(
    `SELECT id, notion_page_id, student_visible
     FROM chapters
     WHERE notion_page_id IS NOT NULL AND notion_page_id != ''`,
  );
  for (const chapter of localNotionChapters) {
    if (notionPageIds.has(chapter.notion_page_id)) {
      result.kept += 1;
      continue;
    }
    if (chapter.student_visible) {
      run(
        `UPDATE chapters
         SET student_visible = 0, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        ["Notion 已删除", chapter.id],
      );
      result.hidden += 1;
    } else {
      result.kept += 1;
    }
  }
  return result;
}

function upsertChapterFromNotionPage(page) {
  const title = getTitle(page, "未命名章节").trim() || "未命名章节";
  const chapterNo = String(propValue(page, "章") || "").trim();
  const sectionNo = String(propValue(page, "节") || "").trim();
  const status = String(propValue(page, "状态") || "待生成").trim() || "待生成";
  const existing = get(`SELECT * FROM chapters WHERE notion_page_id = ?`, [page.id]);
  if (existing) {
    run(
      `UPDATE chapters
       SET title = ?, chapter_no = ?, section_no = ?, notion_url = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [title, chapterNo, sectionNo, page.url || null, status, existing.id],
    );
    return "updated";
  }
  run(
    `INSERT INTO chapters (title, chapter_no, section_no, notion_page_id, notion_url, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [title, chapterNo, sectionNo, page.id, page.url || null, status],
  );
  return "created";
}

function listChaptersForUser(user) {
  if (user?.role === "teacher") {
    return all(`SELECT * FROM chapters ORDER BY updated_at DESC, id DESC`);
  }
  return all(
    `SELECT * FROM chapters
     WHERE student_visible = 1
     ORDER BY updated_at DESC, id DESC`,
  );
}

function canAccessChapter(user, chapter) {
  return user?.role === "teacher" || Number(chapter?.student_visible) === 1;
}

function ensureCanAccessChapter(user, chapterId) {
  const chapter = mustChapter(chapterId);
  if (!canAccessChapter(user, chapter)) {
    throw new Error("该章节暂未对学生开放");
  }
  return chapter;
}

function assertChapterNotionPage(chapter) {
  if (!chapter?.notion_page_id) {
    throw new Error("当前章节还没有 Notion 页面 ID，请先创建或同步章节 Notion 页面");
  }
  if (!notion) throw new Error("NOTION_TOKEN 未配置");
}

async function safeNotionStep(warnings, label, fn) {
  try {
    return await fn();
  } catch (error) {
    warnings.push(`${label}失败：${error.message}`);
    return null;
  }
}

async function safeComment(warnings, chapterId, step, label, fn) {
  const before = warnings.length;
  const result = await safeNotionStep(warnings, label, fn);
  if (warnings.length > before) {
    logStep(chapterId, step, "warning", warnings[warnings.length - 1]);
  }
  return result;
}

async function commentFailure(pageId, label, error) {
  if (!pageId || !notion) return;
  try {
    await addPageComment(pageId, `${label}：${error.message}`);
  } catch {
    // 评论失败已经不能帮助用户排查核心错误，这里避免覆盖原始异常。
  }
}

function countNonEmptyLines(value) {
  return String(value || "").split(/\r?\n/).filter((line) => line.trim()).length;
}

function ensureLocalChapterFromNotionPage(page) {
  const existing = get(`SELECT * FROM chapters WHERE notion_page_id = ?`, [page.id]);
  if (existing) return existing;
  const title = getTitle(page, "未命名章节");
  const result = run(
    `INSERT INTO chapters (title, chapter_no, section_no, notion_page_id, notion_url, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      title,
      propValue(page, "章") || "",
      propValue(page, "节") || "",
      page.id,
      page.url || null,
      propValue(page, "状态") || "待生成",
    ],
  );
  return get(`SELECT * FROM chapters WHERE id = ?`, [result.lastInsertRowid]);
}

async function chapterFromRawMaterialPage(page) {
  const chapterIds = relationValues(page, ["对应章节", "所属章节", "章节"]);
  const chapterPageId = chapterIds[0];
  if (!chapterPageId) throw new Error("原始资料未关联对应章节");
  const existing = get(`SELECT * FROM chapters WHERE notion_page_id = ?`, [
    chapterPageId,
  ]);
  if (existing) return existing;
  const chapterPage = await requireNotion().pages.retrieve({ page_id: chapterPageId });
  return ensureLocalChapterFromNotionPage(chapterPage);
}

async function findFirstOriginalMaterialPageId(chapter) {
  if (!chapter?.notion_page_id || !notion) return null;
  const notionChapter = await requireNotion().pages.retrieve({
    page_id: chapter.notion_page_id,
  });
  for (const pageId of relationValues(notionChapter, ["关联资料"])) {
    const page = await requireNotion().pages.retrieve({ page_id: pageId });
    if (propValue(page, "类型") === "原始课件") return page.id;
  }
  if (!config.notion.rawMaterialsDbId) return null;
  const response = await requireNotion().databases.query({
    database_id: config.notion.rawMaterialsDbId,
    filter: {
      property: "对应章节",
      relation: { contains: chapter.notion_page_id },
    },
    page_size: 10,
  });
  return (
    response.results.find(
      (page) => page.object === "page" && propValue(page, "类型") === "原始课件",
    )?.id || null
  );
}

function relationValues(page, names) {
  for (const name of names) {
    const value = propValue(page, name);
    if (Array.isArray(value) && value.length) return value;
  }
  return [];
}

function buildRawPageAppendMarkdown(markdown, sourceName) {
  return [
    "---",
    `## 追加生成内容 · ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    sourceName ? `来源文件：${sourceName}` : "",
    markdown,
  ].filter(Boolean).join("\n\n");
}

function normalizeRawPageTitle(title, chapterTitle) {
  const normalized = String(title || chapterTitle || "").trim();
  const legacyTitle = legacyRawPageTitle(chapterTitle);
  if (normalized && legacyTitle && normalized === legacyTitle) {
    return String(chapterTitle || "").trim();
  }
  return normalized || String(chapterTitle || "").trim();
}

function legacyRawPageTitle(chapterTitle) {
  const title = String(chapterTitle || "").trim();
  return title ? `${title} 原始页面` : "";
}

function mergeRawPageMarkdown(existing, next, sourceName) {
  const current = String(existing || "").trim();
  const appended = buildRawPageAppendMarkdown(next, sourceName);
  return current ? `${current}\n\n${appended}` : String(next || "");
}

function shouldMigrateLegacyRawPage(targetRawPage, legacyRawPage) {
  if (!targetRawPage?.notion_page_id || !legacyRawPage?.notion_page_id) return false;
  if (targetRawPage.notion_page_id === legacyRawPage.notion_page_id) return false;
  return isEmptyRawPageMarkdown(targetRawPage.markdown);
}

async function loadLegacyRawPageMarkdown(legacyRawPage) {
  const localMarkdown = String(legacyRawPage?.markdown || "").trim();
  if (!isEmptyRawPageMarkdown(localMarkdown)) return localMarkdown;
  if (!legacyRawPage?.notion_page_id || !notion) return "";
  const notionMarkdown = await readPageMarkdown(legacyRawPage.notion_page_id).catch(() => "");
  return isEmptyRawPageMarkdown(notionMarkdown) ? "" : notionMarkdown.trim();
}

function isEmptyRawPageMarkdown(markdown) {
  const text = String(markdown || "").trim();
  return !text || text === RAW_PAGE_PLACEHOLDER;
}

function mergeSourceName(existing, next) {
  const values = [existing, next]
    .flatMap((value) => String(value || "").split("、"))
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(values)].join("、");
}

function hasExamScope(context) {
  return [
    context.outline?.key_points,
    context.outline?.hard_points,
    context.outline?.new_outline_points,
    context.notionOutlineFields?.keyPoints,
    context.notionOutlineFields?.hardPoints,
    context.notionOutlineFields?.newOutlinePoints,
  ].some((value) => String(value || "").trim());
}

function reviewApplication(req, res, status) {
  const application = get(`SELECT * FROM student_applications WHERE id = ?`, [
    req.params.id,
  ]);
  if (!application) return res.status(404).json({ error: "申请不存在" });
  run(
    `UPDATE student_applications
     SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, req.user.id, application.id],
  );
  run(
    `UPDATE users
     SET authorization_status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, application.user_id],
  );
  res.json({
    ok: true,
    application: get(`SELECT * FROM student_applications WHERE id = ?`, [
      application.id,
    ]),
  });
}

function updateStudentAuthorization(req, res, status) {
  try {
    const student = mustStudentUser(req.params.id);
    run(
      `UPDATE users
       SET authorization_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, student.id],
    );
    if (status !== "approved") {
      run(`DELETE FROM sessions WHERE user_id = ?`, [student.id]);
    }
    res.json({
      ok: true,
      student: get(
        `SELECT id, name, phone, role, authorization_status, class_note, created_at, updated_at
         FROM users WHERE id = ?`,
        [student.id],
      ),
    });
  } catch (error) {
    res.status(/不存在/.test(error.message) ? 404 : 400).json({ error: error.message });
  }
}

function updateChapterStudentVisibility(req, res, visible) {
  try {
    const chapter = mustChapter(req.params.id);
    run(
      `UPDATE chapters
       SET student_visible = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [visible ? 1 : 0, chapter.id],
    );
    res.json({
      ok: true,
      chapter: get(`SELECT * FROM chapters WHERE id = ?`, [chapter.id]),
    });
  } catch (error) {
    res.status(/不存在/.test(error.message) ? 404 : 400).json({ error: error.message });
  }
}

function mustStudentUser(id) {
  const student = get(`SELECT * FROM users WHERE id = ?`, [Number(id)]);
  if (!student || student.role !== "student") {
    throw new Error("学生账号不存在");
  }
  return student;
}

function validateNamePhonePassword({ name, phone, password }) {
  if (!String(name || "").trim()) throw new Error("请填写姓名");
  if (!normalizePhone(phone)) throw new Error("请填写手机号");
  if (String(password || "").length < 6) {
    throw new Error("密码至少需要 6 位");
  }
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\s+/g, "").trim();
}

async function buildOutlineContext(chapter) {
  let notionChapter = null;
  const outlinePages = [];
  if (chapter.notion_page_id && notion) {
    notionChapter = await requireNotion().pages.retrieve({
      page_id: chapter.notion_page_id,
    });
    const outlineIds = propValue(notionChapter, "关联大纲");
    for (const pageId of Array.isArray(outlineIds) ? outlineIds : []) {
      const page = await requireNotion().pages.retrieve({ page_id: pageId });
      const title = pageTitle(page);
      const markdown = await readPageMarkdown(pageId).catch(() => "");
      const fileText = await readOutlineFileText(page).catch((error) =>
        `大纲文件读取失败：${error.message}`,
      );
      outlinePages.push({
        pageId,
        title,
        version: propValue(page, "年份版本"),
        status: propValue(page, "状态"),
        note: propValue(page, "备注"),
        summary: propValue(page, "关键变化摘要"),
        markdown: [markdown, fileText].filter(Boolean).join("\n\n"),
      });
    }
  }
  const newOutlinePages = outlinePages.filter((page) =>
    /2026|现行|新/.test(`${page.title} ${page.version} ${page.status}`),
  );
  const oldOutlinePages = outlinePages.filter((page) =>
    /2017|2025|历史|旧/.test(`${page.title} ${page.version} ${page.status}`),
  );
  return {
    chapter,
    notionProperties: notionChapter?.properties || null,
    outlinePages,
    newOutlinePages,
    oldOutlinePages,
    previousGeneratedFields: {
      newOutlinePoints: propValue(notionChapter, "新大纲考点"),
      oldOutlinePoints: propValue(notionChapter, "旧大纲考点"),
      changeType: propValue(notionChapter, "大纲变化标记"),
      changeDescription: propValue(notionChapter, "大纲变化说明"),
      keyPoints: propValue(notionChapter, "重点"),
      hardPoints: propValue(notionChapter, "难点"),
    },
  };
}

function pageTitle(page) {
  for (const prop of Object.values(page?.properties || {})) {
    if (prop?.type === "title") {
      return prop.title?.map((item) => item.plain_text).join("") || "";
    }
  }
  return "";
}

async function readOutlineFileText(page) {
  return readNotionFilesText(page, ["大纲文件"], "大纲文件");
}

async function readNotionFilesText(page, propNames, label = "文件") {
  const names = Array.isArray(propNames) ? propNames : [propNames];
  const files = names.flatMap((name) => {
    const value = propValue(page, name);
    return Array.isArray(value) ? value : [];
  });
  if (!Array.isArray(files) || !files.length) return "";
  const chunks = [];
  for (const file of files) {
    const url = file.type === "external" ? file.external?.url : file.file?.url;
    if (!url) continue;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${file.name || label} 下载失败：${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const name = file.name || "";
    if (/\.docx$/i.test(name)) {
      const extracted = await mammoth.extractRawText({ buffer });
      chunks.push(`# ${name}\n${extracted.value}`);
    } else if (/\.(txt|md|csv)$/i.test(name)) {
      chunks.push(`# ${name}\n${buffer.toString("utf8")}`);
    } else if (/\.pdf$/i.test(name)) {
      const mod = await import("pdf-parse");
      const PDFParse = mod.default || mod.PDFParse || mod;
      if (typeof PDFParse === "function" && PDFParse.name !== "PDFParse") {
        const parsed = await PDFParse(buffer);
        chunks.push(`# ${name}\n${parsed.text || ""}`);
      } else {
        const parser = new PDFParse(new Uint8Array(buffer));
        await parser.load();
        const result = await parser.getText();
        chunks.push(`# ${name}\n${result?.text || ""}`);
      }
    } else {
      chunks.push(`# ${name}\n暂不支持直接解析该${label}格式。`);
    }
  }
  return chunks.join("\n\n");
}

async function buildExamContext(chapter) {
  const latestOutline = get(
    `SELECT * FROM outline_analyses WHERE chapter_id = ? ORDER BY id DESC LIMIT 1`,
    [chapter.id],
  );
  const rawTexts = all(`SELECT title, markdown FROM raw_pages WHERE chapter_id = ?`, [
    chapter.id,
  ]);
  let notionChapter = null;
  let examQuestionCandidates = [];
  let relatedExamPages = [];
  let examSourcePages = [];
  const warnings = [];
  if (chapter.notion_page_id && notion) {
    notionChapter = await requireNotion().pages.retrieve({
      page_id: chapter.notion_page_id,
    });
    try {
      const relatedQuestionIds = propValue(notionChapter, "关联真题");
      relatedExamPages = await readRelatedStructuredExamQuestions(relatedQuestionIds);
    } catch (error) {
      warnings.push(`读取章节关联真题失败：${error.message}`);
    }
    try {
      examQuestionCandidates = await queryExamQuestionCandidates(150);
    } catch (error) {
      warnings.push(`读取历年真题库候选题失败：${error.message}`);
    }
    try {
      examSourcePages = await readExamSourcePages(notionChapter, chapter);
    } catch (error) {
      warnings.push(`读取真题原始资料失败：${error.message}`);
    }
  }
  const notionOutlineFields = {
    newOutlinePoints: propValue(notionChapter, "新大纲考点"),
    oldOutlinePoints: propValue(notionChapter, "旧大纲考点"),
    changeType: propValue(notionChapter, "大纲变化标记"),
    changeDescription: propValue(notionChapter, "大纲变化说明"),
    keyPoints: propValue(notionChapter, "重点"),
    hardPoints: propValue(notionChapter, "难点"),
  };
  const scopedCandidates = rankExamCandidatesForChapter(
    examQuestionCandidates,
    chapter,
    latestOutline,
    notionOutlineFields,
  );
  return {
    chapter,
    outline: latestOutline,
    notionOutlineFields,
    rawPages: rawTexts,
    relatedExamPages,
    examQuestionCandidates: scopedCandidates,
    examCandidateStats: {
      total: examQuestionCandidates.length,
      scoped: scopedCandidates.length,
    },
    examSourcePages,
    warnings,
    note:
      "优先从 examQuestionCandidates 历年真题库候选题中筛选本章节相关题；examQuestionCandidates 已经过后端关键词预筛选。若 examSourcePages 提供真题卷正文或文件，也可从其中抽题。已有 pageId 的候选题不要改写题干和选项。",
  };
}

function hasExamSources(context) {
  return Boolean(
    context.relatedExamPages?.length ||
      context.examQuestionCandidates?.length ||
      context.examSourcePages?.some((page) => String(page.markdown || "").trim()),
  );
}

function rankExamCandidatesForChapter(candidates, chapter, outline, notionOutlineFields) {
  const keywords = extractChapterKeywords([
    chapter?.title,
    outline?.new_outline_points,
    outline?.key_points,
    outline?.hard_points,
    notionOutlineFields?.newOutlinePoints,
    notionOutlineFields?.keyPoints,
    notionOutlineFields?.hardPoints,
  ].join("\n"));
  if (!keywords.length) return (candidates || []).slice(0, EXAM_CANDIDATE_SCOPE_LIMIT);
  const scored = (candidates || []).map((candidate) => {
    const haystack = normalizeText(
      [
        candidate.stem,
        candidate.options,
        candidate.analysis,
        candidate.source,
        candidate.knowledgeTags?.join(" "),
      ].join(" "),
    );
    const score = keywords.reduce(
      (sum, keyword) => sum + (haystack.includes(normalizeText(keyword)) ? 1 : 0),
      0,
    );
    return { candidate, score };
  });
  const matched = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.candidate);
  return (matched.length ? matched : candidates || []).slice(0, EXAM_CANDIDATE_SCOPE_LIMIT);
}

function extractChapterKeywords(text) {
  const cleaned = String(text || "")
    .replace(/[【】\[\]（）()，。；、:：/\\\-]/g, " ")
    .replace(/\d+\.?/g, " ");
  const terms = cleaned.match(/[A-Za-z][A-Za-z0-9+.#-]{1,}|[\u4e00-\u9fa5]{2,8}/g) || [];
  const stopWords = new Set([
    "章节",
    "重点",
    "难点",
    "识记",
    "领会",
    "应用",
    "要求",
    "计算机",
    "本节",
    "主要",
    "特点",
  ]);
  return [...new Set(terms.filter((term) => !stopWords.has(term)).slice(0, 80))];
}

async function readRelatedStructuredExamQuestions(pageIds) {
  const ids = Array.isArray(pageIds) ? pageIds : [];
  const pages = [];
  for (const pageId of ids) {
    const page = await requireNotion().pages.retrieve({ page_id: pageId });
    pages.push(examQuestionFromPage(page));
  }
  return pages;
}

async function readExamSourcePages(notionChapter, chapter) {
  const pages = [];
  const relatedMaterialIds = propValue(notionChapter, "关联资料");
  for (const pageId of Array.isArray(relatedMaterialIds) ? relatedMaterialIds : []) {
    const page = await requireNotion().pages.retrieve({ page_id: pageId });
    pages.push(await sourcePageFromNotion(page));
  }
  if (!config.notion.rawMaterialsDbId) return pages;
  const response = await requireNotion().databases.query({
    database_id: config.notion.rawMaterialsDbId,
    filter: {
      property: "对应章节",
      relation: { contains: chapter.notion_page_id },
    },
    page_size: 30,
  });
  for (const page of response.results.filter((item) => item.object === "page")) {
    const title = pageTitle(page);
    const type = propValue(page, "类型");
    const source = propValue(page, "来源");
    const looksLikeExam = /真题|试题|试卷|题库/i.test(`${title} ${type} ${source}`);
    if (looksLikeExam) {
      pages.push(await sourcePageFromNotion(page));
    }
  }
  return pages;
}

async function sourcePageFromNotion(page) {
  const markdown = await readPageMarkdown(page.id).catch(() => "");
  const fileText = await readNotionFilesText(
    page,
    ["文件", "真题文件", "附件", "原始课件"],
    "真题文件",
  ).catch((error) => `真题文件读取失败：${error.message}`);
  return {
    pageId: page.id,
    title: pageTitle(page),
    type: propValue(page, "类型"),
    source: propValue(page, "来源"),
    year: propValue(page, "年份"),
    markdown: [markdown, fileText].filter(Boolean).join("\n\n").slice(0, 60000),
  };
}

async function originalMaterialFromNotion(page) {
  const lecturePageIds = relationValues(page, [
    "讲义页面",
    "原始页面",
    "原始页",
  ]);
  let lectureMarkdown = "";
  if (lecturePageIds[0]) {
    lectureMarkdown = await readPageMarkdown(lecturePageIds[0]).catch((error) =>
      `讲义页面读取失败：${error.message}`,
    );
  }
  const fileText = await readNotionFilesText(
    page,
    ["文件", "原始课件", "附件"],
    "原始课件",
  ).catch((error) => `原始课件文件读取失败：${error.message}`);
  return {
    pageId: page.id,
    title: pageTitle(page),
    type: propValue(page, "类型"),
    lecturePageIds,
    skeletonKind: lectureMarkdown.trim() ? "讲义页面" : "文件",
    markdown: [lectureMarkdown, fileText].filter(Boolean).join("\n\n").slice(0, 80000),
  };
}

function examQuestionFromPage(page) {
  return {
    pageId: page.id,
    url: page.url || null,
    stem: pageTitle(page),
    type: propValue(page, "题型"),
    options: propValue(page, "选项"),
    answer: propValue(page, "答案"),
    analysis: propValue(page, "解析"),
    difficulty: propValue(page, "难度"),
    source: propValue(page, "出处"),
    year: propValue(page, "年份"),
    knowledgeTags:
      page.properties?.["知识点标签"]?.multi_select?.map((item) => item.name) || [],
  };
}

function findExamCandidate(candidates, question) {
  const source = question.source || "";
  const explicitId = source.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0];
  if (explicitId) {
    const byId = candidates?.find((candidate) => candidate.pageId === explicitId);
    if (byId) return byId;
  }
  const stem = normalizeText(question.stem);
  return candidates?.find((candidate) => normalizeText(candidate.stem) === stem);
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"))
    .trim();
}

async function buildTeachingContext(chapter) {
  const rawPages = all(`SELECT title, markdown FROM raw_pages WHERE chapter_id = ?`, [
    chapter.id,
  ]).map((page) => ({
    ...page,
    markdown: clipText(page.markdown, 6000),
  }));
  const outline = get(
    `SELECT * FROM outline_analyses WHERE chapter_id = ? ORDER BY id DESC LIMIT 1`,
    [chapter.id],
  );
  const questions = all(
    `SELECT * FROM exam_questions WHERE chapter_id = ? ORDER BY id DESC LIMIT ?`,
    [chapter.id, TEACHING_PAGE_QUESTION_LIMIT],
  ).map((question) => ({
    stem: question.stem,
    type: question.type,
    options: question.options,
    answer: question.answer,
    analysis: clipText(question.analysis, 800),
    difficulty: question.difficulty,
    source: question.source,
    year: question.year,
    knowledgeTags: JSON.parse(question.knowledge_tags_json || "[]"),
  }));
  let currentNotionMarkdown = "";
  let notionChapter = null;
  let outlineIds = [];
  let originalMaterials = [];
  if (chapter.notion_page_id && notion) {
    notionChapter = await requireNotion().pages.retrieve({
      page_id: chapter.notion_page_id,
    });
    currentNotionMarkdown = await readPageMarkdown(chapter.notion_page_id).catch(() => "");
    outlineIds = relationValues(notionChapter, ["关联大纲"]);
    originalMaterials = await readOriginalMaterialsForChapter(notionChapter, chapter);
  }
  const skeletonSource =
    originalMaterials.find((material) => material.markdown?.trim()) ||
    rawPages.find((page) => page.markdown?.trim()) ||
    null;
  return {
    chapter,
    rawPages,
    outline,
    questions,
    currentNotionMarkdown: clipText(currentNotionMarkdown, 2000),
    outlineIds,
    originalMaterials: originalMaterials.map((material) => ({
      ...material,
      markdown: clipText(material.markdown, 12000),
    })),
    skeletonSource: skeletonSource
      ? { ...skeletonSource, markdown: clipText(skeletonSource.markdown, 16000) }
      : null,
    note:
      `为避免 C 生成超时，后端已压缩上下文：保留讲义骨架、最近原始页摘要、最多 ${TEACHING_PAGE_QUESTION_LIMIT} 道章节真题、考点和少量当前章节正文。生成结果仍需老师人工检查。`,
  };
}

function clipText(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n\n[内容过长，后续已由系统截断以避免生成超时]`;
}

async function readOriginalMaterialsForChapter(notionChapter, chapter) {
  const materialPages = [];
  const seen = new Set();
  for (const pageId of relationValues(notionChapter, ["关联资料"])) {
    if (seen.has(pageId)) continue;
    seen.add(pageId);
    const page = await requireNotion().pages.retrieve({ page_id: pageId });
    if (propValue(page, "类型") === "原始课件") materialPages.push(page);
  }
  if (config.notion.rawMaterialsDbId) {
    const response = await requireNotion().databases.query({
      database_id: config.notion.rawMaterialsDbId,
      filter: {
        property: "对应章节",
        relation: { contains: chapter.notion_page_id },
      },
      page_size: 30,
    });
    for (const page of response.results.filter((item) => item.object === "page")) {
      if (seen.has(page.id) || propValue(page, "类型") !== "原始课件") continue;
      seen.add(page.id);
      materialPages.push(page);
    }
  }
  const materials = [];
  for (const page of materialPages) {
    materials.push(await originalMaterialFromNotion(page));
  }
  return materials;
}

async function runInternal(pathname, req) {
  const origin = `http://127.0.0.1:${config.port}`;
  const response = await fetch(`${origin}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body || {}),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || pathname);
  return data;
}

function sendDownload(res, buffer, filename, type) {
  res.setHeader("Content-Type", type);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  res.send(buffer);
}

app.listen(config.port, "127.0.0.1", () => {
  console.log(`[server] http://127.0.0.1:${config.port}`);
});
