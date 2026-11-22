import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bearingDifferenceDegrees,
  buildGoogleMapsRouteUrl,
  buildTelHref,
  clusterOrdersByRadius,
  computeBearingDegrees,
  computeClusterZoneGeometry,
  computeConvexHull,
  computeOrderStats,
  computeRouteDistanceKm,
  DEFAULT_SHOP_ORIGIN,
  deriveDisplayNameFromEmail,
  extractAvailableDistricts,
  extractHanoiDistrictName,
  filterClustersForShipper,
  filterOrdersForAdmin,
  formatClusterForZalo,
  formatShortAddress,
  formatZoneLabel,
  getOrderClaimedShipper,
  groupOrdersByCluster,
  haversineDistanceKm,
  isValidVietnamCoordinate,
  matchesShipperIdentity,
  normalizeDeliveryState,
  normalizeExtractedOrders,
  orderStopsNearestNeighbor,
  parseGeminiRestPayload,
  resolveRoleFromEmailAndProfile,
  sortOrdersByDistanceFromPoint,
} from './dispatch';
import type { DeliveryOrder } from '../types/order';

const sampleOrders: DeliveryOrder[] = [
  {
    id: '1',
    ten_khach: 'Nguyễn Văn An',
    sdt: '0912 345 678',
    dia_chi: '120 Xuân Thủy, Cầu Giấy, Hà Nội',
    ghi_chu: '2 bún chả không hành',
    cum_khu_vuc: 'Cụm Cầu Giấy - Láng - Thanh Xuân',
    shipper_assigned: 'shipper1@shipper.vn',
    shipperEmail: 'shipper1@shipper.vn',
    deliveryState: 'delivering',
    status: 'pending',
    createdAt: '2026-11-21T08:00:00.000Z',
  },
  {
    id: '2',
    ten_khach: 'Trần Thị Bình',
    sdt: '0987654321',
    dia_chi: '45 Đường Láng, Đống Đa, Hà Nội',
    ghi_chu: '1 cơm tấm sườn bì',
    cum_khu_vuc: 'Cụm Cầu Giấy - Láng - Thanh Xuân',
    shipper_assigned: 'shipper1@shipper.vn',
    shipperEmail: 'shipper1@shipper.vn',
    deliveryState: 'delivering',
    status: 'pending',
    createdAt: '2026-11-21T08:05:00.000Z',
  },
  {
    id: '3',
    ten_khach: 'Lê Minh Cường',
    sdt: '0909111222',
    dia_chi: 'HH2A Linh Đàm, Hoàng Mai, Hà Nội',
    ghi_chu: 'Giao giờ trưa 11h30',
    cum_khu_vuc: 'Cụm Hoàng Mai - Linh Đàm',
    shipper_assigned: 'shipper2@shipper.vn',
    shipperEmail: 'shipper2@shipper.vn',
    deliveryState: 'done',
    status: 'completed',
    createdAt: '2026-11-21T07:30:00.000Z',
  },
];

test('resolveRoleFromEmailAndProfile handles thuong@, admin@shipper.vn, and Firestore role priority', () => {
  assert.equal(resolveRoleFromEmailAndProfile('admin@shipper.vn'), 'admin');
  assert.equal(resolveRoleFromEmailAndProfile('thuong@gmail.com'), 'admin');
  assert.equal(resolveRoleFromEmailAndProfile('THUONG@shop.vn', 'shipper'), 'admin');
  assert.equal(resolveRoleFromEmailAndProfile('chushop.admin@gmail.com'), 'admin');
  assert.equal(resolveRoleFromEmailAndProfile('chushop.admin@gmail.com', 'shipper'), 'shipper');
  assert.equal(resolveRoleFromEmailAndProfile('shop@example.com', 'admin'), 'admin');
  assert.equal(resolveRoleFromEmailAndProfile('shipper1@shipper.vn'), 'shipper');
  assert.equal(resolveRoleFromEmailAndProfile('shipper2@shipper.vn', 'shipper'), 'shipper');
  assert.equal(deriveDisplayNameFromEmail('shipper1@shipper.vn'), 'Shipper1');
  assert.equal(deriveDisplayNameFromEmail('nguyen.van.an@shop.vn'), 'Nguyen Van An');
});

test('buildTelHref strips spaces and non-digit characters safely', () => {
  assert.equal(buildTelHref('0912 345 678'), 'tel:0912345678');
  assert.equal(buildTelHref('+84 912-345-678'), 'tel:+84912345678');
  assert.equal(buildTelHref(''), '#');
});

