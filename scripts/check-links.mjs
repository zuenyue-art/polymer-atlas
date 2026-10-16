#!/usr/bin/env node
/**
 * 外链死链检查。
 *
 * 扫描 dist 下的数据文件（data.json / terms.json / news.json / news/*.json），
 * 抽出全部外部链接并逐一探测可达性；同时校验 dist 下 HTML 里的站内引用
 * （href / src 指到的文件是否真的存在）。
 *
 * 用法：
 *   node scripts/check-links.mjs                 # 人类可读输出
 *   node scripts/check-links.mjs --json          # 机器可读
 *   node scripts/check-links.mjs --quiet         # 只输出失败项与汇总
 *   node scripts/check-links.mjs --concurrency=8 --timeout=20000
 *   node scripts/check-links.mjs --skip-internal # 只查外链
 *
 * 退出码：0 = 没有确定失效的链接；1 = 存在失效链接（站内或外链）。
 *
 * 判定口径：
 *   ok    —— 2xx / 3xx
 *   soft  —— 401/403/405/406/429/451。这类状态码通常表示「站点在，但拒绝脚本」，
 *            不代表链接失效（出版商、专利库常见），因此不计入失败。
 *   dead  —— 4xx（除 soft）/ 5xx，这类可以确定链接坏了。
 *   unreachable —— DNS 解析失败 / 连接超时。更常见的原因是「检查方自己的网络
 *                  到不了对方」（被墙、被防火墙拦），而不是链接失效，因此默认
 *                  只告警；加 --strict-network 才计入失败。
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

const argv = process.argv.slice(2)
const flag = name => argv.includes(`--${name}`)
const opt = (name, fallback) => {
  const hit = argv.find(a => a.startsWith(`--${name}=`))
  return hit ? Number(hit.split('=')[1]) : fallback
}

const AS_JSON = flag('json')
const QUIET = flag('quiet')
const CONCURRENCY = Math.max(1, opt('concurrency', 8))
// 连不上的链接是否也计入失败。默认不计：连不上通常是检查方自己的网络问题。
const STRICT_NETWORK = argv.includes('--strict-network')
const TIMEOUT = Math.max(1000, opt('timeout', 20000))
const UA = 'polymer-atlas-link-check/1.0 (+https://github.com/zuenyue-art/polymer-atlas)'

const SOFT_STATUS = new Set([401, 403, 405, 406, 429, 451])
const URL_RE = /https?:\/\/[^\s"'<>()[\]{}（），。；、：】]+/g

const DATA_FILES = ['data.json', 'terms.json', 'news.json']

async function collectTargets() {
  const files = [...DATA_FILES]
  try {
    for (const name of await readdir(path.join(DIST, 'news'))) {
      if (name.endsWith('.json')) files.push(path.join('news', name))
    }
  } catch {
    /* 没有 news 目录也能跑 */
  }

  const targets = new Map()
  for (const rel of files) {
    let parsed
    try {
      parsed = JSON.parse(await readFile(path.join(DIST, rel), 'utf8'))
    } catch {
      continue
    }
    const where = []
    const walk = (node, trail) => {
      if (typeof node === 'string') {
        where.push([trail, node])
      } else if (Array.isArray(node)) {
        node.forEach((child, i) => walk(child, `${trail}[${i}]`))
      } else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node))
          walk(value, trail ? `${trail}.${key}` : key)
      }
    }
    walk(parsed, '')

    for (const [trail, text] of where) {
      for (const match of text.matchAll(URL_RE)) {
        const url = match[0].replace(/[.,;]+$/, '')
        const label =
          trail
            .split('.')
            .filter(s => !/^\[\d+\]$/.test(s))
            .slice(0, 3)
            .join('.') || rel
        if (!targets.has(url)) targets.set(url, new Set())
        targets.get(url).add(`${rel}:${label}`)
      }
    }
  }
  return targets
}

// ---------- 站内引用 ----------

const HTML_FILES = ['index.html', 'news.html']
const ATTR_RE = /(?:href|src)\s*=\s*"([^"]*)"/g

async function checkInternal() {
  const broken = new Map()
  let checked = 0
  for (const file of HTML_FILES) {
    const html = await readFile(path.join(DIST, file), 'utf8').catch(() => '')
    for (const match of html.matchAll(ATTR_RE)) {
      const raw = match[1].trim()
      if (!raw) continue
      if (/^(https?:)?\/\//i.test(raw)) continue // 外部链接，走外链检查
      if (/^(mailto:|tel:|data:|javascript:)/i.test(raw)) continue
      const clean = raw.split('#')[0].split('?')[0]
      if (!clean) continue // 纯锚点
      checked += 1
      const key = clean.replace(/^\//, '')
      const resolved = path.join(DIST, key)
      let present = false
      try {
        const info = await stat(resolved)
        present = info.isFile() || info.isDirectory()
      } catch {
        present = false
      }
      if (present) continue
      if (!broken.has(key)) broken.set(key, new Set())
      broken.get(key).add(file)
    }
  }
  return { broken, checked }
}

async function request(url, method) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT)
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: '*/*' }
    })
    res.body?.cancel().catch(() => {})
    return res
  } finally {
    clearTimeout(timer)
  }
}

