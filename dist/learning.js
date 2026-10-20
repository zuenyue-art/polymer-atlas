export const escapeHtml = v =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
export function materialKey(abbr) {
  if (/PPE|PPO/.test(abbr)) return 'PPE'
  if (/TPEE|TPC-ET/.test(abbr)) return 'TPEE'
  if (/PEBA|TPAE/.test(abbr)) return 'PEBA'
  return abbr
}
const families = [
  { keys: ['PET', 'PTT', 'PBT', 'TPEE'], label: '聚酯与聚酯硬段关联' },
  { keys: ['PA6', 'PA66', 'PA11', 'PA12', 'PEBA', 'TPEE', 'TPU'], label: '聚酰胺与嵌段弹性体关联' },
  { keys: ['PPE', 'PS', 'PA6', 'PA66'], label: '聚苯醚合金的常见关联材料' }
]
/**
 * 关联材料的次序要能解释。
 *
 * 原来除了三组写死的家族关系，其余一律取「同分类前 4 条」——那 4 条是 data.json
 * 的排列顺序，跟当前材料没有关系，读者看不出为什么给他看这几条。
 *
 * 现在同分类内分三档，每档都把理由写在卡片上：
 *   1. 正文提到（正文出现对方的中文全名）——最强，说明内容上确有牵连；
 *   2. 数值最接近（共有字段里相对差最小的一项）——同分类里参数最像的那几条；
 *   3. 仅同分类——以上都没有时的兜底，标签如实写「同分类」。
 * 理由只是「为什么把它们排在一起」，不代表可以直接替代，说明句里仍然撇清。
 */
const num = v => (Number.isInteger(v) ? v : Number(Number(v).toFixed(2)))
const collator = new Intl.Collator('zh-Hans-CN', { numeric: true })

/**
 * 正文提到：只认中文全名，不认缩写。
 * 缩写会撞——`CO` 可能是结构式里的酮基，`PP` 可能是 `PPE` 的子串；
 * 而中文全名几乎不会在讲别的东西时顺带出现。
 * 先把自身名称从文本里抹掉，否则「聚乙烯醇」会把「聚乙烯」当成自己提到的。
 */
function mentions(m, x) {
  const name = x.fields['材料名称']
  if (!name) return false
  const self = m.fields['材料名称'] || '\u0000'
  return Object.values(m.fields).some(v =>
    String(v ?? '')
      .split(self)
      .join('\u0000')
      .includes(name)
  )
}

/**
 * 共有数值字段里最像的一项，同时给出「怎么像」的说法。
 *
 * 区间字段（加工温度）不能只报下限差：下限都是 160 的两条材料，上限可能差 40 ℃，
 * 「下限差 0」读起来却像「加工窗口一样」。所以区间按重叠程度算相似度，
 * 理由也按「相同／有重叠／不重叠」分三种说法。
 */
function nearestProp(m, x, spec) {
  const pa = m.props || {},
    pb = x.props || {}
  let best = null
  for (const s of spec || []) {
    const va = pa[s.key],
      vb = pb[s.key]
    if (va == null || vb == null) continue
    let rel, label
    if (Array.isArray(va) && Array.isArray(vb)) {
      const inter = Math.max(0, Math.min(va[1], vb[1]) - Math.max(va[0], vb[0]))
      const union = Math.max(va[1], vb[1]) - Math.min(va[0], vb[0])
      rel = union > 0 ? 1 - inter / union : 1
      const same = va[0] === vb[0] && va[1] === vb[1]
      const unit = s.unit ? ` ${s.unit}` : ''
      label = same
        ? `${s.label}区间相同`
        : inter > 0
          ? `${s.label}区间有重叠`
          : `${s.label}下限差 ${num(Math.abs(va[0] - vb[0]))}${unit}`
    } else {
      if (typeof va !== 'number' || typeof vb !== 'number') continue
      rel = Math.abs(va - vb) / Math.max(Math.abs(va), Math.abs(vb), 1e-9)
      const unit = s.unit ? ` ${s.unit}` : ''
      label = `${s.label}差 ${num(Math.abs(va - vb))}${unit}`
    }
    if (!best || rel < best.rel) best = { spec: s, rel, label }
  }
  return best
}

