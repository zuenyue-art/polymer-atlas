"""从 data.json / terms.json 生成 dist/materials.xlsx。

为什么：首页有「下载完整 Excel」的入口，而这份文件此前是手工维护的第二份
数据副本。它不受任何检查约束，改了 JSON 忘了改表，读者下载到的就是过期
内容，而且没人会发现。现在它由数据生成——单一事实来源，不可能不一致。

术语取 terms.json（68 条正式词条）而不是 data.json 内嵌的那份：后者只是
terms.json 加载失败时的回退数据，条数少且会过时。站点上展示的是前者，
下载到的也应该是前者。

用法：
    python scripts/build-xlsx.py
"""

import json
import os
import sys

try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter
except ModuleNotFoundError:
    sys.exit("缺少 openpyxl。请先安装：pip install -r scripts/requirements.txt")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
OUT = os.path.join(DIST, "materials.xlsx")

# 表头样式沿用此前手工维护时的外观：深色底白字加粗，首行加高，冻结前两列。
HEAD_FILL = PatternFill("solid", fgColor="FF333333")
HEAD_FONT = Font(bold=True, color="FFFFFFFF")
HEAD_HEIGHT = 36
FREEZE = "C2"

# 列宽同样沿用旧文件的取值，避免读者下载后排版突变。
MATERIAL_WIDTHS = [24, 20, 42, 27, 43, 40, 42, 40, 45, 45, 43, 52, 48, 72]
TERM_WIDTHS = [29, 76, 74]
LITERATURE_WIDTHS = [23, 66, 24, 61, 66, 65, 76, 49]

TERM_SHEET = "基础术语与使用说明"
LITERATURE_SHEET = "重点回收文献"
# 术语表只写这三列：与旧文件的列结构保持一致，"分类"用于站点上的筛选，
# 放进表格反而会让读者以为它属于词条本身。
TERM_COLUMNS = ["术语/阅读规则", "解释", "用途或易错点"]


def read_json(name):
    with open(os.path.join(DIST, name), encoding="utf-8") as f:
        return json.load(f)


def write_sheet(wb, title, columns, rows, widths, first=False):
    if first:
        ws = wb.active
        ws.title = title
    else:
        ws = wb.create_sheet(title)
    ws.append(columns)
    for row in rows:
        ws.append(row)
    for cell in ws[1]:
        cell.fill = HEAD_FILL
        cell.font = HEAD_FONT
    ws.row_dimensions[1].height = HEAD_HEIGHT
    ws.freeze_panes = FREEZE
    for i, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width
    return ws


def main():
    data = read_json("data.json")
    knowledge = read_json("terms.json")

    materials = data["materials"]
    columns = list(materials[0]["fields"].keys())

    # 分类按首次出现顺序，与站点侧栏、sitemap 的顺序一致。
    order = []
    for m in materials:
        if m["category"] not in order:
            order.append(m["category"])

    wb = Workbook()
    for i, category in enumerate(order):
        rows = [[m["fields"][c] for c in columns] for m in materials if m["category"] == category]
        write_sheet(wb, category, columns, rows, MATERIAL_WIDTHS, first=i == 0)

    terms = knowledge["terms"]
    write_sheet(
        wb,
        TERM_SHEET,
        TERM_COLUMNS,
        [[t[c] for c in TERM_COLUMNS] for t in terms],
        TERM_WIDTHS,
    )

    literature = data["literature"]
    lit_columns = list(literature[0].keys())
    write_sheet(
        wb,
        LITERATURE_SHEET,
        lit_columns,
        [[r[c] for c in lit_columns] for r in literature],
        LITERATURE_WIDTHS,
    )

    wb.save(OUT)
    print(f"已生成 {os.path.relpath(OUT, ROOT)}")
    print(f"  材料 {len(materials)} 条 / {len(order)} 个分类工作表")
    print(f"  术语 {len(terms)} 条 · 文献 {len(literature)} 条")
    return 0


if __name__ == "__main__":
    sys.exit(main())
