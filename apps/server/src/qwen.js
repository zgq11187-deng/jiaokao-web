import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { stripMarkdownFences } from "./markdown.js";

const IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i;

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".csv") return "text/csv";
  return "text/plain";
}

async function readPdfText(filePath) {
  const mod = await import("pdf-parse");
  const PDFParse = mod.default || mod.PDFParse || mod;
  const buffer = fs.readFileSync(filePath);
  if (typeof PDFParse === "function" && PDFParse.name !== "PDFParse") {
    const parsed = await PDFParse(buffer);
    return parsed.text || "";
  }
  const parser = new PDFParse(new Uint8Array(buffer));
  await parser.load();
  const result = await parser.getText();
  return result?.text || "";
}

export async function generateRawMarkdownWithQwen({ filePaths, prompt, title }) {
  if (!config.qwen.apiKey) throw new Error("QWEN_API_KEY 未配置");
  const inputPaths = filePaths.filter(Boolean);
  if (!inputPaths.length) throw new Error("未上传文件");
  inputPaths.forEach((file) => {
    if (!fs.existsSync(file)) throw new Error(`文件不存在: ${file}`);
  });

  const allImages = inputPaths.every((file) => IMAGE_RE.test(file));
  if (inputPaths.length > 1 && !allImages) {
    throw new Error("多文件上传仅支持图片；PDF/CSV/TXT/MD 每次只能上传 1 个");
  }

  const basePrompt =
    prompt ||
    `请将上传资料转写并整理为专升本《计算机应用基础》课程 Markdown 原始讲义。标题为：${title}。保留原始小节顺序、标题、表格和案例。直接输出 Markdown，不要解释。`;

  let content;
  if (allImages) {
    content = [
      { type: "text", text: basePrompt },
      ...inputPaths.map((file) => ({
        type: "image_url",
        image_url: {
          url: `data:${mimeFor(file)};base64,${fs.readFileSync(file).toString("base64")}`,
        },
      })),
    ];
  } else {
    const file = inputPaths[0];
    const ext = path.extname(file).toLowerCase();
    let text;
    if (ext === ".pdf") {
      text = await readPdfText(file);
      if (!text.trim()) {
        throw new Error("PDF 未提取到文本；扫描版 PDF 请转为图片上传");
      }
    } else {
      text = fs.readFileSync(file, "utf8");
    }
    content = `${basePrompt}\n\n--- 原始文本开始 ---\n${text.slice(0, 60000)}\n--- 原始文本结束 ---`;
  }

  const response = await fetch(
    `${config.qwen.baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.qwen.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.qwen.visionModel,
        messages: [
          {
            role: "system",
            content:
              "你是《计算机应用基础》课程原始讲义整理助手，只输出忠实、结构化的 Markdown。",
          },
          { role: "user", content },
        ],
        temperature: 0.2,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Qwen 调用失败: HTTP ${response.status} ${text.slice(0, 300)}`);
  }
  const data = await response.json();
  const markdown = data?.choices?.[0]?.message?.content;
  if (!markdown?.trim()) throw new Error("Qwen 未返回 Markdown 内容");
  return {
    markdown: stripMarkdownFences(markdown),
    model: data.model || config.qwen.visionModel,
    sourceName: inputPaths.map((file) => path.basename(file)).join("、"),
  };
}