export function relatedMaterials(m, all, spec) {
  const key = materialKey(m.fields['英文缩写'])
  const groups = families.filter(g => g.keys.includes(key))
  const seen = new Set([key])
  const results = []
  for (const g of groups)
    for (const k of g.keys) {
      if (seen.has(k)) continue
      const found = all.find(x => x.id !== m.id && materialKey(x.fields['英文缩写']) === k)
      if (found) {
        seen.add(k)
        results.push({ material: found, label: g.label })
      }
    }
  if (results.length) return results.slice(0, 5)

  const ranked = all
    .filter(
      x => x.id !== m.id && x.category === m.category && materialKey(x.fields['英文缩写']) !== key
    )
    .map(x => {
      if (mentions(m, x)) return { material: x, label: '正文提到', score: 200 }
      const near = nearestProp(m, x, spec)
      if (near) return { material: x, label: near.label, score: 100 + (1 - near.rel) * 50 }
      return { material: x, label: '同分类', score: 0 }
    })
  // 同分按名称排，保证同一份数据每次得到同样的顺序
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      collator.compare(a.material.fields['材料名称'], b.material.fields['材料名称'])
  )
  return ranked.slice(0, 4)
}
export function relatedMarkup(m, all, spec) {
  const list = relatedMaterials(m, all, spec)
  if (!list.length) return ''
  const e = escapeHtml
  return `<section class="related-materials"><h3>关联材料</h3><p>同分类里优先给出正文提到的、或数值最接近的几条；关联不表示性能相同或能够直接替代。</p><div>${list.map(({ material: x, label }) => `<button class="related-material" data-related="${e(x.id)}"><strong>${e(x.fields['英文缩写'])}</strong><span>${e(x.fields['材料名称'])}</span><small>${e(label)} ↗</small></button>`).join('')}</div></section>`
}
const normalize = v =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
/**
 * 对比表里的数值行。
 *
 * 和文字行分开算，因为语义不一样：文字比的是「表述是否一样」，数值比的是
 * 「大小是否一样」，而且数值可能压根没填——没填要显示成「—」而不是「未收录」，
 * 后者会被读成「测过，结果是没这回事」。
 *
 * 区间字段（加工温度）按下限比：判断「谁更容易加工」看的是下限。
 */
