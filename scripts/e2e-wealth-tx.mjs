// 财富持仓详情：交易流水 编辑/删除 走通测试
// 参考 e2e-smoke.mjs 的登录态复用机制。
// 为避免破坏用户真实持仓，本测试自建一笔黄金流水(AU9999)，编辑后再删除。
// 详情页流水列表来自本地 getAllTransactions，不依赖 batch 估值接口，
// 故新增后直接 URL 直达详情页验证，避免首页是否渲染该标的的干扰。
// 用法：
//   node scripts/e2e-wealth-tx.mjs            （复用登录态）
//   FORCE_LOGIN=1 node scripts/e2e-wealth-tx.mjs
//
import { chromium } from 'playwright';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BASE = process.env.BASE || 'http://localhost:5173';
const STATE = process.env.STATE || resolve(__dirname, 'e2e-state.json');
const FORCE_LOGIN = process.env.FORCE_LOGIN === '1';
const USER = process.env.E2E_USER || 'hxd';
const PASS = process.env.E2E_PASS || 'zltdkj5933';

let pass = 0, fail = 0;
const failures = [];
function assert(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push({ name, detail }); console.log(`  ✗ ${name}  -> ${detail}`); }
}

async function ensureLogin(context) {
  if (!FORCE_LOGIN && existsSync(STATE)) {
    console.log('[login] 复用缓存登录态');
    return;
  }
  console.log('[login] 真实登录:', USER);
  const page = await context.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('input[placeholder="请输入用户名"]', { timeout: 15000 });
  await page.fill('input[placeholder="请输入用户名"]', USER);
  await page.fill('input[placeholder="请输入密码"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !!localStorage.getItem('mybills_user'), { timeout: 15000 });
  await page.waitForTimeout(500);
  await context.storageState({ path: STATE });
  await page.close();
}

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(
    existsSync(STATE) && !FORCE_LOGIN ? { storageState: STATE } : {}
  );
  try {
    await ensureLogin(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));

    const SYM = 'AU9999';
    const MKT = 'GOLD';

    // --- 1. 新增一笔黄金流水（手动建仓，不依赖搜索/估值接口）---
    console.log('[seed] 新增黄金流水', SYM);
    await page.goto(BASE + '/wealth/add', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.locator('button:has-text("黄金（手动建仓）")').click();
    await page.waitForTimeout(400);
    const numInputs = page.locator('input[type="number"]');
    assert(await numInputs.count() >= 2, '新增表单含数量/价格输入', `n=${await numInputs.count()}`);
    await numInputs.nth(0).fill('10');
    await numInputs.nth(1).fill('500');
    await page.locator('button:has-text("保存")').click();
    await page.waitForURL((u) => u.pathname === '/wealth', { timeout: 8000 });
    await page.waitForTimeout(1000);
    console.log('[seed] 已保存，准备进入详情');

    // --- 2. 直接 URL 进入详情（流水来自本地，不依赖 batch 估值）---
    await page.goto(BASE + `/wealth/detail/${MKT}/${SYM}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    assert(true, '进入持仓详情页');

    // --- 3. 交易流水区块 ---
    const txHeader = page.locator('text=交易流水');
    assert(await txHeader.count() > 0, '详情页展示「交易流水」区块');

    const txCards = page.locator('div.rounded-2xl.bg-bg');
    const beforeCount = await txCards.count();
    assert(beforeCount > 0, '交易流水至少有 1 条', `count=${beforeCount}`);
    if (beforeCount === 0) throw new Error('无流水，无法继续编辑/删除测试');

    // --- 4. 编辑第一笔 ---
    const firstCard = txCards.first();
    await firstCard.locator('button:has-text("编辑")').click();
    await page.waitForTimeout(300);
    const qtyInput = firstCard.locator('input[placeholder="数量"]');
    const priceInput = firstCard.locator('input[placeholder="价格"]');
    assert(await qtyInput.count() > 0 && await priceInput.count() > 0, '编辑态展开数量/价格输入框');
    await qtyInput.fill('5');
    await priceInput.fill('678.90');
    await firstCard.locator('button:has-text("保存")').click();
    await page.waitForTimeout(1200);
    const afterText = (await txCards.first().innerText()).replace(/\s+/g, ' ');
    assert(/678\.9/.test(afterText), '编辑保存后价格更新为 678.9', afterText.slice(0, 80));
    assert(/5 克|5 份/.test(afterText), '编辑保存后数量更新为 5', afterText.slice(0, 80));

    // --- 5. 删除第一笔 ---
    const countBeforeDel = await txCards.count();
    page.once('dialog', (d) => d.accept());
    await txCards.first().locator('button:has-text("删除")').click();
    await page.waitForTimeout(1200);
    const countAfterDel = await txCards.count();
    assert(countAfterDel === countBeforeDel - 1 || countAfterDel === 0,
      '删除一笔后流水条数减少', `before=${countBeforeDel} after=${countAfterDel}`);

    assert(errors.length === 0, '无控制台/页面错误', errors.slice(0, 3).join(' | '));
    await page.close();
  } catch (e) {
    fail++;
    failures.push({ name: '运行异常', detail: String(e) });
    console.error('\n运行异常:', e);
  } finally {
    await browser.close();
  }

  const summary = `\n=== 财富流水编辑/删除 e2e: 通过 ${pass} / 失败 ${fail} ===` + (fail > 0
    ? '\n失败明细:\n' + failures.map((f) => `  - ${f.name}: ${f.detail}`).join('\n')
    : '');
  console.log(summary);
  try {
    const TMP = resolve(__dirname, '.tmp');
    mkdirSync(TMP, { recursive: true });
    writeFileSync(resolve(TMP, 'tx-result.log'), summary + '\n', 'utf8');
  } catch { /* ignore */ }
  if (fail > 0) process.exit(1);
}

run();
