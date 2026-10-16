#!/usr/bin/env python3
"""生成社交分享卡片图 dist/og.png（1200x630）。

需要 Pillow：
    pip install Pillow
    python scripts/build-og-image.py

只在需要改卡片文案或配色时才跑；产出的 PNG 随仓库提交，不参与 CI。
中文字体优先用系统的微软雅黑，找不到就退回黑体/等线，再找不到则报错——
没有中文字形时宁可不生成，也不要产出一张全是方框的图。
"""

from __future__ import annotations

import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1200, 630
BG = (70, 104, 79)  # 站点 theme-color #46684f
INK = (245, 248, 243)
MUTED = (188, 206, 190)
ACCENT = (168, 196, 150)
CHAIN = (92, 126, 98)

TITLE = '高分子材料图鉴'
SUBTITLE = '130 条材料记录 · 结构 / 加工 / 改性 / 回收'
FOOTER = '材料动态 · 基础术语 · 回收文献'

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'dist' / 'og.png'

FONT_CANDIDATES = [
    ('C:/Windows/Fonts/msyhbd.ttc', 'C:/Windows/Fonts/msyh.ttc'),
    ('C:/Windows/Fonts/simhei.ttf', 'C:/Windows/Fonts/simhei.ttf'),
    ('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'),
]


def load_fonts() -> tuple[pathlib.Path, pathlib.Path]:
    for bold, regular in FONT_CANDIDATES:
        if pathlib.Path(bold).exists() and pathlib.Path(regular).exists():
            return pathlib.Path(bold), pathlib.Path(regular)
    print('找不到可用的中文字体，先安装微软雅黑 / 思源黑体再运行。', file=sys.stderr)
    raise SystemExit(1)


def drawn_chain(draw: ImageDraw.ImageDraw, font_bold: pathlib.Path) -> None:
    """右下角画一条示意性的聚合物主链：圆点用短线相连。"""
    y = 500
    xs = list(range(760, 1161, 56))
    for i in range(len(xs) - 1):
        draw.line((xs[i] + 13, y, xs[i + 1] - 13, y), fill=CHAIN, width=6)
    for x in xs:
        draw.ellipse((x - 13, y - 13, x + 13, y + 13), fill=ACCENT, outline=BG, width=3)
    draw.text((760, y + 42), 'n', fill=CHAIN, font=ImageFont.truetype(str(font_bold), 26))


def main() -> int:
    bold_path, regular_path = load_fonts()
    title_font = ImageFont.truetype(str(bold_path), 84)
    sub_font = ImageFont.truetype(str(regular_path), 34)
    foot_font = ImageFont.truetype(str(regular_path), 27)

    image = Image.new('RGB', (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)

    # 左侧一条竖向装饰，呼应站点里的强调色
    draw.rectangle((80, 150, 88, 320), fill=ACCENT)

    draw.text((124, 158), TITLE, fill=INK, font=title_font)
    draw.text((126, 286), SUBTITLE, fill=MUTED, font=sub_font)
    draw.text((124, 530), FOOTER, fill=MUTED, font=foot_font)

    drawn_chain(draw, bold_path)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT, 'PNG', optimize=True)
    print(f'已生成 {OUT.relative_to(ROOT)}（{WIDTH}x{HEIGHT}，{OUT.stat().st_size / 1024:.1f} KB）')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
