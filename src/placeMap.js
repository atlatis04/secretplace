/**
 * Draws the saved places on real geography.
 *
 * How much of the world a card covers decides what is worth drawing on it, so
 * the map works in two bands:
 *
 *   spread over ~20° or more  → a 2:1 world strip, with the countries the
 *                               places fall in filled. At that scale the dots
 *                               are too small to read; the countries are not.
 *   anything tighter          → a square view of the coastline, with the
 *                               places as their own marks.
 *
 * A selection inside one city is clamped to a minimum span, because a view
 * fitted tightly to four cafes shows no coastline at all and could be
 * anywhere. Zooming out until the coast appears is what makes it read as
 * "around Busan".
 *
 * Boundary data is loaded on demand: it is only needed while a card is being
 * built, and it is far larger than the rest of the app.
 */

// Above this span (degrees) a selection is treated as global.
const WORLD_SPAN = 20;
// Below this, the view stops zooming in so context stays on the card.
const MIN_SPAN = 1.5;
// Breathing room around the outermost places.
const FIT_PADDING = 1.35;

const cache = new Map();

async function loadTopology(kind) {
    if (cache.has(kind)) return cache.get(kind);
    const topo = kind === 'world'
        ? (await import('world-atlas/countries-110m.json')).default
        : (await import('world-atlas/land-50m.json')).default;
    const decoded = decode(topo, kind === 'world' ? 'countries' : 'land');
    cache.set(kind, decoded);
    return decoded;
}

// Minimal TopoJSON reader: enough for these two files, without the dependency.
function decode(topo, objectName) {
    const [sx, sy] = topo.transform.scale;
    const [tx, ty] = topo.transform.translate;

    const arcPoints = index => {
        const reversed = index < 0;
        const arc = topo.arcs[reversed ? ~index : index];
        let x = 0, y = 0;
        const points = [];
        for (const [dx, dy] of arc) {
            x += dx;
            y += dy;
            points.push([x * sx + tx, y * sy + ty]);
        }
        return reversed ? points.reverse() : points;
    };

    const ring = indexes => {
        const points = [];
        indexes.forEach((index, i) => {
            const arc = arcPoints(index);
            points.push(...(i ? arc.slice(1) : arc));
        });
        return points;
    };

    const object = topo.objects[objectName];
    const geometries = object.type === 'GeometryCollection' ? object.geometries : [object];
    return geometries.map(geometry => ({
        name: geometry.properties?.name || '',
        // Outer rings only - holes are invisible at this size.
        rings: (geometry.type === 'Polygon' ? [geometry.arcs] : geometry.arcs).map(poly => ring(poly[0]))
    }));
}

function pointInRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

function boundsOf(places) {
    const lats = places.map(p => p.latitude);
    const lngs = places.map(p => p.longitude);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const centreLat = (minLat + maxLat) / 2;
    // Longitude degrees shrink towards the poles; without this the shape leans.
    const shrink = Math.cos((centreLat * Math.PI) / 180);
    const raw = Math.max(maxLat - minLat, (maxLng - minLng) * shrink) * FIT_PADDING;
    return {
        centreLat,
        centreLng: (minLng + maxLng) / 2,
        shrink,
        span: Math.max(raw, MIN_SPAN)
    };
}

/** Places, ordered so the ones furthest apart come first - the labellable ones. */
function spreadOrder(places) {
    if (places.length <= 1) return places.slice();
    const cx = places.reduce((sum, p) => sum + p.longitude, 0) / places.length;
    const cy = places.reduce((sum, p) => sum + p.latitude, 0) / places.length;
    const far = (a, b) => (a.longitude - b.longitude) ** 2 + (a.latitude - b.latitude) ** 2;

    const rest = places.slice();
    const picked = [rest.splice(
        rest.reduce((best, p, i) =>
            far(p, { longitude: cx, latitude: cy }) > far(rest[best], { longitude: cx, latitude: cy }) ? i : best, 0),
        1)[0]];

    while (rest.length) {
        let bestIndex = 0, bestDistance = -1;
        rest.forEach((p, i) => {
            const nearest = Math.min(...picked.map(q => far(p, q)));
            if (nearest > bestDistance) { bestDistance = nearest; bestIndex = i; }
        });
        picked.push(rest.splice(bestIndex, 1)[0]);
    }
    return picked;
}

const escapeText = text => String(text).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

/**
 * @param places   saved places, needing latitude/longitude
 * @param palette  { land, edge, ring, highlight, label, fallback }
 * @param labelOf  place -> short label (city name), or null for no labels
 * @returns {Promise<{svg: string, wide: boolean}>}
 */
