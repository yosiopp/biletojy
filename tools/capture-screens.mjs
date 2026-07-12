// UIレビュー用スクリーンキャプチャ取得スクリプト
//
// 起動中のbiletojyに対して主要画面（デスクトップ・モバイル・ダークモード・各状態）を
// 一括キャプチャしてPNGで出力する。サーバーの起動手順は .claude/skills/verify を参照。
//
// 使い方:
//   cd tools && npm install
//   node capture-screens.mjs [--base http://localhost:18040] [--out ../ui-review] [--seed]
//
//   --seed を付けるとチケットが0件のときだけレビュー用データ（タグ・チケット・コメント）を投入する
//
// Playwrightのブラウザは ~/Library/Caches/ms-playwright のキャッシュを使う
// （無い場合は CHROME_PATH 環境変数でChrome系バイナリを指定する）
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg('base', 'http://localhost:18040');
const OUT = path.resolve(arg('out', path.join(import.meta.dirname, '../ui-review')));
const SEED = process.argv.includes('--seed');

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dir = fs
    .readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .pop();
  if (!dir) throw new Error(`Chromiumが見つかりません。CHROME_PATHを指定してください（探索先: ${cache}）`);
  return path.join(
    cache,
    dir,
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  );
}

async function seedIfEmpty() {
  const post = (url, body) =>
    fetch(`${BASE}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const tickets = await (await fetch(`${BASE}/api/tickets`)).json();
  if (tickets.length > 0) {
    console.log(`チケットが${tickets.length}件あるためシードをスキップ`);
    return;
  }
  // タグ重複作成は500を返すが、既存シードとの衝突は無視してよい
  for (const t of ['priority:high', 'priority:mid', 'priority:low', 'feature/ui', 'feature/api', 'feature/db', 'point#:', 'memo']) {
    await post('/api/tags', { tag: t });
  }
  await post('/api/tickets', {
    title: 'ログイン画面のレイアウト崩れを修正',
    content:
      '## 概要\nモバイル表示でボタンがはみ出す。\n\n- iPhone SE で再現\n- `flex-wrap` の指定漏れが原因か\n\n```css\n.btn { display: flex; }\n```',
    tags: 'status:OPEN type:BUG priority:high feature/ui due-date@:2026-07-20 point#:3',
  });
  await post('/api/tickets', {
    title: 'APIのレスポンス速度改善',
    content: '一覧APIが遅い。インデックス追加を検討する。\n\n```mermaid\ngraph LR\nA[Client] --> B[API] --> C[(SQLite)]\n```',
    tags: 'status:WIP type:ISSUE priority:mid feature/api point#:5',
  });
  await post('/api/tickets', {
    title: 'タグ一覧に説明文を表示したい',
    content: 'タグの note をツールチップではなく一覧に出す。',
    tags: 'status:OPEN type:REQUEST priority:low feature/ui memo',
  });
  await post('/api/tickets', {
    title: 'DBマイグレーション手順の整備',
    content: '手順書を docs に追加する。',
    tags: 'status:DONE type:ISSUE feature/db due-date@:2026-07-01',
  });
  await post('/api/tickets', {
    title: '全文検索の精度向上',
    content: 'bi-gram の境界問題を調査。',
    tags: 'status:CLOSED type:ISSUE feature/api point#:8',
  });
  await post('/api/tickets/1/comments', { content: '再現確認しました。`flex-wrap: wrap` で直りそうです。' });
  await post('/api/tickets/1/comments', { content: 'PR を作成しました。レビューお願いします。' });
  console.log('レビュー用データを投入しました');
}

fs.mkdirSync(OUT, { recursive: true });
if (SEED) await seedIfEmpty();

const browser = await chromium.launch({ executablePath: findChrome() });

async function shot(page, name, opts = {}) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: opts.fullPage ?? true });
  console.log('saved', name);
}

// ユーザ名設定ダイアログを出さないようlocalStorageへ事前設定したコンテキストを作る
async function newContext(options = {}, theme) {
  const ctx = await browser.newContext(options);
  await ctx.addInitScript((t) => {
    localStorage.setItem('biletojy.user', 'reviewer');
    if (t) localStorage.setItem('biletojy.theme', t);
  }, theme);
  return ctx;
}

// --- デスクトップ（ライト） ---
{
  const ctx = await newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/tickets`, { waitUntil: 'networkidle' });
  await shot(page, '01-tickets-list');
  await page.goto(`${BASE}/tickets?view=tree`, { waitUntil: 'networkidle' });
  await shot(page, '02-tickets-tree');
  await page.goto(`${BASE}/tickets?view=board&by=status`, { waitUntil: 'networkidle' });
  await shot(page, '03-tickets-board');
  // 階層タグ（feature）は前方一致で配下すべてにマッチする
  await page.goto(`${BASE}/tickets?tags=${encodeURIComponent('status:OPEN,feature')}`, { waitUntil: 'networkidle' });
  await shot(page, '04-tickets-filtered');

  await page.goto(`${BASE}/tickets/1`, { waitUntil: 'networkidle' });
  await shot(page, '05-ticket-detail');
  await page.goto(`${BASE}/tickets/2`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800); // mermaidの描画待ち
  await shot(page, '06-ticket-detail-mermaid');

  await page.goto(`${BASE}/tickets/new`, { waitUntil: 'networkidle' });
  await shot(page, '07-ticket-new');
  await page.goto(`${BASE}/tickets/1/edit`, { waitUntil: 'networkidle' });
  await shot(page, '08-ticket-edit');

  // タグ入力の補完（ネイティブdatalistのためポップアップ自体は写らない）
  const tagInput = page.getByPlaceholder(/タグを追加/);
  if (await tagInput.count()) {
    await tagInput.click();
    await tagInput.pressSequentially('pri', { delay: 30 });
    await shot(page, '09-tag-suggest');
  }

  await page.goto(`${BASE}/tickets/1/history`, { waitUntil: 'networkidle' });
  await shot(page, '10-ticket-history');
  await page.goto(`${BASE}/tags`, { waitUntil: 'networkidle' });
  await shot(page, '11-tags');
  await page.goto(`${BASE}/templates`, { waitUntil: 'networkidle' });
  await shot(page, '12-templates');
  await page.goto(`${BASE}/files`, { waitUntil: 'networkidle' });
  await shot(page, '13-files');

  // ショートカットヘルプ
  await page.goto(`${BASE}/tickets`, { waitUntil: 'networkidle' });
  await page.keyboard.press('?');
  await shot(page, '14-help');
  await page.keyboard.press('Escape');

  // 検索0件の空状態
  await page.goto(`${BASE}/tickets?q=zzzz`, { waitUntil: 'networkidle' });
  await shot(page, '15-empty-result');

  // 絞り込みチップのプルダウンを開いた状態
  await page.goto(`${BASE}/tickets`, { waitUntil: 'networkidle' });
  await page.getByText('priority', { exact: false }).first().click();
  await shot(page, '16-filter-dropdown');

  // タグ一覧の最下部（固定ヘルプボタンとの重なり確認用にビューポートで撮る）
  await page.goto(`${BASE}/tags`, { waitUntil: 'networkidle' });
  await page.mouse.wheel(0, 10000);
  await page.waitForTimeout(400);
  await shot(page, '17-tags-bottom-viewport', { fullPage: false });

  await ctx.close();
}

