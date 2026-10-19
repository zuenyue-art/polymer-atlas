#!/usr/bin/env python3
"""生成 dist/theme-dark.css —— 深色模式覆盖层。

为什么要生成而不是手写
    站点的浅色配色散在 style.css / layout.css / news.css / material.css 的
    130 多种硬编码颜色里，其中 90 组会在深色背景下出问题（浅底 40 组、深字
    42 组、浅边框 8 组）。手写一遍既写不全，也会立刻和上游脱节——以后谁在
    style.css 里加一个颜色，深色模式就悄悄缺一块。

    所以这里反过来做：扫描现有 CSS，把每条含硬编码颜色的规则按「角色」
    （文字 / 底色 / 边框 / 阴影）重新映射出一份深色值，写进一个独立文件。
    原样式表一个字不动，浅色模式的既有权重完全不受影响。

为什么用独立文件而不是改原文件
    原 CSS 是手写的、prettier 格式化的、可读性优先的。把 #e1e4dc 换成
    var(--c17) 会让源码不再能一眼读懂；而独立文件可以整体重生成，错了就重来。

映射规则
    按角色分开处理，因为它们要去的方向是相反的：文字要变亮、底色要变暗。
    色相保留（绿色系还是绿色系），饱和度在深色下略微收敛——深色背景上高饱和
    会更刺眼。已经是亮色的文字（深底按钮上的白字）保持不变，只做兜底提亮。

用法：
    python scripts/build-dark-theme.py            # 重建 dist/theme-dark.css
    python scripts/build-dark-theme.py --check    # 只比对不写盘，不一致退出码 1
"""

import colorsys
import os
import re
import sys
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
SOURCES = ['style.css', 'layout.css', 'news.css', 'material.css']
OUT = os.path.join(DIST, 'theme-dark.css')

# 深色模式下的语义变量。手挑而不是机械映射：这七个是全站最大面积的色块，
# 机械映射出来的层次太平，纸面和背景分不开。
VARS = OrderedDict(
    [
        ('--bg', '#111310'),
        ('--paper', '#191d17'),
        ('--ink', '#e6eae1'),
        ('--muted', '#9fa89a'),
        ('--line', '#2b312a'),
        ('--green', '#93b87c'),
        ('--soft', '#1f251d'),
        # 渐变不走机械映射：机械映射会把两端一起压暗，两端挤到一起就没有渐变感了。
        # 深色下按钮是「亮底深字」，所以整条要往亮处抬，且深字在亮端也要过 4.5:1。
        ('--grad-accent', 'linear-gradient(135deg, #a8c894, #7d9f68)'),
        ('--grad-accent-hover', 'linear-gradient(135deg, #b6d3a2, #8aad74)'),
        ('--grad-chip', 'linear-gradient(135deg, #2f3d2c, #253222)'),
    ]
)

# 手写兜底区：机械映射处理不了、必须人来判断的几处。它们都排在生成规则之后，
# 所以能盖掉生成结果。
#
# --green 在深色下必须变亮——它身上有 35 处是文字色（链接、标签、强调），
# 亮起来才读得清。但它在 .brand-mark / .primary / .mp-cta 里扮演的是**按钮
# 底色**，配的是白字：亮绿底 + 白字只有 1.9:1，等于看不见。
# 二选一：把按钮压成暗绿（离原设计远了），或者把字压暗（保留那块绿的识别度）。
# 选后者——深色模式里「亮绿按钮 + 深色字」是很常见的主按钮形态。
# 注意 .brand-mark 不在这个名单里：它在 layout.css 里另有一条硬编码规则把底色
# 定成深绿（#46684f），深色下映射后仍是深绿，配白字 8.9:1——本来就是好的。
# 一开始把它一起压成深字，反而做成 2:1。机械映射把底色算对了的，别去动它。
MANUAL = OrderedDict([('.primary, .mp-cta', ['color: #14170f;'])])

# body / html 的底色由 --bg 统一管着，不从硬编码里再生成一份：两处各算一次
# 很容易算出两个略有不同的值，页面边缘会出现一道谁都看不出原因的接缝。
SKIP_SELECTORS = {'body', 'html'}