export async function renderPlaceMap(places, palette, labelOf) {
    const pts = places.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
    if (!pts.length) return { svg: '', wide: false };

    const bounds = boundsOf(pts);
    const wide = bounds.span > WORLD_SPAN;
    const shapes = await loadTopology(wide ? 'world' : 'region');

    return wide
        ? { svg: worldStrip(pts, shapes, palette), wide: true }
        : { svg: regionSquare(pts, shapes, bounds, palette, labelOf), wide: false };
}

// ── World: whole planet, countries visited filled ──────────────────────
function worldStrip(pts, countries, palette) {
    // Plate carrée, trimmed top and bottom where nobody records anything.
    const project = (lng, lat) => [((lng + 180) / 360) * 200, ((85 - lat) / 145) * 100];

    const visited = new Set();
    countries.forEach((country, i) => {
        if (pts.some(p => country.rings.some(ring => pointInRing(p.longitude, p.latitude, ring)))) {
            visited.add(i);
        }
    });

    let plain = '', filled = '';
    countries.forEach((country, i) => {
        const isVisited = visited.has(i);
        for (const ring of country.rings) {
            // Small islands are noise at this size, unless they were visited.
            if (ring.length < 14 && !isVisited) continue;
            const d = 'M' + ring.map(([lng, lat]) => project(lng, lat).map(v => v.toFixed(1)).join(' ')).join('L') + 'Z';
            if (d.length < 200 && !isVisited) continue;
            if (isVisited) filled += `<path d="${d}"/>`; else plain += `<path d="${d}"/>`;
        }
    });

    const marks = pts.map(p => {
        const [x, y] = project(p.longitude, p.latitude);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${palette.highlight}" opacity=".3"/>` +
               `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.7" fill="${palette.highlight}" stroke="${palette.ring}" stroke-width=".7"/>`;
    }).join('');

    return `<svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="다녀온 나라">
        <g fill="${palette.land}" stroke="${palette.edge}" stroke-width=".35">${plain}</g>
        <g fill="${palette.highlight}" stroke="${palette.highlight}" stroke-width=".35">${filled}</g>
        ${marks}
    </svg>`;
}

// ── Region: coastline, each place its own mark ─────────────────────────
function regionSquare(pts, shapes, bounds, palette, labelOf) {
    const pad = 8;
    const box = 100 - pad * 2;
    const project = (lng, lat) => [
        pad + box / 2 + (((lng - bounds.centreLng) * bounds.shrink) / bounds.span) * box,
        pad + box / 2 - ((lat - bounds.centreLat) / bounds.span) * box
    ];

    let land = '';
    for (const shape of shapes) {
        for (const ring of shape.rings) {
            const projected = ring.map(([lng, lat]) => project(lng, lat));
            // Skip anything nowhere near the frame, and clip the long tails.
            if (!projected.some(([x, y]) => x > -160 && x < 260 && y > -160 && y < 260)) continue;
            const kept = projected.filter(([x, y]) => x > -400 && x < 500 && y > -400 && y < 500);
            if (kept.length < 3) continue;
            land += `<path d="M${kept.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z"/>`;
        }
    }

    const marks = pts.map(p => {
        const [x, y] = project(p.longitude, p.latitude);
        const r = 1.9 + (p.rating || 0) * 0.62;
        const colour = p.color || palette.fallback;
        return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(r + 1.6).toFixed(2)}" fill="${colour}" opacity=".2"/>` +
               `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${colour}" stroke="${palette.ring}" stroke-width="1"/>`;
    }).join('');

    // Only the places furthest apart get a name, so labels never stack.
    let labels = '';
    if (labelOf) {
        const seen = new Set();
        for (const place of spreadOrder(pts)) {
            if (seen.size >= 3) break;
            const text = labelOf(place);
            if (!text || seen.has(text)) continue;
            seen.add(text);
            const [x, y] = project(place.longitude, place.latitude);
            const toLeft = x > 50;
            labels += `<text x="${(x + (toLeft ? -5.5 : 5.5)).toFixed(1)}" y="${(y + 1.7).toFixed(1)}" ` +
                      `text-anchor="${toLeft ? 'end' : 'start'}">${escapeText(text)}</text>`;
        }
    }

    return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="저장한 장소 위치">
        <defs><clipPath id="place-map-clip"><rect x="0" y="0" width="100" height="100"/></clipPath></defs>
        <g clip-path="url(#place-map-clip)" fill="${palette.land}" stroke="${palette.edge}" stroke-width=".5">${land}</g>
        ${marks}
        <g font-size="4.4" font-weight="600" fill="${palette.label}">${labels}</g>
    </svg>`;
}
