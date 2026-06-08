import { Client } from "@notionhq/client";
import { config } from "./config.js";
import { mdToNotionBlocks, toRichText } from "./markdown.js";

export const notion = config.notion.token
  ? new Client({ auth: config.notion.token })
  : null;

export function requireNotion() {
  if (!notion) throw new Error("NOTION_TOKEN 未配置");
  return notion;
}

export function getTitle(page, fallback = "") {
  for (const prop of Object.values(page?.properties || {})) {
    if (prop?.type === "title") {
      return prop.title?.map((t) => t.plain_text).join("") || fallback;
    }
  }
  return fallback;
}

export function propValue(page, name) {
  const prop = page?.properties?.[name];
  if (!prop) return "";
  switch (prop.type) {
    case "title":
      return prop.title?.map((t) => t.plain_text).join("") || "";
    case "rich_text":
      return prop.rich_text?.map((t) => t.plain_text).join("") || "";
    case "select":
      return prop.select?.name || "";
    case "status":
      return prop.status?.name || "";
    case "number":
      return prop.number == null ? "" : String(prop.number);
    case "checkbox":
      return Boolean(prop.checkbox);
    case "relation":
      return prop.relation?.map((r) => r.id) || [];
    case "files":
      return prop.files || [];
    case "date":
      return prop.date?.start || "";
    default:
      return "";
  }
}

export async function getDbProps(databaseId) {
  const client = requireNotion();
  const db = await client.databases.retrieve({ database_id: databaseId });
  return db.properties || {};
}

export function findTitleProp(props, fallback = "名称") {
  return (
    Object.entries(props).find(([, prop]) => prop.type === "title")?.[0] ||
    fallback
  );
}

export function setTitle(props, dbProps, name, value) {
  const prop = dbProps[name] ? name : findTitleProp(dbProps, name);
  props[prop] = { title: [{ type: "text", text: { content: String(value) } }] };
}

export function setRichText(props, dbProps, names, value) {
  const candidates = Array.isArray(names) ? names : [names];
  const name = candidates.find((n) => dbProps[n]?.type === "rich_text");
  if (name) props[name] = { rich_text: toRichText(value) };
}

export function setSelectLike(props, dbProps, names, value) {
  const candidates = Array.isArray(names) ? names : [names];
  const name = candidates.find((n) =>
    ["select", "status"].includes(dbProps[n]?.type),
  );
  if (!name || !value) return;
  props[name] =
    dbProps[name].type === "status"
      ? { status: { name: String(value) } }
      : { select: { name: String(value) } };
}

export function setRelation(props, dbProps, names, pageId) {
  const candidates = Array.isArray(names) ? names : [names];
  const name = candidates.find((n) => dbProps[n]?.type === "relation");
  if (name && pageId) props[name] = { relation: [{ id: pageId }] };
}

export function setRelations(props, dbProps, names, pageIds) {
  const candidates = Array.isArray(names) ? names : [names];
  const name = candidates.find((n) => dbProps[n]?.type === "relation");
  const ids = [...new Set((pageIds || []).filter(Boolean))];
  if (name && ids.length) {
    props[name] = { relation: ids.map((id) => ({ id })) };
  }
}

export function setMultiSelect(props, dbProps, names, values) {
  const candidates = Array.isArray(names) ? names : [names];
  const name = candidates.find((n) => dbProps[n]?.type === "multi_select");
  if (!name) return;
  const list = Array.isArray(values) ? values : String(values || "").split(/[，,]/);
  props[name] = {
    multi_select: list.filter(Boolean).map((item) => ({ name: String(item) })),
  };
}

export function findPropByType(dbProps, names, types) {
  const candidates = Array.isArray(names) ? names : [names];
  const allowedTypes = Array.isArray(types) ? types : [types];
  return candidates.find((name) => allowedTypes.includes(dbProps[name]?.type));
}

export function setCheckbox(props, dbProps, names, checked) {
  const name = findPropByType(dbProps, names, "checkbox");
  if (name) props[name] = { checkbox: Boolean(checked) };
}

export async function createChapter({ title, chapterNo, sectionNo }) {
  const client = requireNotion();
  if (!config.notion.chapterDbId) throw new Error("CHAPTER_DATABASE_ID 未配置");
  const dbProps = await getDbProps(config.notion.chapterDbId);
  const props = {};
  setTitle(props, dbProps, "章节名称", title);
  setRichText(props, dbProps, ["章"], chapterNo || "");
  setRichText(props, dbProps, ["节"], sectionNo || "");
  setSelectLike(props, dbProps, ["状态"], "待生成");
  setRelations(props, dbProps, ["关联大纲"], await findDefaultOutlinePageIds());
  return client.pages.create({
    parent: { database_id: config.notion.chapterDbId },
    properties: props,
  });
}

