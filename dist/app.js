import{recyclingFigure}from './recycling.mjs';
import{structureFigure}from './structures.mjs';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let DATA,view='materials',category='全部材料',onlyFavorites=false,selected=[],favorites=new Set();
try{const saved=JSON.parse(localStorage.getItem('polymer-atlas-favorites')||'[]');if(Array.isArray(saved))favorites=new Set(saved.filter(x=>typeof x==='string'));}catch{}
let toastTimer;
const detailSelections=new Map();
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2200)}
function material(id){return DATA.materials.find(m=>m.id===id)}
function saveFavorite(id){if(favorites.has(id))favorites.delete(id);else favorites.add(id);try{localStorage.setItem('polymer-atlas-favorites',JSON.stringify([...favorites]))}catch{toast('本次收藏可用，浏览器未允许保存到本地')}render();if($('#detailDialog').open)detail(id,false)}
function compare(id){if(selected.includes(id))selected=selected.filter(x=>x!==id);else if(selected.length<3)selected.push(id);else toast('最多对比 3 条记录，请先移除一条');render();if($('#detailDialog').open)detail(id,false)}
function names(){return {materials:'材料图鉴',favorites:'我的收藏',terms:'基础术语',literature:'回收文献'}}
function switchView(next){view=next;category='全部材料';onlyFavorites=false;$('#search').value='';render()}
function items(){const q=$('#search').value.trim().toLowerCase();if(view==='terms')return DATA.terms.filter(x=>Object.values(x).join(' ').toLowerCase().includes(q));if(view==='literature')return DATA.literature.filter(x=>Object.values(x).join(' ').toLowerCase().includes(q));return DATA.materials.filter(m=>(category==='全部材料'||m.category===category)&&(!(onlyFavorites||view==='favorites')||favorites.has(m.id))&&Object.values(m.fields).join(' ').toLowerCase().includes(q)).sort((a,b)=>{
 const score=m=>q&&m.fields['英文缩写'].toLowerCase().split(/[\s/、]+/).includes(q)?2:q&&m.fields['材料名称'].toLowerCase().includes(q)?1:0;return score(b)-score(a);
})}
function render(){
 const isMaterial=['materials','favorites'].includes(view),list=items();
 document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
 $('#favoriteCount').textContent=[...favorites].filter(x=>material(x)).length;
 const cats=['全部材料',...new Set(DATA.materials.map(m=>m.category))];
 $('#categories').innerHTML=cats.map(c=>`<button class="category ${category===c?'active':''}" data-category="${esc(c)}">${esc(c)}<small>${c==='全部材料'?DATA.materials.length:DATA.materials.filter(m=>m.category===c).length}</small></button>`).join('');
 $('#categories').hidden=!isMaterial;$('.categories-label').hidden=!isMaterial;
 $('#breadcrumb').textContent=names()[view];
 const titles={materials:'材料图鉴' ,favorites:'我的材料收藏',terms:'基础术语',literature:'从回收路线，<br>寻找新的可能。'};
 $('#pageTitle').innerHTML=titles[view];
 $('#pageSubtitle').textContent={materials:'结构、性能、加工与回收，让材料知识更好查，也更好懂。',favorites:'收藏记录保存在当前浏览器，方便随时回看。',terms:'把常见概念放在一起，厘清结构、性能与回收的关系。',literature:'10 项重点论文与专利，附技术路线、来源和核验范围。'}[view];
 $('#search').placeholder=isMaterial?'搜索名称、缩写、特性或用途…':view==='terms'?'搜索术语，例如 Tg、BHPT、水解…':'搜索材料、文献题名或技术路线…';
 $('#quickFilters').hidden=!isMaterial;$('#favoriteToggle').hidden=!isMaterial||view==='favorites';$('#compareOpen').hidden=!isMaterial;
 $('#favoriteToggle').setAttribute('aria-pressed',onlyFavorites);$('#compareCount').textContent=selected.length;$('#compareOpen').disabled=selected.length<2;
 $('#resultsTitle').textContent=view==='materials'?category:names()[view];$('#resultCount').textContent=`${list.length} ${isMaterial?'条记录':view==='terms'?'个词条':'项资料'}`;
 $('#resultsHint').textContent=isMaterial?'点击卡片，查看完整资料':'点击卡片，阅读说明';
 $('#content').innerHTML=list.length?list.map(x=>isMaterial?card(x):view==='terms'?termCard(x):literatureCard(x)).join(''):`<div class="empty"><h3>${view==='favorites'?'还没有收藏的材料':'没有找到匹配内容'}</h3><p>${view==='favorites'?'点击材料卡片右上角的星标，即可收藏。':'试试更短的关键词，或切换回全部分类。'}</p><button id="reset">${view==='favorites'?'浏览材料':'清除筛选'}</button></div>`;
 renderTray();
}
function card(m){const f=m.fields,abbr=f['英文缩写'];return `<article class="card material-card" tabindex="0" role="button" data-detail="${m.id}" aria-label="查看${esc(f['材料名称'])}详情"><div class="card-top"><span class="badge">${esc(m.category)}</span><button class="icon-btn ${favorites.has(m.id)?'saved':''}" data-star="${m.id}" aria-pressed="${favorites.has(m.id)}" aria-label="${favorites.has(m.id)?'取消收藏':'收藏'}${esc(f['材料名称'])}">${favorites.has(m.id)?'★':'☆'}</button></div><div class="abbr ${abbr.length>12?'long':''}">${esc(abbr)}</div><h3>${esc(f['材料名称'])}</h3><div class="card-facts"><div class="card-fact"><span>特点</span><p>${esc(f['突出特点'])}</p></div><div class="card-fact limitation"><span>局限</span><p>${esc(f['主要弱点'])}</p></div></div><div class="card-bottom"><label class="check"><input type="checkbox" data-compare="${m.id}" ${selected.includes(m.id)?'checked':''}>加入对比</label><span>查看资料 <span class="arrow">↗</span></span></div></article>`}
function termCard(x){const index=DATA.terms.indexOf(x);return `<article class="card term-card" tabindex="0" role="button" data-term="${index}"><span class="badge">基础知识</span><h3>${esc(x['术语/阅读规则'])}</h3><p>${esc(x['解释'])}</p><div class="card-bottom">阅读完整解释 <span class="arrow">↗</span></div></article>`}
function literatureCard(x){const index=DATA.literature.indexOf(x);return `<article class="card literature-card" tabindex="0" role="button" data-literature="${index}"><div class="card-top"><span class="badge">${esc(x['材料'])}</span><span style="font-size:10px;color:var(--muted)">${esc(x['年份或公开日'])}</span></div><h3>${esc(x['题名/资料'])}</h3><p>${esc(x['技术路线/可学习内容'])}</p><div class="card-bottom">技术路线与来源 <span class="arrow">↗</span></div></article>`}
function renderTray(){const tray=$('#compareTray');tray.hidden=selected.length===0;$('#compareSelected').innerHTML=selected.map(id=>`<span class="selected-tag">${esc(material(id).fields['英文缩写'])}<button data-remove="${id}" aria-label="移除${esc(material(id).fields['英文缩写'])}">×</button></span>`).join('');$('#compareGo').disabled=selected.length<2;$('#compareGo').textContent=selected.length<2?'再选一种材料':'开始对比'}
function section(title,text,extra=''){return `<section class="detail-section"><h3>${esc(title)}</h3><p class="${extra}">${esc(text)}</p></section>`}
function showDialog(d){if(!d.open)d.showModal()}
const detailGroups=[
 {id:'overview',label:'概览',fields:['突出特点','主要弱点','典型用途','易混淆点/使用限制']},
 {id:'structure',label:'结构与性能',fields:['重复单元/结构','形态与结晶性','特征基团/结构要点','热行为与牌号差异']},
 {id:'processing',label:'加工与改性',fields:['加工与干燥要点','常见配方/改性方向']},
 {id:'recycling',label:'回收',fields:['回收路线与分离难点']},
 {id:'sources',label:'资料来源',fields:['参考来源与核验范围']}
];
function detail(id,open=true){const m=material(id),f=m.fields,active=detailSelections.get(id)||'overview';$('#detailCategory').textContent=m.category;let body=`<div class="detail-header"><div class="detail-identity"><div class="abbr">${esc(f['英文缩写'])}</div><h2>${esc(f['材料名称'])}</h2></div><div class="detail-actions"><button class="btn" data-star="${id}">${favorites.has(id)?'★ 已收藏':'☆ 收藏材料'}</button><button class="btn" data-compare-button="${id}">${selected.includes(id)?'移出对比':'加入对比'}</button><button class="btn" data-copy="${id}">复制资料</button><button class="btn" id="printDetail">打印</button></div></div>`;
 body+=`<nav class="detail-nav" aria-label="材料资料分组">${detailGroups.map(g=>`<button class="detail-tab ${active===g.id?'active':''}" data-detail-group="${g.id}" data-material-id="${id}" aria-pressed="${active===g.id}" aria-controls="pane-${g.id}">${g.label}</button>`).join('')}</nav>`;
 for(const g of detailGroups){body+=`<div class="detail-pane" id="pane-${g.id}" ${active!==g.id?'hidden':''}><h3 class="print-group-title">${g.label}</h3>`;if(g.id==='structure')body+=structureFigure(f['英文缩写']);if(g.id==='recycling')body+=recyclingFigure(f['英文缩写']);for(const k of g.fields){const v=f[k];if(v===undefined)continue;if(g.id==='sources'){const url=v.match(/https?:\/\/\S+/)?.[0];body+=section('资料来源与核验范围',v.replace(url||'',''),'source-text');if(url)body+=`<section class="detail-section"><a class="source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">查看参考来源 ↗</a></section>`}else{body+=section(g.id==='recycling'?'原有资料补充':k,v,k==='重复单元/结构'?'formula':'')}}body+='</div>'}
 $('#detailContent').innerHTML=body;if(open){showDialog($('#detailDialog'));$('#detailDialog').scrollTop=0;}
}
function selectDetailGroup(id,group){if(!detailGroups.some(g=>g.id===group))return;detailSelections.set(id,group);document.querySelectorAll('.detail-pane').forEach(p=>{p.hidden=p.id!==`pane-${group}`;if(!p.hidden)p.scrollTop=0});document.querySelectorAll('[data-detail-group]').forEach(b=>{const active=b.dataset.detailGroup===group;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});document.querySelector(`[data-detail-group="${group}"]`)?.focus({preventScroll:true})}
function otherDetail(kind,index){const x=kind==='term'?DATA.terms[index]:DATA.literature[index];$('#detailCategory').textContent=kind==='term'?'基础术语':'论文与专利';const title=kind==='term'?'术语/阅读规则':'题名/资料';let body=`<div class="detail-header"><h2>${esc(x[title])}</h2></div>`;for(const [k,v]of Object.entries(x))if(k!==title&&k!=='来源链接')body+=section(k,v);if(x['来源链接'])body+=`<section class="detail-section"><a class="source-link" href="${esc(x['来源链接'])}" target="_blank" rel="noopener noreferrer">打开原始来源 ↗</a></section>`;$('#detailContent').innerHTML=body;showDialog($('#detailDialog'))}
function openCompare(){if(selected.length<2)return;const ms=selected.map(material);const fields=Object.keys(ms[0].fields).filter(k=>!['材料名称','英文缩写','参考来源与核验范围'].includes(k));$('#compareContent').innerHTML=`<div class="comparison"><table><thead><tr><th>比较维度</th>${ms.map(m=>`<th>${esc(m.fields['英文缩写'])}<div style="font-size:11px;font-weight:400;margin-top:6px">${esc(m.fields['材料名称'])}</div></th>`).join('')}</tr></thead><tbody>${fields.map(k=>`<tr><td>${esc(k)}</td>${ms.map(m=>`<td>${esc(m.fields[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;showDialog($('#compareDialog'))}
async function copyMaterial(id){const m=material(id);const text=`${m.fields['材料名称']}（${m.fields['英文缩写']}）\n分类：${m.category}\n`+Object.entries(m.fields).filter(([k])=>!['材料名称','英文缩写'].includes(k)).map(([k,v])=>`${k}：${v}`).join('\n');try{await navigator.clipboard.writeText(text);toast('材料资料已复制')}catch{toast('浏览器未允许复制，请在详情中选中文字复制')}}
document.addEventListener('click',e=>{
 if(e.target.closest('.check')&&!e.target.matches('input'))return;
 const el=e.target.closest('button,a,input,article');if(!el)return;
 if(el.dataset.detailGroup){selectDetailGroup(el.dataset.materialId,el.dataset.detailGroup);return}
 if(el.dataset.view){switchView(el.dataset.view);return}
 if(el.dataset.category){view='materials';category=el.dataset.category;render();return}
 if(el.dataset.query){view='materials';category='全部材料';$('#search').value=el.dataset.query;render();return}
 if(el.hasAttribute('data-close')){el.closest('dialog').close();return}
 if(el.dataset.star){saveFavorite(el.dataset.star);return}
 if(el.dataset.remove){selected=selected.filter(id=>id!==el.dataset.remove);render();return}
 if(el.dataset.compare||el.dataset.compareButton){compare(el.dataset.compare||el.dataset.compareButton);return}
 if(el.dataset.copy){copyMaterial(el.dataset.copy);return}
 if(el.id==='favoriteToggle'){onlyFavorites=!onlyFavorites;render();return}
 if(['compareOpen','compareGo'].includes(el.id)){openCompare();return}
 if(el.id==='compareClear'){selected=[];render();return}
 if(el.id==='printDetail'){window.print();return}
 if(el.id==='reset'){switchView('materials');return}
 const article=e.target.closest('article');if(article){if(article.dataset.detail)detail(article.dataset.detail);else if(article.dataset.term!==undefined)otherDetail('term',Number(article.dataset.term));else if(article.dataset.literature!==undefined)otherDetail('literature',Number(article.dataset.literature))}
});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)&&!$('dialog[open]')){e.preventDefault();$('#search').focus()}if(['Enter',' '].includes(e.key)&&e.target.matches('article')){e.preventDefault();e.target.click()}});
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}}));
$('.brand').addEventListener('click',e=>{e.preventDefault();if(DATA)switchView('materials')});
$('#search').addEventListener('input',()=>{if(DATA)render()});
try{const response=await fetch('data.json');if(!response.ok)throw Error('资料载入失败');DATA=await response.json();favorites=new Set([...favorites].filter(id=>material(id)));render()}catch(e){$('#content').innerHTML='<div class="empty error"><h3>资料暂时未能载入</h3><p>请刷新页面重试。</p></div>';$('#resultCount').textContent='载入失败'}
