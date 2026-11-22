import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractHanoiDistrictFallbackQuery,
  findHanoiDistrictAnchor,
  HANOI_BBOX,
  isValidHanoiCoordinate,
  normalizeHanoiSearchAddress,
  resolveHanoiDistrictFallback,
} from './hanoiGeocode';

test('normalizeHanoiSearchAddress strips house, alley, and building prefixes and appends Hà Nội, Việt Nam', () => {
  assert.equal(
    normalizeHanoiSearchAddress('ngõ 1194 đường Láng, Đống Đa'),
    'đường Láng, Đống Đa, Hà Nội, Việt Nam'
  );
  assert.equal(
    normalizeHanoiSearchAddress('tòa HH2B Linh Đàm'),
    'Bán đảo Linh Đàm, Hoàng Mai, Hà Nội, Việt Nam'
  );
  assert.equal(
    normalizeHanoiSearchAddress('Số 120 Xuân Thủy, Cầu Giấy'),
    'Xuân Thủy, Cầu Giấy, Hà Nội, Việt Nam'
  );
});

test('isValidHanoiCoordinate strictly enforces Hanoi bounding box and rejects Hai Phong / Thanh Hoa', () => {
  // Valid Hanoi coordinates
  assert.equal(isValidHanoiCoordinate(21.0313, 105.7885), true); // Cầu Giấy
  assert.equal(isValidHanoiCoordinate(20.9638, 105.8265), true); // Linh Đàm

  // Hải Phòng (~20.84, 106.68) -> rejected
  assert.equal(isValidHanoiCoordinate(20.8449, 106.6881), false);
  // Thanh Hóa (~19.80, 105.78) -> rejected
  assert.equal(isValidHanoiCoordinate(19.8067, 105.7852), false);
  // TP.HCM -> rejected
  assert.equal(isValidHanoiCoordinate(10.7769, 106.7009), false);
});

test('findHanoiDistrictAnchor matches all major districts and prioritizes Linh Đàm before Hoàng Mai', () => {
  const linhDam = findHanoiDistrictAnchor('Tòa HH2B Linh Đàm, Hoàng Mai, Hà Nội');
  assert.ok(linhDam);
  assert.equal(linhDam.districtLabel, 'Linh Đàm');
  assert.equal(linhDam.lat, 20.9638);
  assert.equal(linhDam.lng, 105.8265);

  const cauGiay = findHanoiDistrictAnchor('Trần Thái Tông, Dịch Vọng');
  assert.ok(cauGiay);
  assert.equal(cauGiay.districtLabel, 'Cầu Giấy');

  const haDong = findHanoiDistrictAnchor('Khu đô thị Văn Quán, Hà Đông');
  assert.ok(haDong);
  assert.equal(haDong.districtLabel, 'Hà Đông');
});

test('resolveHanoiDistrictFallback returns bounded Hanoi coords within ±0.002 jitter', () => {
  const f1 = resolveHanoiDistrictFallback('Ngõ 105 Nguyễn Trãi, Thanh Xuân', 'order-1');
  const f2 = resolveHanoiDistrictFallback('Ngõ 200 Nguyễn Trãi, Thanh Xuân', 'order-2');

  assert.equal(f1.districtLabel, 'Thanh Xuân');
  assert.equal(isValidHanoiCoordinate(f1.lat, f1.lng), true);
  assert.equal(isValidHanoiCoordinate(f2.lat, f2.lng), true);
  assert.ok(Math.abs(f1.lat - 20.9953) <= 0.002 + 1e-6);
  assert.ok(Math.abs(f1.lng - 105.8067) <= 0.002 + 1e-6);
  assert.notEqual(f1.lat, f2.lat);
  assert.ok(
    f1.lat >= HANOI_BBOX.minLat &&
      f1.lat <= HANOI_BBOX.maxLat &&
      f1.lng >= HANOI_BBOX.minLng &&
      f1.lng <= HANOI_BBOX.maxLng
  );
});

test('extractHanoiDistrictFallbackQuery builds district query for second Nominatim pass', () => {
  assert.equal(
    extractHanoiDistrictFallbackQuery('120 Xuân Thủy, Cầu Giấy'),
    'Quận Cầu Giấy, Hà Nội, Việt Nam'
  );
});
