#!/usr/bin/env node
/**
 * 预渲染材料页：为每条材料生成一份真实存在的静态 HTML —— dist/m/<id>/index.html
 *
 * 为什么要这一步
 *   站点是纯前端渲染的：130 条材料的正文只存在 data.json 里，靠 app.js 在浏览器
 *   里拼出来。结果是搜索引擎只看到一个根地址——材料详情既不能被收录，也没法作为
 *   一个独立链接分享出去（sitemap 里因此只有首页一项）。
 *
 *   这里把每条材料预先渲染成一份静态文件：正文、标题、描述、canonical、分享卡片
 *   全部写死在 HTML 里，不执行 JavaScript 就能读到，被 sitemap 收录，并互相链接
 *   （同分类兄弟材料），连成一张可爬取的图。
 *
 * 为什么材料页不加载 app.js
 *   材料页的定位是「内容页」：打开快、能选中能复制、关掉 JS 也读得完。搜索、对比、
 *   收藏这些交互留给图鉴本身，页面上给了回链（/#materials/<id>，图鉴会自动展开这条）。
 *   这样这一版改动完全不触碰 index.html 与 app.js，图鉴的既有行为不受影响。
 *
 * 用法：
 *   node scripts/prerender.mjs            # 重建 dist/m/
 *   node scripts/prerender.mjs --check    # 只比对不写盘，不一致退出码 1（CI 用）
 *   SITE_ORIGIN=https://example.com node scripts/prerender.mjs
 *
 * 两个约定：
 *   1. 生成前清空 dist/m。整个目录都是产物，材料从 data.json 里删掉时旧页面不能留着，
 *      否则 sitemap 会一直收录一个已经不存在的内容。
 *   2. 字段分组与 app.js 里的 detailGroups 保持一致。分组一旦对不上，材料内容就会
 *      在页面上悄悄少一块，所以脚本会检查 data.json 里的每个字段都落进了某一组。
 */

import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { BASE_PATH, SITE_NAME, SITE_TAGLINE, homeUrl, materialPath, materialUrl } from './site.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const OUT = path.join(DIST, 'm')
const CHECK_ONLY = process.argv.includes('--check')

const SOURCE_KEY = '参考来源与核验范围'

// 这两项是页头的身份信息（大号缩写 + 标题），跟 app.js 一样不进任何分组。
const IDENTITY_FIELDS = ['材料名称', '英文缩写']

// 与 app.js 的 detailGroups 对齐：字段顺序、分组标题、以及「回收」组里那一条
// 单独改写的小标题都必须一致，否则同一个材料在静态页与图鉴里会长得不一样。
const GROUPS = [
  { label: '概览', fields: ['突出特点', '主要弱点', '典型用途', '易混淆点/使用限制'] },
  {
    label: '结构与性能',
    fields: ['重复单元/结构', '形态与结晶性', '特征基团/结构要点', '热行为与牌号差异']
  },
  { label: '加工与改性', fields: ['加工与干燥要点', '常见配方/改性方向'] },
  { label: '回收', fields: ['回收路线与分离难点'] },
  { label: '资料来源', fields: [SOURCE_KEY] }
]

// 同分类兄弟材料的展示上限。同类多则只取前几条，其余用一条带计数的链接兜住——
// 目的不是列全，而是让任何一条材料都能沿着链接走到同类里的其他内容。
const SIBLING_LIMIT = 10

// 搜索结果的标题大约 60 个字符就会被截断，描述常见区间是 120–160。
const TITLE_MAX = 60
const DESC_TARGET = 110
const DESC_MAX = 158

const esc = v =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )

// ---------- 每页的文案 ----------

/** 标题：名称（缩写）· 分类 · 站名。太长时让掉分类，别把站名挤出去。 */
function titleFor(m) {
  const base = `${m.fields['材料名称']}（${m.fields['英文缩写']}）`
  const full = `${base} · ${m.category} · ${SITE_NAME}`
  return full.length <= TITLE_MAX ? full : `${base} · ${SITE_NAME}`
}

/** 分享卡片标题：比 <title> 短，分类本身就是最有用的一句上下文。 */
function shareTitleFor(m) {
  return `${m.fields['材料名称']}（${m.fields['英文缩写']}）· ${m.category}`
}

/**
 * 描述：先写「谁+哪一类」，再按重要性补句子，凑到 ~110 字就停。
 * 不用「欢迎访问」那类填充词，全部取自材料自身的字段。
 */
function describe(m) {
  const f = m.fields
  let text = `${f['材料名称']}（${f['英文缩写']}）· ${m.category}`
  for (const key of ['突出特点', '典型用途', '回收路线与分离难点', '主要弱点']) {
    if (text.length >= DESC_TARGET) break
    const value = String(f[key] ?? '').trim()
    if (value) text += `。${value}`
  }
  if (text.length > DESC_MAX) text = `${text.slice(0, DESC_MAX - 1).trimEnd()}…`
  return text
}

