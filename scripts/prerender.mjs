#!/usr/bin/env node
/**
 * 预渲染内容页：为每条材料、每个分类各生成一份真实存在的静态 HTML。
 *
 *   dist/m/<id>/index.html     材料页
 *   dist/c/<slug>/index.html   分类页
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
 *   分类页补的是这张图里缺的一层枢纽：材料页只会横向连到同类的十几条，从一条
 *   「通用塑料」跳不到「橡胶弹性体」。9 个分类页各自列出本类全部材料并互链，
 *   既让「聚烯烃这一类」能被单独分享，也给爬虫一个从首页直达任意材料的中间层。
 *
 * 为什么内容页不加载 app.js
 *   内容页的定位是「内容页」：打开快、能选中能复制、关掉 JS 也读得完。搜索、对比、
 *   收藏这些交互留给图鉴本身，页面上给了回链（/#materials/<id>，图鉴会自动展开这条）。
 *   这样这一版改动完全不触碰 index.html 与 app.js，图鉴的既有行为不受影响。
 *
 * 用法：
 *   node scripts/prerender.mjs            # 重建 dist/m/ 与 dist/c/
 *   node scripts/prerender.mjs --check    # 只比对不写盘，不一致退出码 1（CI 用）
 *   SITE_ORIGIN=https://example.com node scripts/prerender.mjs
 *
 * 三个约定：
 *   1. dist/m/ 与 dist/c/ 整个都是产物。数据里删掉的材料/分类，旧页面不能留着，
 *      否则 sitemap 会一直收录一个已经不存在的内容。清理是增量的：只删这一轮
 *      没有生成的目录，而不是先清空再重建。
 *   2. 字段分组与 app.js 里的 detailGroups 保持一致。分组一旦对不上，材料内容就会
 *      在页面上悄悄少一块，所以脚本会检查 data.json 里的每个字段都落进了某一组。
 *   3. 分类地址片段登记在 scripts/site.mjs 的 CATEGORY_SLUGS；出现未登记的分类时
 *      这里会直接失败，避免生成一串百分号编码的难看地址。
 */

import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BASE_PATH,
  SITE_NAME,
  SITE_TAGLINE,
  categoryPath,
  categorySlug,
  categoryUrl,
  homeUrl,
  materialPath,
  materialUrl
} from './site.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const OUT = path.join(DIST, 'm')
const CAT_OUT = path.join(DIST, 'c')

/**
 * 外观开关。首页、材料页、分类页共用同一个形状：两枚图标都写在按钮里，由
 * style.css 按 html[data-theme] 决定露哪一枚，theme-init.js 只管点与记。
 * 这里的 aria-label 只是首屏文案，脚本会在读到系统偏好后立刻改写。
 */
const THEME_TOGGLE = `<button class="theme-toggle" type="button" aria-label="切换到深色外观"><svg class="ti-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" /></svg><svg class="ti-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6" /></svg></button>`
const CHECK_ONLY = process.argv.includes('--check')

/** 数值字段定义，从 data.json 的 propsSpec 读（main 里赋值）。 */
let PROPS_SPEC = []

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

/**
 * 数值表。材料没填数值时整块不渲染——一个只有标题的空表和没有它没区别。
 * 字段清单从 data.json 的 propsSpec 读，和填写表格、筛选器共用同一份定义。
 */
function renderProps(m) {
  const spec = PROPS_SPEC
  const rows = spec
    .filter(s => (m.props || {})[s.key] != null)
    .map(s => {
      const v = m.props[s.key]
      const text = Array.isArray(v) ? `${v[0]} ~ ${v[1]}` : `${v}`
      return `<div class="prop-row"><dt>${esc(s.label)}</dt><dd>${esc(text)}<small>${esc(s.unit)}</small></dd></div>`
    })
  // 返回空串时连换行也不留：模板里 `${renderProps(m)}${renderGroups(m)}` 是紧挨着的，
  // 否则 130 个没有数值的页面会各自多出一个空行，变成一次毫无意义的全站 diff。
  if (!rows.length) return ''
  return `        <section class="props-table mp-props">
          <h2>数值</h2>
          <dl>
            ${rows.join('\n            ')}
          </dl>
          <p class="props-note">本站只收录了部分材料的数值，未列出的字段表示还没有填。</p>
        </section>
`
}

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
  // 超出展示上限的那些指向分类页而不是图鉴首页：分类页列得全，而且从那里能
  // 走到其他分类——首页进了图鉴还得自己再筛一次。
  const more = rest
    ? `\n          <li class="mp-siblings-more"><a href="${categoryPath(m.category)}">另有 ${rest} 种同类材料，看完整分类 ↗</a></li>`
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
    <script src="${BASE_PATH}theme-init.js"></script>
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
    <link rel="stylesheet" href="${BASE_PATH}theme-dark.css" />
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
      <div class="mp-actions">
        <a class="mp-cta" href="${esc(atlasLink)}">在交互图鉴中打开 ↗</a>
        ${THEME_TOGGLE}
      </div>
    </header>
    <main class="mp-main">
      <nav class="mp-crumb" aria-label="位置">
        <a href="${BASE_PATH}">首页</a><span aria-hidden="true">/</span
        ><a href="${BASE_PATH}#materials">材料图鉴</a><span aria-hidden="true">/</span
        ><a href="${categoryPath(m.category)}">${esc(m.category)}</a>
      </nav>
      <article class="mp-article">
        <header class="mp-head">
          <div class="mp-identity">
            <span class="abbr">${esc(f['英文缩写'])}</span>
            <h1>${esc(f['材料名称'])}</h1>
          </div>
          <p class="mp-meta"><span class="badge">${esc(m.category)}</span>材料图鉴 · 共 ${materials.length} 条记录</p>
        </header>
