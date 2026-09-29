"""Convert the HTML report (docs/REPORT.html) into Markdown (docs/REPORT.md).

GitHub does not render inline SVG in Markdown, so every figure is written as
its own standalone SVG in docs/img/report/ (fig-NNN.svg, light and dark via
prefers-color-scheme, with a <title> and <desc> for screen readers) and the
Markdown links it with its caption underneath. Headings, paragraphs, lists,
tables, callout boxes (as block quotes) and research cards (as small headed
entries) are converted section by section. Figure files the report no longer
has are removed, so the folder always matches the HTML.

Usage (from the repo root):
    npm run docs:report
    python tools/report-to-md.py [--html docs/REPORT.html] [--md docs/REPORT.md]
                                 [--img docs/img/report]

Only the Python standard library is used.
"""
import argparse, glob, html, os, re
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(description='Convert the HTML report to Markdown + SVG figures.')
ap.add_argument('--html', default=os.path.join(ROOT, 'docs', 'REPORT.html'))
ap.add_argument('--md', default=os.path.join(ROOT, 'docs', 'REPORT.md'))
ap.add_argument('--img', default=os.path.join(ROOT, 'docs', 'img', 'report'))
args = ap.parse_args()
SRC, OUT_MD, IMG_DIR = args.html, args.md, args.img
# Image links are written relative to the Markdown file.
IMG_PREFIX = os.path.relpath(IMG_DIR, os.path.dirname(os.path.abspath(OUT_MD))).replace(os.sep, '/')
os.makedirs(IMG_DIR, exist_ok=True)

STYLE = """<style>
svg{--paper:#ffffff;--ink:#1b2130;--muted:#586174;--line:#d9dee7;--accent:#2f56c9;--accent-soft:#e3e9fb;--warn:#b4480f;--warn-soft:#fbeadf;--good:#18794a;--good-soft:#e0f2e8;--bar:#a9b2c3;color:var(--ink)}
@media (prefers-color-scheme: dark){svg{--paper:#191d27;--ink:#e5e8ee;--muted:#9ba4b6;--line:#2c3342;--accent:#86a4ff;--accent-soft:#1f2a4a;--warn:#f0925c;--warn-soft:#3a2418;--good:#5fcf93;--good-soft:#15301f;--bar:#4b5468}}
.bg{fill:var(--paper);stroke:var(--line)}
text{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;fill:currentColor}
.m{fill:var(--muted)}.a{fill:var(--accent)}.w{fill:var(--warn)}.g{fill:var(--good)}
.node{fill:var(--paper);stroke:currentColor;stroke-width:1.2}
.node.hl{fill:var(--accent-soft);stroke:var(--accent);stroke-width:1.6}
.node.bad{fill:var(--warn-soft);stroke:var(--warn);stroke-width:1.6}
.node.code{fill:var(--good-soft);stroke:var(--good);stroke-width:1.4}
.node.dash{stroke-dasharray:5 4}
.edge{stroke:currentColor;stroke-width:1.3;fill:none}
.edge.dash{stroke-dasharray:5 4;opacity:.7}.edge.a{stroke:var(--accent)}.edge.w{stroke:var(--warn)}
.barA{fill:var(--accent)}.barB{fill:var(--bar)}.grid{stroke:var(--line);stroke-width:1}
</style>"""
PAD = 16

src = open(SRC, encoding='utf-8').read()
body = src[src.index('</style>') + len('</style>'):]
body = re.sub(r'<!--.*?-->', '', body, flags=re.S)

# 1. lift every svg out, save it standalone, leave a placeholder
svgs = []


def lift(m):
    raw = m.group(0)
    svgs.append(raw)
    return f'<svgref n="{len(svgs) - 1}"></svgref>'


body = re.sub(r'<svg\b.*?</svg>', lift, body, flags=re.S)