test('buildGoogleMapsRouteUrl builds single-stop search and multi-stop dir URL with optional origin', () => {
  const single = buildGoogleMapsRouteUrl(['120 Xuân Thủy, Cầu Giấy']);
  assert.ok(single.startsWith('https://www.google.com/maps/search/?api=1&query='));

  const withOrigin = buildGoogleMapsRouteUrl(
    ['120 Xuân Thủy, Cầu Giấy'],
    'Ngã Tư Sở, Đống Đa, Hà Nội'
  );
  assert.ok(withOrigin.startsWith('https://www.google.com/maps/dir/'));
  assert.ok(
    withOrigin.indexOf(encodeURIComponent('Ngã Tư Sở, Đống Đa, Hà Nội')) <
      withOrigin.indexOf(encodeURIComponent('120 Xuân Thủy, Cầu Giấy'))
  );

  const multi = buildGoogleMapsRouteUrl([
    '120 Xuân Thủy, Cầu Giấy',
    '45 Đường Láng, Đống Đa',
  ]);
  assert.ok(multi.startsWith('https://www.google.com/maps/dir/'));
  assert.ok(multi.includes(encodeURIComponent('120 Xuân Thủy, Cầu Giấy')));
  assert.ok(multi.includes(encodeURIComponent('45 Đường Láng, Đống Đa')));
});

test('groupOrdersByCluster groups orders and computes pending counts', () => {
  const clusters = groupOrdersByCluster(sampleOrders);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].clusterName, 'Cụm Cầu Giấy - Láng - Thanh Xuân');
  assert.equal(clusters[0].pendingOrders.length, 2);
  assert.equal(clusters[0].primaryShipper, 'shipper1@shipper.vn');
  assert.equal(clusters[1].clusterName, 'Cụm Hoàng Mai - Linh Đàm');
  assert.equal(clusters[1].pendingOrders.length, 0);
  assert.equal(clusters[1].completedOrders.length, 1);
});

test('filterClustersForShipper filters by assigned shipper and cluster name', () => {
  const clusters = groupOrdersByCluster(sampleOrders);

  const mineShipper1 = filterClustersForShipper(clusters, 'mine', 'shipper1@shipper.vn', 'ALL');
  assert.equal(mineShipper1.length, 1);
  assert.equal(mineShipper1[0].orders.length, 2);

  const mineShipper2 = filterClustersForShipper(clusters, 'mine', 'shipper2@shipper.vn', 'ALL');
  assert.equal(mineShipper2.length, 0);

  const allPending = filterClustersForShipper(clusters, 'all_pending', 'shipper2@shipper.vn', 'ALL');
  assert.equal(allPending.length, 1);

  const completed = filterClustersForShipper(clusters, 'completed', 'shipper2@shipper.vn', 'ALL');
  assert.equal(completed.length, 1);
  assert.equal(completed[0].clusterName, 'Cụm Hoàng Mai - Linh Đàm');
});

test('matchesShipperIdentity supports full email and prefix matching', () => {
  assert.equal(matchesShipperIdentity('shipper1@shipper.vn', 'shipper1@shipper.vn'), true);
  assert.equal(matchesShipperIdentity('shipper1', 'shipper1@shipper.vn'), true);
  assert.equal(matchesShipperIdentity('shipper2', 'shipper1@shipper.vn'), false);
});

test('filterOrdersForAdmin and computeOrderStats compute accurate counts', () => {
  const stats = computeOrderStats(sampleOrders);
  assert.deepEqual(stats, {
    total: 3,
    pending: 2,
    completed: 1,
    activeClusters: 1,
    completionRate: 33,
  });

  const searchRes = filterOrdersForAdmin(sampleOrders, 'Xuân Thủy', 'all', 'ALL');
  assert.equal(searchRes.length, 1);
  assert.equal(searchRes[0].id, '1');
});

test('normalizeExtractedOrders sanitizes valid AI extraction payloads including lat/lng', () => {
  const normalized = normalizeExtractedOrders([
    {
      ten_khach: 'Chị Hoa',
      sdt: '0901234567',
      dia_chi: '18 Tam Trinh, Hoàng Mai',
      ghi_chu: 'Ít đá',
      cum_khu_vuc: 'Cụm Hoàng Mai - Linh Đàm',
      lat: 20.9885,
      lng: 105.8622,
    },
    null,
    {},
  ]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].ten_khach, 'Chị Hoa');
  assert.equal(normalized[0].cum_khu_vuc, 'Cụm Hoàng Mai - Linh Đàm');
  assert.equal(normalized[0].lat, 20.9885);
  assert.equal(normalized[0].lng, 105.8622);
});