HEADER = """/*
 * 深色模式覆盖层 —— 生成物，不要手改。
 *
 * 由 scripts/build-dark-theme.py 从 style.css / layout.css / news.css /
 * material.css 扫描生成：每条含硬编码颜色的规则按角色（文字/底色/边框/阴影）
 * 重新映射一份深色值。改配色请改上游样式表，然后：
 *
 *     python scripts/build-dark-theme.py
 *
 * 生效条件是 <html data-theme="dark">，由 theme-init.js 在首屏前写入：
 * 默认按系统偏好，点过外观开关后按用户的选择。这里不用
 * @media (prefers-color-scheme: dark) —— 那样用户想手动切回浅色就切不动了。
 *
 * 校验（CI 用，产物与上游不一致就失败）：
 *
 *     python scripts/build-dark-theme.py --check
 */
"""

PREFIX = "html[data-theme='dark']"


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def to_hsl(hex_str):
    h = hex_str.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    return colorsys.rgb_to_hls(r, g, b)  # 返回 (h, l, s)


def to_hex(h, l, s):
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))


def role_of(prop):
    """判定这个属性里的颜色扮演什么角色——决定了深色下要往哪个方向走。"""
    p = prop.strip()
    if 'background' in p:
        return 'bg'
    if p == 'fill':
        return 'bg'
    if p == 'stroke':
        # 描边是图标轮廓，要的是「看得见」，跟文字同路，不是当底色压暗
        return 'text'
    if 'shadow' in p:
        return 'shadow'
    if 'border' in p or 'outline' in p:
        return 'border'
    return 'text'


def remap(hex_str, role):
    """把一个浅色主题下的颜色映射成深色主题下的对应色。"""
    h, l, s = to_hsl(hex_str)
    if role == 'text':
        # 已经是亮色的（深底按钮上的白字、图标描边）保持亮，只做小幅收敛；
        # 深色的文字才是真正要提亮的对象。
        if l >= 0.85:
            l2, s2 = 0.92, s * 0.4
        elif l >= 0.5:
            l2, s2 = clamp(l + 0.12, 0.62, 0.88), s * 0.7
        else:
            l2, s2 = clamp(0.62 + (1 - l) * 0.34, 0.62, 0.92), s * 0.85
    elif role == 'bg':
        if l >= 0.65:
            # 浅底 → 压暗，越浅压得越低（白 → 近黑，soft 灰绿 → 稍高）
            l2, s2 = clamp(0.09 + (1 - l) * 0.60, 0.09, 0.30), s * 0.80
        elif l >= 0.40:
            l2, s2 = clamp(l * 0.62, 0.18, 0.38), s * 0.85
        else:
            # 本来就深的元素（深色页头之类）在深色模式里反而要抬一点，
            # 否则会和背景糊在一起
            l2, s2 = clamp(0.14 + l * 0.35, 0.14, 0.30), s * 0.9
    elif role == 'border':
        if l >= 0.60:
            l2, s2 = clamp(0.22 + (1 - l) * 0.20, 0.20, 0.38), s * 0.75
        else:
            l2, s2 = clamp(l * 0.80 + 0.10, 0.18, 0.45), s * 0.8
    else:  # shadow
        l2, s2 = clamp(0.10 + (1 - l) * 0.50, 0.08, 0.30), s * 0.8
    return to_hex(h, l2, s2)


# 颜色不只是十六进制：news.css 里就有 `background: white`。关键字必须一起认，
# 否则那些元素会带着纯白底色出现在深色模式里——而白底恰恰是最扎眼的一种漏网。
# transparent / inherit / currentColor 有意不收：它们不是「一个颜色」，改了就错。
KEYWORD = {'white': '#ffffff', 'black': '#000000'}
COLOR = re.compile(r'#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|\bwhite\b|\bblack\b')

# var(--green) 里也含 "green"，会被关键字匹配误伤，先把 var() 抠掉
VAR = re.compile(r'var\([^)]*\)')


def strip_vars(value):
    return VAR.sub(lambda m: ' ' * len(m.group(0)), value)


def norm(c):
    return KEYWORD.get(c.lower(), c)


def has_color(value):
    return bool(COLOR.search(strip_vars(value)))