${renderProps(m)}${renderGroups(m)}
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

// ---------- 分类页 ----------

/** 分类页标题。分类名最长 8 个汉字，加站名也不会超 TITLE_MAX。 */
const categoryTitle = name => `${name} · ${SITE_NAME}`

/** 描述：先说清「哪一类、多少种」，再顺手列前几种材料的名字。 */
function describeCategory(name, items) {
  let text = `${name}：共 ${items.length} 种材料 —— `
  for (const m of items) {
    if (text.length >= DESC_TARGET) break
    text += `${m.fields['材料名称']}（${m.fields['英文缩写']}）、`
  }
  text = `${text.replace(/、$/, '')}。`
  if (text.length > DESC_MAX) text = `${text.slice(0, DESC_MAX - 1).trimEnd()}…`
  return text
}

/** 本类材料逐条列出：缩写 + 名称（链接），下面两行是选材时最先要对比的两条。 */
function renderCategoryItems(items) {
  return items
    .map(m => {
      const f = m.fields
      return `          <li>
            <a class="cp-name" href="${materialPath(m.id)}"><b>${esc(f['英文缩写'])}</b>${esc(f['材料名称'])}</a>
            <p>${esc(f['突出特点'])}</p>
            <p class="cp-recycle"><span>回收</span>${esc(f['回收路线与分离难点'])}</p>
          </li>`
    })
    .join('\n')
}