test('parseGeminiRestPayload extracts JSON array from REST response text', () => {
  const restResponse = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: '```json\n[{"ten_khach":"Anh Nam","sdt":"0911222333","dia_chi":"10 Chùa Láng","ghi_chu":"1 phở","cum_khu_vuc":"Cụm Cầu Giấy - Láng - Thanh Xuân"}]\n```',
            },
          ],
        },
      },
    ],
  };

  const parsed = parseGeminiRestPayload(restResponse);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].ten_khach, 'Anh Nam');
  assert.equal(parsed[0].cum_khu_vuc, 'Cụm Cầu Giấy - Láng - Thanh Xuân');
});

test('formatClusterForZalo creates structured Vietnamese Zalo message with Maps URL', () => {
  const clusters = groupOrdersByCluster(sampleOrders);
  const text = formatClusterForZalo(clusters[0]);
  assert.ok(text.includes('CỤM CẦU GIẤY - LÁNG - THANH XUÂN'));
  assert.ok(text.includes('shipper1@shipper.vn'));
  assert.ok(text.includes('Nguyễn Văn An'));
  assert.ok(text.includes('https://www.google.com/maps/dir/'));
});

test('haversineDistanceKm and isValidVietnamCoordinate compute accurate Vietnam distances', () => {
  assert.equal(isValidVietnamCoordinate(21.0367, 105.7826), true);
  assert.equal(isValidVietnamCoordinate(0, 0), false);
  assert.equal(isValidVietnamCoordinate(48.8566, 2.3522), false);

  // Xuân Thủy (Cầu Giấy) to Đường Láng (Đống Đa) is ~2.5 km
  const distCauGiayLang = haversineDistanceKm(21.0367, 105.7826, 21.0167, 105.805);
  assert.ok(distCauGiayLang > 2.0 && distCauGiayLang < 3.5);

  // Xuân Thủy (Cầu Giấy) to Linh Đàm (Hoàng Mai) is ~9.5 km
  const distCauGiayLinhDam = haversineDistanceKm(21.0367, 105.7826, 20.964, 105.8285);
  assert.ok(distCauGiayLinhDam > 8.0 && distCauGiayLinhDam < 12.0);
});

test('computeBearingDegrees and bearingDifferenceDegrees compute accurate compass angles', () => {
  const north = computeBearingDegrees(21.0, 105.8, 21.05, 105.8);
  assert.ok(north < 1 || north > 359);

  const east = computeBearingDegrees(21.0, 105.8, 21.0, 105.85);
  assert.ok(Math.abs(east - 90) < 2);

  const south = computeBearingDegrees(21.0, 105.8, 20.95, 105.8);
  assert.ok(Math.abs(south - 180) < 2);

  assert.equal(bearingDifferenceDegrees(355, 5), 10);
  assert.equal(bearingDifferenceDegrees(10, 190), 180);
});

test('clusterOrdersByRadius groups nearby same-corridor stops within 3.5km and splits when radius shrinks', () => {
  const geoOrders: DeliveryOrder[] = [
    {
      ...sampleOrders[0],
      id: 'g1',
      cum_khu_vuc: 'Khu Tây',
      lat: 21.0367,
      lng: 105.7826, // Xuân Thủy, Cầu Giấy (~NW of Ngã Tư Sở)
    },
    {
      ...sampleOrders[1],
      id: 'g2',
      cum_khu_vuc: 'Khu Tây',
      lat: 21.0167,
      lng: 105.805, // Đường Láng (~NW of Ngã Tư Sở, ~3.2km from g1)
    },
    {
      ...sampleOrders[2],
      id: 'g3',
      status: 'pending',
      cum_khu_vuc: 'Khu Nam',
      lat: 20.964,
      lng: 105.8285, // Linh Đàm (~6.3km from g2)
    },
  ];

  // At 3.5km: g1 & g2 cluster together, g3 is separate
  const clusters35 = clusterOrdersByRadius(geoOrders, 3.5);
  assert.equal(clusters35.length, 2);
  assert.equal(clusters35[0].pendingOrders.length, 2);
  assert.equal(clusters35[1].pendingOrders.length, 1);
  assert.notEqual(clusters35[0].color, clusters35[1].color);
  assert.ok(clusters35[0].clusterName.startsWith('Tuyến 1:'));
  assert.ok(clusters35[0].totalDistanceKm > 0);
  assert.ok(
    clusters35[0].googleMapsUrl.includes(encodeURIComponent(DEFAULT_SHOP_ORIGIN.address))
  );

  // At 1.5km: g1 and g2 also split into 2 separate clusters (3 total)
  const clusters15 = clusterOrdersByRadius(geoOrders, 1.5);
  assert.equal(clusters15.length, 3);
  assert.equal(new Set(clusters15.map((c) => c.clusterName)).size, 3);
});