/** 「参考来源与核验范围」里内嵌了一个 URL，正文与链接要分开渲染。 */
function splitSource(value) {
  const raw = String(value ?? '')
  const url = raw.match(/https?:\/\/\S+/)?.[0] ?? ''
  return { text: url ? raw.replace(url, '').trim() : raw.trim(), url }
}

// ---------- 正文 ----------

function renderGroups(m) {
  const f = m.fields
  return GROUPS.map(group => {
    const blocks = group.fields
      .filter(key => f[key] !== undefined)
      .map(key => {
        if (key === SOURCE_KEY) {
          const { text, url } = splitSource(f[key])
          const link = url
            ? `\n          <p><a class="source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">查看参考来源 ↗</a></p>`
            : ''
          return `<div class="detail-section">
          <h3>资料来源与核验范围</h3>
          <p class="source-text">${esc(text)}</p>${link}
        </div>`
        }
        // 「回收」组里那条在 app.js 里是作为「原有资料补充」呈现的，这里保持一致。
        const headline = group.label === '回收' ? '原有资料补充' : key
        const cls = key === '重复单元/结构' ? ' class="formula"' : ''
        return `<div class="detail-section">
          <h3>${esc(headline)}</h3>
          <p${cls}>${esc(f[key])}</p>
        </div>`
      })
    if (!blocks.length) return ''
    return `      <section class="mp-group">
        <h2 class="mp-group-title">${esc(group.label)}</h2>
        ${blocks.join('\n        ')}
      </section>`
  })
    .filter(Boolean)
    .join('\n')
}

function renderSiblings(m, materials) {
  const peers = materials.filter(x => x.category === m.category && x.id !== m.id)
  const shown = peers.slice(0, SIBLING_LIMIT)
  const rest = peers.length - shown.length
  const items = shown
    .map(
      x =>
        `<li><a href="${materialPath(x.id)}"><b>${esc(x.fields['英文缩写'])}</b>${esc(x.fields['材料名称'])}</a></li>`
    )
    .join('\n          ')
  const more = rest
    ? `\n          <li class="mp-siblings-more"><a href="${BASE_PATH}#materials">另有 ${rest} 种同类材料，去图鉴看 ↗</a></li>`
    : ''
  return `      <section class="mp-group">
        <h2 class="mp-group-title">同分类的其他材料 · ${esc(m.category)}</h2>
        <ul class="mp-siblings">
          ${items}${more}
        </ul>
      </section>`
}

function renderPage(m, materials) {
  const f = m.fields
  const id = m.id
  const url = materialUrl(id)
  const home = homeUrl()
  const atlasLink = `${BASE_PATH}#materials/${encodeURIComponent(id)}`
  const title = titleFor(m)
  const description = describe(m)
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'DefinedTerm',
    name: f['材料名称'],
    alternateName: f['英文缩写'],
    description,
    url,
    inDefinedTermSet: {
      '@type': 'DefinedTermSet',
      name: `${SITE_NAME} · 材料图鉴`,
      url: `${home}#materials`
    }
  }).replace(/</g, '\\u003c')

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="theme-color" content="#46684f" />
    <link rel="icon" type="image/svg+xml" href="${BASE_PATH}favicon.svg?v=1" />
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${esc(url)}" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="${esc(SITE_NAME)}" />
    <meta property="og:title" content="${esc(shareTitleFor(m))}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:image" content="${esc(home)}og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="zh_CN" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(shareTitleFor(m))}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(home)}og.png" />
    <title>${esc(title)}</title>
    <link rel="stylesheet" href="${BASE_PATH}style.css" />
    <link rel="stylesheet" href="${BASE_PATH}layout.css" />
    <link rel="stylesheet" href="${BASE_PATH}material.css" />
    <script type="application/ld+json">
      ${jsonLd}
    </script>
  </head>
  <body class="material-page">
    <header class="mp-bar">
      <a class="mp-brand" href="${BASE_PATH}"
        ><span class="brand-mark">p.</span
        ><span>${esc(SITE_NAME)}<small>POLYMER ATLAS</small></span></a
      >
      <a class="mp-cta" href="${esc(atlasLink)}">在交互图鉴中打开 ↗</a>
    </header>
    <main class="mp-main">
      <nav class="mp-crumb" aria-label="位置">
        <a href="${BASE_PATH}">首页</a><span aria-hidden="true">/</span
        ><a href="${BASE_PATH}#materials">材料图鉴</a><span aria-hidden="true">/</span
        ><span>${esc(m.category)}</span>
      </nav>
      <article class="mp-article">
        <header class="mp-head">
          <div class="mp-identity">
            <span class="abbr">${esc(f['英文缩写'])}</span>
            <h1>${esc(f['材料名称'])}</h1>
          </div>
          <p class="mp-meta"><span class="badge">${esc(m.category)}</span>材料图鉴 · 共 ${materials.length} 条记录</p>
        </header>