def save_svg(i, caption):
    raw = svgs[i]
    inner = re.search(r'<svg\b[^>]*>(.*)</svg>', raw, re.S).group(1)
    x, y, w, h = [float(v) for v in re.search(r'viewBox="([^"]+)"', raw).group(1).split()]
    lab = html.unescape((re.search(r'aria-label="([^"]*)"', raw) or [None, ''])[1])
    W, H = w + 2 * PAD, h + 2 * PAD
    name = f'fig-{i + 1:03d}.svg'
    out = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x - PAD:g} {y - PAD:g} {W:g} {H:g}" width="{W:g}" height="{H:g}" role="img" aria-labelledby="t d">'
           f'<title id="t">{html.escape(lab)}</title><desc id="d">{html.escape(caption)}</desc>{STYLE}'
           f'<rect class="bg" x="{x - PAD + 0.5:g}" y="{y - PAD + 0.5:g}" width="{W - 1:g}" height="{H - 1:g}" rx="10"/>{inner}</svg>\n')
    open(os.path.join(IMG_DIR, name), 'w', encoding='utf-8', newline='\n').write(out)
    return name, lab


# 2. a small tree
class Node:
    def __init__(self, tag, attrs, parent=None):
        self.tag, self.attrs, self.parent, self.kids = tag, dict(attrs), parent, []

    def cls(self):
        return self.attrs.get('class', '') or ''


class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('root', [])
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.kids.append(n)
        if tag not in ('br', 'img', 'meta', 'link', 'hr'):
            self.cur = n

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.kids.append(data)


p = P()
p.feed(body)

BLOCK = {'p', 'div', 'ul', 'ol', 'table', 'figure', 'h1', 'h2', 'h3', 'h4', 'blockquote'}


def text_of(n):
    if isinstance(n, str):
        return n
    return ''.join(text_of(k) for k in n.kids)


def inline(n, in_table=False):
    if isinstance(n, str):
        t = re.sub(r'\s+', ' ', n)
        t = t.replace('*', r'\*').replace('_', r'\_')
        if in_table:
            t = t.replace('|', r'\|')
        return t
    inner = ''.join(inline(k, in_table) for k in n.kids)
    tag, c = n.tag, n.cls()
    if tag in ('b', 'strong'):
        return f'**{inner.strip()}**' if inner.strip() else inner
    if tag in ('i', 'em'):
        return f'*{inner.strip()}*' if inner.strip() else inner
    if tag == 'code':
        return f'`{text_of(n)}`'
    if tag == 'a':
        return f'[{inner}]({n.attrs.get("href", "")})'
    if tag == 'br':
        return '<br>' if in_table else '  \n'
    if tag == 'span':
        if 'us' in c or 'who' in c:
            return f'**{inner.strip()}**'
        if 'src' in c:
            return f'*{inner.strip()}*'
        if 'done' in c:
            return f' *Done when:* {inner.strip()}'
        return inner
    return inner


def clean(s):
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r' *\n *', '\n', s)
    return s.strip()


def table_md(t):
    rows = []
    for tr in [x for x in walk(t) if isinstance(x, Node) and x.tag == 'tr']:
        cells = [clean(inline(c, True)) for c in tr.kids if isinstance(c, Node) and c.tag in ('td', 'th')]
        rows.append(cells)
    if not rows:
        return ''
    width = max(len(r) for r in rows)
    rows = [r + [''] * (width - len(r)) for r in rows]
    out = ['| ' + ' | '.join(rows[0]) + ' |', '|' + '---|' * width]
    out += ['| ' + ' | '.join(r) + ' |' for r in rows[1:]]
    return '\n'.join(out)


def walk(n):
    yield n
    if isinstance(n, Node):
        for k in n.kids:
            yield from walk(k)


def figure_md(f):
    cap_node = next((k for k in f.kids if isinstance(k, Node) and k.tag == 'figcaption'), None)
    caption = clean(inline(cap_node)) if cap_node else ''
    cap_plain = clean(html.unescape(re.sub(r'<[^>]+>', '', text_of(cap_node)))) if cap_node else ''
    parts = []
    for x in walk(f):
        if isinstance(x, Node) and x.tag == 'svgref':
            name, lab = save_svg(int(x.attrs['n']), cap_plain)
            parts.append(f'![{lab.replace("]", ")")}]({IMG_PREFIX}/{name})')
        if isinstance(x, Node) and x.tag == 'table':
            parts.append(table_md(x))
    if caption:
        parts.append(f'*{caption}*' if not caption.startswith('*') else caption)
    return '\n\n'.join(parts)


