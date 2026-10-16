# 高分子材料图鉴

中文材料知识库，包含130条材料记录、分类搜索、收藏、材料对比、基础术语和回收文献。

## 静态部署

发布目录：`dist`。无需构建步骤。

资料核验范围见每条记录；研究构思不等同于已验证实验结果。收藏保存在访问者当前浏览器。

## 本地校验

```bash
npm run serve    # 本地预览 http://localhost:8080
npm run check    # 派生文件同步 + 数据体检，提交前跑一次
```

`npm run check` 由两步组成：

- `npm run check:derived` —— 用 `news.json` 重建索引与月度文件，若与仓库现有内容不一致即失败。专治「只改了 `news.json`，忘了同步派生文件」。
- `npm run audit` —— 校验 id / url 去重、必填字段、日期合法性、月度分档并集、索引覆盖等。数据错误时命令返回非 0。

另有两个单独入口：`npm run build:news` 只重建派生文件；`npm run audit:strict` 把工程习惯类警告也视为失败。

`.github/workflows/audit.yml` 会在数据相关文件变更时自动执行上述检查，结果写入 job summary。

## 材料动态

`dist/news.html` 提供短摘要、原始来源、材料/类型/月度筛选和分页历史归档。新闻存档为 `dist/news.json`，更新流程见 `NEWS_UPDATE.md`。

Cloudflare Workers 使用根目录 `wrangler.jsonc`，部署命令 `npx wrangler deploy`；静态文件位于 `dist`，无需构建。GitHub 仓库私有不代表已部署的网站私有。
