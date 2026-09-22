"""Cut the big sections into equal-area quadrants (long axis first, then the other axis) -> data/subsections.json, and tag benches with their subsection.
Run: python tools/make_subsections.py"""
import json
from shapely.geometry import Polygon, Point, box
from shapely.ops import unary_union

SPLITS = {'northwest-forest', 'croton-woods', 'northeast-forest', 'parade-ground'}   # A, B, C, D
L = json.load(open('data/map-layers.json'))
benches = json.load(open('data/benches.json'))
letter = {s['id']: chr(65 + i) for i, s in enumerate(L['sections'])}

def band(poly, lo, hi, vertical):
    x0, y0, x1, y1 = poly.bounds
    return poly.intersection(box(x0 - 1, lo, x1 + 1, hi) if vertical else box(lo, y0 - 1, hi, y1 + 1))

def cut_at(poly, frac, vertical, lo, hi):
    """coordinate where the band from `lo` holds `frac` of the area (binary search)"""
    target = poly.area * frac; a, b = lo, hi
    for _ in range(40):
        m = (a + b) / 2
        if band(poly, lo, m, vertical).area < target: a = m
        else: b = m
    return (a + b) / 2

def split(poly, k, vertical):
    """k equal-area pieces along one axis"""
    x0, y0, x1, y1 = poly.bounds
    lo, hi = (y0, y1) if vertical else (x0, x1)
    edges = [lo] + [cut_at(poly, i / k, vertical, lo, hi) for i in range(1, k)] + [hi]
    return [band(poly, edges[i], edges[i + 1], vertical) for i in range(k)]

subs = []
for s in L['sections']:
    if s['id'] not in SPLITS: continue
    poly = Polygon(s['points'], s.get('holes', []))
    x0, y0, x1, y1 = poly.bounds
    vertical = (y1 - y0) >= (x1 - x0)
    pieces = [q for half in split(poly, 2, vertical) for q in split(half, 2, not vertical)]   # 2 x 2 quadrants
    for i, piece in enumerate(pieces):
        parts = list(piece.geoms) if hasattr(piece, 'geoms') else [piece]
        parts = [p for p in parts if p.geom_type == 'Polygon' and p.area > 200]
        c = piece.centroid
        subs.append(dict(id=f"{letter[s['id']]}{i + 1}", section=s['id'], centroid=[round(c.x, 1), round(c.y, 1)],
                         rings=[[[round(x, 1), round(y, 1)] for x, y in p.exterior.coords] for p in parts],
                         holes=[[[round(x, 1), round(y, 1)] for x, y in r.coords] for p in parts for r in p.interiors]))
        print(subs[-1]['id'], 'area', round(piece.area), 'parts', len(parts), 'bbox', [round(v) for v in piece.bounds])

geoms = {sub['id']: unary_union([Polygon(r) for r in sub['rings']]) for sub in subs}
# containment pass (subs are disjoint within a section)
by_sec = {}
for sub in subs: by_sec.setdefault(sub['section'], []).append(sub)
for b in benches:
    b['sub'] = None
    for sub in by_sec.get(b['section'], []):
        if geoms[sub['id']].buffer(1.5).contains(Point(b['x'], b['y'])): b['sub'] = sub['id']; break
json.dump(subs, open('data/subsections.json', 'w'))
json.dump(benches, open('data/benches.json', 'w'))
print({sid: sum(b['sub'] == sid for b in benches) for sid in geoms}, 'untagged in split sections:', sum(b['sub'] is None and b['section'] in SPLITS for b in benches))
