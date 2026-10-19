# 高分子材料图鉴

中文材料知识库，包含130条材料记录、分类搜索、收藏、材料对比、基础术语和回收文献。

## 静态部署

发布目录：`dist`。图鉴本身（`index.html` + `app.js`）无构建步骤；`dist/` 里的派生产物（新闻归档、材料页、可下载 Excel、`robots.txt` / `sitemap.xml`）由 `npm run build` 一次性重建，生成结果随仓库提交。

```bash
npm run build    # 依序：新闻归档 → 材料页预渲染 → 可下载 Excel → sitemap
npm run serve    # 本地预览 http://localhost:8080
```

资料核验范围见每条记录；研究构思不等同于已验证实验结果。收藏保存在访问者当前浏览器。

## 材料的独立页面（预渲染）

每条材料都有一份真实存在的静态页：`dist/m/<id>/index.html`，线上地址形如 `/m/m-0-0/`。

为什么要单独做这一层：图鉴是纯前端渲染的，材料正文只存在于 `data.json` 里，搜索引擎只看得到一个根地址。预渲染之后，每条材料有自己的地址、标题、描述、canonical 和分享卡片，被 `sitemap.xml` 收录，并通过「同分类的其他材料」互相链接，成为一张可爬取的图。页面不加载 `app.js`——它的定位是内容页，读取快、关掉 JS 也读得完；搜索、对比、收藏留在图鉴里，页面上给了回链（`/#materials/<id>`，图鉴会自动展开那条材料）。

- 生成器：`scripts/prerender.mjs`（字段分组与 `app.js` 的 `detailGroups` 对齐，脚本会检查 data.json 的每个字段都被收录，漏了直接报错）
- 版式：`dist/material.css`，只补这一页独有的骨架，颜色与组件复用 `style.css` / `layout.css`
- 站点地址可用环境变量 `SITE_ORIGIN` 覆盖（绑定自定义域名后不用改代码）
- `wrangler.jsonc` 里显式声明了 `html_handling: auto-trailing-slash`，`/m/<id>/` 由这个策略解析到 `index.html`

## 可下载的 Excel

首页「下载完整 Excel」指向 `dist/materials.xlsx`：九个材料分类各一张表，另有术语表与重点回收文献表。

它由 `scripts/build-xlsx.py` 从 `data.json` / `terms.json` 生成。此前它是一份手工维护的第二份副本，不受任何检查约束——改了 JSON 忘了改表，读者下载到的就是过期内容，而且没人会发现。改成派生文件之后，它与站点展示的内容同源同批次。

术语取 `terms.json` 的 68 条正式词条，而不是 `data.json` 内嵌的那一份：后者只是 `terms.json` 加载失败时的回退数据，条数少且会过时。

生成与校验依赖 `openpyxl`，与分享卡片用到的 Pillow 一并列在 `scripts/requirements.txt`：

```bash
pip install -r scripts/requirements.txt
```

## 本地校验

```bash
npm run check    # 提交前跑一次，四步全过才算干净
```

- `npm run check:derived` —— 两步。先看新闻归档：用 `news.json` 重建索引与月度文件，与仓库现有内容不一致即失败，专治「只改了 `news.json`，忘了同步派生文件」。再看可下载的 Excel：`dist/materials.xlsx` 由 `scripts/build-xlsx.py` 从 JSON 生成，`check-xlsx.py` 读回来逐格比对，专治「改了数据忘了重新生成，读者下载到过期内容」。
- `npm run check:prerender` —— 逐字节比对 130 份材料页与 `data.json` 当前内容。专治「改了数据，忘了重跑预渲染」——漏一页就是 sitemap 少收录一条内容，而且不会有任何报错。
- `npm run check:seo` —— 校验首页与 `news.html` 的分享卡片信息，并要求每条材料都有预渲染页，然后与 `robots.txt` / `sitemap.xml` 对账。
- `npm run audit` —— 校验 id / url 去重、必填字段、日期合法性、月度分档并集、索引覆盖等。数据错误时命令返回非 0；工程习惯类问题只告警，不拦截提交。

另有 `npm run check:links` 单独查链接：dist 下全部 HTML（含材料页）的站内引用必须存在，数据文件里的外链逐一探测可达性。401/403/429 这类「站点在但拒绝脚本」不计为失效，连不上默认只告警。

`.github/workflows/audit.yml` 会在 `dist/**` 或脚本变更时自动执行上述检查，并每天定时跑一次链接检查，结果写入 job summary。

## 材料动态

`dist/news.html` 提供短摘要、原始来源、材料/类型/月度筛选和分页历史归档。新闻存档为 `dist/news.json`，更新流程见 `NEWS_UPDATE.md`。

## 部署

Cloudflare Workers，配置在根目录 `wrangler.jsonc`，发布目录 `dist`。

push 到 `main` 会自动部署：仓库已接入 Cloudflare Workers Builds（Workers & Pages → 该 Worker → 设置 → 构建 → Git 集成），Cloudflare 自己监视 `main`、拉取仓库并上传 `dist`，GitHub 侧不需要配任何 secret，每次推送会在 PR/commit 上出现一条「Workers Builds」检查。

CI 里因此**没有**部署工作流——两套部署机制同时开，一次推送会传两遍、还会在版本历史里互相顶替；GitHub Actions 也不能在 job 级 `if` 里引用 `secrets`，硬写只会让每次推送都挂一个红叉。手动部署仍可用：

```bash
npx wrangler deploy    # 首次需要先 wrangler login
```

GitHub 仓库私有不代表已部署的网站私有。

## 许可

本项目以 [MIT 许可证](LICENSE) 发布，代码与数据（`dist/data.json`、`dist/terms.json`、`dist/news*.json`）均可自由使用、修改、分发和商用，保留版权声明即可。

材料条目整理自公开文献与专利，各条的来源链接见记录本身；商用或再发布前建议回到原始来源核对。数据按「现状」提供，不构成任何材料选型、安全或合规建议。
