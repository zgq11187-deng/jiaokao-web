import PptxGenJS from "pptxgenjs";
import { htmlPage } from "./markdown.js";

export function buildMarkdownDownload(markdown) {
  return Buffer.from(markdown || "", "utf8");
}

export function buildHtmlDownload(title, markdown) {
  return Buffer.from(htmlPage(title, markdown), "utf8");
}

export async function buildPptx(title, markdown) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "教考智联 Web";
  pptx.subject = title;
  pptx.title = `${title} 教学课件`;
  pptx.defineLayout({ name: "LAYOUT_WIDE", width: 13.333, height: 7.5 });
  pptx.theme = {
    headFontFace: "Microsoft YaHei",
    bodyFontFace: "Microsoft YaHei",
    lang: "zh-CN",
  };

  const sections = parsePptSections(markdown);
  addPptCover(pptx, title);
  addPptAgenda(pptx, sections, title);
  sections.forEach((section) => addPptSection(pptx, section));

  return pptx.write({ outputType: "nodebuffer" });
}

const PPT = {
  width: 13.333,
  height: 7.5,
  marginX: 0.62,
  brand: "2563EB",
  brandDark: "102A56",
  brandSoft: "E8F1FF",
  ink: "111827",
  muted: "64748B",
  line: "DBE4EF",
  paper: "FFFFFF",
  bg: "F6F8FB",
  green: "059669",
  orange: "EA580C",
  red: "DC2626",
};

function parsePptSections(markdown) {
  return String(markdown || "")
    .split(/\n---+\n?/g)
    .map((raw, index) => normalizePptSection(raw, index))
    .filter((section) => section.raw);
}

function normalizePptSection(raw, index) {
  const content = String(raw || "").trim();
  const heading = content.match(/^\s*#{1,6}\s+(.+)$/m);
  const title = cleanPptText(heading?.[1] || `模块 ${index + 1}`);
  const body = heading ? content.replace(heading[0], "").trim() : content;
  return {
    index,
    raw: content,
    body,
    title,
    type: classifyPptSection(title, content),
    points: extractPptPoints(body),
    table: extractPptTable(body),
    details: extractPptDetails(body),
    code: extractPptCode(body),
  };
}

function classifyPptSection(title, raw) {
  const text = `${title}\n${raw}`;
  if (/目标|识记|领会|应用/.test(text)) return "goals";
  if (/结构图|知识结构|思维导图|mermaid|graph TD|graph LR/i.test(text)) return "structure";
  if (/重点.*难点|难点.*重点|对比/.test(text)) return "compare";
  if (/真题|演练|答案与解析|单选|多选|判断/.test(text)) return "practice";
  if (/小结|总结/.test(text)) return "summary";
  if (/作业|下节预告/.test(text)) return "homework";
  if (/教师备课卡|备课卡|建议课时|板书/.test(text)) return "teacher-card";
  return "lesson";
}

function addPptCover(pptx, title) {
  const slide = pptx.addSlide();
  slide.background = { color: PPT.brandDark };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: PPT.width,
    h: PPT.height,
    fill: { color: PPT.brandDark },
    line: { color: PPT.brandDark },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: PPT.width,
    h: 0.18,
    fill: { color: PPT.brand },
    line: { color: PPT.brand },
  });
  slide.addText("专升本《计算机应用基础》", {
    x: 0.82,
    y: 1.25,
    w: 5.8,
    h: 0.35,
    fontSize: 16,
    bold: true,
    color: "BFD7FF",
    margin: 0,
  });
  slide.addText(title || "章节教学课件", {
    x: 0.78,
    y: 2,
    w: 11.5,
    h: 1.35,
    fontSize: 34,
    bold: true,
    color: "FFFFFF",
    fit: "shrink",
    margin: 0,
  });
  slide.addText("课堂讲授 · 学生复习 · 课后自测", {
    x: 0.82,
    y: 3.55,
    w: 6.5,
    h: 0.4,
    fontSize: 17,
    color: "DCEBFF",
    margin: 0,
  });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: 0.82,
    y: 4.55,
    w: 3.15,
    h: 0.58,
    rectRadius: 0.08,
    fill: { color: PPT.brand },
    line: { color: PPT.brand },
  });
  slide.addText("教考智联工作台", {
    x: 1.05,
    y: 4.72,
    w: 2.7,
    h: 0.25,
    fontSize: 13,
    bold: true,
    color: "FFFFFF",
    margin: 0,
  });
  slide.addNotes(`${title || "章节教学课件"}\n\n本 PPT 由教考智联工作台根据已生成教学页导出。`);
}

