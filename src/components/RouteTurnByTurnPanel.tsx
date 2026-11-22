import { Clock, LocateFixed, Navigation, Route } from 'lucide-react';
import type { OsrmRouteResult } from '../types/order';

interface RouteTurnByTurnPanelProps {
  route: OsrmRouteResult | null;
  loading: boolean;
  startLabel: string;
  gpsActive: boolean;
  gpsLoading: boolean;
  onRequestGps: () => void;
  onSelectLegOrder?: (orderId?: string) => void;
}

export function RouteTurnByTurnPanel({
  route,
  loading,
  startLabel,
  gpsActive,
  gpsLoading,
  onRequestGps,
  onSelectLegOrder,
}: RouteTurnByTurnPanelProps) {
  return (
    <section
      aria-label="Chỉ dẫn lộ trình từng chặng"
      className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
    >
      <div className="px-4 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Route className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
          <h3 className="text-sm font-bold text-slate-900">
            Chỉ dẫn lộ trình từng chặng
          </h3>
          {route && (
            <span
              className={`px-2 py-0.5 text-[10px] font-semibold rounded-md ${
                route.isFallback
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {route.isFallback ? 'Ước lượng' : 'Đường phố OSRM'}
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={gpsLoading}
          onClick={onRequestGps}
          className={`min-h-[32px] px-2.5 py-1 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
            gpsActive
              ? 'bg-blue-700 text-white hover:bg-blue-800'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
          }`}
        >
          <LocateFixed className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            {gpsLoading
              ? 'Đang lấy GPS...'
              : gpsActive
                ? 'GPS đang bật'
                : 'Định vị chấm xanh GPS'}
          </span>
        </button>
      </div>

      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-600">
          Xuất phát: <strong className="text-slate-900">{startLabel}</strong>
        </span>
        {route && route.legs.length > 0 && (
          <div className="flex items-center gap-3 font-semibold tabular-nums">
            <span className="text-blue-700 inline-flex items-center gap-1">
              <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
              {route.totalDistanceKm.toFixed(1)} km
            </span>
            <span className="text-slate-700 inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />~
              {route.totalDurationMinutes} phút
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-5 text-center text-xs text-slate-500">
          Đang tính lộ trình đường bộ thực tế theo từng con phố (OSRM)...
        </div>
      ) : !route || route.legs.length === 0 ? (
        <div className="p-5 text-center text-xs text-slate-500">
          Nhận ít nhất 1 đơn hàng vào mục &quot;Đơn của tôi đang giao&quot; hoặc chọn một tuyến trên bản đồ để xem chỉ dẫn từng chặng.
        </div>
      ) : (
        <ol className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto">
          {route.legs.map((leg) => (
            <li key={`${leg.legIndex}-${leg.orderId ?? leg.customerName}`}>
              <button
                type="button"
                onClick={() => onSelectLegOrder?.(leg.orderId)}
                className="w-full text-left px-4 py-3 hover:bg-blue-50/40 transition-colors flex items-start justify-between gap-3 cursor-pointer"
              >
                <div className="space-y-1 min-w-0">
                  <div className="text-xs font-bold text-slate-900">
                    <span className="text-blue-700 mr-1.5">Chặng {leg.legIndex}:</span>
                    Đến nhà {leg.customerName} - {leg.address}
                  </div>
                  {leg.streetSummary && (
                    <p className="text-[11px] text-slate-500 truncate">
                      Qua tuyến: {leg.streetSummary}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <div className="text-xs font-bold text-blue-700">
                    {leg.distanceKm.toFixed(1)} km
                  </div>
                  <div className="text-[11px] text-slate-500">
                    ~{leg.durationMinutes} phút
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
