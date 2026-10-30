"""Tiny generator for .drawio.svg files: an SVG rendering plus the embedded draw.io model.

Both are produced from the same shapes, so the file renders on GitHub and opens in draw.io.
Edges are straight segments between optional waypoints, as draw.io draws them without an
edge style, so the two renderings agree.
"""

import html
import math
import xml.etree.ElementTree as ET

PAL = {
    'blue': ('#dae8fc', '#6c8ebf'),
    'green': ('#d5e8d4', '#82b366'),
    'yellow': ('#fff2cc', '#d6b656'),
    'orange': ('#ffe6cc', '#d79b00'),
    'red': ('#f8cecc', '#b85450'),
    'purple': ('#e1d5e7', '#9673a6'),
    'grey': ('#f5f5f5', '#666666'),
    'white': ('#ffffff', '#666666'),
    'container': ('#fafafa', '#999999'),
}
FONT = 'Helvetica, Arial, sans-serif'


def parse(text):
    """Lines; a line wrapped in ** is bold."""
    out = []
    for line in text.split('\n'):
        if line.startswith('**') and line.endswith('**') and len(line) > 4:
            out.append((line[2:-2], True))
        else:
            out.append((line, False))
    return out


def rich(line):
    """Inline **bold** inside a line → list of (text, bold)."""
    parts = line.split('**')
    return [(p, i % 2 == 1) for i, p in enumerate(parts) if p]


