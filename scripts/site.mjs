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