function addPptAgenda(pptx, sections, title) {
  const slide = createPptBaseSlide(pptx, "课程目录", "从学习目标到课堂练习的完整讲授路径");
  const items = sections.slice(0, 12);
  const colW = 5.85;
  items.forEach((section, index) => {
    const col = index < 6 ? 0 : 1;
    const row = index % 6;
    const x = 0.86 + col * 6.1;
    const y = 1.55 + row * 0.78;
    slide.addText(String(index + 1).padStart(2, "0"), {
      x,
      y,
      w: 0.55,
      h: 0.28,
      fontSize: 13,
      bold: true,
      color: PPT.brand,
      margin: 0,
    });
    slide.addText(section.title, {
      x: x + 0.72,
      y: y - 0.02,
      w: colW - 0.72,
      h: 0.42,
      fontSize: 15,
      bold: true,
      color: PPT.ink,
      fit: "shrink",
      margin: 0,
    });
    slide.addShape(pptx.ShapeType.line, {
      x: x + 0.72,
      y: y + 0.52,
      w: colW - 0.8,
      h: 0,
      line: { color: PPT.line, transparency: 30 },
    });
  });
  slide.addNotes(`目录：${title || "章节教学课件"}\n${sections.map((section, index) => `${index + 1}. ${section.title}`).join("\n")}`);
}

function addPptSection(pptx, section) {
  if (section.type === "goals") return addGoalsSlide(pptx, section);
  if (section.type === "structure") return addStructureSlide(pptx, section);
  if (section.type === "compare") return addCompareSlide(pptx, section);
  if (section.type === "practice") return addPracticeSlide(pptx, section);
  if (section.type === "summary") return addSummarySlide(pptx, section);
  if (section.type === "homework") return addHomeworkSlide(pptx, section);
  if (section.type === "teacher-card") return addTeacherCardSlide(pptx, section);
  return addLessonSlides(pptx, section);
}

function createPptBaseSlide(pptx, title, kicker = "计算机应用基础") {
  const slide = pptx.addSlide();
  slide.background = { color: PPT.bg };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: PPT.width,
    h: PPT.height,
    fill: { color: PPT.bg },
    line: { color: PPT.bg },
  });
  slide.addText(kicker, {
    x: PPT.marginX,
    y: 0.42,
    w: 5,
    h: 0.24,
    fontSize: 11,
    bold: true,
    color: PPT.brand,
    margin: 0,
  });
  slide.addText(title, {
    x: PPT.marginX,
    y: 0.72,
    w: 10.5,
    h: 0.55,
    fontSize: 25,
    bold: true,
    color: PPT.ink,
    fit: "shrink",
    margin: 0,
  });
  return slide;
}

function addFooter(slide, section) {
  slide.addShape("line", {
    x: PPT.marginX,
    y: 7.05,
    w: 12.1,
    h: 0,
    line: { color: PPT.line, transparency: 25 },
  });
  slide.addText("教考智联 · 专升本《计算机应用基础》", {
    x: PPT.marginX,
    y: 7.16,
    w: 4.5,
    h: 0.18,
    fontSize: 8,
    color: PPT.muted,
    margin: 0,
  });
  slide.addText(section ? `模块 ${section.index + 1}` : "", {
    x: 11.2,
    y: 7.16,
    w: 1.45,
    h: 0.18,
    fontSize: 8,
    color: PPT.muted,
    align: "right",
    margin: 0,
  });
}

function addGoalsSlide(pptx, section) {
  const slide = createPptBaseSlide(pptx, section.title, "学习目标");
  const columns = [
    { label: "识记", color: PPT.brand, terms: ["识记"] },
    { label: "领会", color: PPT.green, terms: ["领会", "理解"] },
    { label: "应用", color: PPT.orange, terms: ["应用", "会用"] },
  ];
  columns.forEach((column, index) => {
    const x = 0.75 + index * 4.05;
    const points = pickPointsByTerms(section.points, column.terms);
    addInfoCard(slide, x, 1.65, 3.65, 4.55, column.label, points, column.color);
  });
  addFooter(slide, section);
  slide.addNotes(section.raw.slice(0, 5000));
}

