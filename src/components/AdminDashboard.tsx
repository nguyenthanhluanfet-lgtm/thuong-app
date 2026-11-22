import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Check,
  CheckCircle2,
  ClipboardCopy,
  Image as ImageIcon,
  Key,
  LocateFixed,
  LogOut,
  MapPin,
  Navigation,
  Pencil,
  Phone,
  Plus,
  Route,
  Search,
  Sparkles,
  Store,
  Trash2,
  Truck,
  UserCheck,
} from 'lucide-react';
import {
  assignClusterShipper,
  createSingleOrder,
  deleteOrderById,
  logoutUser,
  saveExtractedOrdersBatch,
  updateOrderDetails,
} from '../lib/firebase';
import type {
  AppUserRecord,
  ClusterGroup,
  DeliveryOrder,
  DispatchConfig,
  DispatchViewMode,
  ExtractedOrderInput,
  GeoPoint,
  OrderStatus,
  ShopOrigin,
} from '../types/order';
import {
  clusterOrdersByRadius,
  computeOrderStats,
  DEFAULT_DISPATCH_CONFIG,
  extractAvailableDistricts,
  extractHanoiDistrictName,
  filterOrdersForAdmin,
  formatClusterForZalo,
  getOrderClaimedShipper,
  HANOI_SHOP_PRESETS,
  hasOrderCoordinates,
  normalizeExtractedOrders,
  sortOrdersByDistanceFromPoint,
} from '../utils/dispatch';
import { DeliveryClusterMap, getClusterDotClass } from './DeliveryClusterMap';
import { DispatchViewFilterBar } from './DispatchViewFilterBar';
import { EditOrderModal } from './EditOrderModal';
import { KeySetupModal } from './KeySetupModal';
import { ProofImageModal } from './ProofImageModal';
import { RoleManagementPanel } from './RoleManagementPanel';

interface AdminDashboardProps {
  userEmail: string;
  orders: DeliveryOrder[];
  loadingOrders: boolean;
  firestoreError: string;
  dispatchConfig?: DispatchConfig;
  onUpdateDispatchConfig?: (nextConfig: DispatchConfig) => Promise<void> | void;
}

type AdminTab = 'dispatch' | 'orders' | 'roles';

const SAMPLE_ZALO_MESSAGES = `1. Chị Lan - 0912345678 - 120 Xuân Thủy, Cầu Giấy - 2 bún chả đặc biệt, ít hành
2. Anh Minh - 0988112233 - 45 Đường Láng, Đống Đa - 1 cơm tấm sườn bì chả, giao trước 12h
3. Bạn Trang - 0904556677 - 18 Ngõ 105 Nguyễn Trãi, Thanh Xuân - 2 trà đào cam sả, thu hộ 95k
4. Chú Hùng - 0977334455 - Tòa HH2A Linh Đàm, Hoàng Mai - 3 phở bò tái chín, nhiều nước dùng
5. Cô Mai - 0933889900 - 215 Giải Phóng, Hoàng Mai - 1 bún bò Huế không cay`;

