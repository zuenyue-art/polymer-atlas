/**
 * 站点级常量与地址拼接。
 *
 * 预渲染与 SEO 两个脚本都要知道「站点在哪、材料页叫什么」，各写一份迟早会
 * 在绑定自定义域名时对不上，所以集中在这里，用 SITE_ORIGIN 一处覆盖。
 *
 * 用法：
 *   SITE_ORIGIN=https://example.com/atlas node scripts/prerender.mjs
 */

// 末尾的斜杠一律去掉，拼地址时只由 BASE_PATH 负责分隔。
export const SITE_ORIGIN = (
  process.env.SITE_ORIGIN || 'https://polymer-atlas.zuenyue.workers.dev'
).replace(/\/+$/, '')

export const SITE_NAME = '高分子材料图鉴'

export const SITE_TAGLINE = '结构、性能、加工与回收，让材料知识更好查，也更好懂。'

// 站点部署路径。workers.dev 上是 '/'；如果哪天挂到域名子路径下（/atlas/），
// 页面里的绝对链接与 canonical 要跟着走，所以从站点地址里推导而不是写死。
export const BASE_PATH = new URL(SITE_ORIGIN).pathname.replace(/\/+$/, '/')

/** 材料页在站内的路径，例如 /m/m-0-0/ —— 末尾的斜杠是必须的，见 sitemap 注释。 */
export const materialPath = id => `${BASE_PATH}m/${encodeURIComponent(id)}/`

/** 材料页的完整地址，用作 canonical 与 og:url。 */
export const materialUrl = id => `${SITE_ORIGIN}${materialPath(id)}`

/** 首页地址。 */
export const homeUrl = () => `${SITE_ORIGIN}${BASE_PATH}`

/**
 * 分类页的地址片段。
 *
 * 分类名是中文的，直接进 URL 编码出来是一串 %E6%A9%A1…：既读不出来也没法口述
 * 分享，而且 Workers 匹配静态资源时对百分号路径的解码行为不好赌。所以每个分类
 * 显式登记一个英文片段。data.json 里出现没登记的分类时构建直接失败——宁可逼着
 * 补一行，也不要悄悄生成一个难看又难记的地址。
 */
const CATEGORY_SLUGS = {
  通用塑料: 'commodity-plastics',
  工程塑料: 'engineering-plastics',
  特种工程塑料: 'high-performance-plastics',
  橡胶弹性体: 'elastomers',
  合成纤维高分子: 'synthetic-fibers',
  热固性树脂: 'thermosets',
  功能高分子: 'functional-polymers',
  天然高分子: 'natural-polymers',
  生物可降解高分子: 'biodegradable-polymers'
}

/** 分类名 → 地址片段。未登记的分类抛错，由构建拦下。 */
export const categorySlug = name => {
  const slug = CATEGORY_SLUGS[name]
  if (!slug)
    throw Error(
      `分类「${name}」没有登记地址片段。请在 scripts/site.mjs 的 CATEGORY_SLUGS 里补上，再重跑构建。`
    )
  return slug
}

/** 分类页在站内的路径，例如 /c/elastomers/ —— 末尾斜杠同材料页，见 sitemap 注释。 */
export const categoryPath = name => `${BASE_PATH}c/${categorySlug(name)}/`

/** 分类页的完整地址，用作 canonical 与 og:url。 */
export const categoryUrl = name => `${SITE_ORIGIN}${categoryPath(name)}`
