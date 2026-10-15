# 材料动态更新约定

生产站点：https://polymer-atlas.zuenyue.workers.dev/news.html
仓库：zuenyue-art/polymer-atlas，分支 main。Cloudflare 已连接该分支，提交会触发部署。

## 每次运行

1. 使用已连接的 GitHub 工具从 main 读取 dist/news.json，保留返回的文件 blob SHA。不得用旧副本覆盖。
2. 查找自 checked_at 以来的新闻，允许向前重叠7天防止漏收。首次可回看30天。重点：PPO/PPE、PBT、PTT、PET、TPAE/PEBA、TPEE、PMMA；兼顾有代表性的生物基、可降解和高性能高分子。覆盖企业新品、应用、产线、研究论文、专利公开、回收技术。排除以ABS、PC、普通PE/PP为核心的方案和无事实的宣传转载。
3. 优先企业官网、研究机构、出版商和官方专利全文。核对原文发布日期和关键事实；计划、预计、公司宣称须保留归属。不能把网页抓取时间当发布日期，不能伪造题名、URL、数据；只有摘要可读时不宣称看过全文。
4. 每条中文摘要80–150字左右，直说发生了什么及为何值得关注，不强行写专利创造性分析。每轮优选3–8条，不凑数量；没有有价值新增就不添加旧闻。
5. items中的每条记录使用 id、published_at(YYYY-MM-DD原文发布日期)、added_at(YYYY-MM-DD收录日期)、materials(字符串数组)、kind、title、summary、source_name、source_title、url(具体原文HTTP(S)地址)。kind使用产业动态/新品与应用/研究进展/专利公开/政策与标准。id稳定唯一，按规范化URL及同一事件去重，多语种和转载不重复收录。
6. 保留所有历史items。更正旧条目须保留其id和added_at并加correction_note与corrected_at。updated_at仅内容增改时更新，checked_at完整检索成功后更新；检索失败不得假报检查成功。
7. 校验JSON可解析、字段齐全、ID和URL去重、日期不在未来、摘要和链接对应。使用 github.update_file 更新同一路径，提供刚读取的SHA。冲突时重新读取合并再写，不强推、不删历史、不改其他网站文件。无新增也可只更新checked_at，标识最近检查；勿为同一检查重复提交。
8. 从main读回dist/news.json，验证新增ID、保留的旧条目数及URL；检查提交CI/Cloudflare检查状态（如可用）。自动部署未成功时明确报告，不把GitHub提交成功等同于网站已上线。不使用本地临时路径作为更新依赖，不需要Cloudflare API密钥或用户手动授权。
9. 返回简短中文状态，附材料动态链接；确实有新增时列出数量和1–2个主题，无新增时简短说明。临时检索或连接故障保留任务待后续重试，不禁用持续更新任务。
