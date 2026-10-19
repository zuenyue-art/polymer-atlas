#!/usr/bin/env node
/**
 * 生成 robots.txt 与 sitemap.xml，并校验 HTML 里的分享卡片信息是否与站点地址一致。
 *
 * 用法：
 *   node scripts/build-seo.mjs            # 写入 dist/robots.txt 与 dist/sitemap.xml
 *   node scripts/build-seo.mjs --check    # 只校验，不写文件
 *   SITE_ORIGIN=https://example.com node scripts/build-seo.mjs
 *
 * 站点地址与材料页路径都取自 scripts/site.mjs（可用环境变量 SITE_ORIGIN 覆盖），
 * 绑定自定义域名后不用改这里的代码。
 *
 * sitemap 收录哪三类页面：
 *   /                     首页
 *   /c/<slug>/            每个分类一页，由 scripts/prerender.mjs 生成
 *   /m/<id>/              每个材料一页，由 scripts/prerender.mjs 生成
 *
 * 不收的页面：
 *   news.html   跳转存根（news.js 里 location.replace 到 index.html#news）。
 *               收录会跳转的 URL 只是浪费抓取配额；它的 canonical 仍然保留，
 *               用来告诉爬虫「这个旧地址和首页是同一份内容」。
 *   #<视图>     hash 路由下的单页状态，不是独立 URL，本来也进不了 sitemap。
 *
 * 材料页必须是同一批生成的，所以这里把「每条材料都有预渲染页」当成硬条件：
 * 少一页就让构建失败，而不是安静地少收录一条内容。
 */

import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { SITE_ORIGIN, categoryPath, categoryUrl, materialPath, materialUrl } from './site.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

const CHECK_ONLY = process.argv.includes('--check')

const readJson = async rel => JSON.parse(await readFile(path.join(DIST, rel), 'utf8'))
const exists = async rel => {
  try {
    await access(path.join(DIST, rel))
    return true
  } catch {
    return false
  }
}
const escapeXml = s =>
  s.replace(
    /[<>&'"]/g,
    c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]
  )
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s)

// ---------- 1. 校验 HTML 里的分享卡片信息 ----------

// 允许属性换行排列（prettier 会把长的 meta 折行），只关心「哪个 meta 的 content 是什么」
const metaContent = (html, attr) => {
  const tag = new RegExp(`<meta[^>]*${attr}[^>]*>`, 'i').exec(html)?.[0] ?? ''
  return tag.match(/content\s*=\s*"([^"]*)"/i)?.[1] ?? ''
}

const problems = []
for (const [file, requiredPath] of [
  ['index.html', '/'],
  ['news.html', '/news.html']
]) {
  const html = await readFile(path.join(DIST, file), 'utf8')
  const expected = `${SITE_ORIGIN}${requiredPath}`
  const ogUrl = metaContent(html, 'property="og:url"')
  const ogImage = metaContent(html, 'property="og:image"')

  for (const [name, value] of [
    ['og:title', metaContent(html, 'property="og:title"')],
    ['og:description', metaContent(html, 'property="og:description"')],
    ['og:url', ogUrl],
    ['og:image', ogImage],
    ['twitter:card', metaContent(html, 'name="twitter:card"')]
  ]) {
    if (!value) problems.push(`${file} 缺少 ${name}`)
  }
  if (ogUrl && ogUrl !== expected) problems.push(`${file} 的 og:url 是 ${ogUrl}，应为 ${expected}`)
  if (ogImage) {
    const rel = ogImage.replace(SITE_ORIGIN, '').replace(/^\//, '')
    if (!(await exists(rel))) problems.push(`${file} 的 og:image 指向不存在的文件：${rel}`)
  }
}

// ---------- 2. 收集页面 ----------

const data = await readJson('data.json')

const homeLastmod = isDate(data.updated_at) ? data.updated_at : null
if (!homeLastmod) problems.push('data.json 缺少 updated_at，无法生成 lastmod')

const materials = Array.isArray(data.materials) ? data.materials : []
const pages = [
  { loc: `${SITE_ORIGIN}/`, priority: '1.0', changefreq: 'weekly', lastmod: homeLastmod }
]

// 分类页先于材料页入表：它是从首页到材料的中间层，权重也略高一点。
// categoryPath 对未登记的分类会抛错，这里不额外兜——让它在构建期就炸出来。
const categories = [...new Set(materials.map(m => m.category))]
const missingCategoryPages = []
for (const name of categories) {
  const rel = categoryPath(name).replace(/^\//, '') + 'index.html'
  if (!(await exists(rel))) missingCategoryPages.push(name)
  pages.push({
    loc: categoryUrl(name),
    priority: '0.7',
    changefreq: 'monthly',
    lastmod: homeLastmod
  })
}
if (missingCategoryPages.length) {
  problems.push(
    `${missingCategoryPages.length} 个分类没有预渲染页（例如 ${missingCategoryPages.slice(0, 3).join('、')}），` +
      '先跑 node scripts/prerender.mjs'
  )
}

const missingPages = []
for (const m of materials) {
  if (!m?.id) continue
  const rel = materialPath(m.id).replace(/^\//, '') + 'index.html'
  if (!(await exists(rel))) missingPages.push(m.id)
  pages.push({
    loc: materialUrl(m.id),
    priority: '0.6',
    changefreq: 'monthly',
    lastmod: homeLastmod
  })
}
if (missingPages.length) {
  problems.push(
    `${missingPages.length} 条材料没有预渲染页（例如 ${missingPages.slice(0, 3).join('、')}），` +
      '先跑 node scripts/prerender.mjs'
  )
}

// ---------- 3. 校验失败则退出 ----------

if (problems.length) {
  console.error('站点元信息不完整，先修好再生成 sitemap：')
  for (const p of problems) console.error(`  · ${p}`)
  process.exit(1)
}

if (CHECK_ONLY) {
  console.log(
    `站点元信息校验通过（首页元信息齐全，${categories.length} 个分类页与 ${materials.length} 条材料页均已预渲染）。`
  )
  process.exit(0)
}

// ---------- 4. 写出 robots.txt 与 sitemap.xml ----------

const robots = ['User-agent: *', 'Allow: /', '', `Sitemap: ${SITE_ORIGIN}/sitemap.xml`, ''].join(
  '\n'
)

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...pages.map(p =>
    [
      '  <url>',
      `    <loc>${escapeXml(p.loc)}</loc>`,
      p.lastmod ? `    <lastmod>${escapeXml(p.lastmod)}</lastmod>` : null,
      `    <changefreq>${p.changefreq}</changefreq>`,
      `    <priority>${p.priority}</priority>`,
      '  </url>'
    ]
      .filter(Boolean)
      .join('\n')
  ),
  '</urlset>',
  ''
].join('\n')

await writeFile(path.join(DIST, 'robots.txt'), robots, 'utf8')
await writeFile(path.join(DIST, 'sitemap.xml'), sitemap, 'utf8')

console.log(
  `已生成 robots.txt（1 条 Sitemap 声明）与 sitemap.xml（${pages.length} 个页面：首页 + ${categories.length} 个分类 + ${materials.length} 条材料）。`
)
console.log(`站点地址：${SITE_ORIGIN}`)
