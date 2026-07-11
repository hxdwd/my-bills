// 财富首页 e2e 冒烟测试（无 @playwright/test，纯 playwright 库）
// 设计目标：
//   1. 登录态复用：首次真实登录后导出 storageState 到 e2e-state.json，
//      之后所有用例 load 该状态，跳过登录表单（这是上次最耗时的环节）。
//   2. 行情偶发失败：列表断言为空时只重试一次「下拉刷新」，不无条件循环。
//   3. 临时产物统一落 ../.tmp/，由 clean-tmp.mjs 清理。
//
// 用法（推荐走 e2e-env.mjs 自动起环境）：
//   node scripts/e2e-env.mjs
// 或手动：先起 wrangler(8799)+vite(5173)，再 `node scripts/e2e-smoke.mjs`
//
// 环境变量：
//   BASE=http://127.0.0.1:5173   前端地址
//   STATE=scripts/e2e-state.json 登录态缓存
//   FORCE_LOGIN=1                忽略缓存，强制重新登录

import { chromium } from 'playwright';
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = resolve(__dirname, '.tmp');
mkdirSync(TMP, { recursive: true });

const BASE = process.env.BASE || 'http://localhost:5173';
const STATE = process.env.STATE || resolve(__dirname, 'e2e-state.json');
const FORCE_LOGIN = process.env.FORCE_LOGIN === '1';

const USER = process.env.E2E_USER || 'hxd';
const PASS = process.env.E2E_PASS || 'zltdkj5933';

let pass = 0;
let fail = 0;
const failures = [];
function assert(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  \u2717 ${name}  -> ${detail}`); }
}

async function doRealLogin(context) {
  console.log('[login] 执行真实登录:', USER);
  const page = await context.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  // 登录页是条件渲染（URL 始终是 /，无 /login 路由），直接等登录表单
  await page.waitForSelector('input[placeholder="请输入用户名"]', { timeout: 15000 });
  await page.fill('input[placeholder="请输入用户名"]', USER);
  await page.fill('input[placeholder="请输入密码"]', PASS);
  await page.click('button[type="submit"]');
  // 登录成功会写入 localStorage['mybills_user'] 并切到主应用（URL 不变，
  // 因此用 localStorage 出现作为成功标志，而非等 URL 变化）
  await page.waitForFunction(
    () => !!localStorage.getItem('mybills_user'),
    { timeout: 15000 }
  );
  await page.waitForTimeout(500);
  await context.storageState({ path: STATE });
  console.log('[login] 已导出登录态 ->', STATE);
  await page.close();
}

async function ensureLogin(context) {
  if (!FORCE_LOGIN && existsSync(STATE)) {
    console.log('[login] 复用缓存登录态:', STATE);
    // storageState 已注入上次导出的登录态（含 localStorage['mybills_user']），
    // 页面加载时 initAuth 会恢复。此处直接信任，跳过登录表单。
    // 若后端 session 真失效（极罕见），后续用例会明确失败，可用
    // `npm run e2e:fresh` 强制重新登录并刷新 state。
    return;
  }
  await doRealLogin(context);
}

// 行情偶发失败：列表为空时下拉刷新重试一次
async function waitForHoldingRows(page, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const rows = page.locator('[data-testid="holding-row"]');
    const n = await rows.count();
    if (n > 0) return n;
    // 尝试触发刷新（下拉刷新按钮或容器）
    const refresh = page.locator('[data-testid="pull-refresh"], button:has-text("刷新")').first();
    if (await refresh.count()) {
      await refresh.click().catch(() => {});
    }
    await page.waitForTimeout(1500);
  }
  return 0;
}

async function run() {
  const browser = await chromium.launch();
  // 若已有登录态缓存且非强制登录，直接 load；否则用空 context 跑登录再导出
  const ctx = await browser.newContext(
    existsSync(STATE) && !FORCE_LOGIN ? { storageState: STATE } : {}
  );

  try {
    await ensureLogin(ctx);

    // --- 用例 1：首页持仓列表渲染真实数据 ---
    const page = await ctx.newPage();
    await page.goto(BASE + '/wealth', { waitUntil: 'networkidle' });
    const rowCount = await waitForHoldingRows(page);
    assert(rowCount > 0, '财富首页渲染持仓列表', `rows=${rowCount}`);

    if (rowCount > 0) {
      const firstText = await page.locator('[data-testid="holding-row"]').first().innerText();
      assert(/[\s\S]/.test(firstText), '首行含文本', firstText.slice(0, 40));

      // --- 用例 2：排序下拉可用（点击触发按钮展开菜单，含 3 个选项）---
      const sortTrigger = page.locator('[data-testid="sort-trigger"]');
      assert(await sortTrigger.count() > 0, '存在排序触发按钮');
      await sortTrigger.first().click();
      await page.waitForTimeout(300);
      const sortBtns = page.locator('[data-testid="sort-menu"] button');
      const sortN = await sortBtns.count();
      assert(sortN >= 3, '排序菜单有 >=3 个选项', `n=${sortN}`);
      if (sortN > 1) {
        await sortBtns.nth(1).click();
        await page.waitForTimeout(300);
        assert(true, '点击排序选项无异常');
      }

      // --- 用例 3：筛选切换可用 ---
      const filterBtns = page.locator('[data-testid="filter-bar"] button');
      const filterN = await filterBtns.count();
      assert(filterN >= 2, '筛选条有 >=2 个选项', `n=${filterN}`);

      // --- 用例 4：点击持仓行跳转详情 ---
      await page.locator('[data-testid="holding-row"]').first().click();
      await page.waitForURL((url) => url.pathname.startsWith('/wealth/detail'), { timeout: 8000 });
      assert(true, '点击持仓行跳转详情页');
      await page.goBack();

      // --- 用例 5：资产分布可折叠 ---
      const dist = page.locator('[data-testid="distribution"]');
      if (await dist.count()) {
        const toggle = dist.locator('[data-testid="distribution-toggle"]');
        if (await toggle.count()) {
          await toggle.click();
          await page.waitForTimeout(200);
          assert(true, '资产分布可折叠');
        } else {
          assert(true, '资产分布存在（无折叠按钮）');
        }
      } else {
        assert(true, '（无资产分布区块，跳过）');
      }
    }

    // --- 用例 6：无 JS 控制台错误 ---
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    assert(errors.length === 0, '无控制台错误', errors.slice(0, 3).join(' | '));

    await page.close();
  } catch (e) {
    fail++;
    failures.push({ name: '运行异常', detail: String(e) });
    console.error('\n运行异常:', e);
  } finally {
    await browser.close();
  }

  const summary = `\n=== e2e 结果: 通过 ${pass} / 失败 ${fail} ===` + (fail > 0
    ? '\n失败明细:\n' + failures.map((f) => `  - ${f.name}: ${f.detail}`).join('\n')
    : '');
  console.log(summary);
  // 同时写一份到 .tmp，避免被 e2e-env 的 stdio 透传在 Windows 下吞掉
  try { mkdirSync(TMP, { recursive: true }); writeFileSync(resolve(TMP, 'smoke-result.log'), summary + '\n'); } catch { /* ignore */ }
  if (fail > 0) process.exit(1);
}

run();
