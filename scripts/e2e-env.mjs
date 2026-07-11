// e2e 环境编排：自动起 wrangler(8799 行情) + vite(5173 前端)，
// 轮询等端口就绪后运行 e2e-smoke.mjs，结束自动关停子进程，临时产物落 .tmp/。
//
// 用法：node scripts/e2e-env.mjs
// 跳过环境启动（已在跑）：node scripts/e2e-env.mjs --skip-env
// 强制重新登录（跨平台）：node scripts/e2e-env.mjs --fresh
// 调总超时：node scripts/e2e-env.mjs --timeout=90000 （默认 120000ms）
// 也可走 npm：npm run e2e / npm run e2e:fresh / npm run e2e:skip-env
//
// 注意（Windows）：npx/vite/wrangler 都是 .cmd，spawn 必须 shell:true。
// 注意：wrangler pages dev 需要 apps/pwa/dist，请先 `npm run build`。

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
      if (pid && /^\d+$/.test(pid)) pids.add(pid);
    }
    for (const pid of pids) {
      try { execSync(`taskkill /PID ${pid} /F /T`, { shell: true, stdio: 'ignore' }); } catch { /* ignore */ }
    }
    if (pids.size) console.log(`[env] 清理端口 ${port} 占用进程: ${[...pids].join(',')}`);
  } catch { /* netstat 无输出等情况 */ }
}

async function waitPort(port, tries = 45, interval = 1000) {
  // 同时尝试 localhost(可能解析 IPv6 ::1) 与 127.0.0.1(IPv4)，兼容 vite 双栈监听
  const hosts = [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
  for (let i = 0; i < tries; i++) {
    for (const url of hosts) {
      try {
        const res = await fetch(url);
        if (res.ok || res.status === 404) return true;
      } catch { /* not ready */ }
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
    // wrangler pages dev 需要 dist 存在，否则静默失败
    if (!existsSync(resolve(ROOT, 'apps/pwa/dist'))) {
      console.error('[env] 缺少 apps/pwa/dist，请先 `npm run build` 再跑 e2e');
      clearTimeout(timer);
      process.exit(1);
    }
    killPort(WRANGLER_PORT);
    killPort(VITE_PORT);
    // 等端口释放
    await new Promise((r) => setTimeout(r, 1500));

    console.log('[env] 启动 wrangler (行情 8799)...');
    spawnProc('npx', ['wrangler', 'pages', 'dev', 'apps/pwa/dist', '--port', String(WRANGLER_PORT)], ROOT, 'wrangler');
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
  }
}

main().catch((e) => {
  console.error(e);
  cleanupChildren();
  process.exit(1);
});
