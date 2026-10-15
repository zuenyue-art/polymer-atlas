# 高分子材料图鉴

中文材料知识库，包含130条材料记录、分类搜索、收藏、材料对比、基础术语和回收文献。

## 静态部署

发布目录：`dist`。无需构建步骤。

资料核验范围见每条记录；研究构思不等同于已验证实验结果。收藏保存在访问者当前浏览器。

## 材料动态

`dist/news.html` 提供短摘要、原始来源、材料/类型/月度筛选和分页历史归档。新闻存档为 `dist/news.json`，更新流程见 `NEWS_UPDATE.md`。

Cloudflare Workers 使用根目录 `wrangler.jsonc`，部署命令 `npx wrangler deploy`；静态文件位于 `dist`，无需构建。GitHub 仓库私有不代表已部署的网站私有。
