import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Map as MapIcon, Navigation2 } from 'lucide-react';
import type { ClusterGroup, GeoPoint, OsrmRouteResult, ShopOrigin } from '../types/order';
import {
  buildTelHref,
  computeBearingDegrees,
  computeClusterZoneGeometry,
  DEFAULT_SHOP_ORIGIN,
  formatShortAddress,
  formatZoneLabel,
  hasOrderCoordinates,
  isValidCoordinate,
} from '../utils/dispatch';

interface DeliveryClusterMapProps {
  clusters: ClusterGroup[];
  shopOrigin?: ShopOrigin;
  shipperGps?: GeoPoint | null;
  osrmRoute?: OsrmRouteResult | null;
  onRequestGps?: () => void;
  gpsLoading?: boolean;
  focusedOrderId?: string | null;
  focusedClusterName?: string;
  onSelectCluster?: (clusterName: string) => void;
  title?: string;
  heightClass?: string;
}

const DEFAULT_CENTER: [number, number] = [21.0285, 105.8542]; // Hà Nội
const DEFAULT_ZOOM = 12;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createClusterPinIcon(
  color: string,
  stopIndex: number,
  isFocused: boolean
): L.DivIcon {
  const size = isFocused ? 36 : 26;
  const fontSize = isFocused ? 12 : 11;
  const label = isFocused ? `#${stopIndex}` : String(stopIndex);
  const ring = isFocused
    ? '0 0 0 3px rgba(255,255,255,0.98), 0 4px 12px rgba(15,23,42,0.38)'
    : '0 0 0 2px #ffffff, 0 2px 5px rgba(15,23,42,0.28)';

  return L.divIcon({
    className: 'shipflow-map-pin',
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${escapeHtml(
      color
    )};color:#ffffff;font-weight:700;font-size:${fontSize}px;line-height:${size}px;text-align:center;box-shadow:${ring};font-family:inherit;">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createZoneLabelIcon(labelText: string, color: string): L.DivIcon {
  return L.divIcon({
    className: 'shipflow-zone-label',
    html: `<div style="display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:9999px;background:rgba(255,255,255,0.95);border:2px dashed ${escapeHtml(
      color
    )};color:#0f172a;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 4px 12px rgba(15,23,42,0.16);transform:translate(-50%,-50%);">${escapeHtml(
      labelText
    )}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

function createShopOriginIcon(): L.DivIcon {
  return L.divIcon({
    className: 'shipflow-shop-origin-pin',
    html: `<div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 3px #ffffff,0 6px 16px rgba(180,83,9,0.45);border:1.5px solid #fef3c7;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
      </svg>
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22],
  });
}

function createRouteArrowIcon(bearingDeg: number, color: string, opacity: number): L.DivIcon {
  const safeOpacity = Math.max(0.2, Math.min(1, opacity));
  return L.divIcon({
    className: 'shipflow-route-arrow',
    html: `<div style="width:20px;height:20px;display:flex;align-items:center;justify-content:center;opacity:${safeOpacity};transform:rotate(${bearingDeg.toFixed(
      1
    )}deg);">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="${escapeHtml(
        color
      )}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
        <polygon points="12 3 20 20 12 15.5 4 20 12 3"></polygon>
      </svg>
    </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function createShipperGpsIcon(): L.DivIcon {
  return L.divIcon({
    className: 'shipflow-shipper-gps-pin',
    html: `<div style="position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center;">
      <div style="position:absolute;inset:0;border-radius:9999px;background:rgba(37,99,235,0.25);border:1.5px solid rgba(37,99,235,0.45);"></div>
      <div style="width:13px;height:13px;border-radius:9999px;background:#2563eb;border:2.5px solid #ffffff;box-shadow:0 2px 6px rgba(37,99,235,0.55);"></div>
    </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

const CLUSTER_DOT_BG: Record<string, string> = {
  '#1d4ed8': 'bg-blue-700',
  '#dc2626': 'bg-red-600',
  '#059669': 'bg-emerald-600',
  '#d97706': 'bg-amber-600',
  '#7c3aed': 'bg-violet-600',
  '#0891b2': 'bg-cyan-600',
  '#be185d': 'bg-pink-700',
  '#4f46e5': 'bg-indigo-600',
};

export function getClusterDotClass(color: string): string {
  return CLUSTER_DOT_BG[color] ?? 'bg-blue-700';
}

export function DeliveryClusterMap({
  clusters,
  shopOrigin = DEFAULT_SHOP_ORIGIN,
  shipperGps = null,
  osrmRoute = null,
  onRequestGps,
  gpsLoading = false,
  focusedOrderId = null,
  focusedClusterName = 'ALL',
  onSelectCluster,
  title = 'Bản đồ cụm tuyến giao hàng',
  heightClass = 'h-[360px] sm:h-[440px] lg:h-[560px]',
}: DeliveryClusterMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const markerByOrderIdRef = useRef<Map<string, L.Marker>>(new Map());

  const hasValidOrigin = isValidCoordinate(shopOrigin?.lat, shopOrigin?.lng);
  const hasValidGps = isValidCoordinate(shipperGps?.lat, shipperGps?.lng);

  const geoStats = useMemo(() => {
    let mappedStops = 0;
    let totalStops = 0;
    for (const cluster of clusters) {
      const activeOrders =
        cluster.pendingOrders.length > 0 ? cluster.pendingOrders : cluster.orders;
      totalStops += activeOrders.length;
      mappedStops += activeOrders.filter(hasOrderCoordinates).length;
    }
    return { mappedStops, totalStops };
  }, [clusters]);

  function flyMapToCluster(targetClusterName: string) {
    const map = mapInstanceRef.current;
    if (!map) return;

    const coords: [number, number][] = [];
    if (hasValidOrigin) {
      coords.push([shopOrigin.lat, shopOrigin.lng]);
    }
    for (const cluster of clusters) {
      if (
        targetClusterName !== 'ALL' &&
        cluster.clusterName !== targetClusterName
      ) {
        continue;
      }
      const activeOrders =
        cluster.pendingOrders.length > 0 ? cluster.pendingOrders : cluster.orders;
      for (const order of activeOrders) {
        if (hasOrderCoordinates(order)) {
          coords.push([order.lat, order.lng]);
        }
      }
    }

    if (coords.length === 1) {
      map.flyTo(coords[0], 15, { duration: 0.75 });
    } else if (coords.length > 1) {
      const bounds = L.latLngBounds(coords);
      map.flyToBounds(bounds, {
        padding: [48, 48],
        maxZoom: 15,
        duration: 0.75,
      });
    } else {
      map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.6 });
    }
  }

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = group;

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Re-render zones, dashed polylines, markers, tooltips, and flyToBounds when clusters or focus change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    markerByOrderIdRef.current.clear();
    const visibleBoundsCoords: [number, number][] = [];
    const focusedBoundsCoords: [number, number][] = [];
    const hasSpecificFocus = focusedClusterName !== 'ALL';
    const hasOsrmStreetRoute = Boolean(osrmRoute && osrmRoute.coordinates.length >= 2);

    if (hasValidGps && shipperGps) {
      const gpsPoint: [number, number] = [shipperGps.lat, shipperGps.lng];
      visibleBoundsCoords.push(gpsPoint);
      if (hasSpecificFocus || hasOsrmStreetRoute) {
        focusedBoundsCoords.push(gpsPoint);
      }

      const gpsMarker = L.marker(gpsPoint, {
        icon: createShipperGpsIcon(),
        zIndexOffset: 1100,
      });
      gpsMarker.bindPopup(
        `<div style="font-family:inherit;line-height:1.4;color:#0f172a;">
          <div style="font-size:11px;font-weight:700;color:#1d4ed8;margin-bottom:2px;">📍 VỊ TRÍ GPS CỦA BẠN</div>
          <div style="font-size:12px;color:#334155;">${shipperGps.lat.toFixed(5)}, ${shipperGps.lng.toFixed(5)}</div>
        </div>`
      );
      gpsMarker.bindTooltip('📍 Vị trí của bạn', {
        permanent: true,
        direction: 'top',
        offset: [0, -14],
        className: 'shipflow-stop-tooltip',
      });
      gpsMarker.addTo(layerGroup);
    }

    if (hasValidOrigin) {
      const originPoint: [number, number] = [shopOrigin.lat, shopOrigin.lng];
      visibleBoundsCoords.push(originPoint);
      if (hasSpecificFocus && !hasValidGps) {
        focusedBoundsCoords.push(originPoint);
      }

      const shopMarker = L.marker(originPoint, {
        icon: createShopOriginIcon(),
        zIndexOffset: 1000,
      });

      const safeOriginLabel = escapeHtml(shopOrigin.label || 'Kho xuất phát của Shop');
      const safeOriginAddress = escapeHtml(shopOrigin.address);
      shopMarker.bindPopup(
        `<div style="min-width:200px;font-family:inherit;line-height:1.45;color:#0f172a;">
          <div style="font-size:11px;font-weight:700;color:#b45309;margin-bottom:4px;">★ ĐIỂM XUẤT PHÁT (KHO / QUÁN)</div>
          <div style="font-size:14px;font-weight:700;margin-bottom:3px;">${safeOriginLabel}</div>
          <div style="font-size:12px;color:#334155;">${safeOriginAddress}</div>
        </div>`
      );
      shopMarker.bindTooltip(`★ Kho Shop · ${escapeHtml(formatShortAddress(shopOrigin.address, 26))}`, {
        permanent: !hasSpecificFocus && !hasOsrmStreetRoute,
        direction: 'bottom',
        offset: [0, 18],
        className: 'shipflow-stop-tooltip',
      });
      shopMarker.addTo(layerGroup);
    }

    // Real street-following OSRM polyline (drawn prominently with white casing + directional arrows)
    if (hasOsrmStreetRoute && osrmRoute) {
      visibleBoundsCoords.push(...osrmRoute.coordinates);
      focusedBoundsCoords.push(...osrmRoute.coordinates);

      L.polyline(osrmRoute.coordinates, {
        color: '#ffffff',
        weight: 8,
        opacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(layerGroup);

      L.polyline(osrmRoute.coordinates, {
        color: '#1d4ed8',
        weight: 5,
        opacity: 0.95,
        dashArray: osrmRoute.isFallback ? '8, 7' : undefined,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(layerGroup);

      // Place up to 6 directional arrows evenly along the OSRM geometry
      const coords = osrmRoute.coordinates;
      const step = Math.max(1, Math.floor(coords.length / 6));
      for (let i = 0; i < coords.length - 1; i += step) {
        const [latA, lngA] = coords[i];
        const [latB, lngB] = coords[i + 1];
        if (Math.hypot(latB - latA, lngB - lngA) < 0.00015) continue;
        const bearing = computeBearingDegrees(latA, lngA, latB, lngB);
        L.marker([(latA + latB) / 2, (lngA + lngB) / 2], {
          interactive: false,
          zIndexOffset: 820,
          icon: createRouteArrowIcon(bearing, '#1d4ed8', 1),
        }).addTo(layerGroup);
      }
    }

    for (const cluster of clusters) {
      const isFocusedCluster =
        hasSpecificFocus && cluster.clusterName === focusedClusterName;
      const isDimmed =
        hasSpecificFocus && cluster.clusterName !== focusedClusterName;

      const activeOrders =
        cluster.pendingOrders.length > 0 ? cluster.pendingOrders : cluster.orders;
      const geoStops = activeOrders.filter(hasOrderCoordinates);

      if (geoStops.length === 0) continue;

      const latLngs: [number, number][] = geoStops.map((o) => [o.lat, o.lng]);
      visibleBoundsCoords.push(...latLngs);
      if (isFocusedCluster) {
        focusedBoundsCoords.push(...latLngs);
      }

      // 1. Enclosing zone (Convex Hull polygon or circle) with semi-transparent fill and dashed border
      const zoneGeom = computeClusterZoneGeometry(geoStops);
      if (zoneGeom) {
        const zoneStyle: L.PathOptions = {
          color: cluster.color,
          fillColor: cluster.color,
          fillOpacity: isFocusedCluster ? 0.16 : isDimmed ? 0.03 : 0.08,
          opacity: isFocusedCluster ? 0.95 : isDimmed ? 0.25 : 0.55,
          weight: isFocusedCluster ? 2.5 : 1.5,
          dashArray: '8, 6',
          interactive: true,
        };

        const zoneLayer = zoneGeom.polygonCoords
          ? L.polygon(zoneGeom.polygonCoords, zoneStyle)
          : L.circle(zoneGeom.center, {
              ...zoneStyle,
              radius: zoneGeom.radiusMeters,
            });

        zoneLayer.on('click', () => {
          onSelectCluster?.(cluster.clusterName);
        });
        zoneLayer.addTo(layerGroup);

        // Display centroid cluster label inside the enclosing zone when focused
        if (isFocusedCluster) {
          const baseZoneText = formatZoneLabel(cluster.clusterName, activeOrders.length);
          const zoneText =
            cluster.totalDistanceKm > 0
              ? `${baseZoneText} · ~${cluster.totalDistanceKm.toFixed(1)} km`
              : baseZoneText;
          L.marker(zoneGeom.center, {
            interactive: false,
            zIndexOffset: 900,
            icon: createZoneLabelIcon(zoneText, cluster.color),
          }).addTo(layerGroup);
        }
      }

      // 2. Route polyline from Shop -> #1 -> #2 -> #3 (suppressed when OSRM street route already draws the active route)
      if (!hasOsrmStreetRoute) {
        const routeChain: [number, number][] = hasValidOrigin
          ? [[shopOrigin.lat, shopOrigin.lng], ...latLngs]
          : latLngs;

        if (routeChain.length >= 2) {
          L.polyline(routeChain, {
            color: cluster.color,
            weight: isFocusedCluster ? 4.5 : 3,
            opacity: isDimmed ? 0.2 : 0.9,
            dashArray: isFocusedCluster ? undefined : '8, 7',
            lineJoin: 'round',
          }).addTo(layerGroup);

          if (!isDimmed) {
            for (let segIdx = 0; segIdx < routeChain.length - 1; segIdx++) {
              const [latA, lngA] = routeChain[segIdx];
              const [latB, lngB] = routeChain[segIdx + 1];
              const segDistKm = Math.hypot(latB - latA, lngB - lngA);
              if (segDistKm < 0.0005) continue;

              const midLat = (latA + latB) / 2;
              const midLng = (lngA + lngB) / 2;
              const bearing = computeBearingDegrees(latA, lngA, latB, lngB);

              L.marker([midLat, midLng], {
                interactive: false,
                zIndexOffset: isFocusedCluster ? 750 : 250,
                icon: createRouteArrowIcon(bearing, cluster.color, isFocusedCluster ? 1 : 0.8),
              }).addTo(layerGroup);
            }
          }
        }
      }

      // 3. Markers for each delivery stop (focused cluster gets bigger #1, #2 pins + permanent tooltips)
      geoStops.forEach((order, idx) => {
        const marker = L.marker([order.lat, order.lng], {
          icon: createClusterPinIcon(cluster.color, idx + 1, isFocusedCluster),
          opacity: isDimmed ? 0.35 : 1,
          zIndexOffset: isFocusedCluster ? 600 + idx : 100,
        });

        const safeName = escapeHtml(order.ten_khach);
        const safePhone = escapeHtml(order.sdt || '');
        const safeTelHref = escapeHtml(buildTelHref(order.sdt || ''));
        const safeAddr = escapeHtml(order.dia_chi);
        const safeShortAddr = escapeHtml(formatShortAddress(order.dia_chi));
        const safeNote = escapeHtml(order.ghi_chu || '');
        const safeCluster = escapeHtml(cluster.clusterName);

        const popupHtml = `
          <div style="min-width:210px;max-width:270px;font-family:inherit;line-height:1.45;color:#0f172a;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:9999px;background:${escapeHtml(
                cluster.color
              )};flex-shrink:0;"></span>
              <span style="font-size:11px;font-weight:700;color:#475569;">${safeCluster} · Điểm #${
                idx + 1
              }</span>
            </div>
            <div style="font-size:14px;font-weight:700;margin-bottom:4px;">${safeName}</div>
            ${
              safePhone
                ? `<div style="font-size:12px;margin-bottom:4px;"><strong>SĐT:</strong> <a href="${safeTelHref}" style="color:#1d4ed8;font-weight:600;text-decoration:none;">${safePhone}</a></div>`
                : ''
            }
            <div style="font-size:12px;color:#334155;margin-bottom:${safeNote ? '6px' : '0'};">
              <strong>Địa chỉ:</strong> ${safeAddr}
            </div>
            ${
              safeNote
                ? `<div style="font-size:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:4px 8px;color:#78350f;"><strong>Ghi chú:</strong> ${safeNote}</div>`
                : ''
            }
          </div>
        `;

        marker.bindPopup(popupHtml, { maxWidth: 290 });

        if (isFocusedCluster) {
          marker.bindTooltip(
            `<strong>#${idx + 1} ${safeName}</strong> · ${safeShortAddr}`,
            {
              permanent: true,
              direction: 'top',
              offset: [0, -20],
              className: 'shipflow-stop-tooltip',
            }
          );
        }

        marker.on('click', () => {
          if (!isFocusedCluster) {
            onSelectCluster?.(cluster.clusterName);
          }
        });

        marker.addTo(layerGroup);
        markerByOrderIdRef.current.set(order.id, marker);
      });
    }

    // Smoothly flyToBounds into the focused cluster or all visible clusters
    const targetCoords =
      focusedBoundsCoords.length > 0 ? focusedBoundsCoords : visibleBoundsCoords;
    if (targetCoords.length === 1) {
      map.flyTo(targetCoords[0], 15, { duration: 0.75 });
    } else if (targetCoords.length > 1) {
      map.flyToBounds(L.latLngBounds(targetCoords), {
        padding: [48, 48],
        maxZoom: 15,
        duration: 0.75,
      });
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }

    map.invalidateSize();
  }, [
    clusters,
    focusedClusterName,
    hasValidGps,
    hasValidOrigin,
    onSelectCluster,
    osrmRoute,
    shipperGps,
    shopOrigin,
  ]);

  // Focus specific stop when user clicks a leg in Turn-by-Turn panel
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !focusedOrderId) return;
    const targetMarker = markerByOrderIdRef.current.get(focusedOrderId);
    if (targetMarker) {
      const pos = targetMarker.getLatLng();
      map.flyTo(pos, 16, { duration: 0.6 });
      targetMarker.openPopup();
    }
  }, [focusedOrderId]);

  return (
    <section
      aria-label={title}
      className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col"
    >
      <div className="px-4 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MapIcon className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
          <h2 className="text-sm font-bold text-slate-900 truncate">{title}</h2>
          <span className="text-xs font-medium text-slate-500 tabular-nums whitespace-nowrap">
            ({geoStats.mappedStops}/{geoStats.totalStops} điểm)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {onRequestGps && (
            <button
              type="button"
              disabled={gpsLoading}
              onClick={onRequestGps}
              className={`min-h-[32px] px-2.5 py-1 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                hasValidGps
                  ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <Navigation2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{gpsLoading ? 'Đang định vị...' : 'Định vị GPS'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              onSelectCluster?.('ALL');
              flyMapToCluster('ALL');
            }}
            className={`min-h-[32px] px-3 py-1 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
              focusedClusterName !== 'ALL'
                ? 'bg-blue-700 text-white hover:bg-blue-800'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <LocateFixed className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Xem tất cả khu vực</span>
          </button>
        </div>
      </div>

      {/* Cluster Color Legend */}
      {clusters.length > 0 && (
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-1.5">
          {clusters.map((cluster) => {
            const isActive =
              focusedClusterName === 'ALL' || focusedClusterName === cluster.clusterName;
            const isSelected = focusedClusterName === cluster.clusterName;
            const count =
              cluster.pendingOrders.length > 0
                ? cluster.pendingOrders.length
                : cluster.orders.length;

            return (
              <button
                key={cluster.clusterName}
                type="button"
                onClick={() => {
                  if (onSelectCluster) {
                    const next =
                      focusedClusterName === cluster.clusterName
                        ? 'ALL'
                        : cluster.clusterName;
                    onSelectCluster(next);
                    flyMapToCluster(next);
                  } else {
                    flyMapToCluster(cluster.clusterName);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50 border-blue-700 text-blue-900 ring-1 ring-blue-700'
                    : isActive
                      ? 'bg-white border-slate-300 text-slate-800 hover:border-slate-400'
                      : 'bg-slate-100 border-slate-200 text-slate-500 opacity-50 hover:opacity-80'
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${getClusterDotClass(
                    cluster.color
                  )}`}
                  aria-hidden="true"
                />
                <span className="truncate max-w-[160px]">{cluster.clusterName}</span>
                <span className="text-slate-400 tabular-nums">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Map Container (isolated stacking context so Leaflet panes stay below sticky headers & modals) */}
      <div className={`relative isolate z-0 w-full ${heightClass}`}>
        <div
          ref={mapContainerRef}
          data-testid="delivery-leaflet-map"
          className="w-full h-full bg-slate-100"
        />

        {focusedClusterName !== 'ALL' && (
          <div className="absolute top-3 right-3 z-[450]">
            <button
              type="button"
              onClick={() => {
                onSelectCluster?.('ALL');
                flyMapToCluster('ALL');
              }}
              className="min-h-[34px] px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white/95 hover:bg-white border border-slate-300 rounded-lg shadow-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LocateFixed className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
              <span>Xem tất cả khu vực</span>
            </button>
          </div>
        )}

        {geoStats.totalStops > 0 && geoStats.mappedStops === 0 && (
          <div className="absolute bottom-3 left-3 right-3 z-[450] pointer-events-none">
            <div className="bg-white/95 backdrop-blur-xs border border-amber-200 rounded-xl px-3.5 py-2.5 text-xs text-amber-900 shadow-sm">
              Các đơn hiện tại chưa có tọa độ GPS (lat/lng). Hãy dán tin nhắn Zalo mới hoặc cập nhật địa chỉ để hiển thị ghim trên bản đồ.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