function addStructureSlide(pptx, section) {
  const slide = createPptBaseSlide(pptx, section.title, "知识结构");
  const code = section.code || section.points.join("\n");
  const lines = code
    .split(/\r?\n/)
    .map((line) => cleanPptText(line).replace(/-->/g, "→").replace(/---/g, "→"))
    .filter(Boolean)
    .slice(0, 12);
  slide.addShape("roundRect", {
    x: 0.82,
    y: 1.5,
    w: 11.7,
    h: 4.9,
    rectRadius: 0.08,
    fill: { color: PPT.paper },
    line: { color: PPT.line },
    shadow: { type: "outer", color: "D0D7E2", opacity: 0.16, blur: 2, angle: 45, distance: 1 },
  });
  slide.addText(lines.join("\n"), {
    x: 1.05,
    y: 1.78,
    w: 11.2,
    h: 4.3,
    fontSize: 15,
    color: PPT.ink,
    breakLine: false,
    fit: "shrink",
    margin: 0.04,
    paraSpaceAfterPt: 9,
  });
  addFooter(slide, section);
  slide.addNotes(section.raw.slice(0, 5000));
}

function addCompareSlide(pptx, section) {
  const slide = createPptBaseSlide(pptx, section.title, "重点难点");
  if (section.table) {
    addPptTable(slide, section.table, 0.78, 1.55, 11.8, 0.56, 6);
  } else {
    const keyPoints = section.points.filter((point) => /重点|⭐|必背|掌握/.test(point)).slice(0, 5);
    const hardPoints = section.points.filter((point) => /难点|⚠|易错|混淆/.test(point)).slice(0, 5);
    addInfoCard(slide, 0.78, 1.6, 5.65, 4.75, "教学重点", keyPoints.length ? keyPoints : section.points.slice(0, 5), PPT.brand);
    addInfoCard(slide, 6.85, 1.6, 5.65, 4.75, "学习难点", hardPoints.length ? hardPoints : section.points.slice(5, 10), PPT.orange);
  }
  addFooter(slide, section);
  slide.addNotes(section.raw.slice(0, 5000));
}

function addPracticeSlide(pptx, section) {
  const slide = createPptBaseSlide(pptx, section.title, "真题演练");
  const details = section.details || "";
  const visibleText = cleanPptText(
    section.body
      .replace(/<details>[\s\S]*?<\/details>/gi, "")
      .replace(/<summary>[\s\S]*?<\/summary>/gi, ""),
  );
  const lines = visibleText
    .split(/\r?\n|(?=[A-E][.．、]\s)/)
    .map((line) => cleanPptText(line))
    .filter(Boolean)
    .slice(0, 9);
  slide.addShape("roundRect", {
    x: 0.78,
    y: 1.45,
    w: 8.05,
    h: 4.95,
    rectRadius: 0.08,
    fill: { color: PPT.paper },
    line: { color: PPT.line },
  });
  slide.addText(lines.join("\n"), {
    x: 1.05,
    y: 1.78,
    w: 7.5,
    h: 4.35,
    fontSize: 15,
    color: PPT.ink,
    fit: "shrink",
    margin: 0.02,
    paraSpaceAfterPt: 7,
  });
  slide.addShape("roundRect", {
    x: 9.08,
    y: 1.45,
    w: 3.45,
    h: 4.95,
    rectRadius: 0.08,
    fill: { color: "FFF7ED" },
    line: { color: "FED7AA" },
  });
  slide.addText("答案与解析", {
    x: 9.35,
    y: 1.75,
    w: 2.9,
    h: 0.3,
    fontSize: 15,
    bold: true,
    color: PPT.orange,
    margin: 0,
  });
  slide.addText(cleanPptText(details || "答案与解析已保留在备注区，课堂中建议先让学生独立作答。").slice(0, 520), {
    x: 9.35,
    y: 2.2,
    w: 2.85,
    h: 3.8,
    fontSize: 11.5,
    color: PPT.ink,
    fit: "shrink",
    margin: 0.02,
    breakLine: false,
  });
  addFooter(slide, section);
  slide.addNotes(section.raw.slice(0, 5000));
}