test('clusterOrdersByRadius separates opposite bearings from Shop Origin and enforces maxOrdersPerShipper', () => {
  // Two stops: ~1.5km NW of Shop and ~1.5km SE of Shop. Distance between them ~3.0km (<3.5km),
  // but opposite bearings from Ngã Tư Sở (~315 deg vs ~135 deg -> diff ~180 deg) so they MUST split.
  const oppositeStops: DeliveryOrder[] = [
    {
      ...sampleOrders[0],
      id: 'nw-1',
      dia_chi: '120 Đường Láng, Đống Đa, Hà Nội',
      lat: 21.013,
      lng: 105.809,
    },
    {
      ...sampleOrders[1],
      id: 'se-1',
      dia_chi: '200 Giải Phóng, Hoàng Mai, Hà Nội',
      lat: 20.993,
      lng: 105.831,
    },
  ];

  const dirClusters = clusterOrdersByRadius(oppositeStops, 3.5, {
    shopOrigin: DEFAULT_SHOP_ORIGIN,
    maxOrdersPerShipper: 5,
  });
  assert.equal(dirClusters.length, 2);

  // Capacity splitting: 7 nearby same-corridor stops with maxOrdersPerShipper = 4 -> splits into 2 routes <= 4
  const sevenSameCorridor: DeliveryOrder[] = Array.from({ length: 7 }, (_, i) => ({
    ...sampleOrders[0],
    id: `cap-${i + 1}`,
    ten_khach: `Khách ${i + 1}`,
    dia_chi: `${10 + i * 20} Đường Láng, Đống Đa, Hà Nội`,
    lat: 21.012 + i * 0.0025,
    lng: 105.81 - i * 0.002,
  }));

  const cappedClusters = clusterOrdersByRadius(sevenSameCorridor, 3.5, {
    shopOrigin: DEFAULT_SHOP_ORIGIN,
    maxOrdersPerShipper: 4,
  });
  assert.equal(cappedClusters.length, 2);
  assert.ok(cappedClusters.every((c) => c.pendingOrders.length <= 4));
  assert.equal(
    cappedClusters.reduce((sum, c) => sum + c.pendingOrders.length, 0),
    7
  );
});

test('orderStopsNearestNeighbor starts from closest stop to Shop Origin and chains nearest-neighbor', () => {
  const stops: DeliveryOrder[] = [
    { ...sampleOrders[0], id: 'far', lat: 21.045, lng: 105.78 },
    { ...sampleOrders[1], id: 'mid', lat: 21.022, lng: 105.802 },
    { ...sampleOrders[2], id: 'near', status: 'pending', lat: 21.008, lng: 105.815 },
  ];
  const ordered = orderStopsNearestNeighbor(stops, DEFAULT_SHOP_ORIGIN);
  assert.deepEqual(
    ordered.map((o) => o.id),
    ['near', 'mid', 'far']
  );

  const distKm = computeRouteDistanceKm(ordered, DEFAULT_SHOP_ORIGIN);
  assert.ok(distKm > 4.0 && distKm < 9.0);
});

