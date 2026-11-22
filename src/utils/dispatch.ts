import type {
  ClusterGroup,
  DeliveryOrder,
  DeliveryState,
  DispatchConfig,
  ExtractedOrderInput,
  GeoPoint,
  OrderStats,
  OrderStatus,
  ShopOrigin,
  UserRole,
} from '../types/order';

export const ADMIN_PRIMARY_EMAIL = 'admin@shipper.vn';
export const ADMIN_OWNER_PREFIX = 'thuong@';

export const DEFAULT_SHOP_ORIGIN: ShopOrigin = {
  label: 'Ngã Tư Sở (Mặc định)',
  address: 'Ngã Tư Sở, Đống Đa, Hà Nội',
  lat: 21.0031,
  lng: 105.8201,
};

export const HANOI_SHOP_PRESETS: ShopOrigin[] = [
  DEFAULT_SHOP_ORIGIN,
  {
    label: 'Cầu Giấy',
    address: 'Ngã tư Xuân Thủy - Cầu Giấy, Cầu Giấy, Hà Nội',
    lat: 21.0367,
    lng: 105.7826,
  },
  {
    label: 'Hoàn Kiếm',
    address: 'Hồ Hoàn Kiếm, Hoàn Kiếm, Hà Nội',
    lat: 21.0285,
    lng: 105.8542,
  },
  {
    label: 'Hai Bà Trưng',
    address: 'Ngã tư Bạch Mai - Đại Cồ Việt, Hai Bà Trưng, Hà Nội',
    lat: 21.0076,
    lng: 105.8512,
  },
  {
    label: 'Mỹ Đình',
    address: 'Khu đô thị Mỹ Đình, Nam Từ Liêm, Hà Nội',
    lat: 21.0282,
    lng: 105.7663,
  },
  {
    label: 'Linh Đàm',
    address: 'Bán đảo Linh Đàm, Hoàng Mai, Hà Nội',
    lat: 20.9638,
    lng: 105.8265,
  },
];

export const DEFAULT_MAX_ORDERS_PER_SHIPPER = 5;
export const DEFAULT_CLUSTER_RADIUS_KM = 3.0;

export const DEFAULT_DISPATCH_CONFIG: DispatchConfig = {
  shopOrigin: DEFAULT_SHOP_ORIGIN,
  maxOrdersPerShipper: DEFAULT_MAX_ORDERS_PER_SHIPPER,
  radiusKm: DEFAULT_CLUSTER_RADIUS_KM,
};

export function resolveRoleFromEmailAndProfile(
  email: string | null | undefined,
  profileRole?: string | null
): UserRole {
  const normalizedEmail = (email ?? '').trim().toLowerCase();
  const normalizedRole =
    typeof profileRole === 'string' ? profileRole.trim().toLowerCase() : '';

  if (
    normalizedEmail === ADMIN_PRIMARY_EMAIL ||
    normalizedEmail.startsWith(ADMIN_OWNER_PREFIX)
  ) {
    return 'admin';
  }
  if (normalizedRole === 'admin') {
    return 'admin';
  }
  if (normalizedRole === 'shipper') {
    return 'shipper';
  }
  if (normalizedEmail.includes('admin')) {
    return 'admin';
  }
  return 'shipper';
}

export function deriveDisplayNameFromEmail(email: string | null | undefined): string {
  const clean = (email ?? '').trim();
  if (!clean) return 'Người dùng';
  const prefix = clean.split('@')[0] ?? clean;
  return prefix
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function normalizeOrderStatus(rawStatus: unknown): OrderStatus {
  const s = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';
  if (s === 'completed' || s === 'done' || s === 'delivered' || s === 'da_giao') {
    return 'completed';
  }
  return 'pending';
}

export function normalizeDeliveryState(
  rawState: unknown,
  status: OrderStatus,
  shipperEmail?: string,
  shipperAssigned?: string
): DeliveryState {
  if (status === 'completed') {
    return 'done';
  }
  const s = typeof rawState === 'string' ? rawState.trim().toLowerCase() : '';
  if (s === 'done' || s === 'completed' || s === 'delivered') {
    return 'done';
  }
  if (s === 'delivering' || s === 'claimed' || s === 'in_progress') {
    return 'delivering';
  }
  if (s === 'available') {
    return (shipperEmail || '').trim() || (shipperAssigned || '').trim()
      ? 'delivering'
      : 'available';
  }
  return (shipperEmail || '').trim() || (shipperAssigned || '').trim()
    ? 'delivering'
    : 'available';
}

export function getOrderClaimedShipper(
  order: Pick<DeliveryOrder, 'shipperEmail' | 'shipper_assigned'>
): string {
  return (order.shipperEmail || order.shipper_assigned || '').trim();
}

export const CLUSTER_COLORS = [
  '#1d4ed8', // Xanh dương
  '#dc2626', // Đỏ
  '#059669', // Xanh lá
  '#d97706', // Cam hổ phách
  '#7c3aed', // Tím
  '#0891b2', // Xanh ngọc
  '#be185d', // Hồng đậm
  '#4f46e5', // Chàm
] as const;

export function isValidCoordinate(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

export function isValidVietnamCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    isValidCoordinate(lat, lng) &&
    lat >= 8.0 &&
    lat <= 23.6 &&
    lng >= 102.0 &&
    lng <= 109.6
  );
}