def blocks(n, depth=0):
    """Render the children of n as a list of markdown blocks."""
    out, buf = [], []

    def flush():
        if buf:
            t = clean(''.join(buf))
            if t:
                out.append(t)
            buf.clear()

    for k in n.kids:
        if isinstance(k, str) or (isinstance(k, Node) and k.tag not in BLOCK and k.tag not in ('li', 'svgref')):
            buf.append(inline(k))
            continue
        flush()
        out.extend(block(k, depth))
    flush()
    return out


def block(n, depth=0):
    tag, c = n.tag, n.cls()
    if tag in ('h1', 'h2', 'h3', 'h4'):
        return ['#' * int(tag[1]) + ' ' + clean(inline(n))]
    if tag == 'p':
        t = clean(inline(n))
        if 'eyebrow' in c:
            t = f'*{t}*'
        return [t] if t else []
    if tag == 'figure':
        return [figure_md(n)]
    if tag == 'table':
        return [table_md(n)]
    if tag in ('ul', 'ol'):
        items, k = [], 0
        for li in n.kids:
            if not (isinstance(li, Node) and li.tag == 'li'):
                continue
            k += 1
            parts = blocks(li, depth + 1)
            mark = f'{k}.' if tag == 'ol' else '-'
            ind = ' ' * (len(mark) + 1)
            first = parts[0] if parts else ''
            rest = parts[1:]
            s = f'{mark} {first}'
            for r in rest:
                s += '\n\n' + '\n'.join(ind + line if line else '' for line in r.split('\n'))
            items.append(s)
        return ['\n'.join(items) if all('\n\n' not in i for i in items) else '\n\n'.join(items)]
    if tag == 'div':
        if 'tldr' in c:
            items = []
            for d in n.kids:
                if isinstance(d, Node) and d.tag == 'div':
                    b = next((x for x in d.kids if isinstance(x, Node) and x.tag == 'b'), None)
                    sp = next((x for x in d.kids if isinstance(x, Node) and x.tag == 'span'), None)
                    label = clean(text_of(b)) if b else ''
                    items.append(f'- **{label}**: {clean(inline(sp)) if sp else ""}')
            return ['\n'.join(items)]
        if 'box' in c:
            inner = '\n\n'.join(blocks(n, depth))
            return ['\n'.join('> ' + line if line else '>' for line in inner.split('\n'))]
        if c.split() == ['r']:
            head = []
            for k in list(n.kids):
                if isinstance(k, Node) and k.tag == 'span' and ('who' in k.cls() or 'src' in k.cls()):
                    head.append(k)
            who = next((clean(text_of(h)) for h in head if 'who' in h.cls()), '')
            srcs = next((clean(text_of(h)) for h in head if 'src' in h.cls()), '')
            rest = Node('div', [])
            rest.kids = [k for k in n.kids if k not in head]
            out = [f'#### {who}' + (f' ({srcs})' if srcs else '')]
            return out + blocks(rest, depth)
        if 'lesson' in c:
            return blocks(n, depth)
        return blocks(n, depth)
    if tag == 'blockquote':
        inner = '\n\n'.join(blocks(n, depth))
        return ['\n'.join('> ' + l for l in inner.split('\n'))]
    if tag == 'svgref':
        name, lab = save_svg(int(n.attrs['n']), '')
        return [f'![{lab}]({IMG_PREFIX}/{name})']
    return blocks(n, depth)


md_blocks = blocks(p.root)
md = '\n\n'.join(b for b in md_blocks if b.strip())
md = re.sub(r'\n{3,}', '\n\n', md)
header = ("<!-- Generated from docs/REPORT.html by tools/report-to-md.py (npm run docs:report);\n"
          "edit the HTML and regenerate. Figures are standalone SVGs in docs/img/report/. -->\n\n")
open(OUT_MD, 'w', encoding='utf-8', newline='\n').write(header + md + '\n')

# Figure files the report no longer has.
written = {f'fig-{i + 1:03d}.svg' for i in range(len(svgs))}
stale = [f for f in glob.glob(os.path.join(IMG_DIR, 'fig-*.svg')) if os.path.basename(f) not in written]
for f in stale:
    os.remove(f)
print(f'{os.path.relpath(OUT_MD, ROOT)}: {len(md_blocks)} blocks, {len(svgs)} figures, {len(md)} chars; removed {len(stale)} stale figure(s)')
