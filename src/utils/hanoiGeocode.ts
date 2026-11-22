export const HANOI_BBOX = {
  minLat: 20.85,
  maxLat: 21.25,
  minLng: 105.6,
  maxLng: 106.05,
} as const;

export const HANOI_VIEWBOX = '105.65,21.15,105.98,20.90';

export interface HanoiDistrictAnchor {
  districtLabel: string;
  queryDistrict: string;
  keywords: string[];
  lat: number;
  lng: number;
}

/**
 * Standard Hanoi district/area anchor coordinates.
 * Order matters: specific neighborhoods like "Linh Đàm" are checked before broader "Hoàng Mai".
 */
export const HANOI_DISTRICT_ANCHORS: HanoiDistrictAnchor[] = [
  {
    districtLabel: 'Linh Đàm',
    queryDistrict: 'Bán đảo Linh Đàm, Hoàng Mai, Hà Nội, Việt Nam',
    keywords: ['linh dam', 'hh1', 'hh2', 'hh3', 'hh4', 'ban dao linh dam'],
    lat: 20.9638,
    lng: 105.8265,
  },
  {
    districtLabel: 'Cầu Giấy',
    queryDistrict: 'Quận Cầu Giấy, Hà Nội, Việt Nam',
    keywords: ['cau giay', 'tran thai tong', 'dich vong', 'xuan thuy', 'trung hoa', 'ho tung mau'],
    lat: 21.0313,
    lng: 105.7885,
  },
  {
    districtLabel: 'Đống Đa',
    queryDistrict: 'Quận Đống Đa, Hà Nội, Việt Nam',
    keywords: ['duong lang', 'dong da', 'chua lang', 'thai ha', 'tay son', 'xa dan', 'o cho dua', 'lang ha'],
    lat: 21.0152,
    lng: 105.8055,
  },
  {
    districtLabel: 'Thanh Xuân',
    queryDistrict: 'Quận Thanh Xuân, Hà Nội, Việt Nam',
    keywords: ['thanh xuan', 'nguyen trai', 'khuat duy tien', 'le van luong', 'nhan chinh', 'khuong trung'],
    lat: 20.9953,
    lng: 105.8067,
  },
  {
    districtLabel: 'Hoàng Mai',
    queryDistrict: 'Quận Hoàng Mai, Hà Nội, Việt Nam',
    keywords: ['hoang mai', 'tan mai', 'giai phong', 'truong dinh', 'dinh cong', 'tam trinh', 'vinh hung'],
    lat: 20.9815,
    lng: 105.8492,
  },
  {
    districtLabel: 'Hai Bà Trưng',
    queryDistrict: 'Quận Hai Bà Trưng, Hà Nội, Việt Nam',
    keywords: ['hai ba trung', 'bach mai', 'minh khai', 'pho hue', 'dai co viet', 'times city'],
    lat: 21.0091,
    lng: 105.8546,
  },
  {
    districtLabel: 'Hoàn Kiếm',
    queryDistrict: 'Quận Hoàn Kiếm, Hà Nội, Việt Nam',
    keywords: ['hoan kiem', 'hang bong', 'trang tien', 'hang bai', 'ho guom', 'pho co'],
    lat: 21.0285,
    lng: 105.8542,
  },
  {
    districtLabel: 'Ba Đình',
    queryDistrict: 'Quận Ba Đình, Hà Nội, Việt Nam',
    keywords: ['ba dinh', 'kim ma', 'doi can', 'lieu giai', 'giang vo', 'hoang hoa tham'],
    lat: 21.0341,
    lng: 105.8372,
  },
  {
    districtLabel: 'Hà Đông',
    queryDistrict: 'Quận Hà Đông, Hà Nội, Việt Nam',
    keywords: ['ha dong', 'van quan', 'mo lao', 'xa la', 'la khe', 'to huu'],
    lat: 20.9719,
    lng: 105.7788,
  },
  {
    districtLabel: 'Long Biên',
    queryDistrict: 'Quận Long Biên, Hà Nội, Việt Nam',
    keywords: ['long bien', 'nguyen van cu', 'ngoc lam', 'viet hung', 'sai dong', 'co linh'],
    lat: 21.0365,
    lng: 105.895,
  },
  {
    districtLabel: 'Tây Hồ',
    queryDistrict: 'Quận Tây Hồ, Hà Nội, Việt Nam',
    keywords: ['tay ho', 'lac long quan', 'au co', 'xuan dieu', 'vo chi cong', 'thuy khue'],
    lat: 21.0686,
    lng: 105.8245,
  },
  {
    districtLabel: 'Nam Từ Liêm',
    queryDistrict: 'Quận Nam Từ Liêm, Hà Nội, Việt Nam',
    keywords: ['nam tu liem', 'my dinh', 'me tri', 'trung van', 'pham hung', 'le duc tho'],
    lat: 21.0282,
    lng: 105.7663,
  },
  {
    districtLabel: 'Bắc Từ Liêm',
    queryDistrict: 'Quận Bắc Từ Liêm, Hà Nội, Việt Nam',
    keywords: ['bac tu liem', 'co nhue', 'pham van dong', 'xuan dinh', 'nhon'],
    lat: 21.0645,
    lng: 105.7538,
  },
];

