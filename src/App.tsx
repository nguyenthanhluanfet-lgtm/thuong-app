import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Truck } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { LoginScreen } from './components/LoginScreen';
import { ShipperDashboard } from './components/ShipperDashboard';
import {
  resolveUserRole,
  saveDispatchConfig,
  subscribeAuth,
  subscribeToDispatchConfig,
  subscribeToOrders,
} from './lib/firebase';
import type { DeliveryOrder, DispatchConfig, UserRole } from './types/order';
import { DEFAULT_DISPATCH_CONFIG } from './utils/dispatch';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [orders, setOrders] = useState<DeliveryOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [firestoreError, setFirestoreError] = useState('');
  const [dispatchConfig, setDispatchConfig] = useState<DispatchConfig>(
    DEFAULT_DISPATCH_CONFIG
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeAuth(async (firebaseUser) => {
      if (!active) return;

      if (!firebaseUser) {
        setUser(null);
        setRole(null);
        setOrders([]);
        setAuthLoading(false);
        return;
      }

      setAuthLoading(true);
      setUser(firebaseUser);
      const resolved = await resolveUserRole(firebaseUser);
      if (active) {
        setRole(resolved);
        setAuthLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || !role) return;

    setLoadingOrders(true);
    setFirestoreError('');
    const unsubOrders = subscribeToOrders(
      (nextOrders) => {
        setOrders(nextOrders);
        setLoadingOrders(false);
      },
      (err) => {
        setFirestoreError(err.message);
        setLoadingOrders(false);
      }
    );

    const unsubConfig = subscribeToDispatchConfig((nextConfig) => {
      setDispatchConfig(nextConfig);
    });

    return () => {
      unsubOrders();
      unsubConfig();
    };
  }, [user, role]);

  async function handleUpdateDispatchConfig(nextConfig: DispatchConfig) {
    setDispatchConfig(nextConfig);
    await saveDispatchConfig(nextConfig);
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-600 gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center">
          <Truck className="w-5 h-5" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium">Đang kiểm tra phiên đăng nhập...</p>
      </div>
    );
  }

  if (!user || !role) {
    return <LoginScreen />;
  }

  const email = user.email ?? 'user@shipper.vn';

  if (role === 'admin') {
    return (
      <AdminDashboard
        userEmail={email}
        orders={orders}
        loadingOrders={loadingOrders}
        firestoreError={firestoreError}
        dispatchConfig={dispatchConfig}
        onUpdateDispatchConfig={handleUpdateDispatchConfig}
      />
    );
  }

  return (
    <ShipperDashboard
      userEmail={email}
      orders={orders}
      loadingOrders={loadingOrders}
      firestoreError={firestoreError}
      dispatchConfig={dispatchConfig}
    />
  );
}