export function comparisonPropRows(materials, spec) {
  const num = v =>
    typeof v === 'number' && Number.isInteger(v)
      ? v
      : typeof v === 'number'
        ? Number(v.toFixed(2))
        : v
  return (spec || [])
    .filter(s => materials.some(m => (m.props || {})[s.key] != null))
    .map(s => {
      const raw = materials.map(m => (m.props || {})[s.key] ?? null)
      const values = raw.map(v => {
        if (v == null) return ''
        return Array.isArray(v) ? `${num(v[0])} ~ ${num(v[1])}` : `${num(v)}`
      })
      const flat = raw.filter(v => v != null).map(v => (Array.isArray(v) ? v[0] : v))
      return {
        key: s.key,
        label: s.label,
        unit: s.unit,
        values,
        // 有材料没填就不能判「相同」：一只 78 ℃、另一只没填，结论是「不知道」，
        // 不是「一样」。判成相同的话勾上「只看差异」会连这一行一起吃掉。
        same: flat.length === materials.length && new Set(flat).size === 1
      }
    })
}
export function comparisonRows(materials) {
  const fields = [...new Set(materials.flatMap(m => Object.keys(m.fields)))].filter(
    k => !['材料名称', '英文缩写', '参考来源与核验范围'].includes(k)
  )
  return fields.map(key => {
    const values = materials.map(m => m.fields[key] ?? '')
    const normalized = values.map(normalize)
    return {
      key,
      values,
      same: new Set(normalized).size === 1,
      shared: normalized.map(v => normalized.filter(x => x === v).length > 1)
    }
  })
}
export const termAliases = [
  ['玻璃化转变', 'Tg 玻璃化转变'],
  ['Tg', 'Tg 玻璃化转变'],
  ['Tm', 'Tm 熔点'],
  ['HDT', 'HDT与长期耐温'],
  ['结晶度', '结晶性与交联'],
  ['结晶性', '结晶性与交联'],
  ['交联', '结晶性与交联'],
  ['醇解', '醇解、水解、氨解'],
  ['水解', '吸水与水解'],
  ['氨解', '醇解、水解、氨解'],
  ['BHET', 'BHET/BHPT/BHBT'],
  ['BHPT', 'BHET/BHPT/BHBT'],
  ['BHBT', 'BHET/BHPT/BHBT'],
  ['TPA', 'TPA/DMT/EG/PDO/BDO'],
  ['DMT', 'TPA/DMT/EG/PDO/BDO'],
  ['PTMG', 'PTMG/PTMEG/PEG'],
  ['PTMEG', 'PTMG/PTMEG/PEG'],
  ['PEG', 'PTMG/PTMEG/PEG'],
  ['软段', '软段与硬段'],
  ['硬段', '软段与硬段'],
  ['单体收率', '单体收率、纯度、选择性'],
  ['选择性', '单体收率、纯度、选择性'],
  ['金属浸出', '催化剂回收与浸出']
]
termAliases.push(
  ['溶胀', '溶解与溶胀'],
  ['蠕变', '蠕变与应力松弛'],
  ['应力松弛', '蠕变与应力松弛'],
  ['热史', '热史'],
  ['聚合度', '聚合度 DP'],
  ['黏弹性', '黏弹性'],
  ['增容', '共混、相容与增容'],
  ['DSC', 'DSC 差示扫描量热'],
  ['TGA', 'TGA / DTG 热重分析'],
  ['DTG', 'TGA / DTG 热重分析'],
  ['DMA', 'DMA 动态力学分析'],
  ['FTIR', 'FTIR 红外光谱'],
  ['NMR', 'NMR 核磁共振'],
  ['GC', 'GC与HPLC'],
  ['HPLC', 'GC与HPLC'],
  ['SEC', 'SEC / GPC'],
  ['GPC', 'SEC / GPC'],
  ['MFR', 'MFR与熔体流动性']
)
export function termMatches(text, terms) {
  const available = termAliases
    .map(([alias, title]) => ({
      alias,
      index: terms.findIndex(x => x['术语/阅读规则'] === title)
    }))
    .filter(x => x.index >= 0)
    .sort((a, b) => b.alias.length - a.alias.length)
  if (!available.length) return []
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(
    available
      .map(x =>
        /^[A-Za-z]+$/.test(x.alias)
          ? `(?<![A-Za-z0-9_])${escape(x.alias)}(?![A-Za-z0-9_])`
          : escape(x.alias)
      )
      .join('|'),
    'g'
  )
  return [...String(text).matchAll(regex)].map(m => ({
    start: m.index,
    text: m[0],
    index: available.find(x => x.alias === m[0]).index
  }))
}
/**
 * 术语反查：正文里提到这个概念的材料。
 *
 * 别名表与正文高亮共用同一份 termAliases——否则会出现「正文里高亮着 Tg，
 * 术语却说自己没有被任何材料提到」这种自相矛盾。没有别名、或确实没材料提到的
 * 术语，直接返回空数组，界面上那块就不出现，不做「猜一个相关材料」。
 */
export function materialsForTerm(term, all) {
  const title = term['术语/阅读规则']
  const aliases = termAliases.filter(([, t]) => t === title).map(([a]) => a)
  if (!aliases.length) return []
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // ASCII 别名要卡边界：`Tm` 不能命中 `Tmax`，`GC` 不能命中 `GPC`
  const source = aliases
    .map(a => (/^[A-Za-z]+$/.test(a) ? `(?<![A-Za-z0-9_])${escape(a)}(?![A-Za-z0-9_])` : escape(a)))
    .join('|')
  const count = m => (Object.values(m.fields).join(' ').match(new RegExp(source, 'g')) || []).length
  return all
    .map(m => ({ material: m, count: count(m) }))
    .filter(x => x.count > 0)
    .sort(
      (a, b) =>
        b.count - a.count ||
        collator.compare(a.material.fields['材料名称'], b.material.fields['材料名称'])
    )
}
export function annotateTerms(root, terms) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) {
    const n = walker.currentNode
    if (
      n.parentElement.closest('p,dd') &&
      !n.parentElement.closest(
        'button,a,.formula,.source-text,svg,.structure-figure,.related-materials'
      )
    )
      nodes.push(n)
  }
  for (const n of nodes) {
    const matches = termMatches(n.textContent, terms)
    if (!matches.length) continue
    const fragment = document.createDocumentFragment()
    let at = 0
    for (const m of matches) {
      fragment.append(document.createTextNode(n.textContent.slice(at, m.start)))
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'inline-term'
      b.dataset.termHelp = String(m.index)
      b.textContent = m.text
      b.setAttribute('aria-label', `解释术语：${m.text}`)
      b.setAttribute('aria-haspopup', 'dialog')
      fragment.append(b)
      at = m.start + m.text.length
    }
    fragment.append(document.createTextNode(n.textContent.slice(at)))
    n.replaceWith(fragment)
  }
}
