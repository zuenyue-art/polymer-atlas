const cache=new Map();let manifestPromise;
async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error('动态载入失败');return r.json()}
export function getNewsIndex(){if(!manifestPromise)manifestPromise=json('news-index.json').catch(e=>{manifestPromise=null;throw e});return manifestPromise}
async function loadMonth(m){if(!cache.has(m.month))cache.set(m.month,json(m.url).catch(e=>{cache.delete(m.month);throw e}));return cache.get(m.month)}
export async function getNewsItems({month='',all=false,limit=12}={}){const index=await getNewsIndex();let items=[];for(const m of index.months){if(month&&m.month!==month)continue;const part=await loadMonth(m);items.push(...part.items);if(!all&&!month&&items.length>=limit)break}return items}
