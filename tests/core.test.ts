import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedImageHost } from '../server/config.js';
import { parseCookieInput, serializeCookieHeader } from '../server/cookieParser.js';
import { createApp } from '../server/index.js';
import {
  buildQuotePrefix,
  extractFeedExcerpt,
  parseArticleBody,
  splitLinks,
  stripHtmlTags,
} from '../src/utils/content.js';
import { extractFavBoards } from '../src/utils/favorites.js';
import { buildFontFacesCss, resolveFontStack } from '../src/utils/fonts.js';

test('parseCookieInput handles raw Cookie header, bare string, cURL, and JSON', () => {
  const fromHeader = parseCookieInput('Cookie: token=abc123; set_identity=xyz; Path=/');
  assert.deepEqual(fromHeader, { token: 'abc123', set_identity: 'xyz' });

  const fromCurl = parseCookieInput(
    `curl 'https://wap.newsmth.net/wap/api/profile' -H 'accept: application/json' -b 'token=t_999; ksid=k_111'`,
  );
  assert.deepEqual(fromCurl, { token: 't_999', ksid: 'k_111' });

  const fromCurlH = parseCookieInput(
    `curl 'https://wap.newsmth.net/wap/api/profile' -H 'Cookie: a=1; b=2'`,
  );
  assert.deepEqual(fromCurlH, { a: '1', b: '2' });

  const fromJson = parseCookieInput(JSON.stringify([{ name: 'token', value: 'v1' }]));
  assert.deepEqual(fromJson, { token: 'v1' });

  const netscape = [
    '# Netscape HTTP Cookie File',
    '# comment',
    '.example.com\tTRUE\t/\tFALSE\t0\tother\tignored',
    '#HttpOnly_.newsmth.net\tTRUE\t/\tTRUE\t1797873835\tkbs-info\tabc%3D',
    '.newsmth.net\tTRUE\t/\tTRUE\t1797873835\tkbs-key\txyz123',
    'wap.newsmth.net\tFALSE\t/\tFALSE\t0\tset_identity\t{%22name%22:%22demo%22}',
  ].join('\n');
  assert.deepEqual(parseCookieInput(netscape), {
    'kbs-info': 'abc%3D',
    'kbs-key': 'xyz123',
    set_identity: '{%22name%22:%22demo%22}',
  });

  assert.equal(serializeCookieHeader({ a: '1', b: '2' }), 'a=1; b=2');
});

test('isAllowedImageHost blocks SSRF targets and permits NewSMTH/KS3 image CDNs', () => {
  assert.equal(isAllowedImageHost('att.newsmth.net'), true);
  assert.equal(isAllowedImageHost('ks3-cn-beijing.ksyuncs.com'), true);
  assert.equal(isAllowedImageHost('static.mysmth.net'), true);
  assert.equal(isAllowedImageHost('localhost'), false);
  assert.equal(isAllowedImageHost('127.0.0.1'), false);
  assert.equal(isAllowedImageHost('169.254.169.254'), false);
  assert.equal(isAllowedImageHost('evil-attacker.example.com'), false);
});

