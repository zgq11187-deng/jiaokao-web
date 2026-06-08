import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { config } from "./config.js";

export async function runCodexJson({ prompt, schemaPath, step }) {
  if (!fs.existsSync(config.codex.bin)) {
    throw new Error(`Codex CLI 不存在: ${config.codex.bin}`);
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