test('computeConvexHull and computeClusterZoneGeometry build circle for 1-2 stops and expanded polygon for 3+ stops', () => {
  const oneOrder: DeliveryOrder[] = [
    { ...sampleOrders[0], id: 'z1', lat: 21.0367, lng: 105.7826 },
  ];
  const zoneOne = computeClusterZoneGeometry(oneOrder);
  assert.ok(zoneOne);
  assert.equal(zoneOne.polygonCoords, null);
  assert.ok(zoneOne.radiusMeters >= 420);

  const threeOrders: DeliveryOrder[] = [
    { ...sampleOrders[0], id: 'z1', lat: 21.0367, lng: 105.7826 },
    { ...sampleOrders[1], id: 'z2', lat: 21.0167, lng: 105.805 },
    { ...sampleOrders[2], id: 'z3', lat: 20.995, lng: 105.801 },
  ];
  const hull = computeConvexHull(
    threeOrders.map((o) => ({ lat: o.lat!, lng: o.lng! }))
  );
  assert.equal(hull.length, 3);

  const zoneThree = computeClusterZoneGeometry(threeOrders);
  assert.ok(zoneThree);
  assert.ok(zoneThree.polygonCoords && zoneThree.polygonCoords.length === 3);
  assert.equal(zoneThree.pointCount, 3);
});

test('formatShortAddress and formatZoneLabel format concise Vietnamese map labels', () => {
  assert.equal(
    formatShortAddress('120 Xuân Thủy, Cầu Giấy, Hà Nội'),
    '120 Xuân Thủy'
  );
  assert.equal(
    formatZoneLabel('Cụm Cầu Giấy - Láng - Thanh Xuân', 3),
    'Khu vực: Cầu Giấy - Láng - Thanh Xuân (3 đơn)'
  );
  assert.equal(
    formatZoneLabel('Hoàng Mai - Linh Đàm', 2),
    'Khu vực: Hoàng Mai - Linh Đàm (2 đơn)'
  );
  assert.equal(
    formatZoneLabel('Tuyến 1: Cầu Giấy – Đường Láng (4 đơn)', 4),
    'Tuyến 1: Cầu Giấy – Đường Láng (4 đơn)'
  );
});

test('normalizeDeliveryState and getOrderClaimedShipper derive accurate delivery states', () => {
  assert.equal(normalizeDeliveryState(undefined, 'completed', '', ''), 'done');
  assert.equal(normalizeDeliveryState('delivering', 'pending', 'shipper1@shipper.vn', ''), 'delivering');
  assert.equal(normalizeDeliveryState('available', 'pending', '', ''), 'available');
  assert.equal(normalizeDeliveryState(undefined, 'pending', '', 'shipper2@shipper.vn'), 'delivering');
  assert.equal(
    getOrderClaimedShipper({ shipperEmail: 'shipper1@shipper.vn', shipper_assigned: '' }),
    'shipper1@shipper.vn'
  );
  assert.equal(
    getOrderClaimedShipper({ shipperEmail: '', shipper_assigned: 'shipper2@shipper.vn' }),
    'shipper2@shipper.vn'
  );
});

test('extractHanoiDistrictName and extractAvailableDistricts identify Hanoi districts cleanly', () => {
  assert.equal(
    extractHanoiDistrictName('120 Xuân Thủy, Cầu Giấy, Hà Nội'),
    'Cầu Giấy'
  );
  assert.equal(
    extractHanoiDistrictName('Tòa HH2A Linh Đàm, Hoàng Mai, Hà Nội'),
    'Hoàng Mai'
  );
  assert.equal(
    extractHanoiDistrictName('18 Ngõ 105 Nguyễn Trãi, Thanh Xuân'),
    'Thanh Xuân'
  );

  const districts = extractAvailableDistricts(sampleOrders);
  assert.deepEqual(districts, ['Cầu Giấy', 'Đống Đa', 'Hoàng Mai']);
});

test('sortOrdersByDistanceFromPoint sorts orders nearest to shipper GPS first', () => {
  const gps = { lat: 21.035, lng: 105.783 }; // Near Xuân Thủy, Cầu Giấy
  const geoOrders: DeliveryOrder[] = [
    { ...sampleOrders[2], id: 'far-hoangmai', status: 'pending', deliveryState: 'available', lat: 20.964, lng: 105.8285 },
    { ...sampleOrders[0], id: 'near-caugiay', deliveryState: 'available', lat: 21.0367, lng: 105.7826 },
    { ...sampleOrders[1], id: 'no-coords', deliveryState: 'available' },
  ];

  const sorted = sortOrdersByDistanceFromPoint(geoOrders, gps);
  assert.equal(sorted[0].order.id, 'near-caugiay');
  assert.ok(sorted[0].distanceKm !== null && sorted[0].distanceKm < 1.0);
  assert.equal(sorted[1].order.id, 'far-hoangmai');
  assert.equal(sorted[2].order.id, 'no-coords');
  assert.equal(sorted[2].distanceKm, null);
});