function addSummarySlide(pptx, section) {
  const slide = createPptBaseSlide(pptx, section.title, "课堂小结");
  const points = section.points.length ? section.points : cleanPptText(section.body).split(/[。；]/).filter(Boolean);
  points.slice(0, 6).forEach((point, index) => {
    const y = 1.55 + index * 0.75;
    slide.addShape("roundRect", {
      x: 0.85,
      y,
      w: 11.6,
      h: 0.52,
      rectRadius: 0.08,
      fill: { color: index % 2 ? PPT.paper : PPT.brandSoft },
      line: { color: PPT.line },
    });
    slide.addText(cleanPptText(point), {
      x: 1.15,
      y: y + 0.13,
      w: 10.85,
      h: 0.22,
      fontSize: 14,
      bold: index === 0,
      color: PPT.ink,
      fit: "shrink",
      margin: 0,
    });
  });
  addFooter(slide, section);
  slide.addNotes(section.raw.slice(0, 5000));
}

function addHomeworkSlide(pptx, section) {
  const slide = createPptBaseSlide(pptx, section.title, "课后巩固");
  const chunks = chunkArray(section.points.length ? section.points : cleanPptText(section.body).split(/\n+/), 4).slice(0, 3);
  const labels = ["必做", "选做", "下节预告"];
  chunks.forEach((items, index) => {
    addInfoCard(slide, 0.78 + index * 4.05, 1.55, 3.65, 4.9, labels[index] || `任务 ${index + 1}`, items, [PPT.brand, PPT.green, PPT.orange][index] || PPT.brand);
  });
  addFooter(slide, section);
  slide.addNotes(section.raw.slice(0, 5000));
}

function addTeacherCardSlide(pptx, section) {
  const slide = createPptBaseSlide(pptx, section.title, "教师备课");
  const points = section.points.length ? section.points : cleanPptText(section.body).split(/\n+/).filter(Boolean);
  const chunks = chunkArray(points, Math.ceil(Math.max(points.length, 1) / 4)).slice(0, 4);
  const labels = ["建议课时", "板书设计", "易错提示", "教学法建议"];
  chunks.forEach((items, index) => {
    const x = 0.78 + (index % 2) * 6.05;
    const y = 1.55 + Math.floor(index / 2) * 2.45;
    addInfoCard(slide, x, y, 5.65, 2.05, labels[index], items, [PPT.brand, PPT.green, PPT.orange, PPT.red][index]);
  });
  addFooter(slide, section);
  slide.addNotes(section.raw.slice(0, 5000));
}

function addLessonSlides(pptx, section) {
  const points = section.points.length ? section.points : cleanPptText(section.body).split(/\n+/).filter(Boolean);
  const chunks = chunkArray(points.length ? points : ["本页内容请结合备注区进行讲解。"], 5);
  chunks.forEach((items, chunkIndex) => {
    const slideTitle = chunkIndex ? `${section.title}（续 ${chunkIndex + 1}）` : section.title;
    const slide = createPptBaseSlide(pptx, slideTitle, "小节讲解");
    if (section.table && chunkIndex === 0) {
      addPptTable(slide, section.table, 0.78, 1.5, 11.8, 0.52, 6);
    } else {
      slide.addShape("roundRect", {
        x: 0.82,
        y: 1.55,
        w: 8.2,
        h: 4.9,
        rectRadius: 0.08,
        fill: { color: PPT.paper },
        line: { color: PPT.line },
      });
      addBulletList(slide, items, 1.12, 1.9, 7.55, 4.15);
      const callout = items.find((item) => /重点|难点|易错|口诀|考法/.test(item)) || items[0];
      slide.addShape("roundRect", {
        x: 9.35,
        y: 1.55,
        w: 3.0,
        h: 4.9,
        rectRadius: 0.08,
        fill: { color: PPT.brandSoft },
        line: { color: "BFD7FF" },
      });
      slide.addText("课堂提示", {
        x: 9.62,
        y: 1.87,
        w: 2.45,
        h: 0.3,
        fontSize: 15,
        bold: true,
        color: PPT.brand,
        margin: 0,
      });
      slide.addText(cleanPptText(callout).slice(0, 360), {
        x: 9.62,
        y: 2.35,
        w: 2.45,
        h: 3.5,
        fontSize: 12.5,
        color: PPT.ink,
        fit: "shrink",
        margin: 0.02,
      });
    }
    addFooter(slide, section);
    slide.addNotes(section.raw.slice(0, 5000));
  });
}

