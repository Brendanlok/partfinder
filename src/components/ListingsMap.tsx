"use client";

// Map view for the results / saved list. Loaded only via next/dynamic with ssr:false
// (Leaflet touches `window` on import and the app is a static export), so this file never
// runs on the server. Geocoding is best-effort: listings whose location can't be resolved
// just don't get a pin, and the count of those is shown so the map never silently hides cars.
import { useEffect, useRef, useState } from "react";
import type * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { geocode, type LatLng } from "@/lib/geocode";

export type MapListing = {
  url: string;
  title: string;
  location?: string;
  price?: string;
};

type Props = {
  listings: MapListing[];
  fmtPrice: (p: string) => string;
  labels: { geocoding: string; noneOnMap: (n: number) => string; openListing: string };
};

export default function ListingsMap({ listings, fmtPrice, labels }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [pending, setPending] = useState(true);
  const [missing, setMissing] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};

    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !mapEl.current) return;

      // Germany, roughly centred, until pins arrive.
      const map = leaflet.map(mapEl.current, { scrollWheelZoom: false }).setView([51.1, 10.4], 5);
      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 18,
        })
        .addTo(map);
      const layer = leaflet.layerGroup().addTo(map);
      mapRef.current = map;
      layerRef.current = layer;

      // Leaflet freezes the map's pixel size at creation time. If it mounts while the
      // container is 0x0 (a background tab, a just-toggled panel), only one tile loads
      // and never recovers - so re-measure once now and on every later size change.
      const ro = new ResizeObserver(() => map.invalidateSize());
      ro.observe(mapEl.current);
      setTimeout(() => !cancelled && map.invalidateSize(), 200);

      cleanup = () => {
        ro.disconnect();
        map.remove();
        mapRef.current = null;
        layerRef.current = null;
      };

      // A plain CSS pin via divIcon - sidesteps Leaflet's default image-marker paths,
      // which don't survive the static-export bundling, and needs no image assets.
      const pin = leaflet.divIcon({
        className: "",
        html: '<span style="display:block;width:14px;height:14px;border-radius:50%;background:#000;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4)"></span>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        popupAnchor: [0, -8],
      });

      const withLoc = listings.filter((l) => l.location && l.location.trim());
      setMissing(listings.length - withLoc.length);

      const points: { ll: LatLng; l: MapListing }[] = [];
      for (const l of withLoc) {
        const ll = await geocode(l.location as string);
        if (cancelled) return;
        if (ll) {
          points.push({ ll, l });
          const priceLine = l.price ? `<div>${escapeHtml(fmtPrice(l.price))}</div>` : "";
          leaflet
            .marker([ll.lat, ll.lon], { icon: pin })
            .addTo(layer)
            .bindPopup(
              `<strong>${escapeHtml(l.title)}</strong>${priceLine}` +
                `<div><a href="${escapeAttr(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                  labels.openListing
                )}</a></div>`
            );
        } else {
          setMissing((m) => m + 1);
        }
      }

      if (!cancelled) {
        if (points.length) {
          map.invalidateSize();
          map.fitBounds(
            leaflet.latLngBounds(points.map((p) => [p.ll.lat, p.ll.lon] as [number, number])),
            { padding: [40, 40], maxZoom: 12 }
          );
        }
        setPending(false);
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
    // Rebuild markers whenever the listing set changes (filters, sort, saved vs results).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings.map((l) => l.url).join("|")]);

  return (
    <div className="mt-4">
      <div
        ref={mapEl}
        className="h-[60vh] w-full overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700"
      />
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        {pending ? labels.geocoding : missing > 0 ? labels.noneOnMap(missing) : ""}
      </p>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
