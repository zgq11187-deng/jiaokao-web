// Isolated real-server fixture. Never opens the application's normal database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createImageStore } from '../../src/chapter-images.js';

export async function startImageFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiaokao-image-http-'));
  Object.assign(process.env, { APP_DB_PATH: path.join(directory, 'app.db'), UPLOAD_DIR: path.join(directory, 'uploads'), NOTION_TOKEN: '', QWEN_API_KEY: '' });
  const { db } = await import('../../src/db.js');
  const { hashPassword } = await import('../../src/auth.js');
  const users = [['teacher', 'approved'], ['student', 'approved'], ['student', 'pending']];
  for (let i = 0; i < users.length; i++) {
    db.prepare('INSERT INTO users(id,name,phone,password_hash,role,authorization_status) VALUES(?,?,?,?,?,?)')
      .run(i + 1, `图片验收${i + 1}`, `1380000000${i}`, hashPassword('test-image-only'), ...users[i]);
    db.prepare('INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(?,?,?)')
      .run(i + 1, createHash('sha256').update(`image-fixture-${i + 1}`).digest('hex'), new Date(Date.now() + 3600000).toISOString());
  }
  db.exec("INSERT INTO chapters(id,title,student_visible) VALUES(1,'Excel 图片测试章节',0),(2,'另一章节',1); INSERT INTO chapter_student_access(chapter_id,student_id) VALUES(1,2);");
  const store = createImageStore(db, path.join(directory, 'chapter-images'));
  const image = store.save(1, { id: 'fixture-block', last_edited_time: 'v1' }, {
    bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
    mime: 'image/png', extension: 'png',
  });
  const imagePath = `/api/chapters/1/images/${image.id}`;
  db.prepare('INSERT INTO teaching_pages(chapter_id,markdown,summary) VALUES(?,?,?)')
    .run(1, `# Excel 图片测试\n\n正文之前\n\n![表格测试图](${imagePath})\n\n<details>\n<summary>答案与解析</summary>\n\n![解析测试图](${imagePath})\n</details>\n\n正文之后`, '仅用于自动测试');
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const server = spawn(process.execPath, [fileURLToPath(new URL('../../src/index.js', import.meta.url))], {
    env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (chunk) => { output += chunk; });
  server.stderr.on('data', (chunk) => { output += chunk; });
  const origin = `http://127.0.0.1:${port}`;
  async function close() {
    if (server.exitCode === null) { server.kill(); await once(server, 'exit'); }
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(`${origin}/health`)).ok; } catch { /* Waiting for our child only. */ }
      if (ready) break;
      if (server.exitCode !== null) throw new Error(output);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`Test server did not start: ${output}`);
    return { db, origin, imagePath, close };
  } catch (error) { await close(); throw error; }
}

if (process.argv.includes('--serve')) {
  const fixture = await startImageFixture();
  fixture.db.exec('UPDATE chapters SET student_visible=1 WHERE id=1;');
  const sampleImage = `![测试配图](${fixture.imagePath})`;
  fixture.db.prepare(`INSERT INTO exam_questions(chapter_id,stem,type,options,answer,analysis,source,question_source_kind) VALUES(1,?,?,?,?,?,?,?)`)
    .run(`配图题干：请选择正确项\n${sampleImage}`, '单选题', `A. 正确项\n${sampleImage}\nB. 错误项`, 'A', `解析配图：\n${sampleImage}`, 'Notion AI 题库题：Excel 图片测试章节', 'real_exam');
  const sampleQuestion = fixture.db.prepare('SELECT id FROM exam_questions WHERE chapter_id=1').get();
  fixture.db.prepare("INSERT INTO question_attempts(user_id,chapter_id,question_id,mode,selected_answer,is_correct) VALUES(2,1,?,'practice','B',0)").run(sampleQuestion.id);
  const { createServer } = await import('vite');
  const root = fileURLToPath(new URL('../../../web/', import.meta.url));
  const vite = await createServer({ root, configFile: path.join(root, 'vite.config.js'), server: { port: 5189, strictPort: true, proxy: { '/api': { target: fixture.origin } } } });
  await vite.listen();
  console.log('Isolated image UI fixture: http://127.0.0.1:5189/teacher (test login 13800000000 / test-image-only)');
  const close = async () => { await vite.close(); await fixture.close(); process.exit(0); };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}