test('parseArticleBody cleans HTML, folds quotes, strips client tails, and extracts inline images', () => {
  const rawHtml = [
    '<p>今天天气真好，分享一张图 https://example.com/a</p>',
    '<img src="https://att.newsmth.net/nForum/att/test.jpg" />',
    '<div class="article-quote"><p>【 在 alice 的大作中提到: 】</p><p>: 昨天刚下雨</p><p>: 今天放晴了</p></div>',
    '<p>--</p>',
    '<p>※ 来源:·水木社区 http://www.newsmth.net·[FROM: 10.0.0.*]</p>',
    '<p>发自「今日水木 on iPhone」</p>',
  ].join('\n');

  const parsed = parseArticleBody(rawHtml, true);
  assert.deepEqual(parsed.inlineImages, ['https://att.newsmth.net/nForum/att/test.jpg']);
  assert.equal(parsed.segments.length, 2);
  assert.equal(parsed.segments[0].type, 'text');
  assert.match(parsed.segments[0].content, /今天天气真好/);
  assert.equal(parsed.segments[1].type, 'quote');
  if (parsed.segments[1].type === 'quote') {
    assert.equal(parsed.segments[1].header, '引用 alice');
    assert.equal(parsed.segments[1].lineCount, 2);
  }
  assert.ok(parsed.signature?.includes('来源'));

  assert.equal(stripHtmlTags('标题 <span class="highlight">测试</span> &amp; 1'), '标题 测试 & 1');
  const runs = splitLinks('看这里 https://wap.newsmth.net/ 很干净');
  assert.equal(runs.some((r) => r.type === 'link' && r.href === 'https://wap.newsmth.net/'), true);

  const quote = buildQuotePrefix('bob', '<p>第一行</p><p>第二行</p>');
  assert.match(quote, /【 在 bob 的大作中提到: 】/);
  assert.match(quote, /: 第一行/);

  // Real-world reply with client tail appearing right before quote block
  const ismthBody =
    '<p>再想想</p><p>--发自 ismth(丝滑版)</p><div class="article-quote"><p>【 在 demo_user 的大作中提到: 】</p><p>: 还真想不出</p></div>';
  const ismthParsed = parseArticleBody(ismthBody, true);
  assert.equal(ismthParsed.segments.length, 2);
  assert.equal(ismthParsed.segments[0].type, 'text');
  assert.equal(ismthParsed.segments[0].content, '再想想');
  assert.equal(ismthParsed.segments[1].type, 'quote');

  // Feed excerpt strips inline `#发自zSMTH@...` tail and truncates cleanly
  const shortEx = extractFeedExcerpt('n+2或者更新的制程，有人了解吗 #发自zSMTH@SM-F9560');
  assert.equal(shortEx.text, 'n+2或者更新的制程，有人了解吗');
  assert.equal(shortEx.truncated, false);

  const longEx = extractFeedExcerpt('这是一段非常长的测试正文内容，'.repeat(15), 40);
  assert.equal(longEx.truncated, true);
  assert.ok(longEx.text.endsWith('...'));
});

test('BFF server routes health, SSRF image proxy block, cookie validation, and live hot/ten', async () => {
  const app = createApp();
  const server = await new Promise<import('node:http').Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const addr = server.address();
  assert.ok(addr && typeof addr !== 'string');
  const base = `http://127.0.0.1:${addr.port}`;

  try {
    const healthRes = await fetch(`${base}/api/health`);
    assert.equal(healthRes.status, 200);
    const health = (await healthRes.json()) as { ok: boolean; chromeAvailable: boolean };
    assert.equal(health.ok, true);

    // SSRF guard
    const ssrfRes = await fetch(`${base}/api/proxy/image?url=${encodeURIComponent('http://127.0.0.1:22/')}`);
    assert.equal(ssrfRes.status, 403);

    // Invalid cookie rejected cleanly
    const badCookieRes = await fetch(`${base}/api/auth/cookie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: '' }),
    });
    assert.equal(badCookieRes.status, 400);

    // Live upstream read-only check (hot/ten)
    const tenRes = await fetch(`${base}/api/hot/ten`);
    assert.equal(tenRes.status, 200);
    const ten = (await tenRes.json()) as { topics?: Array<{ id: string; subject: string }> };
    assert.ok(Array.isArray(ten.topics) && ten.topics.length > 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('extractFavBoards parses nested favBoards[].items[].bid and folderList', () => {
  const payload = {
    favBoards: [
      {
        id: 0,
        father: -1,
        folderList: {},
        items: [
          {
            type: 'BOARD',
            bid: { id: 'b1', name: 'Algorithm', title: '算法', todayPostCount: 5 },
          },
          {
            type: 'BOARD',
            bid: { id: 'b2', name: 'Apple', title: '苹果', todayPostCount: 12 },
          },
        ],
      },
    ],
  };
  const boards = extractFavBoards(payload);
  assert.equal(boards.length, 2);
  assert.equal(boards[0].name, 'Algorithm');
  assert.equal(boards[0].title, '算法');
  assert.equal(boards[0].dirId, 0);
  assert.equal(boards[1].todayPostCount, 12);
});

test('font helpers resolve system presets, custom system font, and imported TTF', () => {
  const customFonts = [
    {
      id: 'abc123',
      name: 'LXGW WenKai',
      filename: 'font_abc123.ttf',
      format: 'truetype' as const,
      size: 1024,
      addedAt: 1,
    },
  ];
  assert.match(
    resolveFontStack({ fontId: 'macos-songti', customSystemFont: '' }, customFonts),
    /Songti SC/,
  );
  assert.match(
    resolveFontStack({ fontId: 'imported:abc123', customSystemFont: '' }, customFonts),
    /SmthCustomFont_abc123/,
  );
  assert.match(
    resolveFontStack({ fontId: 'custom-system', customSystemFont: 'LXGW WenKai' }, customFonts),
    /'LXGW WenKai'/,
  );
  const css = buildFontFacesCss(customFonts);
  assert.match(css, /\/api\/local\/fonts\/font_abc123\.ttf/);
});
