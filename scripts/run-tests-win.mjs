// Windows 一键端到端测试（后台整体运行，结果写 _wsl_test.log）
// 由 start 启动，命令立即返回；之后读取 _wsl_test.log 即可。
// 流程：清旧 wrangler → 启 wrangler → 轮询就绪 → 跑 test-api + test-multicurrency → 关 wrangler
import { spawn, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync, appendFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const BASE = 'http://127.0.0.1:8799'
const LOG = join(__dirname, '_wsl_test.log')
writeFileSync(LOG, '') // 清空

const log = (...a) => { const s = a.join(' '); console.log(s); appendFileSync(LOG, s + '\n') }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function killAll() {
  try { execSync('taskkill /f /im wrangler.exe', { stdio: 'ignore' }) } catch {}
  try { execSync('taskkill /f /im miniflare.exe', { stdio: 'ignore' }) } catch {}
}

function runNode(scriptRel) {
  return new Promise((resolve) => {
    const p = spawn('cmd.exe', ['/c', 'node', join(__dirname, scriptRel)], {
      cwd: ROOT, stdio: 'inherit', env: { ...process.env, BASE },
    })
    p.on('exit', (code) => resolve(code ?? 1))
  })
}

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    await sleep(2000)
    try {
      const r = await fetch(`${BASE}/api/quote/search?q=600519`, { signal: AbortSignal.timeout(5000) })
      const j = await r.json()
      if (j && j.code === 0) { log(`[ready] wrangler up after ~${(i + 1) * 2}s`); return true }
    } catch {}
  }
  return false
}

async function main() {
  killAll()
  await sleep(2000)
  log('=== 启动 wrangler ===')
  const wr = spawn('cmd.exe', ['/c', 'npx', 'wrangler', 'pages', 'dev', '.', '--port', '8799'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'], env: process.env, detached: true })
  const wrPid = wr.pid

  const ready = await waitReady()
  if (!ready) {
    log('[ERR] wrangler 未在 120s 内就绪')
    try { execSync(`taskkill /f /t /pid ${wrPid}`, { stdio: 'ignore' }) } catch {}
    killAll()
    process.exit(4)
  }

  let apiRc = 1, mcRc = 1
  try {
    log('\n=== [1] 原有 API 测试 ===')
    apiRc = await runNode('test-api.mjs')
    log(`\n[test-api] exit=${apiRc}`)
    log('\n=== [2] 多币种端到端测试 ===')
    mcRc = await runNode('test-multicurrency.mjs')
    log(`\n[test-multicurrency] exit=${mcRc}`)
  } finally {
    try { execSync(`taskkill /f /t /pid ${wrPid}`, { stdio: 'ignore' }) } catch {}
    killAll()
  }

  if (apiRc === 0 && mcRc === 0) log('\n=== ALL_PASS ===')
  else log(`\n=== SOME_FAIL (api=${apiRc} mc=${mcRc}) ===`)
  process.exit(apiRc === 0 && mcRc === 0 ? 0 : 1)
}
main()
