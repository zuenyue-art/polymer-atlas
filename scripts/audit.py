#!/usr/bin/env python3
"""高分子材料图鉴 —— 数据一致性体检

用法：
    python scripts/audit.py .                    # 人类可读报告
    python scripts/audit.py . --markdown         # Markdown（写入 GitHub Step Summary）
    python scripts/audit.py . --json out.json    # 机器可读结果
    python scripts/audit.py . --strict           # 警告也视为失败

级别约定：
    error  数据完整性问题 —— 会让网站显示异常，必须修
    warn   工程习惯问题 —— 不影响运行，建议处理

退出码：有 error 返回 1；加 --strict 时出现 warn 也返回 1。
"""
import collections
import json
import os
import re
import sys
from datetime import date, datetime

TODAY = date.today()

# 已迁移到 terms.json guide 的说明性条目，仅作为旧数据识别用
LEGACY_GUIDE_TITLES = {
    "本次整理范围", "资料口径", "文献与专利的范围",
    "表中研发切入点", "关联非高分子材料",
}


class Audit:
    def __init__(self):
        self.items = []
        self.stats = {}

    def err(self, area, msg):
        self.items.append({"level": "error", "area": area, "message": msg})

    def warn(self, area, msg):
        self.items.append({"level": "warn", "area": area, "message": msg})

    def check(self, cond, area, msg):
        """数据完整性断言，失败即 error。"""
        if not cond:
            self.err(area, msg)
        return bool(cond)

    def soft(self, cond, area, msg):
        """工程习惯断言，失败仅 warn。"""
        if not cond:
            self.warn(area, msg)
        return bool(cond)

    @property
    def errors(self):
        return [i for i in self.items if i["level"] == "error"]

    @property
    def warnings(self):
        return [i for i in self.items if i["level"] == "warn"]


def load(dist, name):
    with open(os.path.join(dist, name), encoding="utf-8") as f:
        return json.load(f)


def walk_files(root):
    out = []
    for r, dirs, fs in os.walk(root):
        dirs[:] = [d for d in dirs if d != ".git"]
        for f in fs:
            p = os.path.join(r, f)
            out.append((os.path.relpath(p, root).replace("\\", "/"), os.path.getsize(p)))
    return out


