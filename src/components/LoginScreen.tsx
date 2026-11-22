import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock, Mail, MapPinned, Sparkles, Truck } from 'lucide-react';
import { loginWithEmail, registerShipperAccount } from '../lib/firebase';
import { translateFirebaseAuthError } from '../utils/dispatch';

type AuthMode = 'login' | 'register';

export function LoginScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage('');

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage('Vui lòng nhập địa chỉ email.');
      return;
    }
    if (!password || password.length < 6) {
      setErrorMessage('Mật khẩu cần có ít nhất 6 ký tự.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await loginWithEmail(cleanEmail, password);
      } else {
        await registerShipperAccount(cleanEmail, password);
      }
    } catch (err: unknown) {
      const firebaseErr = err as { code?: string };
      setErrorMessage(translateFirebaseAuthError(firebaseErr?.code));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between px-4 py-6 sm:px-6 lg:px-8">
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-8">
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <div className="w-9 h-9 rounded-lg bg-blue-700 text-white flex items-center justify-center">
            <Truck className="w-5 h-5" aria-hidden="true" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900">ShipFlow</span>
        </div>
        <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
          Điều phối &amp; Giao hàng
        </span>
      </header>

      <main className="w-full max-w-5xl mx-auto my-auto py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Desktop Context Column (hidden on small screens so mobile stays focused) */}
        <section className="hidden lg:block lg:col-span-6 space-y-6 pr-4">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 leading-tight text-balance">
              Quản lý đơn hàng &amp; phân bổ tuyến Shipper theo thời gian thực
            </h1>
            <p className="text-base text-slate-600 leading-relaxed">
              Đăng nhập bằng tài khoản Firebase để mở đúng không gian làm việc theo vai trò Chủ shop hoặc Nhân viên giao hàng.
            </p>
          </div>

          <div className="divide-y divide-slate-200 border-t border-b border-slate-200">
            <div className="py-4 flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Giao diện Chủ shop (Admin)
                </h2>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                  Bóc tách tin nhắn Zalo bằng Gemini AI, tự động gom cụm địa chỉ gần nhau và gán Shipper phụ trách từng tuyến.
                </p>
              </div>
            </div>

            <div className="py-4 flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                <MapPinned className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Giao diện Shipper (Tối ưu di động)
                </h2>
                <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                  Xem cụm tuyến được gán, gọi nhanh cho khách hàng, mở lộ trình Google Maps nhiều điểm và xác nhận hoàn thành ngay trên đường.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Auth Card */}
        <div className="lg:col-span-6 w-full max-w-md mx-auto lg:ml-auto lg:mr-0">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 text-balance">
                {mode === 'login' ? 'Đăng nhập hệ thống' : 'Đăng ký tài khoản Shipper'}
              </h2>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                {mode === 'login'
                  ? 'Nhập Email và Mật khẩu Firebase để truy cập.'
                  : 'Tạo tài khoản giao hàng mới bằng Email và Mật khẩu.'}
              </p>
            </div>

            <div
              role="tablist"
              aria-label="Chế độ xác thực"
              className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-6"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                onClick={() => {
                  setMode('login');
                  setErrorMessage('');
                }}
                className={`min-h-[40px] px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                onClick={() => {
                  setMode('register');
                  setErrorMessage('');
                }}
                className={`min-h-[40px] px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Đăng ký mới
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div>
                <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email đăng nhập
                </label>
                <div className="relative">
                  <Mail
                    className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@shipper.vn"
                    className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Mật khẩu
                </label>
                <div className="relative">
                  <Lock
                    className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Tối thiểu 6 ký tự"
                    className="w-full min-h-[44px] pl-10 pr-11 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-500 hover:text-slate-800 rounded-md cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
                >
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[46px] px-4 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                {submitting
                  ? 'Đang xác thực...'
                  : mode === 'login'
                    ? 'Đăng nhập vào hệ thống'
                    : 'Tạo tài khoản Shipper'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500 space-y-1">
              <p className="font-medium text-slate-700">Phân quyền tự động từ Firestore (users):</p>
              <p>Chủ shop (Admin): role &quot;admin&quot; hoặc email bắt đầu bằng &quot;thuong@&quot;</p>
              <p>Shipper: role &quot;shipper&quot; hoặc tự động lưu vai trò Shipper khi mới đăng nhập</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-5xl w-full mx-auto text-center text-xs text-slate-500">
        ShipFlow · Kết nối thời gian thực Firebase Auth &amp; Firestore
      </footer>
    </div>
  );
}
