const MAX_RICH_TEXT = 1900;

export function stripMarkdownFences(value) {
  return String(value || "")
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function toRichText(content) {
  const text = String(content || "");
  if (!text) return [];
  return parseRichText(text).flatMap((part) => {
    const chunks = [];
    for (let i = 0; i < part.text.length; i += MAX_RICH_TEXT) {
      chunks.push({
        type: "text",
        text: { content: part.text.slice(i, i + MAX_RICH_TEXT) },
        annotations: part.annotations,
      });
    }
    return chunks;
  });
}

function parseRichText(text) {
  const parts = [];
  const pattern =
    /<mark\s+color="([^"]+)">([\s\S]*?)<\/mark>|<span\s+color="([^"]+)">([\s\S]*?)<\/span>|\*\*([^*]+)\*\*/gi;
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), annotations: {} });
    }
    if (match[1] || match[3]) {
      parts.push({
        text: match[2] || match[4] || "",
        annotations: { color: normalizeNotionColor(match[1] || match[3]) },
      });
    } else {
      parts.push({
        text: match[5] || "",
        annotations: { bold: true },
      });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), annotations: {} });
  }
  return parts.filter((part) => part.text);
}

function richTextBlock(type, text, extra = {}) {
  return {
    object: "block",
    type,
    [type]: {
      rich_text: toRichText(text).slice(0, 1),
      ...extra,
    },
  };
}

function textBlock(type, text) {
  return {
    object: "block",
    type,
    [type]: { rich_text: notionRichText(text) },
  };
}

function notionRichText(text) {
  return toRichText(text).slice(0, 100);
}