def audit(root):
    dist = os.path.join(root, "dist")
    a = Audit()
    if not os.path.isdir(dist):
        a.err("布局", f"找不到 dist 目录：{dist}")
        return a

    # ---------- data.json ----------
    data = load(dist, "data.json")
    a.stats["data.json"] = {k: (len(v) if isinstance(v, list) else v) for k, v in data.items()}
    materials = data.get("materials", [])
    a.check(isinstance(materials, list) and materials, "data.json", "materials 为空或非数组")

    dups = [k for k, v in collections.Counter(m.get("id") for m in materials).items() if v > 1]
    a.check(not dups, "data.json", f"materials 存在重复 id：{dups}")
    a.check(all(m.get("category") for m in materials), "data.json", "存在缺少 category 的材料")

    empty_cells, field_keys = [], collections.Counter()
    for m in materials:
        fields = m.get("fields") or {}
        field_keys.update(fields.keys())
        for k, v in fields.items():
            if v is None or str(v).strip() == "":
                empty_cells.append(f"{m.get('id')}.{k}")
    a.check(not empty_cells, "data.json", f"存在空字段 {len(empty_cells)} 处：{empty_cells[:5]}")

    span = collections.Counter(len(m.get("fields") or {}) for m in materials)
    a.check(len(span) == 1, "data.json", f"materials 字段数量不一致：{dict(span)}")

    a.stats["materials_by_category"] = dict(collections.Counter(m.get("category") for m in materials))
    a.stats["material_field_count"] = span.most_common(1)[0][0] if span else 0
    a.stats["materials_with_source_url"] = sum(
        1 for m in materials if "http" in str((m.get("fields") or {}).get("参考来源与核验范围", ""))
    )

    # ---------- terms.json ----------
    terms = load(dist, "terms.json")
    a.check({"categories", "terms"}.issubset(terms.keys()), "terms.json", "缺少 categories / terms")
    a.check(isinstance(terms.get("terms"), list) and terms["terms"], "terms.json", "terms 为空")
    a.stats["terms.json"] = {k: (len(v) if isinstance(v, list) else v) for k, v in terms.items()}

    inner = {t.get("术语/阅读规则") for t in (data.get("terms") or [])}
    outer = {t.get("术语/阅读规则") for t in (terms.get("terms") or [])}
    leftover = sorted(inner - outer)
    a.stats["terms_overlap"] = {"in_data_json": len(inner), "in_terms_json": len(outer),
                                "shared": len(inner & outer), "data_only": leftover}
    if leftover:
        a.warn("data.json",
               f"data.json 内嵌 terms 有 {len(leftover)} 条已不在 terms.json 中（旧版残留）：{leftover}")
    a.soft(set(leftover).issubset(LEGACY_GUIDE_TITLES) or not leftover, "data.json",
           "data.json 内嵌 terms 的残留条目超出预期范围，请确认是否为有意保留")

    # ---------- news ----------
    news = load(dist, "news.json")
    items = news.get("items", []) if isinstance(news, dict) else news
    a.stats["news.json"] = ({k: (len(v) if isinstance(v, list) else v) for k, v in news.items()}
                            if isinstance(news, dict) else {"items": len(items)})
    idx = load(dist, "news-index.json")
    a.stats["news-index.json"] = {k: (len(v) if isinstance(v, list) else v) for k, v in idx.items()}

    nids = [i.get("id") for i in items]
    dup = [k for k, v in collections.Counter(nids).items() if v > 1]
    a.check(not dup, "news", f"news.json 重复 id：{dup}")
    dupe = [k for k, v in collections.Counter(i.get("url") for i in items).items() if v > 1]
    a.check(not dupe, "news", f"news.json 重复 url：{dupe}")

    required = ["id", "published_at", "added_at", "materials", "kind", "title", "summary", "source_name", "url"]
    missing = [i.get("id") for i in items if any(not i.get(r) for r in required)]
    a.check(not missing, "news", f"news 条目缺字段：{missing[:5]}")

    bad_dates = []
    for i in items:
        for k in ("published_at", "added_at"):
            v = str(i.get(k, ""))
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
                bad_dates.append(f"{i.get('id')}.{k}={v}")
            elif datetime.strptime(v, "%Y-%m-%d").date() > TODAY:
                bad_dates.append(f"{i.get('id')}.{k}={v}(未来)")
    a.check(not bad_dates, "news", f"日期异常：{bad_dates[:5]}")

    off_len = [f"{i.get('id')}({len(i.get('summary', ''))})" for i in items
               if not 80 <= len(i.get("summary", "")) <= 150]
    if off_len:
        a.warn("news", f"摘要不在 80-150 字约定区间 {len(off_len)} 条：{off_len[:5]}")

    months = idx.get("months", [])
    total = idx.get("total")
    a.check(total == len(items), "news", f"index.total({total}) != news.json 条目数({len(items)})")
    a.check(sum(m["count"] for m in months) == total, "news",
            f"月度 count 合计 {sum(m['count'] for m in months)} != total {total}")

    monthly_ids = []
    for m in months:
        path = m["url"]
        if not a.check(os.path.exists(os.path.join(dist, path)), "news", f"月份文件缺失：{path}"):
            continue
        mm = load(dist, path)
        mitems = mm.get("items", []) if isinstance(mm, dict) else mm
        a.check(len(mitems) == m["count"], "news",
                f"{path} 条目数 {len(mitems)} != index.count {m['count']}")
        for it in mitems:
            monthly_ids.append(it.get("id"))
            if not str(it.get("published_at", "")).startswith(m["month"]):
                a.warn("news", f"{path} 中 {it.get('id')} 的 published_at="
                               f"{it.get('published_at')} 不属于 {m['month']}")
    a.check(collections.Counter(monthly_ids) == collections.Counter(nids), "news",
            "月度分档条目集合 != news.json 条目集合（并集或重复不一致）")

    tags = sorted({t for i in items for t in (i.get("materials") or [])})
    a.check(set(tags).issubset(set(idx.get("materials", []))), "news",
            f"index.materials 未覆盖：{sorted(set(tags) - set(idx.get('materials', [])))}")
    kinds = sorted({i.get("kind") for i in items})
    a.check(set(kinds).issubset(set(idx.get("kinds", []))), "news",
            f"index.kinds 未覆盖：{sorted(set(kinds) - set(idx.get('kinds', [])))}")

    abbrs = set()
    for m in materials:
        for k in ("英文缩写", "重复单元/结构"):
            for tok in re.findall(r"[A-Za-z][A-Za-z0-9\-/]{1,9}", str((m.get("fields") or {}).get(k, ""))):
                abbrs.add(tok.upper())
    a.stats["news_tags"] = {"total": len(tags),
                            "in_atlas": [t for t in tags if t.upper() in abbrs],
                            "unmatched": [t for t in tags if t.upper() not in abbrs]}

    # ---------- dist 体积 / 外部依赖 ----------
    files = sorted(walk_files(dist), key=lambda x: -x[1])
    a.stats["dist"] = {"file_count": len(files), "total_bytes": sum(s for _, s in files),
                       "largest": files[:8],
                       "by_ext": dict(collections.Counter(os.path.splitext(n)[1] or "(none)" for n, _ in files))}
    for name in ("index.html", "news.html"):
        p = os.path.join(dist, name)
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                html = f.read()
            refs = sorted(set(re.findall(r'(?:src|href)="(https?://[^"]+)"', html)))
            a.stats[f"{name}_external_refs"] = refs
            if refs:
                a.warn(name, f"出现外部资源引用，站点将不再可离线打开：{refs}")

    # ---------- 仓库级工程习惯 ----------
    rf = [n for n, _ in walk_files(root)]
    has = {
        "LICENSE": any(n in ("LICENSE", "LICENSE.md", "LICENSE.txt") for n in rf),
        "package.json": "package.json" in rf,
        "ci": any(n.startswith(".github/workflows/") for n in rf),
        "wrangler": "wrangler.jsonc" in rf or "wrangler.toml" in rf,
        "xlsx_in_dist": "dist/materials.xlsx" in rf,
    }
    a.stats["repo"] = has
    a.soft(has["LICENSE"], "工程习惯",
           "无 LICENSE 文件——公开仓库默认保留全部权利，别人看到也没有使用授权")
    a.soft(has["package.json"], "工程习惯", "无 package.json——缺少脚本入口与 Node 版本约定")
    a.soft(has["ci"], "工程习惯", "无 .github/workflows/ ——数据一致性没有自动兜底")
    a.soft(has["wrangler"], "工程习惯", "无 wrangler 配置——请确认部署方式")
    if has["xlsx_in_dist"]:
        a.warn("工程习惯",
               "dist/materials.xlsx 随站点公开可下载；它是不受校验的第二份数据副本，更新时容易与 JSON 不一致")
    return a