def dark_decls(block):
    """从一条规则里挑出含硬编码颜色的声明，生成它们的深色版本。

    按属性名去重：同一个选择器常常在 style.css 和 layout.css 里各写一遍，
    后加载的那份说了算——级联本来就是这样，生成物必须和它一致，不能把两条
    并排列出去（CSS 里后者赢，但读起来像 bug）。
    """
    out = OrderedDict()
    for m in re.finditer(r'([-a-zA-Z]+)\s*:\s*([^;{}]+);', block):
        prop, value = m.group(1), m.group(2)
        if prop.startswith('--'):
            continue
        if not has_color(value):
            continue
        role = role_of(prop)
        # 落在 var(...) 里的匹配跳过：那里的颜色由变量自己负责
        spans = [m.span() for m in VAR.finditer(value)]

        def sub(m):
            if any(a <= m.start() < b for a, b in spans):
                return m.group(0)
            return remap(norm(m.group(0)), role)

        new_value = COLOR.sub(sub, value)
        if new_value.strip() != value.strip():
            out[prop] = '%s: %s;' % (prop, new_value)
    return list(out.values())


def scan(css, stack=()):
    """扫描 CSS，产出 (at-rule 栈, 选择器, 声明块) 三元组。"""
    rules = []
    i, n = 0, len(css)
    while i < n:
        m = re.compile(r'[^{}]*\{|\}').match(css, i)
        if not m:
            break
        if m.group(0) == '}':
            return rules, m.end()
        prelude = m.group(0)[:-1].strip()
        j, depth = m.end(), 1
        start = j
        while j < n and depth:
            if css[j] == '{':
                depth += 1
            elif css[j] == '}':
                depth -= 1
            j += 1
        block = css[start : j - 1]
        i = j
        if prelude.startswith('@'):
            inner, _ = scan(block, stack + (prelude,))
            rules.extend(inner)
        else:
            rules.append((stack, prelude, block))
    return rules, i


def collect():
    """收集所有需要覆盖的规则，按 at-rule 栈分组保持嵌套结构。"""
    groups = OrderedDict()
    for name in SOURCES:
        path = os.path.join(DIST, name)
        if not os.path.exists(path):
            continue
        css = re.sub(r'/\*.*?\*/', '', open(path, encoding='utf-8').read(), flags=re.S)
        _, _ = scan(css)
        for stack, selector, block in scan(css)[0]:
            decls = dark_decls(block)
            if not decls or selector.strip() in SKIP_SELECTORS:
                continue
            groups.setdefault(stack, OrderedDict())
            bucket = groups[stack].setdefault(selector.strip(), OrderedDict())
            for d in decls:
                bucket[d.split(':', 1)[0]] = d
    return groups


def render(groups):
    lines = [HEADER, '', ":root[data-theme='dark'] {", '  color-scheme: dark;']
    for name, value in VARS.items():
        lines.append('  %s: %s;' % (name, value))
    lines.append('}')
    lines.append('')

    for stack, selectors in groups.items():
        indent = ''
        opened = []
        for at in stack:
            lines.append('%s%s {' % (indent, at))
            opened.append(indent)
            indent += '  '
        for selector, decls in selectors.items():
            # 前缀加在每一个逗号分隔的选择器上：只加在整条最前面的话，
            # "A, B" 里的 B 会变成不受作用域限制的全局规则。
            parts = [p.strip() for p in selector.split(',') if p.strip()]
            sel = (',\n' + indent).join(indent + PREFIX + ' ' + p for p in parts)
            lines.append('%s {' % sel)
            for d in decls.values():
                lines.append('%s  %s' % (indent, d))
            lines.append('%s}' % indent)
        for ind in reversed(opened):
            lines.append('%s}' % ind)
        lines.append('')

    lines.append('/* ---- 手写兜底：见 scripts/build-dark-theme.py 的 MANUAL ---- */')
    for selector, decls in MANUAL.items():
        parts = [p.strip() for p in selector.split(',') if p.strip()]
        lines.append('%s {' % (',\n'.join(PREFIX + ' ' + p for p in parts)))
        for d in decls:
            lines.append('  %s' % d)
        lines.append('}')
    lines.append('')

    while lines and lines[-1] == '':
        lines.pop()
    return '\n'.join(lines) + '\n'


def main():
    check_only = '--check' in sys.argv
    content = render(collect())
    if check_only:
        if not os.path.exists(OUT):
            sys.exit('缺少 dist/theme-dark.css，先跑 python scripts/build-dark-theme.py')
        if open(OUT, encoding='utf-8').read() != content:
            sys.exit(
                'dist/theme-dark.css 与现行样式表不同步（上游改了配色却没有重生成）。\n'
                '修复：python scripts/build-dark-theme.py'
            )
        print('深色主题与样式表同步。')
        return 0
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(content)
    rules = sum(len(s) for s in collect().values())
    print('已生成 dist/theme-dark.css（%d 条深色覆盖规则 / %.1f KB）。' % (rules, len(content) / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
