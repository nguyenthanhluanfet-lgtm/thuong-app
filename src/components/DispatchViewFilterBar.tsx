import {
  Layers,
  ListFilter,
  LocateFixed,
  MapPin,
  Navigation2,
} from 'lucide-react';
import type { DispatchViewMode, GeoPoint } from '../types/order';

interface DispatchViewFilterBarProps {
  viewMode: DispatchViewMode;
  onChangeViewMode: (mode: DispatchViewMode) => void;
  radiusKm: number;
  onChangeRadiusKm: (km: number) => void;
  districts: string[];
  selectedDistrict: string;
  onChangeDistrict: (district: string) => void;
  gpsCoords: GeoPoint | null;
  gpsLoading: boolean;
  gpsError: string;
  onRequestGps: () => void;
}

export function DispatchViewFilterBar({
  viewMode,
  onChangeViewMode,
  radiusKm,
  onChangeRadiusKm,
  districts,
  selectedDistrict,
  onChangeDistrict,
  gpsCoords,
  gpsLoading,
  gpsError,
  onRequestGps,
}: DispatchViewFilterBarProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 space-y-3">
      <div
        role="tablist"
        aria-label="Chế độ lọc và hiển thị đơn hàng"
        className="grid grid-cols-2 lg:grid-cols-4 gap-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'clusters'}
          onClick={() => onChangeViewMode('clusters')}
          className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold border inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            viewMode === 'clusters'
              ? 'bg-blue-700 border-blue-700 text-white shadow-xs'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Gom cụm bán kính</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'district'}
          onClick={() => onChangeViewMode('district')}
          className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold border inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            viewMode === 'district'
              ? 'bg-blue-700 border-blue-700 text-white shadow-xs'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Lọc theo Quận / Huyện</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'nearest_gps'}
          onClick={() => {
            onChangeViewMode('nearest_gps');
            onRequestGps();
          }}
          className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold border inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            viewMode === 'nearest_gps'
              ? 'bg-blue-700 border-blue-700 text-white shadow-xs'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Navigation2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>📍 Đơn gần vị trí của tôi</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={viewMode === 'all_flat'}
          onClick={() => onChangeViewMode('all_flat')}
          className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-semibold border inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            viewMode === 'all_flat'
              ? 'bg-blue-700 border-blue-700 text-white shadow-xs'
              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <ListFilter className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Hiện tất cả đơn</span>
        </button>
      </div>

      {/* Mode-specific secondary controls */}
      {viewMode === 'clusters' && (
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label
            htmlFor="filter-bar-radius-slider"
            className="text-xs font-semibold text-slate-700"
          >
            Bán kính gom cụm (1 km – 5 km):
          </label>
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <span className="text-[11px] font-mono text-slate-500 shrink-0">1 km</span>
            <input
              id="filter-bar-radius-slider"
              type="range"
              min={1}
              max={5}
              step={0.5}
              value={radiusKm}
              onChange={(e) => onChangeRadiusKm(Number(e.target.value))}
              className="w-full accent-blue-700 cursor-pointer"
            />
            <span className="text-[11px] font-mono text-slate-500 shrink-0">5 km</span>
            <span className="px-2.5 py-0.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-bold text-blue-800 tabular-nums whitespace-nowrap">
              {radiusKm.toFixed(1)} km
            </span>
          </div>
        </div>
      )}

      {viewMode === 'district' && (
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-2.5">
          <label
            htmlFor="district-filter-select"
            className="text-xs font-semibold text-slate-700 shrink-0"
          >
            Chọn Quận / Huyện Hà Nội:
          </label>
          <select
            id="district-filter-select"
            value={selectedDistrict}
            onChange={(e) => onChangeDistrict(e.target.value)}
            className="min-h-[40px] px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-700"
          >
            <option value="ALL">Tất cả quận ({districts.length} khu vực)</option>
            {districts.map((dist) => (
              <option key={dist} value={dist}>
                {dist}
              </option>
            ))}
          </select>
        </div>
      )}

      {viewMode === 'nearest_gps' && (
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
          <div className="text-xs text-slate-600">
            {gpsLoading ? (
              <span className="font-medium text-blue-700">
                Đang lấy tọa độ GPS trình duyệt...
              </span>
            ) : gpsCoords ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" aria-hidden="true" />
                <span>
                  GPS của bạn: {gpsCoords.lat.toFixed(4)}, {gpsCoords.lng.toFixed(4)}
                </span>
              </span>
            ) : (
              <span className="text-amber-800">
                {gpsError || 'Chưa có GPS trực tiếp — đang xếp theo khoảng cách gần Kho Shop.'}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={gpsLoading}
            onClick={onRequestGps}
            className="min-h-[34px] px-3 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-60 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
          >
            <LocateFixed className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{gpsLoading ? 'Đang định vị...' : 'Cập nhật GPS'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