def render_text(root, a):
    lines = ["=" * 64, "高分子材料图鉴 · 数据体检", f"目标：{root}", f"日期：{TODAY.isoformat()}", "=" * 64, ""]
    d = a.stats.get("dist", {})
    lines += [
        "数据规模",
        f"  材料记录      {len(a.stats.get('materials_by_category', {})) and sum(a.stats['materials_by_category'].values())}"
        f" 条 / {len(a.stats.get('materials_by_category', {}))} 个分类 / 每条 {a.stats.get('material_field_count')} 字段",
        f"  术语          {a.stats.get('terms.json', {}).get('terms')} 条"
        f" / {a.stats.get('terms.json', {}).get('categories')} 个分类",
        f"  材料动态      {a.stats.get('news-index.json', {}).get('total')} 条"
        f" / {a.stats.get('news-index.json', {}).get('months')} 个月份归档",
        f"  发布体积      {d.get('file_count')} 个文件 / {d.get('total_bytes', 0) / 1024:.1f} KB",
        "",
    ]
    lines.append(f"结果：{len(a.errors)} error / {len(a.warnings)} warn")
    for i in a.items:
        lines.append(f"  [{i['level']}] {i['area']}：{i['message']}")
    if not a.items:
        lines.append("  （无）")
    return "\n".join(lines)


def render_markdown(root, a):
    d = a.stats.get("dist", {})
    tags = a.stats.get("news_tags", {})
    out = ["## 数据体检", ""]
    if not a.items:
        out.append("✅ 全部检查通过。")
    elif a.errors:
        out.append(f"❌ **{len(a.errors)} 项数据错误**，必须修复。")
    else:
        out.append(f"✅ 数据完整性无错误（{len(a.warnings)} 项建议）。")
    out += ["", "| 项目 | 数值 |", "| --- | --- |",
            f"| 材料记录 | {sum(a.stats.get('materials_by_category', {}).values())} 条 / "
            f"{len(a.stats.get('materials_by_category', {}))} 分类 / 每条 {a.stats.get('material_field_count')} 字段 |",
            f"| 术语 | {a.stats.get('terms.json', {}).get('terms')} 条 |",
            f"| 材料动态 | {a.stats.get('news-index.json', {}).get('total')} 条 / "
            f"{a.stats.get('news-index.json', {}).get('months')} 个月份归档 |",
            f"| 动态标签在图鉴中可解析 | {len(tags.get('in_atlas', []))} / {tags.get('total')} |",
            f"| 发布体积 | {d.get('total_bytes', 0) / 1024:.1f} KB / {d.get('file_count')} 个文件 |",
            ""]
    if a.items:
        out += ["<details><summary>检查明细</summary>", ""]
        for i in a.items:
            icon = "❌" if i["level"] == "error" else "⚠️"
            out.append(f"- {icon} **{i['area']}**：{i['message']}")
        out += ["", "</details>", ""]
    return "\n".join(out)


def main(argv):
    args = [x for x in argv[1:] if not x.startswith("--")]
    root = os.path.abspath(args[0]) if args else os.getcwd()
    strict = "--strict" in argv
    a = audit(root)

    if "--json" in argv:
        out = argv[argv.index("--json") + 1]
        with open(out, "w", encoding="utf-8") as f:
            json.dump({"root": root, "date": TODAY.isoformat(), "stats": a.stats,
                       "issues": a.items}, f, ensure_ascii=False, indent=2, default=str)
        print(f"已写出：{out}")

    if "--markdown" in argv:
        print(render_markdown(root, a))
    elif "--json" not in argv:
        print(render_text(root, a))

    if a.errors:
        return 1
    if strict and a.warnings:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
