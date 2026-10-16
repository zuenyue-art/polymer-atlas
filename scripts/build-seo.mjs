#!/usr/bin/env node
/**
 * 生成 robots.txt 与 sitemap.xml，并校验 HTML 里的分享卡片信息是否与站点地址一致。
 *
 * 用法：
 *   node scripts/build-seo.mjs            # 写入 dist/robots.txt 与 dist/sitemap.xml
 *   node scripts/build-seo.mjs --check    # 只校验 HTML 元信息，不写文件
 *   SITE_ORIGIN=https://example.com node scripts/build-seo.mjs
 *
 * 站点地址默认取生产域名，可用环境变量 SITE_ORIGIN 覆盖（例如绑定自定义域名后）。
 *
 * 目前 sitemap 只收录首页 /。news.html 是跳转存根，材料详情是 hash 路由下的单页内容，
 * 二者都不属于独立 URL，不能写进 sitemap；等以后做了预渲染（dist/m/<id>/index.html），
 * 本脚本会自动把材料页收录进来，无需改代码。
 */

import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

export const SITE_ORIGIN = (
  process.env.SITE_ORIGIN || 'https://polymer-atlas.zuenyue.workers.dev'
).replace(/\/+$/, '')
export const SITE_NAME = '高分子材料图鉴'

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
if (!homeLastmod) problems.push('data.json 缺少 updated_at，无法生成首页的 lastmod')

// news.html 是个跳转存根（news.js 里 location.replace 到 index.html#news），
// sitemap 不应收录会跳转的 URL，所以这里只列真实页面；它的 canonical 仍保留，
// 用来告诉爬虫「这个旧地址和首页是同一份内容」。
const pages = [
  { loc: `${SITE_ORIGIN}/`, priority: '1.0', changefreq: 'weekly', lastmod: homeLastmod }
]

// 预渲染页面就位后自动收录
const materials = Array.isArray(data.materials) ? data.materials : []
let prerendered = 0
for (const m of materials) {
  if (!m?.id) continue
  const rel = `m/${encodeURIComponent(m.id)}/index.html`
  if (await exists(rel)) {
    prerendered += 1
    pages.push({
      loc: `${SITE_ORIGIN}/m/${encodeURIComponent(m.id)}/`,
      priority: '0.6',
      changefreq: 'monthly',
      lastmod: homeLastmod
    })
  }
}

// ---------- 3. 校验失败则退出 ----------

if (problems.length) {
  console.error('分享卡片信息不完整，先修 HTML 再生成 sitemap：')
  for (const p of problems) console.error(`  · ${p}`)
  process.exit(1)
}

if (CHECK_ONLY) {
  console.log(`分享卡片信息校验通过（${prerendered} 条材料已预渲染）。`)
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
  `已生成 robots.txt（1 条 Sitemap 声明）与 sitemap.xml（${pages.length} 个页面，其中预渲染材料页 ${prerendered} 个）。`
)
console.log(`站点地址：${SITE_ORIGIN}`)
