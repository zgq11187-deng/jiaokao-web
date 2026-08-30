import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "./config.js";

export async function runCodexJson({ prompt, schemaPath, step }) {
  if (!isCodexExecutable(config.codex.bin)) {
    throw new Error(
      `Codex CLI 不存在: ${config.codex.bin}。请在 .env 中设置 CODEX_BIN，或将 codex 加入 PATH。macOS ChatGPT 的常见路径是 /Applications/ChatGPT.app/Contents/Resources/codex`,
    );
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `jiaokao-${step}-`));
  const outputPath = path.join(tmpDir, "result.json");
  const args = [
    "exec",
    "--cd",
    config.rootDir,
    "--sandbox",
    "read-only",
    "--output-schema",
    schemaPath,
    "-o",
    outputPath,
    "-",
  ];
  if (config.codex.model) args.splice(1, 0, "--model", config.codex.model);

  await new Promise((resolve, reject) => {
    const child = spawn(config.codex.bin, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Codex ${step} 超时`));
    }, config.codex.timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Codex ${step} 失败: ${stderr.slice(0, 1000)}`));
    });
    child.stdin.end(prompt);
  });

  const raw = fs.readFileSync(outputPath, "utf8").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Codex ${step} 输出不是 JSON`);
  }
}

function isCodexExecutable(bin) {
  const value = String(bin || "").trim();
  if (!value) return false;
  if (path.isAbsolute(value) || value.includes(path.sep)) {
    try {
      fs.accessSync(value, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  return String(process.env.PATH || "")
    .split(path.delimiter)
    .map((directory) => directory.trim())
    .filter(Boolean)
    .some((directory) => {
      try {
        fs.accessSync(path.join(directory, value), fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
}
