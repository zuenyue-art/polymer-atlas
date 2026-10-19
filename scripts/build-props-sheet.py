#!/usr/bin/env python3
"""生成 props-待填.xlsx —— 给作者填材料数值用的表格。

为什么要有这一步
    14 个字段全是自由文本，做不了「耐温 > 150℃ 且可机械回收」这类筛选。而数值
    几乎不在正文里：实测 130 条材料只有 14 条提到温度（Tm 5 条、Tg 4 条、密度
    1 条），抽取这条路救不了场——作者脑子里的数得由作者填进来。

    但让人对着 130 行的 JSON 填是不现实的。所以生成一份 Excel：一行一条材料，
    数值列并排，改完跑 scripts/apply-props.py 就能合回 data.json。

字段清单（data.json 的 propsSpec）
    改字段请改 propsSpec，不要改这个脚本——列名、单位、填写提示都从那里读。

用法：
    python scripts/build-props-sheet.py            # 生成 props-待填.xlsx
    python scripts/build-props-sheet.py 我的表.xlsx

产物不入库（见 .gitignore）：它是给你填的草稿，不是站点内容。
"""

import json
import os
import sys

try:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
except ImportError:
    sys.exit("缺少 openpyxl。请先安装：pip install -r scripts/requirements.txt")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'dist', 'data.json')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'props-待填.xlsx')

HEAD_FILL = PatternFill('solid', fgColor='FF333333')
HEAD_FONT = Font(color='FFFFFFFF', bold=True, size=11)
NOTE_FONT = Font(color='FF666666', size=10)


def main():
    data = json.load(open(DATA, encoding='utf-8'))
    materials = data['materials']
    spec = data.get('propsSpec') or []
    if not spec:
        sys.exit('data.json 里没有 propsSpec，先补上再生成表格')

    wb = Workbook()

    # ---------- 说明页 ----------
    ws = wb.active
    ws.title = '填写说明'
    notes = [
        ['材料数值填报表', ''],
        ['', ''],
        ['怎么用', '在本表「材料数值」页填数 → 保存 → 跑 python scripts/apply-props.py 合回 data.json'],
        ['只填有把握的', '拿不准就留空。宁可少，不要猜——这份数据是要被别人当依据用的'],
        ['留空 = 不改动', '已经填过的值不会因为这次留空被清掉；要改就直接写新值'],
        ['单位', '填数字即可，单位已固定在列标题里，不要写 ℃、g/cm³ 这类字样'],
        ['区间字段', '「加工温度」有两列（下/上）。单一温度就两列写同一个数'],
        ['填了多少', f"当前 {sum(1 for m in materials if m.get('props'))} / {len(materials)} 条材料已有数值"],
        ['', ''],
        ['字段', '填写提示'],
    ]
    for s in spec:
        notes.append([f"{s['label']}（{s['unit']}）", s.get('hint', '')])
    for row in notes:
        ws.append(row)
    ws['A1'].font = Font(bold=True, size=14)
    ws.column_dimensions['A'].width = 26
    ws.column_dimensions['B'].width = 78
    for r in range(11, 11 + len(spec)):
        ws.cell(row=r, column=1).font = Font(bold=True, size=10)
        ws.cell(row=r, column=2).font = NOTE_FONT
    for r in (3, 4, 5, 6, 7, 8):
        ws.cell(row=r, column=2).font = NOTE_FONT

    # ---------- 数值页 ----------
    ws = wb.create_sheet('材料数值')
    headers = ['id', '分类', '材料名称', '英文缩写']
    for s in spec:
        if s['type'] == 'range':
            headers += [f"{s['label']}·下（{s['unit']}）", f"{s['label']}·上（{s['unit']}）"]
        else:
            headers.append(f"{s['label']}（{s['unit']}）")
    ws.append(headers)
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=c)
        cell.fill, cell.font, cell.alignment = HEAD_FILL, HEAD_FONT, Alignment(horizontal='center')
    ws.row_dimensions[1].height = 36

    for m in materials:
        f = m['fields']
        props = m.get('props') or {}
        row = [m['id'], m['category'], f['材料名称'], f['英文缩写']]
        for s in spec:
            v = props.get(s['key'])
            if s['type'] == 'range':
                row += [v[0] if isinstance(v, list) and len(v) == 2 else None,
                        v[1] if isinstance(v, list) and len(v) == 2 else None]
            else:
                row.append(v if isinstance(v, (int, float)) else None)
        ws.append(row)

    widths = [10, 14, 22, 20] + [15] * (len(headers) - 4)
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = 'E2'

    wb.save(OUT)
    filled = sum(1 for m in materials if m.get('props'))
    print(f'已生成 {OUT}')
    print(f'  {len(materials)} 条材料 / {len(spec)} 个数值字段（当前已填 {filled} 条）')


if __name__ == '__main__':
    main()
