const labels = {
  PET: { m: 2, formula: '(C₁₀H₈O₄)ₙ' },
  PTT: { m: 3, formula: '(C₁₁H₁₀O₄)ₙ' },
  PBT: { m: 4, formula: '(C₁₂H₁₂O₄)ₙ' },
  PMMA: { formula: '(C₅H₈O₂)ₙ' }
}
const sub = { 2: '₂', 3: '₃', 4: '₄' }
function canvas(inner, label, height = 230) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 ${height}" role="img" aria-label="${label}" class="polymer-svg"><title>${label}</title><g fill="none" stroke="#263b2c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${inner.lines}</g><g fill="#263b2c" font-family="Arial, sans-serif" font-size="25" text-anchor="middle">${inner.text}</g></svg>`
}
function polyester(m) {
  return canvas(
    {
      lines: `<path d="M52 51 H40 V165 H52 M652 51 H664 V165 H652 M20 108 H72 M107 108 H125 M232 108 H250 M284 108 H314 M352 108 H395 M515 108 H582 M614 108 H684 M329 88 V58 M337 88 V58 M594 88 V58 M602 88 V58 M395 108 L425 56 H485 L515 108 L485 160 H425 Z M407 105 L431 66 M437 149 H479 M502 108 L480 70"/>`,
      text: `<text x="90" y="117">O</text><text x="179" y="117">(CH₂)${sub[m]}</text><text x="267" y="117">O</text><text x="333" y="117">C</text><text x="333" y="46">O</text><text x="598" y="117">C</text><text x="598" y="46">O</text><text x="682" y="184" font-size="20">n</text>`
    },
    `聚酯重复单元：O-(CH2)${m}-O-C(=O)-对苯环-C(=O)，方括号n表示重复次数`
  )
}
function pmma() {
  return canvas(
    {
      lines: `<path d="M90 16 H77 V310 H90 M610 16 H623 V310 H610 M55 104 H182 M245 104 H347 M375 104 H645 M361 84 V49 M361 124 V179 M381 198 H426 M381 206 H426 M361 218 V261"/>`,
      text: `<text x="214" y="113">CH₂</text><text x="361" y="113">C</text><text x="361" y="35">CH₃</text><text x="361" y="210">C</text><text x="446" y="210">O</text><text x="361" y="291">O–CH₃</text><text x="642" y="327" font-size="20">n</text>`
    },
    'PMMA重复单元：碳碳主链CH2-C，取代基为甲基和甲氧羰基',
    350
  )
}
function baseStructureFigure(abbr) {
  const x = labels[abbr]
  if (!x) return ''
  const source =
    abbr === 'PMMA'
      ? 'https://wrap.warwick.ac.uk/id/eprint/106480/1/WRAP_Theses_Pring_1989.pdf'
      : 'https://doi.org/10.1021/acs.macromol.4c00683'
  const note =
    abbr === 'PMMA'
      ? '碳碳主链上的两个侧基分别为甲基和酯基；MMA 单体的碳碳双键已在聚合时打开。'
      : `酯基和对苯环构成共同骨架；${abbr} 的二醇片段含 ${x.m} 个亚甲基。PET / PTT / PBT 分别为 2 / 3 / 4 个。`
  return `<figure class="structure-figure"><div class="structure-figure-top"><strong>${abbr} · 理想重复单元</strong><span>二维结构示意</span></div><div class="structure-image">${abbr === 'PMMA' ? pmma() : polyester(x.m)}</div><figcaption><div class="repeat-formula"><span>重复单元化学式</span><strong>${x.formula}</strong></div><p>${note}</p><small>n 表示重复次数；这里表示理想线性均聚物，不代表实际牌号的全部组成、链端或立体构型，也不是单体分子式。</small><a href="${source}" target="_blank" rel="noopener noreferrer">结构参考 ↗</a></figcaption></figure>`
}

