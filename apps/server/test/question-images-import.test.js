import test from 'node:test';
import assert from 'node:assert/strict';
import { startImageFixture } from './helpers/image-fixture.js';

test('本地教学页配图按题干、选项和解析归属，重复导入保留题目与答题记录', async (t) => {
  const fixture = await startImageFixture();
  t.after(fixture.close);
  const { readBlockChildrenMarkdown } = await import('../src/notion.js');
  const { db, origin, imagePath } = fixture;
  const markdown = `![边界外](${imagePath})\n历年真题演练开始\n![题目前](${imagePath})\n## 单选题\n1. 哪一项正确？\n![题干图](${imagePath})\nA. 正确项\n![A图](${imagePath})\nB. 错误项\n![B图](${imagePath})\n<details>\n<summary>答案与解析</summary>\n答案：A\n解析：根据图示选择。\n![解析图](${imagePath})\n</details>\n![题目后](${imagePath})\n历年真题演练结束\n![结束后](${imagePath})`;
  db.prepare('UPDATE teaching_pages SET markdown=? WHERE chapter_id=1').run(markdown);
  const importOnce = async () => {
    const response = await fetch(`${origin}/api/chapters/1/import-teaching-questions`, {
      method: 'POST', headers: { Cookie: 'jiaokao_session=image-fixture-1' },
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  };
  const first = await importOnce();
  assert.equal(first.imported, 1);
  assert.equal(first.imageStats.found, 4);
  assert.equal(first.imageStats.reused, 4);
  assert.match(first.warnings.join(' '), /无法确定题目归属/);
  const before = db.prepare('SELECT * FROM exam_questions WHERE chapter_id=1').get();
  assert.match(before.stem, /题干图/);
  assert.match(before.options, /A图/);
  assert.match(before.options, /B图/);
  assert.match(before.analysis, /解析图/);
  assert.doesNotMatch(`${before.stem}${before.options}${before.analysis}`, /边界外|题目前|题目后|结束后/);
  db.prepare('UPDATE exam_questions SET is_archived=1 WHERE id=?').run(before.id);
  db.prepare("INSERT INTO question_attempts(user_id,chapter_id,question_id,mode,selected_answer,is_correct) VALUES(2,1,?,'practice','B',0)").run(before.id);
  const second = await importOnce();
  assert.equal(second.imported, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM exam_questions WHERE chapter_id=1').get().n, 1);
  assert.equal(db.prepare('SELECT is_archived FROM exam_questions WHERE id=?').get(before.id).is_archived, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM question_attempts WHERE question_id=?').get(before.id).n, 1);
  db.prepare('UPDATE teaching_pages SET markdown=? WHERE chapter_id=1').run(`历年真题演练开始\n1. 保留这道题？\n![新图](${imagePath})\nA. 是\nB. 否\n历年真题演练结束`);
  db.prepare("INSERT INTO exam_questions(chapter_id,stem,type,options,source) VALUES(1,'保留这道题？','单选题','A. 是\nB. 否','老师手动题')").run();
  const result = await importOnce();
  assert.equal(result.skipped, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM exam_questions WHERE chapter_id=1').get().n, 2);
  assert.equal(db.prepare("SELECT stem FROM exam_questions WHERE source='老师手动题'").get().stem, '保留这道题？');

  const missingImage = '/api/chapters/1/images/00000000-0000-4000-8000-000000000000';
  db.prepare('UPDATE teaching_pages SET markdown=? WHERE chapter_id=1').run(`模拟题开始\n## 判断题\n1. 缺失图片应提示。\n![失效图](${missingImage})\n<details>\n<summary>答案与解析</summary>\n答案：对\n解析：请参考原图。\n</details>\n模拟题结束`);
  const missing = await importOnce();
  assert.equal(missing.imported, 1);
  assert.equal(missing.imageStats.failed, 1);
  assert.match(db.prepare("SELECT stem FROM exam_questions WHERE stem LIKE '缺失图片%'").get().stem, /图片暂未同步/);

  db.prepare("INSERT INTO exam_questions(chapter_id,stem,type,source) VALUES(1,'歧义题？','判断题','Notion AI 题库题：Excel 图片测试章节')").run();
  db.prepare('INSERT INTO exam_questions(chapter_id,stem,type,source) VALUES(1,?,?,?)')
    .run(`歧义题？\n![旧图](${imagePath})`, '判断题', 'Notion AI 模拟题：Excel 图片测试章节');
  db.prepare('UPDATE teaching_pages SET markdown=? WHERE chapter_id=1').run(`模拟题开始\n## 判断题\n1. 歧义题？\n![新图](${imagePath})\n模拟题结束`);
  const ambiguous = await importOnce();
  assert.equal(ambiguous.imported, 0);
  assert.equal(ambiguous.skipped, 1);
  assert.match(ambiguous.warnings.join(' '), /多个已有题目/);

  db.prepare('UPDATE teaching_pages SET markdown=? WHERE chapter_id=1').run(`模拟题开始\n## 操作题\n1. 设置图表格式。\n<details>\n<summary>答案与解析</summary>\n参考操作步骤：先选择图表。\n![步骤\\[一\\]](${imagePath})\n</details>\n模拟题结束`);
  const operation = await importOnce();
  assert.equal(operation.imported, 1);
  assert.match(db.prepare("SELECT analysis FROM exam_questions WHERE stem='设置图表格式。'").get().analysis, /!\[步骤\\\[一\\\]\]\(\/api\/chapters\/1\/images\//);

  const paragraph = (text) => ({ type: 'paragraph', paragraph: { rich_text: [{ plain_text: text }] } });
  const image = (id) => ({ id, type: 'image', image: { caption: [{ plain_text: id }] } });
  const pages = {
    page: [paragraph('历年真题演练开始'), { id: 'box', type: 'callout', has_children: true, callout: { rich_text: [] } }, paragraph('历年真题演练结束')],
    box: [paragraph('1. 嵌套题干？'), image('stem'), paragraph('A. 甲'), image('option'), paragraph('B. 乙'), { id: 'answer', type: 'toggle', has_children: true, toggle: { rich_text: [{ plain_text: '答案与解析' }] } }],
    answer: [paragraph('答案：A'), paragraph('解析：见图'), image('analysis')],
  };
  const client = { blocks: { children: { list: async ({ block_id }) => ({ results: pages[block_id], has_more: false }) } } };
  const nested = await readBlockChildrenMarkdown(client, 'page', 0, { onImage: (block) => `![${block.id}](${imagePath})` });
  db.prepare('UPDATE teaching_pages SET markdown=? WHERE chapter_id=1').run(nested);
  const nestedResult = await importOnce();
  assert.equal(nestedResult.imported, 1);
  const nestedQuestion = db.prepare("SELECT * FROM exam_questions WHERE stem LIKE '嵌套题干%'").get();
  assert.match(nestedQuestion.stem, /!\[stem\]/);
  assert.match(nestedQuestion.options, /!\[option\]/);
  assert.match(nestedQuestion.analysis, /!\[analysis\]/);

  db.prepare('UPDATE teaching_pages SET markdown=? WHERE chapter_id=1').run(`模拟题开始\n## 多选题\n1. 请选择两项。\nA. 甲\n![甲图](${imagePath})\nB. 乙\n![乙图](${imagePath})\nC. 丙\n<details>\n<summary>答案与解析</summary>\n答案：AB\n解析：甲乙均正确。\n</details>\n## 简答题\n2. 解释图示。\n![简答图](${imagePath})\n<details>\n<summary>答案与解析</summary>\n答案：按图说明。\n解析：结合图片分析。\n</details>\n模拟题结束`);
  const mixed = await importOnce();
  assert.equal(mixed.imported, 2);
  const multiple = db.prepare("SELECT * FROM exam_questions WHERE stem='请选择两项。'").get();
  assert.equal(multiple.type, '多选题');
  assert.match(multiple.options, /!\[甲图\][\s\S]*!\[乙图\]/);
  const short = db.prepare("SELECT * FROM exam_questions WHERE stem LIKE '解释图示%'").get();
  assert.equal(short.type, '简答题');
  assert.match(short.stem, /!\[简答图\]/);
});
