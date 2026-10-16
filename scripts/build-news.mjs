import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  dist = path.join(root, 'dist'),
  feed = JSON.parse(fs.readFileSync(path.join(dist, 'news.json'), 'utf8'))
const months = [...new Set(feed.items.map(x => x.published_at.slice(0, 7)))].sort().reverse()
fs.mkdirSync(path.join(dist, 'news'), { recursive: true })
const index = {
  version: 1,
  updated_at: feed.updated_at,
  checked_at: feed.checked_at,
  total: feed.items.length,
  materials: [...new Set(feed.items.flatMap(x => x.materials))].sort(),
  kinds: [...new Set(feed.items.map(x => x.kind))].sort(),
  months: months.map(month => ({
    month,
    count: feed.items.filter(x => x.published_at.startsWith(month)).length,
    url: `news/${month}.json`
  }))
}
fs.writeFileSync(path.join(dist, 'news-index.json'), JSON.stringify(index, null, 2) + '\n')
for (const month of months)
  fs.writeFileSync(
    path.join(dist, 'news', month + '.json'),
    JSON.stringify({ items: feed.items.filter(x => x.published_at.startsWith(month)) }, null, 2) +
      '\n'
  )
console.log(`Archived ${feed.items.length} entries across ${months.length} months`)
