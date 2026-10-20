import { newsCard } from './news-utils.js'
import { getNewsItems } from './news-store.js'
import { mountNews, NEWS_TEMPLATE } from './news-view.js'
let relatedMarkup,
  comparisonRows,
  comparisonPropRows,
  annotateTerms,
  recyclingFigure,
  structureFigure
const $ = s => document.querySelector(s)
const esc = v =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
let DATA,
  view = 'news',
  category = '全部材料',
  onlyFavorites = false,
  selected = [],
  favorites = new Set()
try {
  const saved = JSON.parse(localStorage.getItem('polymer-atlas-favorites') || '[]')
  if (Array.isArray(saved)) favorites = new Set(saved.filter(x => typeof x === 'string'))
} catch {}
// 对比选择也记在本机：勾好两只材料去别的页面看一眼，回来不该从头再勾一遍。
// 这里只读原始 id，等 data.json 到位后再过滤掉已经不存在的（见 ensureAtlas）。
try {
  const picked = JSON.parse(localStorage.getItem('polymer-atlas-compare') || '[]')
  if (Array.isArray(picked)) selected = picked.filter(x => typeof x === 'string')
} catch {}
let toastTimer
const detailSelections = new Map()
let termCategory = '全部知识'
let TERM_GUIDE = []
function toast(message) {
  $('#toast').textContent = message
  $('#toast').classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2200)
}

