import { useState, type FormEvent } from 'react';
import { LocateFixed, X } from 'lucide-react';
import type { DeliveryOrder, OrderStatus } from '../types/order';
import { isValidCoordinate, normalizeDeliveryState } from '../utils/dispatch';

interface EditOrderModalProps {
  order: DeliveryOrder | null;
  knownClusters: string[];
  onClose: () => void;
  onSave: (
    data: Omit<DeliveryOrder, 'id' | 'createdAt'>,
    existingId?: string
  ) => Promise<void>;
}

export function EditOrderModal({
  order,
  knownClusters,
  onClose,
  onSave,
}: EditOrderModalProps) {
  const [tenKhach, setTenKhach] = useState(order?.ten_khach ?? '');
  const [sdt, setSdt] = useState(order?.sdt ?? '');
  const [diaChi, setDiaChi] = useState(order?.dia_chi ?? '');
  const [ghiChu, setGhiChu] = useState(order?.ghi_chu ?? '');
  const [cumKhuVuc, setCumKhuVuc] = useState(order?.cum_khu_vuc ?? '');
  const [shipperAssigned, setShipperAssigned] = useState(order?.shipper_assigned ?? '');
  const [status, setStatus] = useState<OrderStatus>(order?.status ?? 'pending');
  const [latInput, setLatInput] = useState(
    order?.lat !== undefined ? String(order.lat) : ''
  );
  const [lngInput, setLngInput] = useState(
    order?.lng !== undefined ? String(order.lng) : ''
  );
  const [geocoding, setGeocoding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function lookupCoordsForAddress(addressText: string): Promise<{
    lat?: number;
    lng?: number;
  }> {
    try {
      const res = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addressText }),
      });
      if (!res.ok) return {};
      const data = (await res.json()) as { lat?: number | null; lng?: number | null };
      if (
        typeof data.lat === 'number' &&
        typeof data.lng === 'number' &&
        isValidCoordinate(data.lat, data.lng)
      ) {
        return { lat: data.lat, lng: data.lng };
      }
      return {};
    } catch {
      return {};
    }
  }

  async function handleAutoGeocode() {
    if (!diaChi.trim()) {
      setError('Vui lòng nhập địa chỉ trước khi tìm tọa độ.');
      return;
    }
    setError('');
    setGeocoding(true);
    try {
      const coords = await lookupCoordsForAddress(diaChi.trim());
      if (coords.lat !== undefined && coords.lng !== undefined) {
        setLatInput(String(coords.lat));
        setLngInput(String(coords.lng));
      } else {
        setError('Không tìm thấy tọa độ chính xác cho địa chỉ này trên OpenStreetMap.');
      }
    } finally {
      setGeocoding(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!tenKhach.trim() || !diaChi.trim()) {
      setError('Vui lòng nhập đầy đủ Tên khách và Địa chỉ giao hàng.');
      return;
    }
    setSaving(true);
    try {
      const parsedLat = latInput.trim() ? Number(latInput.trim()) : NaN;
      const parsedLng = lngInput.trim() ? Number(lngInput.trim()) : NaN;
      let finalLat = isValidCoordinate(parsedLat, parsedLng) ? parsedLat : undefined;
      let finalLng = isValidCoordinate(parsedLat, parsedLng) ? parsedLng : undefined;

      // Auto-geocode when creating a manual order or when address changed without coords
      const addressChanged = order && order.dia_chi.trim() !== diaChi.trim();
      if ((finalLat === undefined || finalLng === undefined) || addressChanged) {
        if (finalLat === undefined || finalLng === undefined || addressChanged) {
          const found = await lookupCoordsForAddress(diaChi.trim());
          if (found.lat !== undefined && found.lng !== undefined) {
            finalLat = found.lat;
            finalLng = found.lng;
          }
        }
      }

      const cleanShipper = shipperAssigned.trim();
      const deliveryState = normalizeDeliveryState(
        undefined,
        status,
        cleanShipper,
        cleanShipper
      );

      await onSave(
        {
          ten_khach: tenKhach.trim(),
          sdt: sdt.trim(),
          dia_chi: diaChi.trim(),
          ghi_chu: ghiChu.trim(),
          cum_khu_vuc: cumKhuVuc.trim() || 'Khu vực chung',
          shipper_assigned: cleanShipper,
          shipperEmail: cleanShipper,
          deliveryState,
          status,
          ...(finalLat !== undefined && finalLng !== undefined
            ? { lat: finalLat, lng: finalLng }
            : {}),
        },
        order?.id
      );
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể lưu đơn hàng.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-order-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-lg overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 id="edit-order-title" className="text-base font-semibold text-slate-900">
            {order ? 'Chỉnh sửa đơn hàng' : 'Thêm đơn hàng mới'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="modal-ten-khach" className="block text-xs font-medium text-slate-700 mb-1">
                Tên khách hàng
              </label>
              <input
                id="modal-ten-khach"
                type="text"
                value={tenKhach}
                onChange={(e) => setTenKhach(e.target.value)}
                placeholder="Nguyễn Văn A"
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                required
              />
            </div>

            <div>
              <label htmlFor="modal-sdt" className="block text-xs font-medium text-slate-700 mb-1">
                Số điện thoại
              </label>
              <input
                id="modal-sdt"
                type="tel"
                value={sdt}
                onChange={(e) => setSdt(e.target.value)}
                placeholder="0912345678"
                className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label htmlFor="modal-dia-chi" className="block text-xs font-medium text-slate-700">
                Địa chỉ giao hàng
              </label>
              <button
                type="button"
                disabled={geocoding}
                onClick={handleAutoGeocode}
                className="text-xs font-semibold text-blue-700 hover:text-blue-800 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <LocateFixed className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{geocoding ? 'Đang định vị...' : 'Tìm tọa độ OSM'}</span>
              </button>
            </div>
            <input
              id="modal-dia-chi"
              type="text"
              value={diaChi}
              onChange={(e) => setDiaChi(e.target.value)}
              placeholder="Số nhà, đường, quận/huyện"
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="modal-lat" className="block text-xs font-medium text-slate-700 mb-1">
                Vĩ độ (Lat)
              </label>
              <input
                id="modal-lat"
                type="text"
                value={latInput}
                onChange={(e) => setLatInput(e.target.value)}
                placeholder="21.0367"
                className="w-full min-h-[38px] px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
            <div>
              <label htmlFor="modal-lng" className="block text-xs font-medium text-slate-700 mb-1">
                Kinh độ (Lng)
              </label>
              <input
                id="modal-lng"
                type="text"
                value={lngInput}
                onChange={(e) => setLngInput(e.target.value)}
                placeholder="105.7826"
                className="w-full min-h-[38px] px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
          </div>

          <div>
            <label htmlFor="modal-ghi-chu" className="block text-xs font-medium text-slate-700 mb-1">
              Ghi chú món ăn / COD
            </label>
            <textarea
              id="modal-ghi-chu"
              rows={2}
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              placeholder="2 bún chả, thu hộ 120k..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="modal-cum" className="block text-xs font-medium text-slate-700 mb-1">
                Cụm khu vực
              </label>
              <input
                id="modal-cum"
                type="text"
                list="modal-cluster-options"
                value={cumKhuVuc}
                onChange={(e) => setCumKhuVuc(e.target.value)}
                placeholder="Cầu Giấy - Láng - Thanh Xuân"
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
              <datalist id="modal-cluster-options">
                {knownClusters.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label htmlFor="modal-shipper" className="block text-xs font-medium text-slate-700 mb-1">
                Shipper phụ trách
              </label>
              <input
                id="modal-shipper"
                type="text"
                value={shipperAssigned}
                onChange={(e) => setShipperAssigned(e.target.value)}
                placeholder="shipper1@shipper.vn"
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
          </div>

          <div>
            <label htmlFor="modal-status" className="block text-xs font-medium text-slate-700 mb-1">
              Trạng thái giao hàng
            </label>
            <select
              id="modal-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as OrderStatus)}
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-700"
            >
              <option value="pending">Đang chờ giao</option>
              <option value="completed">Đã giao xong</option>
            </select>
          </div>

          {error && (
            <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[40px] px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 rounded-lg cursor-pointer"
            >
              {saving ? 'Đang lưu...' : order ? 'Lưu thay đổi' : 'Tạo đơn hàng'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
