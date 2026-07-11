// 清理临时验证产物：scripts/.tmp/ 目录 + 遗留的 _ 前缀临时脚本。
// 用法：node scripts/clean-tmp.mjs
//   加 --keep-state 可保留 e2e-state.json（复用登录态，避免下次重新登录）

import { rm, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SCRIPTS = resolve(__dirname);
const TMP = resolve(SCRIPTS, '.tmp');
const KEEP_STATE = process.argv.includes('--keep-state');

const keep = new Set(['e2e-env.mjs', 'e2e-smoke.mjs', 'clean-tmp.mjs', 'test-api.mjs', '_test_wrangler.bat']);
if (KEEP_STATE) keep.add('e2e-state.json');

async function main() {
  if (existsSync(TMP)) {
    await rm(TMP, { recursive: true, force: true });
    console.log('已清理 scripts/.tmp/');
  }
  const files = await readdir(SCRIPTS);
  for (const f of files) {
    if (f.startsWith('_') && !keep.has(f)) {
      await unlink(resolve(SCRIPTS, f));
      console.log('删除临时脚本:', f);
    }
  }
  // 清理根目录遗留的 search_*.json 探针（上次行情验证残留）
  const root = resolve(SCRIPTS, '..');
  const rootFiles = await readdir(root);
  for (const f of rootFiles) {
    if (/^search_.*\.json$/.test(f)) {
      await unlink(resolve(root, f));
      console.log('删除探针文件:', f);
    }
  }
  console.log('清理完成。');
}

main().catch((e) => { console.error(e); process.exit(1); });
