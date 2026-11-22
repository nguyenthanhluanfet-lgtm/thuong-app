import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFallbackRoute,
  buildOsrmDrivingUrl,
  convertGeoJsonCoordsToLeaflet,
  parseOsrmRouteResponse,
  type RouteStopMeta,
} from './osrmRouting';

const sampleStart = { lat: 21.0031, lng: 105.8201 };
const sampleStops: RouteStopMeta[] = [
  {
    orderId: 'o1',
    customerName: 'Anh Tuấn',
    address: '15 Trần Thái Tông, Cầu Giấy, Hà Nội',
    lat: 21.0313,
    lng: 105.7885,
  },
  {
    orderId: 'o2',
    customerName: 'Chị Lan',
    address: '88 Nguyễn Trãi, Thanh Xuân, Hà Nội',
    lat: 20.9953,
    lng: 105.8067,
  },
];

test('buildOsrmDrivingUrl formats lng,lat waypoints for OSRM API', () => {
  const url = buildOsrmDrivingUrl([
    sampleStart,
    { lat: sampleStops[0].lat, lng: sampleStops[0].lng },
  ]);
  assert.ok(url.startsWith('https://router.project-osrm.org/route/v1/driving/'));
  assert.ok(url.includes('105.820100,21.003100;105.788500,21.031300'));
  assert.ok(url.includes('overview=full&geometries=geojson&steps=true'));
});

test('convertGeoJsonCoordsToLeaflet swaps [lng, lat] pairs to [lat, lng]', () => {
  const converted = convertGeoJsonCoordsToLeaflet([
    [105.8201, 21.0031],
    [105.7885, 21.0313],
  ]);
  assert.deepEqual(converted, [
    [21.0031, 105.8201],
    [21.0313, 105.7885],
  ]);
});

test('parseOsrmRouteResponse extracts road polyline and per-leg distance/duration instructions', () => {
  const mockOsrm = {
    code: 'Ok',
    routes: [
      {
        distance: 3700,
        duration: 660,
        geometry: {
          coordinates: [
            [105.8201, 21.0031],
            [105.81, 21.015],
            [105.7885, 21.0313],
            [105.8067, 20.9953],
          ],
        },
        legs: [
          {
            distance: 1200,
            duration: 240,
            steps: [{ name: 'Đường Láng' }, { name: 'Trần Thái Tông' }],
          },
          {
            distance: 2500,
            duration: 420,
            steps: [{ name: 'Khuất Duy Tiến' }, { name: 'Nguyễn Trãi' }],
          },
        ],
      },
    ],
  };

  const parsed = parseOsrmRouteResponse(mockOsrm, sampleStart, sampleStops);
  assert.ok(parsed);
  assert.equal(parsed.isFallback, false);
  assert.equal(parsed.coordinates.length, 4);
  assert.deepEqual(parsed.coordinates[0], [21.0031, 105.8201]);
  assert.equal(parsed.totalDistanceKm, 3.7);
  assert.equal(parsed.totalDurationMinutes, 11);
  assert.equal(parsed.legs.length, 2);
  assert.equal(parsed.legs[0].customerName, 'Anh Tuấn');
  assert.equal(parsed.legs[0].distanceKm, 1.2);
  assert.equal(parsed.legs[0].durationMinutes, 4);
  assert.equal(parsed.legs[0].streetSummary, 'Đường Láng → Trần Thái Tông');
  assert.equal(parsed.legs[1].durationMinutes, 7);
});

test('buildFallbackRoute produces consistent road estimates when OSRM is unavailable', () => {
  const fallback = buildFallbackRoute(sampleStart, sampleStops);
  assert.equal(fallback.isFallback, true);
  assert.equal(fallback.coordinates.length, 3);
  assert.equal(fallback.legs.length, 2);
  assert.ok(fallback.totalDistanceKm > 0);
  assert.ok(fallback.totalDurationMinutes >= 4);
});
