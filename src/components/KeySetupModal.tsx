import { useState, type FormEvent } from 'react';
import { Key, Save, X } from 'lucide-react';

interface KeySetupModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export function KeySetupModal({ onClose, onSaved }: KeySetupModalProps) {
  const [apiKey, setApiKey] = useState(
    typeof window !== 'undefined' ? localStorage.getItem('shipflow_custom_fb_api_key') || '' : ''
  );
  const [projectId, setProjectId] = useState(
    typeof window !== 'undefined' ? localStorage.getItem('shipflow_custom_fb_project_id') || '' : ''
  );
  const [savedMsg, setSavedMsg] = useState(false);

  function handleSave(e: FormEvent) {
    e.preventDefault();
    if (typeof window !== 'undefined') {
      if (apiKey.trim()) {
        localStorage.setItem('shipflow_custom_fb_api_key', apiKey.trim());
      } else {
        localStorage.removeItem('shipflow_custom_fb_api_key');
      }
      if (projectId.trim()) {
        localStorage.setItem('shipflow_custom_fb_project_id', projectId.trim());
      } else {
        localStorage.removeItem('shipflow_custom_fb_project_id');
      }
    }
    setSavedMsg(true);
    setTimeout(() => {
      onSaved();
      onClose();
      window.location.reload();
    }, 800);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keys-setup-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
              <Key className="w-4 h-4" aria-hidden="true" />
            </div>
            <h2 id="keys-setup-title" className="text-base font-bold text-slate-900">
              Cấu hình khóa thủ công (API Key)
            </h2>
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

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Nếu ứng dụng được triển khai lên môi trường lưu trữ ngoài AI Studio (như Vercel hoặc GitHub Pages), bạn có thể nhập Firebase API Key và Project ID tại đây để kết nối cơ sở dữ liệu riêng của bạn.
          </p>

          <div className="space-y-3">
            <div>
              <label htmlFor="custom-fb-api-key" className="block text-xs font-semibold text-slate-700 mb-1">
                Firebase API Key
              </label>
              <input
                id="custom-fb-api-key"
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>

            <div>
              <label htmlFor="custom-fb-project-id" className="block text-xs font-semibold text-slate-700 mb-1">
                Firebase Project ID
              </label>
              <input
                id="custom-fb-project-id"
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="quan-ly-shipper"
                className="w-full min-h-[40px] px-3 py-2 text-xs sm:text-sm font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
          </div>

          {savedMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 text-center">
              ✓ Đã lưu cấu hình. Đang tải lại ứng dụng...
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-5 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Save className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Lưu và Tải lại</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