function addInfoCard(slide, x, y, w, h, title, points, color) {
  slide.addShape("roundRect", {
    x,
    y,
    w,
    h,
    rectRadius: 0.08,
    fill: { color: PPT.paper },
    line: { color: PPT.line },
    shadow: { type: "outer", color: "D0D7E2", opacity: 0.12, blur: 2, angle: 45, distance: 1 },
  });
  slide.addShape("rect", {
    x,
    y,
    w,
    h: 0.12,
    fill: { color },
    line: { color },
  });
  slide.addText(title, {
    x: x + 0.24,
    y: y + 0.28,
    w: w - 0.48,
    h: 0.34,
    fontSize: 16,
    bold: true,
    color,
    margin: 0,
  });
  addBulletList(slide, points?.length ? points.slice(0, 5) : ["待补充"], x + 0.28, y + 0.84, w - 0.56, h - 1.05, 12.5);
}

function addBulletList(slide, points, x, y, w, h, fontSize = 14) {
  const text = points
    .map((point) => `• ${cleanPptText(point)}`)
    .filter(Boolean)
    .join("\n");
  slide.addText(text || "• 待补充", {
    x,
    y,
    w,
    h,
    fontSize,
    color: PPT.ink,
    breakLine: false,
    fit: "shrink",
    margin: 0.02,
    paraSpaceAfterPt: 9,
  });
}

function addPptTable(slide, table, x, y, w, rowH = 0.5, maxRows = 6) {
  const headers = table.headers.slice(0, 5);
  const rows = table.rows.slice(0, maxRows);
  const colW = w / Math.max(headers.length, 1);
  headers.forEach((header, index) => {
    slide.addShape("rect", {
      x: x + index * colW,
      y,
      w: colW,
      h: rowH,
      fill: { color: PPT.brand },
      line: { color: PPT.paper, transparency: 8 },
    });
    slide.addText(cleanPptText(header), {
      x: x + index * colW + 0.08,
      y: y + 0.12,
      w: colW - 0.16,
      h: rowH - 0.16,
      fontSize: 11.5,
      bold: true,
      color: PPT.paper,
      fit: "shrink",
      margin: 0,
    });
  });
  rows.forEach((row, rowIndex) => {
    headers.forEach((_header, colIndex) => {
      const cy = y + (rowIndex + 1) * rowH;
      slide.addShape("rect", {
        x: x + colIndex * colW,
        y: cy,
        w: colW,
        h: rowH,
        fill: { color: rowIndex % 2 ? "FFFFFF" : "F8FAFC" },
        line: { color: PPT.line },
      });
      slide.addText(cleanPptText(row[colIndex] || ""), {
        x: x + colIndex * colW + 0.08,
        y: cy + 0.1,
        w: colW - 0.16,
        h: rowH - 0.14,
        fontSize: 10.5,
        color: PPT.ink,
        fit: "shrink",
        margin: 0,
      });
    });
  });
  if (table.rows.length > rows.length) {
    slide.addText(`另有 ${table.rows.length - rows.length} 行内容已保留在备注区`, {
      x,
      y: y + (rows.length + 1) * rowH + 0.15,
      w,
      h: 0.22,
      fontSize: 10,
      color: PPT.muted,
      margin: 0,
    });
  }
}

function extractPptPoints(markdown) {
  const cleaned = removePptBlocks(markdown);
  const points = [];
  cleaned.split(/\r?\n/).forEach((line) => {
    const text = line.trim();
    if (!text || isMarkdownTableLine(text)) return;
    const bullet = /^[-*]\s+(.+)$/.exec(text) || /^\d+[.)]\s+(.+)$/.exec(text);
    if (bullet) {
      points.push(cleanPptText(bullet[1]));
      return;
    }
    if (/^#{1,6}\s+/.test(text)) return;
    if (text.length > 10) points.push(cleanPptText(text));
  });
  return dedupePptPoints(points).slice(0, 24);
}

