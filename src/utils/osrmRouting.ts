import type {
  DeliveryOrder,
  GeoPoint,
  OsrmRouteResult,
  RouteLegInstruction,
} from '../types/order';
import {
  formatShortAddress,
  hasOrderCoordinates,
  haversineDistanceKm,
  isValidCoordinate,
} from './dispatch';

export interface RouteStopMeta {
  orderId?: string;
  customerName: string;
  address: string;
  lat: number;
  lng: number;
}

export function buildOsrmDrivingUrl(waypoints: GeoPoint[]): string {
  const valid = waypoints.filter((pt) => isValidCoordinate(pt.lat, pt.lng));
  const coordStr = valid.map((pt) => `${pt.lng.toFixed(6)},${pt.lat.toFixed(6)}`).join(';');
  return `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=true`;
}

export function convertGeoJsonCoordsToLeaflet(
  coords: Array<[number, number]> | unknown
): [number, number][] {
  if (!Array.isArray(coords)) return [];
  const result: [number, number][] = [];
  for (const pt of coords) {
    if (
      Array.isArray(pt) &&
      pt.length >= 2 &&
      typeof pt[0] === 'number' &&
      typeof pt[1] === 'number' &&
      Number.isFinite(pt[0]) &&
      Number.isFinite(pt[1])
    ) {
      // GeoJSON is [lng, lat], Leaflet expects [lat, lng]
      result.push([pt[1], pt[0]]);
    }
  }
  return result;
}

export function buildFallbackRoute(
  startPoint: GeoPoint,
  stops: RouteStopMeta[]
): OsrmRouteResult {
  const coordinates: [number, number][] = [[startPoint.lat, startPoint.lng]];
  const legs: RouteLegInstruction[] = [];
  let prevLat = startPoint.lat;
  let prevLng = startPoint.lng;
  let totalDist = 0;
  let totalMin = 0;

  stops.forEach((stop, idx) => {
    coordinates.push([stop.lat, stop.lng]);
    // Approximate Hanoi urban road distance factor ~1.25x straight line, ~22 km/h avg speed
    const airKm = haversineDistanceKm(prevLat, prevLng, stop.lat, stop.lng);
    const roadKm = Number((airKm * 1.25).toFixed(1));
    const mins = Math.max(2, Math.round((roadKm / 22) * 60));
    totalDist += roadKm;
    totalMin += mins;

    legs.push({
      legIndex: idx + 1,
      orderId: stop.orderId,
      customerName: stop.customerName,
      address: formatShortAddress(stop.address, 44),
      distanceKm: roadKm,
      durationMinutes: mins,
    });

    prevLat = stop.lat;
    prevLng = stop.lng;
  });

  return {
    coordinates,
    legs,
    totalDistanceKm: Number(totalDist.toFixed(1)),
    totalDurationMinutes: totalMin,
    isFallback: true,
  };
}

interface RawOsrmStep {
  name?: string;
}

interface RawOsrmLeg {
  distance?: number;
  duration?: number;
  summary?: string;
  steps?: RawOsrmStep[];
}

interface RawOsrmPayload {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: {
      coordinates?: Array<[number, number]>;
    };
    legs?: RawOsrmLeg[];
  }>;
}

export function parseOsrmRouteResponse(
  payload: unknown,
  startPoint: GeoPoint,
  stops: RouteStopMeta[]
): OsrmRouteResult | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = payload as RawOsrmPayload;
  if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
    return null;
  }

  const route = data.routes[0];
  const coordinates = convertGeoJsonCoordsToLeaflet(route.geometry?.coordinates);
  if (coordinates.length < 2) {
    return null;
  }

  const rawLegs = Array.isArray(route.legs) ? route.legs : [];
  const legs: RouteLegInstruction[] = stops.map((stop, idx) => {
    const leg = rawLegs[idx];
    const distMeters = typeof leg?.distance === 'number' ? leg.distance : 0;
    const durSec = typeof leg?.duration === 'number' ? leg.duration : 0;
    const distanceKm = Number((distMeters / 1000).toFixed(1));
    const durationMinutes = Math.max(1, Math.round(durSec / 60));

    const stepNames = Array.isArray(leg?.steps)
      ? leg.steps
          .map((s) => (typeof s.name === 'string' ? s.name.trim() : ''))
          .filter(Boolean)
      : [];
    const uniqueStreets = Array.from(new Set(stepNames)).slice(0, 3);
    const streetSummary =
      uniqueStreets.length > 0
        ? uniqueStreets.join(' → ')
        : typeof leg?.summary === 'string' && leg.summary.trim()
          ? leg.summary.trim()
          : undefined;

    return {
      legIndex: idx + 1,
      orderId: stop.orderId,
      customerName: stop.customerName,
      address: formatShortAddress(stop.address, 44),
      distanceKm,
      durationMinutes,
      streetSummary,
    };
  });

  const totalDistanceKm =
    typeof route.distance === 'number'
      ? Number((route.distance / 1000).toFixed(1))
      : Number(legs.reduce((s, l) => s + l.distanceKm, 0).toFixed(1));
  const totalDurationMinutes =
    typeof route.duration === 'number'
      ? Math.max(1, Math.round(route.duration / 60))
      : legs.reduce((s, l) => s + l.durationMinutes, 0);

  return {
    coordinates: coordinates.length > 0 ? coordinates : [[startPoint.lat, startPoint.lng]],
    legs,
    totalDistanceKm,
    totalDurationMinutes,
    isFallback: false,
  };
}

const osrmCache = new Map<string, OsrmRouteResult>();

export async function fetchOsrmDrivingRoute(
  startPoint: GeoPoint,
  orders: DeliveryOrder[],
  signal?: AbortSignal
): Promise<OsrmRouteResult | null> {
  if (!isValidCoordinate(startPoint.lat, startPoint.lng)) return null;
  const geoOrders = orders.filter(hasOrderCoordinates);
  if (geoOrders.length === 0) return null;

  const stops: RouteStopMeta[] = geoOrders.map((o) => ({
    orderId: o.id,
    customerName: o.ten_khach,
    address: o.dia_chi,
    lat: o.lat,
    lng: o.lng,
  }));

  const waypoints: GeoPoint[] = [
    startPoint,
    ...stops.map((s) => ({ lat: s.lat, lng: s.lng })),
  ];
  const url = buildOsrmDrivingUrl(waypoints);
  const cacheKey = `${url}|${stops.map((s) => s.orderId ?? s.customerName).join(',')}`;
  const cached = osrmCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 5500);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.ok) {
      const json = await res.json();
      const parsed = parseOsrmRouteResponse(json, startPoint, stops);
      if (parsed) {
        if (osrmCache.size > 40) {
          osrmCache.clear();
        }
        osrmCache.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch {
    // Gracefully fallback below on network/timeout
  } finally {
    clearTimeout(timeoutHandle);
    signal?.removeEventListener('abort', forwardAbort);
  }

  return buildFallbackRoute(startPoint, stops);
}
