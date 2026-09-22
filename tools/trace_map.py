"""Trace assets/vcp-map.jpg into vector layers.

Outputs data/map-layers.js (+ .json) with three groups:
  bottom : park sections, main roads, large water bodies  (disjoint polygons)
  top    : trails / paths as polylines, one entry per legend colour
  pins   : blue icon discs (bus, restroom, ...) classified against the key
Run:  python tools/trace_map.py
"""
import cv2, numpy as np, json, os
from skimage.morphology import skeletonize
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union

IMG = 'assets/vcp-map.jpg'
img = cv2.imread(IMG)
H, W = img.shape[:2]
rgb = img[..., ::-1].astype(np.int16)
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
Y0, Y1 = 285, 1655                      # map body rows (banner above, legend below)
inmap = np.zeros((H, W), bool); inmap[Y0:Y1, :] = True

def ell(k): return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
def u8(m): return (m.astype(np.uint8) * 255)
def close(m, k): return cv2.morphologyEx(u8(m), cv2.MORPH_CLOSE, ell(k)) > 0
def open_(m, k): return cv2.morphologyEx(u8(m), cv2.MORPH_OPEN, ell(k)) > 0
def dilate(m, k): return cv2.dilate(u8(m), ell(k)) > 0
def erode(m, k): return cv2.erode(u8(m), ell(k)) > 0
def colordist(c): return np.sqrt(((rgb - np.array(c)) ** 2).sum(-1))

