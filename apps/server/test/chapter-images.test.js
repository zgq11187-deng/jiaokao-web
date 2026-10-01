import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrateChapterImages, createImageStore, createImageSync, createChapterImageHandler } from '../src/chapter-images.js';
import { parseChapterImage } from '../../web/src/chapter-image-markdown.js';

const bytes = Buffer.from('47494638396101000100', 'hex');
function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiaokao-images-test-'));
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE chapters(id INTEGER PRIMARY KEY); INSERT INTO chapters VALUES(1),(2);');
  migrateChapterImages(db);
  migrateChapterImages(db);
  const store = createImageStore(db, directory);
  t.after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { db, store, directory };
}
const block = { id: 'notion-block', last_edited_time: 'v1', image: { type: 'file', file: { url: 'https://example.com/a?secret=notion-signature' }, caption: [{ plain_text: '表格 [1]\\<img>\n说明' }] } };
const download = async () => ({ bytes, mime: 'image/gif', extension: 'gif' });

test('旧库安全迁移，版本缓存、稳定地址、替换保留历史', async (t) => {
  const { store, db } = setup(t);
  const first = createImageSync({ chapterId: 1, store, download });
  const md = await first.onImage(block);
  assert.equal(first.imageStats.downloaded, 1);
  assert.ok(parseChapterImage(md));
  assert.equal(parseChapterImage(md).caption, '表格 [1]\\<img> 说明');
  assert.ok(!md.includes('secret'));
  const cached = createImageSync({ chapterId: 1, store, download: () => { throw Error('should not fetch'); } });
  assert.equal(await cached.onImage(block), md);
  assert.equal(cached.imageStats.reused, 1);
  const changed = await createImageSync({ chapterId: 1, store, download }).onImage({ ...block, last_edited_time: 'v2' });
  assert.notEqual(changed, md);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chapter_images').get().n, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM chapters').get().n, 2);
  assert.ok(store.filePath(store.find(1, block.id, 'v1')));
  assert.equal(store.find(2, block.id), undefined);
});

test('失效图片保留旧图或占位；不泄露 URL；90秒预算阻止继续下载', async (t) => {
  const { store } = setup(t);
  await createImageSync({ chapterId: 1, store, download }).onImage(block);
  const failed = createImageSync({ chapterId: 1, store, download: async () => { throw Error('secret signed URL'); } });
  assert.match(await failed.onImage({ ...block, last_edited_time: 'new' }), /暂用旧图片/);
  assert.equal(failed.imageStats.failed, 1);
  assert.ok(!failed.warnings.join('').includes('secret'));
  assert.match(await failed.onImage({ ...block, id: 'missing' }), /图片暂未同步/);
  let clock = 0, calls = 0;
  const budget = createImageSync({ chapterId: 2, store, now: () => clock, download: async () => { calls++; clock = 91000; throw Error('timeout'); } });
  await budget.onImage(block);
  await budget.onImage({ ...block, id: 'next' });
  assert.equal(calls, 1);
  assert.equal(budget.imageStats.failed, 2);
});

test('缓存路径禁止穿越和符号链接', (t) => {
  const { store, directory } = setup(t);
  assert.equal(store.filePath({ filename: '../app.db' }), null);
  const image = store.save(1, block, { bytes, mime: 'image/gif', extension: 'gif' });
  const file = store.filePath(image);
  fs.unlinkSync(file);
  fs.symlinkSync('/etc/hosts', file);
  assert.equal(store.filePath(image), null);
  assert.ok(file.startsWith(fs.realpathSync(directory)));
});

test('图片接口校验章节授权和归属，老师可看归档，响应不缓存', (t) => {
  const { store } = setup(t);
  const image = store.save(1, block, { bytes, mime: 'image/gif', extension: 'gif' });
  const chapter = { id: 1, archived: false };
  const handler = createChapterImageHandler({ store, getChapter: () => chapter, canAccessChapter: (user, c) => user.role === 'teacher' || (user.granted && !c.archived) });
  function run(user, chapterId = '1', imageId = image.id) {
    const result = { code: 200, headers: {} };
    const res = { set(key, value) { if (typeof key === 'object') Object.assign(result.headers, key); else result.headers[key] = value; return this; }, status(code) { result.code = code; return this; }, end() {}, sendFile(file) { result.file = file; } };
    handler({ params: { chapterId, imageId }, user }, res);
    return result;
  }
  assert.equal(run({ role: 'student' }).code, 403);
  assert.ok(run({ role: 'student', granted: true }).file);
  chapter.archived = true;
  assert.equal(run({ role: 'student', granted: true }).code, 403);
  assert.ok(run({ role: 'teacher' }).file);
  assert.equal(run({ role: 'teacher' }, '2').code, 404);
  assert.equal(run({ role: 'teacher' }, '../1').code, 404);
  assert.match(run({ role: 'teacher' }).headers['Cache-Control'], /private, no-store/);
});

test('前端只识别同源受保护图片，不接受外链和路径注入', () => {
  for (const text of ['![x](https://evil/a)', '![x](javascript:alert(1))', '![x](/api/chapters/1/images/../env)', '<img src=x>', '![x](//evil/a)']) assert.equal(parseChapterImage(text), null);
});