const NEWS_FAVORITES = 'polymer-atlas-news-favorites'
function readSaved(key) {
  try {
    const a = JSON.parse(localStorage.getItem(key) || '[]')
    return new Set(Array.isArray(a) ? a.filter(x => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}
function toggleSaved(key, id) {
  const set = readSaved(key)
  set.has(id) ? set.delete(id) : set.add(id)
  try {
    localStorage.setItem(key, JSON.stringify([...set]))
  } catch {
    toast('浏览器未允许保存收藏')
  }
  if (window.dispatchEvent) window.dispatchEvent(new Event('atlas-favorites-changed'))
  return set
}
let favoriteType = '全部',
  favoriteNews = [],
  favoriteNewsState = 'idle',
  favoriteRevision = 0
function updateFavoriteCount() {
  const count = favorites.size + readSaved(NEWS_FAVORITES).size
  $('#favoriteCount').textContent = count
}
function renderUnifiedFavorites() {
  const rev = ++favoriteRevision,
    ns = readSaved(NEWS_FAVORITES),
    q = $('#search').value.trim().toLocaleLowerCase()
  let tools = $('#favoriteTools')
  if (!tools) {
    tools = document.createElement('nav')
    tools.id = 'favoriteTools'
    tools.className = 'term-categories'
    tools.setAttribute('aria-label', '收藏类型')
    $('.results-heading').before(tools)
  }
  tools.hidden = view !== 'favorites'
  if (view !== 'favorites') return
  ensureBackupTools()
  const counts = {
    材料: DATA.materials.filter(x => favorites.has(x.id)).length,
    动态: ns.size
  }
  counts['全部'] = counts.材料 + counts.动态
  tools.innerHTML = ['全部', '材料', '动态']
    .map(
      type =>
        `<button data-favorite-type="${type}" aria-pressed="${favoriteType === type}">${type}<small>${counts[type]}</small></button>`
    )
    .join('')
  const records = [
    ...DATA.materials
      .filter(x => favorites.has(x.id))
      .map(x => ({ type: '材料', x, text: Object.values(x.fields).join(' ') })),
    ...favoriteNews
      .filter(x => ns.has(x.id))
      .map(x => ({ type: '动态', x, text: [x.title, x.summary, ...x.materials].join(' ') }))
  ].filter(
    r =>
      (favoriteType === '全部' || r.type === favoriteType) &&
      (!q || r.text.toLocaleLowerCase().includes(q))
  )
  $('#content').innerHTML =
    records.map(r => (r.type === '材料' ? card(r.x) : newsCard(r.x, true))).join('') ||
    `<div class="empty"><h3>${counts.全部 ? '当前筛选下没有收藏' : '还没有收藏内容'}</h3><p>材料与动态都可以收藏，在这里统一回看。</p><button id="reset">浏览材料</button></div>`
  $('#resultCount').textContent = `${records.length} 项收藏`
  $('#resultsTitle').textContent = '我的收藏'
  $('#resultsHint').textContent = '材料 · 动态'
  if (ns.size && favoriteNewsState === 'idle') {
    favoriteNewsState = 'loading'
    $('#resultCount').textContent = '正在载入收藏动态…'
    getNewsItems({ all: true })
      .then(items => {
        favoriteNews = items
        favoriteNewsState = 'ready'
        if (view === 'favorites') render()
      })
      .catch(() => {
        favoriteNewsState = 'idle'
        if (view === 'favorites') {
          $('#resultCount').textContent = '收藏动态载入失败'
          $('#content').innerHTML +=
            '<button class="btn" data-retry-favorites="true">重试载入收藏动态</button>'
        }
      })
  }
}
window.addEventListener('atlas-favorites-changed', () => {
  updateFavoriteCount()
  if (view === 'favorites') render()
})

function material(id) {
  return DATA.materials.find(m => m.id === id)
}
function saveFavorite(id) {
  if (favorites.has(id)) favorites.delete(id)
  else favorites.add(id)
  try {
    localStorage.setItem('polymer-atlas-favorites', JSON.stringify([...favorites]))
  } catch {
    toast('本次收藏可用，浏览器未允许保存到本地')
  }
  render()
  if ($('#detailDialog').open) detail(id, false)
}
// ---- 收藏的导出与导入 ----
// 收藏只写在 localStorage 里：换浏览器、换设备、清一次站点数据就全没了，而且
// 事前事后都没有任何提示。这里给一个纯文本的出口——导出的就是一份 JSON，
// 不依赖本站也能留着，换台机器再导回来。
const BACKUP_KIND = 'polymer-atlas-favorites'

function backupPayload() {
  return {
    kind: BACKUP_KIND,
    exported_at: new Date().toISOString().slice(0, 10),
    materials: [...favorites],
    news: [...readSaved(NEWS_FAVORITES)]
  }
}

function exportFavorites() {
  const payload = backupPayload()
  const total = payload.materials.length + payload.news.length
  if (!total) {
    toast('还没有任何收藏，先收藏几条再导出')
    return
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  )
  const a = document.createElement('a')
  a.href = url
  a.download = `polymer-atlas-收藏-${payload.exported_at}.json`
  a.click()
  URL.revokeObjectURL(url)
  toast(`已导出 ${total} 项收藏`)
}

/** 只加不删。合并语义，不覆盖——导入不该有能力清掉现有的收藏。 */
function addSaved(key, id) {
  const set = readSaved(key)
  if (set.has(id)) return false
  set.add(id)
  try {
    localStorage.setItem(key, JSON.stringify([...set]))
  } catch {
    toast('浏览器未允许保存收藏')
  }
  return true
}

async function importFavorites(file) {
  let payload
  try {
    payload = JSON.parse(await file.text())
  } catch {
    toast('这个文件读不出来，可能不是 JSON')
    return
  }
  if (!payload || typeof payload !== 'object') {
    toast('这不像是图鉴导出的收藏文件')
    return
  }
  const strings = key =>
    Array.isArray(payload[key]) ? payload[key].filter(x => typeof x === 'string') : []
  const incoming = {
    材料: strings('materials'),
    动态: strings('news')
  }
  const total = incoming.材料.length + incoming.动态.length
  if (!total) {
    toast('文件里没有可导入的收藏')
    return
  }

  // 数据是唯一事实来源：文件可能来自旧版本，里面的 id 本站早就不存在了。
  // 导入前逐条对照，认不出来的直接丢掉并如实报出来，不写进收藏。
  await ensureAtlas().catch(() => {})
  if (!favoriteNews.length)
    await getNewsItems({ all: true })
      .then(items => {
        favoriteNews = items
        favoriteNewsState = 'ready'
      })
      .catch(() => {})
  const knownMaterials = new Set((DATA?.materials ?? []).map(m => m.id))
  const knownNews = new Set(favoriteNews.map(x => x.id))

  const added = { 材料: 0, 动态: 0 }
  let existed = 0
  const dropped = { 材料: 0, 动态: 0 }

  for (const id of incoming.材料) {
    if (knownMaterials.size && !knownMaterials.has(id)) dropped.材料++
    else if (favorites.has(id)) existed++
    else {
      favorites.add(id)
      added.材料++
    }
  }
  try {
    if (added.材料) localStorage.setItem('polymer-atlas-favorites', JSON.stringify([...favorites]))
  } catch {
    toast('浏览器未允许保存收藏')
  }
  for (const id of incoming.动态) {
    if (knownNews.size && !knownNews.has(id)) dropped.动态++
    else if (!addSaved(NEWS_FAVORITES, id)) existed++
    else added.动态++
  }

  const gain = added.材料 + added.动态
  const lost = dropped.材料 + dropped.动态
  updateFavoriteCount()
  render()
  toast(
    gain
      ? `导入 ${gain} 项收藏${existed ? `，${existed} 项本来就在收藏里` : ''}${
          lost ? `，${lost} 项本站已没有、已跳过` : ''
        }`
      : existed
        ? '文件里的收藏都已经在收藏里了'
        : `文件里的 ${lost} 项记录本站已没有，没有可导入的内容`
  )
}

/** 导出/导入的入口。只建一次，之后每次渲染只切换显隐，避免事件监听反复重建。 */
function ensureBackupTools() {
  let box = $('#favoriteBackup')
  if (!box) {
    box = document.createElement('div')
    box.id = 'favoriteBackup'
    box.className = 'favorite-backup'
    box.innerHTML =
      '<button class="btn" data-favorite-export>导出收藏</button>' +
      '<button class="btn" data-favorite-import>导入收藏</button>' +
      '<input type="file" accept="application/json,.json" hidden />' +
      '<p>收藏保存在当前浏览器：换设备或清理浏览器数据之前，导出一份带走。</p>'
    $('.results-heading').before(box)
    const file = box.querySelector('input[type=file]')
    box.querySelector('[data-favorite-export]').addEventListener('click', exportFavorites)
    box.querySelector('[data-favorite-import]').addEventListener('click', () => file.click())
    file.addEventListener('change', () => {
      const picked = file.files[0]
      // 清掉值，否则同一个文件连着选两次不会触发 change
      file.value = ''
      if (picked) importFavorites(picked)
    })
  }
  box.hidden = false
  return box
}

/** 对比选择写回本机。写失败（隐私模式、配额满）不该影响使用，静默跳过。 */
function saveCompare() {
  try {
    localStorage.setItem('polymer-atlas-compare', JSON.stringify(selected))
  } catch {}
}

function compare(id) {
  if (selected.includes(id)) selected = selected.filter(x => x !== id)
  else if (selected.length < 3) selected.push(id)
  else toast('最多对比 3 条记录，请先移除一条')
  saveCompare()
  render()
  if ($('#detailDialog').open) detail(id, false)
}
function names() {
  return {
    news: '材料动态',
    materials: '材料图鉴',
    favorites: '我的收藏',
    terms: '基础知识'
  }
}
const viewStates = new Map()
let newsController
function animateView() {
  const main = $('main')
  main.classList.remove('view-enter')
  void main.offsetWidth
  main.classList.add('view-enter')
}

const VIEW_KEYS = ['materials', 'terms', 'favorites', 'news']
function safeDecode(text) {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}
// 地址栏形态：#<视图>，或 #materials/<材料 id>（例如 #materials/m-0-0）。
// 单条材料有独立地址，链接可以直接发给别人。
function routeParts() {
  const [head, tail] = location.hash.slice(1).split('/')
  const known = VIEW_KEYS.includes(head)
  const view = known ? head : 'news'
  return { view, materialId: view === 'materials' && tail ? safeDecode(tail) : '' }
}
function routeView() {
  return routeParts().view
}
function routeMaterialId() {
  return routeParts().materialId
}
function switchView(next, { historyMode = 'push' } = {}) {
  const ticket = ++pendingView
  if (next !== 'news' && (!DATA || (next === 'terms' && !knowledgeReady))) {
    ;(next === 'terms' ? ensureKnowledge() : ensureAtlas())
      .then(() => {
        if (ticket === pendingView) switchView(next, { historyMode })
      })
      .catch(() => toast('资料暂时未能载入，请重试'))
    return
  }
  if (!Object.hasOwn(names(), next) || next === view) return
  viewStates.set(view, {
    category,
    termCategory,
    onlyFavorites,
    query: $('#search').value,
    scroll: window.scrollY
  })
  view = next
  const state = viewStates.get(next) || {
    category: '全部材料',
    termCategory: '全部知识',
    onlyFavorites: false,
    query: '',
    scroll: 0
  }
  category = state.category
  termCategory = state.termCategory
  onlyFavorites = state.onlyFavorites
  $('#search').value = state.query
  if (historyMode === 'push') history.pushState({ view: next }, '', `#${next}`)
  render()
  animateView()
  const restore = () => {
    if (view === next)
      requestAnimationFrame(() => {
        if (view === next) window.scrollTo({ top: state.scroll, behavior: 'instant' })
      })
  }
  restore()
  if (next === 'news') newsController?.ready.then(restore)
}
// ---- 材料详情与地址栏同步 ----
// 单一数据源是 location.hash：openDetail 负责写 hash，关闭详情时回退一步，
// syncFromHash 负责把 hash 的现状翻译成界面状态。这样分享链接、浏览器返回键、
// 弹窗关闭三者不会互相打架。
let detailHashId = ''
// 术语 / 文献详情弹窗在历史里的标记（地址不变，只靠 state 区分）
let popupKind = ''
let hashDriven = false
let handledHash = location.hash

function materialHash(id) {
  return `#materials/${encodeURIComponent(id)}`
}
// 详情按「第几层」记录：列表里点开是第 1 层，详情里点关联材料是第 2 层……
// 这样返回键一层层往回退（符合「返回 = 撤销上一步」的直觉），
// 而点关闭按钮要一步回列表时，按层数 go(-depth) 就够了，不用连点好几次。
function detailDepth() {
  const state = history.state
  return state && state.detail ? Number(state.depth) || 1 : 0
}

function openDetail(id) {
  if (!material(id)) return false
  detail(id)
  const depth = detailHashId ? detailDepth() + 1 : 1
  history.pushState({ detail: id, depth }, '', materialHash(id))
  detailHashId = id
  handledHash = location.hash
  return true
}

function closeDetailDialog() {
  if ($('#detailDialog').open) $('#detailDialog').close()
}

function syncFromHash() {
  hashDriven = true
  const { view: next, materialId } = routeParts()
  switchView(next, { historyMode: 'none' })
  if (next === 'materials' && materialId) {
    ensureAtlas()
      .then(() => {
        if (!material(materialId)) {
          detailHashId = ''
          closeDetailDialog()
          toast('这条材料记录已不存在')
          return
        }
        detailHashId = materialId
        detail(materialId)
      })
      .catch(() => toast('资料暂时未能载入，请重试'))
  } else {
    detailHashId = ''
    closeDetailDialog()
  }
  hashDriven = false
}

function onLocationChange() {
  const popup = history.state && history.state.popup
  // 术语 / 文献 / 对比弹窗：前进键回到那条记录就重新打开，返回键离开就收起来
  if (popup && !popupKind) {
    if (popup === 'compare') openCompare({ record: false })
    else otherDetail(popup, Number(history.state.index), { record: false })
    return
  }
  if (!popup && popupKind) {
    const was = popupKind
    popupKind = ''
    hashDriven = true
    if (was === 'compare') {
      const dialog = $('#compareDialog')
      if (dialog.open) dialog.close()
    } else closeDetailDialog()
    hashDriven = false
    return
  }
  if (location.hash === handledHash) return
  handledHash = location.hash
  syncFromHash()
}

window.addEventListener('popstate', onLocationChange)
window.addEventListener('hashchange', onLocationChange)

// 按 Esc、点关闭按钮或点遮罩关掉详情时，把地址栏退回列表态。
// hashDriven 为真说明这次关闭是 hash 变化引起的，不能再回溯一次。
function onDetailClosed() {
  if (hashDriven) return
  // 术语 / 文献 / 对比弹窗：历史里那条记录就是它自己，后退一步即可
  if (popupKind) {
    popupKind = ''
    history.back()
    return
  }
  const shouldRewind = detailHashId && routeMaterialId() === detailHashId
  const depth = detailDepth()
  detailHashId = ''
  if (!shouldRewind) return
  if (depth > 1) history.go(-depth)
  else if (depth === 1) history.back()
  // 地址是手工敲进来或外部跳转的（没有垫记录），直接改回列表，别把用户带出站
  else {
    history.replaceState({ view: 'materials' }, '', '#materials')
    handledHash = location.hash
  }
}
// ---- 搜索命中溯源 ----
// 搜索拿整条记录的所有字段做全文匹配，但卡片只呈现其中几个。实测 18 个常用
// 关键词下 62% 的命中落在卡片看不见的字段上：搜「注塑」出来 38 条，37 条卡片上
// 找不到这两个字——它藏在「加工与干燥要点」里，结果页看着像搜错了。
// 所以命中只存在于隐藏字段时补一行，标明落在哪个字段并高亮命中词。本来就看
// 得到的（名称、缩写、特点…）不补，否则每张卡都挂一行废话。
const VISIBLE_FIELDS = {
  materials: ['材料名称', '英文缩写', '形态与结晶性', '突出特点', '主要弱点', '回收路线与分离难点'],
  terms: ['术语/阅读规则', '解释', '分类']
}

// 本轮渲染里「命中落在隐藏字段」的记录。卡片渲染时各自查一次，按视图整体重建，
// 不往 DATA 上挂东西——DATA 是数据，渲染态是渲染态。
let hitMap = new Map()

/** 截命中词前后各一段。不追求完整句子，够指出位置在哪就行。 */
function hitSnippet(text, at, len) {
  const start = Math.max(0, at - 20)
  const end = Math.min(text.length, at + len + 44)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

/** 把命中词包成 <mark>。用 indexOf 逐段切，不走正则——关键词里带 . * ( ) 也不会出事。 */
function markQuery(text, q) {
  const lower = text.toLowerCase(),
    out = []
  let i = 0
  for (;;) {
    const at = lower.indexOf(q, i)
    if (at < 0) {
      out.push(esc(text.slice(i)))
      return out.join('')
    }
    out.push(esc(text.slice(i, at)), `<mark>${esc(text.slice(at, at + q.length))}</mark>`)
    i = at + q.length
  }
}

/**
 * 找出这条记录「看不见的那处命中」。可见字段里已经有的一律返回 null——用户
 * 自己看得到，再补一行就是噪音。隐藏字段按数据里的原始顺序取第一个命中。
 */
function hiddenHit(record, q, visible) {
  if (!q) return null
  const fields = record.fields ?? record
  for (const key of visible)
    if (
      String(fields[key] ?? '')
        .toLowerCase()
        .includes(q)
    )
      return null
  for (const [key, value] of Object.entries(fields)) {
    if (visible.includes(key)) continue
    const at = String(value ?? '')
      .toLowerCase()
      .indexOf(q)
    if (at >= 0) return { field: key, snippet: hitSnippet(String(value), at, q.length), q }
  }
  return null
}

function indexHits(list, q, kind) {
  hitMap = new Map()
  if (!q) return
  const visible = VISIBLE_FIELDS[kind]
  // 术语卡片的下标用的是它在 DATA.terms 里的位置（termCard 就是这样算的），
  // 而 list 是过滤后的——两个下标不是一回事，所以回原数组里查。
  for (const x of list) {
    const hit = hiddenHit(x, q, visible)
    if (!hit) continue
    hitMap.set(kind === 'materials' ? x.id : DATA.terms.indexOf(x), hit)
  }
}

/** 命中溯源行。没有隐藏命中时返回空串，卡片结构不变。 */
function hitRow(key) {
  const hit = hitMap.get(key)
  return hit
    ? `<div class="card-hit"><span>${esc(hit.field)}</span><p>${markQuery(hit.snippet, hit.q)}</p></div>`
    : ''
}

/** 数值筛选：{ 字段: { min, max } }，两侧都可留空。 */
const propFilters = {}

/**
 * 排序。默认顺序是「搜索相关度」，其余按字段排。
 *
 * 数值排序里没填数值的材料一律沉底，升序降序都不翻面：翻过来会让「没测过」的
 * 材料排在最前面，比排在最后更像结论。
 */
let sortBy = 'default',
  sortDir = 'asc'
const SORT_NAME = { id: 'name', label: '材料名称' }

/** 可排序项随数值字段走：data.json 没填过 HDT 就不要给人一个全是空值的排序。 */
function sortOptions() {
  const numeric = propsInUse().map(s => ({ id: s.key, label: `${s.key} ${s.label}` }))
  return [{ id: 'default', label: '默认顺序' }, SORT_NAME, ...numeric]
}

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true })

/**
 * 当前有没有生效的筛选条件。按视图分开判：术语页只有主题分类，
 * 材料页的分类/收藏/排序/数值都不适用于它。混在一起判的话，
 * 在术语页选过主题再切回来，材料页会莫名出现一颗「清除筛选」。
 * 视图本身（「我的收藏」）也不算条件——那是换了看的范围，不是把范围收窄了。
 */
function hasFilters() {
  // 搜索框三种视图共用，所以先单独看
  if ($('#search').value.trim()) return true
  if (view === 'terms') return termCategory !== '全部知识'
  return (
    category !== '全部材料' ||
    onlyFavorites ||
    sortBy !== 'default' ||
    Object.keys(propFilters).length > 0
  )
}

/**
 * 排序时把依据的那个数值摆在卡片上：按密度排完却看不出密度，
 * 读者只能选择相信排对了，而排序恰恰是最该被检验的操作。
 * 默认顺序和按名称排没有「数值」可言，这时不显示。
 */
function sortChip(m) {
  if (sortBy === 'default' || sortBy === SORT_NAME.id) return ''
  const spec = (DATA?.propsSpec || []).find(s => s.key === sortBy)
  if (!spec) return ''
  const raw = (m.props || {})[sortBy]
  const text = Array.isArray(raw) ? `${raw[0]} ~ ${raw[1]}` : raw == null ? '' : String(raw)
  return `<span class="card-sort${text ? '' : ' none'}">${esc(spec.label)} ${
    text ? `${esc(text)}${spec.unit ? ' ' + esc(spec.unit) : ''}` : '—'
  }</span>`
}

/** 清掉搜索、分类、只看收藏、数值条件与排序；不换视图，地址由 render 里的 syncUrl 收干净。 */
function resetFilters() {
  category = '全部材料'
  termCategory = '全部知识'
  onlyFavorites = false
  sortBy = 'default'
  sortDir = 'asc'
  $('#search').value = ''
  // 数值条件也一并清掉，否则用户以为清空了却还是只剩几条
  for (const k of Object.keys(propFilters)) delete propFilters[k]
  $('#propFilters')
    ?.querySelectorAll('input[data-prop]')
    .forEach(i => (i.value = ''))
  render()
}

function sortValue(m) {
  const v = (m.props || {})[sortBy]
  // 区间字段（加工温度）按下限排：判「谁更容易加工」看的是下限
  return Array.isArray(v) ? v[0] : v
}

function sortMaterials(list, q) {
  const arr = list.slice()
  if (sortBy === 'default') {
    return arr.sort((a, b) => {
      const score = m =>
        q &&
        m.fields['英文缩写']
          .toLowerCase()
          .split(/[\s/、]+/)
          .includes(q)
          ? 2
          : q && m.fields['材料名称'].toLowerCase().includes(q)
            ? 1
            : 0
      return score(b) - score(a)
    })
  }
  if (sortBy === SORT_NAME.id) {
    arr.sort((a, b) => collator.compare(a.fields['材料名称'], b.fields['材料名称']))
    return sortDir === 'desc' ? arr.reverse() : arr
  }
  arr.sort((a, b) => {
    const x = sortValue(a),
      y = sortValue(b)
    if (x == null && y == null) return collator.compare(a.fields['材料名称'], b.fields['材料名称'])
    if (x == null) return 1
    if (y == null) return -1
    return sortDir === 'desc' ? y - x : x - y
  })
  return arr
}

/** 排序条只建一次 innerHTML：每次 render 重写会把正在操作的 select 弄丢。 */
function renderSortBar(show) {
  const bar = $('#sortBar')
  if (!bar) return
  bar.hidden = !show
  if (!show) return
  if (!bar.dataset.built) {
    const opts = sortOptions()
    bar.innerHTML =
      `<label>排序<select id="sortBy">` +
      opts.map(o => `<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('') +
      `</select></label>` +
      `<button class="btn sort-dir" id="sortDir" type="button">升序 ↑</button>`
    bar.dataset.built = '1'
  }
  const sel = $('#sortBy'),
    dir = $('#sortDir')
  if (sel.value !== sortBy) sel.value = sortBy
  // 名称与相关度没有「升/降」的直观含义之前先留着，但默认顺序下按钮没意义
  dir.hidden = sortBy === 'default'
  dir.textContent = sortDir === 'desc' ? '降序 ↓' : '升序 ↑'
  dir.setAttribute(
    'aria-label',
    sortDir === 'desc' ? '当前降序，点击改为升序' : '当前升序，点击改为降序'
  )
}

// ---- 筛选状态与地址栏 ----
// 查询串描述「看的是哪一批」，哈希仍然描述「打开的是哪一条」。
// 只 replaceState 不 pushState：搜索框每敲一个字都算一条历史记录的话，
// 返回键要一个字一个字往回退。参数写进地址的价值在于刷新不丢、能直接发给别人。
const URL_FIXED = ['q', 'c', 'f', 'sort', 'dir']

function propParamKey(key, bound) {
  return `${key}-${bound}`
}

/** 保留地址里不认识的参数（EdgeOne 预览链接的 eo_token / eo_time 就在查询串上）。 */
function syncUrl() {
  if (!DATA) return
  const p = new URLSearchParams(location.search)
  for (const k of URL_FIXED) p.delete(k)
  for (const s of DATA.propsSpec || []) {
    p.delete(propParamKey(s.key, 'min'))
    p.delete(propParamKey(s.key, 'max'))
  }
  const listView = view === 'materials' || view === 'favorites'
  if (listView) {
    const q = $('#search').value.trim()
    if (q) p.set('q', q)
    if (category !== '全部材料') p.set('c', category)
    if (onlyFavorites) p.set('f', '1')
    if (sortBy !== 'default') {
      p.set('sort', sortBy)
      p.set('dir', sortDir)
    }
    for (const [key, r] of Object.entries(propFilters)) {
      if (r.min != null) p.set(propParamKey(key, 'min'), String(r.min))
      if (r.max != null) p.set(propParamKey(key, 'max'), String(r.max))
    }
  }
  const qs = p.toString()
  const url = location.pathname + (qs ? `?${qs}` : '') + location.hash
  if (url !== location.pathname + location.search + location.hash)
    history.replaceState(history.state, '', url)
}

/** 从地址读回筛选状态。只认 propsSpec 里登记过的字段，免得手改地址塞进垃圾键。 */
function readUrlState() {
  const p = new URLSearchParams(location.search)
  const spec = DATA?.propsSpec || []
  const props = {}
  for (const s of spec) {
    const min = p.get(propParamKey(s.key, 'min')),
      max = p.get(propParamKey(s.key, 'max'))
    const lo = min === null ? null : Number(min),
      hi = max === null ? null : Number(max)
    if ((lo != null && isFinite(lo)) || (hi != null && isFinite(hi)))
      props[s.key] = {
        min: lo != null && isFinite(lo) ? lo : null,
        max: hi != null && isFinite(hi) ? hi : null
      }
  }
  const c = p.get('c')
  const cats = ['全部材料', ...new Set((DATA?.materials || []).map(m => m.category))]
  const sort = p.get('sort')
  return {
    query: p.get('q') || '',
    category: c && cats.includes(c) ? c : '全部材料',
    onlyFavorites: p.get('f') === '1',
    props,
    sortBy: sortOptions().some(o => o.id === sort) ? sort : 'default',
    sortDir: p.get('dir') === 'desc' ? 'desc' : 'asc'
  }
}

function applyUrlState(st) {
  $('#search').value = st.query
  category = st.category
  onlyFavorites = st.onlyFavorites
  sortBy = st.sortBy
  sortDir = st.sortDir
  for (const k of Object.keys(propFilters)) delete propFilters[k]
  for (const [k, v] of Object.entries(st.props)) propFilters[k] = v
  // 筛选器只在首次建一次，值要自己回填
  const pf = $('#propFilters')
  if (pf && pf.dataset.built)
    pf.querySelectorAll('input[data-prop]').forEach(i => {
      const r = propFilters[i.dataset.prop]
      i.value = r && r[i.dataset.bound] != null ? String(r[i.dataset.bound]) : ''
    })
}

/** 数值块下方的说明。两个文件各有一份（app.js 与 prerender.mjs），改文案时两边都要改。 */
const PROPS_NOTE =
  '数值是未改性、通用牌号的典型值（HDT 按 0.45 MPa），不是某个牌号的实测数据；' +
  '留空的字段表示还没有填。用于粗筛可以，选材请以具体牌号的技术数据表为准。'

/** 只列出「至少有一条材料填了」的数值字段——没有数据的字段摆出来是空筛选器。 */
function propsInUse() {
  const spec = DATA?.propsSpec || []
  return spec.filter(s => DATA.materials.some(m => (m.props || {})[s.key] != null))
}

function propFiltersMarkup() {
  const used = propsInUse()
  if (!used.length) return ''
  return (
    used
      .map(s => {
        const v = propFilters[s.key] || {}
        const step = s.key === '密度' ? '0.01' : '1'
        return (
          `<label class="prop-filter"><span>${esc(s.label)}<small>${esc(s.unit)}</small></span>` +
          `<input type="number" step="${step}" inputmode="decimal" data-prop="${esc(s.key)}" data-bound="min" placeholder="≥" aria-label="${esc(s.label)}下限" value="${v.min ?? ''}" />` +
          `<i>–</i>` +
          `<input type="number" step="${step}" inputmode="decimal" data-prop="${esc(s.key)}" data-bound="max" placeholder="≤" aria-label="${esc(s.label)}上限" value="${v.max ?? ''}" />` +
          `</label>`
        )
      })
      .join('') +
    `<button class="btn prop-clear" id="propClear">清除数值筛选</button>` +
    `<span class="prop-note">只有填了该项数值的材料会留下；热变形温度按 0.45 MPa</span>`
  )
}

/**
 * 数值筛选的语义：**填了条件就等于要求这条材料必须有这个数**。
 * 没填的材料会被排除——用户既然在问「HDT 大于 150 的有哪些」，
 * 给他一堆没测过 HDT 的材料，等于把「没数据」伪装成「不符合」。
 */
function propMatch(m) {
  const p = m.props || {}
  for (const [key, r] of Object.entries(propFilters)) {
    if (r.min == null && r.max == null) continue
    const v = p[key]
    if (v == null) return false
    if (Array.isArray(v)) {
      // 区间字段（加工温度）：与目标区间有交集即算命中
      if (r.min != null && v[1] < r.min) return false
      if (r.max != null && v[0] > r.max) return false
    } else {
      if (r.min != null && v < r.min) return false
      if (r.max != null && v > r.max) return false
    }
  }
  return true
}

function propsTable(m) {
  const spec = DATA?.propsSpec || []
  const rows = spec
    .filter(s => (m.props || {})[s.key] != null)
    .map(s => {
      const v = m.props[s.key]
      const text = Array.isArray(v) ? `${v[0]} ~ ${v[1]}` : `${v}`
      return `<div class="prop-row"><dt>${esc(s.label)}</dt><dd>${esc(text)}<small>${esc(s.unit)}</small></dd></div>`
    })
  if (!rows.length) {
    // 一条数值都没有：这类材料本来就没有通用典型值，写清原因，
    // 否则读者会以为资料没整理完。没有说明的仍然整块不渲染。
    if (!m.propsNote) return ''
    return `<section class="detail-section props-table"><h3>数值</h3><p class="props-empty">${esc(m.propsNote)}</p></section>`
  }
  return (
    `<section class="detail-section props-table"><h3>数值</h3><dl>${rows.join('')}</dl>` +
    `<p class="props-note">${PROPS_NOTE}</p></section>`
  )
}

function items() {
  const q = $('#search').value.trim().toLowerCase()
  if (view === 'terms') {
    const list = DATA.terms.filter(
      x =>
        (termCategory === '全部知识' || x['分类'] === termCategory) &&
        [x['术语/阅读规则'], x['解释'], x['用途或易错点'], x['分类']]
          .join(' ')
          .toLowerCase()
          .includes(q)
    )
    indexHits(list, q, 'terms')
    return list
  }
  const list = DATA.materials.filter(
    m =>
      (category === '全部材料' || m.category === category) &&
      (!(onlyFavorites || view === 'favorites') || favorites.has(m.id)) &&
      propMatch(m) &&
      Object.values(m.fields).join(' ').toLowerCase().includes(q)
  )
  indexHits(list, q, 'materials')
  return sortMaterials(list, q)
}
/**
 * 空结果时说清楚是哪一层把它清空的。
 * 数值筛选的语义是「填了条件＝要求该材料必须有这个数」，所以「一条都没有」
 * 很可能不是搜错了，而是这些材料的数值还没整理——两者要分开讲，
 * 否则用户会翻来覆去改关键词，改了八遍也出不来。
 */
function emptyState() {
  const wrap = (title, text, btn) =>
    `<div class="empty"><h3>${title}</h3><p>${text}</p><button id="reset">${btn}</button></div>`
  if (view === 'favorites')
    return wrap('还没有收藏的材料', '点击材料卡片右上角的星标，即可收藏。', '浏览材料')
  if (view === 'terms')
    return wrap('没有找到匹配内容', '试试更短的关键词，或切回全部主题。', '清除筛选')

  const fields = Object.keys(propFilters)
  if (fields.length) {
    const q = $('#search').value.trim().toLowerCase()
    // 与 items() 同样的条件，只是先不看数值：这样才知道是不是数值这一层挡掉的
    const beforeProps = DATA.materials.filter(
      m =>
        (category === '全部材料' || m.category === category) &&
        (!(onlyFavorites || view === 'favorites') || favorites.has(m.id)) &&
        Object.values(m.fields).join(' ').toLowerCase().includes(q)
    )
    const missing = beforeProps.filter(m => fields.some(k => (m.props || {})[k] == null))
    const outRange = beforeProps.filter(m => !missing.includes(m) && !propMatch(m))
    if (missing.length || outRange.length) {
      const labels = propsInUse()
        .filter(s => fields.includes(s.key))
        .map(s => s.label)
        .join('、')
      const reasons = []
      if (missing.length) reasons.push(`${missing.length} 条没有填${labels}这一项`)
      if (outRange.length) reasons.push(`${outRange.length} 条填了但不在你给的区间内`)
      return wrap(
        '没有材料同时满足这些条件',
        `${reasons.join('，')}。数值筛选的语义是「必须填了这个数」，没填的不会留下。` +
          `放宽区间，或者先不加数值条件看看有哪些材料。`,
        '清除筛选'
      )
    }
  }
  return wrap('没有找到匹配内容', '试试更短的关键词，或切换回全部分类。', '清除筛选')
}

function render() {
  updateFavoriteCount()
  $('#content').classList.toggle('unified-favorites', view === 'favorites')
  if ($('#favoriteTools')) $('#favoriteTools').hidden = view !== 'favorites'
  if ($('#favoriteBackup')) $('#favoriteBackup').hidden = view !== 'favorites'
  const news = view === 'news'
  $('#atlasPanel').hidden = news
  $('#newsPanel').hidden = !news
  if (news) {
    if (!newsController) {
      $('#newsPanel').innerHTML = NEWS_TEMPLATE
      newsController = mountNews($('#newsPanel'))
    }
    document
      .querySelectorAll('[data-view]')
      .forEach(x => x.classList.toggle('active', x.dataset.view === view))
    $('#breadcrumb').textContent = '材料动态'
    $('#categories').hidden = true
    $('.categories-label').hidden = true
    $('#compareTray').hidden = true
    document.title = '材料动态 · 高分子材料图鉴'
    // 动态页有自己的筛选器（在 news-view.js 里），材料那套参数带过来只会误导
    syncUrl()
    return
  }
  document.title = names()[view] + ' · 高分子材料图鉴'
  const isMaterial = ['materials', 'favorites'].includes(view),
    list = items()
  document
    .querySelectorAll('[data-view]')
    .forEach(x => x.classList.toggle('active', x.dataset.view === view))
  updateFavoriteCount()
  const cats = ['全部材料', ...new Set(DATA.materials.map(m => m.category))]
  $('#categories').innerHTML = cats
    .map(
      c =>
        `<button class="category ${category === c ? 'active' : ''}" data-category="${esc(c)}">${esc(c)}<small>${c === '全部材料' ? DATA.materials.length : DATA.materials.filter(m => m.category === c).length}</small></button>`
    )
    .join('')
  $('#categories').hidden = !isMaterial
  $('.categories-label').hidden = !isMaterial
  $('#breadcrumb').textContent = names()[view]
  const titles = {
    materials: '材料图鉴',
    favorites: '我的收藏',
    terms: '基础知识'
  }
  $('#pageTitle').innerHTML = titles[view]
  $('#pageSubtitle').textContent = {
    materials: '结构、性能、加工与回收，让材料知识更好查，也更好懂。',
    favorites: '材料与动态集中回看，收藏保存在当前浏览器。',
    terms: '从结构到表征、从加工到回收：按主题查概念，同时看懂容易混淆的地方。'
  }[view]
  $('#search').placeholder = isMaterial
    ? '搜索名称、缩写、特性或用途…'
    : view === 'terms'
      ? '搜索术语，例如 Tg、BHPT、水解…'
      : '搜索收藏的材料与动态…'
  $('#latestNews').hidden = view !== 'materials'
  if (view === 'materials') import('./news-preview.js')
  $('#quickFilters').hidden = !isMaterial
  // 数值筛选器只建一次：每次 render 都重写 innerHTML 会把正在输入的框弄丢焦点
  const pf = $('#propFilters')
  if (pf) {
    pf.hidden = !isMaterial || !propsInUse().length
    if (isMaterial && !pf.dataset.built) {
      pf.innerHTML = propFiltersMarkup()
      pf.dataset.built = '1'
    }
  }
  $('#favoriteToggle').hidden = !isMaterial || view === 'favorites'
  $('#compareOpen').hidden = !isMaterial
  $('#favoriteToggle').setAttribute('aria-pressed', onlyFavorites)
  $('#compareCount').textContent = selected.length
  $('#compareOpen').disabled = selected.length < 2
  $('#resultsTitle').textContent = view === 'materials' ? category : names()[view]
  $('#resultCount').textContent =
    `${list.length} ${isMaterial ? '条记录' : view === 'terms' ? '个词条' : '项资料'}`
  $('#resultsHint').textContent = isMaterial
    ? '点击卡片，查看完整资料 · 方向键逐张浏览'
    : '点击卡片，阅读说明'
  renderSortBar(isMaterial)
  // 没条件时不摆按钮：点不动的东西放在那儿只会让人以为它坏了。
  // 放在结果标题行而不是排序条，是因为术语页没有排序条，而它同样会被筛空。
  $('#clearFilters').hidden = !hasFilters()
  $('#content').innerHTML = list.length
    ? list.map(x => (isMaterial ? card(x) : termCard(x))).join('')
    : emptyState()
  renderTermTools()
  renderTray()
  syncUrl()
  if (view === 'favorites') renderUnifiedFavorites()
}
function card(m) {
  const f = m.fields,
    abbr = f['英文缩写']
  return `<article class="card material-card" tabindex="0" role="button" data-detail="${m.id}" aria-label="查看${esc(f['材料名称'])}详情"><div class="card-top"><span class="badge">${esc(m.category)}</span><button class="icon-btn ${favorites.has(m.id) ? 'saved' : ''}" data-star="${m.id}" aria-pressed="${favorites.has(m.id)}" aria-label="${favorites.has(m.id) ? '取消收藏' : '收藏'}${esc(f['材料名称'])}">${favorites.has(m.id) ? '★' : '☆'}</button></div><div class="abbr ${abbr.length > 12 ? 'long' : ''}">${esc(abbr)}</div><h3>${esc(f['材料名称'])}</h3><span class="card-form">${esc(f['形态与结晶性'])}</span>${sortChip(m)}<div class="card-facts"><div class="card-fact"><span>特点</span><p>${esc(f['突出特点'])}</p></div><div class="card-fact limitation"><span>局限</span><p>${esc(f['主要弱点'])}</p></div><div class="card-fact recycle"><span>回收</span><p>${esc(f['回收路线与分离难点'])}</p></div></div>${hitRow(m.id)}<div class="card-bottom"><label class="check"><input type="checkbox" data-compare="${m.id}" ${selected.includes(m.id) ? 'checked' : ''}>加入对比</label><span>查看资料 <span class="arrow">↗</span></span></div></article>`
}
function termCard(x) {
  const index = DATA.terms.indexOf(x)
  return `<article class="card term-card" tabindex="0" role="button" data-term="${index}"><span class="badge">${esc(x['分类'] || '基础知识')}</span><h3>${esc(x['术语/阅读规则'])}</h3><p>${esc(x['解释'])}</p>${hitRow(index)}<div class="card-bottom">阅读完整解释 <span class="arrow">↗</span></div></article>`
}
function renderTermTools() {
  let tools = $('#termTools')
  if (!tools) {
    tools = document.createElement('section')
    tools.id = 'termTools'
    tools.setAttribute('aria-label', '基础知识分类与图鉴说明')
    $('.results-heading').before(tools)
  }
  tools.hidden = view !== 'terms'
  if (view !== 'terms') return
  const categories = ['全部知识', ...new Set(DATA.terms.map(x => x['分类'] || '其他'))]
  tools.innerHTML = `<nav class="term-categories" aria-label="知识主题">${categories.map(c => `<button data-term-category="${esc(c)}" aria-pressed="${termCategory === c}">${esc(c)}<small>${c === '全部知识' ? DATA.terms.length : DATA.terms.filter(x => x['分类'] === c).length}</small></button>`).join('')}</nav><details class="atlas-guide"><summary>使用与资料说明 <small>图鉴收录范围、资料口径与阅读方法</small></summary><div>${TERM_GUIDE.map(g => `<section><h3>${esc(g['标题'])}</h3><p>${esc(g['说明'])}</p></section>`).join('')}</div></details>`
  $('#resultsTitle').textContent = termCategory
  $('#latestNews').hidden = true
}
function renderTray() {
  const tray = $('#compareTray')
  tray.hidden = selected.length === 0
  $('#compareSelected').innerHTML = selected
    .map(
      id =>
        `<span class="selected-tag">${esc(material(id).fields['英文缩写'])}<button data-remove="${id}" aria-label="移除${esc(material(id).fields['英文缩写'])}">×</button></span>`
    )
    .join('')
  $('#compareGo').disabled = selected.length < 2
  $('#compareGo').textContent = selected.length < 2 ? '再选一种材料' : '开始对比'
}
function section(title, text, extra = '') {
  return `<section class="detail-section"><h3>${esc(title)}</h3><p class="${extra}">${esc(text)}</p></section>`
}

/**
 * 把「易混淆点」正文里提到的其他材料变成可点的链接。
 *
 * 为什么不预先在数据里存关系：130 条材料的易混淆关系是交叉的，存成字段就要维护
 * 一份和正文不同步的索引，改正文忘了改索引就会指向错的材料。这里按名称即时匹配，
 * 正文是唯一事实来源。
 *
 * 两条防误判：长名字优先（否则「聚丙烯」会先吃掉「聚丙烯酸」的前三个字）；
 * 每条材料只链接第一次出现的地方，否则一段话里同一个名字点得到处都是。
 */
function linkifyMaterials(text, selfId) {
  const src = String(text ?? '')
  if (!src || !DATA?.materials) return esc(src)
  const candidates = []
  const selfTokens = new Set()
  for (const m of DATA.materials) {
    const names = new Set()
    const name = String(m.fields['材料名称'] ?? '').trim()
    if (name) names.add(name)
    // 缩写字段里有「PPE/PPO、mPPE」「PU/TPU」这类并列写法，逐个拆出来
    for (const part of String(m.fields['英文缩写'] ?? '').split(/[\/、,，\s]+/)) {
      const token = part.trim()
      if (token) names.add(token)
    }
    if (m.id === selfId) {
      for (const n of names) selfTokens.add(n)
      continue
    }
    for (const n of names) candidates.push({ n, id: m.id })
  }
  candidates.sort((a, b) => b.n.length - a.n.length)

  const isAscii = /^[A-Za-z0-9][A-Za-z0-9-]*$/
  const linked = new Set()
  let out = ''
  let i = 0
  while (i < src.length) {
    let hit = null
    for (const c of candidates) {
      if (linked.has(c.id) || selfTokens.has(c.n) || !src.startsWith(c.n, i)) continue
      if (isAscii.test(c.n)) {
        // 缩写要求两侧不是字母数字，否则 PET 里的 PE、PBT 里的 BT 都会被认出来
        const before = src[i - 1] || ''
        const after = src[i + c.n.length] || ''
        if (/[A-Za-z0-9]/.test(before) || /[A-Za-z0-9]/.test(after)) continue
      }
      hit = c
      break
    }
    if (hit) {
      linked.add(hit.id)
      out += `<button class="inline-material" type="button" data-related="${esc(hit.id)}">${esc(hit.n)}</button>`
      i += hit.n.length
    } else {
      out += esc(src[i])
      i += 1
    }
  }
  return out
}
function showDialog(d) {
  if (!d.open) d.showModal()
}
const detailGroups = [
  {
    id: 'overview',
    label: '概览',
    fields: ['突出特点', '主要弱点', '典型用途', '易混淆点/使用限制']
  },
  {
    id: 'structure',
    label: '结构与性能',
    fields: ['重复单元/结构', '形态与结晶性', '特征基团/结构要点', '热行为与牌号差异']
  },
  { id: 'processing', label: '加工与改性', fields: ['加工与干燥要点', '常见配方/改性方向'] },
  { id: 'recycling', label: '回收', fields: ['回收路线与分离难点'] },
  { id: 'sources', label: '资料来源', fields: ['参考来源与核验范围'] }
]
function detail(id, open = true) {
  const m = material(id),
    f = m.fields,
    active = detailSelections.get(id) || 'overview'
  $('#detailCategory').textContent = m.category
  let body = `<div class="detail-header"><div class="detail-identity"><div class="abbr">${esc(f['英文缩写'])}</div><h2>${esc(f['材料名称'])}</h2></div><div class="detail-actions"><button class="btn" data-star="${id}">${favorites.has(id) ? '★ 已收藏' : '☆ 收藏材料'}</button><button class="btn" data-compare-button="${id}">${selected.includes(id) ? '移出对比' : '加入对比'}</button><button class="btn" data-copy="${id}">复制资料</button><button class="btn" id="printDetail">打印</button></div></div>`
  body += `<nav class="detail-nav" aria-label="材料资料分组">${detailGroups.map(g => `<button class="detail-tab ${active === g.id ? 'active' : ''}" data-detail-group="${g.id}" data-material-id="${id}" aria-pressed="${active === g.id}" aria-controls="pane-${g.id}">${g.label}</button>`).join('')}</nav>`
  for (const g of detailGroups) {
    body += `<div class="detail-pane" id="pane-${g.id}" ${active !== g.id ? 'hidden' : ''}><h3 class="print-group-title">${g.label}</h3>`
    if (g.id === 'structure') body += structureFigure(f['英文缩写'])
    if (g.id === 'recycling') body += recyclingFigure(f['英文缩写'])
    for (const k of g.fields) {
      const v = f[k]
      if (v === undefined) continue
      if (g.id === 'sources') {
        const url = v.match(/https?:\/\/\S+/)?.[0]
        body += section('资料来源与核验范围', v.replace(url || '', ''), 'source-text')
        if (url)
          body += `<section class="detail-section"><a class="source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">查看参考来源 ↗</a></section>`
      } else {
        const headline = g.id === 'recycling' ? '原有资料补充' : k
        // 只在这两段做互链。结构式那类字段里「CO」是羰基不是氯醚橡胶的缩写，
        // 全字段铺开必然误链；这两段本身就是在讲「和别的材料的关系」。
        if (k === '易混淆点/使用限制' || k === '回收路线与分离难点') {
          body +=
            `<section class="detail-section"><h3>${esc(headline)}</h3>` +
            `<p>${linkifyMaterials(v, m.id)}</p></section>`
        } else {
          body += section(headline, v, k === '重复单元/结构' ? 'formula' : '')
        }
      }
    }
    if (g.id === 'overview') body += propsTable(m) + relatedMarkup(m, DATA.materials)
    body += '</div>'
  }
  $('#detailContent').innerHTML = body
  annotateTerms($('#detailContent'), DATA.terms)
  if (open) {
    showDialog($('#detailDialog'))
    $('#detailDialog').scrollTop = 0
  }
}
function selectDetailGroup(id, group) {
  if (!detailGroups.some(g => g.id === group)) return
  detailSelections.set(id, group)
  document.querySelectorAll('.detail-pane').forEach(p => {
    p.hidden = p.id !== `pane-${group}`
    if (!p.hidden) p.scrollTop = 0
  })
  document.querySelectorAll('[data-detail-group]').forEach(b => {
    const active = b.dataset.detailGroup === group
    b.classList.toggle('active', active)
    b.setAttribute('aria-pressed', String(active))
  })
  document.querySelector(`[data-detail-group="${group}"]`)?.focus({ preventScroll: true })
}
// 术语详情没有独立地址（编号只是当前这份资料的顺序，换个版本就对不上），
// 但仍然要占一条历史记录，否则手机上按返回键不是关弹窗，而是直接退出站点。
// 地址不变，靠 history.state 里的 popup 标记识别；前进键回来也能重新打开。
function otherDetail(kind, index, { record = true } = {}) {
  const x = DATA.terms[index]
  if (!x) return
  $('#detailCategory').textContent = '基础知识'
  const title = '术语/阅读规则'
  let body = `<div class="detail-header"><h2>${esc(x[title])}</h2></div>`
  for (const [k, v] of Object.entries(x)) if (k !== title && k !== '来源链接') body += section(k, v)
  if (x['来源链接'])
    body += `<section class="detail-section"><a class="source-link" href="${esc(x['来源链接'])}" target="_blank" rel="noopener noreferrer">打开原始来源 ↗</a></section>`
  $('#detailContent').innerHTML = body
  popupKind = kind
  if (record) history.pushState({ popup: kind, index }, '', location.href)
  showDialog($('#detailDialog'))
}
let comparisonOnlyDifferences = false
function openCompare({ record = true } = {}) {
  if (selected.length < 2) return
  const ms = selected.map(material),
    rows = comparisonRows(ms),
    propRows = comparisonPropRows(ms, DATA.propsSpec || []),
    visible = rows.filter(r => !comparisonOnlyDifferences || !r.same),
    propVisible = propRows.filter(r => !comparisonOnlyDifferences || !r.same)
  const sameCount = rows.filter(r => r.same).length
  const propSame = propRows.filter(r => r.same).length
  // 表头两只材料共用一份：数值表和文字表并排放，各画一份表头反而看不出是同一组
  const head = `<thead><tr><th scope="col">比较维度</th>${ms.map(m => `<th scope="col">${esc(m.fields['英文缩写'])}<div class="compare-name">${esc(m.fields['材料名称'])}</div></th>`).join('')}</tr></thead>`
  const numbers = propVisible.length
    ? `<div class="comparison"><table class="comparison-numbers"><caption>数值 · 未改性通用牌号的典型值，HDT 按 0.45 MPa；— 表示这条材料还没填，不是 0</caption>${head}<tbody>${propVisible.map(r => `<tr class="${r.same ? 'comparison-same' : 'comparison-different'}"><th scope="row">${esc(r.label)}<small>${esc(r.unit)}</small></th>${r.values.map(v => `<td>${v ? esc(v) : '<span class="prop-empty">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : ''
  const summary = [
    `${rows.length - sameCount} 项文本不同 · ${sameCount} 项文本相同`,
    propRows.length ? `${propRows.length - propSame} 项数值不同 · ${propSame} 项数值相同` : ''
  ]
    .filter(Boolean)
    .join(' · ')
  $('#compareContent').innerHTML =
    `<div class="comparison-controls"><label><input type="checkbox" id="differencesOnly" ${comparisonOnlyDifferences ? 'checked' : ''}>只看差异</label><span>${summary}</span><small>按文字内容比较，相近表述仍可能标为不同；不代表性能差异大小。</small></div>${numbers}<div class="comparison"><table>${head}<tbody>${visible.map(r => `<tr class="${r.same ? 'comparison-same' : 'comparison-different'}"><th scope="row">${esc(r.key)}<small>${r.same ? '相同' : '不同'}</small></th>${r.values.map((v, i) => `<td class="${!r.same && !r.shared[i] ? 'comparison-distinct' : ''}">${esc(v || '未收录')}</td>`).join('')}</tr>`).join('')}</tbody></table>${visible.length || propVisible.length ? '' : '<div class="empty">所选资料在当前比较维度中没有文本差异。</div>'}</div>`
  // 对比表是从详情里叠出来的第二层弹窗，也要占历史记录；否则返回键会先关掉
  // 底下的详情，对比表孤零零留在屏幕上。重复渲染（勾「只看差异」）不再压栈。
  if (record && popupKind !== 'compare') {
    popupKind = 'compare'
    history.pushState({ popup: 'compare' }, '', location.href)
  }
  showDialog($('#compareDialog'))
}
function showTermHelp(index) {
  const term = DATA.terms[index]
  if (!term) return
  let dialog = $('#termHelpDialog')
  if (!dialog) {
    dialog = document.createElement('dialog')
    dialog.id = 'termHelpDialog'
    dialog.className = 'term-help-dialog'
    dialog.setAttribute('aria-labelledby', 'termHelpTitle')
    document.body.append(dialog)
    dialog.addEventListener('click', e => {
      if (e.target !== dialog) return
      const r = dialog.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        dialog.close()
    })
  }
  dialog.innerHTML = `<div class="dialog-top"><span>术语速读 · 关闭后继续阅读</span><button class="icon-btn" data-close aria-label="关闭术语解释">×</button></div><div class="term-help-body"><h2 id="termHelpTitle">${esc(term['术语/阅读规则'])}</h2><p>${esc(term['解释'])}</p>${term['用途或易错点'] ? `<div class="term-help-note"><strong>注意区分</strong><p>${esc(term['用途或易错点'])}</p></div>` : ''}${term['来源链接'] ? `<a class="term-reference" href="${esc(term['来源链接'])}" target="_blank" rel="noopener noreferrer">术语 / 方法参考 ↗</a>` : ''}</div>`
  showDialog(dialog)
}
document.addEventListener('change', e => {
  if (e.target.id === 'differencesOnly') {
    comparisonOnlyDifferences = e.target.checked
    openCompare()
    $('#differencesOnly').focus({ preventScroll: true })
    return
  }
  if (e.target.id === 'sortBy') {
    sortBy = e.target.value
    // 切到数值排序时默认从小到大：想看「最耐热的」再点一次方向，比反过来少见
    sortDir = 'asc'
    render()
    e.target.focus({ preventScroll: true })
  }
})
async function copyMaterial(id) {
  const m = material(id)
  const text =
    `${m.fields['材料名称']}（${m.fields['英文缩写']}）\n分类：${m.category}\n` +
    Object.entries(m.fields)
      .filter(([k]) => !['材料名称', '英文缩写'].includes(k))
      .map(([k, v]) => `${k}：${v}`)
      .join('\n')
  try {
    await navigator.clipboard.writeText(text)
    toast('材料资料已复制')
  } catch {
    toast('浏览器未允许复制，请在详情中选中文字复制')
  }
}
document.addEventListener('click', e => {
  if (e.target.closest('.check') && !e.target.matches('input')) return
  const el = e.target.closest('button,a,input,article')
  if (!el) return

  if (el.dataset.favoriteType) {
    favoriteType = el.dataset.favoriteType
    render()
    return
  }
  if (el.dataset.retryFavorites) {
    favoriteNewsState = 'idle'
    render()
    return
  }
  if (el.dataset.newsSave && view === 'favorites') {
    toggleSaved(NEWS_FAVORITES, el.dataset.newsSave)
    render()
    return
  }
  if (el.dataset.materialTag) {
    const tag = el.dataset.materialTag
    ensureAtlas()
      .then(async () => {
        const normalized = tag.toUpperCase(),
          alias = { PPO: 'PPE', TPAE: 'PEBA' }
        const key = alias[normalized] || normalized
        const matches = DATA.materials.filter(
          m =>
            m.fields['材料名称'] === tag ||
            m.fields['英文缩写']
              .toUpperCase()
              .split(/[\s/、（）()]+/)
              .includes(key)
        )
        if (matches.length === 1) openDetail(matches[0].id)
        else if (matches.length) {
          switchView('materials')
          category = '全部材料'
          onlyFavorites = false
          $('#search').value = key
          render()
        } else {
          await ensureKnowledge()
          const term = DATA.terms.findIndex(t =>
            (t['关联关键词'] || '').split('|').some(k => k.toUpperCase() === normalized)
          )
          if (term >= 0) showTermHelp(term)
          else toast('图鉴暂未收录“' + tag + '”的独立词条')
        }
      })
      .catch(() => toast('材料资料载入失败，请重试'))
    return
  }

  if (el.dataset.termCategory) {
    termCategory = el.dataset.termCategory
    render()
    return
  }
  if (el.dataset.termHelp !== undefined) {
    showTermHelp(Number(el.dataset.termHelp))
    return
  }
  if (el.dataset.related) {
    detailSelections.set(el.dataset.related, 'overview')
    openDetail(el.dataset.related)
    document.querySelector('.detail-tab.active')?.focus({ preventScroll: true })
    return
  }
  if (el.dataset.detailGroup) {
    selectDetailGroup(el.dataset.materialId, el.dataset.detailGroup)
    return
  }
  if (el.dataset.view) {
    if (el.tagName === 'A' && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return
    e.preventDefault()
    switchView(el.dataset.view)
    return
  }
  if (el.dataset.category) {
    view = 'materials'
    category = el.dataset.category
    render()
    return
  }
  if (el.dataset.query) {
    view = 'materials'
    category = '全部材料'
    $('#search').value = el.dataset.query
    render()
    return
  }
  if (el.hasAttribute('data-close')) {
    el.closest('dialog').close()
    return
  }
  if (el.dataset.star) {
    saveFavorite(el.dataset.star)
    return
  }
  if (el.dataset.remove) {
    selected = selected.filter(id => id !== el.dataset.remove)
    saveCompare()
    render()
    return
  }
  if (el.dataset.compare || el.dataset.compareButton) {
    compare(el.dataset.compare || el.dataset.compareButton)
    return
  }
  if (el.dataset.copy) {
    copyMaterial(el.dataset.copy)
    return
  }
  if (el.id === 'sortDir') {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc'
    render()
    $('#sortDir').focus({ preventScroll: true })
    return
  }
  if (el.id === 'favoriteToggle') {
    onlyFavorites = !onlyFavorites
    render()
    return
  }
  if (['compareOpen', 'compareGo'].includes(el.id)) {
    openCompare()
    return
  }
  if (el.id === 'compareClear') {
    selected = []
    saveCompare()
    render()
    return
  }
  if (el.id === 'printDetail') {
    window.print()
    return
  }
  if (el.id === 'propClear') {
    for (const k of Object.keys(propFilters)) delete propFilters[k]
    $('#propFilters')
      .querySelectorAll('input[data-prop]')
      .forEach(i => (i.value = ''))
    render()
    return
  }
  if (el.id === 'reset') {
    // 空结果里那颗按钮在收藏视图下是「浏览材料」——那里没有别的东西可清
    if (view === 'favorites') {
      viewStates.delete('materials')
      switchView('materials')
      return
    }
    resetFilters()
    return
  }
  if (el.id === 'clearFilters') {
    resetFilters()
    $('#search').focus()
    return
  }
  const article = e.target.closest('article')
  if (article) {
    if (article.dataset.detail) openDetail(article.dataset.detail)
    else if (article.dataset.term !== undefined) otherDetail('term', Number(article.dataset.term))
  }
})
/**
 * 把同一网格里的卡片按行分组。
 * 卡片是 grid 布局，一行几个由视口宽度决定，所以不能按「索引 ±1」算上下——
 * 那样按 ↓ 会往右边跳一格。这里以 offsetTop 分行、offsetLeft 排序，运行时才知道
 * 每行有几个，窗口缩放后自然跟着变。
 */
function cardRows() {
  const rows = []
  for (const c of document.querySelectorAll('#content article.card')) {
    if (c.offsetParent === null) continue
    const row = rows.find(r => Math.abs(r.top - c.offsetTop) <= 4)
    if (row) row.items.push(c)
    else rows.push({ top: c.offsetTop, items: [c] })
  }
  rows.sort((a, b) => a.top - b.top)
  for (const r of rows) r.items.sort((a, b) => a.offsetLeft - b.offsetLeft)
  return rows
}

/** 在卡片之间移动焦点。返回 true 表示确实移动了，调用方据此决定要不要拦掉默认行为。 */
function moveCardFocus(key) {
  const rows = cardRows()
  let row = null
  let col = -1
  for (const r of rows) {
    const i = r.items.indexOf(document.activeElement)
    if (i >= 0) {
      row = r
      col = i
      break
    }
  }
  if (!row) return false
  let target = null
  if (key === 'ArrowRight' && col + 1 < row.items.length) target = row.items[col + 1]
  else if (key === 'ArrowLeft' && col > 0) target = row.items[col - 1]
  else if (key === 'ArrowDown' || key === 'ArrowUp') {
    const next = rows[rows.indexOf(row) + (key === 'ArrowDown' ? 1 : -1)]
    if (next) {
      // 上下移动时挑横向最接近的那张，不是直接取同列——最后一列常常不满
      const cx = document.activeElement.offsetLeft + document.activeElement.offsetWidth / 2
      target = next.items.reduce((best, c) =>
        Math.abs(c.offsetLeft + c.offsetWidth / 2 - cx) <
        Math.abs(best.offsetLeft + best.offsetWidth / 2 - cx)
          ? c
          : best
      )
    }
  }
  if (!target) return false
  target.focus({ preventScroll: true })
  target.scrollIntoView({ block: 'nearest' })
  return true
}

document.addEventListener('keydown', e => {
  const field = document.activeElement
  // Esc：搜索框里有内容就先清空（并立即重绘），已经空了再交出焦点。
  // 默认行为在 input type=search 上各浏览器不一致，这条由我们自己接管。
  if (e.key === 'Escape' && field.matches('input[type="search"]') && !$('dialog[open]')) {
    e.preventDefault()
    if (field.value) {
      field.value = ''
      field.dispatchEvent(new Event('input', { bubbles: true }))
    } else field.blur()
    return
  }
  if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(field.tagName) && !$('dialog[open]')) {
    e.preventDefault()
    $(view === 'news' ? '#newsSearch' : '#search').focus()
  }
  if (['Enter', ' '].includes(e.key) && e.target.matches('article')) {
    e.preventDefault()
    e.target.click()
  }
  if (
    e.target.matches('#content article.card') &&
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) &&
    moveCardFocus(e.key)
  )
    e.preventDefault()
})
document.querySelectorAll('dialog').forEach(d =>
  d.addEventListener('click', e => {
    if (e.target === d) {
      const r = d.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        d.close()
    }
  })
)
$('#detailDialog').addEventListener('close', onDetailClosed)
// 对比表关闭（×、Esc、点遮罩）同样要把历史退回一层；后退引起的关闭由 hashDriven 兜住
$('#compareDialog').addEventListener('close', () => {
  if (hashDriven || popupKind !== 'compare') return
  popupKind = ''
  history.back()
})
$('.brand').addEventListener('click', e => {
  e.preventDefault()
  switchView('news')
})
let searchTimer = 0
$('#search').addEventListener('input', () => {
  // render() 会把 130 条材料的 14 个字段重新拼一遍；每敲一个字都跑，长关键词会打顿。
  // 停手 180ms 再渲染，和动态页 news-view.js 的取值保持一致。
  // 但清空输入框要立刻重绘——删掉关键词就该马上看到全部，这个结果不能让人等。
  clearTimeout(searchTimer)
  if (DATA && $('#search').value === '') render()
  else searchTimer = setTimeout(render, 180)
})

// 数值筛选：同样防抖（每敲一位就重排 130 条没必要），但不重建输入框——
// render() 看到 dataset.built 就会跳过 innerHTML，输入焦点不会丢。
$('#propFilters').addEventListener('input', e => {
  const el = e.target
  if (!el.dataset.prop) return
  const key = el.dataset.prop
  const v = el.value.trim()
  propFilters[key] = propFilters[key] || {}
  propFilters[key][el.dataset.bound] = v === '' ? null : Number(v)
  if (!isFinite(propFilters[key][el.dataset.bound])) propFilters[key][el.dataset.bound] = null
  clearTimeout(searchTimer)
  searchTimer = setTimeout(render, 180)
})

let atlasRequest,
  knowledgeRequest,
  knowledgeReady = false,
  pendingView = 0
function ensureAtlas() {
  if (DATA) return Promise.resolve()
  if (!atlasRequest)
    atlasRequest = (async () => {
      const [r, learning, recycling, structures] = await Promise.all([
        fetch('data.json'),
        import('./learning.js'),
        import('./recycling.js'),
        import('./structures.js')
      ])
      if (!r.ok) throw Error('资料载入失败')
      const data = await r.json()
      ;({ relatedMarkup, comparisonRows, comparisonPropRows, annotateTerms } = learning)
      ;({ recyclingFigure } = recycling)
      ;({ structureFigure } = structures)
      DATA = data
      favorites = new Set([...favorites].filter(id => material(id)))
      // 数据改过之后旧 id 可能已经不存在；上限也跟着当前规则收一次。
      // 先去重：数组里若有重复，计数会显示「3 条」而实际只有 2 个材料。
      // 只有真的变了才写回，否则会凭空给没勾过任何东西的人留下一条空记录。
      const kept = [...new Set(selected)].filter(id => material(id)).slice(0, 3)
      if (kept.join() !== selected.join()) {
        selected = kept
        saveCompare()
      }
    })().catch(e => {
      atlasRequest = null
      throw e
    })
  return atlasRequest
}
function ensureKnowledge() {
  if (knowledgeReady) return Promise.resolve()
  if (!knowledgeRequest)
    knowledgeRequest = (async () => {
      await ensureAtlas()
      try {
        const r = await fetch('terms.json')
        if (!r.ok) throw Error()
        const k = await r.json()
        DATA.terms = k.terms
        TERM_GUIDE = k.guide
      } catch {
        const guideNames = [
          '本次整理范围',
          '资料口径',
          '文献与专利的范围',
          '表中研发切入点',
          '关联非高分子材料'
        ]
        DATA.terms = DATA.terms.filter(t => !guideNames.includes(t['术语/阅读规则']))
      }
      knowledgeReady = true
    })()
  return knowledgeRequest
}
const initial = routeParts()
const initialView = initial.view
try {
  if (initialView !== 'news') {
    await ensureAtlas()
    if (initialView === 'terms') await ensureKnowledge()
  }
  // 地址里带了筛选条件（?q=…&c=…&Tg-min=100）：分享链接、刷新、从别处跳回来都靠这条。
  // 直接写进 viewStates 而不是先 switchView 再 applyUrlState —— 后者要白渲染一遍
  // 130 张卡片，而且会打断 switchView 里记着的滚动位置恢复。
  if (DATA && ['materials', 'favorites'].includes(initialView) && location.search) {
    const st = readUrlState()
    const seeded = {
      category: st.category,
      termCategory: '全部知识',
      onlyFavorites: st.onlyFavorites,
      query: st.query,
      scroll: 0
    }
    viewStates.set('materials', seeded)
    if (initialView === 'favorites') viewStates.set('favorites', seeded)
    sortBy = st.sortBy
    sortDir = st.sortDir
    for (const [k, v] of Object.entries(st.props)) propFilters[k] = v
  }
  if (initialView !== view) switchView(initialView, { historyMode: 'none' })
  else render()
  if (view === 'news') await newsController.ready
} catch {
  toast('资料暂时未能载入，请稍后重试')
}
// 用分享链接直接打开某条材料时，先垫一条「列表态」历史记录，
// 这样关闭详情按返回键是回到材料列表，而不是退出站点。
if (initial.materialId) {
  if (DATA && material(initial.materialId)) {
    history.replaceState({ view: 'materials' }, '', '#materials')
    history.pushState({ detail: initial.materialId }, '', materialHash(initial.materialId))
    handledHash = location.hash
    detailHashId = initial.materialId
    detail(initial.materialId)
  } else {
    history.replaceState({ view: 'materials' }, '', '#materials')
    handledHash = location.hash
  }
}
clearTimeout(window.atlasLoaderFallback)
const loader = $('#siteLoader')
if (loader) {
  loader.classList.add('loader-leaving')
  setTimeout(() => loader.remove(), 600)
}
animateView()
