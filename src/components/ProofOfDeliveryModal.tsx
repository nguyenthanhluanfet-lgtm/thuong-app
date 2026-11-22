import { useState, useRef, type ChangeEvent } from 'react';
import { Camera, CheckCircle2, RotateCcw, Upload, X } from 'lucide-react';
import type { DeliveryOrder } from '../types/order';

interface ProofOfDeliveryModalProps {
  order: DeliveryOrder;
  onClose: () => void;
  onSubmitProof: (orderId: string, proofImageBase64: string) => Promise<void>;
}

export function ProofOfDeliveryModal({
  order,
  onClose,
  onSubmitProof,
}: ProofOfDeliveryModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setCompressing(true);

    try {
      const compressedDataUrl = await compressImage(file, 600, 0.6);
      setPreviewUrl(compressedDataUrl);
    } catch {
      setError('Không thể đọc hoặc nén ảnh. Vui lòng thử lại.');
    } finally {
      setCompressing(false);
    }
  }

  function compressImage(file: File, maxWidth = 600, quality = 0.6): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context unavailable'));
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = event.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleSubmit() {
    if (!previewUrl) {
      setError('Vui lòng chụp hoặc tải lên ảnh xác nhận giao hàng trước khi gửi.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onSubmitProof(order.id, previewUrl);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể lưu xác nhận giao hàng.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pod-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 id="pod-modal-title" className="text-base font-bold text-slate-900">
              Xác nhận giao hàng &amp; Chụp ảnh
            </h2>
            <p className="text-xs text-slate-500 truncate max-w-[280px]">
              Khách: {order.ten_khach} · {order.dia_chi}
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />

          {!previewUrl ? (
            <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-4 bg-slate-50/50">
              <div className="w-14 h-14 mx-auto rounded-full bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center">
                <Camera className="w-7 h-7" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800">
                  Bằng chứng giao hàng (Bắt buộc)
                </p>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Chụp ảnh thực tế hàng hóa tại địa chỉ khách hoặc biên nhận giao hàng để hoàn tất đơn.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={compressing}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Camera className="w-4 h-4" aria-hidden="true" />
                  <span>{compressing ? 'Đang nén ảnh...' : '📸 Mở Camera chụp ảnh giao hàng'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 aspect-4/3 flex items-center justify-center">
                <img
                  src={previewUrl}
                  alt="Ảnh xác nhận giao hàng"
                  className="max-h-full max-w-full object-contain"
                />
                <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/65 text-[11px] font-mono text-white">
                  Đã nén tối ưu (&lt;100KB)
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewUrl(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="min-h-[38px] px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Chụp lại ảnh khác</span>
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="min-h-[38px] px-5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>{submitting ? 'Đang gửi...' : '✅ Gửi ảnh & Hoàn tất đơn hàng'}</span>
                </button>
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
