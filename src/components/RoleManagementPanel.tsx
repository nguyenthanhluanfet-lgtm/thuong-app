import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeftRight,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  addUserRoleRecord,
  deleteUserRoleRecord,
  subscribeToUsers,
  updateUserRoleById,
} from '../lib/firebase';
import type { AppUserRecord, UserRole } from '../types/order';
import { ADMIN_OWNER_PREFIX, ADMIN_PRIMARY_EMAIL, translateFirebaseAuthError } from '../utils/dispatch';

interface RoleManagementPanelProps {
  currentAdminEmail: string;
  onUsersSynced?: (users: AppUserRecord[]) => void;
}

export function RoleManagementPanel({
  currentAdminEmail,
  onUsersSynced,
}: RoleManagementPanelProps) {
  const [users, setUsers] = useState<AppUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Quick add form
  const [newEmail, setNewEmail] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('shipper');
  const [newPassword, setNewPassword] = useState('');
  const [adding, setAdding] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Per-row action state
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState('');

  useEffect(() => {
    setLoading(true);
    setLoadError('');
    const unsubscribe = subscribeToUsers(
      (nextUsers) => {
        setUsers(nextUsers);
        setLoading(false);
        onUsersSynced?.(nextUsers);
      },
      (err) => {
        setLoadError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [onUsersSynced]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  const adminCount = useMemo(
    () => users.filter((u) => u.role === 'admin').length,
    [users]
  );
  const shipperCount = useMemo(
    () => users.filter((u) => u.role === 'shipper').length,
    [users]
  );

  async function handleAddUser(e: FormEvent) {
    e.preventDefault();
    setFormFeedback(null);

    const cleanEmail = newEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormFeedback({
        type: 'error',
        message: 'Vui lòng nhập địa chỉ email hợp lệ.',
      });
      return;
    }

    if (newPassword && newPassword.length < 6) {
      setFormFeedback({
        type: 'error',
        message: 'Nếu nhập mật khẩu khởi tạo, mật khẩu phải có ít nhất 6 ký tự.',
      });
      return;
    }

    setAdding(true);
    try {
      const result = await addUserRoleRecord({
        email: cleanEmail,
        displayName: newDisplayName,
        role: newRole,
        password: newPassword || undefined,
      });

      setNewEmail('');
      setNewDisplayName('');
      setNewPassword('');
      setNewRole('shipper');

      const roleLabel = newRole === 'admin' ? 'Admin (Chủ shop)' : 'Shipper';
      if (result.authCreated) {
        setFormFeedback({
          type: 'success',
          message: `Đã tạo tài khoản đăng nhập Firebase Auth và lưu ${cleanEmail} với vai trò ${roleLabel}.`,
        });
      } else if (result.authExisted) {
        setFormFeedback({
          type: 'success',
          message: `Tài khoản ${cleanEmail} đã có sẵn trên Firebase Auth; đã cập nhật vai trò ${roleLabel} trên Firestore.`,
        });
      } else {
        setFormFeedback({
          type: 'success',
          message: `Đã lưu ${cleanEmail} vào danh sách phân quyền với vai trò ${roleLabel}.`,
        });
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      setFormFeedback({
        type: 'error',
        message: code
          ? translateFirebaseAuthError(code)
          : err instanceof Error
            ? err.message
            : 'Không thể thêm tài khoản phân quyền.',
      });
    } finally {
      setAdding(false);
    }
  }

  async function handleToggleRole(record: AppUserRecord) {
    setRowError('');
    const nextRole: UserRole = record.role === 'admin' ? 'shipper' : 'admin';
    setUpdatingId(record.id);
    try {
      await updateUserRoleById(record.id, nextRole);
    } catch (err: unknown) {
      setRowError(
        err instanceof Error ? err.message : 'Không thể thay đổi vai trò tài khoản.'
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeleteUserRecord(record: AppUserRecord) {
    setRowError('');
    setDeletingId(record.id);
    try {
      await deleteUserRoleRecord(record.id);
    } catch (err: unknown) {
      setRowError(err instanceof Error ? err.message : 'Không thể xóa tài khoản.');
    } finally {
      setDeletingId(null);
    }
  }

  const normalizedCurrent = currentAdminEmail.trim().toLowerCase();

  return (
    <div className="space-y-6">
      {/* Top Overview + Add Quick Account Form */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Quản lý Phân Quyền (Role)
            </h1>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              Tài khoản có <span className="font-mono text-xs">role: &quot;admin&quot;</span> hoặc email bắt đầu bằng{' '}
              <span className="font-mono text-xs">{ADMIN_OWNER_PREFIX}</span> mở giao diện Chủ shop; tài khoản khác tự động lưu <span className="font-mono text-xs">role: &quot;shipper&quot;</span> khi đăng nhập.
            </p>
          </div>

          <div className="flex items-center gap-6 shrink-0 text-sm">
            <div>
              <span className="text-xs text-slate-500 block">Chủ shop (Admin)</span>
              <span className="text-lg font-bold text-blue-700 tabular-nums">{adminCount}</span>
            </div>
            <div className="h-8 w-px bg-slate-200" aria-hidden="true" />
            <div>
              <span className="text-xs text-slate-500 block">Shipper</span>
              <span className="text-lg font-bold text-emerald-700 tabular-nums">{shipperCount}</span>
            </div>
          </div>
        </div>

        {/* Add Shipper / Admin Form */}
        <form onSubmit={handleAddUser} className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <UserPlus className="w-4 h-4 text-blue-700" aria-hidden="true" />
            <span>Thêm nhanh tài khoản vào danh sách phân quyền</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label htmlFor="role-new-email" className="block text-xs font-medium text-slate-700 mb-1">
                Email tài khoản
              </label>
              <input
                id="role-new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="shipper2@shipper.vn"
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                required
              />
            </div>

            <div>
              <label htmlFor="role-new-name" className="block text-xs font-medium text-slate-700 mb-1">
                Tên hiển thị
              </label>
              <input
                id="role-new-name"
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="Nguyễn Văn Tuấn"
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>

            <div>
              <label htmlFor="role-new-select" className="block text-xs font-medium text-slate-700 mb-1">
                Vai trò phân quyền
              </label>
              <select
                id="role-new-select"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full min-h-[40px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              >
                <option value="shipper">Shipper</option>
                <option value="admin">Admin (Chủ shop)</option>
              </select>
            </div>

            <div>
              <label htmlFor="role-new-password" className="block text-xs font-medium text-slate-700 mb-1">
                Mật khẩu (tùy chọn, ≥ 6 ký tự)
              </label>
              <input
                id="role-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Để trống nếu đã có tài khoản"
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
              />
            </div>
          </div>

          {formFeedback && (
            <div
              role={formFeedback.type === 'error' ? 'alert' : 'status'}
              className={`p-3 rounded-xl border text-xs leading-relaxed ${
                formFeedback.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              {formFeedback.message}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={adding}
              className="min-h-[42px] px-4 py-2 bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white text-sm font-semibold rounded-xl inline-flex items-center gap-2 transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4" aria-hidden="true" />
              <span>{adding ? 'Đang lưu...' : 'Thêm vào phân quyền'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Users Table */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-600" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900">
              Danh sách tài khoản trong collection users ({users.length})
            </h2>
          </div>

          <div className="relative w-full sm:w-72">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm email hoặc tên hiển thị..."
              aria-label="Tìm kiếm tài khoản"
              className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
            />
          </div>
        </div>

        {(loadError || rowError) && (
          <div role="alert" className="m-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
            {loadError || rowError}
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Đang tải danh sách phân quyền từ Firestore...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Chưa có tài khoản nào trong collection users khớp tìm kiếm.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Tên hiển thị</th>
                  <th className="py-3 px-4">Vai trò hiện tại</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredUsers.map((record) => {
                  const isSelf = record.email === normalizedCurrent;
                  const isProtectedOwner =
                    record.email.startsWith(ADMIN_OWNER_PREFIX) ||
                    record.email === ADMIN_PRIMARY_EMAIL;
                  const isUpdating = updatingId === record.id;
                  const isDeleting = deletingId === record.id;

                  return (
                    <tr key={record.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-900">
                        {record.email}
                        {isSelf && (
                          <span className="ml-2 font-sans text-slate-500">(Bạn)</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-800">
                        {record.displayName}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                            record.role === 'admin' ? 'text-blue-700' : 'text-emerald-700'
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {record.role === 'admin' ? 'Admin (Chủ shop)' : 'Shipper'}
                          </span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isUpdating || isSelf || isProtectedOwner}
                            onClick={() => handleToggleRole(record)}
                            title={
                              isProtectedOwner || isSelf
                                ? 'Không thể hạ quyền tài khoản Chủ shop chính'
                                : undefined
                            }
                            className="min-h-[34px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>
                              {isUpdating
                                ? 'Đang lưu...'
                                : record.role === 'admin'
                                  ? 'Chuyển thành Shipper'
                                  : 'Chuyển thành Admin'}
                            </span>
                          </button>

                          {!isSelf && !isProtectedOwner && (
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => handleDeleteUserRecord(record)}
                              aria-label={`Xóa ${record.email} khỏi bảng phân quyền`}
                              className="min-h-[34px] px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-50 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Xóa</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