function extractPptTable(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index++) {
    const header = splitPptTableRow(lines[index]);
    const divider = splitPptTableRow(lines[index + 1]);
    if (header.length > 1 && divider.length === header.length && divider.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")))) {
      const rows = [];
      for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex++) {
        const row = splitPptTableRow(lines[rowIndex]);
        if (row.length < 2) break;
        rows.push(row);
      }
      return { headers: header, rows };
    }
  }
  const htmlRows = [...String(markdown || "").matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  if (htmlRows.length) {
    const rows = htmlRows.map((match) => [...match[1].matchAll(/<(th|td)>([\s\S]*?)<\/\1>/gi)].map((cell) => cleanPptText(cell[2])));
    return { headers: rows[0] || [], rows: rows.slice(1) };
  }
  return null;
}

function extractPptDetails(markdown) {
  const match = /<details>[\s\S]*?<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/i.exec(String(markdown || ""));
  return match ? `${cleanPptText(match[1])}\n${cleanPptText(match[2])}` : "";
}

function extractPptCode(markdown) {
  const match = /```(?:mermaid)?\s*([\s\S]*?)```/i.exec(String(markdown || ""));
  return match ? match[1].trim() : "";
}

function removePptBlocks(markdown) {
  return String(markdown || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<details>[\s\S]*?<\/details>/gi, "")
    .replace(/<table>[\s\S]*?<\/table>/gi, "")
    .replace(/<tr>[\s\S]*?<\/tr>/gi, "");
}

function splitPptTableRow(line) {
  let text = String(line || "").trim();
  if (!text.includes("|")) return [];
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  return text.split("|").map((cell) => cell.trim());
}

function isMarkdownTableLine(text) {
  return splitPptTableRow(text).length > 1;
}