export async function queryChapterPages() {
  if (!config.notion.chapterDbId) return [];
  const client = requireNotion();
  const pages = [];
  let cursor;
  do {
    const response = await client.databases.query({
      database_id: config.notion.chapterDbId,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...response.results.filter((page) => page.object === "page"));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return pages;
}

export async function findDefaultOutlinePageIds() {
  if (!config.notion.outlineDbId) return [];
  const client = requireNotion();
  const response = await client.databases.query({
    database_id: config.notion.outlineDbId,
    page_size: 100,
  });
  const pages = response.results
    .filter((page) => page.object === "page")
    .map((page) => ({
      id: page.id,
      title: getTitle(page),
      version: propValue(page, "年份版本"),
      status: propValue(page, "状态"),
      note: propValue(page, "备注"),
    }));
  const newPage = pages.find((page) =>
    /2026|现行|新/.test(`${page.title} ${page.version} ${page.status}`),
  );
  const oldPage = pages.find((page) =>
    /2017|2025|历史|旧/.test(`${page.title} ${page.version} ${page.status}`),
  );
  return [oldPage?.id, newPage?.id].filter(Boolean);
}

export async function updateChapterOutline(pageId, result) {
  const client = requireNotion();
  const page = await client.pages.retrieve({ page_id: pageId });
  const dbProps = page.properties || {};
  const props = {};
  setRichText(props, dbProps, "新大纲考点", result.newOutlinePoints);
  setRichText(props, dbProps, "旧大纲考点", result.oldOutlinePoints);
  setSelectLike(props, dbProps, "大纲变化标记", result.changeType);
  setRichText(props, dbProps, "大纲变化说明", result.changeDescription);
  setRichText(props, dbProps, "重点", result.keyPoints);
  setRichText(props, dbProps, "难点", result.hardPoints);
  if (Object.keys(props).length) {
    await client.pages.update({ page_id: pageId, properties: props });
  }
}

export async function setChapterStatus(pageId, status) {
  const client = requireNotion();
  const page = await client.pages.retrieve({ page_id: pageId });
  const dbProps = page.properties || {};
  const props = {};
  setSelectLike(props, dbProps, "状态", status);
  if (Object.keys(props).length) {
    await client.pages.update({ page_id: pageId, properties: props });
  }
}

export async function updatePageCheckbox(pageId, names, checked) {
  const client = requireNotion();
  const page = await client.pages.retrieve({ page_id: pageId });
  const dbProps = page.properties || {};
  const props = {};
  setCheckbox(props, dbProps, names, checked);
  if (!Object.keys(props).length) return false;
  await client.pages.update({ page_id: pageId, properties: props });
  return true;
}

export async function addPageComment(pageId, message) {
  const client = requireNotion();
  return client.comments.create({
    parent: { page_id: pageId },
    rich_text: toRichText(message).slice(0, 100),
  });
}

export async function queryCheckboxTriggerPages(databaseId, checkboxNames) {
  if (!databaseId) return [];
  const client = requireNotion();
  const dbProps = await getDbProps(databaseId);
  const checkboxName = findPropByType(dbProps, checkboxNames, "checkbox");
  if (!checkboxName) return [];
  const pages = [];
  let cursor;
  do {
    const response = await client.databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      page_size: 50,
      filter: {
        property: checkboxName,
        checkbox: { equals: true },
      },
    });
    pages.push(...response.results.filter((item) => item.object === "page"));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return pages;
}

export async function createOriginalPage({ title, markdown, chapterPageId }) {
  const client = requireNotion();
  if (!config.notion.originalPageDbId)
    throw new Error("ORIGINAL_PAGE_DB_ID 未配置");
  const dbProps = await getDbProps(config.notion.originalPageDbId);
  const props = {};
  setTitle(props, dbProps, "标题", title);
  setSelectLike(props, dbProps, ["类型"], "原始课件");
  setRelation(props, dbProps, ["对应章节"], chapterPageId);
  const page = await client.pages.create({
    parent: { database_id: config.notion.originalPageDbId },
    properties: props,
    children: mdToNotionBlocks(markdown).slice(0, 90),
  });
  return page;
}

export async function findOriginalPageByTitleAndChapter({ title, chapterPageId }) {
  if (!config.notion.originalPageDbId || !title || !chapterPageId) return null;
  const client = requireNotion();
  const dbProps = await getDbProps(config.notion.originalPageDbId);
  const titleProp = findTitleProp(dbProps, "标题");
  const chapterProp = findPropByType(dbProps, ["对应章节", "章节"], "relation");
  if (!titleProp || !chapterProp) return null;
  const response = await client.databases.query({
    database_id: config.notion.originalPageDbId,
    page_size: 10,
    filter: {
      and: [
        {
          property: titleProp,
          title: { equals: String(title) },
        },
        {
          property: chapterProp,
          relation: { contains: chapterPageId },
        },
      ],
    },
  });
  return response.results.find((item) => item.object === "page") || null;
}

export async function createRawMaterialRecord({
  title,
  originalPageId,
  chapterPageId,
}) {
  const client = requireNotion();
  if (!config.notion.rawMaterialsDbId)
    throw new Error("RAW_MATERIALS_DATABASE_ID 未配置");
  const dbProps = await getDbProps(config.notion.rawMaterialsDbId);
  const props = {};
  setTitle(props, dbProps, "资料名称", title);
  setSelectLike(props, dbProps, ["类型"], "原始课件");
  setRelation(props, dbProps, ["讲义页面", "原始页面", "原始页"], originalPageId);
  setRelation(props, dbProps, ["对应章节", "章节"], chapterPageId);
  return client.pages.create({
    parent: { database_id: config.notion.rawMaterialsDbId },
    properties: props,
  });
}

export async function appendMarkdownToPage(pageId, markdown) {
  const client = requireNotion();
  const blocks = mdToNotionBlocks(markdown);
  for (let i = 0; i < blocks.length; i += 90) {
    await client.blocks.children.append({
      block_id: pageId,
      children: blocks.slice(i, i + 90),
    });
  }
  return blocks.length;
}

export async function replacePageMarkdown(pageId, markdown) {
  const client = requireNotion();
  let cursor;
  do {
    const response = await client.blocks.children.list({
      block_id: pageId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const block of response.results) {
      await client.blocks.delete({ block_id: block.id });
    }
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return appendMarkdownToPage(pageId, markdown);
}

export async function createExamQuestion(chapterPageId, question) {
  const client = requireNotion();
  if (!config.notion.examQuestionsDbId)
    throw new Error("EXAM_QUESTIONS_DATABASE_ID 未配置");
  const dbProps = await getDbProps(config.notion.examQuestionsDbId);
  const props = {};
  setTitle(props, dbProps, "题干", question.stem);
  setSelectLike(props, dbProps, "题型", question.type);
  setRichText(props, dbProps, ["选项", "备选项"], question.options);
  setRichText(props, dbProps, ["答案", "参考答案"], question.answer);
  setRichText(props, dbProps, ["解析", "答案解析"], question.analysis);
  setSelectLike(props, dbProps, "难度", question.difficulty);
  setRichText(props, dbProps, ["出处", "来源", "来源说明"], question.source);
  setSelectLike(props, dbProps, ["年份"], question.year);
  setMultiSelect(props, dbProps, ["知识点标签", "知识点", "标签"], question.knowledgeTags);
  setRelation(props, dbProps, ["所属章节", "对应章节", "章节"], chapterPageId);
  return client.pages.create({
    parent: { database_id: config.notion.examQuestionsDbId },
    properties: props,
  });
}

export async function linkExamQuestionToChapter(questionPageId, chapterPageId) {
  const client = requireNotion();
  const page = await client.pages.retrieve({ page_id: questionPageId });
  const dbProps = page.properties || {};
  const props = {};
  const relationNames = ["所属章节", "对应章节", "章节"];
  const relationName = relationNames.find((name) => dbProps[name]?.type === "relation");
  if (!relationName || !chapterPageId) return;
  const existing = propValue(page, relationName);
  setRelations(props, dbProps, relationName, [...existing, chapterPageId]);
  await client.pages.update({ page_id: questionPageId, properties: props });
}

export async function queryExamQuestionCandidates(limit = 100) {
  if (!config.notion.examQuestionsDbId) return [];
  const client = requireNotion();
  const candidates = [];
  let cursor;
  do {
    const response = await client.databases.query({
      database_id: config.notion.examQuestionsDbId,
      start_cursor: cursor,
      page_size: Math.min(100, limit - candidates.length),
    });
    for (const page of response.results.filter((item) => item.object === "page")) {
      candidates.push({
        pageId: page.id,
        url: page.url || null,
        stem: getTitle(page),
        type: propValue(page, "题型"),
        options: propValue(page, "选项"),
        answer: propValue(page, "答案"),
        analysis: propValue(page, "解析"),
        difficulty: propValue(page, "难度"),
        source: propValue(page, "出处"),
        year: propValue(page, "年份"),
        knowledgeTags:
          page.properties?.["知识点标签"]?.multi_select?.map((item) => item.name) || [],
      });
      if (candidates.length >= limit) break;
    }
    cursor = response.has_more && candidates.length < limit ? response.next_cursor : null;
  } while (cursor);
  return candidates;
}

export async function readPageMarkdown(pageId) {
  const client = requireNotion();
  return readBlockChildrenMarkdown(client, pageId);
}

async function readBlockChildrenMarkdown(client, blockId, depth = 0) {
  if (depth > 4) return "";
  const blocks = [];
  let cursor;
  do {
    const page = await client.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...page.results);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  const markdownBlocks = [];
  for (const block of blocks) {
    const markdown = await blockToMarkdown(client, block, depth);
    if (markdown) markdownBlocks.push(markdown);
  }
  return markdownBlocks.filter(Boolean).join("\n\n");
}

async function blockToMarkdown(client, block, depth) {
  const type = block.type;
  const value = block[type] || {};
  const text = value.rich_text?.map((t) => t.plain_text).join("") || "";
  if (!text && type === "divider") return "---";
  if (type === "heading_1") return `# ${text}`;
  if (type === "heading_2") return `## ${text}`;
  if (type === "heading_3") return `### ${text}`;
  if (type === "bulleted_list_item") return withChildren(client, block, `- ${text}`, depth);
  if (type === "numbered_list_item") return withChildren(client, block, `1. ${text}`, depth);
  if (type === "toggle") {
    const children = await readNestedChildren(client, block, depth);
    return `<details>\n<summary>${text || "详情"}</summary>\n\n${children}\n</details>`;
  }
  if (type === "callout") {
    const icon = value.icon?.emoji || "💡";
    const color = notionColorToBg(value.color || "default");
    const children = await readNestedChildren(client, block, depth);
    return `<callout icon="${icon}" color="${color}">\n${[text, children].filter(Boolean).join("\n")}\n</callout>`;
  }
  if (type === "code") {
    const language = value.language || "";
    const fence = language === "mermaid" ? "```mermaid" : "```";
    return `${fence}\n${text}\n\`\`\``;
  }
  if (type === "table") {
    const children = await readNestedBlocks(client, block, depth);
    return tableRowsToMarkdown(children);
  }
  if (type === "column_list") {
    const children = await readNestedBlocks(client, block, depth);
    const columns = [];
    for (const column of children.filter((child) => child.type === "column")) {
      columns.push(await readNestedChildren(client, column, depth));
    }
    return `<columns>\n${columns.map((column) => `<column>\n${column}\n</column>`).join("\n")}\n</columns>`;
  }
  if (type === "column") return readNestedChildren(client, block, depth);
  if (!text) return "";
  return withChildren(client, block, text, depth);
}

async function withChildren(client, block, markdown, depth) {
  const children = await readNestedChildren(client, block, depth);
  return [markdown, children].filter(Boolean).join("\n");
}

async function readNestedChildren(client, block, depth) {
  if (!block.has_children) return "";
  return readBlockChildrenMarkdown(client, block.id, depth + 1);
}

async function readNestedBlocks(client, block, depth) {
  if (!block.has_children || depth > 4) return [];
  const blocks = [];
  let cursor;
  do {
    const page = await client.blocks.children.list({
      block_id: block.id,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...page.results);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return blocks;
}

function tableRowsToMarkdown(rows) {
  const tableRows = rows
    .filter((row) => row.type === "table_row")
    .map((row) =>
      (row.table_row?.cells || []).map((cell) =>
        cell.map((part) => part.plain_text || "").join("").trim(),
      ),
    );
  if (!tableRows.length) return "";
  const width = Math.max(...tableRows.map((row) => row.length));
  const normalized = tableRows.map((row) => Array.from({ length: width }, (_item, index) => row[index] || ""));
  const header = normalized[0];
  const divider = header.map(() => "---");
  return [header, divider, ...normalized.slice(1)]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}

function notionColorToBg(color) {
  if (!color || color === "default") return "default";
  return color.endsWith("_background") ? color.replace(/_background$/, "_bg") : color;
}
