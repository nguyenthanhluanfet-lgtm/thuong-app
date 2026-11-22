import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Hand,
  Image as ImageIcon,
  Key,
  LogOut,
  MapPin,
  Navigation,
  PackagePlus,
  Phone,
  RotateCcw,
  Route,
  Store,
  Truck,
  Undo2,
} from 'lucide-react';
import {
  claimOrdersAtomic,
  logoutUser,
  markOrderCompleted,
  releaseClaimedOrderAtomic,
} from '../lib/firebase';
import type {
  ClusterGroup,
  DeliveryOrder,
  DispatchConfig,
  DispatchViewMode,
  GeoPoint,
  OsrmRouteResult,
} from '../types/order';
import {
  buildTelHref,
  clusterOrdersByRadius,
  DEFAULT_DISPATCH_CONFIG,
  extractAvailableDistricts,
  extractHanoiDistrictName,
  formatShortAddress,
  getOrderClaimedShipper,
  hasOrderCoordinates,
  matchesShipperIdentity,
  orderStopsNearestNeighbor,
  sortOrdersByDistanceFromPoint,
} from '../utils/dispatch';
import { fetchOsrmDrivingRoute } from '../utils/osrmRouting';
import { DeliveryClusterMap, getClusterDotClass } from './DeliveryClusterMap';
import { DispatchViewFilterBar } from './DispatchViewFilterBar';
import { KeySetupModal } from './KeySetupModal';
import { ProofImageModal } from './ProofImageModal';
import { ProofOfDeliveryModal } from './ProofOfDeliveryModal';
import { RouteTurnByTurnPanel } from './RouteTurnByTurnPanel';

interface ShipperDashboardProps {
  userEmail: string;
  orders: DeliveryOrder[];
  loadingOrders: boolean;
  firestoreError: string;
  dispatchConfig?: DispatchConfig;
}

type ShipperWorkspaceTab = 'pool' | 'mine' | 'completed';

