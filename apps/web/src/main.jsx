import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  FileText,
  Layers,
  KeyRound,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import "./styles.css";
import featureMockExam from "./assets/trial-features/mock-exam.png";
import featurePractice from "./assets/trial-features/practice.png";
import featureResources from "./assets/trial-features/resources.png";
import featureTeacherAuthorization from "./assets/trial-features/teacher-authorization.svg";
import featureTeaching from "./assets/trial-features/teaching.png";
import featureWrongQuestions from "./assets/trial-features/wrong-questions.png";

const API = "";

const emptyAuthForm = {
  name: "",
  phone: "",
  password: "",
  classNote: "",
};

function App() {
  const [user, setUser] = useState(null);
  const [needsTeacherSetup, setNeedsTeacherSetup] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(emptyAuthForm);
  const [authLoading, setAuthLoading] = useState(true);
  const [chapters, setChapters] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [applications, setApplications] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [studentChapterListOpen, setStudentChapterListOpen] = useState(false);
  const [teacherChapterListOpen, setTeacherChapterListOpen] = useState(true);
  const [chapterSortMode, setChapterSortMode] = useState("number");
  const [chapterSearchIndex, setChapterSearchIndex] = useState("");
  const [editingChapterOrder, setEditingChapterOrder] = useState(null);
  const [title, setTitle] = useState("");
  const [chapterNo, setChapterNo] = useState("");
  const [sectionNo, setSectionNo] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [chapterAccess, setChapterAccess] = useState({ chapterId: null, students: [] });
  const [chapterAccessFilter, setChapterAccessFilter] = useState("");
  const [routePath, setRoutePath] = useState(() => window.location.pathname || "/");
  const [routeSearch, setRouteSearch] = useState(() => window.location.search || "");

  const selected = useMemo(
    () => chapters.find((chapter) => chapter.id === selectedId) || null,
    [chapters, selectedId],
  );
  const latestTeaching = detail?.teachingPages?.[0] || null;
  const isTeacher = user?.role === "teacher";
  const isAuthorized = isTeacher || user?.authorizationStatus === "approved";
  const sortedChapters = useMemo(() => {
    const sorted = [...chapters];

    switch (chapterSortMode) {
      case "number":
        return sorted.sort((a, b) => {
          const aChapter = parseInt(a.chapter_no || "0") || 0;
          const bChapter = parseInt(b.chapter_no || "0") || 0;
          if (aChapter !== bChapter) return aChapter - bChapter;
          const aSection = parseInt(a.section_no || "0") || 0;
          const bSection = parseInt(b.section_no || "0") || 0;
          return aSection - bSection;
        });
      case "name-asc":
        return sorted.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
      case "name-desc":
        return sorted.sort((a, b) => b.title.localeCompare(a.title, "zh-CN"));
      case "time-asc":
        return sorted.sort((a, b) => a.id - b.id);
      case "time-desc":
        return sorted.sort((a, b) => b.id - a.id);
      default:
        return sorted;
    }
  }, [chapters, chapterSortMode]);

  const filteredChapters = useMemo(() => {
    if (!chapterSearchIndex.trim()) return sortedChapters;
    const searchText = chapterSearchIndex.trim().toLowerCase();
    return sortedChapters.filter((chapter) => {
      const title = (chapter.title || "").toLowerCase();
      const chapterNo = chapter.chapter_no || "";
      const sectionNo = chapter.section_no || "";
      const chapterInfo = `第${chapterNo}章第${sectionNo}节`.toLowerCase();
      return title.includes(searchText) || chapterInfo.includes(searchText);
    });
  }, [sortedChapters, chapterSearchIndex]);
  const workspaceTitle = isTeacher
    ? selected?.title || "请选择或新建章节"
    : studentPageTitle(routePath, selected);
  const authRole = new URLSearchParams(routeSearch).get("role") || "";

  useEffect(() => {
    loadMe();
  }, []);

  useEffect(() => {
    if (authRole === "teacher" && authMode === "register") {
      setAuthMode("login");
    }
  }, [authRole, authMode]);

  useEffect(() => {
    if (!user || routePath !== "/login") return;
    if (user.role === "teacher") {
      navigateTo("/teacher");
    } else if (user.authorizationStatus === "approved") {
      navigateTo("/student");
    }
  }, [user?.id, user?.role, user?.authorizationStatus, routePath]);

  useEffect(() => {
    const onPopState = () => {
      setRoutePath(window.location.pathname || "/");
      setRouteSearch(window.location.search || "");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (isAuthorized) loadChapters();
    if (isTeacher) {
      loadApplications();
      loadStudents();
      loadTeachers();
    }
  }, [user?.id, user?.authorizationStatus]);

  useEffect(() => {
    if (!chapters.length || isTeacher) return;
    const routeChapterId = chapterIdFromPath(routePath);
    if (routeChapterId && chapters.some((chapter) => chapter.id === routeChapterId)) {
      setSelectedId(routeChapterId);
    } else if (!selectedId && chapters.length) {
      setSelectedId(chapters[0].id);
    }
  }, [chapters, routePath, isTeacher]);

  useEffect(() => {
    if (selectedId && isAuthorized) loadDetail(selectedId);
    if (selectedId && isTeacher) {
      loadChapterAccess(selectedId);
    } else {
      setChapterAccess({ chapterId: null, students: [] });
      setChapterAccessFilter("");
    }
  }, [selectedId, user?.authorizationStatus, isTeacher]);

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      credentials: "include",
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      if (response.status === 401) setUser(null);
      throw new Error(data.error || `请求失败: ${response.status}`);
    }
    return data;
  }

  async function loadMe() {
    setAuthLoading(true);
    try {
      const data = await request("/api/auth/me");
      setUser(data.user || null);
      setNeedsTeacherSetup(Boolean(data.needsTeacherSetup));
      if (data.needsTeacherSetup) setAuthMode("setup");
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    const path =
      authMode === "setup"
        ? "/api/auth/bootstrap-teacher"
        : authMode === "register"
          ? "/api/auth/register"
          : "/api/auth/login";
    await withBusy(authMode === "login" ? "登录" : "提交", async () => {
      const data = await request(path, {
        method: "POST",
        body: JSON.stringify(authForm),
      });
      setUser(data.user);
      setAuthForm(emptyAuthForm);
      setNeedsTeacherSetup(false);
      if (data.user?.role === "teacher") {
        navigateTo("/teacher");
      } else if (data.user?.authorizationStatus === "approved") {
        navigateTo("/student");
      }
    });
  }

  async function logout() {
    await withBusy("退出登录", async () => {
      await request("/api/auth/logout", { method: "POST" });
      setUser(null);
      setChapters([]);
      setSelectedId(null);
      setDetail(null);
      setApplications([]);
      setStudents([]);
      setTeachers([]);
      await loadMe();
      navigateTo("/");
    });
  }

  async function loadChapters() {
    setError("");
    setSyncNotice("");
    const data = await request("/api/chapters");
    const nextChapters = data.chapters || [];
    setChapters(nextChapters);
    if (data.syncWarning) {
      if (nextChapters.length) {
        setSyncNotice("Notion 章节库暂时连接失败，已显示上次同步到本地的章节。");
      } else {
        setError(data.syncWarning);
      }
    }
    const routeChapterId = chapterIdFromPath(routePath);
    if (routeChapterId && nextChapters.some((chapter) => chapter.id === routeChapterId)) {
      setSelectedId(routeChapterId);
    } else if (nextChapters.some((chapter) => chapter.id === selectedId)) {
      // Keep the current selection when it still exists after refresh.
    } else if (nextChapters.length) {
      setSelectedId(nextChapters[0].id);
      if (!isTeacher && routePath.startsWith("/chapters/")) {
        navigateTo(`/chapters/${nextChapters[0].id}`);
      }
    } else {
      setSelectedId(null);
      setDetail(null);
    }
  }

  async function syncChaptersFromNotion() {
    await withBusy("同步 Notion 章节列表", async () => {
      const data = await request("/api/teacher/sync-chapters-from-notion", {
        method: "POST",
      });
      setChapters(data.chapters || []);
      const result = data.syncResult;
      if (result) {
        setSyncNotice(
          `Notion 章节列表同步完成：新增 ${result.created || 0}，更新 ${result.updated || 0}，隐藏 ${result.hidden || 0}，保留 ${result.kept || 0}。`,
        );
      }
    });
  }

  async function syncCurrentTeachingPageFromNotion() {
    if (!selectedId) {
      setError("请选择章节");
      return;
    }
    await withBusy("同步当前章节教学页", async () => {
      const data = await request(`/api/teacher/chapters/${selectedId}/sync-teaching-page-from-notion`, {
        method: "POST",
      });
      const labels = {
        teachingCreated: "已新增当前章节教学页",
        teachingUpdated: "已更新当前章节教学页",
        teachingSkipped: "当前 Notion 章节正文为空或过短，已跳过",
        teachingFailed: "当前章节教学页同步失败，请查看生成日志",
      };
      setSyncNotice(labels[data.action] || "当前章节教学页同步完成。");
      await loadDetail();
    });
  }

  async function cleanupDuplicateQuestions() {
    if (!selectedId) {
      setError("请选择章节");
      return;
    }
    await withBusy("清理当前章节重复题", async () => {
      const data = await request(`/api/chapters/${selectedId}/cleanup-duplicate-questions`, {
        method: "POST",
      });
      setSyncNotice(
        `当前章节重复题清理完成：处理 ${data.groups || 0} 组，修正题型 ${data.typeCorrected || 0}，合并 ${data.merged || 0}，删除 ${data.deleted || 0}，保留历史 ${data.retained || 0}。`,
      );
      await loadDetail();
    });
  }

  async function createTeacherQuestion(chapterId, payload) {
    await request(`/api/teacher/chapters/${chapterId}/questions`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await loadDetail(chapterId);
  }

  async function updateTeacherQuestion(questionId, payload) {
    await request(`/api/teacher/questions/${questionId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    await loadDetail();
  }

  async function archiveTeacherQuestion(questionId) {
    await request(`/api/teacher/questions/${questionId}/archive`, { method: "POST" });
    await loadDetail();
  }

  async function restoreTeacherQuestion(questionId) {
    await request(`/api/teacher/questions/${questionId}/restore`, { method: "POST" });
    await loadDetail();
  }

  async function loadApplications() {
    if (!isTeacher) return;
    const data = await request("/api/teacher/applications");
    setApplications(data.applications || []);
  }

  async function loadStudents() {
    if (!isTeacher) return;
    const data = await request("/api/teacher/students");
    setStudents(data.students || []);
  }

  async function loadTeachers() {
    if (!isTeacher) return;
    const data = await request("/api/teacher/teachers");
    setTeachers(data.teachers || []);
  }

  async function reviewApplication(id, action) {
    await withBusy(action === "approve" ? "通过申请" : "拒绝申请", async () => {
      await request(`/api/teacher/applications/${id}/${action}`, {
        method: "POST",
      });
      await loadApplications();
      await loadStudents();
    });
  }

  async function createStudentAccount(studentForm) {
    await withBusy("添加学生账号", async () => {
      await request("/api/teacher/students", {
        method: "POST",
        body: JSON.stringify(studentForm),
      });
      await loadApplications();
      await loadStudents();
    });
  }

  async function createTeacherAccount(teacherForm) {
    await withBusy("添加老师账号", async () => {
      await request("/api/teacher/teachers", {
        method: "POST",
        body: JSON.stringify(teacherForm),
      });
      await loadTeachers();
    });
  }

  async function changeOwnPassword(passwordForm) {
    await withBusy("修改密码", async () => {
      await request("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify(passwordForm),
      });
      window.alert("密码已修改，请使用新密码重新登录。");
      setUser(null);
      setChapters([]);
      setSelectedId(null);
      setDetail(null);
      setApplications([]);
      setStudents([]);
      setTeachers([]);
      setAuthMode("login");
      await loadMe();
    });
  }

  async function resetStudentPassword(id, password) {
    await withBusy("重置学生密码", async () => {
      await request(`/api/teacher/students/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      await loadStudents();
      setSyncNotice("学生密码已重置，该学生需要使用新密码重新登录。");
    });
  }

  async function resetTeacherPassword(id, password) {
    await withBusy("重置老师密码", async () => {
      await request(`/api/teacher/teachers/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      await loadTeachers();
      setSyncNotice("老师密码已重置，该老师需要使用新密码重新登录。");
    });
  }

  async function updateStudentAccess(id, action) {
    await withBusy(action === "authorize" ? "开放权限" : "收回权限", async () => {
      await request(`/api/teacher/students/${id}/${action}`, { method: "POST" });
      await loadStudents();
      await loadApplications();
    });
  }

  async function deleteStudent(id) {
    const confirmed = window.confirm("删除后该学生账号和学习/答题记录将被移除，确定删除吗？");
    if (!confirmed) return;
    await withBusy("删除学生", async () => {
      await request(`/api/teacher/students/${id}`, { method: "DELETE" });
      await loadStudents();
      await loadApplications();
    });
  }

  async function updateChapterVisibility(chapterId, visible) {
    await withBusy(visible ? "开放章节" : "隐藏章节", async () => {
      await request(
        `/api/teacher/chapters/${chapterId}/${visible ? "show-to-students" : "hide-from-students"}`,
        { method: "POST" },
      );
      await loadChapters();
      if (selectedId) await loadDetail(selectedId);
    });
  }

  async function loadChapterAccess(chapterId) {
    if (!chapterId) {
      setChapterAccess({ chapterId: null, students: [] });
      return;
    }
    try {
      const data = await request(`/api/teacher/chapters/${chapterId}/student-access`);
      setChapterAccess({ chapterId, students: data.students || [] });
    } catch (err) {
      setError(err.message);
      setChapterAccess({ chapterId, students: [] });
    }
  }

  async function setChapterStudentAccess(chapterId, studentId, hasAccess) {
    const action = hasAccess ? "grant" : "revoke";
    await withBusy(hasAccess ? "开放给学生" : "取消授权", async () => {
      await request(
        `/api/teacher/chapters/${chapterId}/student-access/${studentId}/${action}`,
        { method: "POST" },
      );
      await loadChapterAccess(chapterId);
      await loadChapters();
    });
  }

  async function updateChapterOrder(chapterId, chapterNo, sectionNo) {
    await withBusy("更新章节序号", async () => {
      await request(`/api/teacher/chapters/${chapterId}/order`, {
        method: "PATCH",
        body: JSON.stringify({ chapterNo, sectionNo }),
      });
      await loadChapters();
      setEditingChapterOrder(null);
    });
  }

  async function loadDetail(id = selectedId) {
    if (!id) return;
    const data = await request(`/api/chapters/${id}`);
    setDetail(data);
  }

  async function createChapter() {
    if (!title.trim()) {
      setError("请输入章节标题");
      return;
    }
    await withBusy("新建章节", async () => {
      const data = await request("/api/chapters", {
        method: "POST",
        body: JSON.stringify({ title, chapterNo, sectionNo }),
      });
      setTitle("");
      setChapterNo("");
      setSectionNo("");
      await loadChapters();
      setSelectedId(data.chapter.id);
    });
  }

  async function uploadRawPage() {
    if (!selectedId || !files.length) {
      setError("请选择章节并上传文件");
      return;
    }
    await withBusy("Qwen 生成原始页面", async () => {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));
      form.append("title", selected.title);
      await request(`/api/chapters/${selectedId}/raw-pages/from-file`, {
        method: "POST",
        body: form,
      });
      setFiles([]);
      await loadDetail();
    });
  }

  async function createLecturePage() {
    if (!selectedId || !selected) {
      setError("请选择章节");
      return;
    }
    await withBusy("创建 Notion 讲义页", async () => {
      await request("/api/raw-materials/create-lecture-page", {
        method: "POST",
        body: JSON.stringify({
          chapterId: selectedId,
          pageTitle: selected.title,
          chapterUrl: selected.notion_page_id || "",
        }),
      });
      await loadDetail();
    });
  }

  async function runStep(step, label) {
    if (!selectedId) return;
    await withBusy(label, async () => {
      const data = await request(`/api/chapters/${selectedId}/${step}`, { method: "POST" });
      if (step === "import-teaching-questions") {
        setSyncNotice(formatTeachingQuestionImportNotice(data));
      }
      await loadDetail();
      await loadChapters();
    });
  }

  async function submitQuestionAttempt(questionId, selectedAnswer, mode = "practice") {
    return request(`/api/questions/${questionId}/attempt`, {
      method: "POST",
      body: JSON.stringify({ selectedAnswer, mode }),
    });
  }

  async function loadWrongQuestions(chapterId = selectedId) {
    const query = chapterId ? `?chapterId=${chapterId}` : "";
    return request(`/api/student/wrong-questions${query}`);
  }

  async function loadMockQuestions(chapterId = selectedId) {
    const query = chapterId ? `?chapterId=${chapterId}&limit=12` : "?limit=12";
    return request(`/api/mock-exam/questions${query}`);
  }

  async function submitMockExam(answers) {
    return request("/api/mock-exam/submit", {
      method: "POST",
      body: JSON.stringify({ answers }),
    });
  }

  async function scanNotionTriggers() {
    await withBusy("扫描 Notion 触发项", async () => {
      await request("/api/notion-agent/scan-triggers", { method: "POST" });
      await loadChapters();
      if (selectedId) await loadDetail();
    });
  }

  async function withBusy(label, fn) {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  function exportFile(kind) {
    if (!selectedId) return;
    window.location.href = `${API}/api/chapters/${selectedId}/export/${kind}`;
  }

  function navigateTo(path) {
    if (path === `${routePath}${routeSearch}` || path === routePath) return;
    window.history.pushState({}, "", path);
    setRoutePath(window.location.pathname || "/");
    setRouteSearch(window.location.search || "");
  }

  function selectChapter(chapterId, nextPath) {
    setSelectedId(chapterId);
    if (!isTeacher) {
      setStudentChapterListOpen(false);
      navigateTo(nextPath || `/chapters/${chapterId}`);
    }
  }

  if (authLoading) {
    return <FullPageMessage icon={<Loader2 className="spin" />} title="正在检查登录状态" />;
  }

  if (routePath === "/") {
    return <PublicHome navigateTo={navigateTo} user={user} />;
  }

  if (routePath === "/trial") {
    return <PublicTrialPage navigateTo={navigateTo} user={user} />;
  }

  if (!user) {
    return (
      <AuthScreen
        mode={authMode}
        setMode={setAuthMode}
        form={authForm}
        setForm={setAuthForm}
        onSubmit={submitAuth}
        busy={busy}
        error={error}
        needsTeacherSetup={needsTeacherSetup}
        role={authRole}
        navigateTo={navigateTo}
      />
    );
  }

  if (user.role === "student" && user.authorizationStatus !== "approved") {
    return (
      <FullPageMessage
        icon={<ShieldCheck />}
        title={user.authorizationStatus === "rejected" ? "申请暂未通过" : "等待老师审核"}
        description={
          user.authorizationStatus === "rejected"
            ? "你的申请暂未通过，请联系老师确认信息。"
            : "你的访问申请已提交，请等待老师审核。审核通过后可查看课程章节。"
        }
        action={<button onClick={logout}><LogOut size={16} /> 退出登录</button>}
      />
    );
  }

  if (routePath === "/teacher" && user.role !== "teacher") {
    return (
      <FullPageMessage
        icon={<ShieldCheck />}
        title="需要老师权限"
        description="当前账号不是老师账号，请返回公开主页或退出后使用老师账号登录。"
        action={
          <div className="message-actions">
            <button onClick={() => navigateTo("/")}>返回公开主页</button>
            <button onClick={logout}><LogOut size={16} /> 退出登录</button>
          </div>
        }
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Database size={28} />
          <div>
            <strong>教考智联</strong>
            <span>专升本《计算机应用基础》AIGC工作台</span>
          </div>
        </div>

        <section className="account-card">
          <div>
            <strong>{user.name}</strong>
            <span>{isTeacher ? "老师" : "已授权学生"}</span>
          </div>
          <button className="icon-btn" onClick={logout} title="退出登录">
            <LogOut size={16} />
          </button>
        </section>

        <button className="home-link-button" onClick={() => navigateTo("/")}>
          <BookOpen size={16} /> 返回公开主页
        </button>

        {!isTeacher ? (
          <StudentNavigation
            routePath={routePath}
            selectedId={selectedId}
            navigateTo={navigateTo}
          />
        ) : null}

        {isTeacher ? (
          <section className="new-chapter">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="章节标题"
            />
            <div className="row">
              <input
                value={chapterNo}
                onChange={(event) => setChapterNo(event.target.value)}
                placeholder="章"
              />
              <input
                value={sectionNo}
                onChange={(event) => setSectionNo(event.target.value)}
                placeholder="节"
              />
            </div>
            <button onClick={createChapter} disabled={Boolean(busy)}>
              <Plus size={16} /> 新建章节
            </button>
          </section>
        ) : null}

        <div className="list-head">
          <span>章节</span>
          <div className="chapter-actions">
            {sortedChapters.length > 1 ? (
              <input
                type="text"
                value={chapterSearchIndex}
                onChange={(e) => setChapterSearchIndex(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setChapterSearchIndex("");
                  }
                }}
                placeholder="搜索章节标题或章节号"
                style={{
                  width: "160px",
                  minHeight: "36px",
                  padding: "0 8px",
                  fontSize: "13px",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px"
                }}
              />
            ) : null}
            {sortedChapters.length > 1 ? (
              <select
                value={chapterSortMode}
                onChange={(e) => setChapterSortMode(e.target.value)}
                style={{ minHeight: "36px", padding: "0 8px", fontSize: "13px" }}
              >
                <option value="number">按章节号</option>
                <option value="name-asc">按名称升序</option>
                <option value="name-desc">按名称降序</option>
                <option value="time-asc">按时间升序</option>
                <option value="time-desc">按时间降序</option>
              </select>
            ) : null}
            {isTeacher && sortedChapters.length > 1 ? (
              <button
                onClick={() => setTeacherChapterListOpen((open) => !open)}
                title={teacherChapterListOpen ? "收起章节" : "展开章节"}
              >
                {teacherChapterListOpen ? "收起" : "切换"}
              </button>
            ) : null}
            {!isTeacher && chapters.length > 1 ? (
              <button
                onClick={() => setStudentChapterListOpen((open) => !open)}
                title={studentChapterListOpen ? "收起章节" : "切换章节"}
              >
                {studentChapterListOpen ? "收起" : "切换"}
              </button>
            ) : null}
            {isTeacher ? (
              <button onClick={syncChaptersFromNotion} disabled={Boolean(busy)}>
                <RefreshCw size={15} /> 同步 Notion 章节列表
              </button>
            ) : (
              <button className="icon-btn" onClick={loadChapters} title="刷新章节">
                <RefreshCw size={15} />
              </button>
            )}
          </div>
        </div>
        <nav className="chapter-list">
          {(isTeacher
            ? teacherChapterListOpen
              ? filteredChapters
              : selected
                ? [selected]
                : filteredChapters.slice(0, 1)
            : studentChapterListOpen
              ? filteredChapters
              : selected
                ? [selected]
                : filteredChapters.slice(0, 1)
          ).map((chapter) => {
            const displayIndex = isTeacher
              ? sortedChapters.findIndex(ch => ch.id === chapter.id) + 1
              : 0;
            const isEditing = editingChapterOrder === chapter.id;
            return (
              <button
                key={chapter.id}
                className={chapter.id === selectedId ? "active" : ""}
                onClick={() => !isEditing && selectChapter(chapter.id)}
              >
                {isTeacher ? (
                  isEditing ? (
                    <div className="chapter-order-edit">
                      <input
                        type="text"
                        placeholder="章"
                        defaultValue={chapter.chapter_no || ""}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const chapterNo = e.target.value;
                            const sectionNo = e.target.nextSibling.value;
                            updateChapterOrder(chapter.id, chapterNo, sectionNo);
                          }
                          if (e.key === "Escape") {
                            setEditingChapterOrder(null);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <input
                        type="text"
                        placeholder="节"
                        defaultValue={chapter.section_no || ""}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const chapterNo = e.target.previousSibling.value;
                            const sectionNo = e.target.value;
                            updateChapterOrder(chapter.id, chapterNo, sectionNo);
                          }
                          if (e.key === "Escape") {
                            setEditingChapterOrder(null);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  ) : (
                    <span
                      className="chapter-index"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingChapterOrder(chapter.id);
                      }}
                      title="点击编辑章节号"
                    >
                      {displayIndex}
                    </span>
                  )
                ) : null}
                <div>
                  <strong>{chapter.title}</strong>
                  <span>
                    {chapter.status || "待生成"}
                    {isTeacher ? ` · ${describeChapterVisibility(chapter)}` : ""}
                  </span>
                </div>
              </button>
            );
          })}
          {!chapters.length ? (
            <p className="muted">{isTeacher ? "暂无章节。" : "暂无开放章节，请等待老师发布。"}</p>
          ) : null}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>专升本《计算机应用基础》</p>
            <h1>{workspaceTitle}</h1>
          </div>
          {busy ? (
            <div className="busy">
              <Loader2 size={18} className="spin" /> {busy}
            </div>
          ) : null}
        </header>

        {error ? <div className="error">{error}</div> : null}
        {syncNotice ? <div className="notice">{syncNotice}</div> : null}

        {isTeacher ? (
          <TeacherWorkspace
            selected={selected}
            selectedId={selectedId}
            detail={detail}
            latestTeaching={latestTeaching}
            files={files}
            setFiles={setFiles}
            busy={busy}
            uploadRawPage={uploadRawPage}
            createLecturePage={createLecturePage}
            runStep={runStep}
            syncCurrentTeachingPageFromNotion={syncCurrentTeachingPageFromNotion}
            cleanupDuplicateQuestions={cleanupDuplicateQuestions}
            createTeacherQuestion={createTeacherQuestion}
            updateTeacherQuestion={updateTeacherQuestion}
            archiveTeacherQuestion={archiveTeacherQuestion}
            restoreTeacherQuestion={restoreTeacherQuestion}
            scanNotionTriggers={scanNotionTriggers}
            exportFile={exportFile}
            applications={applications}
            students={students}
            teachers={teachers}
            user={user}
            reviewApplication={reviewApplication}
            createStudentAccount={createStudentAccount}
            createTeacherAccount={createTeacherAccount}
            changeOwnPassword={changeOwnPassword}
            resetStudentPassword={resetStudentPassword}
            resetTeacherPassword={resetTeacherPassword}
            updateStudentAccess={updateStudentAccess}
            deleteStudent={deleteStudent}
            updateChapterVisibility={updateChapterVisibility}
            chapterAccess={chapterAccess}
            chapterAccessFilter={chapterAccessFilter}
            setChapterAccessFilter={setChapterAccessFilter}
            setChapterStudentAccess={setChapterStudentAccess}
          />
        ) : (
          <>
            <StudentChapterSwitcher
              chapters={chapters}
              selected={selected}
              routePath={routePath}
              selectChapter={selectChapter}
            />
            <StudentWorkspace
              selected={selected}
              detail={detail}
              latestTeaching={latestTeaching}
              busy={busy}
              submitQuestionAttempt={submitQuestionAttempt}
              loadWrongQuestions={loadWrongQuestions}
              loadMockQuestions={loadMockQuestions}
              submitMockExam={submitMockExam}
              exportFile={exportFile}
              chapters={chapters}
              routePath={routePath}
              navigateTo={navigateTo}
            />
          </>
        )}
      </section>
    </main>
  );
}

function describeChapterVisibility(chapter) {
  if (!chapter) return "";
  if (Number(chapter.student_visible) === 1) return "对所有学生开放";
  const count = Number(chapter.student_access_count || 0);
  if (count > 0) return `仅 ${count} 位指定学生可见`;
  return "对所有学生隐藏";
}

function ChapterAccessPanel({ chapter, access, filter, onFilterChange, onToggleStudent, busy }) {
  if (!chapter) return null;
  const isCurrent = access?.chapterId === chapter.id;
  const students = isCurrent ? access.students : [];
  const grantedCount = students.filter((student) => student.has_access).length;
  const keyword = filter.trim().toLowerCase();
  const visibleStudents = keyword
    ? students.filter((student) => {
        const name = (student.name || "").toLowerCase();
        const phone = (student.phone || "").toLowerCase();
        const note = (student.class_note || "").toLowerCase();
        return name.includes(keyword) || phone.includes(keyword) || note.includes(keyword);
      })
    : students;

  return (
    <section className="chapter-access-panel">
      <header>
        <strong>指定学生开放</strong>
        <span>
          {chapter.student_visible
            ? "已对所有学生开放；下方授权可在关闭全员开放后继续生效"
            : `已授权 ${grantedCount} 位学生`}
        </span>
      </header>
      <input
        type="search"
        placeholder="按姓名 / 手机号 / 备注搜索"
        value={filter}
        onChange={(event) => onFilterChange(event.target.value)}
      />
      {!isCurrent ? (
        <p className="muted">正在加载学生列表……</p>
      ) : !students.length ? (
        <p className="muted">暂无已授权的学生账号。</p>
      ) : !visibleStudents.length ? (
        <p className="muted">没有匹配的学生。</p>
      ) : (
        <ul className="chapter-access-list">
          {visibleStudents.map((student) => (
            <li key={student.id}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(student.has_access)}
                  disabled={Boolean(busy)}
                  onChange={(event) =>
                    onToggleStudent(chapter.id, student.id, event.target.checked)
                  }
                />
                <span>
                  <strong>{student.name}</strong>
                  <span className="muted">
                    {student.phone}
                    {student.class_note ? ` · ${student.class_note}` : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StudentChapterSwitcher({ chapters, selected, routePath, selectChapter }) {
  const [open, setOpen] = useState(false);
  const visibleChapters = open
    ? chapters
    : selected
      ? [selected]
      : chapters.slice(0, 1);

  function chooseChapter(chapterId) {
    setOpen(false);
    selectChapter(chapterId, routeForStudentTab(routeToStudentTab(routePath), chapterId));
  }

  return (
    <section className="mobile-chapter-switcher" aria-label="学生章节切换">
      <div className="mobile-chapter-switcher-head">
        <div>
          <span>当前章节</span>
          <strong>{selected?.title || "暂无开放章节"}</strong>
        </div>
        {chapters.length > 1 ? (
          <button onClick={() => setOpen((value) => !value)}>
            {open ? "收起章节" : "切换章节"}
          </button>
        ) : null}
      </div>
      <div className={`mobile-chapter-switcher-list ${open ? "expanded" : ""}`}>
        {visibleChapters.map((chapter) => (
          <button
            key={chapter.id}
            className={chapter.id === selected?.id ? "active" : ""}
            onClick={() => chooseChapter(chapter.id)}
          >
            <strong>{chapter.title}</strong>
            <span>{chapter.status || "待生成"}</span>
          </button>
        ))}
        {!chapters.length ? (
          <p className="muted">暂无开放章节，请等待老师发布。</p>
        ) : null}
      </div>
    </section>
  );
}

const publicWorkflowSteps = [
  ["资料上传", "教师上传课件、PDF、图片或 Markdown 原始资料。"],
  ["Qwen 结构化", "通义千问视觉模型将资料解析为可复用的原始页。"],
  ["A 考点", "Notion Agent 对齐新旧大纲，提取章节考点。"],
  ["B 真题", "按章节、题型和考点整理历年真题。"],
  ["C 教学页", "生成可讲授、可自学、可导出的章节教学页。"],
  ["人工审核", "教师确认后再发布给学生端。"],
];

const trialCourseFeatures = [
  {
    title: "章节教学页",
    description: "围绕学习目标、重点难点和课堂任务组织完整教学内容。",
    image: featureTeaching,
    alt: "章节教学页界面预览",
  },
  {
    title: "历年真题练习",
    description: "按章节呈现真题，作答后查看答案解析。",
    image: featurePractice,
    alt: "历年真题练习界面预览",
  },
  {
    title: "模拟考试",
    description: "从本章题库生成模拟练习，帮助检验掌握情况。",
    image: featureMockExam,
    alt: "模拟考试界面预览",
  },
  {
    title: "错题回看",
    description: "集中回看错题、答案和解析，便于针对性复习。",
    image: featureWrongQuestions,
    alt: "错题回看界面预览",
  },
  {
    title: "资料下载",
    description: "导出教学网页、演示 PPT、章节题库和 Markdown。",
    image: featureResources,
    alt: "资料下载界面预览",
  },
  {
    title: "老师授权开放",
    description: "教师审核学生申请，并按章节开放正式课程访问。",
    image: featureTeacherAuthorization,
    alt: "老师授权开放界面示意图",
  },
];

function PublicHome({ navigateTo, user }) {
  const highlights = [
    ["智能助教", "资料解析、考点提取、真题入库、教学页生成，减少重复整理资料的时间。", <Sparkles size={18} />],
    ["智能助学", "章节学习、刷题练习、模拟考试、错题本，帮助学生形成清晰备考路径。", <BookOpen size={18} />],
    ["可控发布", "教师审核、章节授权、学生粒度开放、生成日志留痕，避免 AI 内容直接发布。", <ShieldCheck size={18} />],
  ];
  const studentLoop = ["进入章节", "阅读教学页", "完成练习", "参加模拟考试", "回看错题"];
  const teacherLoop = ["同步或新建章节", "上传课件 / PDF / 图片", "一键执行 A/B/C", "审核教学页与题库", "管理学生申请和章节权限", "导出 Markdown / HTML / PPT / 题库"];
  const metrics = [
    ["6 章", "覆盖计算机基础、Windows、Office、网络与信息安全等核心内容"],
    ["369 道", "累计沉淀历年真题"],
    ["约 20 分钟", "一章资料整理从约 4 小时压缩到分钟级"],
    ["一等奖", "桌面版已获多省联赛一等奖，证书待下发"],
  ];
  const teacherEntryPath = user?.role === "teacher" ? "/teacher" : "/login?role=teacher";
  const studentEntryPath =
    user?.role === "student" && user?.authorizationStatus === "approved"
      ? "/student"
      : "/login?role=student";

  return (
    <main className="public-page">
      <header className="public-nav">
        <button className="public-brand" onClick={() => navigateTo("/")}>
          <Database size={24} />
          <span>教考智联</span>
        </button>
        <nav aria-label="主页导航">
          <a href="#case">案例简介</a>
          <a href="#workflow">AI 工作流</a>
          <a href="#loop">教学闭环</a>
          <a href="#impact">应用成效</a>
          <a href="#entry">体验入口</a>
        </nav>
        <div className="public-nav-actions">
          <button className="primary" onClick={() => navigateTo("/trial")}>无需登录试用</button>
          <button onClick={() => navigateTo(studentEntryPath)}>学生端登录</button>
          <button onClick={() => navigateTo(teacherEntryPath)}>老师端登录</button>
        </div>
      </header>

      <section className="public-hero" id="case">
        <div className="public-hero-copy">
          <span className="public-eyebrow">第三十届辽宁省教育教学信息化交流活动 · 人工智能+教育案例</span>
          <h1>教考智联</h1>
          <h2>专升本《计算机应用基础》AI 教与学工作台</h2>
          <p>
            把原始资料、考试大纲、历年真题、章节教学页和学生练习连接成一条可审核、可发布、可追踪的教学闭环。
          </p>
          <div className="public-hero-actions" id="entry">
            <button className="primary" onClick={() => navigateTo("/trial")}>
              <BookOpen size={16} /> 无需登录试用教学页
            </button>
            <button onClick={() => navigateTo(studentEntryPath)}>
              <UserCheck size={16} /> 学生端登录 / 申请访问
            </button>
            <button onClick={() => navigateTo(teacherEntryPath)}>
              <KeyRound size={16} /> 老师端登录
            </button>
          </div>
        </div>
        <section className="public-workflow-preview" aria-label="AI 生成流程预览">
          <div className="preview-head">
            <span>AI 生成流程</span>
            <strong>资料上传到审核发布</strong>
          </div>
          <div className="preview-step-list">
            {publicWorkflowSteps.map(([title, text], index) => (
              <article key={title}>
                <span>{index + 1}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
          <p className="audit-note">所有 AI 输出进入待审核状态，由教师确认后再发布给学生。</p>
        </section>
      </section>

      <section className="public-section">
        <div className="public-section-title">
          <span>AI+教育案例亮点</span>
          <h2>服务老师备课，也服务学生备考</h2>
        </div>
        <div className="public-highlight-grid">
          {highlights.map(([title, text, icon]) => (
            <article key={title}>
              <div className="public-card-icon">{icon}</div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section" id="workflow">
        <div className="public-section-title">
          <span>A/B/C 智能体工作流</span>
          <h2>从资料到教学页，流程清楚、状态可追踪</h2>
        </div>
        <div className="public-timeline">
          {publicWorkflowSteps.map(([title, text], index) => (
            <article key={title}>
              <span>{index + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section split-section" id="loop">
        <article>
          <div className="public-section-title compact">
            <span>学生学习闭环</span>
            <h2>从章节学习到错题回看</h2>
          </div>
          <ol className="public-check-list">
            {studentLoop.map((item) => <li key={item}>{item}</li>)}
          </ol>
          <button className="primary" onClick={() => navigateTo("/trial")}>进入试用教学页</button>
        </article>
        <article>
          <div className="public-section-title compact">
            <span>老师备课闭环</span>
            <h2>从章节管理到资源导出</h2>
          </div>
          <ol className="public-check-list">
            {teacherLoop.map((item) => <li key={item}>{item}</li>)}
          </ol>
          <button onClick={() => navigateTo(teacherEntryPath)}>进入老师端</button>
        </article>
      </section>

      <section className="public-section" id="impact">
        <div className="public-section-title">
          <span>应用成效与实践基础</span>
          <h2>用事实说明案例基础</h2>
        </div>
        <div className="public-metric-grid">
          {metrics.map(([value, label]) => (
            <article key={value}>
              <strong>{value}</strong>
              <p>{label}</p>
            </article>
          ))}
        </div>
        <p className="public-footnote">
          前期竞赛成果按当前可核验状态展示；证书下发后，可更新为正式获奖证明模块。
        </p>
      </section>

      <footer className="public-footer">
        <div>
          <strong>可信说明</strong>
          <p>
            本平台聚焦专升本《计算机应用基础》。正式课程内容需登录并通过授权；公开试用页仅用于体验学习方式；AI 生成内容发布前需教师审核。
          </p>
        </div>
        <div className="public-footer-actions">
          <button className="primary" onClick={() => navigateTo("/trial")}>试用教学页</button>
          <button onClick={() => navigateTo(studentEntryPath)}>学生端</button>
          <button onClick={() => navigateTo(teacherEntryPath)}>老师端</button>
        </div>
      </footer>
    </main>
  );
}

function PublicTrialPage({ navigateTo, user }) {
  const [trialData, setTrialData] = useState(null);
  const [trialLoading, setTrialLoading] = useState(true);
  const [trialError, setTrialError] = useState("");
  const [answers, setAnswers] = useState({});
  const [revealed, setRevealed] = useState({});
  const workspacePath = user?.role === "teacher" ? "/teacher" : "/student";
  const chapterTitle = trialData?.chapter?.title || "第 1 章第 1 节-计算机概述";
  const teachingMarkdown = trialData?.teachingPage?.markdown || "";
  const questions = trialData?.questions || [];

  useEffect(() => {
    let cancelled = false;

    async function loadTrialChapter() {
      setTrialLoading(true);
      setTrialError("");
      try {
        const response = await fetch(`${API}/api/public/trial-chapter`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) {
          throw new Error(data.error || `公开试用课加载失败：${response.status}`);
        }
        if (!cancelled) setTrialData(data);
      } catch (error) {
        if (!cancelled) setTrialError(error.message);
      } finally {
        if (!cancelled) setTrialLoading(false);
      }
    }

    loadTrialChapter();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateTrialAnswer(question, key) {
    setAnswers((current) => ({
      ...current,
      [question.id]: toggleOptionAnswer(current[question.id], key, question.type),
    }));
    setRevealed((current) => ({ ...current, [question.id]: false }));
  }

  function revealTrialAnswer(question) {
    const hasSelectableOptions =
      (parseQuestionOptions(question.options).length > 0 || /判断/.test(question.type || "")) &&
      !/简答|操作/.test(question.type || "");
    if (hasSelectableOptions && !answers[question.id]) return;
    setRevealed((current) => ({ ...current, [question.id]: true }));
  }

  return (
    <main className="trial-page">
      <header className="trial-nav">
        <button className="public-brand" onClick={() => navigateTo("/")}>
          <Database size={24} />
          <span>教考智联</span>
        </button>
        <div>
          <button onClick={() => navigateTo("/")}>返回主页</button>
          {user ? (
            <button className="primary" onClick={() => navigateTo(workspacePath)}>进入我的工作台</button>
          ) : (
            <button className="primary" onClick={() => navigateTo("/login?role=student")}>申请学生访问</button>
          )}
        </div>
      </header>

      <section className="trial-layout">
        <aside className="trial-sidebar">
          <span>公开试用课 · 无需登录</span>
          <h1>{chapterTitle}</h1>
          <p>本页公开展示学生端真实章节的完整教学页和练习题。答题结果只保存在当前浏览器页面，不记录个人数据。</p>
          <button className="primary" onClick={() => navigateTo("/login?role=student")}>体验后申请正式课程</button>
        </aside>

        <article className="trial-content">
          {trialLoading ? (
            <section className="trial-status">
              <Loader2 size={22} className="spin" />
              <h2>正在加载公开试用课</h2>
              <p>正在读取第 1 章第 1 节的教学页和练习题。</p>
            </section>
          ) : null}

          {!trialLoading && trialError ? (
            <section className="trial-status error">
              <h2>公开试用课暂时无法打开</h2>
              <p>{trialError}</p>
              <button onClick={() => navigateTo("/")}>返回公开主页</button>
            </section>
          ) : null}

          {!trialLoading && !trialError ? (
            <section className="trial-lesson">
              <span className="public-eyebrow">完整教学页</span>
              <h2>{chapterTitle}</h2>
              {teachingMarkdown ? (
                <MarkdownPreview markdown={teachingMarkdown} />
              ) : (
                <div className="empty">试用章节暂未生成教学页。</div>
              )}
            </section>
          ) : null}

          {!trialLoading && !trialError ? (
            <section className="trial-question-list">
              <div className="section-title">
                <ClipboardList size={18} />
                <h2>章节练习</h2>
              </div>
              <p>这里的练习只用于公开体验，不写入错题本或练习记录。</p>
              {questions.length ? (
                <div className="trial-practice-list">
                  {questions.map((question, index) => (
                    <TrialQuestionCard
                      key={question.id}
                      question={question}
                      index={index}
                      selectedAnswer={answers[question.id] || ""}
                      revealed={Boolean(revealed[question.id])}
                      onSelect={(key) => updateTrialAnswer(question, key)}
                      onReveal={() => revealTrialAnswer(question)}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty">该试用章节暂无可公开展示的练习题。</div>
              )}
            </section>
          ) : null}

          <section>
            <h3>正式课程会提供什么</h3>
            <div className="trial-feature-grid">
              {trialCourseFeatures.map((feature) => (
                <article className="trial-feature-card" key={feature.title}>
                  <img src={feature.image} alt={feature.alt} loading="lazy" />
                  <div>
                    <strong>{feature.title}</strong>
                    <p>{feature.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </article>
      </section>
    </main>
  );
}

function TrialQuestionCard({ question, index, selectedAnswer, revealed, onSelect, onReveal }) {
  const parsedOptions = parseQuestionOptions(question.options);
  const options = parsedOptions.length ? parsedOptions : /判断/.test(question.type || "") ? ["√ 正确", "× 错误"] : [];
  const isChoiceQuestion = options.length > 0 && !/简答|操作/.test(question.type || "");
  const isCorrect = trialAnswerCorrect(selectedAnswer, question.answer);

  return (
    <article className="trial-practice-card">
      <div className="trial-question-meta">
        <span>{index + 1}</span>
        <strong>{question.type || "练习题"}</strong>
        {question.year ? <em>{question.year}</em> : null}
      </div>
      <h3>{question.stem}</h3>
      {isChoiceQuestion ? (
        <div className="trial-options">
          {options.map((option) => {
            const key = optionKey(option);
            return (
              <button
                key={option}
                className={selectedAnswerIncludes(selectedAnswer, key) ? "active" : ""}
                onClick={() => onSelect(key)}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="trial-written-answer">
          <p>本题为主观题，公开试用页提供参考答案和解析，不记录作答。</p>
        </div>
      )}
      <div className="trial-question-actions">
        <button onClick={onReveal} disabled={isChoiceQuestion && !selectedAnswer}>
          查看答案解析
        </button>
      </div>
      {revealed ? (
        <div className={isChoiceQuestion && !isCorrect ? "trial-result wrong" : "trial-result correct"}>
          {isChoiceQuestion ? (isCorrect ? "回答正确。" : "当前选择不正确。") : "参考答案。"}
          <p>正确答案：{question.answer || "未填写"}</p>
          <p>解析：{question.analysis || "暂无解析"}</p>
        </div>
      ) : null}
    </article>
  );
}

function AuthScreen({
  mode,
  setMode,
  form,
  setForm,
  onSubmit,
  busy,
  error,
  needsTeacherSetup,
  role,
  navigateTo,
}) {
  const isSetup = mode === "setup";
  const isRegister = mode === "register";
  const isTeacherEntry = role === "teacher";
  const isStudentEntry = role === "student";
  const loginTitle = isTeacherEntry ? "老师端登录" : isStudentEntry ? "学生端登录" : "登录教考智联";
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand auth-brand">
          <Database size={30} />
          <div>
            <strong>教考智联</strong>
            <span>专升本《计算机应用基础》AIGC工作台</span>
          </div>
        </div>
        <h1>{isSetup ? "初始化老师账号" : isRegister ? "申请访问" : loginTitle}</h1>
        <p>
          {isSetup
            ? "当前还没有老师账号，请先创建一个老师账号。"
            : isRegister
              ? "请填写真实信息，老师审核通过后即可进入课程学习。"
              : isTeacherEntry
                ? "老师端用于章节管理、学生授权、AI 生成流程和资源导出。"
                : isStudentEntry
                  ? "学生端用于章节学习、练习、模拟考试和错题回看。"
                  : "该内容仅对已授权学生和老师开放。"}
        </p>
        {error ? <div className="error">{error}</div> : null}
        <form onSubmit={onSubmit} className="auth-form">
          {mode !== "login" ? (
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="姓名"
            />
          ) : null}
          <input
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            placeholder="手机号"
          />
          <input
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder="密码（至少 6 位）"
            type="password"
          />
          {isRegister ? (
            <input
              value={form.classNote}
              onChange={(event) => setForm({ ...form, classNote: event.target.value })}
              placeholder="班级/身份说明，例如：2026 专升本备考班"
            />
          ) : null}
          <button className="primary" disabled={Boolean(busy)}>
            {busy ? <Loader2 size={16} className="spin" /> : <UserCheck size={16} />}
            {isSetup ? "创建老师账号" : isRegister ? "提交申请" : "登录"}
          </button>
        </form>
        {!needsTeacherSetup ? (
          <div className="auth-switch">
            <button onClick={() => navigateTo("/")}>返回公开主页</button>
            {mode === "login" && !isTeacherEntry ? (
              <button onClick={() => setMode("register")}>还没有账号？申请访问</button>
            ) : (
              !isTeacherEntry ? <button onClick={() => setMode("login")}>已有账号？去登录</button> : null
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function StudentNavigation({ routePath, selectedId, navigateTo }) {
  const items = [
    ["/student", "学习首页", <BookOpen size={16} />],
    ["/chapters", "课程章节", <ClipboardList size={16} />],
    ["/practice", "刷题练习", <FileText size={16} />],
    ["/mock-exam", "模拟考试", <Layers size={16} />],
    ["/resources", "资料下载", <Download size={16} />],
  ];
  return (
    <nav className="student-nav" aria-label="学生端导航">
      {items.map(([path, label, icon]) => {
        const active =
          path === "/chapters"
            ? routePath === "/chapters" || routePath.startsWith("/chapters/")
            : routePath === path;
        return (
          <button
            key={path}
            className={active ? "active" : ""}
            onClick={() => navigateTo(path)}
          >
            {icon}
            {label}
          </button>
        );
      })}
      <button
        className={routePath === "/wrong-questions" ? "active" : ""}
        onClick={() => navigateTo("/wrong-questions")}
      >
        <XCircle size={16} />
        错题回看
      </button>
      {selectedId ? (
        <button
          className={routePath === `/chapters/${selectedId}` ? "active" : ""}
          onClick={() => navigateTo(`/chapters/${selectedId}`)}
        >
          <Target size={16} />
          当前章节
        </button>
      ) : null}
    </nav>
  );
}

function TeacherWorkspace(props) {
  const {
    selected,
    detail,
    latestTeaching,
    files,
    setFiles,
    busy,
    uploadRawPage,
    createLecturePage,
    runStep,
    syncCurrentTeachingPageFromNotion,
    cleanupDuplicateQuestions,
    createTeacherQuestion,
    updateTeacherQuestion,
    archiveTeacherQuestion,
    restoreTeacherQuestion,
    scanNotionTriggers,
    exportFile,
    applications,
    students,
    teachers,
    user,
    reviewApplication,
    createStudentAccount,
    createTeacherAccount,
    changeOwnPassword,
    resetStudentPassword,
    resetTeacherPassword,
    updateStudentAccess,
    deleteStudent,
    updateChapterVisibility,
    chapterAccess,
    chapterAccessFilter,
    setChapterAccessFilter,
    setChapterStudentAccess,
  } = props;
  const [studentForm, setStudentForm] = useState(emptyAuthForm);
  const [teacherForm, setTeacherForm] = useState(emptyAuthForm);
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [questionManagerOpen, setQuestionManagerOpen] = useState(false);
  const [teacherListOpen, setTeacherListOpen] = useState(false);
  const [studentAuthOpen, setStudentAuthOpen] = useState(false);

  async function submitStudent(event) {
    event.preventDefault();
    await createStudentAccount(studentForm);
    setStudentForm(emptyAuthForm);
  }

  async function submitTeacher(event) {
    event.preventDefault();
    await createTeacherAccount(teacherForm);
    setTeacherForm(emptyAuthForm);
  }

  async function submitPasswordChange(event) {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      window.alert("两次输入的新密码不一致。");
      return;
    }
    await changeOwnPassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    });
    setPasswordForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
  }

  async function promptResetPassword(label, onConfirm) {
    const password = window.prompt(`请输入 ${label} 的新密码（至少 6 位）`);
    if (password === null) return;
    if (password.length < 6) {
      window.alert("密码至少需要 6 位。");
      return;
    }
    const confirmPassword = window.prompt("请再次输入新密码");
    if (confirmPassword === null) return;
    if (password !== confirmPassword) {
      window.alert("两次输入的新密码不一致。");
      return;
    }
    await onConfirm(password);
    window.alert(`${label} 的密码已重置，请通知该用户使用新密码重新登录。`);
  }

  return (
    <>
      <section className="panel auth-review">
        <div className="panel-title">
          <KeyRound size={16} />
          <h3>修改我的密码</h3>
        </div>
        <form className="inline-form password-form" onSubmit={submitPasswordChange}>
          <input
            value={passwordForm.oldPassword}
            onChange={(event) =>
              setPasswordForm({ ...passwordForm, oldPassword: event.target.value })
            }
            placeholder="旧密码"
            type="password"
            autoComplete="current-password"
          />
          <input
            value={passwordForm.newPassword}
            onChange={(event) =>
              setPasswordForm({ ...passwordForm, newPassword: event.target.value })
            }
            placeholder="新密码（至少 6 位）"
            type="password"
            autoComplete="new-password"
          />
          <input
            value={passwordForm.confirmPassword}
            onChange={(event) =>
              setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })
            }
            placeholder="确认新密码"
            type="password"
            autoComplete="new-password"
          />
          <button disabled={Boolean(busy)}>
            <KeyRound size={16} /> 修改密码
          </button>
        </form>
      </section>

      <section className="panel auth-review">
        <div className="panel-title">
          <Users size={16} />
          <h3>老师账号</h3>
          <span>{teachers.length}</span>
          {teachers.length > 0 ? (
            <button onClick={() => setTeacherListOpen((open) => !open)}>
              {teacherListOpen ? "收起" : "切换"}
            </button>
          ) : null}
        </div>
        <form className="inline-form" onSubmit={submitTeacher}>
          <input
            value={teacherForm.name}
            onChange={(event) =>
              setTeacherForm({ ...teacherForm, name: event.target.value })
            }
            placeholder="老师姓名"
          />
          <input
            value={teacherForm.phone}
            onChange={(event) =>
              setTeacherForm({ ...teacherForm, phone: event.target.value })
            }
            placeholder="手机号"
          />
          <input
            value={teacherForm.password}
            onChange={(event) =>
              setTeacherForm({ ...teacherForm, password: event.target.value })
            }
            placeholder="初始密码"
            type="password"
          />
          <input
            value={teacherForm.classNote}
            onChange={(event) =>
              setTeacherForm({ ...teacherForm, classNote: event.target.value })
            }
            placeholder="备注，例如：任课老师"
          />
          <button disabled={Boolean(busy)}>
            <Plus size={16} /> 添加老师账号
          </button>
        </form>
        <div className="student-account-list">
          {teachers.length ? (
            (teacherListOpen ? teachers : teachers.slice(0, 1)).map((teacher) => (
              <article key={teacher.id}>
                <div>
                  <strong>{teacher.name}</strong>
                  <p>{teacher.phone} · {teacher.class_note || "未填写备注"}</p>
                  <p>权限：老师</p>
                </div>
                <div className="row">
                  {teacher.id === user?.id ? (
                    <span className="pill">当前账号</span>
                  ) : (
                    <button
                      onClick={() =>
                        promptResetPassword(`${teacher.name}（老师）`, (password) =>
                          resetTeacherPassword(teacher.id, password),
                        )
                      }
                      disabled={Boolean(busy)}
                    >
                      重置密码
                    </button>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="muted">暂无老师账号。</p>
          )}
        </div>
      </section>

      <section className="panel auth-review">
        <div className="panel-title">
          <UserCheck size={16} />
          <h3>学生授权</h3>
          <span>{applications.filter((item) => item.status === "pending").length}</span>
          {(applications.length > 0 || students.length > 0) ? (
            <button onClick={() => setStudentAuthOpen((open) => !open)}>
              {studentAuthOpen ? "收起" : "切换"}
            </button>
          ) : null}
        </div>
        <form className="inline-form" onSubmit={submitStudent}>
          <input
            value={studentForm.name}
            onChange={(event) =>
              setStudentForm({ ...studentForm, name: event.target.value })
            }
            placeholder="学生姓名"
          />
          <input
            value={studentForm.phone}
            onChange={(event) =>
              setStudentForm({ ...studentForm, phone: event.target.value })
            }
            placeholder="手机号"
          />
          <input
            value={studentForm.password}
            onChange={(event) =>
              setStudentForm({ ...studentForm, password: event.target.value })
            }
            placeholder="初始密码"
            type="password"
          />
          <input
            value={studentForm.classNote}
            onChange={(event) =>
              setStudentForm({ ...studentForm, classNote: event.target.value })
            }
            placeholder="班级/身份说明"
          />
          <button disabled={Boolean(busy)}>
            <Plus size={16} /> 添加学生账号
          </button>
        </form>
        <div className="application-list">
          {applications.length ? (
            (studentAuthOpen ? applications : applications.slice(0, 1)).map((item) => (
              <article key={item.id}>
                <strong>{item.name}</strong>
                <p>{item.phone} · {item.class_note}</p>
                <p>状态：{statusText(item.status)}</p>
                {item.status === "pending" ? (
                  <div className="row">
                    <button onClick={() => reviewApplication(item.id, "approve")}>
                      通过
                    </button>
                    <button onClick={() => reviewApplication(item.id, "reject")}>
                      拒绝
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <p className="muted">暂无学生申请。</p>
          )}
        </div>
        <div className="student-account-list">
          <div className="sub-panel-title">
            <h4>学生账号</h4>
            <span>{students.length}</span>
          </div>
          {students.length ? (
            (studentAuthOpen ? students : students.slice(0, 1)).map((student) => (
              <article key={student.id}>
                <div>
                  <strong>{student.name}</strong>
                  <p>{student.phone} · {student.class_note || "未填写班级/身份说明"}</p>
                  <p>权限：{statusText(student.authorization_status)}</p>
                </div>
                <div className="row">
                  {student.authorization_status !== "approved" ? (
                    <button
                      onClick={() => updateStudentAccess(student.id, "authorize")}
                      disabled={Boolean(busy)}
                    >
                      开放权限
                    </button>
                  ) : (
                    <button
                      onClick={() => updateStudentAccess(student.id, "revoke")}
                      disabled={Boolean(busy)}
                    >
                      收回权限
                    </button>
                  )}
                  <button
                    onClick={() =>
                      promptResetPassword(`${student.name}（学生）`, (password) =>
                        resetStudentPassword(student.id, password),
                      )
                    }
                    disabled={Boolean(busy)}
                  >
                    重置密码
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => deleteStudent(student.id)}
                    disabled={Boolean(busy)}
                  >
                    删除用户
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="muted">暂无学生账号。</p>
          )}
        </div>
      </section>

      {selected ? (
        <>
          <section className="chapter-publish-panel">
            <div>
              <strong>章节开放范围</strong>
              <span>{describeChapterVisibility(selected)}</span>
            </div>
            {selected.student_visible ? (
              <button onClick={() => updateChapterVisibility(selected.id, false)} disabled={Boolean(busy)}>
                对所有学生关闭
              </button>
            ) : (
              <button className="primary" onClick={() => updateChapterVisibility(selected.id, true)} disabled={Boolean(busy)}>
                开放给所有学生
              </button>
            )}
          </section>
          <ChapterAccessPanel
            chapter={selected}
            access={chapterAccess}
            filter={chapterAccessFilter}
            onFilterChange={setChapterAccessFilter}
            onToggleStudent={setChapterStudentAccess}
            busy={busy}
          />
          <section className="flow-grid">
            <FlowCard index="1" title="Qwen 原始页面" icon={<Upload size={18} />}>
              <input
                type="file"
                multiple
                onChange={(event) => setFiles([...event.target.files])}
              />
              <p>{files.length ? `已选择 ${files.length} 个文件` : "支持图片、PDF、CSV、TXT、MD"}</p>
              <button onClick={uploadRawPage} disabled={Boolean(busy)}>
                <Sparkles size={16} /> 生成 Markdown 原始页
              </button>
              <button onClick={createLecturePage} disabled={Boolean(busy)}>
                <FileText size={16} /> 创建 Notion 讲义页
              </button>
            </FlowCard>

            <FlowCard index="2" title="DeepSeek Agent A/B/C" icon={<Layers size={18} />}>
              <button onClick={() => runStep("fill-outline", "A 自动填充考点")} disabled={Boolean(busy)}>
                A 自动填充考点
              </button>
              <button onClick={() => runStep("import-exam-questions", "B 真题自动入库")} disabled={Boolean(busy)}>
                B 真题自动入库
              </button>
              <button onClick={() => runStep("generate-teaching-page", "C 生成教学页")} disabled={Boolean(busy)}>
                C 生成教学页
              </button>
              <button onClick={syncCurrentTeachingPageFromNotion} disabled={Boolean(busy)}>
                <RefreshCw size={16} /> 同步当前章节教学页
              </button>
              <button
                onClick={async () => {
                  await runStep("import-teaching-questions", "导入当前章节习题");
                  setQuestionManagerOpen(true);
                }}
                disabled={Boolean(busy)}
              >
                <ClipboardList size={16} /> 导入当前章节习题
              </button>
              <button onClick={() => setQuestionManagerOpen((open) => !open)} disabled={!selected}>
                <ClipboardList size={16} /> {questionManagerOpen ? "收起章节习题" : "显示/编辑章节习题"}
              </button>
              <button onClick={cleanupDuplicateQuestions} disabled={Boolean(busy)}>
                <ClipboardList size={16} /> 清理当前章节重复题
              </button>
              <button className="primary" onClick={() => runStep("generate-all", "A/B/C 串联生成")} disabled={Boolean(busy)}>
                <Sparkles size={16} /> 一键执行 A/B/C
              </button>
              <button onClick={scanNotionTriggers} disabled={Boolean(busy)}>
                <RefreshCw size={16} /> 扫描 Notion 触发项
              </button>
            </FlowCard>

            <FlowCard index="3" title="导出" icon={<Download size={18} />}>
              <button onClick={() => exportFile("ppt")}>导出演示 PPT</button>
              <button onClick={() => exportFile("site")}>导出教学网页</button>
              <button onClick={() => exportFile("question-bank")}>导出章节题库</button>
              <button onClick={() => exportFile("markdown")}>导出 Markdown</button>
            </FlowCard>
          </section>

          {questionManagerOpen ? (
            <TeacherQuestionManager
              selected={selected}
              questions={detail?.questions || []}
              busy={busy}
              createTeacherQuestion={createTeacherQuestion}
              updateTeacherQuestion={updateTeacherQuestion}
              archiveTeacherQuestion={archiveTeacherQuestion}
              restoreTeacherQuestion={restoreTeacherQuestion}
            />
          ) : null}

          <ChapterPanels detail={detail} />
          <TeachingPreview latestTeaching={latestTeaching} />
        </>
      ) : (
        <div className="empty">左侧新建或选择一个章节。</div>
      )}
    </>
  );
}

const questionTypes = ["单选题", "多选题", "判断题", "简答题", "操作题"];
const difficultyOptions = ["易", "中", "难"];

function formatTeachingQuestionImportNotice(data = {}) {
  const stats = data.byType || {};
  const order = ["single", "multiple", "judge", "short", "operation"];
  const details = order
    .map((key) => stats[key])
    .filter(Boolean)
    .map((item) => `${item.label} ${item.parsed || 0} 题 / 新增 ${item.imported || 0} / 更新 ${item.updated || 0}`)
    .join("；");
  const warningText = data.warnings?.length ? `；提示：${data.warnings.join("；")}` : "";
  return `当前章节习题导入完成：本次只导入“历年真题演练开始/结束”和“模拟题开始/结束”边界内题目。解析 ${data.parsed || 0}，新增 ${data.imported || 0}，更新 ${data.updated || 0}，跳过 ${data.skipped || 0}${details ? `。${details}` : ""}${warningText}`;
}

function emptyQuestionDraft(chapterTitle = "") {
  return {
    type: "单选题",
    stem: "",
    options: "A. \nB. \nC. \nD. ",
    answer: "",
    analysis: "",
    difficulty: "中",
    source: `老师手动题：${chapterTitle}`,
    year: "",
    knowledgeTags: "",
  };
}

function questionToDraft(question, chapterTitle = "") {
  return {
    type: question.type || "单选题",
    stem: question.stem || "",
    options: question.options || "A. \nB. \nC. \nD. ",
    answer: question.answer || "",
    analysis: question.analysis || "",
    difficulty: question.difficulty || "中",
    source: question.source || `老师手动题：${chapterTitle}`,
    year: question.year || "",
    knowledgeTags: parseKnowledgeTags(question.knowledge_tags_json).join("，"),
  };
}

function draftToQuestionPayload(draft) {
  return {
    type: draft.type,
    stem: draft.stem,
    options: draft.options,
    answer: draft.answer,
    analysis: draft.analysis,
    difficulty: draft.difficulty,
    source: draft.source,
    year: draft.year,
    knowledgeTags: splitTags(draft.knowledgeTags),
  };
}

function TeacherQuestionManager({
  selected,
  questions,
  busy,
  createTeacherQuestion,
  updateTeacherQuestion,
  archiveTeacherQuestion,
  restoreTeacherQuestion,
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(() => emptyQuestionDraft(selected?.title));
  const [newDraft, setNewDraft] = useState(() => emptyQuestionDraft(selected?.title));

  useEffect(() => {
    setEditingId(null);
    setDraft(emptyQuestionDraft(selected?.title));
    setNewDraft(emptyQuestionDraft(selected?.title));
  }, [selected?.id, selected?.title]);

  const activeQuestions = questions.filter((question) => !question.is_archived);
  const archivedQuestions = questions.filter((question) => question.is_archived);
  const visibleQuestions = showArchived ? questions : activeQuestions;

  async function submitNewQuestion(event) {
    event.preventDefault();
    await createTeacherQuestion(selected.id, draftToQuestionPayload(newDraft));
    setNewDraft(emptyQuestionDraft(selected?.title));
  }

  async function saveQuestion(event, questionId) {
    event.preventDefault();
    await updateTeacherQuestion(questionId, draftToQuestionPayload(draft));
    setEditingId(null);
  }

  function startEditing(question) {
    setEditingId(question.id);
    setDraft(questionToDraft(question, selected?.title));
  }

  return (
    <section className="panel question-manager">
      <div className="panel-title">
        <ClipboardList size={16} />
        <h3>章节习题管理</h3>
        <span>{activeQuestions.length}</span>
      </div>
      <p className="muted">
        当前章节题目可在这里人工校对。隐藏题不会进入学生练习、模拟考试和导出题库。
      </p>

      <form className="question-edit-form compact" onSubmit={submitNewQuestion}>
        <div className="question-form-grid">
          <select
            value={newDraft.type}
            onChange={(event) => setNewDraft({ ...newDraft, type: event.target.value })}
          >
            {questionTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          <select
            value={newDraft.difficulty}
            onChange={(event) => setNewDraft({ ...newDraft, difficulty: event.target.value })}
          >
            {difficultyOptions.map((difficulty) => (
              <option key={difficulty}>{difficulty}</option>
            ))}
          </select>
          <input
            value={newDraft.answer}
            onChange={(event) => setNewDraft({ ...newDraft, answer: event.target.value })}
            placeholder="答案，如 A / ABC / 对"
          />
          <input
            value={newDraft.year}
            onChange={(event) => setNewDraft({ ...newDraft, year: event.target.value })}
            placeholder="年份 / 模拟 / 自编"
          />
        </div>
        <textarea
          value={newDraft.stem}
          onChange={(event) => setNewDraft({ ...newDraft, stem: event.target.value })}
          placeholder="新增题干"
          required
        />
        {/单选题|多选题/.test(newDraft.type) ? (
          <textarea
            value={newDraft.options}
            onChange={(event) => setNewDraft({ ...newDraft, options: event.target.value })}
            placeholder="选项，一行一个：A. ..."
          />
        ) : null}
        <textarea
          value={newDraft.analysis}
          onChange={(event) => setNewDraft({ ...newDraft, analysis: event.target.value })}
          placeholder="解析"
        />
        <div className="question-form-grid">
          <input
            value={newDraft.source}
            onChange={(event) => setNewDraft({ ...newDraft, source: event.target.value })}
            placeholder="来源"
          />
          <input
            value={newDraft.knowledgeTags}
            onChange={(event) => setNewDraft({ ...newDraft, knowledgeTags: event.target.value })}
            placeholder="知识标签，用逗号分隔"
          />
          <button className="primary" disabled={Boolean(busy) || !newDraft.stem.trim()}>
            <Plus size={16} /> 新增题目
          </button>
        </div>
      </form>

      <div className="question-manager-toolbar">
        <strong>当前题目</strong>
        <button onClick={() => setShowArchived((value) => !value)} disabled={!archivedQuestions.length}>
          {showArchived ? "隐藏归档题" : `显示归档题 ${archivedQuestions.length}`}
        </button>
      </div>

      <div className="question-editor-list">
        {visibleQuestions.length ? (
          visibleQuestions.map((question) => (
            <article key={question.id} className={question.is_archived ? "question-editor archived" : "question-editor"}>
              {editingId === question.id ? (
                <form className="question-edit-form" onSubmit={(event) => saveQuestion(event, question.id)}>
                  <div className="question-form-grid">
                    <select
                      value={draft.type}
                      onChange={(event) => setDraft({ ...draft, type: event.target.value })}
                    >
                      {questionTypes.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                    <select
                      value={draft.difficulty}
                      onChange={(event) => setDraft({ ...draft, difficulty: event.target.value })}
                    >
                      {difficultyOptions.map((difficulty) => (
                        <option key={difficulty}>{difficulty}</option>
                      ))}
                    </select>
                    <input
                      value={draft.answer}
                      onChange={(event) => setDraft({ ...draft, answer: event.target.value })}
                      placeholder="答案"
                    />
                    <input
                      value={draft.year}
                      onChange={(event) => setDraft({ ...draft, year: event.target.value })}
                      placeholder="年份 / 模拟 / 自编"
                    />
                  </div>
                  <textarea
                    value={draft.stem}
                    onChange={(event) => setDraft({ ...draft, stem: event.target.value })}
                    required
                  />
                  {/单选题|多选题/.test(draft.type) ? (
                    <textarea
                      value={draft.options}
                      onChange={(event) => setDraft({ ...draft, options: event.target.value })}
                    />
                  ) : null}
                  <textarea
                    value={draft.analysis}
                    onChange={(event) => setDraft({ ...draft, analysis: event.target.value })}
                    placeholder="解析"
                  />
                  <div className="question-form-grid">
                    <input
                      value={draft.source}
                      onChange={(event) => setDraft({ ...draft, source: event.target.value })}
                      placeholder="来源"
                    />
                    <input
                      value={draft.knowledgeTags}
                      onChange={(event) => setDraft({ ...draft, knowledgeTags: event.target.value })}
                      placeholder="知识标签"
                    />
                    <button className="primary" disabled={Boolean(busy) || !draft.stem.trim()}>
                      保存修改
                    </button>
                    <button type="button" onClick={() => setEditingId(null)}>
                      取消
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="question-editor-head">
                    <div className="question-meta">
                      <span>{question.id}</span>
                      <strong>{question.type || "题目"}</strong>
                      {question.is_archived ? <em>已隐藏</em> : null}
                      {question.answer ? <em>答案：{question.answer}</em> : <em>答案待补充</em>}
                      {question.source ? <em>{question.source}</em> : null}
                    </div>
                    <div className="question-editor-actions">
                      <button onClick={() => startEditing(question)} disabled={Boolean(busy)}>
                        编辑
                      </button>
                      {question.is_archived ? (
                        <button onClick={() => restoreTeacherQuestion(question.id)} disabled={Boolean(busy)}>
                          恢复
                        </button>
                      ) : (
                        <button className="danger-button" onClick={() => archiveTeacherQuestion(question.id)} disabled={Boolean(busy)}>
                          隐藏
                        </button>
                      )}
                    </div>
                  </div>
                  <h4>{question.stem}</h4>
                  {question.options ? <pre>{question.options}</pre> : null}
                  <p>解析：{question.analysis || "暂无解析"}</p>
                </>
              )}
            </article>
          ))
        ) : (
          <div className="empty">当前章节还没有题目。可先导入当前章节习题，或手动新增。</div>
        )}
      </div>
    </section>
  );
}

function StudentWorkspace({
  selected,
  detail,
  latestTeaching,
  busy,
  submitQuestionAttempt,
  loadWrongQuestions,
  loadMockQuestions,
  submitMockExam,
  exportFile,
  chapters,
  routePath,
  navigateTo,
}) {
  const [tab, setTab] = useState(() => routeToStudentTab(routePath));
  const [answers, setAnswers] = useState({});
  const [practiceResults, setPracticeResults] = useState({});
  const [wrongQuestions, setWrongQuestions] = useState([]);
  const [mockQuestions, setMockQuestions] = useState([]);
  const [mockAnswers, setMockAnswers] = useState({});
  const [mockResult, setMockResult] = useState(null);
  const [studentBusy, setStudentBusy] = useState("");
  const [studentError, setStudentError] = useState("");

  const questions = detail?.questions || [];
  const outline = detail?.outlines?.[0] || null;
  const practiceQuestions = questions;

  useEffect(() => {
    setTab(routeToStudentTab(routePath));
  }, [routePath]);

  useEffect(() => {
    setAnswers({});
    setPracticeResults({});
    setWrongQuestions([]);
    setMockQuestions([]);
    setMockAnswers({});
    setMockResult(null);
    setStudentError("");
  }, [selected?.id]);

  async function withStudentBusy(label, fn) {
    setStudentBusy(label);
    setStudentError("");
    try {
      await fn();
    } catch (error) {
      setStudentError(error.message);
    } finally {
      setStudentBusy("");
    }
  }

  async function submitPractice(question) {
    const selectedAnswer = answers[question.id];
    await withStudentBusy("提交答案", async () => {
      const data = await submitQuestionAttempt(question.id, selectedAnswer, "practice");
      setPracticeResults((current) => ({ ...current, [question.id]: data.result }));
    });
  }

  async function refreshWrongQuestions() {
    await withStudentBusy("加载错题", async () => {
      const data = await loadWrongQuestions(selected.id);
      setWrongQuestions(data.wrongQuestions || []);
    });
  }

  async function startMockExam() {
    await withStudentBusy("生成模考试卷", async () => {
      const data = await loadMockQuestions(selected.id);
      setMockQuestions(data.questions || []);
      setMockAnswers({});
      setMockResult(null);
    });
  }

  async function finishMockExam() {
    await withStudentBusy("提交模拟考试", async () => {
      const data = await submitMockExam(
        mockQuestions.map((question) => ({
          questionId: question.id,
          selectedAnswer: mockAnswers[question.id] || "",
        })),
      );
      setMockResult(data.result);
      await refreshWrongQuestions();
    });
  }

  if (routePath === "/student" || routePath === "/chapters") {
    return (
      <StudentHome
        chapters={chapters}
        selected={selected}
        detail={detail}
        latestTeaching={latestTeaching}
        navigateTo={navigateTo}
      />
    );
  }

  if (!selected) return <div className="empty">请选择一个章节开始学习。</div>;
  return (
    <>
      <section className="student-overview">
        <article>
          <BookOpen size={18} />
          <strong>章节学习</strong>
          <span>{latestTeaching ? "已有教学页" : "待老师生成教学页"}</span>
        </article>
        <article>
          <ClipboardList size={18} />
          <strong>{questions.length}</strong>
          <span>本章题目</span>
        </article>
        <article>
          <Target size={18} />
          <strong>{wrongQuestions.length}</strong>
          <span>已加载错题</span>
        </article>
      </section>

      <section className="student-tabs" aria-label="学生学习功能">
        {[
          ["learn", "章节学习"],
          ["practice", "章节练习"],
          ["wrong", "错题回看"],
          ["mock", "模拟考试"],
          ["resources", "资料导出"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? "active" : ""}
            onClick={() => {
              navigateTo(routeForStudentTab(value, selected.id));
              if (value === "wrong" && !wrongQuestions.length) refreshWrongQuestions();
            }}
          >
            {label}
          </button>
        ))}
      </section>

      {studentError ? <div className="error">{studentError}</div> : null}
      {studentBusy ? (
        <div className="busy">
          <Loader2 size={18} className="spin" /> {studentBusy}
        </div>
      ) : null}

      {tab === "learn" ? (
        <section className="student-grid">
          <StudentInfoPanel title="学习目标" icon={<BookOpen size={18} />}>
            {outline?.new_outline_points ? (
              <pre>{outline.new_outline_points}</pre>
            ) : (
              <p className="muted">老师完成 A 自动填充考点后，这里会显示本章学习目标。</p>
            )}
          </StudentInfoPanel>
          <StudentInfoPanel title="重点与难点" icon={<Target size={18} />}>
            {outline ? (
              <>
                <h4>重点</h4>
                <pre>{outline.key_points || "暂无"}</pre>
                <h4>难点</h4>
                <pre>{outline.hard_points || "暂无"}</pre>
              </>
            ) : (
              <p className="muted">暂无考点分析。</p>
            )}
          </StudentInfoPanel>
          <StudentInfoPanel title="本章任务" icon={<CheckCircle2 size={18} />}>
            <ul className="clean-list">
              <li>先通读章节教学页，标记不熟悉概念。</li>
              <li>完成本章练习，提交后查看答案解析。</li>
              <li>回看错题，再用模拟考试检验掌握情况。</li>
            </ul>
          </StudentInfoPanel>
        </section>
      ) : null}

      {tab === "practice" ? (
        <section className="student-section">
          <div className="section-title">
            <FileText size={18} />
            <h2>章节练习</h2>
            <span className="pill">{practiceQuestions.length} 题</span>
          </div>
          {practiceQuestions.length ? (
            practiceQuestions.map((question, index) => (
              <QuestionCard
                key={question.id}
                question={question}
                index={index + 1}
                value={answers[question.id] || ""}
                onChange={(value) =>
                  setAnswers((current) => ({ ...current, [question.id]: value }))
                }
                result={practiceResults[question.id]}
                onSubmit={() => submitPractice(question)}
                disabled={Boolean(busy || studentBusy)}
              />
            ))
          ) : (
            <div className="empty">本章还没有题目。老师完成 B 真题自动入库后即可练习。</div>
          )}
        </section>
      ) : null}

      {tab === "wrong" ? (
        <section className="student-section">
          <div className="section-title">
            <XCircle size={18} />
            <h2>错题回看</h2>
            <button onClick={refreshWrongQuestions} disabled={Boolean(studentBusy)}>
              <RefreshCw size={15} /> 刷新错题
            </button>
          </div>
          {wrongQuestions.length ? (
            wrongQuestions.map((question, index) => (
              <WrongQuestionCard key={question.id} question={question} index={index + 1} />
            ))
          ) : (
            <div className="empty">暂无错题。完成章节练习或模拟考试后，答错的题会出现在这里。</div>
          )}
        </section>
      ) : null}

      {tab === "mock" ? (
        <section className="student-section">
          <div className="section-title">
            <Layers size={18} />
            <h2>模拟考试</h2>
            <button onClick={startMockExam} disabled={Boolean(studentBusy || !questions.length)}>
              <Sparkles size={15} /> 生成本章模考
            </button>
          </div>
          {mockQuestions.length ? (
            <>
              {mockQuestions.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  index={index + 1}
                  value={mockAnswers[question.id] || ""}
                  onChange={(value) =>
                    setMockAnswers((current) => ({ ...current, [question.id]: value }))
                  }
                  result={mockResult?.questions?.find((item) => item.questionId === question.id)}
                  disabled={Boolean(mockResult)}
                  compactSubmit
                />
              ))}
              {!mockResult ? (
                <button className="primary" onClick={finishMockExam} disabled={Boolean(studentBusy)}>
                  <CheckCircle2 size={16} /> 提交模拟考试
                </button>
              ) : (
                <MockResult result={mockResult} />
              )}
            </>
          ) : (
            <div className="empty">点击“生成本章模考”后，系统会从本章题库抽取一组题。</div>
          )}
        </section>
      ) : null}

      {tab === "resources" ? (
        <section className="student-section">
          <div className="section-title">
            <Download size={18} />
            <h2>资料导出</h2>
          </div>
          <div className="resource-actions">
            <button onClick={() => exportFile("site")}>导出教学网页</button>
            <button onClick={() => exportFile("ppt")}>导出演示 PPT</button>
            <button onClick={() => exportFile("question-bank")}>导出章节题库</button>
            <button onClick={() => exportFile("markdown")}>导出 Markdown</button>
          </div>
          <ChapterPanels detail={detail} />
        </section>
      ) : null}

      {tab === "learn" ? <TeachingPreview latestTeaching={latestTeaching} /> : null}
    </>
  );
}

function StudentHome({ chapters, selected, detail, latestTeaching, navigateTo }) {
  const currentQuestions = detail?.questions?.length || 0;
  const [chapterListOpen, setChapterListOpen] = useState(false);
  const visibleChapters = chapterListOpen
    ? chapters
    : selected
      ? [selected]
      : chapters.slice(0, 1);

  function openChapter(chapterId) {
    setChapterListOpen(false);
    navigateTo(`/chapters/${chapterId}`);
  }

  return (
    <>
      <section className="student-home">
        <div className="section-title">
          <BookOpen size={18} />
          <h2>学习首页</h2>
        </div>
        <div className="learning-path">
          {[
            ["01", "预习章节", "先看学习目标和重点难点"],
            ["02", "完成练习", "按章节刷题并查看解析"],
            ["03", "回看错题", "集中处理易错概念"],
            ["04", "模拟考试", "检查本章掌握情况"],
          ].map(([step, title, text]) => (
            <article key={step}>
              <span>{step}</span>
              <strong>{title}</strong>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <div className="quick-actions">
          <button onClick={() => navigateTo(selected ? `/chapters/${selected.id}` : "/chapters")}>
            <BookOpen size={16} /> 进入当前章节
          </button>
          <button onClick={() => navigateTo("/practice")}>
            <FileText size={16} /> 开始刷题
          </button>
          <button onClick={() => navigateTo("/wrong-questions")}>
            <XCircle size={16} /> 回看错题
          </button>
          <button onClick={() => navigateTo("/mock-exam")}>
            <Layers size={16} /> 模拟考试
          </button>
        </div>
      </section>

      <section className="student-section">
        <div className="section-title">
          <ClipboardList size={18} />
          <h2>课程章节</h2>
          <span className="pill">{chapters.length} 个章节</span>
          {chapters.length > 1 ? (
            <button onClick={() => setChapterListOpen((open) => !open)}>
              {chapterListOpen ? "收起章节" : "切换章节"}
            </button>
          ) : null}
        </div>
        <div className={`chapter-card-grid ${chapterListOpen ? "" : "compact"}`}>
          {visibleChapters.map((chapter) => (
            <article key={chapter.id} className={chapter.id === selected?.id ? "active" : ""}>
              <strong>{chapter.title}</strong>
              <p>{chapter.status || "待生成"}</p>
              <div className="chapter-card-meta">
                {chapter.id === selected?.id ? <span>{currentQuestions} 题</span> : null}
                {chapter.id === selected?.id && latestTeaching ? <span>已有教学页</span> : null}
              </div>
              <button onClick={() => openChapter(chapter.id)}>
                进入学习
              </button>
            </article>
          ))}
          {!chapters.length ? <div className="empty">暂无开放章节，请等待老师发布。</div> : null}
        </div>
      </section>
    </>
  );
}

function StudentInfoPanel({ title, icon, children }) {
  return (
    <section className="panel student-info">
      <div className="panel-title">
        {icon}
        <h3>{title}</h3>
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function QuestionCard({
  question,
  index,
  value,
  onChange,
  result,
  onSubmit,
  disabled,
  compactSubmit,
}) {
  const options = parseQuestionOptions(question.options);
  const isTrueFalseQuestion = /判断/.test(question.type || "");
  const isTextAnswer = !isTrueFalseQuestion && (!options.length || /简答|操作/.test(question.type || ""));
  return (
    <article className="question-card">
      <div className="question-meta">
        <span>{String(index).padStart(2, "0")}</span>
        <strong>{question.type || "题目"}</strong>
        {question.year ? <em>{question.year}</em> : null}
        {question.source ? <em>{question.source}</em> : null}
      </div>
      <h3>{question.stem}</h3>
      {isTrueFalseQuestion ? (
        <div className="true-false-grid">
          {[
            ["对", "✅ 正确"],
            ["错", "❌ 错误"],
          ].map(([answer, label]) => (
            <button
              key={answer}
              className={value === answer ? "selected" : ""}
              onClick={() => onChange(answer)}
              disabled={disabled}
            >
              {label}
            </button>
          ))}
        </div>
      ) : isTextAnswer ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="填写你的答案"
          disabled={disabled}
        />
      ) : (
        <div className="option-grid">
          {options.map((option) => {
            const key = optionKey(option);
            const selected = selectedAnswerIncludes(value, key);
            return (
              <button
                key={option}
                className={selected ? "selected" : ""}
                onClick={() => onChange(toggleOptionAnswer(value, key, question.type))}
                disabled={disabled}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}
      {!compactSubmit && !result ? (
        <button onClick={onSubmit} disabled={disabled || !String(value || "").trim()}>
          提交答案
        </button>
      ) : null}
      {result ? <AnswerResult result={result} /> : null}
    </article>
  );
}

function AnswerResult({ result }) {
  const isCorrect = Boolean(result.isCorrect);
  return (
    <div className={`answer-result ${isCorrect ? "correct" : "wrong"}`}>
      <strong>
        {isCorrect ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
        {isCorrect ? "回答正确" : "需要回看"}
      </strong>
      <p>你的答案：{result.selectedAnswer || "未记录"}</p>
      <p>正确答案：{isMissingAnswer(result.correctAnswer) ? "本题答案待老师补充" : result.correctAnswer}</p>
      <p>解析：{result.analysis || "暂无解析"}</p>
    </div>
  );
}

function isMissingAnswer(answer) {
  const value = String(answer || "").trim();
  return !value || value === "未填写" || value === "暂无";
}

function WrongQuestionCard({ question, index }) {
  return (
    <article className="question-card wrong-card">
      <div className="question-meta">
        <span>{String(index).padStart(2, "0")}</span>
        <strong>{question.type}</strong>
        <em>{question.chapter_title}</em>
        <em>错 {question.wrong_count} 次</em>
      </div>
      <h3>{question.stem}</h3>
      <p>你的答案：{question.last_selected_answer || "未记录"}</p>
      <p>正确答案：{question.answer || "未填写"}</p>
      <details className="md-details">
        <summary>查看解析</summary>
        <p>{question.analysis || "暂无解析"}</p>
      </details>
    </article>
  );
}

function MockResult({ result }) {
  return (
    <section className="mock-result">
      <div>
        <strong>{result.score}</strong>
        <span>分</span>
      </div>
      <p>
        共 {result.total} 题，答对 {result.correct} 题，答错 {result.wrong} 题。
      </p>
      {result.weakChapters?.length ? (
        <p>
          薄弱章节：
          {result.weakChapters.map((chapter) => `${chapter.title}（${chapter.wrongCount} 题）`).join("、")}
        </p>
      ) : (
        <p>本次没有明显薄弱章节。</p>
      )}
    </section>
  );
}

function ChapterPanels({ detail }) {
  return (
    <section className="inspector">
      <Panel title="原始页面" count={detail?.rawPages?.length || 0}>
        {detail?.rawPages?.map((page) => (
          <article key={page.id}>
            <strong>{page.title}</strong>
            <p>{page.source_name}</p>
            <p>{page.source_type === "notion-placeholder" ? "Notion 讲义占位页" : "Qwen Markdown 原始页"}</p>
            {page.notion_url ? (
              <a href={page.notion_url} target="_blank" rel="noreferrer">
                打开 Notion 原始页面
              </a>
            ) : null}
          </article>
        ))}
      </Panel>

      <Panel title="考点分析" count={detail?.outlines?.length || 0}>
        {detail?.outlines?.[0] ? <pre>{detail.outlines[0].key_points}</pre> : null}
      </Panel>

      <Panel title="真题" count={detail?.questions?.length || 0}>
        {detail?.questions?.slice(0, 8).map((question) => (
          <article key={question.id}>
            <strong>{question.type}</strong>
            <p>{question.stem}</p>
          </article>
        ))}
      </Panel>
    </section>
  );
}

function TeachingPreview({ latestTeaching }) {
  return (
    <section className="preview">
      <div className="section-title">
        <BookOpen size={18} />
        <h2>章节教学页预览</h2>
      </div>
      {latestTeaching ? (
        <MarkdownPreview markdown={latestTeaching.markdown} />
      ) : (
        <div className="empty">
          还没有教学页。AI 生成内容需要人工检查后再发布或导出。
        </div>
      )}
    </section>
  );
}

function MarkdownPreview({ markdown }) {
  return <div className="markdown-preview">{renderMarkdownBlocks(markdown)}</div>;
}

function renderMarkdownBlocks(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const blocks = [];
  let paragraph = [];

  function flushParagraph(key) {
    const text = paragraph.join("\n").trim();
    paragraph = [];
    if (text) {
      blocks.push(<p key={key}>{renderInline(text)}</p>);
    }
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trimEnd();
    if (!line.trim()) {
      flushParagraph(`p-${index}`);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushParagraph(`p-${index}`);
      blocks.push(<hr key={`hr-${index}`} className="slide-break" />);
      continue;
    }
    if (/^```/.test(line.trim())) {
      flushParagraph(`p-${index}`);
      const parsed = collectCodeBlock(lines, index);
      blocks.push(
        <pre key={`code-${index}`} className={parsed.lang === "mermaid" ? "md-mermaid" : ""}>
          <code>{parsed.body.join("\n")}</code>
        </pre>,
      );
      index = parsed.endIndex;
      continue;
    }
    if (isMarkdownTableStart(lines, index)) {
      flushParagraph(`p-${index}`);
      const parsed = collectMarkdownTable(lines, index);
      blocks.push(
        <div key={`table-${index}`} className="table-wrap">
          <table>
            <thead>
              <tr>{parsed.header.map((cell, cellIndex) => <th key={`h-${cellIndex}`}>{renderInline(cell)}</th>)}</tr>
            </thead>
            <tbody>
              {parsed.rows.map((row, rowIndex) => (
                <tr key={`r-${rowIndex}`}>
                  {parsed.header.map((_cell, cellIndex) => (
                    <td key={`c-${cellIndex}`}>{renderInline(row[cellIndex] || "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      index = parsed.endIndex;
      continue;
    }
    if (/^<details>\s*$/i.test(line.trim())) {
      flushParagraph(`p-${index}`);
      const parsed = collectDetails(lines, index);
      blocks.push(
        <details key={`details-${index}`} className="md-details">
          <summary>{parsed.summary}</summary>
          <div>{renderMarkdownBlocks(parsed.body.join("\n"))}</div>
        </details>,
      );
      index = parsed.endIndex;
      continue;
    }
    if (/^<columns>\s*$/i.test(line.trim())) {
      flushParagraph(`p-${index}`);
      const parsed = collectColumns(lines, index);
      blocks.push(
        <div key={`columns-${index}`} className="md-columns">
          {(parsed.columns.length ? parsed.columns : [[]]).map((column, columnIndex) => (
            <div key={`column-${columnIndex}`} className="md-column">
              {renderMarkdownBlocks(column.join("\n"))}
            </div>
          ))}
        </div>,
      );
      index = parsed.endIndex;
      continue;
    }
    if (/^<callout\b/i.test(line.trim())) {
      flushParagraph(`p-${index}`);
      const parsed = collectCallout(lines, index);
      blocks.push(
        <aside key={`callout-${index}`} className={`md-callout ${toToneClass(parsed.color)}`}>
          <span>{parsed.icon}</span>
          <div>{renderMarkdownBlocks(parsed.body.join("\n"))}</div>
        </aside>,
      );
      index = parsed.endIndex;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph(`p-${index}`);
      const level = heading[1].length;
      const content = renderInline(heading[2]);
      const HeadingTag = `h${Math.min(level, 6)}`;
      blocks.push(<HeadingTag key={`h-${index}`}>{content}</HeadingTag>);
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph(`p-${index}`);
      blocks.push(
        <ul key={`ul-${index}`}>
          <li>{renderInline(bullet[1])}</li>
        </ul>,
      );
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph("p-final");
  return blocks;
}

function isMarkdownTableStart(lines, index) {
  const header = lines[index]?.trim();
  const divider = lines[index + 1]?.trim();
  return isMarkdownTableRow(header) && isMarkdownTableDivider(divider);
}

function isMarkdownTableRow(line) {
  const text = String(line || "").trim();
  return text.includes("|") && splitMarkdownTableRow(text).length > 1;
}

function isMarkdownTableDivider(line) {
  const cells = splitMarkdownTableRow(line);
  return Boolean(
    cells.length > 1 &&
      cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, ""))),
  );
}

function splitMarkdownTableRow(line) {
  let text = String(line || "").trim();
  if (!text.includes("|")) return [];
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  return text.split("|").map((cell) => cell.trim());
}

function collectMarkdownTable(lines, startIndex) {
  const header = splitMarkdownTableRow(lines[startIndex]);
  const rows = [];
  let endIndex = startIndex + 1;
  for (let index = startIndex + 2; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!isMarkdownTableRow(line) || isMarkdownTableDivider(line)) break;
    rows.push(splitMarkdownTableRow(line));
    endIndex = index;
  }
  return { header, rows, endIndex };
}

function collectCodeBlock(lines, startIndex) {
  const opening = lines[startIndex].trim();
  const lang = opening.replace(/^```/, "").trim().toLowerCase();
  const body = [];
  let endIndex = startIndex;
  for (let index = startIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (/^```\s*$/.test(line.trim())) {
      endIndex = index;
      break;
    }
    body.push(line);
    endIndex = index;
  }
  return { lang, body, endIndex };
}

function collectColumns(lines, startIndex) {
  const columns = [];
  let current = null;
  let endIndex = startIndex;
  for (let index = startIndex + 1; index < lines.length; index++) {
    const line = lines[index].trimEnd();
    if (/^<\/columns>\s*$/i.test(line.trim())) {
      if (current) columns.push(current);
      endIndex = index;
      break;
    }
    if (/^<column>\s*$/i.test(line.trim())) {
      if (current) columns.push(current);
      current = [];
      endIndex = index;
      continue;
    }
    if (/^<\/column>\s*$/i.test(line.trim())) {
      if (current) columns.push(current);
      current = null;
      endIndex = index;
      continue;
    }
    if (current) current.push(line);
    endIndex = index;
  }
  if (current) columns.push(current);
  return { columns, endIndex };
}

function collectDetails(lines, startIndex) {
  let summary = "答案与解析";
  const body = [];
  let endIndex = startIndex;
  for (let index = startIndex + 1; index < lines.length; index++) {
    const line = lines[index].trimEnd();
    const summaryMatch = /^<summary>(.*?)<\/summary>\s*$/i.exec(line.trim());
    if (summaryMatch) {
      summary = summaryMatch[1] || summary;
      continue;
    }
    if (/^<\/details>\s*$/i.test(line.trim())) {
      endIndex = index;
      break;
    }
    body.push(line);
    endIndex = index;
  }
  return { summary, body, endIndex };
}

function collectCallout(lines, startIndex) {
  const opening = lines[startIndex].trim();
  const icon = /icon="([^"]+)"/i.exec(opening)?.[1] || "💡";
  const color = /color="([^"]+)"/i.exec(opening)?.[1] || "default";
  const openingRemainder = opening.replace(/^<callout\b[^>]*>/i, "").trim();
  const oneLine = /<\/callout>\s*$/i.test(openingRemainder);
  const body = openingRemainder
    ? [openingRemainder.replace(/<\/callout>\s*$/i, "").trim()].filter(Boolean)
    : [];
  let endIndex = startIndex;
  if (!oneLine) {
    for (let index = startIndex + 1; index < lines.length; index++) {
      const line = lines[index].trimEnd();
      if (/<\/callout>\s*$/i.test(line.trim())) {
        const beforeClose = line.replace(/<\/callout>\s*$/i, "").trim();
        if (beforeClose) body.push(beforeClose);
        endIndex = index;
        break;
      }
      body.push(line);
      endIndex = index;
    }
  }
  return { icon, color, body, endIndex };
}

function renderInline(text) {
  const nodes = [];
  const pattern =
    /<mark\s+color="([^"]+)">([\s\S]*?)<\/mark>|<span\s+color="([^"]+)">([\s\S]*?)<\/span>|\*\*([^*]+)\*\*/gi;
  let lastIndex = 0;
  let key = 0;
  for (const match of String(text || "").matchAll(pattern)) {
    if (match.index > lastIndex) {
      nodes.push(String(text).slice(lastIndex, match.index));
    }
    if (match[1] || match[3]) {
      nodes.push(
        <mark key={`mark-${key++}`} className={toToneClass(match[1] || match[3])}>
          {match[2] || match[4]}
        </mark>,
      );
    } else {
      nodes.push(<strong key={`strong-${key++}`}>{match[5]}</strong>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < String(text).length) {
    nodes.push(String(text).slice(lastIndex));
  }
  return nodes;
}

function parseQuestionOptions(options) {
  const value = String(options || "").trim();
  if (!value) return [];
  const lineItems = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (lineItems.length > 1) return lineItems;
  const matches = [...value.matchAll(/(?:^|\s)([A-H][\.．、]\s*[\s\S]*?)(?=\s+[A-H][\.．、]\s*|$)/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  return matches.length > 1 ? matches : [value];
}

function parseKnowledgeTags(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function splitTags(value) {
  return String(value || "")
    .split(/[,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionKey(option) {
  return /^[A-H]/i.exec(String(option || "").trim())?.[0]?.toUpperCase() || String(option || "").trim();
}

function selectedAnswerIncludes(answer, key) {
  return String(answer || "").toUpperCase().includes(String(key || "").toUpperCase());
}

function toggleOptionAnswer(currentAnswer, key, questionType) {
  const current = String(currentAnswer || "").toUpperCase();
  const normalizedKey = String(key || "").toUpperCase();
  if (!/多选/.test(questionType || "")) return normalizedKey;
  const values = new Set(current.match(/[A-H]/g) || []);
  if (values.has(normalizedKey)) values.delete(normalizedKey);
  else values.add(normalizedKey);
  return [...values].sort().join("");
}

function trialAnswerCorrect(selectedAnswer, correctAnswer) {
  const normalize = (answer) => {
    const raw = String(answer || "").trim();
    if (!raw) return "";
    const lower = raw.toLowerCase();
    if (/^(√|对|正确|true|t|yes|y)$/i.test(lower) || /^(√|对|正确)(?:\s|。|，|,|\.|（|\()/i.test(raw)) return "TRUE";
    if (/^(×|x|错|错误|false|f|no|n)$/i.test(lower) || /^(×|x|错|错误)(?:\s|。|，|,|\.|（|\()/i.test(raw)) return "FALSE";
    const letters = raw.toUpperCase().match(/[A-H]/g);
    if (letters?.length) return [...new Set(letters)].sort().join("");
    return raw.replace(/\s+/g, "").toUpperCase();
  };
  const expected = normalize(correctAnswer);
  return Boolean(expected && normalize(selectedAnswer) === expected);
}

function toToneClass(value) {
  const normalized = String(value || "default")
    .trim()
    .replace(/_bg$/i, "_background")
    .replace(/_/g, "-");
  return `tone-${normalized}`;
}

function FlowCard({ index, title, icon, children }) {
  return (
    <section className="flow-card">
      <div className="card-title">
        <span>{index}</span>
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Panel({ title, count, children }) {
  return (
    <section className="panel">
      <div className="panel-title">
        <FileText size={16} />
        <h3>{title}</h3>
        <span>{count}</span>
      </div>
      <div className="panel-body">{children || <p className="muted">暂无</p>}</div>
    </section>
  );
}

function FullPageMessage({ icon, title, description, action }) {
  return (
    <main className="auth-shell">
      <section className="auth-panel message-panel">
        <div className="message-icon">{icon}</div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {action}
      </section>
    </main>
  );
}

function statusText(status) {
  if (status === "approved") return "已通过";
  if (status === "rejected") return "已拒绝";
  return "待审核";
}

function chapterIdFromPath(pathname) {
  const match = /^\/chapters\/(\d+)/.exec(String(pathname || ""));
  return match ? Number(match[1]) : 0;
}

function routeToStudentTab(pathname) {
  const path = String(pathname || "/");
  if (path === "/practice") return "practice";
  if (path === "/wrong-questions") return "wrong";
  if (path === "/mock-exam") return "mock";
  if (path === "/resources") return "resources";
  return "learn";
}

function routeForStudentTab(tab, selectedId) {
  if (tab === "practice") return "/practice";
  if (tab === "wrong") return "/wrong-questions";
  if (tab === "mock") return "/mock-exam";
  if (tab === "resources") return "/resources";
  return selectedId ? `/chapters/${selectedId}` : "/chapters";
}

function studentPageTitle(pathname, selected) {
  const path = String(pathname || "/");
  if (path === "/student") return "学习首页";
  if (path === "/chapters") return "课程章节";
  if (path === "/practice") return "章节练习";
  if (path === "/wrong-questions") return "错题回看";
  if (path === "/mock-exam") return "模拟考试";
  if (path === "/resources") return "资料下载";
  return selected?.title || "章节学习";
}

createRoot(document.getElementById("root")).render(<App />);
