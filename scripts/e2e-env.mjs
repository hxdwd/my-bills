// e2e 环境编排：自动起共享 Worker(8799 行情) + vite(5173 前端)，
// 轮询等端口就绪后运行 e2e-smoke.mjs，结束自动关停子进程，临时产物落 .tmp/。
//
// 后端已从本仓库迁出：行情/估值/财富接口都在独立 Worker `my-bills-api`
// （当前源码在 jijibao/worker）。本仓库只剩 functions/api/[[path]].ts 转发层，
// 而 Service binding 在本地 pages dev 下是 [not connected]，所以不能再
// `wrangler pages dev` 起后端 —— 必须单独跑 Worker 的 `wrangler dev`。
// Worker 目录默认 ../jijibao/worker，可用 MY_BILLS_API_DIR 覆盖。
//
// 用法：node scripts/e2e-env.mjs
// 跳过环境启动（已在跑）：node scripts/e2e-env.mjs --skip-env
// 强制重新登录（跨平台）：node scripts/e2e-env.mjs --fresh
// 调总超时：node scripts/e2e-env.mjs --timeout=90000 （默认 120000ms）
// 也可走 npm：npm run e2e / npm run e2e:fresh / npm run e2e:skip-env
//
// 注意（Windows）：npx/vite/wrangler 都是 .cmd，spawn 必须 shell:true。
// 注意：wrangler pages dev 需要 apps/pwa/dist，请先 `npm run build`。

import http from 'node:http';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const execFileP = promisify(execFile);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const WRANGLER_PORT = 8799;
const VITE_PORT = 5173;
// 跨平台参数解析（避免 Windows 下 `FORCE_LOGIN=1 npm run` 这种 bash 语法失效）
const argv = process.argv.slice(2);
const SKIP_ENV = argv.includes('--skip-env') || process.env.SKIP_ENV === '1';
const FORCE_LOGIN = argv.includes('--fresh') || process.env.FORCE_LOGIN === '1';
const timeoutArg = argv.find((a) => a.startsWith('--timeout='));
const TOTAL_TIMEOUT_MS = timeoutArg ? Number(timeoutArg.split('=')[1]) : (Number(process.env.E2E_TIMEOUT) || 120000);

const children = [];
// 是否由本次运行拉起 Worker（复用时不能关别人的进程）
let spawnedWorker = false;
function spawnProc(cmd, args, cwd, name) {
  const p = spawn(cmd, args, { cwd, stdio: 'pipe', env: { ...process.env }, shell: true });
  p.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  p.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  p.on('exit', (code) => console.log(`[${name}] exit ${code}`));
  p.on('error', (e) => console.error(`[${name}] spawn error:`, e.message));
  children.push(p);
  return p;
}

