import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { downloadImage } from "./image-download.js";

export function migrateChapterImages(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS chapter_images (
    id TEXT PRIMARY KEY,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id),
    notion_block_id TEXT NOT NULL,
    source_modified TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    mime TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    filename TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS chapter_images_source ON chapter_images(chapter_id, notion_block_id, source_modified);`);
}

export function createImageStore(db, directory) {
  // Resolve trusted parent aliases (macOS /var -> /private/var), but not the cache itself.
  const absolute = path.resolve(directory);
  const root = path.join(fs.realpathSync(path.dirname(absolute)), path.basename(absolute));
  function filePath(image) {
    if (!image || !/^[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(image.filename)) return null;
    const target = path.join(root, image.filename);
    try {
      if (!fs.lstatSync(target).isFile() || fs.realpathSync(target) !== target || fs.realpathSync(root) !== root) return null;
      return target;
    } catch { return null; }
  }
  return {
    filePath,
    find(chapterId, blockId, modified) {
      const rows = db.prepare(`SELECT * FROM chapter_images WHERE chapter_id=? AND notion_block_id=? ORDER BY rowid DESC`).all(chapterId, blockId);
      return rows.find((row) => (modified === undefined || row.source_modified === modified) && filePath(row));
    },
    get(chapterId, id) { return db.prepare("SELECT * FROM chapter_images WHERE chapter_id=? AND id=?").get(chapterId, id); },
    save(chapterId, block, image) {
      fs.mkdirSync(root, { recursive: true, mode: 0o700 });
      if (fs.realpathSync(root) !== root) throw new Error("图片缓存目录不允许符号链接");
      const sha256 = createHash("sha256").update(image.bytes).digest("hex");
      const filename = `${sha256}.${image.extension}`;
      const target = path.join(root, filename);
      if (!filePath({ filename })) {
        if (fs.existsSync(target)) throw new Error("图片缓存路径无效");
        const temporary = path.join(root, `${randomUUID()}.tmp`);
        try {
          fs.writeFileSync(temporary, image.bytes, { flag: "wx", mode: 0o600 });
          fs.renameSync(temporary, target);
        } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
      }
      const id = randomUUID();
      db.prepare(`INSERT INTO chapter_images (id,chapter_id,notion_block_id,source_modified,sha256,mime,byte_size,filename) VALUES (?,?,?,?,?,?,?,?)`)
        .run(id, chapterId, block.id, block.last_edited_time || "", sha256, image.mime, image.bytes.length, filename);
      return this.get(chapterId, id);
    },
  };
}

function escapeCaption(value) {
  return String(value || "章节配图").replace(/[\r\n]+/g, " ").slice(0, 500).replace(/[\\[\]<>*_`]/g, (char) => `\\${char}`);
}

export function createImageSync({ chapterId, store, download = downloadImage, now = Date.now }) {
  const imageStats = { found: 0, downloaded: 0, reused: 0, failed: 0 };
  const warnings = [];
  let deadline;
  const markdown = (image, caption) => `![${escapeCaption(caption)}](/api/chapters/${chapterId}/images/${image.id})`;
  return {
    imageStats, warnings,
    async onImage(block) {
      imageStats.found++;
      const value = block.image || {};
      const caption = value.caption?.map((part) => part.plain_text || part.text?.content || "").join("") || "章节配图";
      const existing = block.last_edited_time ? store.find(chapterId, block.id, block.last_edited_time) : null;
      if (existing) { imageStats.reused++; return markdown(existing, caption); }
      try {
        deadline ??= now() + 90000;
        const remaining = deadline - now();
        if (remaining <= 0) throw new Error("本次图片下载已达到 90 秒时限");
        const url = value.type === "file" ? value.file?.url : value.type === "external" ? value.external?.url : null;
        if (!url) throw new Error("图片缺少可读取地址");
        const image = await download(url, { timeoutMs: Math.min(20000, remaining) });
        const saved = store.save(chapterId, block, image);
        imageStats.downloaded++;
        return markdown(saved, caption);
      } catch {
        imageStats.failed++;
        // Never expose signed URLs or arbitrary upstream error bodies in UI/logs.
        const fallback = store.find(chapterId, block.id);
        const message = `第 ${imageStats.found} 张图片同步失败${fallback ? "，暂用旧图片" : "，请重新同步重试"}`;
        warnings.push(message);
        return fallback ? `${markdown(fallback, caption)}\n\n${message}` : `[图片暂未同步：${escapeCaption(caption)}；请重新同步重试]`;
      }
    },
  };
}

export function createChapterImageHandler({ store, getChapter, canAccessChapter }) {
  return (req, res) => {
    res.set({ "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" });
    const { chapterId, imageId } = req.params;
    if (!/^[1-9]\d*$/.test(chapterId) || !/^[a-f0-9-]{36}$/.test(imageId)) return res.status(404).end();
    const chapter = getChapter(Number(chapterId));
    if (!chapter) return res.status(404).end();
    if (!canAccessChapter(req.user, chapter)) return res.status(403).end();
    const image = store.get(Number(chapterId), imageId);
    const target = store.filePath(image);
    if (!target) return res.status(404).end();
    res.set("Content-Type", image.mime);
    res.sendFile(target, { cacheControl: false, lastModified: false, acceptRanges: false }, (error) => {
      if (error && !res.headersSent) res.status(404).end();
    });
  };
}
