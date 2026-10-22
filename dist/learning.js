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
/**
 * 关联块的说明句。图鉴（app.js 经 relatedMarkup）与预渲染的独立页（prerender.mjs）
 * 共用这一份：两处推荐的次序本来就是同一个函数算出来的，说明句再各写一份就会
 * 出现「同一条材料在图鉴里说是 A、在独立页里说是 B」。
 *
 * 不说「同分类」：家族关系是跨分类的（聚酯那一组横跨塑料与弹性体），写了会与
 * 实际结果矛盾。
 */
export const RELATED_NOTE =
  '按结构关联、正文提到或数值最接近挑出；关联不表示性能相同，也不代表可以直接替代。'

export function relatedMarkup(m, all, spec) {
  const list = relatedMaterials(m, all, spec)
  if (!list.length) return ''
  const e = escapeHtml
  return `<section class="related-materials"><h3>关联材料</h3><p>${RELATED_NOTE}</p><div>${list.map(({ material: x, label }) => `<button class="related-material" data-related="${e(x.id)}"><strong>${e(x.fields['英文缩写'])}</strong><span>${e(x.fields['材料名称'])}</span><small>${e(label)} ↗</small></button>`).join('')}</div></section>`
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
/**
 * 对比结果排成 TSV：贴进 Excel 直接是一张表，贴进邮件也看得出哪一格属于谁。
 *
 * 表头用「缩写（全名）」而不是只用缩写——收到表的人未必认得 PET 和 PBT 的
 * 全称；只用全名又太宽，一眼扫不出是哪几条。两样都给。
 * 数值表和文本表之间隔一个空行：数值行和整段文字混在一起，读的人分不清
 * 哪几行是数、哪几行是描述。空行在 Excel 里也正好把两块分开。
 * 没填的数值写「—」，与表格里一致，不用 0 冒充。
 */
export function comparisonTsv(materials, rows, propRows) {
  const cell = v => String(v ?? '').replace(/[\t\r\n]+/g, ' ')
  const line = cells => cells.map(cell).join('\t')
  const head = line([
    '比较维度',
    ...materials.map(m => {
      const abbr = m.fields['英文缩写'],
        name = m.fields['材料名称']
      return abbr ? `${abbr}（${name}）` : name
    })
  ])
  const numeric = (propRows || []).map(r =>
    line([r.unit ? `${r.label}（${r.unit}）` : r.label, ...r.values.map(v => v || '—')])
  )
  const text = rows.map(r => line([r.key, ...r.values.map(v => v || '未收录')]))
  const gap = numeric.length && text.length ? [''] : []
  return [head, ...numeric, ...gap, ...text].join('\n')
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
/**
 * 第二批别名：把原本没有别名的术语也接上正文。
 *
 * 收录口径只有一个——「正文里出现这个词，就该指向这条术语」。所以像「强度」
 * （42 条材料都提，跟模量那条术语无关）、「吸附」（絮凝语境讲的是吸附架桥，
 * 不是层析的吸附洗脱）这种看着相关、实则泛或歧义的词一律不收：收进来正文
 * 会到处是链接，反查结果也失去意义。命中为 0 的词照样收，正文以后写到就该亮。
 */
termAliases.push(
  // 结构与聚合
  ['热塑性', '热塑性与热固性'],
  ['热固性', '热塑性与热固性'],
  ['重复单元', '单体、重复单元与聚合物'],
  ['DP', '聚合度 DP'],
  ['共聚物', '均聚物与共聚物'],
  ['嵌段', '无规、交替、嵌段与接枝'],
  ['接枝', '无规、交替、嵌段与接枝'],
  ['线型', '线型、支化与网络'],
  ['支化', '线型、支化与网络'],
  ['构型', '构型与构象'],
  ['构象', '构型与构象'],
  ['等规', '立构规整性'],
  ['间规', '立构规整性'],
  ['立构规整', '立构规整性'],
  ['链增长', '链增长与逐步聚合'],
  ['逐步聚合', '链增长与逐步聚合'],
  ['内酯', '内酯 Lactone'],
  ['Lactone', '内酯 Lactone'],
  ['内酰胺', '内酰胺 Lactam'],
  ['Lactam', '内酰胺 Lactam'],
  ['聚酯酰胺', '聚酯酰胺 Poly(ester amide)'],
  ['FDCA', 'FDCA与PEF：单体和聚酯的区别'],
  ['PEF', 'FDCA与PEF：单体和聚酯的区别'],
  ['异山梨醇', '异山梨醇 Isosorbide'],
  ['Isosorbide', '异山梨醇 Isosorbide'],
  ['PISA', 'PISA/PISOX/PEIT/PEIF 生物基聚酯平台'],
  ['PISOX', 'PISA/PISOX/PEIT/PEIF 生物基聚酯平台'],
  ['PEIT', 'PISA/PISOX/PEIT/PEIF 生物基聚酯平台'],
  ['PEIF', 'PISA/PISOX/PEIT/PEIF 生物基聚酯平台'],
  // 热学与力学
  ['吸水', '吸水与水解'],
  ['热变形温度', 'HDT与长期耐温'],
  ['玻璃态', '玻璃态、橡胶态与黏流'],
  ['橡胶态', '玻璃态、橡胶态与黏流'],
  ['黏流态', '玻璃态、橡胶态与黏流'],
  ['冷结晶', '冷结晶与退火'],
  ['退火', '冷结晶与退火'],
  ['模量', '模量、强度与韧性'],
  ['韧性', '模量、强度与韧性'],
  // 加工与配方
  ['分子量', '分子量与黏度'],
  ['黏度', '分子量与黏度'],
  ['特性黏数', '分子量与黏度'],
  ['溶解', '溶解与溶胀'],
  ['增塑', '增塑、填充与增强'],
  ['增强', '增塑、填充与增强'],
  ['共混', '共混、相容与增容'],
  ['相容', '共混、相容与增容'],
  ['干燥', '干燥与调湿'],
  ['调湿', '干燥与调湿'],
  ['剪切变稀', '剪切变稀'],
  ['假塑性', '剪切变稀'],
  ['熔融指数', 'MFR与熔体流动性'],
  ['熔体流动', 'MFR与熔体流动性'],
  // 测试与表征
  ['Mn', 'Mn、Mw与分散系数 Đ'],
  ['Mw', 'Mn、Mw与分散系数 Đ'],
  ['分散系数', 'Mn、Mw与分散系数 Đ'],
  // 回收与分离
  ['机械回收', '物理回收'],
  ['化学回收', '化学回收与解聚'],
  ['解聚', '化学回收与解聚'],
  ['转化率', '转化率与分离收率'],
  ['分离收率', '转化率与分离收率'],
  ['溶剂分离', '溶剂分离与化学解聚'],
  ['重结晶', '结晶与重结晶纯化'],
  ['萃取', '萃取与分配'],
  ['蒸馏', '蒸馏与减压蒸馏'],
  ['减压蒸馏', '蒸馏与减压蒸馏'],
  ['膜分离', '过滤与膜分离'],
  ['洗脱', '吸附与洗脱'],
  ['闭环回收', '闭环与开环回收'],
  ['开环回收', '闭环与开环回收'],
  // 回收产物与口径
  ['EG', 'TPA/DMT/EG/PDO/BDO'],
  ['PDO', 'TPA/DMT/EG/PDO/BDO'],
  ['BDO', 'TPA/DMT/EG/PDO/BDO'],
  ['PPE', 'PPE/PPO/26DMBQ'],
  ['PPO', 'PPE/PPO/26DMBQ'],
  ['26DMBQ', 'PPE/PPO/26DMBQ'],
  ['纯度', '单体收率、纯度、选择性'],
  ['浸出', '催化剂回收与浸出'],
  ['质量衡算', '质量衡算与碳衡算'],
  ['碳衡算', '质量衡算与碳衡算'],
  ['空白试验', '空白、对照与重复试验'],
  ['对照试验', '空白、对照与重复试验'],
  ['重复试验', '空白、对照与重复试验'],
  ['质量分数', '质量分数、摩尔分数与配比'],
  ['摩尔分数', '质量分数、摩尔分数与配比'],
  ['低聚物', '单体、低聚物与宏二醇'],
  ['宏二醇', '单体、低聚物与宏二醇'],
  ['母液', '母液与杂质累积'],
  ['杂质累积', '母液与杂质累积'],
  ['纯度校正', '纯度校正收率'],
  ['PFAS', 'PFAS 全氟和多氟烷基物质'],
  ['全氟', 'PFAS 全氟和多氟烷基物质'],
  ['PFHxA', 'PFHxA 全氟己酸'],
  ['全氟己酸', 'PFHxA 全氟己酸']
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
/**
 * 把正文里出现的术语变成可解释的小按钮。
 *
 * attr 决定「点了以后去哪」：默认走 data-term-help（弹一张速读卡）；术语自己的
 * 解释里要用另一种（换当前卡片），见 app.js 的 linkifyTerms。
 * skip 里的术语不包成按钮——在自己的解释里提到自己的名字，点它是原地打转。
 */
export function annotateTerms(root, terms, { skip = [], attr = 'termHelp' } = {}) {
  const skipSet = new Set(skip)
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
      if (skipSet.has(m.index)) continue
      fragment.append(document.createTextNode(n.textContent.slice(at, m.start)))
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'inline-term'
      b.dataset[attr] = String(m.index)
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