async function probe(url) {
  const attempt = async method => {
    const res = await request(url, method)
    if (SOFT_STATUS.has(res.status)) return { status: res.status, verdict: 'soft' }
    return { status: res.status, verdict: res.status >= 200 && res.status < 400 ? 'ok' : 'dead' }
  }

  try {
    const head = await attempt('HEAD')
    // 有些服务器对 HEAD 支持不佳，换 GET 复核一次。
    if (head.verdict === 'dead' && head.status >= 400) {
      try {
        return await attempt('GET')
      } catch {
        return head
      }
    }
    return head
  } catch (err) {
    const code = err?.cause?.code || err?.name
    return {
      status: 0,
      // 连不上 ≠ 链接失效：更常见的是检查方自己的网络被墙或超时。
      // 因此单独归类为 unreachable，默认只告警；--strict-network 才计入失败。
      verdict: 'unreachable',
      error: code === 'AbortError' ? `超时 >${TIMEOUT}ms` : String(code)
    }
  }
}

async function runPool(items, worker, limit) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

const internal = argv.includes('--skip-internal')
  ? { broken: new Map(), checked: 0 }
  : await checkInternal()

const targets = await collectTargets()
const urls = [...targets.keys()].sort()

const results = await runPool(urls, async url => ({ url, ...(await probe(url)) }), CONCURRENCY)

const dead = results.filter(r => r.verdict === 'dead')
const unreachable = results.filter(r => r.verdict === 'unreachable')
const soft = results.filter(r => r.verdict === 'soft')
const ok = results.filter(r => r.verdict === 'ok')

if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        internal_total: internal.checked,
        internal_broken: [...internal.broken.keys()],
        total: results.length,
        ok: ok.length,
        soft: soft.length,
        dead: dead.length,
        unreachable: unreachable.length,
        results: results.map(r => ({ ...r, referenced_by: [...(targets.get(r.url) || [])] }))
      },
      null,
      2
    )
  )
} else {
  if (!QUIET) console.log(`站内引用检查：共 ${internal.checked} 处\n`)
  if (internal.broken.size) {
    console.log(`站内失效 ${internal.broken.size} 个：`)
    for (const [target, refs] of internal.broken) {
      console.log(`  404  ${target}`)
      for (const ref of refs) console.log(`        引用自 ${ref}`)
    }
    console.log('')
  } else if (internal.checked) {
    console.log(`站内引用全部有效（${internal.checked} 处）\n`)
  }

  if (!QUIET) {
    console.log(`外链检查：共 ${results.length} 条\n`)
    for (const r of results) {
      const mark = r.verdict === 'ok' ? 'OK  ' : r.verdict === 'soft' ? 'SKIP' : 'DEAD'
      console.log(
        `  ${mark} ${String(r.status).padStart(3)}  ${r.url}${r.error ? `  (${r.error})` : ''}`
      )
    }
    console.log('')
  }

  if (soft.length) {
    console.log(`跳过 ${soft.length} 条（站点在但拒绝脚本，不算失效）：`)
    for (const r of soft) console.log(`  ${r.status}  ${r.url}`)
    console.log('')
  }

  if (dead.length) {
    console.log(`失效 ${dead.length} 条：`)
    for (const r of dead) {
      console.log(`  ${r.status || '---'}  ${r.url}${r.error ? `  (${r.error})` : ''}`)
      for (const ref of targets.get(r.url) || []) console.log(`        引用自 ${ref}`)
    }
    console.log('')
  }

  if (unreachable.length) {
    console.log(
      `连不上 ${unreachable.length} 条（多半是检查方网络被墙或超时，不代表链接失效${STRICT_NETWORK ? '' : '，不计入失败'}）：`
    )
    for (const r of unreachable) {
      console.log(`  ---  ${r.url}  (${r.error || '?'})`)
      for (const ref of targets.get(r.url) || []) console.log(`        引用自 ${ref}`)
    }
    console.log('')
  }

  console.log(
    `汇总：站内 ${internal.checked - internal.broken.size}/${internal.checked} 有效 · 外链可达 ${ok.length} · 跳过 ${soft.length} · 失效 ${dead.length} · 连不上 ${unreachable.length}`
  )
}

process.exit(dead.length || internal.broken.size || (STRICT_NETWORK && unreachable.length) ? 1 : 0)
