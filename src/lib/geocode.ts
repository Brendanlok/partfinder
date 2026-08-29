// Turns a listing's free-text location ("80331 München", "Musterstadt (Bayern)") into
// coordinates for the map view, via OpenStreetMap's free Nominatim service (no API key).
// Nominatim's usage policy caps us at ~1 request/second and asks that results be cached -
// a town's coordinates never change, so we cache every lookup in localStorage forever and
// only ever hit the network for a location string we've never seen.
export type LatLng = { lat: number; lon: number };

const CACHE_KEY = "partfinder:geocode";
const NEG = "__none__"; // cached "we looked and found nothing" marker

type Cache = Record<string, LatLng | typeof NEG>;

function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCache(c: Cache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // ponytail: storage full/unavailable - geocoding just won't persist between visits
  }
}

// Normalise so "München" and " munchen " share a cache entry.
function key(location: string): string {
  return location.trim().toLowerCase().replace(/\s+/g, " ");
}

let chain: Promise<unknown> = Promise.resolve();

// Serialised + throttled to respect Nominatim's 1 req/sec rule. Concurrent callers all
// queue behind one another; cache hits still resolve immediately without joining the queue.
export function geocode(location: string): Promise<LatLng | null> {
  const k = key(location);
  if (!k) return Promise.resolve(null);

  const cached = readCache()[k];
  if (cached === NEG) return Promise.resolve(null);
  if (cached) return Promise.resolve(cached);

  const run = chain.then(async () => {
    // Re-check the cache - an earlier queued call for the same location may have filled it.
    const c = readCache();
    if (c[k] === NEG) return null;
    if (c[k]) return c[k] as LatLng;

    await new Promise((r) => setTimeout(r, 1100));
    try {
      const url =
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=de&q=" +
        encodeURIComponent(location);
      const res = await fetch(url, { headers: { "Accept-Language": "de" } });
      if (!res.ok) return null;
      const data: Array<{ lat: string; lon: string }> = await res.json();
      const hit = data[0];
      const next = readCache();
      if (!hit) {
        next[k] = NEG;
        writeCache(next);
        return null;
      }
      const ll: LatLng = { lat: Number(hit.lat), lon: Number(hit.lon) };
      next[k] = ll;
      writeCache(next);
      return ll;
    } catch {
      return null; // network error - don't cache, so a later retry can succeed
    }
  });

  chain = run.catch(() => {});
  return run;
}