export function hasOrderCoordinates<T extends Pick<DeliveryOrder, 'lat' | 'lng'>>(
  order: T
): order is T & { lat: number; lng: number } {
  return isValidCoordinate(order.lat, order.lng);
}

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function computeBearingDegrees(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lng2 - lng1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = toDeg(Math.atan2(y, x));
  return (theta + 360) % 360;
}

export function bearingDifferenceDegrees(b1: number, b2: number): number {
  const diff = Math.abs(b1 - b2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function describeCompassDirectionVi(bearingDeg: number): string {
  const norm = ((bearingDeg % 360) + 360) % 360;
  if (norm >= 337.5 || norm < 22.5) return 'Hướng Bắc';
  if (norm < 67.5) return 'Đông Bắc';
  if (norm < 112.5) return 'Hướng Đông';
  if (norm < 157.5) return 'Đông Nam';
  if (norm < 202.5) return 'Hướng Nam';
  if (norm < 247.5) return 'Tây Nam';
  if (norm < 292.5) return 'Hướng Tây';
  return 'Tây Bắc';
}

export function orderStopsNearestNeighbor(
  orders: DeliveryOrder[],
  shopOrigin?: Pick<ShopOrigin, 'lat' | 'lng'>
): DeliveryOrder[] {
  if (orders.length <= 1) return orders;
  const withCoords = orders.filter(hasOrderCoordinates);
  const withoutCoords = orders.filter((o) => !hasOrderCoordinates(o));
  if (withCoords.length <= 1) return [...withCoords, ...withoutCoords];

  const remaining = [...withCoords];
  const ordered: Array<DeliveryOrder & { lat: number; lng: number }> = [];

  if (shopOrigin && isValidCoordinate(shopOrigin.lat, shopOrigin.lng)) {
    // Pick stop #1 closest to Shop Origin
    let firstIdx = 0;
    let bestShopDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const dist = haversineDistanceKm(
        shopOrigin.lat,
        shopOrigin.lng,
        candidate.lat,
        candidate.lng
      );
      if (dist < bestShopDist) {
        bestShopDist = dist;
        firstIdx = i;
      }
    }
    ordered.push(remaining.splice(firstIdx, 1)[0]);
  } else {
    ordered.push(remaining.shift()!);
  }

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const dist = haversineDistanceKm(last.lat, last.lng, candidate.lat, candidate.lng);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }

  return [...ordered, ...withoutCoords];
}

export function computeRouteDistanceKm(
  orders: DeliveryOrder[],
  shopOrigin?: Pick<ShopOrigin, 'lat' | 'lng'>
): number {
  const geoStops = orders.filter(hasOrderCoordinates);
  if (geoStops.length === 0) return 0;

  let totalKm = 0;
  let prevLat =
    shopOrigin && isValidCoordinate(shopOrigin.lat, shopOrigin.lng)
      ? shopOrigin.lat
      : geoStops[0].lat;
  let prevLng =
    shopOrigin && isValidCoordinate(shopOrigin.lat, shopOrigin.lng)
      ? shopOrigin.lng
      : geoStops[0].lng;

  const startIndex =
    shopOrigin && isValidCoordinate(shopOrigin.lat, shopOrigin.lng) ? 0 : 1;

  for (let i = startIndex; i < geoStops.length; i++) {
    const stop = geoStops[i];
    totalKm += haversineDistanceKm(prevLat, prevLng, stop.lat, stop.lng);
    prevLat = stop.lat;
    prevLng = stop.lng;
  }

  return Number(totalKm.toFixed(1));
}

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface ClusterZoneGeometry {
  center: [number, number];
  radiusMeters: number;
  polygonCoords: [number, number][] | null;
  pointCount: number;
}

