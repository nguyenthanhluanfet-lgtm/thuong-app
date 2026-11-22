import { Clock, MapPin, Phone, User, X } from 'lucide-react';
import type { DeliveryOrder } from '../types/order';

interface ProofImageModalProps {
  order: DeliveryOrder;
  onClose: () => void;
}

export function ProofImageModal({ order, onClose }: ProofImageModalProps) {
  const formattedTime = order.completedAt
    ? new Date(order.completedAt).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : order.deliveredAt
      ? new Date(order.deliveredAt).toLocaleString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : 'Vừa xong';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proof-view-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 id="proof-view-title" className="text-base font-bold text-slate-900">
              Bằng chứng giao hàng (Proof of Delivery)
            </h2>
            <p className="text-xs text-slate-500">
              Đơn hàng hoàn tất lúc {formattedTime}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                <User className="w-3.5 h-3.5 text-blue-700" aria-hidden="true" />
                <span>{order.ten_khach}</span>
              </div>
              {order.sdt && (
                <div className="flex items-center gap-1.5 font-mono text-slate-600">
                  <Phone className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  <span>{order.sdt}</span>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex items-start gap-1.5 text-slate-700">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="line-clamp-2">{order.dia_chi}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                <Clock className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span>Shipper: {order.completedBy || order.shipperEmail || 'Shipper'}</span>
              </div>
            </div>
          </div>

          {order.proofImage ? (
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-900 flex items-center justify-center p-2">
              <img
                src={order.proofImage}
                alt={`Ảnh giao hàng của ${order.ten_khach}`}
                className="max-h-[60vh] max-w-full object-contain rounded-lg shadow"
              />
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-xs">
              Không có ảnh bằng chứng đính kèm cho đơn hàng này.
            </div>
          )}

          <div className="flex items-center justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
