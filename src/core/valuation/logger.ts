// 轻量日志：通过 wrangler.toml 的 [vars] LOG_LEVEL 控制粒度
//   0 = 不输出   1 = 仅请求汇总（默认）   2 = 汇总 + 数据源调用详情
// Workers 环境 console.log 自动推送到 Cloudflare Real-time Logs，无需文件/收集器。
const LEVEL = parseInt(typeof process !== 'undefined' ? process.env?.LOG_LEVEL ?? '1' : '1')

export function log(level: number, msg: string) {
  if (LEVEL >= level) console.log(msg)
}
