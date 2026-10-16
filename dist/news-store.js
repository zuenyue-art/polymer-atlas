const cache = new Map()
let manifestPromise
async function json(url) {
  const r = await fetch(url, { cache: 'no-cache' })
  if (!r.ok) throw Error('动态载入失败')
  return r.json()
}
export function getNewsIndex() {
  if (!manifestPromise)
    manifestPromise = (globalThis.window?.atlasNewsIndexRequest || json('news-index.json')).catch(
      e => {
        manifestPromise = null
        if (globalThis.window) window.atlasNewsIndexRequest = null
        throw e
      }
    )
  return manifestPromise
}
async function loadMonth(m) {
  if (!cache.has(m.month))
    cache.set(
      m.month,
      json(m.url).catch(e => {
        cache.delete(m.month)
        throw e
      })
    )
  return cache.get(m.month)
}
export async function getNewsItems({ month = '', all = false, limit = 12 } = {}) {
  const index = await getNewsIndex()
  let count = 0
  const selected = []
  for (const m of index.months) {
    if (month && m.month !== month) continue
    selected.push(m)
    count += m.count
    if (!all && !month && count >= limit) break
  }
  const parts = await Promise.all(selected.map(loadMonth))
  return parts.flatMap(x => x.items)
}