# ---------- contour smoothing ----------
def smooth_ring(P, win=25, eps=3.0, chaikin=2):
    P = P.astype(float); n = len(P)
    if n < 8: return P
    k = min(win // 2, n // 4)
    idx = (np.arange(n)[:, None] + np.arange(-k, k + 1)[None, :]) % n
    P = P[idx].mean(axis=1)
    P = cv2.approxPolyDP(P.astype(np.float32).reshape(-1, 1, 2), eps, True).reshape(-1, 2).astype(float)
    for _ in range(chaikin):
        Q = np.roll(P, -1, axis=0)
        P = np.stack([0.75 * P + 0.25 * Q, 0.25 * P + 0.75 * Q], axis=1).reshape(-1, 2)
    return P

def smooth_line(P, win=9, eps=1.5):
    P = P.astype(float); n = len(P)
    if n < 4: return P
    k = min(win // 2, n // 3)
    out = np.empty_like(P)
    for i in range(n):
        a, b = max(0, i - k), min(n, i + k + 1)
        out[i] = P[a:b].mean(axis=0)
    out[0], out[-1] = P[0], P[-1]
    return cv2.approxPolyDP(out.astype(np.float32).reshape(-1, 1, 2), eps, False).reshape(-1, 2).astype(float)

def rings_from_mask(mask, min_area=400, hole_min_area=None, **kw):
    """External rings + holes as [(outer, [holes])]."""
    hole_min_area = min_area if hole_min_area is None else hole_min_area
    cnts, hier = cv2.findContours(u8(mask), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    if hier is None: return out
    hier = hier[0]
    for i, c in enumerate(cnts):
        if hier[i][3] != -1: continue                       # not an outer ring
        if cv2.contourArea(c) < min_area: continue
        outer = smooth_ring(c.reshape(-1, 2), **kw)
        holes = []
        j = hier[i][2]
        while j != -1:
            if cv2.contourArea(cnts[j]) >= hole_min_area:
                holes.append(smooth_ring(cnts[j].reshape(-1, 2), **kw))
            j = hier[j][0]
        out.append((outer, holes))
    return out

def pts(a): return [[round(float(x), 1), round(float(y), 1)] for x, y in a]

# ---------- 1. park sections ----------
park_raw = (G - R >= 22) & (G - B >= 6) & (G > 140) & inmap
park_clean = open_(close(park_raw, 9), 5)
n, lab, stats, cent = cv2.connectedComponentsWithStats(u8(park_clean), connectivity=4)
NAMES = [
  ("northwest-forest",  "Northwest Forest",                      (357, 582)),
  ("croton-woods",      "Croton Woods & Golf Course North",      (712, 704)),
  ("northeast-forest",  "Northeast Forest & Indian Field",       (972, 658)),
  ("parade-ground",     "Parade Ground & Vault Hill",            (428, 1127)),
  ("tibbetts-golf",     "Golf Course – Tibbetts Brook",          (621, 978)),
  ("allen-shandler",    "Allen Shandler Rec Area & Mosholu Golf",(854, 1288)),
  ("golf-course-south", "Golf Course South & Classic Playground",(610, 1422)),
]

# ---------- 2. water ----------
water_raw = (B - R >= 30) & (B - G >= 12) & (B > 110) & ~((R < 80) & (B - G <= 45)) & inmap   # blue, minus the teal pins
n_w, lab_w, st_w, _ = cv2.connectedComponentsWithStats(u8(water_raw), connectivity=8)
keep_w = []
for i in range(1, n_w):
    x, y, w, h, a = st_w[i]
    if a < 40: continue
    comp = lab_w == i
    if R[comp].mean() < 115:                                   # dark water blue: every piece counts
        keep_w.append(i)
    elif a >= 300 and a / (w * h) >= 0.5 and min(w, h) >= 15: # light blue blob (golf pond), not the light-blue trail line
        keep_w.append(i)
water = close(np.isin(lab_w, keep_w), 5)

# park sections minus water (with a gap so smoothed rings stay disjoint)
park_final = np.zeros_like(park_clean)
sections = []
for sid, name, (cx, cy) in NAMES:
    best = min((i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] > 3000),
               key=lambda i: (cent[i][0] - cx) ** 2 + (cent[i][1] - cy) ** 2)
    comp = open_(close(lab == best, 31), 15) & ~dilate(water, 7)
    comp = open_(comp, 5)
    park_final |= comp
    (outer, holes), = rings_from_mask(comp, min_area=3000, hole_min_area=100)[:1]
    water_zone = dilate(water, 9)
    kept = []
    for hgon in holes:                                     # only holes that are water become holes in the section
        hm = np.zeros((H, W), np.uint8); cv2.fillPoly(hm, [np.array(hgon, np.int32)], 1)
        if (hm.astype(bool) & water_zone).any(): kept.append(hgon)
    M = cv2.moments(u8(comp), binaryImage=True)
    sections.append(dict(id=sid, name=name, area_px=int(comp.sum()),
                         centroid=[round(M['m10'] / M['m00'], 1), round(M['m01'] / M['m00'], 1)],
                         points=pts(outer), holes=[pts(h) for h in kept]))
    print('section', sid, len(outer), 'verts')

water_polys = [dict(id=f'water-{k}', points=pts(o)) for k, (o, h) in enumerate(rings_from_mask(water, 100, win=15))]
print('water bodies', len(water_polys))

# ---------- 3. main roads (centerlines -> buffered, connected polygon) ----------
from shapely.geometry import LineString
neutral = (np.abs(R - G) <= 14) & (np.abs(G - B) <= 14) & (R >= 170) & (R <= 240) & inmap
thick = open_(neutral, 31)                   # solid blocks: non-park land patches, text boxes
park_filled = np.zeros((H, W), np.uint8)
for sec in sections:
    cv2.fillPoly(park_filled, [np.array(sec['points'], np.int32)], 1)
park_filled = park_filled > 0
envelope = dilate(close(park_filled, 151), 42)   # the park plus the roads that ring it
hugs_park = dilate(park_filled, 48)
park_geoms = [Polygon(sec['points']) for sec in sections]
water_geoms = [Polygon(o) for o, h in rings_from_mask(water, 100, win=15)]
NB = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
def skeleton_to_lines(sk):
    ys, xs = np.nonzero(sk)
    S = set(zip(ys.tolist(), xs.tolist()))
    deg = {p: sum((p[0] + dy, p[1] + dx) in S for dy, dx in NB) for p in S}
    visited = set(); lines = []
    def walk(start, nxt):
        line = [start, nxt]; visited.add((start, nxt)); visited.add((nxt, start))
        cur, prev = nxt, start
        while deg[cur] == 2:
            nb = [(cur[0] + dy, cur[1] + dx) for dy, dx in NB if (cur[0] + dy, cur[1] + dx) in S and (cur[0] + dy, cur[1] + dx) != prev]
            if not nb: break
            nx = nb[0]
            if (cur, nx) in visited: break
            visited.add((cur, nx)); visited.add((nx, cur))
            line.append(nx); prev, cur = cur, nx
        return line
    for p in S:
        if deg[p] != 2:
            for dy, dx in NB:
                q = (p[0] + dy, p[1] + dx)
                if q in S and (p, q) not in visited:
                    lines.append(walk(p, q))
    for p in S:                                   # leftover pure cycles
        if deg[p] == 2:
            for dy, dx in NB:
                q = (p[0] + dy, p[1] + dx)
                if q in S and (p, q) not in visited:
                    lines.append(walk(p, q)); break
    return [np.array([[x, y] for y, x in l], float) for l in lines]

def plen(L): return float(np.hypot(*np.diff(L, axis=0).T).sum()) if len(L) > 1 else 0.0

def prune_spurs(lines, min_len, rounds=3):
    """drop short branches that end in a free endpoint"""
    for _ in range(rounds):
        ends = {}
        for L in lines:
            for e in (tuple(L[0]), tuple(L[-1])): ends[e] = ends.get(e, 0) + 1
        keep = []
        for L in lines:
            free = (ends[tuple(L[0])] == 1) + (ends[tuple(L[-1])] == 1)
            if free >= 1 and plen(L) < min_len and not (free == 2 and plen(L) >= min_len): continue
            keep.append(L)
        if len(keep) == len(lines): break
        lines = keep
    return lines

def bridge_gaps(lines, max_gap=45, near_mask=None, max_gap_near=175):
    """connect free endpoints to the nearest other line in the direction the road is heading"""
    ends = {}
    for i, L in enumerate(lines):
        for e in (tuple(L[0]), tuple(L[-1])): ends[e] = ends.get(e, 0) + 1
    allpts = np.vstack(lines); owner = np.concatenate([[i] * len(L) for i, L in enumerate(lines)])
    lens = np.array([plen(L) for L in lines])
    bridges = []
    for i, L in enumerate(lines):
        if lens[i] < 12: continue                          # skeleton fragments never start a bridge
        for end in (0, -1):
            e = L[end]
            if ends[tuple(e)] != 1:
                # an end tangled only with tiny fragments still counts as free
                near = np.where((np.hypot(*(allpts - e).T) <= 8) & (owner != i))[0]
                if any(lens[owner[j]] >= 12 for j in near): continue
            tail = L[:8] if end == 0 else L[-8:][::-1]     # points leading into the endpoint
            d = e - tail[-1] if len(tail) > 1 else None
            if d is None or np.hypot(*d) < 1e-6: continue
            d = d / np.hypot(*d)
            v = allpts - e; dist = np.hypot(v[:, 0], v[:, 1])
            ahead = (v @ d) > 0.6 * dist
            reach = max_gap
            if near_mask is not None and near_mask[min(H - 1, max(0, int(e[1]))), min(W - 1, max(0, int(e[0])))]:
                reach = max_gap_near                       # ends on the park boundary may reach further along it
            cand = np.where((dist > 2) & (dist <= reach) & ahead & (owner != i) & (lens[owner] >= 12))[0]
            if len(cand) == 0: continue
            j = cand[np.argmin(dist[cand])]
            bridges.append(np.array([e, allpts[j]]))
    return lines + bridges

def smooth_road(L, win=21, eps=1.0, chaikin=2):
    if len(L) < 3: return L
    k = min(win // 2, len(L) // 3)
    out = np.array([L[max(0, i - k):i + k + 1].mean(axis=0) for i in range(len(L))])
    out[0], out[-1] = L[0], L[-1]
    out = cv2.approxPolyDP(out.astype(np.float32).reshape(-1, 1, 2), eps, False).reshape(-1, 2).astype(float)
    for _ in range(chaikin):                     # round the remaining corners, keep the end points
        if len(out) < 3: break
        Q = np.roll(out, -1, axis=0)[:-1]; P = out[:-1]
        mid = np.stack([0.75 * P + 0.25 * Q, 0.25 * P + 0.75 * Q], axis=1).reshape(-1, 2)
        out = np.vstack([out[:1], mid, out[-1:]])
    return out


ROAD_DEFAULTS = dict(close_k=17, open_k=7, spur=35, gap=60, fuse=2.5, width='measured')   # variant I
def extract_roads(close_k=13, open_k=9, spur=28, gap=45, fuse=2.5, width='measured'):
    road_m = neutral & ~dilate(thick, 5)
    road_m0 = road_m
    road_m = close(road_m, close_k)              # bridge road labels
    road_m = open_(road_m, open_k)               # keep only the wide (main) roads
    # thin roads that run right along the park boundary are kept too (e.g. the road above Northwest Forest)
    ring = open_(close(road_m0, 9), 3) & dilate(park_filled, 22) & ~park_filled
    n_g, lab_g, st_g, _ = cv2.connectedComponentsWithStats(u8(ring), connectivity=8)
    ring = np.isin(lab_g, [i for i in range(1, n_g) if max(st_g[i, cv2.CC_STAT_WIDTH], st_g[i, cv2.CC_STAT_HEIGHT]) >= 60])
    road_m |= dilate(ring, 3)
    road_m &= envelope
    n_r, lab_r, st_r, _ = cv2.connectedComponentsWithStats(u8(road_m), connectivity=8)
    keep_ids = []
    for i in range(1, n_r):
        comp = lab_r == i
        if not comp[~park_filled].any(): continue                  # loop roads fully inside a section
        a = st_r[i, cv2.CC_STAT_AREA]
        if a >= 4000 or (a >= 600 and (comp & hugs_park).any()):   # big, or a boundary road cut short by the clip
            keep_ids.append(i)
    road_m = np.isin(lab_r, keep_ids)
    road_dt = cv2.distanceTransform(u8(road_m), cv2.DIST_L2, 5)

    sk = skeletonize(road_m)
    rl = skeleton_to_lines(sk)
    rl = prune_spurs(rl, spur)
    rl = bridge_gaps(rl, gap, near_mask=dilate(park_filled, 26) & ~park_filled)
    rl = [smooth_road(L) for L in rl if plen(L) > 6]
    # width per line from the distance transform (consistent classes)
    def line_width(L):
        n = max(2, int(plen(L) / 3))
        ts = np.linspace(0, 1, n); seg = LineString(L)
        ds = [road_dt[int(pt.y), int(pt.x)] for pt in (seg.interpolate(t, normalized=True) for t in ts) if 0 <= int(pt.y) < H and 0 <= int(pt.x) < W]
        return 2 * float(np.median(ds)) if ds else 10.0
    road_lines = []
    for L in rl:
        w = line_width(L) if width == 'measured' else float(width)
        cls = 'highway' if w >= 15 else 'road'
        road_lines.append(dict(points=pts(L), width=round(min(max(w, 9), 20), 1), cls=cls))
    print('road centerlines', len(road_lines), 'total length px', round(sum(plen(np.array(r['points'])) for r in road_lines)))

    # buffered union -> one connected polygon, kept clear of park sections and water
    road_geom = unary_union([LineString(r['points']).buffer(r['width'] / 2, cap_style=2, join_style=1) for r in road_lines if len(r['points']) > 1])
    road_geom = road_geom.buffer(fuse, join_style=1).buffer(-fuse, join_style=1)      # fuse near-touching carriageways
    road_geom = road_geom.difference(unary_union(park_geoms).buffer(2.5, join_style=1))
    road_geom = road_geom.difference(unary_union(water_geoms).buffer(2.5, join_style=1))
    road_geom = road_geom.buffer(-3, join_style=1).buffer(6, join_style=1).buffer(-3, join_style=1)   # round convex and concave corners
    road_geom = road_geom.simplify(0.5, preserve_topology=True)
    polys = list(road_geom.geoms) if road_geom.geom_type == 'MultiPolygon' else [road_geom]
    polys = [p for p in polys if p.area >= 400]
    def chaikin_ring(P, n=1):
        P = np.array(P, float)[:-1]
        for _ in range(n):
            Q = np.roll(P, -1, axis=0)
            P = np.stack([0.75 * P + 0.25 * Q, 0.25 * P + 0.75 * Q], axis=1).reshape(-1, 2)
        return P
    road_polys = [dict(id=f'road-{k}', outer=pts(chaikin_ring(p.exterior.coords)), holes=[pts(chaikin_ring(i.coords)) for i in p.interiors]) for k, p in enumerate(polys)]
    roads = np.zeros((H, W), bool)
    for rp in road_polys:
        cv2.fillPoly(roads.view(np.uint8), [np.array(rp['outer'], np.int32)], 1)
        for h in rp['holes']: cv2.fillPoly(roads.view(np.uint8), [np.array(h, np.int32)], 0)
    print('road polygons', len(road_polys), 'holes', sum(len(r["holes"]) for r in road_polys), 'largest area', round(max(p.area for p in polys)))
    return road_lines, road_polys, roads

road_lines, road_polys, roads = extract_roads(**ROAD_DEFAULTS)

# ---------- optional: grid search over road parameters (ROAD_GRID=<outdir>) ----------
if os.environ.get('ROAD_GRID'):
    import sys
    outdir = os.environ['ROAD_GRID']; os.makedirs(outdir, exist_ok=True)
    VARIANTS = [
        ('A baseline',            dict(close_k=13, open_k=9, spur=28, gap=45)),
        ('B light bridging',      dict(close_k=9,  gap=30, spur=20)),
        ('C heavy bridging',      dict(close_k=17, gap=70, spur=45)),
        ('D keep narrower roads', dict(open_k=7)),
        ('E wide roads only',     dict(open_k=11)),
        ('F fuse carriageways',   dict(fuse=6)),
        ('G uniform width 12',    dict(width=12)),
        ('H uniform 15 + fuse',   dict(width=15, fuse=4)),
        ('I most connected',      dict()),
    ]
    x0, y0, x1, y1 = 125, 275, 1215, 1665
    def render(road_lines, road_polys, label):
        im = np.full((H, W, 3), (231, 235, 233), np.uint8)
        for rp in road_polys:
            cv2.fillPoly(im, [np.array(rp['outer'], np.int32)], (208, 211, 207))
            for h in rp['holes']: cv2.fillPoly(im, [np.array(h, np.int32)], (231, 235, 233))
        for sec in sections: cv2.fillPoly(im, [np.array(sec['points'], np.int32)], (154, 199, 143))
        for wp in water_polys: cv2.fillPoly(im, [np.array(wp['points'], np.int32)], (230, 184, 143))
        for rp in road_polys:
            cv2.polylines(im, [np.array(rp['outer'], np.int32)], True, (170, 176, 172), 1, cv2.LINE_AA)
            for h in rp['holes']: cv2.polylines(im, [np.array(h, np.int32)], True, (170, 176, 172), 1, cv2.LINE_AA)
        for r in road_lines: cv2.polylines(im, [np.array(r['points'], np.int32)], False, (255, 255, 255), 1, cv2.LINE_AA)
        tile = im[y0:y1, x0:x1].copy()
        cv2.rectangle(tile, (0, 0), (tile.shape[1], 44), (255, 255, 255), -1)
        cv2.putText(tile, label, (12, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (30, 40, 35), 2, cv2.LINE_AA)
        return tile
    tiles = []
    for label, kw in VARIANTS:
        params = dict(ROAD_DEFAULTS, **kw)
        rl_, rp_, _ = extract_roads(**params)
        info = f"{label}  |  close {params['close_k']} open {params['open_k']} spur {params['spur']} gap {params['gap']} fuse {params['fuse']} width {params['width']}"
        n_poly = len(rp_); print('variant', info, '-> polygons', n_poly, 'holes', sum(len(r['holes']) for r in rp_), 'lines', len(rl_))
        tile = render(rl_, rp_, label + f'  ({n_poly} piece{"s" if n_poly != 1 else ""})')
        cv2.putText(tile, info.split('|')[1].strip(), (12, tile.shape[0] - 14), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (30, 40, 35), 1, cv2.LINE_AA)
        cv2.imwrite(os.path.join(outdir, label.split()[0] + '.png'), tile)
        tiles.append(cv2.resize(tile, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA))
    while len(tiles) % 3: tiles.append(np.full_like(tiles[0], 255))
    sheet = np.vstack([np.hstack(tiles[i:i + 3]) for i in range(0, len(tiles), 3)])
    cv2.imwrite(os.path.join(outdir, 'road-grid.png'), sheet)
    print('wrote', os.path.join(outdir, 'road-grid.png'))
    sys.exit(0)


# ---------- 4. pins (dark teal discs) ----------
pin_raw = (R < 80) & (B > 80) & (B - R >= 45) & (G >= 45) & (G <= 140) & (B - G <= 45) & ~dilate(water, 3)
pin_m = close(pin_raw, 7)
cnts, _ = cv2.findContours(u8(pin_m), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
filled = np.zeros((H, W), np.uint8); cv2.drawContours(filled, cnts, -1, 1, -1)
dt = cv2.distanceTransform(filled, cv2.DIST_L2, 5)
peak = (dt >= 8) & (dt >= cv2.dilate(dt, ell(21)) - 1e-3)
n_p, lab_p, st_p, cen_p = cv2.connectedComponentsWithStats(u8(peak), connectivity=8)
def discs(y_lo, y_hi, x_lo=0, x_hi=W):
    out = []
    for i in range(1, n_p):
        cx, cy = cen_p[i]
        if not (y_lo <= cy < y_hi and x_lo <= cx < x_hi): continue
        r = float(dt[int(cy), int(cx)])
        if r > 18: continue
        out.append((float(cx), float(cy), r))
    return out
key_discs = sorted(discs(1690, 1930, 200, 245), key=lambda t: t[1])
KEY_NAMES = ['playground', 'bbq', 'picnic', 'dog-run', 'restroom', 'wheelchair', 'bus', 'subway']
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
bright = ((R > 185) & (G > 185) & (B > 185)).astype(np.uint8) * 255
def crop(cx, cy, r, scale, size):
    """square crop of `scale`*r half-width, resized to size x size (glyph mask and grayscale)."""
    rr = max(4, int(round(r * scale))); x0, y0 = int(round(cx - rr)), int(round(cy - rr))
    sl = (slice(max(0, y0), y0 + 2 * rr), slice(max(0, x0), x0 + 2 * rr))
    g = cv2.resize(gray[sl], (size, size), interpolation=cv2.INTER_AREA)
    w = cv2.resize(bright[sl], (size, size), interpolation=cv2.INTER_AREA)
    return g, w
def crop_gray(cx, cy, r): return crop(cx, cy, r, 0.85, 24)      # template: inside the disc
def crop_win(cx, cy, r):  return crop(cx, cy, r, 1.15, 32)      # search window around the disc
templates = [(nm,) + crop_gray(*d) for nm, d in zip(KEY_NAMES, key_discs)]
print('key templates found', len(key_discs), 'of', len(KEY_NAMES))
pins = []
for cx, cy, r in discs(Y0, Y1):
    wg, ww = crop_win(cx, cy, r)
    def sc(win, t):
        if t.std() < 1e-6: return 0.0
        return float(cv2.matchTemplate(win, t, cv2.TM_CCOEFF_NORMED).max())
    scores = [((sc(wg, tg) + sc(ww, tw)) / 2, nm) for nm, tg, tw in templates]
    s, nm = max(scores)
    pins.append(dict(x=round(cx, 1), y=round(cy, 1), r=round(r, 1), type=nm if s > 0.45 else 'unknown', score=round(float(s), 2)))
# parking squares are water-blue small blobs
n_q, lab_q, st_q, cen_q = cv2.connectedComponentsWithStats(u8(close(water_raw, 3)), connectivity=8)
for i in range(1, n_q):
    x, y, w, h, a = st_q[i]; cx, cy = cen_q[i]
    if Y0 <= cy < Y1 and 150 <= a <= 700 and 0.7 <= w / h <= 1.4 and a / (w * h) > 0.75:
        pins.append(dict(x=round(float(cx), 1), y=round(float(cy), 1), r=round(max(w, h) / 2, 1), type='parking', score=1.0))
for i, p in enumerate(pins): print('  pin', i + 1, p['type'], p['score'])
print('pins', len(pins), {t: sum(p['type'] == t for p in pins) for t in KEY_NAMES + ['parking', 'unknown']})
pin_mask = np.zeros((H, W), bool)
for p in pins: cv2.circle(pin_mask.view(np.uint8), (int(p['x']), int(p['y'])), int(p['r'] + 4), 1, -1)

# ---------- 5. trails ----------
park_zone = dilate(park_final, 12)
TRAILS = [  # id, name, legend rgb, tolerance, dashed, restrict to park, min length
  ('john-muir',        'John Muir Trail',                (186, 56, 49),   40, False, False, 40),
  ('old-croton',       'Old Croton Aqueduct Trail',      (248, 253, 249), 22, False, True,  60),
  ('putnam-greenway',  'Putnam Greenway',                (234, 233, 80),  38, False, False, 40),
  ('cross-country',    'Cross Country',                  (207, 117, 79),  36, False, True,  40),
  ('cass-gallagher',   'Cass Gallagher Nature Trail',    (128, 170, 214), 36, False, True,  40),
  ('john-kieran',      'John Kieran Nature Trail',       (207, 134, 171), 34, False, True,  40),
  ('croton-connector', 'Croton Connector',               (179, 16, 129),  40, False, False, 40),
  ('jerome-wetland',   'Jerome Wetland Walk',            (237, 208, 141), 30, False, True,  40),
  ('bridle',           'Bridle Trail',                   (126, 131, 127), 26, False, True,  60),
  ('bike-route',       'NYC Bike Route',                 (45, 50, 45),    55, False, False, 80),
  ('other-paths',      'Other Official Paths and Trails',(191, 219, 122), 28, True,  True,  60),
]

trails = []
for tid, name, col, tol, dashed, in_park, minlen in TRAILS:
    m = (colordist(col) < tol) & inmap & ~pin_mask
    if in_park: m &= park_zone
    if tid == 'bike-route': m[:1200, :] = False; m &= dilate(envelope, 10)
    if tid != 'cass-gallagher': pass
    m &= ~dilate(water, 3) | (tid == 'putnam-greenway')
    if dashed:
        m &= ~dilate(colordist((234, 233, 80)) < 38, 5)   # not the solid yellow greenway
        m = dilate(m, 13)                                  # bridge the gaps between dashes
    else:
        m = close(m, 5)
    # drop blobs (buildings, fields, icons, text): thin lines have a small distance-transform value
    dt_t = cv2.distanceTransform(u8(m), cv2.DIST_L2, 3)
    thr = 5.5
    keep = m if dashed else m & ~dilate(dt_t > thr, int(2 * thr) + 1)
    n_t, lab_t, st_t, _ = cv2.connectedComponentsWithStats(u8(keep), connectivity=8)
    keep = np.isin(lab_t, [i for i in range(1, n_t) if st_t[i, cv2.CC_STAT_AREA] >= 25])
    sk = skeletonize(keep)
    lines = []
    for L in skeleton_to_lines(sk):
        length = np.hypot(*np.diff(L, axis=0).T).sum()
        if length < minlen: continue
        lines.append(pts(smooth_line(L)))
    trails.append(dict(id=tid, name=name, color='#%02x%02x%02x' % col, dashed=dashed, lines=lines))
    print('trail', tid, len(lines), 'polylines')

# ---------- 6. disjointness check for the bottom layer ----------
def poly(o, hs=()): 
    p = Polygon(o, hs)
    return p if p.is_valid else p.buffer(0)
bottom = [(s['id'], poly(s['points'], s['holes'])) for s in sections] + \
         [(w['id'], poly(w['points'])) for w in water_polys] + \
         [(r['id'], poly(r['outer'], r['holes'])) for r in road_polys]
bad = 0
for i in range(len(bottom)):
    for j in range(i + 1, len(bottom)):
        a, b = bottom[i][1], bottom[j][1]
        if a.intersects(b):
            ov = a.intersection(b).area
            if ov > 1.0:
                bad += 1; print('OVERLAP', bottom[i][0], bottom[j][0], round(ov, 1))
print('bottom-layer overlaps > 1px²:', bad)

# ---------- 7. write ----------
os.makedirs('data', exist_ok=True)
ys, xs = np.where(park_final | roads | water)
meta = dict(image=IMG, imageWidth=W, imageHeight=H, viewBox=[int(xs.min()) - 20, Y0 - 10, int(xs.max() - xs.min()) + 40, Y1 - Y0 + 20])
layers = dict(meta=meta, sections=sections, water=water_polys, roads=road_polys, roadLines=road_lines, trails=trails, pins=pins)
with open('data/map-layers.json', 'w') as f: json.dump(layers, f)
with open('data/map-layers.js', 'w') as f:
    f.write('// Auto-generated by tools/trace_map.py from assets/vcp-map.jpg\n')
    f.write('window.VCP_LAYERS = ' + json.dumps(layers) + ';\n')
with open('data/sections.js', 'w') as f:
    f.write('// Auto-generated by tools/trace_map.py\nwindow.VCP_META = ' + json.dumps(meta) + ';\nwindow.VCP_SECTIONS = ' + json.dumps(sections) + ';\n')
with open('data/sections.json', 'w') as f: json.dump(dict(meta=meta, sections=sections), f)

# debug preview
dbg = np.full((H, W, 3), 235, np.uint8)
dbg[roads] = (200, 200, 200); dbg[park_final] = (170, 215, 180); dbg[water] = (215, 160, 90)
for r in road_lines: cv2.polylines(dbg, [np.array(r['points'], np.int32)], False, (255, 255, 255), 1)
for t in trails:
    c = tuple(int(t['color'][i:i + 2], 16) for i in (5, 3, 1))
    for L in t['lines']:
        cv2.polylines(dbg, [np.array(L, np.int32)], False, c, 2)
for p in pins: cv2.circle(dbg, (int(p['x']), int(p['y'])), 8, (120, 60, 0), -1)
cv2.imwrite(os.environ.get('DEBUG_OUT', '/tmp/vcp-debug.png'), dbg)
print('viewBox', meta['viewBox'])
