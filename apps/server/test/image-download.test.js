import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { downloadImage, MAX_IMAGE_BYTES } from '../src/image-download.js';

const gif = Buffer.from('47494638396101000100', 'hex');
function mockRequest(responses, observer = () => {}) {
  return (url, options, callback) => {
    observer(url, options);
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => {
      const fixture = responses.shift();
      const res = new PassThrough();
      res.socket = { remoteAddress: fixture.address || '8.8.8.8' };
      res.statusCode = fixture.status || 200;
      res.headers = fixture.headers || {};
      callback(res);
      if (!res.destroyed) res.end(fixture.bytes || gif);
    });
    return request;
  };
}
const resolveHost = async () => [{ address: '8.8.8.8', family: 4 }];

test('只允许 HTTPS、公网 DNS、逐跳复验、校验实际连接地址', async () => {
  for (const url of ['http://example.com/a', 'https://user:pass@example.com/a', 'https://example.com:444/a', 'https://127.0.0.1/a', 'https://[::1]/a']) await assert.rejects(downloadImage(url));
  await assert.rejects(downloadImage('https://test.invalid/a', { resolveHost: async () => [{ address: '10.1.2.3', family: 4 }] }));
  await assert.rejects(downloadImage('https://example.com/a', { resolveHost, request: mockRequest([{ status: 302, headers: { location: 'https://169.254.169.254/latest/' } }]) }));
  await assert.rejects(downloadImage('https://example.com/a', { resolveHost, request: mockRequest([{ address: '127.0.0.1' }]) }));
});

test('固定 DNS，不转发密钥，验证字节且限制声明及实际长度', async () => {
  const request = mockRequest([{}], (_url, options) => {
    assert.equal(options.agent, false);
    assert.equal(options.headers.Authorization, undefined);
    options.lookup('example.com', { all: true }, (_err, ips) => assert.deepEqual(ips, [{ address: '8.8.8.8', family: 4 }]));
  });
  assert.equal((await downloadImage('https://example.com/a', { resolveHost, request })).mime, 'image/gif');
  for (const fixture of [{ status: 403 }, { bytes: Buffer.from('<svg/>') }, { headers: { 'content-length': MAX_IMAGE_BYTES + 1 } }, { bytes: Buffer.alloc(MAX_IMAGE_BYTES + 1) }, { headers: { 'content-encoding': 'gzip' } }]) {
    await assert.rejects(downloadImage('https://example.com/a', { resolveHost, request: mockRequest([fixture]) }));
  }
});

test('重定向上限与 DNS 超时', async () => {
  await assert.rejects(downloadImage('https://example.com/a', { resolveHost, request: mockRequest(Array.from({ length: 4 }, () => ({ status: 302, headers: { location: '/again' } }))) }));
  const keepAlive = setTimeout(() => {}, 100);
  try { await assert.rejects(downloadImage('https://example.com/a', { timeoutMs: 5, resolveHost: () => new Promise(() => {}) })); }
  finally { clearTimeout(keepAlive); }
});

test('图片下载器拒绝特殊 IPv4/IPv6 地址和非图片字节', async () => {
  const { isPublicAddress, detectImageType } = await import('../src/image-download.js');
  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.64.0.1', '172.16.1.1', '192.168.1.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2002:7f00:1::', '2001:db8::1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  assert.throws(() => detectImageType(Buffer.from('<svg></svg>')));
  assert.throws(() => detectImageType(Buffer.from('<html>bad</html>')));
  assert.equal(detectImageType(Buffer.from('47494638396101000100', 'hex')).mime, 'image/gif');
});

test('跨同步任务最多两张并发，队列超时不会占用名额', async () => {
  let active = 0, maximum = 0;
  const slowResolve = async () => {
    active++;
    maximum = Math.max(active, maximum);
    await new Promise((resolve) => setTimeout(resolve, 30));
    active--;
    return resolveHost();
  };
  const jobs = Array.from({ length: 5 }, () => downloadImage('https://example.com/a', { resolveHost: slowResolve, request: mockRequest([{}]) }));
  await assert.rejects(downloadImage('https://example.com/a', { timeoutMs: 5, resolveHost, request: mockRequest([{}]) }));
  await Promise.all(jobs);
  assert.equal(maximum, 2);
});
