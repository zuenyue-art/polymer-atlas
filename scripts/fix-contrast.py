#!/usr/bin/env python3
"""把浅色模式下不达标的次要文字色，按原层次等比压暗。

问题：站点里 40 多个手写的灰绿被当作次级文字色，其中大部分对浅色卡片底
只有 1.6–4.4:1，低于 WCAG AA 的 4.5:1。它们不是"设计选择"，是随手取的
一个个 #878e82 / #9aa290 / #959c8d。

做法不是统一压成同一个颜色——那样 40 个层级会塌成一层，卡片会失去呼吸感。
这里把原始对比度区间 [2.0, 4.5] 线性映射到 [4.6, 6.4]：
原本更浅的压得更多，原本更深的压得更少，单调关系和相对间距都保留下来。

纯符号/装饰（分隔点、箭头、面包屑 gt）按 WCAG 1.4.11 只需 3:1，单独给 3.2，
免得把 200 个箭头都染成深墨绿。分子式水印整块是 aria-hidden 装饰，不参与。
"""
import colorsys
import re
import sys

FILES = ['style.css', 'layout.css', 'news.css', 'material.css']
CHIP = '#e2e9dc'  # 页面里最暗的文字底（浅绿标签底），按它算才保险
DECOR_TARGET = 3.2
LO, HI = 2.0, 4.5
NEW_LO, NEW_HI = 4.6, 6.4


def rgb(h):
    h = h.lstrip('#')
    h = ''.join(c * 2 for c in h) if len(h) == 3 else h
    return [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]


def lum(h):
    r, g, b = rgb(h)
    f = lambda v: v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def cr(a, b):
    l1, l2 = lum(a), lum(b)
    return (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)


def with_light(c, target_l):
    """保持 HSL 的色相/饱和度，返回指定亮度的十六进制。"""
    r, g, b = rgb(c)
    h, _, s = colorsys.rgb_to_hls(r, g, b)
    rr, gg, bb = colorsys.hls_to_rgb(h, target_l, s)
    return '#%02x%02x%02x' % (round(rr * 255), round(gg * 255), round(bb * 255))


def deepen(c, target):
    """二分亮度，找到"刚好达到 target 对比度"的那个最亮值。"""
    if cr(c, CHIP) >= target:
        return c
    r, g, b = rgb(c)
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    lo, hi = 0.0, l
    for _ in range(40):
        mid = (lo + hi) / 2
        if cr(with_light(c, mid), CHIP) >= target:
            lo = mid
        else:
            hi = mid
    return with_light(c, lo)


def target_for(selector, old):
    if '.molecule' in selector:
        return None  # aria-hidden 装饰水印，保持原样
    if any(k in selector for k in ('.sep', '.arrow', '[aria-hidden]')):
        return DECOR_TARGET
    cur = cr(old, CHIP)
    if cur >= HI:
        return None
    t = min(1.0, max(0.0, (HI - cur) / (HI - LO)))
    return NEW_HI - t * (NEW_HI - NEW_LO)


def main():
    dry = '--dry-run' in sys.argv
    for name in FILES:
        path = 'dist/' + name
        css = open(path, encoding='utf-8').read()
        out, pos, changed = [], 0, 0
        for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', css):
            prelude, body = m.group(1), m.group(2)
            if prelude.startswith('@') and ':' in prelude:
                continue

            def repl(d):
                nonlocal changed
                old = d.group(1).lower()
                tgt = target_for(' '.join(prelude.split()), old)
                if tgt is None:
                    return d.group(0)
                new = deepen(old, tgt)
                if new != old:
                    changed += 1
                    if dry:
                        print('  %-34s %s -> %s  %.2f -> %.2f'
                              % (prelude.strip()[-34:], old, new, cr(old, CHIP), cr(new, CHIP)))
                return d.group(0).replace(d.group(1), new)

            body2 = re.sub(r'(?<![-a-zA-Z])color\s*:\s*(#[0-9a-fA-F]{6})\b', repl, body)
            if body2 != body:
                out.append(css[pos : m.start(2)])
                out.append(body2)
                pos = m.end(2)
        out.append(css[pos:])
        if not dry:
            open(path, 'w', encoding='utf-8', newline='\n').write(''.join(out))
        print('%s：%d 处色值已更新' % (name, changed))


if __name__ == '__main__':
    main()
