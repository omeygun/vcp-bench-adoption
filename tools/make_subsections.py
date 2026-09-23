"""Cut the big sections into 2x2 pieces (long axis first, then the other axis), placing the cuts so the tallest piece is as short as possible
(each piece keeps >= MIN_SHARE of the section's area) -> data/subsections.json, and tag benches with their subsection.
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

MIN_SHARE = 0.15   # of the whole section, per piece: stops the search from shaving off slivers
STEPS = 80         # cut positions tried per axis
TOL = 5            # heights within this many map units count as a tie; ties go to the more even split

height = lambda g: (g.bounds[3] - g.bounds[1]) if not g.is_empty else 0

def halves(poly, vertical):
    """both sides of every straight cut across `poly`, STEPS positions along the axis"""
    x0, y0, x1, y1 = poly.bounds
    lo, hi = (y0, y1) if vertical else (x0, x1)
    for i in range(1, STEPS):
        m = lo + (hi - lo) * i / STEPS
        yield band(poly, lo - 1, m, vertical), band(poly, m, hi + 1, vertical)

def best_pair(poly, vertical, total):
    """cut `poly` in two so the taller piece is as short as possible; None if no cut leaves both pieces big enough"""
    ok = [(a, b) for a, b in halves(poly, vertical) if min(a.area, b.area) >= MIN_SHARE * total]
    return min(ok, key=lambda ab: (round(max(height(ab[0]), height(ab[1])) / TOL), abs(ab[0].area - ab[1].area)), default=None)

def quadrants(poly, vertical):
    """ponytail: brute-force grid over cut positions, ~STEPS^2 shapely clips per section; fine for 4 sections run by hand"""
    total, best = poly.area, None
    for a, b in halves(poly, vertical):
        pa, pb = best_pair(a, not vertical, total), best_pair(b, not vertical, total)
        if not (pa and pb): continue
        pieces = [*pa, *pb]
        areas = [q.area for q in pieces]
        score = (round(max(map(height, pieces)) / TOL), max(areas) - min(areas))
        if best is None or score < best[0]: best = (score, pieces)
    return best[1]

subs = []
for s in L['sections']:
    if s['id'] not in SPLITS: continue
    poly = Polygon(s['points'], s.get('holes', []))
    x0, y0, x1, y1 = poly.bounds
    vertical = (y1 - y0) >= (x1 - x0)
    pieces = quadrants(poly, vertical)
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
