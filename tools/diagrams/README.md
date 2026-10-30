# Diagrams

`diagrams.py` generates the methodology diagrams in `docs/diagrams/` as `.drawio.svg` files:
an SVG image (shown by GitHub) with the draw.io model embedded (editable in draw.io).
`drawio.py` is the small library behind it: boxes, text, edges and free polylines, drawn
once as SVG and once as a draw.io model from the same coordinates. Standard library only.

```sh
python3 tools/diagrams/diagrams.py            # rewrites docs/diagrams/*.drawio.svg
python3 tools/diagrams/diagrams.py OUT_DIR    # elsewhere, e.g. to preview
```

It prints a warning when a text line probably overflows its box, or when a centered label
mixes bold and normal text (some SVG renderers misplace those; put the bold part on its own
line).

**Code or draw.io, not both.** Regenerating overwrites the files, including changes made in
draw.io. Either keep changing a diagram here, or edit it in draw.io from then on and remove
its function from `diagrams.py`.

Edges are straight segments between optional waypoints (`pts`), with optional fixed ports
(`exit`/`entry` as fractions of the box), as draw.io draws them without an edge style, so
both renderings agree. To preview the SVGs as PNG:

```sh
uv run --with cairosvg python -c "import cairosvg; cairosvg.svg2png(url='docs/diagrams/glide-model.drawio.svg', write_to='/tmp/glide.png')"
```
