"""Spread ~500 benches evenly along trails and water edges -> data/benches.json
Run: python tools/make_benches.py [target=500]"""
import json, math, random, sys
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 500
L = json.load(open('data/map-layers.json'))
sections = [(s, Polygon(s['points'], s.get('holes', []))) for s in L['sections']]
letter = {s['id']: chr(65 + i) for i, (s, _) in enumerate(sections)}
park = unary_union([p for _, p in sections])
water = unary_union([Polygon(w['points']) for w in L['water']])

# candidate lines: every trail polyline + water shorelines pushed 6px onto the bank
lines = [LineString(l) for t in L['trails'] for l in t['lines'] if len(l) > 1]
shore = water.buffer(6).boundary
lines += list(shore.geoms) if hasattr(shore, 'geoms') else [shore]
lines = [l.intersection(park) for l in lines]                 # only what runs through park land
flat = []
for g in lines:
    if g.is_empty: continue
    flat += list(g.geoms) if hasattr(g, 'geoms') else [g]
lines = [g for g in flat if g.geom_type == 'LineString' and g.length > 8]
total = sum(l.length for l in lines)

def place(spacing, min_gap):
    rng = random.Random(42); out = []
    for l in lines:
        d = spacing / 2
        while d < l.length:
            p = l.interpolate(d); q = l.interpolate(min(l.length, d + 1))
            if not water.contains(p) and all((p.x - b['x']) ** 2 + (p.y - b['y']) ** 2 >= min_gap ** 2 for b in out):
                sec = next((s for s, poly in sections if poly.contains(p)), None)
                if sec:
                    r = rng.random()
                    out.append(dict(x=round(p.x, 1), y=round(p.y, 1), angle=round(math.degrees(math.atan2(q.y - p.y, q.x - p.x)), 1),
                                    region=letter[sec['id']], section=sec['id'],
                                    type='concrete' if rng.random() < 0.4 else 'worlds-fair', size=8 if r < 0.6 else 4))
            d += spacing
    return out

spacing = total / TARGET
for _ in range(12):                                            # nudge spacing until we land on the target
    benches = place(spacing, min_gap=spacing * 0.6)
    if abs(len(benches) - TARGET) <= 3: break
    spacing *= len(benches) / TARGET
for b in benches: b['sides'] = 2 if b['size'] == 8 else 1
# number within each region, top-to-bottom then left-to-right
for reg in sorted(set(b['region'] for b in benches)):
    for n, b in enumerate(sorted((b for b in benches if b['region'] == reg), key=lambda b: (round(b['y'] / 40), b['x'])), 1):
        b['id'] = f'{n}{reg}'
benches.sort(key=lambda b: (b['region'], int(b['id'][:-1])))
json.dump(benches, open('data/benches.json', 'w'))
print(len(benches), 'benches, spacing', round(spacing, 1), 'px;', {r: sum(b['region'] == r for b in benches) for r in sorted(letter.values())})
assert len(set(b['id'] for b in benches)) == len(benches) and all(park.contains(Point(b['x'], b['y'])) for b in benches)
