const esc = v =>
  String(v).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
const polyester = {
  PET: ['乙二醇（EG）', 'BHET'],
  PTT: ['1,3-丙二醇（PDO）', 'BHPT'],
  PBT: ['1,4-丁二醇（BDO）', 'BHBT']
}
export function recyclingProfile(abbr) {
  if (polyester[abbr]) {
    const [diol, ester] = polyester[abbr]
    return {
      status: '已有研究路线；具体条件与收率依原文核验',
      rows: [
        ['断什么键', '主链酯键；醇解与水解的产物体系不同。'],
        [
          '怎么回收',
          `同源二醇醇解可得到${ester}及低聚物；甲醇解可得到DMT；水解可得到对苯二甲酸（TPA）。`
        ],
        [
          '得到什么',
          `同源醇解：${ester}；水解：TPA与${diol}。改用其他二醇时产物可能发生酯交换，不能沿用同源产物名称。`
        ],
        [
          '怎样分离',
          '先脱除玻纤等不溶物；芳香族单体可按体系结晶、过滤和洗涤；二醇与溶剂需另行回收。分离顺序应随催化剂、盐及添加剂调整。'
        ],
        [
          '主要难点',
          '单体与低聚物分开；控制染料、阻燃剂、金属残留和母液杂质累积。转化率、分离收率与纯度须分别评价。'
        ]
      ],
      sources: [
        ['聚酯回收机理研究', 'https://www.nature.com/articles/s41467-024-50702-5'],
        ['PET / PBT / PTT研究实例', 'https://www.nature.com/articles/s41467-026-71862-6']
      ]
    }
  }
  if (/PPE|PPO/.test(abbr))
    return {
      status: '氧化解聚已有论文；合金适配性不能直接外推',
      rows: [
        ['断什么键', '芳醚主链的氧化断裂，同时伴随芳环结构转化；不等同于普通聚酯醇解。'],
        [
          '怎么回收',
          '已有研究通过氧化解聚将PPO转化为2,6-二甲基对苯醌；机械再加工和溶剂分选属于不同回收层级。'
        ],
        ['得到什么', '研究目标产物为2,6-二甲基对苯醌（DMBQ），不是原始聚合单体2,6-二甲基苯酚。'],
        [
          '怎样分离',
          '需按反应介质设计产物萃取或结晶及氧化剂、催化组分脱除；具体工序应回查原文，不能直接视作通用成熟流程。'
        ],
        [
          '主要难点',
          '实际mPPE常与PS或PA共混；氧化选择性、共混相损伤、阻燃剂及金属残留会改变产物与后处理。'
        ]
      ],
      sources: [['PPO氧化解聚原始论文', 'https://doi.org/10.1002/cssc.202300684']]
    }
  if (abbr === 'PMMA')
    return {
      status: '热解聚回收MMA已有长期研究；配方影响显著',
      rows: [
        ['断什么键', '碳碳主链断裂后可发生链端连续解聚；侧链酯基并非主要回收目标。'],
        ['怎么回收', '热解聚产生含MMA蒸气，经冷凝收集，再按杂质组成精制。'],
        ['得到什么', '目标为甲基丙烯酸甲酯（MMA）；粗冷凝物还可能包含水、低聚物及其他副产物。'],
        [
          '怎样分离',
          '固体填料与残渣分离；蒸气冷凝；粗MMA再按组成蒸馏或进一步净化。聚合抑制剂和储存条件需单独控制。'
        ],
        [
          '主要难点',
          '交联、共聚及填料会改变解聚和传热；夹带、管路沉积及产品再聚合影响回收。不能把粗油收率等同MMA收率。'
        ]
      ],
      sources: [
        [
          'PMMA热解聚研究资料',
          'https://wrap.warwick.ac.uk/id/eprint/106480/1/WRAP_Theses_Pring_1989.pdf'
        ]
      ]
    }
  if (/PEBA|TPAE/.test(abbr))
    return {
      status: '结构指导的研究方向；此处未确认PEBA整体闭环实证',
      rows: [
        ['断什么键', '需先确认PA硬段、聚醚软段及其连接键；不同牌号不能采用同一种断键假设。'],
        [
          '怎么回收',
          '可先评估机械再加工与溶剂分离；选择性裂解PA段并保留聚醚属于需要验证的化学回收方向。'
        ],
        [
          '得到什么',
          '预期随PA种类而变，可能涉及氨基酸、内酰胺或二胺/二酸衍生物；聚醚能否完整保留必须测定。'
        ],
        [
          '怎样分离',
          '可研究极性、酸碱性或分子量差异带来的分相、结晶与膜分离；这里不代表已建立通用纯化工艺。'
        ],
        [
          '主要难点',
          '软段氧化或断链、嵌段连接差异、鞋材染料与填料；需同时评价两类片段的回收率、纯度和分子量。'
        ]
      ],
      sources: [
        ['PEBA组成与结构', 'https://pebaxpowered.arkema.com/en/pebax-technology/'],
        [
          '聚酰胺断键邻近技术（不是PEBA整体实证）',
          'https://www.nature.com/articles/s41467-025-64197-1'
        ]
      ]
    }
  if (/TPEE|TPC-ET/.test(abbr))
    return {
      status: '以常见聚醚酯型为例；选择性分段回收仍需验证',
      rows: [
        [
          '断什么键',
          '聚酯硬段及软硬段连接中的酯键是潜在反应位点；同时应避免聚醚软段非选择性破坏。'
        ],
        ['怎么回收', '可研究醇解或水解拆解聚酯段；能否保留并回收聚醚宏二醇需针对具体牌号验证。'],
        [
          '得到什么',
          'PBT硬段在不同介质中可形成BHBT、BHET、TPA等不同产物；软段可能形成聚醚富集组分，不能预设为纯PTMG。'
        ],
        [
          '怎样分离',
          '需研究芳香族小分子与聚醚组分的分相、结晶或分子量分级，再回收过量二醇；不预设单一步骤即可得到聚合级产品。'
        ],
        [
          '主要难点',
          '软硬段比例、低聚物共存、黏度及添加剂影响分离；必须跟踪软段分子量、端基、残留芳香酯和再聚合性能。'
        ]
      ],
      sources: [['聚醚酯嵌段结构研究', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10095974/']]
    }
  return null
}
export function recyclingFigure(abbr) {
  const x = recyclingProfile(abbr)
  if (!x) return ''
  return `<section class="recycling-guide"><div class="recycling-heading"><h3>回收路线速览</h3><span>五步理解</span></div><p class="recycling-status">${esc(x.status)}</p><dl>${x.rows.map(([k, v], i) => `<div><dt><small>0${i + 1}</small>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><div class="recycling-sources">${x.sources.map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)} ↗</a>`).join('')}</div></section>`
}