// 预清理占用目标端口的残留进程（避免 "Port X is in use"）
function killPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr ":${port}"`, { shell: true, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString();
    const pids = new Set();
    for (const line of out.split('\n')) {
      const m = line.trim().split(/\s+/);
      const pid = m[m.length - 1];
      // 跳过 0（netstat 表头/系统空闲）与重复项
      if (pid && /^\d+$/.test(pid) && Number(pid) > 4) pids.add(pid);
    }
    for (const pid of pids) {
      try { execSync(`taskkill /PID ${pid} /F /T`, { shell: true, stdio: 'ignore' }); } catch { /* ignore */ }
    }
    if (pids.size) console.log(`[env] 清理端口 ${port} 占用进程: ${[...pids].join(',')}`);
  } catch { /* netstat 无输出等情况 */ }
}

// 单次探测：用 http 模块而不是全局 fetch。
// fetch 在这里会踩两个坑：① 没有超时，端口没响应就一直挂着（实测让整个 e2e
// 卡到总超时）；② 本机代理环境会让 localhost 解析异常。http.get 带 timeout 更稳。
function probe(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.on('error', () => resolve(0));
  });
}

async function waitPort(port, tries = 45, interval = 1000) {
  // 同时尝试 127.0.0.1(IPv4) 与 localhost(可能解析 IPv6 ::1)，兼容 vite 双栈监听
  const hosts = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
  for (let i = 0; i < tries; i++) {
    for (const url of hosts) {
      if ((await probe(url)) > 0) return true;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  // 超时诊断：打印端口占用情况，帮助定位 "in use" / 启动失败
  let diag = '';
  try {
    diag = execSync(`netstat -ano | findstr ":${port}"`, { shell: true, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch { /* ignore */ }
  throw new Error(`端口 ${port} 在 ${tries}s 内未就绪\n  端口占用诊断:\n${diag || '  (无占用，说明服务未启动)'}`);
}

function cleanupChildren() {
  for (const p of children) {
    try { p.kill('SIGTERM'); } catch { /* ignore */ }
  }
}

async function main() {
  // 总超时保护：超过 TOTAL_TIMEOUT_MS 强制 abort，避免闷等
  const timer = setTimeout(() => {
    console.error(`\n[env] 总超时 ${TOTAL_TIMEOUT_MS}ms，强制退出（诊断：服务未起来或 e2e 卡死）`);
    cleanupChildren();
    process.exit(2);
  }, TOTAL_TIMEOUT_MS);

  if (!SKIP_ENV) {
    // 后端在独立 Worker 里，必须能找到它的源码目录才能起本地行情服务
    const WORKER_DIR = process.env.MY_BILLS_API_DIR
      ? resolve(process.env.MY_BILLS_API_DIR)
      : resolve(ROOT, '../jijibao/worker');
    if (!existsSync(resolve(WORKER_DIR, 'wrangler.toml'))) {
      console.error(
        `[env] 找不到共享 Worker 目录：${WORKER_DIR}\n` +
          '  后端已迁出本仓库，请用 MY_BILLS_API_DIR 指向 my-bills-api 源码目录后重试。'
      );
      clearTimeout(timer);
      process.exit(1);
    }
    // 已有健康的 Worker 就复用它：反复杀/起会留下多个监听同一端口的
    // workerd 孙子进程（Windows 允许重复 bind），请求随机落到卡死的那个上，
    // 表现为「端口 LISTENING 但请求一直挂」。
    if ((await probe(`http://127.0.0.1:${WRANGLER_PORT}/api/health`)) === 200) {
      console.log(`[env] 复用已在运行的 Worker (${WRANGLER_PORT})`);
    } else {
      killPort(WRANGLER_PORT);
      await new Promise((r) => setTimeout(r, 1500));
      console.log(`[env] 启动共享 Worker (行情 ${WRANGLER_PORT})，目录 ${WORKER_DIR}...`);
      spawnProc('npx', ['wrangler', 'dev', '--port', String(WRANGLER_PORT)], WORKER_DIR, 'wrangler');
      spawnedWorker = true;
    }

    killPort(VITE_PORT);
    await new Promise((r) => setTimeout(r, 1500));
    console.log('[env] 启动 vite (前端 5173)...');
    spawnProc('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], ROOT, 'vite');
    console.log('[env] 等待端口就绪...');
    await waitPort(WRANGLER_PORT);
    await waitPort(VITE_PORT);
    console.log('[env] 端口就绪，开始 e2e');
  } else {
    console.log('[env] SKIP_ENV=1，假定环境已在运行');
  }

  try {
    // pipe 而非 inherit：Windows 下 inherit 会丢失子进程 stdout，这里手动透传
    const smoke = spawn('node', [resolve(__dirname, 'e2e-smoke.mjs')], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env, BASE: `http://localhost:${VITE_PORT}`, FORCE_LOGIN: FORCE_LOGIN ? '1' : '' },
    });
    smoke.stdout.on('data', (d) => process.stdout.write(`[smoke] ${d}`));
    smoke.stderr.on('data', (d) => process.stderr.write(`[smoke] ${d}`));
    const code = await new Promise((res) => smoke.on('exit', res));
    if (code !== 0) {
      console.error(`[env] e2e-smoke 退出码 ${code}`);
      process.exitCode = code || 1;
    }
  } finally {
    clearTimeout(timer);
    console.log('[env] 关停子进程...');
    cleanupChildren();
    // 子进程只是 cmd 壳：真正的 node / workerd 是孙子进程，
    // 不按端口再收一遍会残留监听，下次运行就会出现「端口有人在听但请求不响应」。
    killPort(VITE_PORT);
    if (spawnedWorker) killPort(WRANGLER_PORT);
  }
}

main().catch((e) => {
  console.error(e);
  cleanupChildren();
  process.exit(1);
});