function ppe() {
  return canvas(
    {
      lines: `<path d="M90 42 H77 V210 H90 M606 42 H619 V210 H606 M55 108 H136 M170 108 H245 M245 108 L275 56 H335 L365 108 L335 160 H275 Z M258 108 L281 68 M288 148 H328 M351 108 L329 69 M275 56 V25 M275 160 V191 M365 108 H642"/>`,
      text: `<text x="153" y="117">O</text><text x="275" y="22" font-size="20">CH₃</text><text x="275" y="216" font-size="20">CH₃</text><text x="640" y="226" font-size="20">n</text>`
    },
    '聚2,6-二甲基1,4-苯醚：主链芳醚，氧邻位两个甲基',
    250
  )
}
function blocks(type) {
  const peba = type === 'PEBA'
  return `<svg class="polymer-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 210" role="img" aria-label="${peba ? '聚酰胺硬段与聚醚软段' : '聚酯硬段与聚醚软段'}嵌段示意，非精确化学键结构"><title>软硬段组成示意</title><path d="M30 87 H690" stroke="#527044" stroke-width="3"/><rect x="65" y="52" width="245" height="70" rx="8" fill="#dfe8d7" stroke="#527044"/><rect x="370" y="52" width="285" height="70" rx="28" fill="#f4eedf" stroke="#9d895e"/><g font-family="Arial,Microsoft YaHei,sans-serif" text-anchor="middle" fill="#263b2c"><text x="187" y="82" font-size="23">${peba ? '聚酰胺硬段' : '聚酯硬段'}</text><text x="187" y="107" font-size="16">${peba ? '酰胺基 · 结晶支撑' : '常见 PBT · 结晶支撑'}</text><text x="512" y="82" font-size="23">聚醚软段</text><text x="512" y="107" font-size="16">链段柔性 · 弹性回复</text><text x="360" y="172" font-size="18">多嵌段链：硬段 / 软段交替分布（示意）</text></g></svg>`
}
export function structureFigure(abbr) {
  const original = baseStructureFigure(abbr)
  if (original) return original
  let title, formula, note, graphic, source
  if (/PPE|PPO/.test(abbr)) {
    title = 'PPE / PPO · 理想重复单元'
    formula = '(C₈H₈O)ₙ'
    graphic = ppe()
    note =
      '图示为聚(2,6-二甲基-1,4-苯醚)。芳醚键位于主链，两个甲基位于醚氧邻位；mPPE合金还可含PS、PA等组分，不能用单一重复式代表整个合金。'
    source = 'https://doi.org/10.1002/cssc.202300684'
  } else if (/PEBA|TPAE|TPEE|TPC-ET/.test(abbr)) {
    const peba = /PEBA|TPAE/.test(abbr)
    title = peba ? 'PEBA / TPAE · 软硬段结构' : 'TPEE / TPC-ET · 软硬段结构'
    formula = '无统一重复单元化学式'
    graphic = blocks(peba ? 'PEBA' : 'TPEE')
    note = peba
      ? '典型PEBA由聚酰胺硬段与聚醚软段组成。PA种类、聚醚种类、嵌段长度和连接结构依牌号变化，不能统一写成一种分子式。'
      : '典型聚醚酯TPEE由聚酯硬段和聚醚软段组成，常见PBT硬段搭配PTMG软段；TPEE为材料家族，具体结构与比例依牌号核验。'
    source = peba
      ? 'https://pebaxpowered.arkema.com/en/pebax-technology/'
      : 'https://www.celanese.com/en/products/hytrel'
  } else return ''
  return `<figure class="structure-figure"><div class="structure-figure-top"><strong>${title}</strong><span>${formula.startsWith('无') ? '嵌段组成示意' : '二维结构示意'}</span></div><div class="structure-image">${graphic}</div><figcaption><div class="repeat-formula"><span>结构表达</span><strong>${formula}</strong></div><p>${note}</p><small>均聚物图中的n表示重复次数。软硬段图中的连线仅表示嵌段连接，不表示具体连接键或实际相区尺寸。</small><a href="${source}" target="_blank" rel="noopener noreferrer">结构参考 ↗</a></figcaption></figure>`
}