// --- モバイル ---
{
  const ctx = await newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/tickets`, { waitUntil: 'networkidle' });
  await shot(page, '20-mobile-list');
  await page.goto(`${BASE}/tickets/1`, { waitUntil: 'networkidle' });
  await shot(page, '21-mobile-detail');
  await page.goto(`${BASE}/tickets/new`, { waitUntil: 'networkidle' });
  await shot(page, '22-mobile-new');
  await page.goto(`${BASE}/tags`, { waitUntil: 'networkidle' });
  await shot(page, '23-mobile-tags');
  await ctx.close();
}

// --- ダークモード ---
{
  const ctx = await newContext({ viewport: { width: 1280, height: 800 } }, 'dark');
  const page = await ctx.newPage();
  await page.goto(`${BASE}/tickets`, { waitUntil: 'networkidle' });
  await shot(page, '30-dark-list');
  await page.goto(`${BASE}/tickets/1`, { waitUntil: 'networkidle' });
  await shot(page, '31-dark-detail');
  await page.goto(`${BASE}/tickets/2`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot(page, '32-dark-mermaid');
  await ctx.close();
}

// --- 初回アクセス（ユーザ名設定ダイアログ） ---
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/tickets`, { waitUntil: 'networkidle' });
  await shot(page, '40-first-run-dialog');
  await ctx.close();
}

await browser.close();
console.log(`完了: ${OUT}`);