export function markdownToHtml(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const html = [];
  let paragraph = [];

  function flushParagraph() {
    const text = paragraph.join("\n").trim();
    paragraph = [];
    if (text) html.push(`<p>${renderInlineHtml(text)}</p>`);
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trimEnd();
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    if (/^```/.test(line.trim())) {
      flushParagraph();
      const parsed = collectHtmlCodeBlock(lines, index);
      html.push(parsed.html);
      index = parsed.endIndex;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      html.push('<hr class="slide-break">');
      continue;
    }
    if (isMarkdownTableStart(lines, index)) {
      flushParagraph();
      const parsed = collectMarkdownTable(lines, index);
      html.push(parsed.html);
      index = parsed.endIndex;
      continue;
    }
    if (/^<(table|tr|thead|tbody)\b/i.test(line.trim())) {
      flushParagraph();
      const parsed = collectHtmlTable(lines, index);
      html.push(parsed.html);
      index = parsed.endIndex;
      continue;
    }
    if (/^<details>\s*$/i.test(line.trim())) {
      flushParagraph();
      const parsed = collectHtmlDetails(lines, index);
      html.push(parsed.html);
      index = parsed.endIndex;
      continue;
    }
    if (/^<callout\b/i.test(line.trim())) {
      flushParagraph();
      const parsed = collectHtmlCallout(lines, index);
      html.push(parsed.html);
      index = parsed.endIndex;
      continue;
    }
    if (/^<columns>\s*$/i.test(line.trim())) {
      flushParagraph();
      const parsed = collectHtmlColumns(lines, index);
      html.push(parsed.html);
      index = parsed.endIndex;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = Math.min(heading[1].length, 4);
      html.push(`<h${level}>${renderInlineHtml(heading[2])}</h${level}>`);
      continue;
    }
    const quote = /^>\s?(.+)$/.exec(line);
    if (quote) {
      flushParagraph();
      html.push(`<blockquote>${renderInlineHtml(quote[1])}</blockquote>`);
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      html.push(`<ul><li>${renderInlineHtml(bullet[1])}</li></ul>`);
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return html.join("\n");
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
  const { header, rows, endIndex } = parseMarkdownTable(lines, startIndex);
  const head = `<tr>${header.map((cell) => `<th>${renderInlineHtml(cell)}</th>`).join("")}</tr>`;
  const body = rows
    .map((row) => {
      const normalized = header.map((_cell, index) => row[index] || "");
      return `<tr>${normalized.map((cell) => `<td>${renderInlineHtml(cell)}</td>`).join("")}</tr>`;
    })
    .join("");
  return {
    endIndex,
    html: `<div class="table-wrap"><table>${head}${body}</table></div>`,
  };
}

function parseMarkdownTable(lines, startIndex) {
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

function collectHtmlCodeBlock(lines, startIndex) {
  const parsed = collectCodeBlock(lines, startIndex);
  const code = escapeHtml(parsed.body.join("\n"));
  if (parsed.lang === "mermaid") {
    return { endIndex: parsed.endIndex, html: `<pre class="mermaid">${code}</pre>` };
  }
  return { endIndex: parsed.endIndex, html: `<pre><code>${code}</code></pre>` };
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

function collectHtmlTable(lines, startIndex) {
  const body = [];
  let endIndex = startIndex;
  for (let index = startIndex; index < lines.length; index++) {
    const line = lines[index].trimEnd();
    if (!line.trim()) {
      endIndex = index;
      break;
    }
    if (!/^<\/?(table|tr|th|td|thead|tbody)\b/i.test(line.trim())) {
      endIndex = index - 1;
      break;
    }
    body.push(line.trim());
    endIndex = index;
    if (/^<\/table>\s*$/i.test(line.trim())) break;
  }
  const raw = body.join("\n");
  const table = /^<table\b/i.test(raw)
    ? sanitizeSimpleTableHtml(raw)
    : `<table>${sanitizeSimpleTableHtml(raw)}</table>`;
  return { endIndex, html: `<div class="table-wrap">${table}</div>` };
}

function sanitizeSimpleTableHtml(value) {
  return escapeHtml(value)
    .replace(/&lt;(\/?)(table|thead|tbody|tr)&gt;/gi, "<$1$2>")
    .replace(/&lt;(th|td)&gt;([\s\S]*?)&lt;\/\1&gt;/gi, (_match, tag, body) => {
      return `<${tag}>${renderInlineHtml(unescapeHtml(body))}</${tag}>`;
    });
}

function collectHtmlDetails(lines, startIndex) {
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
  return {
    endIndex,
    html: `<details class="md-details"><summary>${escapeHtml(summary)}</summary>${markdownToHtml(body.join("\n"))}</details>`,
  };
}

function collectHtmlCallout(lines, startIndex) {
  const opening = lines[startIndex].trim();
  const icon = /icon="([^"]+)"/i.exec(opening)?.[1] || "💡";
  const color = normalizeCssColor(/color="([^"]+)"/i.exec(opening)?.[1]);
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
  return {
    endIndex,
    html: `<aside class="md-callout ${color}"><span>${escapeHtml(icon)}</span><div>${markdownToHtml(body.join("\n"))}</div></aside>`,
  };
}

function collectHtmlColumns(lines, startIndex) {
  const parsed = collectColumns(lines, startIndex);
  const columns = parsed.columns.length ? parsed.columns : [[]];
  return {
    endIndex: parsed.endIndex,
    html: `<div class="md-columns">${columns
      .map((column) => `<div class="md-column">${markdownToHtml(column.join("\n"))}</div>`)
      .join("")}</div>`,
  };
}

function renderInlineHtml(text) {
  return escapeHtml(text)
    .replace(/&lt;mark\s+color=&quot;([^&]+)&quot;&gt;([\s\S]*?)&lt;\/mark&gt;/gi, (_match, color, body) => {
      return `<mark class="${normalizeCssColor(color)}">${body}</mark>`;
    })
    .replace(/&lt;span\s+color=&quot;([^&]+)&quot;&gt;([\s\S]*?)&lt;\/span&gt;/gi, (_match, color, body) => {
      return `<span class="${normalizeCssColor(color)}">${body}</span>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function unescapeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function normalizeCssColor(value) {
  return `tone-${normalizeNotionColor(value).replace(/_/g, "-")}`;
}

function normalizeColorAlias(value) {
  const color = String(value || "default").trim();
  return color.replace(/_bg$/i, "_background");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlStyles() {
  return `
    :root{color-scheme:light;--bg:#f6f8fb;--paper:#fff;--ink:#162033;--muted:#64748b;--line:#dbe4ef;--brand:#2563eb;--brand-soft:#e8f1ff;--green:#0f9f6e;--red:#dc2626}
    *{box-sizing:border-box}
    html{scroll-behavior:smooth}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif;color:var(--ink);background:var(--bg);line-height:1.72}
    .hero{min-height:46vh;padding:56px clamp(24px,6vw,92px) 48px;background:linear-gradient(135deg,rgba(37,99,235,.94),rgba(15,23,42,.9)),radial-gradient(circle at 80% 15%,rgba(255,255,255,.25),transparent 28%);color:#fff;display:grid;align-content:end}
    .hero .eyebrow{font-size:15px;opacity:.82;margin-bottom:12px;letter-spacing:0}
    .hero h1{margin:0;max-width:1000px;font-size:clamp(36px,6vw,72px);line-height:1.08;letter-spacing:0}
    .hero p{max-width:760px;margin:20px 0 0;color:rgba(255,255,255,.86);font-size:18px}
    .layout{display:grid;grid-template-columns:minmax(220px,280px) minmax(0,1fr);gap:28px;max-width:1360px;margin:0 auto;padding:32px clamp(18px,4vw,48px) 80px}
    body.nav-collapsed .layout{grid-template-columns:minmax(0,1fr);max-width:1180px}
    body.nav-collapsed nav{display:none}
    .nav-toggle{position:fixed;top:16px;left:16px;z-index:20;border:1px solid rgba(255,255,255,.56);border-radius:8px;padding:8px 12px;background:rgba(255,255,255,.92);color:var(--brand);box-shadow:0 10px 24px rgba(15,23,42,.14);font:700 14px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif;cursor:pointer;backdrop-filter:blur(14px)}
    .nav-toggle:hover{background:#fff}
    body:not(.nav-collapsed) .nav-toggle{display:none}
    nav{position:sticky;top:18px;align-self:start;height:calc(100vh - 36px);overflow-y:scroll;overscroll-behavior:contain;background:rgba(255,255,255,.86);border:1px solid var(--line);border-radius:8px;padding:14px;backdrop-filter:blur(14px);scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:#94a3b8 transparent}
    nav::-webkit-scrollbar{width:8px}
    nav::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:999px}
    nav::-webkit-scrollbar-track{background:transparent}
    .nav-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
    nav h2{font-size:14px;margin:0;color:var(--muted)}
    .nav-hide{border:1px solid var(--line);border-radius:6px;padding:5px 8px;background:#fff;color:var(--brand);font:700 12px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif;cursor:pointer}
    .nav-hide:hover{background:var(--brand-soft)}
    nav a{display:grid;grid-template-columns:36px 1fr;gap:8px;align-items:start;padding:9px 8px;color:var(--ink);text-decoration:none;border-radius:6px;font-size:14px}
    nav a:hover{background:var(--brand-soft);color:var(--brand)}
    nav span{color:var(--brand);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
    main{min-width:0}
    .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:20px}
    .summary article,.lesson-section{background:var(--paper);border:1px solid var(--line);border-radius:8px;box-shadow:0 14px 36px rgba(15,23,42,.06)}
    .summary article{padding:20px 22px}
    .summary h3{margin:0 0 8px;font-size:18px}
    .summary p{margin:0;color:var(--muted)}
    .summary .table-wrap{margin:10px 0 0}
    .summary table{font-size:14px}
    .summary th,.summary td{padding:8px 10px}
    .lesson-section{padding:clamp(22px,4vw,42px);margin-bottom:22px;scroll-margin-top:24px}
    .section-kicker{color:var(--brand);font-weight:700;font-size:13px;margin-bottom:8px}
    .lesson-section h2{margin:0 0 20px;font-size:clamp(26px,3vw,38px);line-height:1.18;letter-spacing:0}
    .section-body h1,.section-body h2,.section-body h3,.section-body h4{margin:22px 0 10px;line-height:1.25}
    .section-body p{margin:10px 0}
    .section-body ul{margin:10px 0 12px 1.2em;padding:0}
    .section-body li{margin:7px 0}
    blockquote{margin:14px 0;padding:14px 16px;border-left:5px solid var(--brand);background:var(--brand-soft);border-radius:6px}
    details,.md-details{border:1px solid var(--line);border-radius:8px;padding:12px 16px;background:#fbfdff;margin:14px 0}
    summary{cursor:pointer;font-weight:700}
    .table-wrap{overflow-x:auto;margin:16px 0}
    table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden}
    th,td{border:1px solid var(--line);padding:10px 12px;vertical-align:top;text-align:left}
    th{background:var(--brand);color:#fff}
    .md-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin:16px 0}
    .md-column{min-width:0}
    pre{overflow-x:auto;padding:14px 16px;border-radius:8px;background:#0f172a;color:#e2e8f0;font-size:13px}
    .mermaid{background:#fff;color:var(--ink);border:1px solid var(--line)}
    .inline-code{background:#eef2ff;color:#3730a3;padding:1px 5px;border-radius:5px}
    .md-callout{display:flex;gap:12px;margin:16px 0;padding:14px 16px;border-radius:8px;border:1px solid var(--line);background:var(--brand-soft)}
    .md-callout>span{font-size:20px}
    .md-callout p{margin:0}
    mark,.tone-yellow-background{background:#fef3c7;color:#854d0e;padding:1px 4px;border-radius:4px}
    .tone-red-background{background:#fee2e2;color:#991b1b}.tone-orange-background{background:#ffedd5;color:#9a3412}.tone-blue-background{background:#dbeafe;color:#1e40af}.tone-green-background{background:#dcfce7;color:#166534}.tone-purple-background{background:#ede9fe;color:#5b21b6}.tone-pink-background{background:#fce7f3;color:#9d174d}.tone-gray-background{background:#f1f5f9;color:#334155}.tone-brown-background{background:#f5eee8;color:#6b3f2a}
    .tone-red,.text-red{color:var(--red);font-weight:700}.tone-green,.text-green{color:var(--green);font-weight:700}.tone-blue,.text-blue{color:var(--brand);font-weight:700}.tone-orange{color:#c2410c}.tone-yellow{color:#a16207}.tone-purple{color:#7e22ce}.tone-pink{color:#be185d}.tone-gray{color:#475569}.tone-brown{color:#7c2d12}
    footer{color:var(--muted);text-align:center;padding:0 20px 40px;font-size:13px}
    @media (max-width:860px){.layout{grid-template-columns:1fr}nav{position:static;height:auto;overflow:visible}.nav-toggle{top:12px;left:12px}.hero{min-height:38vh}}
  `;
}

export function htmlPage(title, markdown) {
  const escapedTitle = escapeHtml(title || "教学页");
  const sections = buildTeachingHtmlSections(markdown);
  const nav = sections
    .map((section, index) => `<a href="#${section.id}"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(section.title)}</a>`)
    .join("");
  const body = sections
    .map((section, index) => `
        <section class="lesson-section" id="${section.id}">
          <div class="section-kicker">模块 ${index + 1}</div>
          <h2>${escapeHtml(section.title)}</h2>
          <div class="section-body">${section.html}</div>
        </section>`)
    .join("\n");
  const summary = buildTeachingSummary(sections);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle} - 教学网站</title>
  <style>${htmlStyles()}</style>
</head>
<body>
  <button class="nav-toggle" type="button" aria-expanded="true" aria-controls="course-nav">隐藏目录</button>
  <header class="hero">
    <div class="eyebrow">计算机应用基础</div>
    <h1>${escapedTitle}</h1>
    <p>面向课堂讲授、学生复习和课后自测的单章教学页面。</p>
  </header>
  <div class="layout">
    <nav id="course-nav">
      <div class="nav-head">
        <h2>课程导航</h2>
        <button class="nav-hide" type="button" aria-controls="course-nav">隐藏</button>
      </div>
      ${nav}
    </nav>
    <main>
      ${summary}
      ${body}
    </main>
  </div>
  <footer>由计算机应用基础 · 教与学工作台生成</footer>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>if (window.mermaid) mermaid.initialize({ startOnLoad: true, theme: "default" });</script>
  <script>
    (function () {
      var button = document.querySelector(".nav-toggle");
      var hideButton = document.querySelector(".nav-hide");
      if (!button || !hideButton) return;
      function applyNavState(hidden) {
        document.body.classList.toggle("nav-collapsed", hidden);
        button.textContent = "显示目录";
        button.setAttribute("aria-expanded", hidden ? "false" : "true");
        hideButton.setAttribute("aria-expanded", hidden ? "false" : "true");
        try { window.localStorage.setItem("teaching-site-nav-hidden", hidden ? "1" : "0"); } catch (_err) {}
      }
      var initialHidden = false;
      try { initialHidden = window.localStorage.getItem("teaching-site-nav-hidden") === "1"; } catch (_err) {}
      applyNavState(initialHidden);
      button.addEventListener("click", function () {
        applyNavState(!document.body.classList.contains("nav-collapsed"));
      });
      hideButton.addEventListener("click", function () {
        applyNavState(true);
      });
    })();
  </script>
</body>
</html>`;
}

function buildTeachingHtmlSections(markdown) {
  const rawSections = String(markdown || "")
    .split(/\n---+\n?/g)
    .map((section) => section.trim())
    .filter(Boolean);
  const sections = rawSections.length ? rawSections : [String(markdown || "").trim()].filter(Boolean);
  const usedIds = new Set();
  return sections.map((section, index) => {
    const title = extractSectionTitle(section) || `模块 ${index + 1}`;
    const bodyMarkdown = stripFirstSectionHeading(section);
    const id = uniqueSlug(title, usedIds);
    return {
      id,
      title,
      markdown: bodyMarkdown || section,
      html: markdownToHtml(bodyMarkdown || section),
      plain: plainTextFromMarkdown(section),
    };
  });
}

function extractSectionTitle(section) {
  const heading = section.match(/^\s*#{1,6}\s+(.+)$/m);
  if (heading) return cleanupHeadingText(heading[1]);
  const firstLine = section.split(/\r?\n/).find((line) => line.trim());
  return cleanupHeadingText(firstLine || "");
}

function stripFirstSectionHeading(section) {
  return section.replace(/^\s*#{1,6}\s+.+\r?\n?/, "").trim();
}

function cleanupHeadingText(value) {
  return String(value || "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/[*_`#]/g, "")
    .trim();
}

function uniqueSlug(title, usedIds) {
  const base =
    String(title || "section")
      .trim()
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section";
  let id = base;
  let count = 2;
  while (usedIds.has(id)) {
    id = `${base}-${count}`;
    count++;
  }
  usedIds.add(id);
  return id;
}

function plainTextFromMarkdown(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTeachingSummary(sections) {
  const keySection = sections.find((section) => /重点/.test(section.title));
  const hardSection = sections.find((section) => /难点/.test(section.title));
  const cards = [
    {
      title: "教学重点",
      html: renderSummaryContent(
        keySection || sections.find((section) => /目标|脉络|结构/.test(section.title)),
      ),
    },
    {
      title: "学习难点",
      html: renderSummaryContent(
        hardSection || sections.find((section) => /真题|演练|易错/.test(section.title)),
      ),
    },
  ];
  return `<div class="summary">${cards
    .map((card) => `<article><h3>${escapeHtml(card.title)}</h3>${card.html}</article>`)
    .join("")}</div>`;
}

function renderSummaryContent(section) {
  if (!section) return "<p>请结合本节内容进行课堂讲授、学生复习和课后自测。</p>";
  if (containsMarkdownTable(section.markdown)) return markdownToHtml(section.markdown);
  return `<p>${escapeHtml(clipSummaryText(section.plain))}</p>`;
}

function containsMarkdownTable(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  return lines.some((_line, index) => isMarkdownTableStart(lines, index));
}

function clipSummaryText(value) {
  const text = String(value || "").trim();
  return text.length > 260 ? `${text.slice(0, 260)}...` : text;
}

export function mdToNotionBlocks(markdown) {
  return parseMarkdownLines(String(markdown || "").split(/\r?\n/), {
    allowContainers: true,
  });
}

function parseMarkdownLines(lines, options = {}) {
  const blocks = [];
  let paragraph = [];

  function flushParagraph() {
    const text = paragraph.join("\n").trim();
    paragraph = [];
    if (!text) return;
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: notionRichText(text) },
    });
  }

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    if (options.allowContainers && /^<details>\s*$/i.test(line.trim())) {
      flushParagraph();
      const parsed = collectDetails(lines, index);
      blocks.push(parsed.block);
      index = parsed.endIndex;
      continue;
    }
    if (options.allowContainers && /^<callout\b/i.test(line.trim())) {
      flushParagraph();
      const parsed = collectCallout(lines, index);
      blocks.push(parsed.block);
      index = parsed.endIndex;
      continue;
    }
    if (options.allowContainers && /^<columns>\s*$/i.test(line.trim())) {
      flushParagraph();
      const parsed = collectNotionColumns(lines, index);
      blocks.push(parsed.block);
      index = parsed.endIndex;
      continue;
    }
    if (/^```/.test(line.trim())) {
      flushParagraph();
      const parsed = collectNotionCodeBlock(lines, index);
      blocks.push(parsed.block);
      index = parsed.endIndex;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      blocks.push({ object: "block", type: "divider", divider: {} });
      continue;
    }
    if (isMarkdownTableStart(lines, index)) {
      flushParagraph();
      const parsed = collectNotionMarkdownTable(lines, index);
      blocks.push(parsed.block);
      index = parsed.endIndex;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      const headingLevel = heading[1].length;
      const type =
        headingLevel === 1
          ? "heading_1"
          : headingLevel === 2
            ? "heading_2"
            : "heading_3";
      blocks.push({
        object: "block",
        type,
        [type]: { rich_text: notionRichText(heading[2]) },
      });
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: notionRichText(bullet[1]) },
      });
      continue;
    }
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (numbered) {
      flushParagraph();
      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: { rich_text: notionRichText(numbered[1]) },
      });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
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
  return {
    endIndex,
    block: {
      object: "block",
      type: "toggle",
      toggle: {
        rich_text: notionRichText(summary),
        children: parseMarkdownLines(body, { allowContainers: false }).slice(0, 90),
      },
    },
  };
}

function collectCallout(lines, startIndex) {
  const opening = lines[startIndex].trim();
  const icon = /icon="([^"]+)"/i.exec(opening)?.[1] || "💡";
  const color = normalizeNotionColor(/color="([^"]+)"/i.exec(opening)?.[1]);
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
  const text = body.join("\n").trim();
  return {
    endIndex,
    block: {
      object: "block",
      type: "callout",
      callout: {
        rich_text: notionRichText(text || "提示"),
        icon: { type: "emoji", emoji: icon },
        color,
      },
    },
  };
}

function collectNotionCodeBlock(lines, startIndex) {
  const parsed = collectCodeBlock(lines, startIndex);
  const language = parsed.lang === "mermaid" ? "mermaid" : "plain text";
  return {
    endIndex: parsed.endIndex,
    block: {
      object: "block",
      type: "code",
      code: {
        rich_text: notionRichText(parsed.body.join("\n")),
        language,
      },
    },
  };
}

function collectNotionMarkdownTable(lines, startIndex) {
  const parsed = parseMarkdownTable(lines, startIndex);
  const width = Math.max(parsed.header.length, 1);
  const rows = [parsed.header, ...parsed.rows].map((row) => {
    const cells = Array.from({ length: width }, (_item, index) => notionRichText(row[index] || ""));
    return {
      object: "block",
      type: "table_row",
      table_row: { cells },
    };
  });
  return {
    endIndex: parsed.endIndex,
    block: {
      object: "block",
      type: "table",
      table: {
        table_width: width,
        has_column_header: true,
        has_row_header: false,
        children: rows.slice(0, 100),
      },
    },
  };
}

function collectNotionColumns(lines, startIndex) {
  const parsed = collectColumns(lines, startIndex);
  const children = parsed.columns
    .filter((column) => column.join("\n").trim())
    .slice(0, 4)
    .map((column) => ({
      object: "block",
      type: "column",
      column: {
        children: parseMarkdownLines(column, { allowContainers: true }).slice(0, 50),
      },
    }));
  if (children.length < 2) {
    return {
      endIndex: parsed.endIndex,
      block: {
        object: "block",
        type: "callout",
        callout: {
          rich_text: notionRichText(
            parsed.columns.flat().join("\n").trim() || "双栏内容格式不完整，请人工检查。",
          ),
          icon: { type: "emoji", emoji: "⚠️" },
          color: "yellow_background",
        },
      },
    };
  }
  return {
    endIndex: parsed.endIndex,
    block: {
      object: "block",
      type: "column_list",
      column_list: {
        children,
      },
    },
  };
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

function normalizeNotionColor(value) {
  const color = normalizeColorAlias(value);
  const allowed = new Set([
    "default",
    "gray",
    "brown",
    "orange",
    "yellow",
    "green",
    "blue",
    "purple",
    "pink",
    "red",
    "gray_background",
    "brown_background",
    "orange_background",
    "yellow_background",
    "green_background",
    "blue_background",
    "purple_background",
    "pink_background",
    "red_background",
  ]);
  return allowed.has(color) ? color : "default";
}