export function AdminDashboard({
  userEmail,
  orders,
  loadingOrders,
  firestoreError,
  dispatchConfig = DEFAULT_DISPATCH_CONFIG,
  onUpdateDispatchConfig,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dispatch');

  // Zalo extraction state
  const [zaloText, setZaloText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractFeedback, setExtractFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Cluster shipper assignment, copy & filtering
  const [viewMode, setViewMode] = useState<DispatchViewMode>('clusters');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('ALL');
  const [adminGps, setAdminGps] = useState<GeoPoint | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [shipperDrafts, setShipperDrafts] = useState<Record<string, string>>({});
  const [assigningCluster, setAssigningCluster] = useState<string | null>(null);
  const [clusterFeedback, setClusterFeedback] = useState<Record<string, string>>({});
  const [copiedCluster, setCopiedCluster] = useState<string | null>(null);
  const [focusedCluster, setFocusedCluster] = useState<string>('ALL');

  // Shop origin & route optimization state
  const [shopAddressInput, setShopAddressInput] = useState(dispatchConfig.shopOrigin.address);
  const [geocodingShop, setGeocodingShop] = useState(false);
  const [shopStatusMsg, setShopStatusMsg] = useState('');

  useEffect(() => {
    setShopAddressInput(dispatchConfig.shopOrigin.address);
  }, [dispatchConfig.shopOrigin.address]);

  const radiusKm = dispatchConfig.radiusKm;
  const maxOrdersPerShipper = dispatchConfig.maxOrdersPerShipper;
  const shopOrigin = dispatchConfig.shopOrigin;

  const requestAdminGps = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Trình duyệt không hỗ trợ định vị GPS.');
      return;
    }
    setGpsLoading(true);
    setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAdminGps({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setGpsLoading(false);
      },
      (err) => {
        setGpsLoading(false);
        setGpsError(
          err.code === 1
            ? 'Trình duyệt từ chối quyền GPS — đang sắp xếp theo khoảng cách từ Kho Shop.'
            : 'Không lấy được tín hiệu GPS — đang sắp xếp theo khoảng cách từ Kho Shop.'
        );
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }
    );
  }, []);

  // Order management filters & modals
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [clusterFilter, setClusterFilter] = useState('ALL');
  const [editingOrder, setEditingOrder] = useState<DeliveryOrder | null | undefined>(undefined);
  const [confirmDeleteOrder, setConfirmDeleteOrder] = useState<DeliveryOrder | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncedUsers, setSyncedUsers] = useState<AppUserRecord[]>([]);
  const [viewingProofOrder, setViewingProofOrder] = useState<DeliveryOrder | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);

  const clusters = useMemo(
    () =>
      clusterOrdersByRadius(orders, radiusKm, {
        shopOrigin,
        maxOrdersPerShipper,
      }),
    [orders, radiusKm, shopOrigin, maxOrdersPerShipper]
  );
  const stats = useMemo(() => computeOrderStats(orders, clusters), [orders, clusters]);
  const pendingClusters = useMemo(
    () => clusters.filter((c) => c.pendingOrders.length > 0),
    [clusters]
  );

  const displayedClusters = pendingClusters;

  const availableDistricts = useMemo(
    () => extractAvailableDistricts(orders),
    [orders]
  );

  const districtFilteredOrders = useMemo(() => {
    if (selectedDistrict === 'ALL') return orders;
    return orders.filter(
      (o) => extractHanoiDistrictName(o.dia_chi, o.cum_khu_vuc) === selectedDistrict
    );
  }, [orders, selectedDistrict]);

  const availableOrders = useMemo(
    () => orders.filter((o) => o.deliveryState === 'available'),
    [orders]
  );

  const nearestAvailableOrders = useMemo(
    () => sortOrdersByDistanceFromPoint(availableOrders, adminGps ?? shopOrigin),
    [availableOrders, adminGps, shopOrigin]
  );

  const knownClusters = useMemo(
    () =>
      Array.from(new Set(orders.map((o) => o.cum_khu_vuc).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'vi')
      ),
    [orders]
  );

  const knownShippers = useMemo(() => {
    const base = ['shipper1@shipper.vn', 'shipper2@shipper.vn', 'shipper3@shipper.vn'];
    const fromUsers = syncedUsers
      .filter((u) => u.role === 'shipper')
      .map((u) => u.email.trim())
      .filter(Boolean);
    const fromOrders = orders.map((o) => getOrderClaimedShipper(o)).filter(Boolean);
    return Array.from(new Set([...fromUsers, ...fromOrders, ...base]));
  }, [orders, syncedUsers]);

  const filteredOrders = useMemo(
    () => filterOrdersForAdmin(orders, searchQuery, statusFilter, clusterFilter),
    [orders, searchQuery, statusFilter, clusterFilter]
  );

  async function handleExtractZaloOrders(e: FormEvent) {
    e.preventDefault();
    setExtractFeedback(null);

    if (!zaloText.trim()) {
      setExtractFeedback({
        type: 'error',
        message: 'Vui lòng dán nội dung tin nhắn khách hàng từ Zalo vào khung bên trên.',
      });
      return;
    }

    setExtracting(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch('/api/parse-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: zaloText }),
        signal: controller.signal,
      });

      const data = (await response.json().catch(() => ({}))) as {
        orders?: ExtractedOrderInput[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          data.error || `Lỗi máy chủ AI (HTTP ${response.status}). Vui lòng thử lại.`
        );
      }

      const extracted = normalizeExtractedOrders(data.orders);
      if (extracted.length === 0) {
        throw new Error('AI không tìm thấy đơn hàng hợp lệ nào trong đoạn tin nhắn vừa dán.');
      }

      const count = await saveExtractedOrdersBatch(extracted, userEmail);
      const uniqueClusters = new Set(extracted.map((o) => o.cum_khu_vuc));
      setZaloText('');
      setFocusedCluster('ALL');
      setExtractFeedback({
        type: 'success',
        message: `Đã bóc tách và lưu song song ${count} đơn hàng vào ${uniqueClusters.size} cụm khu vực trên Firestore.`,
      });
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      const detail = isTimeout
        ? 'Quá thời gian chờ 15 giây khi gọi Gemini AI. Vui lòng kiểm tra kết nối và thử lại.'
        : err instanceof Error
          ? err.message
          : 'Lỗi không xác định khi xử lý đơn hàng.';
      setExtractFeedback({
        type: 'error',
        message: detail,
      });
    } finally {
      clearTimeout(timeoutId);
      setExtracting(false);
    }
  }

  async function handleAssignCluster(clusterName: string, orderIds: string[]) {
    const targetShipper = (shipperDrafts[clusterName] ?? '').trim();
    if (!targetShipper) {
      setClusterFeedback((prev) => ({
        ...prev,
        [clusterName]: 'Nhập tên hoặc email Shipper trước khi gán.',
      }));
      return;
    }

    setAssigningCluster(clusterName);
    setClusterFeedback((prev) => ({ ...prev, [clusterName]: '' }));
    try {
      await assignClusterShipper(orderIds, targetShipper);
      setClusterFeedback((prev) => ({
        ...prev,
        [clusterName]: `Đã gán cụm cho ${targetShipper}.`,
      }));
      setTimeout(() => {
        setClusterFeedback((prev) => ({ ...prev, [clusterName]: '' }));
      }, 3000);
    } catch (err: unknown) {
      setClusterFeedback((prev) => ({
        ...prev,
        [clusterName]: err instanceof Error ? err.message : 'Lỗi khi gán tuyến.',
      }));
    } finally {
      setAssigningCluster(null);
    }
  }

  async function handleCopyClusterZalo(cluster: ClusterGroup) {
    const message = formatClusterForZalo(cluster);
    try {
      await navigator.clipboard.writeText(message);
      setCopiedCluster(cluster.clusterName);
      setTimeout(() => {
        setCopiedCluster((current) =>
          current === cluster.clusterName ? null : current
        );
      }, 2500);
    } catch {
      setClusterFeedback((prev) => ({
        ...prev,
        [cluster.clusterName]: 'Trình duyệt chặn quyền Clipboard. Vui lòng thử lại.',
      }));
    }
  }

  async function handleToggleOrderStatus(order: DeliveryOrder) {
    const nextStatus: OrderStatus = order.status === 'pending' ? 'completed' : 'pending';
    const claimedShipper = getOrderClaimedShipper(order);
    await updateOrderDetails(order.id, {
      status: nextStatus,
      deliveryState:
        nextStatus === 'completed'
          ? 'done'
          : claimedShipper
            ? 'delivering'
            : 'available',
    });
  }

  function renderDeliveryStateBadge(order: DeliveryOrder) {
    const claimedShipper = getOrderClaimedShipper(order);
    if (order.deliveryState === 'done' || order.status === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 border border-emerald-200 text-[11px] font-bold text-emerald-800">
          ✓ Đã giao xong
        </span>
      );
    }
    if (order.deliveryState === 'delivering' && claimedShipper) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-100 border border-orange-300 text-[11px] font-bold text-orange-800">
          🚚 Đang giao bởi: {claimedShipper}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-700">
        Chờ nhận
      </span>
    );
  }

  function renderFlatAdminOrderCard(order: DeliveryOrder, distanceKm?: number | null) {
    const districtLabel = extractHanoiDistrictName(order.dia_chi, order.cum_khu_vuc);
    return (
      <article
        key={order.id}
        className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 transition-colors"
      >
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {renderDeliveryStateBadge(order)}
            {districtLabel && (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-semibold text-slate-700">
                {districtLabel}
              </span>
            )}
            {typeof distanceKm === 'number' && Number.isFinite(distanceKm) && (
              <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-800 tabular-nums">
                Cách ~{distanceKm.toFixed(1)} km
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold text-slate-900">{order.ten_khach}</span>
            {order.sdt && (
              <span className="inline-flex items-center gap-1 font-mono text-xs text-slate-600 tabular-nums">
                <Phone className="w-3 h-3 text-slate-400" aria-hidden="true" />
                {order.sdt}
              </span>
            )}
            {hasOrderCoordinates(order) && (
              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                GPS: {order.lat.toFixed(4)}, {order.lng.toFixed(4)}
              </span>
            )}
          </div>

          <p className="text-xs text-slate-700 flex items-start gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{order.dia_chi}</span>
          </p>

          {order.ghi_chu && (
            <p className="text-xs text-amber-800 bg-amber-50/80 inline-block px-2 py-0.5 rounded">
              Ghi chú: {order.ghi_chu}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handleToggleOrderStatus(order)}
            aria-label={
              order.status === 'completed'
                ? `Mở lại đơn của ${order.ten_khach}`
                : `Đánh dấu đã giao đơn của ${order.ten_khach}`
            }
            className={`min-h-[34px] px-2.5 py-1.5 text-xs font-medium rounded-lg inline-flex items-center gap-1 cursor-pointer ${
              order.status === 'completed'
                ? 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{order.status === 'completed' ? 'Hoàn tác' : 'Đã giao'}</span>
          </button>
          <button
            type="button"
            onClick={() => setEditingOrder(order)}
            aria-label={`Sửa đơn của ${order.ten_khach}`}
            className="min-h-[34px] px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1 cursor-pointer"
          >
            <Pencil className="w-3 h-3" aria-hidden="true" />
            <span>Sửa</span>
          </button>
          <button
            type="button"
            onClick={() => setConfirmDeleteOrder(order)}
            aria-label={`Xóa đơn của ${order.ten_khach}`}
            className="min-h-[34px] px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg inline-flex items-center gap-1 cursor-pointer"
          >
            <Trash2 className="w-3 h-3" aria-hidden="true" />
            <span>Xóa</span>
          </button>
          {order.proofImage && (
            <button
              type="button"
              onClick={() => setViewingProofOrder(order)}
              className="min-h-[34px] px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg inline-flex items-center gap-1 cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Xem ảnh</span>
            </button>
          )}
        </div>
      </article>
    );
  }

  async function handleSaveModalOrder(
    data: Omit<DeliveryOrder, 'id' | 'createdAt'>,
    existingId?: string
  ) {
    if (existingId) {
      await updateOrderDetails(existingId, data);
    } else {
      await createSingleOrder(data, userEmail);
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDeleteOrder) return;
    setDeletingId(confirmDeleteOrder.id);
    try {
      await deleteOrderById(confirmDeleteOrder.id);
      setConfirmDeleteOrder(null);
    } finally {
      setDeletingId(null);
    }
  }

  async function applyDispatchConfig(patch: Partial<DispatchConfig>) {
    const nextConfig: DispatchConfig = {
      ...dispatchConfig,
      ...patch,
    };
    await onUpdateDispatchConfig?.(nextConfig);
  }

  async function handleSelectPresetOrigin(preset: ShopOrigin) {
    setShopStatusMsg('');
    setShopAddressInput(preset.address);
    setFocusedCluster('ALL');
    await applyDispatchConfig({ shopOrigin: preset });
    setShopStatusMsg(`Đã đặt điểm xuất phát tại ${preset.label}.`);
  }

  async function handleGeocodeShopOrigin() {
    const queryAddr = shopAddressInput.trim();
    if (!queryAddr) {
      setShopStatusMsg('Vui lòng nhập địa chỉ Kho/Quán tại Hà Nội.');
      return;
    }
    setGeocodingShop(true);
    setShopStatusMsg('');
    try {
      const res = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: queryAddr }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        lat?: number;
        lng?: number;
        error?: string;
      };
      if (!res.ok || typeof data.lat !== 'number' || typeof data.lng !== 'number') {
        throw new Error(data.error || 'Không thể định vị địa chỉ Kho/Quán.');
      }
      const nextOrigin: ShopOrigin = {
        label: queryAddr.split(',')[0]?.trim() || 'Kho Shop',
        address: queryAddr,
        lat: Number(data.lat.toFixed(6)),
        lng: Number(data.lng.toFixed(6)),
      };
      setFocusedCluster('ALL');
      await applyDispatchConfig({ shopOrigin: nextOrigin });
      setShopStatusMsg(
        `Đã cập nhật tọa độ Kho (${nextOrigin.lat.toFixed(4)}, ${nextOrigin.lng.toFixed(4)}).`
      );
    } catch (err: unknown) {
      setShopStatusMsg(
        err instanceof Error ? err.message : 'Lỗi khi định vị địa chỉ xuất phát.'
      );
    } finally {
      setGeocodingShop(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Navigation Bar: Brand + Nav Tabs + Email / Role Label / Sign Out */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-0 sm:h-16 flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 sm:gap-8">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <div className="w-8 h-8 rounded-lg bg-blue-700 text-white flex items-center justify-center">
              <Truck className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-base font-bold tracking-tight text-slate-900">ShipFlow</span>
          </div>

          <nav
            aria-label="Điều hướng chủ shop"
            className="flex items-center gap-6 overflow-x-auto order-3 sm:order-2 w-full sm:w-auto border-t sm:border-t-0 border-slate-100 pt-2 sm:pt-0"
          >
            <button
              type="button"
              onClick={() => setActiveTab('dispatch')}
              className={`min-h-[38px] py-1.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'dispatch'
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Nhập Zalo &amp; Điều phối cụm
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`min-h-[38px] py-1.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'orders'
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả đơn hàng ({orders.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('roles')}
              className={`min-h-[38px] py-1.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'roles'
                  ? 'border-blue-700 text-blue-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Quản lý Phân Quyền (Role)
            </button>
          </nav>

          <div className="flex items-center gap-3 order-2 sm:order-3 shrink-0">
            <div className="text-right leading-tight">
              <div className="text-xs font-semibold text-slate-900 truncate max-w-[160px] sm:max-w-[220px]">
                {userEmail}
              </div>
              <div className="text-[11px] font-medium text-blue-700">Chủ shop</div>
            </div>
            <button
              type="button"
              onClick={() => setShowKeyModal(true)}
              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Key className="w-3.5 h-3.5" aria-hidden="true" />
              <span>⚙️ Cấu hình Key</span>
            </button>
            <button
              type="button"
              onClick={() => logoutUser()}
              className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {firestoreError && (
          <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            Lỗi kết nối Firestore: {firestoreError}
          </div>
        )}

        {activeTab === 'dispatch' ? (
          <>
            {/* Prominent Top Section: Zalo Message Input & Gemini AI Config */}
            <section
              aria-labelledby="zalo-ai-heading"
              className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5"
            >
              <div className="border-b border-slate-100 pb-4">
                <h1 id="zalo-ai-heading" className="text-xl font-bold text-slate-900">
                  Nhập tin nhắn Zalo &amp; Phân cụm AI
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Dán tin nhắn khách đặt hàng để AI tự động bóc tách, gộp cụm địa chỉ lân cận và lưu lên Firestore.
                </p>
              </div>

              <form onSubmit={handleExtractZaloOrders} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label htmlFor="zalo-raw-input" className="text-sm font-semibold text-slate-800">
                      Nội dung tin nhắn khách hàng từ Zalo
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setZaloText(SAMPLE_ZALO_MESSAGES);
                        setExtractFeedback(null);
                      }}
                      className="min-h-[34px] px-3 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg whitespace-nowrap cursor-pointer"
                    >
                      Dán tin nhắn mẫu
                    </button>
                  </div>
                  <textarea
                    id="zalo-raw-input"
                    rows={5}
                    value={zaloText}
                    onChange={(e) => setZaloText(e.target.value)}
                    placeholder="Ví dụ:&#10;1. Chị Lan - 0912345678 - 120 Xuân Thủy, Cầu Giấy - 2 bún chả không hành&#10;2. Anh Minh - 0988112233 - 45 Đường Láng, Đống Đa - 1 cơm tấm giao 12h..."
                    className="w-full p-3.5 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-700 focus:bg-white leading-relaxed"
                  />
                </div>

                {extractFeedback && (
                  <div
                    role={extractFeedback.type === 'error' ? 'alert' : 'status'}
                    className={`p-3.5 rounded-xl border text-sm leading-relaxed ${
                      extractFeedback.type === 'error'
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    }`}
                  >
                    {extractFeedback.message}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="submit"
                    disabled={extracting}
                    className="min-h-[44px] px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Sparkles className="w-4 h-4" aria-hidden="true" />
                    <span>
                      {extracting
                        ? 'Đang phân tích & gom cụm...'
                        : 'Phân tích AI & Gom cụm đơn'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingOrder(null)}
                    className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>Thêm đơn thủ công</span>
                  </button>
                </div>
              </form>
            </section>

            {/* Overview KPI Strip + Radius Control + Per-Cluster Statistics */}
            <section aria-label="Thống kê đơn hàng và cụm khu vực" className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                <div className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-slate-500">Đơn đang chờ giao</p>
                  <p className="mt-1 text-2xl font-bold text-amber-700 tabular-nums">{stats.pending}</p>
                </div>
                <div className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-slate-500">Đã giao xong</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">{stats.completed}</p>
                </div>
                <div className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-slate-500">Cụm khu vực đang chờ</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                    {stats.activeClusters}
                  </p>
                </div>
                <div className="p-4 sm:p-5">
                  <p className="text-xs font-medium text-slate-500">Tổng đơn hệ thống</p>
                  <p className="mt-1 text-2xl font-bold text-blue-700 tabular-nums">{stats.total}</p>
                </div>
              </div>

              {/* Smart Route Optimization Quick Configuration Bar */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                      <Store className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">
                        Vị trí xuất phát của Shop &amp; Thông số tối ưu tuyến
                      </h2>
                      <p className="text-xs text-slate-500">
                        Gom đơn theo trục hướng từ Kho đi ra, giới hạn số đơn/shipper và tự sắp xếp lộ trình gần nhất.
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-mono font-semibold text-amber-800 tabular-nums">
                    Kho: {shopOrigin.lat.toFixed(4)}, {shopOrigin.lng.toFixed(4)}
                  </span>
                </div>

                {/* Shop Origin Input + Quick Hanoi Presets */}
                <div className="space-y-2.5">
                  <label
                    htmlFor="shop-origin-address-input"
                    className="text-xs font-semibold text-slate-700 block"
                  >
                    Địa chỉ xuất phát của Shop (Kho/Quán tại Hà Nội)
                  </label>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1">
                      <MapPin
                        className="w-4 h-4 text-amber-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        id="shop-origin-address-input"
                        type="text"
                        value={shopAddressInput}
                        onChange={(e) => setShopAddressInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleGeocodeShopOrigin();
                          }
                        }}
                        placeholder="Ví dụ: Ngã Tư Sở, Đống Đa, Hà Nội"
                        className="w-full min-h-[40px] pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-700"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={geocodingShop}
                      onClick={handleGeocodeShopOrigin}
                      className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 rounded-xl inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <LocateFixed className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{geocodingShop ? 'Đang định vị...' : 'Cập nhật vị trí Kho'}</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] font-medium text-slate-500 mr-1">
                      Chọn nhanh điểm trung tâm:
                    </span>
                    {HANOI_SHOP_PRESETS.map((preset) => {
                      const isCurrent =
                        Math.abs(shopOrigin.lat - preset.lat) < 0.0005 &&
                        Math.abs(shopOrigin.lng - preset.lng) < 0.0005;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => handleSelectPresetOrigin(preset)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                            isCurrent
                              ? 'bg-amber-50 border-amber-400 text-amber-900'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  {shopStatusMsg && (
                    <p className="text-xs font-medium text-emerald-700">{shopStatusMsg}</p>
                  )}
                </div>

                {/* Sliders Row: Max Orders / Shipper (3-10) + Haversine Radius (1-5 km) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="max-orders-per-shipper-slider"
                        className="text-xs font-bold text-slate-900"
                      >
                        Số đơn tối đa / 1 Shipper
                      </label>
                      <span className="px-2.5 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 tabular-nums whitespace-nowrap">
                        {maxOrdersPerShipper} đơn/cụm
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-slate-500 shrink-0">3 đơn</span>
                      <input
                        id="max-orders-per-shipper-slider"
                        type="range"
                        min={3}
                        max={10}
                        step={1}
                        value={maxOrdersPerShipper}
                        onChange={(e) => {
                          setFocusedCluster('ALL');
                          void applyDispatchConfig({
                            maxOrdersPerShipper: Number(e.target.value),
                          });
                        }}
                        className="w-full accent-emerald-600 cursor-pointer"
                      />
                      <span className="text-[11px] font-mono text-slate-500 shrink-0">10 đơn</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Tự động tách tuyến mới khi số đơn vượt ngưỡng này để chia đều tải cho shipper.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="cluster-radius-slider"
                        className="text-xs font-bold text-slate-900"
                      >
                        Bán kính gom cụm Haversine &amp; trục hướng
                      </label>
                      <span className="px-2.5 py-0.5 rounded-lg bg-blue-50 border border-blue-200 text-xs font-bold text-blue-800 tabular-nums whitespace-nowrap">
                        {radiusKm.toFixed(1)} km
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-slate-500 shrink-0">1 km</span>
                      <input
                        id="cluster-radius-slider"
                        type="range"
                        min={1}
                        max={5}
                        step={0.5}
                        value={radiusKm}
                        onChange={(e) => {
                          setFocusedCluster('ALL');
                          void applyDispatchConfig({
                            radiusKm: Number(e.target.value),
                          });
                        }}
                        className="w-full accent-blue-700 cursor-pointer"
                      />
                      <span className="text-[11px] font-mono text-slate-500 shrink-0">5 km</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Ưu tiên gom các điểm nằm cùng hướng đi từ Shop và cách nhau dưới {radiusKm.toFixed(1)} km.
                    </p>
                  </div>
                </div>
              </div>

              {/* Per-Cluster Stat Cards */}
              {clusters.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-800">
                      Thống kê số lượng đơn &amp; lộ trình theo tuyến
                    </h2>
                    {focusedCluster !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => setFocusedCluster('ALL')}
                        className="text-xs font-medium text-blue-700 hover:text-blue-800 cursor-pointer"
                      >
                        Hiện tất cả tuyến
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {clusters.map((cluster) => {
                      const isFocused = focusedCluster === cluster.clusterName;
                      return (
                        <button
                          key={cluster.clusterName}
                          type="button"
                          onClick={() =>
                            setFocusedCluster((prev) =>
                              prev === cluster.clusterName ? 'ALL' : cluster.clusterName
                            )
                          }
                          className={`text-left p-4 rounded-xl transition-all cursor-pointer ${
                            isFocused
                              ? 'bg-blue-50/80 border-2 border-blue-700 ring-2 ring-blue-100 shadow-xs'
                              : 'bg-white border border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${getClusterDotClass(
                                cluster.color
                              )}`}
                              aria-hidden="true"
                            />
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {cluster.clusterName}
                            </span>
                          </div>
                          <div className="mt-2 flex items-baseline justify-between gap-2">
                            <span className="text-xl font-bold text-amber-700 tabular-nums">
                              {cluster.pendingOrders.length}{' '}
                              <span className="text-xs font-medium text-slate-500">chờ</span>
                            </span>
                            <span className="text-xs font-semibold text-blue-700 tabular-nums">
                              {cluster.totalDistanceKm > 0
                                ? `~${cluster.totalDistanceKm.toFixed(1)} km`
                                : `${cluster.orders.length} đơn`}
                            </span>
                          </div>
                          <div className="mt-1.5 text-[11px] text-slate-600 truncate">
                            {cluster.primaryShipper
                              ? `Shipper: ${cluster.primaryShipper}`
                              : 'Chưa gán Shipper'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Cluster Dispatch List + Interactive Leaflet Map Side-by-Side */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  Điều phối tuyến tối ưu &amp; Bản đồ chỉ hướng
                </h2>
                <span className="text-xs text-slate-500">
                  Bán kính {radiusKm.toFixed(1)} km · Tối đa {maxOrdersPerShipper} đơn/shipper · {displayedClusters.length} tuyến · {stats.pending} đơn chờ
                </span>
              </div>

              {/* 4-Mode Filter Bar shared across Admin & Shipper */}
              <DispatchViewFilterBar
                viewMode={viewMode}
                onChangeViewMode={setViewMode}
                radiusKm={radiusKm}
                onChangeRadiusKm={(nextKm) => {
                  setFocusedCluster('ALL');
                  void applyDispatchConfig({ radiusKm: nextKm });
                }}
                districts={availableDistricts}
                selectedDistrict={selectedDistrict}
                onChangeDistrict={setSelectedDistrict}
                gpsCoords={adminGps}
                gpsLoading={gpsLoading}
                gpsError={gpsError}
                onRequestGps={requestAdminGps}
              />

              {loadingOrders ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
                  Đang đồng bộ danh sách đơn hàng từ Firestore...
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                  <div className="xl:col-span-7 space-y-4">
                    <datalist id="admin-shipper-datalist">
                      {knownShippers.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>

                    {viewMode === 'clusters' ? (
                      displayedClusters.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
                          <p className="text-sm font-medium text-slate-800">
                            Chưa có cụm đơn hàng nào đang chờ giao.
                          </p>
                          <p className="text-xs text-slate-500">
                            Hãy dán tin nhắn Zalo vào khung ở đầu trang và nhấn &quot;Phân tích AI &amp; Gom cụm đơn&quot;.
                          </p>
                        </div>
                      ) : (
                        displayedClusters.map((cluster) => {
                        const draftValue =
                          shipperDrafts[cluster.clusterName] !== undefined
                            ? shipperDrafts[cluster.clusterName]
                            : cluster.primaryShipper;
                        const isCopied = copiedCluster === cluster.clusterName;
                        const isFocusedCard = focusedCluster === cluster.clusterName;

                        return (
                          <article
                            key={cluster.clusterName}
                            className={`bg-white rounded-xl overflow-hidden transition-all ${
                              isFocusedCard
                                ? 'border-2 border-blue-700 ring-2 ring-blue-100 shadow-sm'
                                : 'border border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div
                              className={`p-5 border-b border-slate-200 space-y-4 ${
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
                                    <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                                      {cluster.clusterName}
                                    </h3>
                                    {isFocusedCard && (
                                      <span className="px-2 py-0.5 text-[11px] font-semibold bg-blue-700 text-white rounded-md">
                                        Đang xem trên bản đồ
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    <span className="tabular-nums font-semibold text-amber-700">
                                      {cluster.pendingOrders.length} đơn chờ giao
                                    </span>
                                    {cluster.totalDistanceKm > 0 && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="inline-flex items-center gap-1 font-semibold text-blue-700 tabular-nums">
                                          <Route className="w-3.5 h-3.5" aria-hidden="true" />
                                          Ước tính ~{cluster.totalDistanceKm.toFixed(1)} km từ Kho
                                        </span>
                                      </>
                                    )}
                                    {cluster.routeDirectionLabel && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="text-slate-600">{cluster.routeDirectionLabel}</span>
                                      </>
                                    )}
                                    <span aria-hidden="true">·</span>
                                    <span>
                                      {cluster.primaryShipper
                                        ? `Phụ trách: ${cluster.primaryShipper}`
                                        : 'Chưa gán Shipper'}
                                    </span>
                                  </div>
                                </button>

                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyClusterZalo(cluster)}
                                    className={`min-h-[36px] px-3 py-1.5 text-xs font-semibold rounded-lg border inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                                      isCopied
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    {isCopied ? (
                                      <>
                                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                        <span>Đã copy gửi Zalo</span>
                                      </>
                                    ) : (
                                      <>
                                        <ClipboardCopy className="w-3.5 h-3.5" aria-hidden="true" />
                                        <span>Copy gửi Zalo</span>
                                      </>
                                    )}
                                  </button>

                                  <a
                                    href={cluster.googleMapsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                                  >
                                    <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span>🗺️ Mở dẫn đường Google Maps</span>
                                  </a>
                                </div>
                              </div>

                              {/* Assign Shipper */}
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <div className="relative flex-1">
                                  <UserCheck
                                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                                    aria-hidden="true"
                                  />
                                  <input
                                    type="text"
                                    list="admin-shipper-datalist"
                                    aria-label={`Gán Shipper cho ${cluster.clusterName}`}
                                    value={draftValue}
                                    onChange={(e) =>
                                      setShipperDrafts((prev) => ({
                                        ...prev,
                                        [cluster.clusterName]: e.target.value,
                                      }))
                                    }
                                    placeholder="Nhập tên hoặc email Shipper (vd: shipper1@shipper.vn)"
                                    className="w-full min-h-[40px] pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                                  />
                                </div>
                                <button
                                  type="button"
                                  disabled={assigningCluster === cluster.clusterName}
                                  onClick={() =>
                                    handleAssignCluster(
                                      cluster.clusterName,
                                      cluster.pendingOrders.map((o) => o.id)
                                    )
                                  }
                                  className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  {assigningCluster === cluster.clusterName ? 'Đang gán...' : 'Gán Shipper'}
                                </button>
                              </div>

                              {clusterFeedback[cluster.clusterName] && (
                                <p className="text-xs font-medium text-emerald-700">
                                  {clusterFeedback[cluster.clusterName]}
                                </p>
                              )}
                            </div>

                            {/* Orders in Cluster with Edit / Complete / Delete */}
                            <ul className="divide-y divide-slate-100">
                              {cluster.pendingOrders.map((order, stopIdx) => (
                                <li
                                  key={order.id}
                                  className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                                >
                                  <div className="space-y-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 text-sm">
                                      <span className="text-xs font-mono font-bold text-slate-400 tabular-nums">
                                        #{stopIdx + 1}
                                      </span>
                                      <span className="font-semibold text-slate-900">
                                        {order.ten_khach}
                                      </span>
                                      {renderDeliveryStateBadge(order)}
                                      {order.sdt && (
                                        <>
                                          <span className="text-slate-300" aria-hidden="true">
                                            ·
                                          </span>
                                          <span className="font-mono text-xs text-slate-600 tabular-nums">
                                            {order.sdt}
                                          </span>
                                        </>
                                      )}
                                      {hasOrderCoordinates(order) && (
                                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                          GPS: {order.lat.toFixed(4)}, {order.lng.toFixed(4)}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-600 flex items-start gap-1.5">
                                      <MapPin
                                        className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5"
                                        aria-hidden="true"
                                      />
                                      <span>{order.dia_chi}</span>
                                    </p>
                                    {order.ghi_chu && (
                                      <p className="text-xs text-amber-800 bg-amber-50/80 inline-block px-2 py-0.5 rounded">
                                        Ghi chú: {order.ghi_chu}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleOrderStatus(order)}
                                      aria-label={`Đánh dấu đã giao đơn của ${order.ten_khach}`}
                                      className="min-h-[34px] px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                                      <span>Đã giao</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingOrder(order)}
                                      aria-label={`Sửa đơn của ${order.ten_khach}`}
                                      className="min-h-[34px] px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Pencil className="w-3 h-3" aria-hidden="true" />
                                      <span>Sửa</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteOrder(order)}
                                      aria-label={`Xóa đơn của ${order.ten_khach}`}
                                      className="min-h-[34px] px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" aria-hidden="true" />
                                      <span>Xóa</span>
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </article>
                        );
                        })
                      )
                    ) : viewMode === 'district' ? (
                      districtFilteredOrders.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                          Không có đơn hàng nào thuộc quận/huyện đã chọn.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {districtFilteredOrders.map((order) => renderFlatAdminOrderCard(order))}
                        </div>
                      )
                    ) : viewMode === 'nearest_gps' ? (
                      nearestAvailableOrders.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                          Hiện không còn đơn nào ở trạng thái Chờ nhận.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {nearestAvailableOrders.map(({ order, distanceKm }) =>
                            renderFlatAdminOrderCard(order, distanceKm)
                          )}
                        </div>
                      )
                    ) : orders.length === 0 ? (
                      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                        Chưa có đơn hàng nào trong hệ thống.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {orders.map((order) => renderFlatAdminOrderCard(order))}
                      </div>
                    )}
                  </div>

                  {/* Interactive Leaflet Map beside Cluster List */}
                  <div className="xl:col-span-5 xl:sticky xl:top-20">
                    <DeliveryClusterMap
                      clusters={pendingClusters}
                      shopOrigin={shopOrigin}
                      shipperGps={adminGps}
                      gpsLoading={gpsLoading}
                      onRequestGps={requestAdminGps}
                      focusedClusterName={focusedCluster}
                      onSelectCluster={setFocusedCluster}
                      title="Bản đồ phân cụm & tuyến giao tối ưu"
                    />
                  </div>
                </div>
              )}
            </section>
          </>
        ) : activeTab === 'orders' ? (
          /* Tab 2: Full Order Management Table */
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 flex-1">
                <div className="relative flex-1 min-w-[220px] max-w-md">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm tên khách, SĐT, địa chỉ, shipper..."
                    aria-label="Tìm kiếm đơn hàng"
                    className="w-full min-h-[40px] pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                  />
                </div>

                <div
                  role="group"
                  aria-label="Lọc trạng thái đơn"
                  className="inline-flex items-center p-1 bg-slate-100 rounded-lg"
                >
                  {(
                    [
                      { key: 'all', label: 'Tất cả' },
                      { key: 'pending', label: 'Đang chờ' },
                      { key: 'completed', label: 'Đã giao' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setStatusFilter(item.key)}
                      className={`min-h-[32px] px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                        statusFilter === item.key
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <select
                  aria-label="Lọc theo cụm khu vực"
                  value={clusterFilter}
                  onChange={(e) => setClusterFilter(e.target.value)}
                  className="min-h-[40px] px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                >
                  <option value="ALL">Tất cả cụm khu vực</option>
                  {knownClusters.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Thêm đơn hàng</span>
              </button>
            </div>

            {loadingOrders ? (
              <div className="p-8 text-center text-sm text-slate-500">Đang tải dữ liệu...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                Không có đơn hàng nào khớp bộ lọc hiện tại.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Khách hàng</th>
                      <th className="py-3 px-4">Địa chỉ &amp; Ghi chú</th>
                      <th className="py-3 px-4">Cụm khu vực</th>
                      <th className="py-3 px-4">Shipper</th>
                      <th className="py-3 px-4">Trạng thái</th>
                      <th className="py-3 px-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 align-top">
                          <div className="font-semibold text-slate-900">{order.ten_khach}</div>
                          <div className="font-mono text-xs text-slate-600 tabular-nums mt-0.5">
                            {order.sdt || 'Không có SĐT'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 align-top max-w-xs">
                          <div className="text-xs text-slate-800 leading-relaxed">
                            {order.dia_chi}
                          </div>
                          {order.ghi_chu && (
                            <div className="text-xs text-slate-500 mt-1">
                              Ghi chú: {order.ghi_chu}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 align-top text-xs font-medium text-slate-700">
                          {order.cum_khu_vuc}
                        </td>
                        <td className="py-3.5 px-4 align-top text-xs text-slate-600">
                          {getOrderClaimedShipper(order) || 'Chưa gán'}
                        </td>
                        <td className="py-3.5 px-4 align-top">
                          <div className="flex flex-col items-start gap-1">
                            {renderDeliveryStateBadge(order)}
                            <button
                              type="button"
                              onClick={() => handleToggleOrderStatus(order)}
                              className="text-[11px] font-medium text-slate-500 hover:text-blue-700 underline-offset-2 hover:underline cursor-pointer"
                            >
                              {order.status === 'completed' ? 'Mở lại đơn' : 'Đánh dấu đã giao'}
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 align-top text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingOrder(order)}
                              aria-label={`Sửa đơn ${order.ten_khach}`}
                              className="min-h-[34px] min-w-[34px] px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Sửa</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteOrder(order)}
                              aria-label={`Xóa đơn ${order.ten_khach}`}
                              className="min-h-[34px] min-w-[34px] px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Xóa</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : (
          <RoleManagementPanel
            currentAdminEmail={userEmail}
            onUsersSynced={setSyncedUsers}
          />
        )}
      </main>

      {editingOrder !== undefined && (
        <EditOrderModal
          order={editingOrder}
          knownClusters={knownClusters}
          onClose={() => setEditingOrder(undefined)}
          onSave={handleSaveModalOrder}
        />
      )}

      {confirmDeleteOrder && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
        >
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm p-6 shadow-lg space-y-4">
            <h2 id="delete-confirm-title" className="text-base font-bold text-slate-900">
              Xác nhận xóa đơn hàng
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Bạn chắc chắn muốn xóa đơn của khách{' '}
              <span className="font-semibold text-slate-900">{confirmDeleteOrder.ten_khach}</span> tại{' '}
              {confirmDeleteOrder.dia_chi}? Thao tác này không thể hoàn tác.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOrder(null)}
                className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={deletingId === confirmDeleteOrder.id}
                onClick={handleConfirmDelete}
                className="min-h-[40px] px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg cursor-pointer"
              >
                {deletingId === confirmDeleteOrder.id ? 'Đang xóa...' : 'Xóa đơn'}
              </button>
            </div>
          </div>
        </div>
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