export function ShipperDashboard({
  userEmail,
  orders,
  loadingOrders,
  firestoreError,
  dispatchConfig = DEFAULT_DISPATCH_CONFIG,
}: ShipperDashboardProps) {
  const [workspaceTab, setWorkspaceTab] = useState<ShipperWorkspaceTab>('pool');
  const [viewMode, setViewMode] = useState<DispatchViewMode>('clusters');
  const [radiusKm, setRadiusKm] = useState<number>(
    dispatchConfig.radiusKm || 3.0
  );
  const [selectedDistrict, setSelectedDistrict] = useState<string>('ALL');
  const [focusedCluster, setFocusedCluster] = useState<string>('ALL');
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);

  // Live Shipper GPS state
  const [shipperGps, setShipperGps] = useState<GeoPoint | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const watchIdRef = useRef<number | null>(null);

  // OSRM street route state
  const [osrmRoute, setOsrmRoute] = useState<OsrmRouteResult | null>(null);
  const [osrmLoading, setOsrmLoading] = useState(false);

  // Action states (claim, release, complete)
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [releasingIds, setReleasingIds] = useState<Record<string, boolean>>({});
  const [completingIds, setCompletingIds] = useState<Record<string, boolean>>({});
  const [selectedOrderForProof, setSelectedOrderForProof] = useState<DeliveryOrder | null>(null);
  const [viewingProofOrder, setViewingProofOrder] = useState<DeliveryOrder | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    setRadiusKm(dispatchConfig.radiusKm || 3.0);
  }, [dispatchConfig.radiusKm]);

  useEffect(() => {
    return () => {
      if (
        watchIdRef.current !== null &&
        typeof navigator !== 'undefined' &&
        navigator.geolocation
      ) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const requestShipperGps = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Trình duyệt không hỗ trợ định vị GPS.');
      return;
    }

    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setShipperGps({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setGpsLoading(false);

        if (watchIdRef.current === null) {
          watchIdRef.current = navigator.geolocation.watchPosition(
            (nextPos) => {
              setShipperGps({
                lat: Number(nextPos.coords.latitude.toFixed(6)),
                lng: Number(nextPos.coords.longitude.toFixed(6)),
              });
            },
            () => {
              // Keep last known GPS coordinate on transient watch error
            },
            { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
          );
        }
      },
      (err) => {
        setGpsLoading(false);
        setGpsError(
          err.code === 1
            ? 'Bạn đã từ chối quyền GPS — đang dùng vị trí Kho Shop làm mốc.'
            : 'Không lấy được tín hiệu GPS — đang dùng vị trí Kho Shop làm mốc.'
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
    );
  }, []);

  const routeStartPoint: GeoPoint = useMemo(
    () =>
      shipperGps ?? {
        lat: dispatchConfig.shopOrigin.lat,
        lng: dispatchConfig.shopOrigin.lng,
      },
    [shipperGps, dispatchConfig.shopOrigin.lat, dispatchConfig.shopOrigin.lng]
  );

  const routeStartLabel = shipperGps
    ? `Vị trí GPS của bạn (${shipperGps.lat.toFixed(4)}, ${shipperGps.lng.toFixed(4)})`
    : `Kho Shop (${formatShortAddress(dispatchConfig.shopOrigin.address, 30)})`;

  // Orders claimed by current shipper ("Đơn của tôi đang giao")
  const myDeliveringOrders = useMemo(() => {
    const mine = orders.filter(
      (o) =>
        o.deliveryState === 'delivering' &&
        matchesShipperIdentity(getOrderClaimedShipper(o), userEmail)
    );
    return orderStopsNearestNeighbor(mine, routeStartPoint);
  }, [orders, userEmail, routeStartPoint]);

  const pendingOrdersAll = useMemo(
    () => orders.filter((o) => o.deliveryState !== 'done'),
    [orders]
  );

  const availableOrdersAll = useMemo(
    () => orders.filter((o) => o.deliveryState === 'available'),
    [orders]
  );

  const completedOrdersAll = useMemo(
    () => orders.filter((o) => o.deliveryState === 'done'),
    [orders]
  );

  const availableDistricts = useMemo(
    () => extractAvailableDistricts(pendingOrdersAll),
    [pendingOrdersAll]
  );

  // Cluster view (1 - 5 km slider)
  const pendingClusters = useMemo(
    () =>
      clusterOrdersByRadius(pendingOrdersAll, radiusKm, {
        shopOrigin: dispatchConfig.shopOrigin,
        maxOrdersPerShipper: dispatchConfig.maxOrdersPerShipper,
      }).filter((c) => c.pendingOrders.length > 0),
    [pendingOrdersAll, radiusKm, dispatchConfig.shopOrigin, dispatchConfig.maxOrdersPerShipper]
  );

  // District filtered list
  const districtFilteredOrders = useMemo(() => {
    if (selectedDistrict === 'ALL') return pendingOrdersAll;
    return pendingOrdersAll.filter(
      (o) => extractHanoiDistrictName(o.dia_chi, o.cum_khu_vuc) === selectedDistrict
    );
  }, [pendingOrdersAll, selectedDistrict]);

  // Nearest GPS sorted available orders
  const nearestAvailableOrders = useMemo(
    () => sortOrdersByDistanceFromPoint(availableOrdersAll, routeStartPoint),
    [availableOrdersAll, routeStartPoint]
  );

  // Build synthetic ClusterGroup for the Map when viewing "Đơn của tôi đang giao" or focused cluster
  const myRouteCluster: ClusterGroup | null = useMemo(() => {
    if (myDeliveringOrders.length === 0) return null;
    return {
      clusterName: `Đơn của tôi đang giao (${myDeliveringOrders.length} đơn)`,
      color: '#1d4ed8',
      orders: myDeliveringOrders,
      pendingOrders: myDeliveringOrders,
      completedOrders: [],
      assignedShippers: [userEmail],
      primaryShipper: userEmail,
      googleMapsUrl: 'https://www.google.com/maps',
      totalDistanceKm: osrmRoute?.totalDistanceKm ?? 0,
    };
  }, [myDeliveringOrders, osrmRoute?.totalDistanceKm, userEmail]);

  const mapClusters = useMemo(() => {
    if (workspaceTab === 'mine' && myRouteCluster) {
      return [myRouteCluster];
    }
    if (myRouteCluster && focusedCluster === 'ALL') {
      return [myRouteCluster, ...pendingClusters.filter((c) => c.pendingOrders.some((o) => o.deliveryState === 'available'))];
    }
    return pendingClusters;
  }, [workspaceTab, myRouteCluster, focusedCluster, pendingClusters]);

  // Determine which sequence of orders to fetch OSRM driving route for
  const activeOsrmTargetOrders = useMemo(() => {
    if (myDeliveringOrders.length > 0) {
      return myDeliveringOrders;
    }
    if (focusedCluster !== 'ALL') {
      const target = pendingClusters.find((c) => c.clusterName === focusedCluster);
      if (target) return target.pendingOrders;
    }
    return [];
  }, [myDeliveringOrders, focusedCluster, pendingClusters]);

  const activeRouteKey = useMemo(() => {
    const startKey = `${routeStartPoint.lat.toFixed(4)},${routeStartPoint.lng.toFixed(4)}`;
    const stopsKey = activeOsrmTargetOrders
      .filter(hasOrderCoordinates)
      .map((o) => `${o.id}:${o.lat.toFixed(5)},${o.lng.toFixed(5)}`)
      .join('|');
    return `${startKey}=>${stopsKey}`;
  }, [routeStartPoint, activeOsrmTargetOrders]);

  useEffect(() => {
    if (activeOsrmTargetOrders.filter(hasOrderCoordinates).length === 0) {
      setOsrmRoute(null);
      setOsrmLoading(false);
      return;
    }

    const controller = new AbortController();
    setOsrmLoading(true);
    fetchOsrmDrivingRoute(routeStartPoint, activeOsrmTargetOrders, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) {
          setOsrmRoute(res);
          setOsrmLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setOsrmLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeRouteKey]);

  async function handleClaimOrders(orderIds: string[], actionKey: string) {
    if (orderIds.length === 0) return;
    setActionFeedback(null);
    setClaimingKey(actionKey);
    try {
      const { claimedIds, skippedIds } = await claimOrdersAtomic(orderIds, userEmail);
      if (claimedIds.length === 0) {
        setActionFeedback({
          type: 'error',
          message: 'Rất tiếc, đơn này vừa được shipper khác nhận trước bạn.',
        });
      } else if (skippedIds.length > 0) {
        setActionFeedback({
          type: 'success',
          message: `Đã nhận ${claimedIds.length} đơn vào lộ trình của bạn (${skippedIds.length} đơn đã có người nhận trước).`,
        });
      } else {
        setActionFeedback({
          type: 'success',
          message:
            claimedIds.length === 1
              ? 'Đã nhận đơn vào mục "Đơn của tôi đang giao".'
              : `Đã nhận ${claimedIds.length} đơn trong cụm vào mục "Đơn của tôi đang giao".`,
        });
      }
    } catch (err: unknown) {
      setActionFeedback({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Không thể nhận đơn. Vui lòng thử lại.',
      });
    } finally {
      setClaimingKey(null);
    }
  }

  async function handleReleaseOrder(orderId: string) {
    setActionFeedback(null);
    setReleasingIds((prev) => ({ ...prev, [orderId]: true }));
    try {
      await releaseClaimedOrderAtomic(orderId, userEmail);
      setActionFeedback({
        type: 'success',
        message: 'Đã hủy nhận đơn và trả lại danh sách Chờ nhận.',
      });
    } catch (err: unknown) {
      setActionFeedback({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Không thể hủy nhận đơn này.',
      });
    } finally {
      setReleasingIds((prev) => ({ ...prev, [orderId]: false }));
    }
  }

  async function handleCompleteOrderWithProof(orderId: string, proofBase64: string) {
    setActionFeedback(null);
    setCompletingIds((prev) => ({ ...prev, [orderId]: true }));
    try {
      await markOrderCompleted(orderId, userEmail, proofBase64);
      setActionFeedback({
        type: 'success',
        message: 'Đã xác nhận giao hàng và lưu ảnh bằng chứng thành công!',
      });
    } catch (err: unknown) {
      setActionFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Không thể hoàn tất đơn hàng. Vui lòng thử lại.',
      });
    } finally {
      setCompletingIds((prev) => ({ ...prev, [orderId]: false }));
    }
  }

  function renderOrderStatusAndActions(order: DeliveryOrder, distanceKm?: number | null) {
    const claimedBy = getOrderClaimedShipper(order);
    const isMine =
      order.deliveryState === 'delivering' &&
      matchesShipperIdentity(claimedBy, userEmail);
    const isClaimedByOther =
      order.deliveryState === 'delivering' && !isMine;
    const isClaimingThis = claimingKey === `order:${order.id}`;
    const isReleasing = Boolean(releasingIds[order.id]);
    const isCompleting = Boolean(completingIds[order.id]);
    const districtLabel = extractHanoiDistrictName(order.dia_chi, order.cum_khu_vuc);

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold">
              {districtLabel}
            </span>
            {typeof distanceKm === 'number' && (
              <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-bold tabular-nums">
                Cách ~{distanceKm.toFixed(1)} km
              </span>
            )}
            {order.deliveryState === 'available' && (
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                Chờ nhận
              </span>
            )}
            {order.deliveryState === 'delivering' && (
              <span className="px-2.5 py-0.5 rounded-md bg-orange-50 border border-orange-300 text-orange-800 text-[11px] font-bold inline-flex items-center gap-1">
                <span>🚚 Đang giao bởi: {claimedBy || 'Shipper'}</span>
              </span>
            )}
            {order.deliveryState === 'done' && (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold">
                ✓ Đã giao xong
              </span>
            )}
          </div>

          {order.sdt && (
            <a
              href={buildTelHref(order.sdt)}
              className="min-h-[38px] px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl inline-flex items-center gap-1.5 text-xs font-mono font-semibold tabular-nums shrink-0"
            >
              <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{order.sdt}</span>
            </a>
          )}
        </div>

        <div>
          <h4 className="text-base font-bold text-slate-900">{order.ten_khach}</h4>
          <p className="mt-1 text-sm text-slate-700 flex items-start gap-1.5 leading-relaxed">
            <MapPin className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{order.dia_chi}</span>
          </p>
          {order.ghi_chu && (
            <div className="mt-2 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs sm:text-sm text-amber-950">
              <span className="font-semibold">Ghi chú: </span>
              {order.ghi_chu}
            </div>
          )}
        </div>

        {order.deliveryState === 'available' && (
          <button
            type="button"
            disabled={isClaimingThis}
            onClick={() => handleClaimOrders([order.id], `order:${order.id}`)}
            className="w-full min-h-[44px] px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Hand className="w-4 h-4" aria-hidden="true" />
            <span>{isClaimingThis ? 'Đang nhận đơn...' : '✋ Nhận đơn này'}</span>
          </button>
        )}

        {isClaimedByOther && (
          <button
            type="button"
            disabled
            className="w-full min-h-[42px] px-4 py-2 bg-slate-100 text-slate-500 border border-slate-200 text-xs font-semibold rounded-xl cursor-not-allowed"
          >
            Đã khóa · Đang giao bởi {claimedBy}
          </button>
        )}

        {isMine && (
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              disabled={isReleasing || isCompleting}
              onClick={() => handleReleaseOrder(order.id)}
              className="min-h-[44px] px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
            >
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isReleasing ? 'Đang hủy...' : '↩️ Hủy nhận'}</span>
            </button>
            <button
              type="button"
              disabled={isCompleting || isReleasing}
              onClick={() => setSelectedOrderForProof(order)}
              className="flex-1 min-h-[44px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-bold rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              <span>
                {isCompleting ? 'Đang cập nhật...' : '✓ Xác nhận đã giao xong'}
              </span>
            </button>
          </div>
        )}

        {order.proofImage && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setViewingProofOrder(order)}
              className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ImageIcon className="w-4 h-4" aria-hidden="true" />
              <span>🖼️ Xem ảnh giao hàng</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
              <Truck className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-base font-bold text-slate-900 whitespace-nowrap">
              ShipFlow
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right leading-tight">
              <div className="text-xs font-semibold text-slate-900 truncate max-w-[155px] sm:max-w-[240px]">
                {userEmail}
              </div>
              <div className="text-[11px] font-medium text-emerald-700">Shipper</div>
            </div>
            <button
              type="button"
              onClick={() => setShowKeyModal(true)}
              className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Key className="w-3.5 h-3.5" aria-hidden="true" />
              <span>⚙️ Cấu hình Key</span>
            </button>
            <button
              type="button"
              onClick={() => logoutUser()}
              aria-label="Đăng xuất khỏi tài khoản Shipper"
              className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Header + Origin Banner + Main Workspace Tabs */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-bold text-slate-900">
              Điều phối &amp; Lộ trình giao hàng trực tiếp
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs font-medium text-amber-900">
              <Store className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
              <span>Kho Shop: {dispatchConfig.shopOrigin.address}</span>
            </span>
          </div>

          <div
            role="tablist"
            aria-label="Phân khu làm việc Shipper"
            className="grid grid-cols-3 gap-1.5 p-1 bg-slate-200/70 rounded-xl"
          >
            <button
              type="button"
              role="tab"
              aria-selected={workspaceTab === 'mine'}
              onClick={() => {
                setWorkspaceTab('mine');
                setFocusedCluster('ALL');
              }}
              className={`min-h-[44px] px-2.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                workspaceTab === 'mine'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Đơn của tôi đang giao ({myDeliveringOrders.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceTab === 'pool'}
              onClick={() => setWorkspaceTab('pool')}
              className={`min-h-[44px] px-2.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                workspaceTab === 'pool'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Chợ đơn &amp; Cụm ({availableOrdersAll.length} chờ nhận)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceTab === 'completed'}
              onClick={() => setWorkspaceTab('completed')}
              className={`min-h-[44px] px-2.5 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                workspaceTab === 'completed'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Đã giao ({completedOrdersAll.length})
            </button>
          </div>
        </section>

        {(firestoreError || actionFeedback) && (
          <div
            role={firestoreError || actionFeedback?.type === 'error' ? 'alert' : 'status'}
            className={`p-3.5 rounded-xl border text-sm font-medium ${
              firestoreError || actionFeedback?.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {firestoreError || actionFeedback?.message}
          </div>
        )}

        {/* Priority Section Always Visible on Top when Shipper has active claimed deliveries */}
        {myDeliveringOrders.length > 0 && workspaceTab !== 'completed' && (
          <section
            aria-label="Đơn của tôi đang giao"
            className="bg-blue-50/65 border-2 border-blue-700 rounded-2xl p-4 sm:p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-blue-700 text-white text-[11px] font-bold">
                    ĐANG ĐI GIAO
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    Đơn của tôi đang giao ({myDeliveringOrders.length} điểm)
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-slate-600">
                  Sắp xếp tự động theo đường ngắn nhất từ {shipperGps ? 'vị trí GPS của bạn' : 'Kho Shop'}.
                  {osrmRoute && osrmRoute.totalDistanceKm > 0 && (
                    <span className="ml-1.5 font-bold text-blue-800">
                      Tổng lộ trình đường phố: ~{osrmRoute.totalDistanceKm.toFixed(1)} km (
                      {osrmRoute.totalDurationMinutes} phút)
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={requestShipperGps}
                className="min-h-[38px] px-3 py-1.5 bg-white border border-blue-300 hover:bg-blue-50 text-blue-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{gpsLoading ? 'Đang định vị...' : 'Cập nhật vị trí GPS'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {myDeliveringOrders.map((order, idx) => {
                const isReleasing = Boolean(releasingIds[order.id]);
                const isCompleting = Boolean(completingIds[order.id]);
                return (
                  <div
                    key={order.id}
                    className="bg-white border border-blue-200 rounded-xl p-4 space-y-3 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setFocusedOrderId(order.id)}
                        className="text-left group cursor-pointer"
                      >
                        <div className="text-[11px] font-bold text-blue-700 tabular-nums">
                          ĐIỂM GIAO #{idx + 1} · Xem trên bản đồ
                        </div>
                        <div className="text-base font-bold text-slate-900 group-hover:text-blue-700">
                          {order.ten_khach}
                        </div>
                      </button>

                      {order.sdt && (
                        <a
                          href={buildTelHref(order.sdt)}
                          className="min-h-[38px] px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl inline-flex items-center gap-1.5 text-xs font-mono font-semibold tabular-nums shrink-0"
                        >
                          <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{order.sdt}</span>
                        </a>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm text-slate-700 flex items-start gap-1.5">
                      <MapPin className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{order.dia_chi}</span>
                    </p>

                    {order.ghi_chu && (
                      <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950">
                        <span className="font-semibold">Ghi chú: </span>
                        {order.ghi_chu}
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isReleasing || isCompleting}
                        onClick={() => handleReleaseOrder(order.id)}
                        className="min-h-[42px] px-3 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{isReleasing ? 'Đang hủy...' : '↩️ Hủy nhận'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isCompleting || isReleasing}
                        onClick={() => setSelectedOrderForProof(order)}
                        className="flex-1 min-h-[42px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs sm:text-sm font-bold rounded-xl inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-4 h-4" aria-hidden="true" />
                        <span>
                          {isCompleting ? 'Đang cập nhật...' : '✓ Xác nhận đã giao xong'}
                        </span>
                      </button>
                    </div>

                    {order.proofImage && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setViewingProofOrder(order)}
                          className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <ImageIcon className="w-4 h-4" aria-hidden="true" />
                          <span>🖼️ Xem ảnh giao hàng</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 4-Mode Filter Bar when browsing Order Pool */}
        {workspaceTab === 'pool' && (
          <DispatchViewFilterBar
            viewMode={viewMode}
            onChangeViewMode={(next) => {
              setViewMode(next);
              setFocusedCluster('ALL');
            }}
            radiusKm={radiusKm}
            onChangeRadiusKm={(km) => {
              setRadiusKm(km);
              setFocusedCluster('ALL');
            }}
            districts={availableDistricts}
            selectedDistrict={selectedDistrict}
            onChangeDistrict={setSelectedDistrict}
            gpsCoords={shipperGps}
            gpsLoading={gpsLoading}
            gpsError={gpsError}
            onRequestGps={requestShipperGps}
          />
        )}

        {loadingOrders ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
            Đang đồng bộ danh sách đơn hàng realtime từ Firestore...
          </div>
        ) : workspaceTab === 'completed' ? (
          <section className="space-y-3">
            {completedOrdersAll.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                Chưa có đơn hàng nào đã hoàn thành.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {completedOrdersAll.map((order) => (
                  <article
                    key={order.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5"
                  >
                    {renderOrderStatusAndActions(order)}
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            {/* Left Column: Active Workspace List */}
            <div className="xl:col-span-7 order-2 xl:order-1 space-y-4">
              {workspaceTab === 'mine' ? (
                myDeliveringOrders.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
                    <p className="text-sm font-semibold text-slate-800">
                      Bạn chưa nhận đơn nào vào lộ trình đang giao.
                    </p>
                    <p className="text-xs text-slate-500">
                      Chuyển sang tab &quot;Chợ đơn &amp; Cụm&quot; để bấm &quot;✋ Nhận đơn này&quot; hoặc &quot;📦 Nhận cả cụm này&quot;.
                    </p>
                    <button
                      type="button"
                      onClick={() => setWorkspaceTab('pool')}
                      className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl cursor-pointer"
                    >
                      Xem đơn đang chờ nhận ({availableOrdersAll.length})
                    </button>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 text-xs text-slate-600 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
                    <span>
                      Danh sách {myDeliveringOrders.length} đơn đang giao của bạn đã được ghim ở khu vực ưu tiên phía trên và đồng bộ chỉ đường OSRM bên bản đồ.
                    </span>
                  </div>
                )
              ) : viewMode === 'clusters' ? (
                pendingClusters.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                    Hiện không có đơn hàng nào đang chờ giao.
                  </div>
                ) : (
                  pendingClusters.map((cluster) => {
                    const isFocusedCard = focusedCluster === cluster.clusterName;
                    const availableInCluster = cluster.pendingOrders.filter(
                      (o) => o.deliveryState === 'available'
                    );
                    const isClaimingCluster = claimingKey === `cluster:${cluster.clusterName}`;

                    return (
                      <section
                        key={cluster.clusterName}
                        className={`bg-white rounded-2xl overflow-hidden transition-all ${
                          isFocusedCard
                            ? 'border-2 border-blue-700 ring-2 ring-blue-100 shadow-sm'
                            : 'border border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div
                          className={`p-4 sm:p-5 border-b border-slate-200 space-y-3 ${
                            isFocusedCard ? 'bg-blue-50/35' : ''
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                setFocusedCluster((prev) =>
                                  prev === cluster.clusterName ? 'ALL' : cluster.clusterName
                                )
                              }
                              aria-pressed={isFocusedCard}
                              className="min-w-0 flex-1 text-left group cursor-pointer"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`w-3 h-3 rounded-full shrink-0 ${getClusterDotClass(
                                    cluster.color
                                  )}`}
                                  aria-hidden="true"
                                />
                                <h2 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-blue-700">
                                  {cluster.clusterName}
                                </h2>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="font-semibold text-emerald-700 tabular-nums">
                                  {availableInCluster.length} đơn chờ nhận
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="tabular-nums">
                                  {cluster.pendingOrders.length} tổng trong cụm
                                </span>
                                {cluster.totalDistanceKm > 0 && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="inline-flex items-center gap-1 font-semibold text-blue-700 tabular-nums">
                                      <Route className="w-3.5 h-3.5" aria-hidden="true" />~
                                      {cluster.totalDistanceKm.toFixed(1)} km
                                    </span>
                                  </>
                                )}
                              </div>
                            </button>

                            {availableInCluster.length > 0 && (
                              <button
                                type="button"
                                disabled={isClaimingCluster}
                                onClick={() =>
                                  handleClaimOrders(
                                    availableInCluster.map((o) => o.id),
                                    `cluster:${cluster.clusterName}`
                                  )
                                }
                                className="min-h-[40px] px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white text-xs sm:text-sm font-bold rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer shrink-0"
                              >
                                <PackagePlus className="w-4 h-4" aria-hidden="true" />
                                <span>
                                  {isClaimingCluster
                                    ? 'Đang nhận cụm...'
                                    : `📦 Nhận cả cụm này (${availableInCluster.length})`}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>

                        <ul className="divide-y divide-slate-200">
                          {cluster.pendingOrders.map((order, stopIdx) => (
                            <li key={order.id} className="p-4 sm:p-5">
                              <div className="text-[11px] font-mono font-bold text-slate-400 mb-1.5">
                                Điểm #{stopIdx + 1}
                              </div>
                              {renderOrderStatusAndActions(order)}
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })
                )
              ) : viewMode === 'district' ? (
                districtFilteredOrders.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                    Không có đơn hàng nào thuộc quận/huyện đã chọn.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {districtFilteredOrders.map((order) => (
                      <article
                        key={order.id}
                        className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5"
                      >
                        {renderOrderStatusAndActions(order)}
                      </article>
                    ))}
                  </div>
                )
              ) : viewMode === 'nearest_gps' ? (
                nearestAvailableOrders.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                    Hiện không còn đơn nào ở trạng thái Chờ nhận.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {nearestAvailableOrders.map(({ order, distanceKm }) => (
                      <article
                        key={order.id}
                        className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5"
                      >
                        {renderOrderStatusAndActions(order, distanceKm)}
                      </article>
                    ))}
                  </div>
                )
              ) : pendingOrdersAll.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                  Không có đơn hàng nào đang chờ xử lý.
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingOrdersAll.map((order) => (
                    <article
                      key={order.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5"
                    >
                      {renderOrderStatusAndActions(order)}
                    </article>
                  ))}
                </div>
              )}
            </div>

            {/* Right Column: Live Map + OSRM Turn-by-Turn Instructions */}
            <div className="xl:col-span-5 order-1 xl:order-2 xl:sticky xl:top-20 space-y-4">
              <DeliveryClusterMap
                clusters={mapClusters}
                shopOrigin={dispatchConfig.shopOrigin}
                shipperGps={shipperGps}
                osrmRoute={osrmRoute}
                onRequestGps={requestShipperGps}
                gpsLoading={gpsLoading}
                focusedOrderId={focusedOrderId}
                focusedClusterName={focusedCluster}
                onSelectCluster={setFocusedCluster}
                title="Bản đồ & Chỉ đường OSRM trực tiếp"
                heightClass="h-[320px] sm:h-[400px] lg:h-[440px]"
              />

              <RouteTurnByTurnPanel
                route={osrmRoute}
                loading={osrmLoading}
                startLabel={routeStartLabel}
                gpsActive={Boolean(shipperGps)}
                gpsLoading={gpsLoading}
                onRequestGps={requestShipperGps}
                onSelectLegOrder={(id) => {
                  if (id) setFocusedOrderId(id);
                }}
              />
            </div>
          </div>
        )}
      </main>

      {selectedOrderForProof && (
        <ProofOfDeliveryModal
          order={selectedOrderForProof}
          onClose={() => setSelectedOrderForProof(null)}
          onSubmitProof={async (orderId, base64) => {
            await handleCompleteOrderWithProof(orderId, base64);
          }}
        />
      )}

      {viewingProofOrder && (
        <ProofImageModal
          order={viewingProofOrder}
          onClose={() => setViewingProofOrder(null)}
        />
      )}

      {showKeyModal && (
        <KeySetupModal
          onClose={() => setShowKeyModal(false)}
          onSaved={() => {}}
        />
      )}
    </div>
  );
}