function cleanPptText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?summary>/gi, "")
    .replace(/<\/?details>/gi, "")
    .replace(/<\/?callout[^>]*>/gi, "")
    .replace(/<\/?mark[^>]*>/gi, "")
    .replace(/<\/?span[^>]*>/gi, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickPointsByTerms(points, terms) {
  const picked = points.filter((point) => terms.some((term) => point.includes(term)));
  return picked.length ? picked : points.slice(0, 5);
}

function dedupePptPoints(points) {
  const seen = new Set();
  return points.filter((point) => {
    const key = point.slice(0, 80);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function chunkArray(items, size) {
  const chunks = [];
  const safeSize = Math.max(size || 1, 1);
  for (let index = 0; index < items.length; index += safeSize) {
    chunks.push(items.slice(index, index + safeSize));
  }
  return chunks.length ? chunks : [[]];
}

export function buildQuestionBankHtml(title, questions) {
  const typeOrder = ["单选题", "多选题", "判断题", "简答题", "操作题"];
  const typeLabels = {
    单选题: "一、单选",
    多选题: "二、多选",
    判断题: "三、判断",
    简答题: "四、简答",
    操作题: "五、操作",
  };
  const normalizedQuestions = (questions || []).map(normalizeQuestionForExport);
  const groups = Object.fromEntries(typeOrder.map((type) => [type, []]));
  normalizedQuestions.forEach((question) => {
    const type = typeOrder.includes(question.type) ? question.type : "简答题";
    groups[type].push({ ...question, type });
  });
  const total = normalizedQuestions.length;
  const stats = typeOrder
    .map((type) => `<span>${escapeHtml(type)} ${groups[type].length}</span>`)
    .join("");
  const tabs = [
    `<button class="type-tab active" data-type="全部">全部 <span>${total}</span></button>`,
    ...typeOrder.map(
      (type) =>
        `<button class="type-tab" data-type="${escapeHtml(type)}">${escapeHtml(typeLabels[type])} <span>${groups[type].length}</span></button>`,
    ),
  ].join("");
  const sections = typeOrder
    .map((type) => renderQuestionTypeSection(type, groups[type], typeLabels[type]))
    .join("");
  const emptyBank = total
    ? ""
    : `<div class="empty-bank">当前章节还没有可导出的题目。请先执行 B 真题自动入库，或在题库中关联本章节。</div>`;

  return Buffer.from(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - 单章题库</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fb;
      --paper: #ffffff;
      --ink: #111827;
      --muted: #64748b;
      --line: #dbe4ef;
      --brand: #2563eb;
      --brand-soft: #e8f1ff;
      --green: #059669;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif;
      line-height: 1.68;
    }
    header {
      padding: 44px clamp(20px, 6vw, 84px) 30px;
      background: #fff;
      border-bottom: 1px solid var(--line);
    }
    .eyebrow { color: var(--brand); font-weight: 800; margin-bottom: 10px; }
    h1 {
      margin: 0;
      font-size: clamp(34px, 5vw, 60px);
      line-height: 1.08;
      letter-spacing: 0;
    }
    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 22px;
    }
    .stats span {
      border: 1px solid var(--line);
      background: var(--brand-soft);
      color: var(--brand);
      border-radius: 999px;
      padding: 6px 12px;
      font-weight: 700;
      font-size: 14px;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto;
      gap: 14px;
      padding: 14px clamp(18px, 5vw, 64px);
      background: rgba(245,247,251,.9);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(14px);
    }
    .search {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 12px;
      font: inherit;
      background: #fff;
    }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }
    .type-tab {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 9px 12px;
      background: #fff;
      color: var(--ink);
      cursor: pointer;
      font-weight: 800;
    }
    .type-tab.active {
      background: var(--brand);
      border-color: var(--brand);
      color: #fff;
    }
    .type-tab span { opacity: .72; margin-left: 4px; }
    main {
      max-width: 1120px;
      margin: 0 auto;
      padding: 28px clamp(18px, 4vw, 42px) 70px;
    }
    .type-section { margin-bottom: 26px; }
    .section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }
    .section-head p {
      margin: 0;
      font-size: 24px;
      font-weight: 900;
    }
    .section-head span { color: var(--muted); font-weight: 700; }
    .question-card {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 20px 22px;
      margin-bottom: 14px;
      box-shadow: 0 14px 34px rgba(15, 23, 42, .06);
    }
    .question-card.is-hidden,
    .type-section.is-hidden { display: none; }
    .question-top {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }
    .q-index {
      color: var(--brand);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 900;
    }
    .q-type {
      border-radius: 999px;
      background: var(--brand-soft);
      color: var(--brand);
      padding: 3px 9px;
      font-size: 13px;
      font-weight: 800;
    }
    .question-card h3 {
      margin: 0 0 12px;
      font-size: 20px;
      line-height: 1.55;
    }
    .options {
      margin: 10px 0 12px;
      padding-left: 0;
      list-style: none;
      display: grid;
      gap: 8px;
    }
    .options li {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 9px 12px;
      background: #fbfdff;
    }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
    .tags span {
      background: #ecfdf5;
      color: var(--green);
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 12px;
      font-weight: 800;
    }
    .meta {
      margin: 10px 0;
      color: var(--muted);
      font-size: 14px;
    }
    details {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    summary { cursor: pointer; color: var(--brand); font-weight: 900; }
    .answer p { margin: 8px 0 0; }
    .empty-type {
      border: 1px dashed var(--line);
      border-radius: 8px;
      padding: 18px;
      color: var(--muted);
      background: #fff;
    }
    .empty-bank {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 24px;
      color: var(--muted);
    }
    footer {
      color: var(--muted);
      text-align: center;
      padding: 0 20px 36px;
      font-size: 13px;
    }
    @media (max-width: 760px) {
      .toolbar { grid-template-columns: 1fr; }
      .tabs { justify-content: flex-start; }
      .question-card { padding: 18px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">计算机应用基础</div>
    <h1>${escapeHtml(title)} · 单章题库</h1>
    <div class="stats">
      <span>总题数 ${total}</span>
      ${stats}
    </div>
  </header>
  <div class="toolbar">
    <input class="search" type="search" placeholder="搜索题干、答案、解析、来源或知识点">
    <div class="tabs">${tabs}</div>
  </div>
  <main>
    ${emptyBank}
    ${sections}
  </main>
  <footer>由计算机应用基础 · 教与学工作台生成</footer>
  <script>
    (function () {
      var activeType = "全部";
      var search = document.querySelector(".search");
      var tabs = Array.prototype.slice.call(document.querySelectorAll(".type-tab"));
      var cards = Array.prototype.slice.call(document.querySelectorAll(".question-card"));
      var sections = Array.prototype.slice.call(document.querySelectorAll(".type-section"));

      function applyFilters() {
        var keyword = search ? search.value.trim().toLowerCase() : "";
        cards.forEach(function (card) {
          var typeOk = activeType === "全部" || card.getAttribute("data-type") === activeType;
          var text = (card.getAttribute("data-search") || "").toLowerCase();
          var searchOk = !keyword || text.indexOf(keyword) >= 0;
          card.classList.toggle("is-hidden", !(typeOk && searchOk));
        });
        sections.forEach(function (section) {
          var sectionType = section.getAttribute("data-section-type") || "";
          var typeSectionOk = activeType === "全部" || sectionType === activeType;
          var visible = Array.prototype.some.call(section.querySelectorAll(".question-card"), function (card) {
            return !card.classList.contains("is-hidden");
          });
          var hasCards = section.querySelectorAll(".question-card").length > 0;
          section.classList.toggle("is-hidden", !typeSectionOk || (hasCards && !visible));
        });
      }

      tabs.forEach(function (tab) {
        tab.addEventListener("click", function () {
          activeType = tab.getAttribute("data-type") || "全部";
          tabs.forEach(function (item) { item.classList.toggle("active", item === tab); });
          applyFilters();
        });
      });
      if (search) search.addEventListener("input", applyFilters);
      applyFilters();
    })();
  </script>
</body>
</html>`, "utf8");
}

function renderQuestionTypeSection(type, questions, displayType = type) {
  const content = questions.length
    ? questions.map((question, index) => renderQuestionCard(question, index)).join("")
    : `<div class="empty-type">本章节暂无${escapeHtml(displayType)}</div>`;
  return `<section class="type-section" data-section-type="${escapeHtml(type)}">
    <div class="section-head">
      <p>${escapeHtml(displayType)}</p>
      <span>${questions.length} 题</span>
    </div>
    ${content}
  </section>`;
}

function renderQuestionCard(question, index) {
  const meta = [
    question.difficulty ? `难度：${question.difficulty}` : "",
    question.year ? `年份：${question.year}` : "",
    question.source ? `来源：${question.source}` : "",
  ].filter(Boolean).join(" · ");
  const options = question.optionsList.length
    ? `<ol class="options">${question.optionsList.map((option) => `<li>${escapeHtml(option)}</li>`).join("")}</ol>`
    : "";
  const tags = question.knowledgeTags.length
    ? `<div class="tags">${question.knowledgeTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`
    : "";
  const searchText = [
    question.stem,
    question.optionsList.join(" "),
    question.answer,
    question.analysis,
    question.source,
    question.knowledgeTags.join(" "),
  ].join(" ");
  return `<article class="question-card" data-type="${escapeHtml(question.type)}" data-search="${escapeHtml(searchText)}">
    <div class="question-top">
      <span class="q-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="q-type">${escapeHtml(question.type)}</span>
    </div>
    <h3>${escapeHtml(question.stem || "未填写题干")}</h3>
    ${options}
    ${tags}
    ${meta ? `<p class="meta">${escapeHtml(meta)}</p>` : ""}
    <details>
      <summary>答案与解析</summary>
      <div class="answer">
        <p><strong>答案：</strong>${escapeHtml(question.answer || "未填写")}</p>
        <p><strong>解析：</strong>${escapeHtml(question.analysis || "未填写")}</p>
      </div>
    </details>
  </article>`;
}

function normalizeQuestionForExport(question) {
  return {
    ...question,
    type: String(question?.type || "简答题").trim() || "简答题",
    stem: String(question?.stem || "").trim(),
    optionsList: parseQuestionOptions(question?.options),
    answer: String(question?.answer || "").trim(),
    analysis: String(question?.analysis || "").trim(),
    difficulty: String(question?.difficulty || "").trim(),
    source: String(question?.source || "").trim(),
    year: String(question?.year || "").trim(),
    knowledgeTags: parseKnowledgeTags(question?.knowledge_tags_json),
  };
}

function parseQuestionOptions(options) {
  const value = String(options || "").trim();
  if (!value) return [];
  const lineItems = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (lineItems.length > 1) return lineItems;
  const matches = [...value.matchAll(/(?:^|\s)([A-Z][\.．、]\s*[\s\S]*?)(?=\s+[A-Z][\.．、]\s*|$)/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  return matches.length > 1 ? matches : [value];
}

function parseKnowledgeTags(json) {
  try {
    const value = JSON.parse(json || "[]");
    return Array.isArray(value)
      ? value.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
