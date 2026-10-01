import test from 'node:test';
import assert from 'node:assert/strict';
import { startImageFixture } from './helpers/image-fixture.js';

test('真实 HTTP 会话鉴权：匿名、未审批、撤权、归档与跨章节', async (t) => {
  const fixture = await startImageFixture();
  t.after(fixture.close);
  const { db, origin, imagePath } = fixture;
  const get = (user, url = imagePath) => fetch(`${origin}${url}`, { headers: user ? { Cookie: `jiaokao_session=image-fixture-${user}` } : {} });
  assert.equal((await get()).status, 401);
  assert.equal((await get(3)).status, 403);
  for (const user of [1, 2]) {
    const response = await get(user);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  assert.equal((await get(1, imagePath.replace('/1/', '/2/'))).status, 404);
  db.exec('DELETE FROM chapter_student_access WHERE chapter_id=1;');
  assert.equal((await get(2)).status, 403);
  db.exec('UPDATE chapters SET student_visible=1 WHERE id=1;');
  assert.equal((await get(2)).status, 200);
  db.exec('UPDATE chapters SET notion_archived=1 WHERE id=1;');
  assert.equal((await get(2)).status, 403);
  assert.equal((await get(1)).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM teaching_pages').get().n, 1);
});