function renderCategoryPage(name, materials, categories) {
  const items = materials.filter(x => x.category === name)
  const url = categoryUrl(name)
  const home = homeUrl()
  const title = categoryTitle(name)
  const description = describeCategory(name, items)
  const atlasLink = `${BASE_PATH}#materials`
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${name} · 材料图鉴`,
    description,
    url,
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: home },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.map((m, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: `${m.fields['材料名称']}（${m.fields['英文缩写']}）`,
        url: materialUrl(m.id)
      }))
    }
  }).replace(/</g, '\\u003c')

  const others = categories
    .filter(c => c !== name)
    .map(
      c =>
        `<li><a href="${categoryPath(c)}">${esc(c)}<small>${materials.filter(x => x.category === c).length}</small></a></li>`
    )
    .join('\n          ')

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="theme-color" content="#46684f" />
    <script src="${BASE_PATH}theme-init.js"></script>
    <link rel="icon" type="image/svg+xml" href="${BASE_PATH}favicon.svg?v=1" />
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${esc(url)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${esc(SITE_NAME)}" />
    <meta property="og:title" content="${esc(`${name} · ${items.length} 种材料`)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:image" content="${esc(home)}og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="zh_CN" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(`${name} · ${items.length} 种材料`)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(home)}og.png" />
    <title>${esc(title)}</title>
    <link rel="stylesheet" href="${BASE_PATH}style.css" />
    <link rel="stylesheet" href="${BASE_PATH}layout.css" />
    <link rel="stylesheet" href="${BASE_PATH}material.css" />
    <link rel="stylesheet" href="${BASE_PATH}theme-dark.css" />
    <script type="application/ld+json">
      ${jsonLd}
    </script>
  </head>
  <body class="material-page category-page">
    <header class="mp-bar">
      <a class="mp-brand" href="${BASE_PATH}"
        ><span class="brand-mark">p.</span
        ><span>${esc(SITE_NAME)}<small>POLYMER ATLAS</small></span></a
      >
      <div class="mp-actions">
        <a class="mp-cta" href="${esc(atlasLink)}">在交互图鉴中打开 ↗</a>
        ${THEME_TOGGLE}
      </div>
    </header>
    <main class="mp-main">
      <nav class="mp-crumb" aria-label="位置">
        <a href="${BASE_PATH}">首页</a><span aria-hidden="true">/</span
        ><a href="${BASE_PATH}#materials">材料图鉴</a><span aria-hidden="true">/</span
        ><span>${esc(name)}</span>
      </nav>
      <article class="mp-article">
        <header class="mp-head">
          <div class="mp-identity">
            <h1>${esc(name)}</h1>
          </div>
          <p class="mp-meta"><span class="badge">${items.length} 种材料</span>材料图鉴 · 全站 ${materials.length} 条记录</p>
        </header>
      <section class="mp-group">
        <h2 class="mp-group-title">这一类收录的材料</h2>
        <ol class="cp-list">
${renderCategoryItems(items)}
        </ol>
      </section>
      <section class="mp-group">
        <h2 class="mp-group-title">其他分类</h2>
        <ul class="mp-siblings">
          ${others}
        </ul>
      </section>
        <footer class="mp-foot">
          <p>${esc(SITE_TAGLINE)}按分类浏览，点任意材料可看完整资料与核验范围。</p>
          <nav class="mp-links" aria-label="站内其他栏目">
            <a href="${BASE_PATH}#materials">材料图鉴</a>
            <a href="${BASE_PATH}#news">材料动态</a>
            <a href="${BASE_PATH}#terms">基础知识</a>
            <a href="${BASE_PATH}#literature">回收文献</a>
          </nav>
          <p><a href="${esc(atlasLink)}">在交互图鉴中查看全部材料（搜索、对比、收藏、打印）↗</a></p>
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

/** 读出某个产物目录（dist/m 或 dist/c）下已有的 index.html。 */
async function existingPages(outDir) {
  const prefix = path.basename(outDir)
  const found = new Map()
  let entries
  try {
    entries = await readdir(outDir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const file = path.join(outDir, entry.name, 'index.html')
    try {
      found.set(`${prefix}/${entry.name}/index.html`, await readFile(file, 'utf8'))
    } catch {
      /* 没有 index.html 的目录算作多余内容，下面按「意外文件」报出来 */
      found.set(`${prefix}/${entry.name}/index.html`, null)
    }
  }
  return found
}

/**
 * 删掉这一轮没有生成的页面目录。数据是唯一事实来源，删掉的材料/分类不能留下
 * 旧页面，否则 sitemap 会继续收录一个已经不存在的内容。
 * 只删「这次没生成」的，而不是先清空整个目录再重建：清空意味着每次都要先删掉
 * 上百个刚写完的文件，既做无用功，也让误伤范围变得不必要地大。
 */
async function pruneStale(outDir, wanted) {
  const relative = path.relative(DIST, outDir)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw Error(`拒绝清理非 dist 子目录：${outDir}`)
  const prefix = path.basename(outDir)
  const stale = (await readdir(outDir, { withFileTypes: true }).catch(() => []))
    .filter(entry => entry.isDirectory() && !wanted.has(entry.name))
    .map(entry => entry.name)
  for (const name of stale) {
    await rm(path.join(outDir, name), { recursive: true, force: true })
  }
  if (stale.length)
    console.log(
      `清除了 ${stale.length} 个已失效的页面：${stale.map(n => `${prefix}/${n}`).join('、')}`
    )
}

async function main() {
  const data = JSON.parse(await readFile(path.join(DIST, 'data.json'), 'utf8'))
  const materials = data.materials ?? []
  if (!materials.length) throw Error('data.json 里没有 materials，先确认数据文件')
  PROPS_SPEC = data.propsSpec ?? []

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

  // 分类页：地址片段在 site.mjs 里登记，未登记的分类会在这里抛错，不会生成一个
  // 百分号编码的难看地址。顺序按 data.json 里出现的先后，保证产物稳定可复现。
  const categories = [...new Set(materials.map(m => m.category))]
  const categoryPages = []
  for (const name of categories) {
    const rel = `c/${categorySlug(name)}/index.html`
    if (pages.has(rel)) throw Error(`分类地址片段重复：${rel}`)
    pages.set(rel, renderCategoryPage(name, materials, categories))
    categoryPages.push(rel)
  }

  if (CHECK_ONLY) {
    const onDisk = new Map([...(await existingPages(OUT)), ...(await existingPages(CAT_OUT))])
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
      `预渲染产物与 data.json 同步：${materials.length} 条材料页 + ${categoryPages.length} 个分类页 / ${(bytes / 1024).toFixed(0)} KB。`
    )
    return 0
  }

  for (const [rel, content] of pages) {
    const file = path.join(DIST, rel)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, content, 'utf8')
  }

  await pruneStale(OUT, dirNames(pages, OUT))
  await pruneStale(CAT_OUT, dirNames(pages, CAT_OUT))

  const bytes = [...pages.values()].reduce((n, s) => n + Buffer.byteLength(s), 0)
  console.log(
    `已生成 ${materials.length} 条材料页到 dist/m/、${categoryPages.length} 个分类页到 dist/c/（共 ${(bytes / 1024).toFixed(0)} KB）。`
  )
  console.log(
    `站点地址：${homeUrl()} · 材料页形如 ${materialPath('m-0-0')} · 分类页形如 ${categoryPath(categories[0])}`
  )
  return 0
}

/** pages 里落在 outDir 下的那些顶层目录名。 */
function dirNames(pages, outDir) {
  const prefix = `${path.basename(outDir)}/`
  const names = new Set()
  for (const rel of pages.keys())
    if (rel.startsWith(prefix)) names.add(rel.slice(prefix.length).split('/')[0])
  return names
}

try {
  process.exitCode = await main()
} catch (err) {
  console.error(`预渲染失败：${err.message}`)
  process.exitCode = 1
}