export function computeConvexHull(points: LatLngPoint[]): LatLngPoint[] {
  if (points.length <= 2) return points;
  const sorted = [...points].sort((a, b) =>
    a.lng !== b.lng ? a.lng - b.lng : a.lat - b.lat
  );

  const cross = (o: LatLngPoint, a: LatLngPoint, b: LatLngPoint) =>
    (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);

  const lower: LatLngPoint[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: LatLngPoint[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

export function computeClusterZoneGeometry(
  orders: DeliveryOrder[]
): ClusterZoneGeometry | null {
  const geoOrders = orders.filter(hasOrderCoordinates);
  if (geoOrders.length === 0) return null;

  const avgLat = geoOrders.reduce((sum, o) => sum + o.lat, 0) / geoOrders.length;
  const avgLng = geoOrders.reduce((sum, o) => sum + o.lng, 0) / geoOrders.length;

  let maxDistMeters = 0;
  for (const o of geoOrders) {
    const distMeters = haversineDistanceKm(avgLat, avgLng, o.lat, o.lng) * 1000;
    if (distMeters > maxDistMeters) {
      maxDistMeters = distMeters;
    }
  }

  const radiusMeters = Math.max(420, Math.round(maxDistMeters + 260));

  if (geoOrders.length < 3) {
    return {
      center: [avgLat, avgLng],
      radiusMeters,
      polygonCoords: null,
      pointCount: geoOrders.length,
    };
  }

  const hull = computeConvexHull(geoOrders.map((o) => ({ lat: o.lat, lng: o.lng })));
  if (hull.length < 3) {
    return {
      center: [avgLat, avgLng],
      radiusMeters,
      polygonCoords: null,
      pointCount: geoOrders.length,
    };
  }

  // Expand each hull vertex outward from centroid by ~220m (approx 0.002 deg) so markers stay inside
  const expandedCoords: [number, number][] = hull.map((pt) => {
    const dLat = pt.lat - avgLat;
    const dLng = pt.lng - avgLng;
    const mag = Math.hypot(dLat, dLng);
    if (mag < 1e-6) {
      return [pt.lat, pt.lng];
    }
    const padDeg = 0.0022;
    return [pt.lat + (dLat / mag) * padDeg, pt.lng + (dLng / mag) * padDeg];
  });

  return {
    center: [avgLat, avgLng],
    radiusMeters,
    polygonCoords: expandedCoords,
    pointCount: geoOrders.length,
  };
}

export function formatShortAddress(address: string, maxLen = 34): string {
  const clean = (address || '').trim();
  if (!clean) return 'Chưa rõ địa chỉ';
  const primaryPart = clean.split(',')[0]?.trim() || clean;
  if (primaryPart.length <= maxLen) return primaryPart;
  return `${primaryPart.slice(0, maxLen - 1).trimEnd()}…`;
}

export function formatZoneLabel(clusterName: string, orderCount: number): string {
  const cleanName = (clusterName || 'Khu vực chung')
    .trim()
    .replace(/^cụm\s+/i, '');
  if (/\(\d+\s*đơn\)/i.test(cleanName)) {
    return cleanName;
  }
  return `Khu vực: ${cleanName} (${orderCount} đơn)`;
}

export function buildTelHref(phone: string): string {
  const cleaned = (phone ?? '').replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : '#';
}

function formatStopForGoogleMaps(order: DeliveryOrder): string {
  const addr = (order.dia_chi || '').trim();
  if (addr && addr !== 'Chưa rõ địa chỉ') {
    const lower = addr.toLowerCase();
    if (!lower.includes('hà nội') && !lower.includes('ha noi')) {
      return `${addr}, Hà Nội, Việt Nam`;
    }
    return addr;
  }
  if (hasOrderCoordinates(order)) {
    return `${order.lat},${order.lng}`;
  }
  return addr;
}

function formatShopOriginForGoogleMaps(shopOrigin?: ShopOrigin): string | null {
  if (!shopOrigin) return null;
  const addr = (shopOrigin.address || '').trim();
  if (addr) {
    const lower = addr.toLowerCase();
    if (!lower.includes('hà nội') && !lower.includes('ha noi')) {
      return `${addr}, Hà Nội, Việt Nam`;
    }
    return addr;
  }
  if (isValidCoordinate(shopOrigin.lat, shopOrigin.lng)) {
    return `${shopOrigin.lat},${shopOrigin.lng}`;
  }
  return null;
}

export function buildGoogleMapsRouteUrl(
  addresses: string[],
  originAddress?: string | null
): string {
  const cleanAddresses = addresses
    .map((addr) => addr.trim())
    .filter((addr) => addr.length > 0);

  const cleanOrigin = (originAddress ?? '').trim();

  if (cleanAddresses.length === 0) {
    return 'https://www.google.com/maps';
  }

  if (!cleanOrigin && cleanAddresses.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanAddresses[0])}`;
  }

  const fullChain = cleanOrigin ? [cleanOrigin, ...cleanAddresses] : cleanAddresses;
  const stops = fullChain.map((addr) => encodeURIComponent(addr)).join('/');
  return `https://www.google.com/maps/dir/${stops}`;
}

function buildClusterGroup(
  clusterName: string,
  clusterOrders: DeliveryOrder[],
  color: string,
  shopOrigin?: ShopOrigin,
  routeDirectionLabel?: string
): ClusterGroup {
  const pendingRaw = clusterOrders
    .filter((o) => o.status === 'pending')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pendingOrders = orderStopsNearestNeighbor(pendingRaw, shopOrigin);
  const completedOrders = clusterOrders
    .filter((o) => o.status === 'completed')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sorted = [...pendingOrders, ...completedOrders];

  const activeSequence = pendingOrders.length > 0 ? pendingOrders : sorted;

  const shipperSet = new Set<string>();
  for (const order of activeSequence) {
    const assigned = (order.shipper_assigned || '').trim();
    if (assigned) {
      shipperSet.add(assigned);
    }
  }
  const assignedShippers = Array.from(shipperSet);
  const primaryShipper = assignedShippers[0] ?? '';

  const routeStops = activeSequence.map(formatStopForGoogleMaps);
  const originStr = formatShopOriginForGoogleMaps(shopOrigin);
  const totalDistanceKm = computeRouteDistanceKm(activeSequence, shopOrigin);

  return {
    clusterName,
    color,
    orders: sorted,
    pendingOrders,
    completedOrders,
    assignedShippers,
    primaryShipper,
    googleMapsUrl: buildGoogleMapsRouteUrl(routeStops, originStr),
    totalDistanceKm,
    routeDirectionLabel,
  };
}

export function groupOrdersByCluster(
  orders: DeliveryOrder[],
  shopOrigin?: ShopOrigin
): ClusterGroup[] {
  const map = new Map<string, DeliveryOrder[]>();

  for (const order of orders) {
    const clusterName = (order.cum_khu_vuc || 'Chưa phân cụm').trim() || 'Chưa phân cụm';
    const list = map.get(clusterName) ?? [];
    list.push(order);
    map.set(clusterName, list);
  }

  const groups: ClusterGroup[] = [];
  for (const [clusterName, clusterOrders] of map.entries()) {
    groups.push(buildClusterGroup(clusterName, clusterOrders, CLUSTER_COLORS[0], shopOrigin));
  }

  groups.sort((a, b) => {
    if (a.pendingOrders.length !== b.pendingOrders.length) {
      return b.pendingOrders.length - a.pendingOrders.length;
    }
    return a.clusterName.localeCompare(b.clusterName, 'vi');
  });

  return groups.map((group, idx) => ({
    ...group,
    color: CLUSTER_COLORS[idx % CLUSTER_COLORS.length],
  }));
}

const HANOI_CORRIDOR_KEYWORDS: Array<{ label: string; patterns: string[] }> = [
  { label: 'Linh Đàm', patterns: ['linh đàm', 'linh dam', 'hh2', 'hh1', 'hh3', 'hh4'] },
  { label: 'Giải Phóng', patterns: ['giải phóng', 'giai phong', 'định công', 'dinh cong', 'ngọc hồi', 'ngoc hoi'] },
  { label: 'Đường Láng', patterns: ['đường láng', 'duong lang', 'chùa láng', 'chua lang', 'láng hạ', 'lang ha', 'pháo đài láng'] },
  { label: 'Cầu Giấy', patterns: ['cầu giấy', 'cau giay', 'xuân thủy', 'xuan thuy', 'trần thái tông', 'tran thai tong', 'dịch vọng', 'dich vong', 'duy tân', 'duy tan'] },
  { label: 'Nguyễn Trãi', patterns: ['nguyễn trãi', 'nguyen trai', 'thanh xuân', 'thanh xuan', 'khuất duy tiến', 'khuat duy tien', 'royal city'] },
  { label: 'Hà Đông', patterns: ['hà đông', 'ha dong', 'quang trung', 'tố hữu', 'to huu', 'văn quán', 'van quan', 'mỗ lao', 'mo lao'] },
  { label: 'Đống Đa', patterns: ['đống đa', 'dong da', 'tây sơn', 'tay son', 'chùa bộc', 'chua boc', 'thái hà', 'thai ha', 'xã đàn', 'xa dan', 'tôn đức thắng'] },
  { label: 'Hoàng Mai', patterns: ['hoàng mai', 'hoang mai', 'tân mai', 'tan mai', 'tam trinh', 'minh khai', 'lĩnh nam', 'linh nam'] },
  { label: 'Hai Bà Trưng', patterns: ['hai bà trưng', 'hai ba trung', 'bạch mai', 'bach mai', 'phố huế', 'pho hue', 'bà triệu', 'ba trieu', 'times city', 'lê thanh nghị'] },
  { label: 'Hoàn Kiếm', patterns: ['hoàn kiếm', 'hoan kiem', 'hàng bài', 'tràng tiền', 'phố cổ', 'trần hưng đạo'] },
  { label: 'Ba Đình', patterns: ['ba đình', 'ba dinh', 'kim mã', 'kim ma', 'liễu giai', 'lieu giai', 'đội cấn', 'doi can', 'giảng võ', 'giang vo'] },
  { label: 'Mỹ Đình', patterns: ['mỹ đình', 'my dinh', 'nam từ liêm', 'nam tu liem', 'mễ trì', 'me tri', 'lê đức thọ', 'hồ tùng mậu'] },
  { label: 'Tây Hồ', patterns: ['tây hồ', 'tay ho', 'lạc long quân', 'lac long quan', 'âu cơ', 'au co', 'xuân la', 'xuan la'] },
  { label: 'Long Biên', patterns: ['long biên', 'long bien', 'nguyễn văn cừ', 'nguyen van cu', 'ngọc lâm', 'ngoc lam', 'aeon long biên'] },
  { label: 'Bắc Từ Liêm', patterns: ['bắc từ liêm', 'bac tu liem', 'cổ nhuế', 'co nhue', 'phạm văn đồng', 'pham van dong'] },
];

function extractCorridorTokens(order: DeliveryOrder): string[] {
  const haystack = `${order.dia_chi} ${order.cum_khu_vuc}`.toLowerCase();
  const matched: string[] = [];
  for (const entry of HANOI_CORRIDOR_KEYWORDS) {
    if (entry.patterns.some((p) => haystack.includes(p))) {
      matched.push(entry.label);
    }
  }
  return matched;
}

export function deriveSmartRouteName(
  routeOrders: DeliveryOrder[],
  routeNumber: number,
  shopOrigin?: ShopOrigin
): { clusterName: string; directionLabel: string } {
  const tokenFreq = new Map<string, number>();
  for (const order of routeOrders) {
    const tokens = extractCorridorTokens(order);
    for (const token of tokens) {
      tokenFreq.set(token, (tokenFreq.get(token) ?? 0) + 1);
    }
  }

  let corridor = '';
  if (tokenFreq.size > 0) {
    const topTokens = Array.from(tokenFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([label]) => label);
    corridor = topTokens.join(' – ');
  } else {
    const fallbackNames = new Map<string, number>();
    for (const order of routeOrders) {
      const clean = (order.cum_khu_vuc || '')
        .trim()
        .replace(/^cụm\s+/i, '');
      if (clean && !/khu vực chung|chưa phân cụm/i.test(clean)) {
        fallbackNames.set(clean, (fallbackNames.get(clean) ?? 0) + 1);
      }
    }
    if (fallbackNames.size > 0) {
      corridor = Array.from(fallbackNames.entries()).sort((a, b) => b[1] - a[1])[0][0];
    } else {
      corridor = 'Khu vực trung tâm';
    }
  }

  // Determine compass direction from Shop Origin
  const geoStops = routeOrders.filter(hasOrderCoordinates);
  let directionLabel = '';
  if (shopOrigin && geoStops.length > 0) {
    const avgLat = geoStops.reduce((s, o) => s + o.lat, 0) / geoStops.length;
    const avgLng = geoStops.reduce((s, o) => s + o.lng, 0) / geoStops.length;
    const distFromShop = haversineDistanceKm(shopOrigin.lat, shopOrigin.lng, avgLat, avgLng);
    directionLabel =
      distFromShop < 0.6
        ? 'Quanh Shop'
        : describeCompassDirectionVi(
            computeBearingDegrees(shopOrigin.lat, shopOrigin.lng, avgLat, avgLng)
          );
  }

  const count = routeOrders.length;
  return {
    clusterName: `Tuyến ${routeNumber}: ${corridor} (${count} đơn)`,
    directionLabel,
  };
}

export interface ClusterRouteOptions {
  shopOrigin?: ShopOrigin;
  maxOrdersPerShipper?: number;
}

function splitRouteByCapacity(
  orderedStops: DeliveryOrder[],
  maxOrdersPerShipper: number
): DeliveryOrder[][] {
  if (orderedStops.length <= maxOrdersPerShipper) {
    return [orderedStops];
  }
  const numChunks = Math.ceil(orderedStops.length / maxOrdersPerShipper);
  const balancedSize = Math.ceil(orderedStops.length / numChunks);
  const chunks: DeliveryOrder[][] = [];
  for (let i = 0; i < orderedStops.length; i += balancedSize) {
    chunks.push(orderedStops.slice(i, i + balancedSize));
  }
  return chunks;
}

export function clusterOrdersByRadius(
  orders: DeliveryOrder[],
  radiusKm = DEFAULT_CLUSTER_RADIUS_KM,
  options: ClusterRouteOptions = {}
): ClusterGroup[] {
  const effectiveRadius = Number.isFinite(radiusKm) ? Math.max(0.5, radiusKm) : DEFAULT_CLUSTER_RADIUS_KM;
  const shopOrigin = options.shopOrigin ?? DEFAULT_SHOP_ORIGIN;
  const maxPerShipper = Math.min(
    10,
    Math.max(3, Math.round(options.maxOrdersPerShipper ?? DEFAULT_MAX_ORDERS_PER_SHIPPER))
  );
  const maxBearingDiffDeg = 65;

  const pendingOrdersAll = orders.filter((o) => o.status === 'pending');
  const completedOrdersAll = orders.filter((o) => o.status === 'completed');

  const pendingGeo = pendingOrdersAll.filter(hasOrderCoordinates);
  const pendingNonGeo = pendingOrdersAll.filter((o) => !hasOrderCoordinates(o));

  // Separate "radial" stops (>= 1.0 km from Shop) from "near-shop" stops (< 1.0 km)
  // so a single near-shop stop never bridges two opposite directions across the Shop.
  const radialThresholdKm = 1.0;
  const radialItems = pendingGeo
    .map((order) => ({
      order,
      distFromShop: haversineDistanceKm(shopOrigin.lat, shopOrigin.lng, order.lat, order.lng),
      bearingFromShop: computeBearingDegrees(shopOrigin.lat, shopOrigin.lng, order.lat, order.lng),
    }))
    .filter((item) => item.distFromShop >= radialThresholdKm);

  const nearShopItems = pendingGeo
    .map((order) => ({
      order,
      distFromShop: haversineDistanceKm(shopOrigin.lat, shopOrigin.lng, order.lat, order.lng),
      bearingFromShop: computeBearingDegrees(shopOrigin.lat, shopOrigin.lng, order.lat, order.lng),
    }))
    .filter((item) => item.distFromShop < radialThresholdKm);

  const visited = new Array<boolean>(radialItems.length).fill(false);
  const spatialComponents: DeliveryOrder[][] = [];

  for (let i = 0; i < radialItems.length; i++) {
    if (visited[i]) continue;
    visited[i] = true;
    const seed = radialItems[i];
    const component: DeliveryOrder[] = [seed.order];
    const queue: number[] = [i];

    while (queue.length > 0) {
      const currentIdx = queue.shift()!;
      const current = radialItems[currentIdx];

      for (let j = 0; j < radialItems.length; j++) {
        if (visited[j]) continue;
        const candidate = radialItems[j];
        const dist = haversineDistanceKm(
          current.order.lat!,
          current.order.lng!,
          candidate.order.lat!,
          candidate.order.lng!
        );
        const bearingDiffCurrent = bearingDifferenceDegrees(
          current.bearingFromShop,
          candidate.bearingFromShop
        );
        const bearingDiffSeed = bearingDifferenceDegrees(
          seed.bearingFromShop,
          candidate.bearingFromShop
        );

        // Link if within radiusKm AND moving along the same outgoing corridor from Shop
        if (
          dist <= effectiveRadius &&
          bearingDiffCurrent <= maxBearingDiffDeg &&
          bearingDiffSeed <= 80
        ) {
          visited[j] = true;
          queue.push(j);
          component.push(candidate.order);
        }
      }
    }

    spatialComponents.push(component);
  }

  // Attach near-shop stops (< 1 km) to the closest existing radial cluster within radiusKm, or group together
  const centralOrphanStops: DeliveryOrder[] = [];
  for (const near of nearShopItems) {
    let bestCompIdx = -1;
    let bestStopDist = Infinity;

    for (let cIdx = 0; cIdx < spatialComponents.length; cIdx++) {
      for (const member of spatialComponents[cIdx]) {
        if (!hasOrderCoordinates(member)) continue;
        const d = haversineDistanceKm(near.order.lat!, near.order.lng!, member.lat, member.lng);
        if (d <= effectiveRadius && d < bestStopDist) {
          bestStopDist = d;
          bestCompIdx = cIdx;
        }
      }
    }

    if (bestCompIdx >= 0) {
      spatialComponents[bestCompIdx].push(near.order);
    } else {
      centralOrphanStops.push(near.order);
    }
  }

  if (centralOrphanStops.length > 0) {
    spatialComponents.push(centralOrphanStops);
  }

  // Re-order every component by Nearest Neighbor from Shop Origin & split if > maxOrdersPerShipper
  const capacityAwareRoutes: DeliveryOrder[][] = [];
  for (const comp of spatialComponents) {
    const orderedComp = orderStopsNearestNeighbor(comp, shopOrigin);
    const chunks = splitRouteByCapacity(orderedComp, maxPerShipper);
    capacityAwareRoutes.push(...chunks);
  }

  // Group non-geo legacy pending orders (if any) and also cap by maxPerShipper
  const nonGeoMap = new Map<string, DeliveryOrder[]>();
  for (const order of pendingNonGeo) {
    const name = (order.cum_khu_vuc || 'Chưa phân cụm').trim() || 'Chưa phân cụm';
    const list = nonGeoMap.get(name) ?? [];
    list.push(order);
    nonGeoMap.set(name, list);
  }
  for (const list of nonGeoMap.values()) {
    capacityAwareRoutes.push(...splitRouteByCapacity(list, maxPerShipper));
  }

  // Sort pending routes: larger pending routes first, then shorter distance
  const preparedPending = capacityAwareRoutes.map((routeOrders) => {
    const ordered = orderStopsNearestNeighbor(routeOrders, shopOrigin);
    const distanceKm = computeRouteDistanceKm(ordered, shopOrigin);
    return { ordered, distanceKm };
  });

  preparedPending.sort((a, b) => {
    if (a.ordered.length !== b.ordered.length) {
      return b.ordered.length - a.ordered.length;
    }
    return a.distanceKm - b.distanceKm;
  });

  const pendingGroups: ClusterGroup[] = preparedPending.map((item, idx) => {
    const routeNumber = idx + 1;
    const { clusterName, directionLabel } = deriveSmartRouteName(
      item.ordered,
      routeNumber,
      shopOrigin
    );
    const color = CLUSTER_COLORS[idx % CLUSTER_COLORS.length];
    return buildClusterGroup(clusterName, item.ordered, color, shopOrigin, directionLabel);
  });

  // Group completed orders separately by their stored cum_khu_vuc for historical view
  const completedMap = new Map<string, DeliveryOrder[]>();
  for (const order of completedOrdersAll) {
    const name = (order.cum_khu_vuc || 'Đơn đã hoàn thành').trim() || 'Đơn đã hoàn thành';
    const list = completedMap.get(name) ?? [];
    list.push(order);
    completedMap.set(name, list);
  }

  const completedGroups: ClusterGroup[] = Array.from(completedMap.entries()).map(
    ([name, list], idx) =>
      buildClusterGroup(
        name,
        list,
        CLUSTER_COLORS[(pendingGroups.length + idx) % CLUSTER_COLORS.length],
        shopOrigin
      )
  );

  return [...pendingGroups, ...completedGroups];
}

export type ShipperFilterMode = 'mine' | 'all_pending' | 'completed';

export function matchesShipperIdentity(assignedValue: string, shipperEmail: string): boolean {
  const assigned = (assignedValue || '').trim().toLowerCase();
  const email = (shipperEmail || '').trim().toLowerCase();
  if (!assigned || !email) {
    return false;
  }
  const emailPrefix = email.split('@')[0] ?? '';
  return (
    assigned === email ||
    (emailPrefix.length > 0 && assigned === emailPrefix) ||
    assigned.includes(email) ||
    (emailPrefix.length >= 3 && assigned.includes(emailPrefix))
  );
}

const HANOI_DISTRICT_EXTRACTORS: Array<{ district: string; patterns: string[] }> = [
  { district: 'Cầu Giấy', patterns: ['cầu giấy', 'cau giay', 'xuân thủy', 'xuan thuy', 'trần thái tông', 'tran thai tong', 'dịch vọng', 'dich vong', 'duy tân', 'duy tan', 'hoàng quốc việt'] },
  { district: 'Đống Đa', patterns: ['đống đa', 'dong da', 'đường láng', 'duong lang', 'chùa láng', 'chua lang', 'láng hạ', 'lang ha', 'tây sơn', 'tay son', 'chùa bộc', 'chua boc', 'thái hà', 'thai ha', 'xã đàn', 'xa dan', 'ngã tư sở', 'nga tu so'] },
  { district: 'Thanh Xuân', patterns: ['thanh xuân', 'thanh xuan', 'nguyễn trãi', 'nguyen trai', 'khuất duy tiến', 'khuat duy tien', 'lê văn lương', 'le van luong', 'royal city'] },
  { district: 'Hoàng Mai', patterns: ['hoàng mai', 'hoang mai', 'linh đàm', 'linh dam', 'giải phóng', 'giai phong', 'tân mai', 'tan mai', 'định công', 'dinh cong', 'tam trinh', 'lĩnh nam', 'linh nam'] },
  { district: 'Hai Bà Trưng', patterns: ['hai bà trưng', 'hai ba trung', 'bạch mai', 'bach mai', 'phố huế', 'pho hue', 'bà triệu', 'ba trieu', 'minh khai', 'times city', 'lê thanh nghị'] },
  { district: 'Hoàn Kiếm', patterns: ['hoàn kiếm', 'hoan kiem', 'hàng bài', 'tràng tiền', 'phố cổ', 'trần hưng đạo', 'lý thường kiệt'] },
  { district: 'Ba Đình', patterns: ['ba đình', 'ba dinh', 'kim mã', 'kim ma', 'liễu giai', 'lieu giai', 'đội cấn', 'doi can', 'giảng võ', 'giang vo', 'hoàng hoa thám'] },
  { district: 'Hà Đông', patterns: ['hà đông', 'ha dong', 'quang trung', 'tố hữu', 'to huu', 'văn quán', 'van quan', 'mỗ lao', 'mo lao', 'yên nghĩa'] },
  { district: 'Long Biên', patterns: ['long biên', 'long bien', 'nguyễn văn cừ', 'nguyen van cu', 'ngọc lâm', 'ngoc lam', 'việt hưng', 'aeon long biên'] },
  { district: 'Tây Hồ', patterns: ['tây hồ', 'tay ho', 'lạc long quân', 'lac long quan', 'âu cơ', 'au co', 'xuân la', 'xuan la', 'thụy khuê'] },
  { district: 'Nam Từ Liêm', patterns: ['nam từ liêm', 'nam tu liem', 'mỹ đình', 'my dinh', 'mễ trì', 'me tri', 'lê đức thọ', 'cầu diễn'] },
  { district: 'Bắc Từ Liêm', patterns: ['bắc từ liêm', 'bac tu liem', 'cổ nhuế', 'co nhue', 'phạm văn đồng', 'pham van dong', 'xuân đỉnh'] },
  { district: 'Gia Lâm', patterns: ['gia lâm', 'gia lam', 'trâu quỳ', 'ocean park'] },
  { district: 'Thanh Trì', patterns: ['thanh trì', 'thanh tri', 'ngọc hồi', 'văn điển'] },
];

export function extractHanoiDistrictName(address: string, clusterName = ''): string {
  const addrLower = (address || '').toLowerCase();
  for (const item of HANOI_DISTRICT_EXTRACTORS) {
    if (item.patterns.some((p) => addrLower.includes(p))) {
      return item.district;
    }
  }
  const clusterLower = (clusterName || '').toLowerCase();
  if (clusterLower) {
    for (const item of HANOI_DISTRICT_EXTRACTORS) {
      if (item.patterns.some((p) => clusterLower.includes(p))) {
        return item.district;
      }
    }
  }
  return 'Khu vực khác';
}

export function extractAvailableDistricts(orders: DeliveryOrder[]): string[] {
  const counts = new Map<string, number>();
  for (const order of orders) {
    const district = extractHanoiDistrictName(order.dia_chi, order.cum_khu_vuc);
    counts.set(district, (counts.get(district) ?? 0) + 1);
  }
  return Array.from(counts.keys()).sort((a, b) => {
    if (a === 'Khu vực khác') return 1;
    if (b === 'Khu vực khác') return -1;
    return a.localeCompare(b, 'vi');
  });
}

export interface OrderWithDistance {
  order: DeliveryOrder;
  distanceKm: number | null;
}

export function sortOrdersByDistanceFromPoint(
  orders: DeliveryOrder[],
  referencePoint: GeoPoint
): OrderWithDistance[] {
  const validRef = isValidCoordinate(referencePoint.lat, referencePoint.lng);
  const mapped: OrderWithDistance[] = orders.map((order) => {
    if (validRef && hasOrderCoordinates(order)) {
      const dist = haversineDistanceKm(
        referencePoint.lat,
        referencePoint.lng,
        order.lat,
        order.lng
      );
      return { order, distanceKm: Number(dist.toFixed(1)) };
    }
    return { order, distanceKm: null };
  });

  mapped.sort((a, b) => {
    if (a.distanceKm !== null && b.distanceKm !== null) {
      return a.distanceKm - b.distanceKm;
    }
    if (a.distanceKm !== null) return -1;
    if (b.distanceKm !== null) return 1;
    return b.order.createdAt.localeCompare(a.order.createdAt);
  });

  return mapped;
}

export function filterClustersForShipper(
  clusters: ClusterGroup[],
  filterMode: ShipperFilterMode,
  shipperEmail: string,
  selectedClusterName: string,
  shopOrigin?: ShopOrigin
): ClusterGroup[] {
  return clusters
    .filter((cluster) => {
      if (selectedClusterName !== 'ALL' && cluster.clusterName !== selectedClusterName) {
        return false;
      }
      if (filterMode === 'completed') {
        return cluster.completedOrders.length > 0;
      }
      if (cluster.pendingOrders.length === 0) {
        return false;
      }
      if (filterMode === 'mine') {
        return cluster.pendingOrders.some((order) =>
          matchesShipperIdentity(getOrderClaimedShipper(order), shipperEmail)
        );
      }
      return true;
    })
    .map((cluster) => {
      if (filterMode === 'completed') {
        return {
          ...cluster,
          orders: cluster.completedOrders,
        };
      }
      if (filterMode === 'mine') {
        const myPendingRaw = cluster.pendingOrders.filter((order) =>
          matchesShipperIdentity(getOrderClaimedShipper(order), shipperEmail)
        );
        const myPending = orderStopsNearestNeighbor(myPendingRaw, shopOrigin);
        const originStr = formatShopOriginForGoogleMaps(shopOrigin);
        return {
          ...cluster,
          pendingOrders: myPending,
          orders: myPending,
          totalDistanceKm: computeRouteDistanceKm(myPending, shopOrigin),
          googleMapsUrl: buildGoogleMapsRouteUrl(
            myPending.map(formatStopForGoogleMaps),
            originStr
          ),
        };
      }
      return {
        ...cluster,
        orders: cluster.pendingOrders,
      };
    });
}

export function filterOrdersForAdmin(
  orders: DeliveryOrder[],
  searchQuery: string,
  statusFilter: 'all' | OrderStatus,
  clusterFilter: string
): DeliveryOrder[] {
  const q = searchQuery.trim().toLowerCase();

  return orders.filter((order) => {
    if (statusFilter !== 'all' && order.status !== statusFilter) {
      return false;
    }
    if (clusterFilter !== 'ALL' && order.cum_khu_vuc !== clusterFilter) {
      return false;
    }
    if (!q) {
      return true;
    }
    const haystack = [
      order.ten_khach,
      order.sdt,
      order.dia_chi,
      order.ghi_chu,
      order.cum_khu_vuc,
      order.shipper_assigned,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function computeOrderStats(
  orders: DeliveryOrder[],
  clusters?: ClusterGroup[]
): OrderStats {
  const total = orders.length;
  const pending = orders.filter((o) => o.status === 'pending').length;
  const completed = orders.filter((o) => o.status === 'completed').length;
  const activeClusters = clusters
    ? clusters.filter((c) => c.pendingOrders.length > 0).length
    : new Set(
        orders
          .filter((o) => o.status === 'pending')
          .map((o) => (o.cum_khu_vuc || 'Chưa phân cụm').trim())
      ).size;

  return {
    total,
    pending,
    completed,
    activeClusters,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

export function normalizeExtractedOrders(rawItems: unknown): ExtractedOrderInput[] {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems
    .map((item): ExtractedOrderInput | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const record = item as Record<string, unknown>;
      const rawTenKhach = String(record.ten_khach ?? '').trim();
      const ten_khach = rawTenKhach || 'Khách hàng';
      const sdt = String(record.sdt ?? '').trim();
      const dia_chi = String(record.dia_chi ?? '').trim();
      const dia_chi_tim_map = String(record.dia_chi_tim_map ?? '').trim();
      const ghi_chu = String(record.ghi_chu ?? '').trim();
      const cum_khu_vuc = String(record.cum_khu_vuc ?? '').trim() || 'Cụm khu vực chung';

      if (!dia_chi && !rawTenKhach && !sdt) {
        return null;
      }

      const rawLat = typeof record.lat === 'number' ? record.lat : Number(record.lat);
      const rawLng = typeof record.lng === 'number' ? record.lng : Number(record.lng);
      const hasCoords = isValidCoordinate(rawLat, rawLng);

      return {
        ten_khach,
        sdt,
        dia_chi: dia_chi || 'Chưa rõ địa chỉ',
        ...(dia_chi_tim_map ? { dia_chi_tim_map } : {}),
        ghi_chu,
        cum_khu_vuc,
        ...(hasCoords ? { lat: rawLat, lng: rawLng } : {}),
      };
    })
    .filter((item): item is ExtractedOrderInput => item !== null);
}

export function parseGeminiRestPayload(payload: unknown): ExtractedOrderInput[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const root = payload as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const rawText = root.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!rawText.trim()) {
    return [];
  }

  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const parsed = JSON.parse(cleaned);
  return normalizeExtractedOrders(parsed);
}

export function formatClusterForZalo(cluster: ClusterGroup): string {
  const targetOrders =
    cluster.pendingOrders.length > 0 ? cluster.pendingOrders : cluster.orders;
  const headerLines = [
    `📦 ${cluster.clusterName.toUpperCase()} (${targetOrders.length} đơn)`,
    cluster.primaryShipper
      ? `🛵 Shipper phụ trách: ${cluster.primaryShipper}`
      : '🛵 Shipper phụ trách: Chưa phân công',
    ...(cluster.totalDistanceKm > 0
      ? [`📏 Tổng quãng đường ước tính từ Kho: ~${cluster.totalDistanceKm.toFixed(1)} km`]
      : []),
    '',
  ];

  const orderLines = targetOrders.map((order, idx) => {
    const parts = [
      `${idx + 1}. ${order.ten_khach}${order.sdt ? ` - ${order.sdt}` : ''}`,
      `   📍 ${order.dia_chi}`,
    ];
    if (order.ghi_chu) {
      parts.push(`   📝 ${order.ghi_chu}`);
    }
    return parts.join('\n');
  });

  const footer = ['', `🗺️ Lộ trình Google Maps (Từ Shop → #1 → #${targetOrders.length}):`, cluster.googleMapsUrl];

  return [...headerLines, ...orderLines, ...footer].join('\n');
}

export function translateFirebaseAuthError(errorCode: string | undefined): string {
  switch (errorCode) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.';
    case 'auth/invalid-email':
      return 'Định dạng email không hợp lệ.';
    case 'auth/email-already-in-use':
      return 'Email này đã được đăng ký trước đó.';
    case 'auth/weak-password':
      return 'Mật khẩu phải có ít nhất 6 ký tự.';
    case 'auth/too-many-requests':
      return 'Thử đăng nhập quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.';
    case 'auth/network-request-failed':
      return 'Lỗi kết nối mạng tới máy chủ xác thực Firebase.';
    default:
      return 'Không thể đăng nhập. Vui lòng kiểm tra tài khoản và thử lại.';
  }
}
