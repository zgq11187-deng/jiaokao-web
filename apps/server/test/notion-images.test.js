import test from 'node:test';
import assert from 'node:assert/strict';
import * as notionReader from '../src/notion.js';

test('Notion 图片回调保留分页和嵌套顺序，默认不下载', async () => {
  assert.equal(typeof notionReader.readBlockChildrenMarkdown, 'function');
  const image = { id: 'image-1', type: 'image', image: { type: 'external', external: { url: 'https://example.com/a.png' } } };
  const client = { blocks: { children: { list: async ({ block_id, start_cursor }) => {
    if (block_id === 'toggle') return { results: [image], has_more: false };
    if (start_cursor) return { results: [{ type: 'paragraph', paragraph: { rich_text: [{ plain_text: '结束' }] } }], has_more: false };
    return { results: [{ id: 'toggle', type: 'toggle', has_children: true, toggle: { rich_text: [{ plain_text: '答案' }] } }], has_more: true, next_cursor: 'next' };
  } } } };
  let calls = 0;
  const markdown = await notionReader.readBlockChildrenMarkdown(client, 'page', 0, { onImage: async (block) => {
    calls++;
    assert.equal(block.id, 'image-1');
    return '![表格](/api/chapters/1/images/abc)';
  } });
  assert.match(markdown, /<summary>答案<\/summary>[\s\S]*!\[表格\][\s\S]*<\/details>[\s\S]*结束/);
  await notionReader.readBlockChildrenMarkdown(client, 'page');
  assert.equal(calls, 1);
});

test('分栏、提示块、折叠标题的图片保留顺序，支持超过100块', async () => {
  const container = (id, type) => ({ id, type, has_children: true, [type]: { rich_text: [{ plain_text: id }] } });
  const img = { id: 'nested', type: 'image', image: {} };
  const calls = [];
  const client = { blocks: { children: { list: async ({ block_id, start_cursor }) => {
    calls.push([block_id, start_cursor]);
    const children = {
      page: start_cursor ? [container('columns', 'column_list')] : Array.from({ length: 100 }, (_, i) => ({ type: 'paragraph', paragraph: { rich_text: [{ plain_text: `文本${i}` }] } })),
      columns: [container('column', 'column')],
      column: [container('callout', 'callout')],
      callout: [container('heading', 'heading_2')],
      heading: [img],
    };
    return { results: children[block_id], has_more: block_id === 'page' && !start_cursor, next_cursor: 'page2' };
  } } } };
  const md = await notionReader.readBlockChildrenMarkdown(client, 'page', 0, { onImage: async () => '![图](test)' });
  assert.match(md, /文本99[\s\S]*<columns>[\s\S]*<callout[\s\S]*## heading[\s\S]*!\[图\]/);
  assert.ok(calls.some(([id, cursor]) => id === 'page' && cursor === 'page2'));
});