export function stripVietnameseDiacritics(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function isValidHanoiCoordinate(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= HANOI_BBOX.minLat &&
    lat <= HANOI_BBOX.maxLat &&
    lng >= HANOI_BBOX.minLng &&
    lng <= HANOI_BBOX.maxLng
  );
}

export function findHanoiDistrictAnchor(address: string): HanoiDistrictAnchor | null {
  const normalized = stripVietnameseDiacritics(address);
  if (!normalized) return null;

  for (const anchor of HANOI_DISTRICT_ANCHORS) {
    if (anchor.keywords.some((kw) => normalized.includes(kw))) {
      return anchor;
    }
  }
  return null;
}

/**
 * Cleans a raw Vietnamese address for geocoding:
 * - Removes house numbers, alley/lane numbers, building/floor/room prefixes
 * - Special-cases "Linh Đàm" -> "Bán đảo Linh Đàm, Hoàng Mai"
 * - Appends ", Hà Nội, Việt Nam" if not already specified
 */
export function normalizeHanoiSearchAddress(
  rawAddress: string,
  aiSearchHint?: string
): string {
  const source = (aiSearchHint || '').trim() || (rawAddress || '').trim();
  if (!source || source === 'Chưa rõ địa chỉ') {
    return 'Hà Nội, Việt Nam';
  }

  let cleaned = source
    .replace(/\s+/g, ' ')
    // Remove building/floor/room tokens (e.g. "Tòa HH2B", "Chung cư A1", "Phòng 502", "Tầng 3")
    .replace(
      /\b(tòa nhà|tòa|toà|chung cư|cc|tầng|lầu|phòng|p\.?|căn hộ|căn|lô|kiot|ki-ốt|sảnh)\s+[a-z0-9./-]+/gi,
      ' '
    )
    // Remove lane/alley tokens (e.g. "ngõ 1194", "ngách 12/3", "hẻm 45", "kiệt 5")
    .replace(/\b(ngõ|ngách|hẻm|kiệt|xóm|tổ)\s+[0-9a-z./-]+/gi, ' ')
    // Remove house numbers at start or after comma/dash (e.g. "Số 18 ", "120 ", "18A/2 ")
    .replace(/(^|,|\s-\s)\s*(số nhà|số|sn)?\s*\d+[a-z]?([/-]\d+[a-z]?)*\s+(?=[a-zA-ZÀ-ỹ])/gi, '$1 ')
    // Clean redundant separators
    .replace(/\s*[-–]\s*/g, ', ')
    .replace(/,\s*,+/g, ',')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();

  // Normalize "Linh Đàm" if building prefix stripped leaving just "Linh Đàm"
  if (/linh\s*[đd][àa]m/i.test(cleaned) && !/bán đảo linh đàm/i.test(cleaned)) {
    cleaned = cleaned.replace(/linh\s*[đd][àa]m/i, 'Bán đảo Linh Đàm');
    if (!/hoàng mai/i.test(cleaned)) {
      cleaned = `${cleaned}, Hoàng Mai`;
    }
  }

  if (!cleaned) {
    const anchor = findHanoiDistrictAnchor(rawAddress);
    return anchor ? anchor.queryDistrict : 'Hà Nội, Việt Nam';
  }

  const ascii = stripVietnameseDiacritics(cleaned);
  if (!ascii.includes('ha noi')) {
    cleaned = `${cleaned}, Hà Nội, Việt Nam`;
  } else if (!ascii.includes('viet nam')) {
    cleaned = `${cleaned}, Việt Nam`;
  }

  return cleaned;
}

export function extractHanoiDistrictFallbackQuery(
  rawAddress: string,
  searchAddress?: string
): string | null {
  const anchor = findHanoiDistrictAnchor(`${searchAddress ?? ''} ${rawAddress}`);
  if (anchor) {
    return anchor.queryDistrict;
  }

  const parts = (searchAddress || rawAddress)
    .split(',')
    .map((p) => p.trim())
    .filter(
      (p) =>
        p.length > 0 &&
        !/^(hà nội|ha noi|việt nam|viet nam)$/i.test(p)
    );
  if (parts.length >= 2) {
    return `${parts[parts.length - 1]}, Hà Nội, Việt Nam`;
  }
  return null;
}

function deterministicUnitJitter(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  // Map hash to [-1, 1]
  return ((Math.abs(hash) % 2001) - 1000) / 1000;
}

export function resolveHanoiDistrictFallback(
  address: string,
  seed?: string
): { lat: number; lng: number; districtLabel: string } {
  const anchor = findHanoiDistrictAnchor(address);
  const base = anchor ?? {
    districtLabel: 'Hà Nội',
    lat: 21.0285,
    lng: 105.8542,
  };

  const jitterLat = seed
    ? deterministicUnitJitter(`${seed}:lat`) * 0.002
    : (Math.random() * 2 - 1) * 0.002;
  const jitterLng = seed
    ? deterministicUnitJitter(`${seed}:lng`) * 0.002
    : (Math.random() * 2 - 1) * 0.002;

  const lat = Number(
    Math.min(HANOI_BBOX.maxLat, Math.max(HANOI_BBOX.minLat, base.lat + jitterLat)).toFixed(6)
  );
  const lng = Number(
    Math.min(HANOI_BBOX.maxLng, Math.max(HANOI_BBOX.minLng, base.lng + jitterLng)).toFixed(6)
  );

  return {
    lat,
    lng,
    districtLabel: base.districtLabel,
  };
}