class Diagram:
    def __init__(self, name, title, w, h):
        self.name, self.title, self.w, self.h = name, title, w, h
        self.items = []
        self.nodes = {}
        self.n = 1

    def _id(self):
        self.n += 1
        return f'{self.name}-{self.n}'

    def box(self, x, y, w, h, text='', color='blue', shape='rect', fs=12, align='center', valign='middle',
            dashed=False, rounded=True, fill=None, stroke=None, fill_opacity=None, stroke_width=1, text_color='#000000'):
        f, s = PAL.get(color, ('none', 'none'))
        node = dict(kind='box', id=self._id(), x=x, y=y, w=w, h=h, text=text, shape=shape, fs=fs, align=align,
                    valign=valign, dashed=dashed, rounded=rounded, fill=fill or f, stroke=stroke or s,
                    fill_opacity=fill_opacity, sw=stroke_width, tc=text_color)
        self.items.append(node)
        self.nodes[node['id']] = node
        self._check(node)
        return node['id']

    def text(self, x, y, w, h, text, fs=12, align='left', valign='top', color='#000000'):
        return self.box(x, y, w, h, text, fill='none', stroke='none', fs=fs, align=align, valign=valign,
                        rounded=False, text_color=color)

    def edge(self, src, dst, text='', pts=(), exit=None, entry=None, dashed=False, color='#333333', width=1.5,
             end=True, start=False, fs=11):
        self.items.append(dict(kind='edge', id=self._id(), src=src, dst=dst, text=text, pts=list(pts), exit=exit,
                               entry=entry, dashed=dashed, color=color, w=width, end=end, start=start, fs=fs))

    def line(self, pts, color='#333333', width=1.5, dashed=False, end=False, start=False, opacity=None, text='',
             fs=11, dotted=False):
        self.items.append(dict(kind='line', id=self._id(), pts=list(pts), color=color, w=width, dashed=dashed,
                               dotted=dotted, end=end, start=start, opacity=opacity, text=text, fs=fs))

    def _check(self, n):
        if not n['text']:
            return
        if n['align'] != 'left' and any(len(rich(l)) > 1 for l, b in parse(n['text']) if not b):
            print(f'warning {self.name}: inline bold in centered text: {n["text"][:40]!r}')
        for line, bold in parse(n['text']):
            plain = line.replace('**', '')
            width = len(plain) * n['fs'] * (0.6 if bold else 0.54)
            if width > n['w'] - 8:
                print(f'warning {self.name}: "{plain[:40]}" ~{width:.0f}px > {n["w"] - 8}px')

    # --- geometry ---------------------------------------------------------------

    @staticmethod
    def center(n):
        return n['x'] + n['w'] / 2, n['y'] + n['h'] / 2

    def perimeter(self, n, toward):
        cx, cy = self.center(n)
        dx, dy = toward[0] - cx, toward[1] - cy
        if dx == 0 and dy == 0:
            return cx, cy
        a, b = n['w'] / 2, n['h'] / 2
        if n['shape'] == 'ellipse':
            t = 1 / math.sqrt((dx / a) ** 2 + (dy / b) ** 2)
        elif n['shape'] == 'rhombus':
            t = 1 / (abs(dx) / a + abs(dy) / b)
        else:
            t = min(a / abs(dx) if dx else math.inf, b / abs(dy) if dy else math.inf)
        return cx + dx * t, cy + dy * t

    def port(self, n, p):
        return n['x'] + p[0] * n['w'], n['y'] + p[1] * n['h']

    def edge_points(self, e):
        s, d = self.nodes[e['src']], self.nodes[e['dst']]
        first = self.port(s, e['exit']) if e['exit'] else None
        last = self.port(d, e['entry']) if e['entry'] else None
        nxt = e['pts'][0] if e['pts'] else (last or self.center(d))
        prv = e['pts'][-1] if e['pts'] else (first or self.center(s))
        first = first or self.perimeter(s, nxt)
        last = last or self.perimeter(d, prv)
        return [first, *e['pts'], last]

    # --- SVG ----------------------------------------------------------------------

    def svg_text(self, out, x, y, w, h, text, fs, align, valign, color, spacing=4):
        lines = parse(text)
        lh = fs * 1.2
        total = len(lines) * lh
        if valign == 'top':
            top = y + spacing
        elif valign == 'bottom':
            top = y + h - spacing - total
        else:
            top = y + h / 2 - total / 2
        anchor = {'center': 'middle', 'left': 'start', 'right': 'end'}[align]
        tx = {'center': x + w / 2, 'left': x + spacing, 'right': x + w - spacing}[align]
        for i, (line, bold) in enumerate(lines):
            base = top + i * lh + fs * 0.93
            el = ET.SubElement(out, 'text', {
                'x': f'{tx:.1f}', 'y': f'{base:.1f}', 'font-family': FONT, 'font-size': str(fs), 'fill': color,
                'text-anchor': anchor})
            if bold:
                el.set('font-weight', 'bold')
            segs = rich(line)
            if len(segs) == 1:
                el.text = segs[0][0]
            else:
                for seg, b in segs:
                    ts = ET.SubElement(el, 'tspan')
                    if b:
                        ts.set('font-weight', 'bold')
                    ts.text = seg

    def marker(self, defs, color, seen):
        mid = 'arrow' + color.replace('#', '-')
        if mid not in seen:
            seen.add(mid)
            m = ET.SubElement(defs, 'marker', {
                'id': mid, 'viewBox': '0 0 10 10', 'refX': '9', 'refY': '5', 'markerWidth': '10',
                'markerHeight': '10', 'markerUnits': 'userSpaceOnUse', 'orient': 'auto-start-reverse'})
            ET.SubElement(m, 'path', {'d': 'M0,1 L10,5 L0,9 z', 'fill': color})
        return f'url(#{mid})'

    def svg_poly(self, g, defs, seen, pts, it):
        attrs = {
            'points': ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts), 'fill': 'none', 'stroke': it['color'],
            'stroke-width': str(it['w']), 'stroke-linejoin': 'round'}
        if it.get('dashed'):
            attrs['stroke-dasharray'] = '6 4'
        if it.get('dotted'):
            attrs['stroke-dasharray'] = '2 3'
        if it.get('opacity') is not None:
            attrs['stroke-opacity'] = str(it['opacity'] / 100)
        if it['end']:
            attrs['marker-end'] = self.marker(defs, it['color'], seen)
        if it['start']:
            attrs['marker-start'] = self.marker(defs, it['color'], seen)
        ET.SubElement(g, 'polyline', attrs)
        if it['text']:
            x, y = midpoint(pts)
            lines = parse(it['text'])
            tw = max(len(l.replace('**', '')) for l, _ in lines) * it['fs'] * 0.56 + 6
            th = len(lines) * it['fs'] * 1.2 + 2
            ET.SubElement(g, 'rect', {'x': f'{x - tw / 2:.1f}', 'y': f'{y - th / 2:.1f}', 'width': f'{tw:.1f}',
                                      'height': f'{th:.1f}', 'fill': '#ffffff'})
            self.svg_text(g, x - tw / 2, y - th / 2, tw, th, it['text'], it['fs'], 'center', 'middle', '#333333', 0)

    def to_svg(self, mxfile):
        svg = ET.Element('svg', {
            'xmlns': 'http://www.w3.org/2000/svg', 'version': '1.1', 'width': f'{self.w}px',
            'height': f'{self.h}px', 'viewBox': f'0 0 {self.w} {self.h}', 'content': mxfile,
            'style': 'background-color: #ffffff;'})
        defs = ET.SubElement(svg, 'defs')
        seen = set()
        ET.SubElement(svg, 'rect', {'x': '0', 'y': '0', 'width': str(self.w), 'height': str(self.h), 'fill': '#ffffff'})
        g = ET.SubElement(svg, 'g')
        for it in self.items:
            if it['kind'] == 'box':
                n = it
                common = {'fill': n['fill'], 'stroke': n['stroke'], 'stroke-width': str(n['sw'])}
                if n['fill_opacity'] is not None:
                    common['fill-opacity'] = str(n['fill_opacity'] / 100)
                if n['dashed']:
                    common['stroke-dasharray'] = '6 4'
                if n['fill'] != 'none' or n['stroke'] != 'none':
                    if n['shape'] == 'ellipse':
                        ET.SubElement(g, 'ellipse', {'cx': str(n['x'] + n['w'] / 2), 'cy': str(n['y'] + n['h'] / 2),
                                                     'rx': str(n['w'] / 2), 'ry': str(n['h'] / 2), **common})
                    elif n['shape'] == 'rhombus':
                        x, y, w, h = n['x'], n['y'], n['w'], n['h']
                        pts = f'{x + w / 2},{y} {x + w},{y + h / 2} {x + w / 2},{y + h} {x},{y + h / 2}'
                        ET.SubElement(g, 'polygon', {'points': pts, **common})
                    else:
                        r = min(n['w'], n['h']) * 0.12 if n['rounded'] else 0
                        ET.SubElement(g, 'rect', {'x': str(n['x']), 'y': str(n['y']), 'width': str(n['w']),
                                                  'height': str(n['h']), 'rx': f'{r:.1f}', **common})
                if n['text']:
                    self.svg_text(g, n['x'], n['y'], n['w'], n['h'], n['text'], n['fs'], n['align'], n['valign'],
                                  n['tc'])
            elif it['kind'] == 'edge':
                self.svg_poly(g, defs, seen, self.edge_points(it), it)
            else:
                self.svg_poly(g, defs, seen, it['pts'], it)
        return ET.tostring(svg, encoding='unicode')

    # --- draw.io model ------------------------------------------------------------

    def label(self, text):
        out = []
        for line, bold in parse(text):
            s = ''.join(f'<b>{html.escape(t, quote=False)}</b>' if b else html.escape(t, quote=False)
                        for t, b in rich(line)) if line else ''
            out.append(f'<b>{s}</b>' if bold else s)
        return '<br>'.join(out)

    def to_mxfile(self):
        mxfile = ET.Element('mxfile', {'host': 'drawio', 'type': 'device'})
        diagram = ET.SubElement(mxfile, 'diagram', {'id': self.name, 'name': self.title})
        model = ET.SubElement(diagram, 'mxGraphModel', {
            'grid': '1', 'gridSize': '10', 'guides': '1', 'tooltips': '1', 'connect': '1', 'arrows': '1',
            'fold': '1', 'page': '1', 'pageScale': '1', 'pageWidth': str(self.w), 'pageHeight': str(self.h),
            'background': '#ffffff', 'math': '0', 'shadow': '0'})
        root = ET.SubElement(model, 'root')
        ET.SubElement(root, 'mxCell', {'id': '0'})
        ET.SubElement(root, 'mxCell', {'id': '1', 'parent': '0'})
        for it in self.items:
            if it['kind'] == 'box':
                n = it
                st = []
                if n['fill'] == 'none' and n['stroke'] == 'none':
                    st.append('text')
                if n['shape'] in ('ellipse', 'rhombus'):
                    st.append(n['shape'])
                st += [f'rounded={1 if n["rounded"] else 0}', 'arcSize=12', 'whiteSpace=wrap', 'html=1',
                       f'fillColor={n["fill"]}', f'strokeColor={n["stroke"]}', f'fontSize={n["fs"]}',
                       f'align={n["align"]}', f'verticalAlign={n["valign"]}', 'spacing=4',
                       f'strokeWidth={n["sw"]}', f'fontColor={n["tc"]}']
                if n['dashed']:
                    st.append('dashed=1')
                if n['fill_opacity'] is not None:
                    st.append(f'fillOpacity={n["fill_opacity"]}')
                cell = ET.SubElement(root, 'mxCell', {'id': n['id'], 'value': self.label(n['text']),
                                                      'style': ';'.join(st) + ';', 'vertex': '1', 'parent': '1'})
                ET.SubElement(cell, 'mxGeometry', {'x': str(n['x']), 'y': str(n['y']), 'width': str(n['w']),
                                                   'height': str(n['h']), 'as': 'geometry'})
            else:
                e = it
                st = ['html=1', 'rounded=0', f'strokeColor={e["color"]}', f'strokeWidth={e["w"]}',
                      f'fontSize={e["fs"]}', 'labelBackgroundColor=#ffffff', 'fontColor=#333333',
                      'endArrow=block;endFill=1' if e['end'] else 'endArrow=none',
                      'startArrow=block;startFill=1' if e['start'] else 'startArrow=none']
                if e.get('dashed'):
                    st.append('dashed=1')
                if e.get('dotted'):
                    st.append('dashed=1;dashPattern=2 3')
                if e.get('opacity') is not None:
                    st.append(f'opacity={e["opacity"]}')
                attrs = {'id': e['id'], 'value': self.label(e['text']), 'edge': '1', 'parent': '1'}
                if e['kind'] == 'edge':
                    attrs['source'], attrs['target'] = e['src'], e['dst']
                    for key, p in (('exit', e['exit']), ('entry', e['entry'])):
                        if p:
                            st.append(f'{key}X={p[0]};{key}Y={p[1]};{key}Dx=0;{key}Dy=0')
                    inner = e['pts']
                else:
                    inner = e['pts'][1:-1]
                attrs['style'] = ';'.join(st) + ';'
                cell = ET.SubElement(root, 'mxCell', attrs)
                geo = ET.SubElement(cell, 'mxGeometry', {'relative': '1', 'as': 'geometry'})
                if e['kind'] == 'line':
                    ET.SubElement(geo, 'mxPoint', {'x': f'{e["pts"][0][0]:.1f}', 'y': f'{e["pts"][0][1]:.1f}',
                                                   'as': 'sourcePoint'})
                    ET.SubElement(geo, 'mxPoint', {'x': f'{e["pts"][-1][0]:.1f}', 'y': f'{e["pts"][-1][1]:.1f}',
                                                   'as': 'targetPoint'})
                if inner:
                    arr = ET.SubElement(geo, 'Array', {'as': 'points'})
                    for x, y in inner:
                        ET.SubElement(arr, 'mxPoint', {'x': f'{x:.1f}', 'y': f'{y:.1f}'})
        return ET.tostring(mxfile, encoding='unicode')

    def save(self, directory):
        path = f'{directory}/{self.name}.drawio.svg'
        with open(path, 'w') as f:
            f.write(self.to_svg(self.to_mxfile()))
            f.write('\n')
        return path


def midpoint(pts):
    lengths = [math.dist(a, b) for a, b in zip(pts, pts[1:])]
    half = sum(lengths) / 2
    for (a, b), l in zip(zip(pts, pts[1:]), lengths):
        if half <= l and l > 0:
            t = half / l
            return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        half -= l
    return pts[-1]