${renderGroups(m)}
${renderSiblings(m, materials)}
        <footer class="mp-foot">
          <p>${esc(SITE_TAGLINE)}资料核验范围见「资料来源」，性能与工艺需按具体牌号确认。</p>
          <nav class="mp-links" aria-label="站内其他栏目">
            <a href="${BASE_PATH}#materials">材料图鉴</a>
            <a href="${BASE_PATH}#news">材料动态</a>
            <a href="${BASE_PATH}#terms">基础知识</a>
            <a href="${BASE_PATH}#literature">回收文献</a>
          </nav>
          <p><a href="${esc(atlasLink)}">在交互图鉴中查看完整资料（搜索、对比、收藏、打印）↗</a></p>
        </footer>
      </article>
    </main>
  </body>
</html>
`
}

// ---------- 一致性检查 ----------

/** data.json 里的每个字段都必须落进某一组，否则页面上会静默少一块内容。 */
function checkFieldCoverage(materials) {
  const grouped = new Set([...GROUPS.flatMap(g => g.fields), ...IDENTITY_FIELDS])
  const seen = new Set()
  for (const m of materials) for (const key of Object.keys(m.fields)) seen.add(key)
  const missing = [...seen].filter(k => !grouped.has(k))
  const unused = [...grouped].filter(k => !seen.has(k))
  if (missing.length)
    throw Error(
      `这些字段没有被任何分组收录，会把内容漏掉：${missing.join('、')}。` +
        '请在 GROUPS 里补上，并同步 app.js 的 detailGroups。'
    )
  if (unused.length)
    throw Error(`GROUPS 里这些字段在 data.json 中不存在（可能是改过名）：${unused.join('、')}`)
}

async function existingPages() {
  const found = new Map()
  let entries
  try {
    entries = await readdir(OUT, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const file = path.join(OUT, entry.name, 'index.html')
    try {
      found.set(`m/${entry.name}/index.html`, await readFile(file, 'utf8'))
    } catch {
      /* 没有 index.html 的目录算作多余内容，下面按「意外文件」报出来 */
      found.set(`m/${entry.name}/index.html`, null)
    }
  }
  return found
}

async function main() {
  const data = JSON.parse(await readFile(path.join(DIST, 'data.json'), 'utf8'))
  const materials = data.materials ?? []
  if (!materials.length) throw Error('data.json 里没有 materials，先确认数据文件')

  checkFieldCoverage(materials)

  // 材料页要引用 material.css；它缺失时页面会掉样式，早报比晚发现好。
  try {
    await access(path.join(DIST, 'material.css'))
  } catch {
    throw Error('缺少 dist/material.css，材料页会没有版式；先补上这个文件')
  }

  const pages = new Map()
  const titles = new Map()
  for (const m of materials) {
    if (!m?.id) throw Error('存在没有 id 的材料记录，无法生成地址')
    const title = titleFor(m)
    if (titles.has(title)) throw Error(`标题重复：${title}（${titles.get(title)} 与 ${m.id}）`)
    titles.set(title, m.id)
    pages.set(`m/${encodeURIComponent(m.id)}/index.html`, renderPage(m, materials))
  }

  if (CHECK_ONLY) {
    const onDisk = await existingPages()
    const problems = []
    for (const [rel, content] of pages) {
      if (!onDisk.has(rel)) problems.push(`缺失 ${rel}`)
      else if (onDisk.get(rel) !== content) problems.push(`与生成结果不一致 ${rel}`)
    }
    for (const rel of onDisk.keys()) if (!pages.has(rel)) problems.push(`多余 ${rel}`)
    if (problems.length) {
      console.error(`预渲染产物与 data.json 不同步，共 ${problems.length} 处：`)
      for (const p of problems.slice(0, 12)) console.error(`  · ${p}`)
      if (problems.length > 12) console.error(`  · 其余 ${problems.length - 12} 处略`)
      console.error('\n跑一次 node scripts/prerender.mjs 重建，再一并提交。')
      return 1
    }
    const bytes = [...pages.values()].reduce((n, s) => n + Buffer.byteLength(s), 0)
    console.log(
      `预渲染产物与 data.json 同步：${pages.size} 条材料页 / ${(bytes / 1024).toFixed(0)} KB。`
    )
    return 0
  }

  // dist/m 整个目录都是产物，重建前清空，避免已删除材料的旧页面被 sitemap 继续收录。
  // 清空前再确认一次目标确实是 dist 的子目录——这条 rm -rf 不该有别的可能。
  const relative = path.relative(DIST, OUT)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw Error(`拒绝清空非 dist 子目录：${OUT}`)
  await rm(OUT, { recursive: true, force: true })

  for (const [rel, content] of pages) {
    const file = path.join(DIST, rel)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, content, 'utf8')
  }

  const bytes = [...pages.values()].reduce((n, s) => n + Buffer.byteLength(s), 0)
  console.log(
    `已生成 ${pages.size} 条材料页到 dist/m/（${(bytes / 1024).toFixed(0)} KB，平均 ${(
      bytes /
      pages.size /
      1024
    ).toFixed(1)} KB/页）。`
  )
  console.log(`站点地址：${homeUrl()} · 材料页形如 ${materialPath('m-0-0')}`)
  return 0
}

try {
  process.exitCode = await main()
} catch (err) {
  console.error(`预渲染失败：${err.message}`)
  process.exitCode = 1
}
