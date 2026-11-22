import { getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Unsubscribe,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type {
  AppUserRecord,
  DeliveryOrder,
  DeliveryState,
  DispatchConfig,
  ExtractedOrderInput,
  OrderStatus,
  UserRole,
} from '../types/order';
import {
  DEFAULT_DISPATCH_CONFIG,
  DEFAULT_SHOP_ORIGIN,
  deriveDisplayNameFromEmail,
  normalizeDeliveryState,
  normalizeOrderStatus,
  resolveRoleFromEmailAndProfile,
} from '../utils/dispatch';
import {
  isValidHanoiCoordinate,
  resolveHanoiDistrictFallback,
} from '../utils/hanoiGeocode';

function getStoredFirebaseConfig() {
  const envConfig = {
    apiKey: typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_API_KEY ? import.meta.env.VITE_FIREBASE_API_KEY : '',
    authDomain: typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN ? import.meta.env.VITE_FIREBASE_AUTH_DOMAIN : '',
    projectId: typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_PROJECT_ID ? import.meta.env.VITE_FIREBASE_PROJECT_ID : '',
    storageBucket: typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET ? import.meta.env.VITE_FIREBASE_STORAGE_BUCKET : '',
    messagingSenderId: typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID ? import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID : '',
    appId: typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_APP_ID ? import.meta.env.VITE_FIREBASE_APP_ID : '',
  };

  if (envConfig.apiKey && envConfig.projectId) {
    return envConfig;
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const customKey = window.localStorage.getItem('shipflow_custom_fb_api_key');
      const customProject = window.localStorage.getItem('shipflow_custom_fb_project_id');
      if (customKey && customProject) {
        return {
          apiKey: customKey,
          authDomain: `${customProject}.firebaseapp.com`,
          projectId: customProject,
          storageBucket: `${customProject}.firebasestorage.app`,
          messagingSenderId: '148963641194',
          appId: `1:148963641194:web:${customKey.slice(0, 16)}`,
        };
      }
    }
  } catch {}

  return {
    apiKey: 'AIzaSyBX7xeM_qRl6I3HEdT1aG3Udif8gtDYZAk',
    authDomain: 'quan-ly-shipper.firebaseapp.com',
    projectId: 'quan-ly-shipper',
    storageBucket: 'quan-ly-shipper.firebasestorage.app',
    messagingSenderId: '148963641194',
    appId: '1:148963641194:web:081e1d1870190c544a8713',
  };
}

const firebaseConfig = getStoredFirebaseConfig();

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const ORDERS_COLLECTION = 'delivery_orders';
const USERS_COLLECTION = 'users';
const SETTINGS_COLLECTION = 'settings';
const DISPATCH_CONFIG_DOC_ID = 'dispatch_config';
const LOCAL_DISPATCH_CONFIG_KEY = 'shipflow_dispatch_config_v1';

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (
    val &&
    typeof val === 'object' &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val.trim()) {
    return val;
  }
  return new Date().toISOString();
}

export function subscribeAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function registerShipperAccount(email: string, password: string): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export async function resolveUserRole(user: User): Promise<UserRole> {
  const normalizedEmail = (user.email ?? '').trim().toLowerCase();
  let existingRole: string | null = null;
  let foundDocId: string | null = null;
  let foundHasUid = false;

  try {
    if (normalizedEmail) {
      const q = query(
        collection(db, USERS_COLLECTION),
        where('email', '==', normalizedEmail)
      );
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        const firstDoc = querySnap.docs[0];
        const data = firstDoc.data();
        foundDocId = firstDoc.id;
        existingRole = String(data?.role ?? '');
        foundHasUid = Boolean(data?.uid);
      }
    }

    if (!foundDocId) {
      const uidSnap = await getDoc(doc(db, USERS_COLLECTION, user.uid));
      if (uidSnap.exists()) {
        const data = uidSnap.data();
        foundDocId = uidSnap.id;
        existingRole = String(data?.role ?? '');
        foundHasUid = true;
      }
    }
  } catch {
    // Gracefully fallback to email rule if Firestore users read is restricted
  }

  const resolvedRole = resolveRoleFromEmailAndProfile(normalizedEmail, existingRole);

  // Auto-create user in `users` collection if missing, or backfill uid if pre-added by Admin
  try {
    if (!foundDocId && normalizedEmail) {
      await setDoc(
        doc(db, USERS_COLLECTION, user.uid),
        {
          email: normalizedEmail,
          displayName: user.displayName?.trim() || deriveDisplayNameFromEmail(normalizedEmail),
          role: resolvedRole,
          uid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else if (foundDocId && !foundHasUid) {
      await updateDoc(doc(db, USERS_COLLECTION, foundDocId), {
        uid: user.uid,
        updatedAt: serverTimestamp(),
      });
    }
  } catch {
    // Ignore write failure if Firestore rules restrict users writes
  }

  return resolvedRole;
}

export function subscribeToUsers(
  onUsers: (users: AppUserRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, USERS_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: AppUserRecord[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const email = String(data.email ?? '').trim().toLowerCase();
        const rawRole = String(data.role ?? '').trim().toLowerCase();
        const role: UserRole = rawRole === 'admin' ? 'admin' : 'shipper';
        return {
          id: docSnap.id,
          email,
          displayName:
            String(data.displayName ?? '').trim() || deriveDisplayNameFromEmail(email),
          role,
          uid: data.uid ? String(data.uid) : undefined,
          createdAt: data.createdAt ? toIsoString(data.createdAt) : undefined,
          updatedAt: data.updatedAt ? toIsoString(data.updatedAt) : undefined,
        };
      });

      list.sort((a, b) => {
        if (a.role !== b.role) {
          return a.role === 'admin' ? -1 : 1;
        }
        return a.email.localeCompare(b.email);
      });

      onUsers(list);
    },
    (error) => {
      onError(error);
    }
  );
}

export async function updateUserRoleById(docId: string, nextRole: UserRole): Promise<void> {
  await updateDoc(doc(db, USERS_COLLECTION, docId), {
    role: nextRole,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteUserRoleRecord(docId: string): Promise<void> {
  await deleteDoc(doc(db, USERS_COLLECTION, docId));
}

export async function addUserRoleRecord(input: {
  email: string;
  displayName: string;
  role: UserRole;
  password?: string;
}): Promise<{ authCreated: boolean; authExisted: boolean }> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const displayName =
    input.displayName.trim() || deriveDisplayNameFromEmail(normalizedEmail);
  let provisionedUid: string | undefined;
  let authCreated = false;
  let authExisted = false;

  if (input.password && input.password.length >= 6) {
    const secondaryName = 'AdminUserProvisioner';
    const existingApp = getApps().find((a) => a.name === secondaryName);
    const secondaryApp = existingApp ?? initializeApp(firebaseConfig, secondaryName);
    const secondaryAuth = getAuth(secondaryApp);
    try {
      const cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        normalizedEmail,
        input.password
      );
      provisionedUid = cred.user.uid;
      authCreated = true;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/email-already-in-use') {
        authExisted = true;
      } else {
        throw err;
      }
    } finally {
      await signOut(secondaryAuth).catch(() => {});
    }
  }

  const existingQuery = query(
    collection(db, USERS_COLLECTION),
    where('email', '==', normalizedEmail)
  );
  const existingSnap = await getDocs(existingQuery);

  if (!existingSnap.empty) {
    const targetDoc = existingSnap.docs[0];
    await updateDoc(doc(db, USERS_COLLECTION, targetDoc.id), {
      displayName,
      role: input.role,
      ...(provisionedUid ? { uid: provisionedUid } : {}),
      updatedAt: serverTimestamp(),
    });
  } else if (provisionedUid) {
    await setDoc(doc(db, USERS_COLLECTION, provisionedUid), {
      email: normalizedEmail,
      displayName,
      role: input.role,
      uid: provisionedUid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await addDoc(collection(db, USERS_COLLECTION), {
      email: normalizedEmail,
      displayName,
      role: input.role,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  return { authCreated, authExisted };
}

export function subscribeToOrders(
  onOrders: (orders: DeliveryOrder[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const colRef = collection(db, ORDERS_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: DeliveryOrder[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const diaChi = String(data.dia_chi ?? '');
        const rawLat = typeof data.lat === 'number' ? data.lat : Number(data.lat);
        const rawLng = typeof data.lng === 'number' ? data.lng : Number(data.lng);
        const hasValidHanoi = isValidHanoiCoordinate(rawLat, rawLng);
        const hasAnyCoords =
          Number.isFinite(rawLat) &&
          Number.isFinite(rawLng) &&
          !(rawLat === 0 && rawLng === 0);

        // If stored coords jumped outside Hanoi (e.g. Hải Phòng / Thanh Hóa), snap cleanly to Hanoi district center
        const sanitizedCoords = hasValidHanoi
          ? { lat: rawLat, lng: rawLng }
          : hasAnyCoords || diaChi
            ? (() => {
                const fb = resolveHanoiDistrictFallback(diaChi, docSnap.id);
                return { lat: fb.lat, lng: fb.lng };
              })()
            : null;

        const status = normalizeOrderStatus(data.status);
        const shipperAssigned = String(data.shipper_assigned ?? '').trim();
        const shipperEmail = String(data.shipperEmail ?? shipperAssigned).trim();
        const deliveryState = normalizeDeliveryState(
          data.deliveryState,
          status,
          shipperEmail,
          shipperAssigned
        );

        return {
          id: docSnap.id,
          ten_khach: String(data.ten_khach ?? 'Khách hàng'),
          sdt: String(data.sdt ?? ''),
          dia_chi: diaChi,
          ghi_chu: String(data.ghi_chu ?? ''),
          cum_khu_vuc: String(data.cum_khu_vuc ?? 'Chưa phân cụm'),
          shipper_assigned: shipperAssigned,
          shipperEmail,
          deliveryState,
          status,
          ...(sanitizedCoords ? sanitizedCoords : {}),
          createdAt: toIsoString(data.createdAt),
          claimedAt: data.claimedAt ? toIsoString(data.claimedAt) : undefined,
          completedAt: data.completedAt ? toIsoString(data.completedAt) : undefined,
          deliveredAt: data.deliveredAt ? toIsoString(data.deliveredAt) : undefined,
          completedBy: data.completedBy ? String(data.completedBy) : undefined,
          createdBy: data.createdBy ? String(data.createdBy) : undefined,
          proofImage: data.proofImage ? String(data.proofImage) : undefined,
        };
      });

      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onOrders(list);
    },
    (error) => {
      onError(error);
    }
  );
}

export async function saveExtractedOrdersBatch(
  orders: ExtractedOrderInput[],
  adminEmail: string
): Promise<number> {
  if (orders.length === 0) return 0;
  const colRef = collection(db, ORDERS_COLLECTION);

  const parallelWrites = Promise.all(
    orders.map((item) => {
      const hasCoords =
        typeof item.lat === 'number' &&
        typeof item.lng === 'number' &&
        Number.isFinite(item.lat) &&
        Number.isFinite(item.lng);

      return addDoc(colRef, {
        ten_khach: item.ten_khach,
        sdt: item.sdt,
        dia_chi: item.dia_chi,
        ghi_chu: item.ghi_chu,
        cum_khu_vuc: item.cum_khu_vuc,
        ...(hasCoords ? { lat: item.lat, lng: item.lng } : {}),
        shipper_assigned: '',
        shipperEmail: '',
        deliveryState: 'available' satisfies DeliveryState,
        status: 'pending' satisfies OrderStatus,
        createdAt: serverTimestamp(),
        createdBy: adminEmail,
      });
    })
  );

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          'Lưu đơn hàng lên Firestore vượt quá 15 giây (Timeout). Vui lòng kiểm tra kết nối mạng hoặc Firestore Rules.'
        )
      );
    }, 15000);
  });

  try {
    await Promise.race([parallelWrites, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }

  return orders.length;
}

export async function createSingleOrder(
  order: Omit<DeliveryOrder, 'id' | 'createdAt' | 'deliveryState' | 'shipperEmail'> & {
    deliveryState?: DeliveryState;
    shipperEmail?: string;
  },
  adminEmail: string
): Promise<void> {
  const hasCoords =
    typeof order.lat === 'number' &&
    typeof order.lng === 'number' &&
    Number.isFinite(order.lat) &&
    Number.isFinite(order.lng);

  const cleanShipper = (order.shipperEmail || order.shipper_assigned || '').trim();
  const deliveryState: DeliveryState =
    order.status === 'completed'
      ? 'done'
      : cleanShipper
        ? 'delivering'
        : 'available';

  await addDoc(collection(db, ORDERS_COLLECTION), {
    ten_khach: order.ten_khach.trim(),
    sdt: order.sdt.trim(),
    dia_chi: order.dia_chi.trim(),
    ghi_chu: order.ghi_chu.trim(),
    cum_khu_vuc: order.cum_khu_vuc.trim() || 'Khu vực chung',
    shipper_assigned: cleanShipper,
    shipperEmail: cleanShipper,
    deliveryState,
    status: order.status,
    ...(hasCoords ? { lat: order.lat, lng: order.lng } : {}),
    createdAt: serverTimestamp(),
    createdBy: adminEmail,
  });
}

export async function updateOrderDetails(
  orderId: string,
  updates: Partial<
    Pick<
      DeliveryOrder,
      | 'ten_khach'
      | 'sdt'
      | 'dia_chi'
      | 'ghi_chu'
      | 'cum_khu_vuc'
      | 'shipper_assigned'
      | 'shipperEmail'
      | 'deliveryState'
      | 'status'
      | 'lat'
      | 'lng'
    >
  >
): Promise<void> {
  const payload: Record<string, unknown> = { ...updates };
  if (payload.lat === undefined) delete payload.lat;
  if (payload.lng === undefined) delete payload.lng;

  if (typeof updates.shipper_assigned === 'string' && updates.shipperEmail === undefined) {
    const cleanShipper = updates.shipper_assigned.trim();
    payload.shipper_assigned = cleanShipper;
    payload.shipperEmail = cleanShipper;
    if (updates.status !== 'completed') {
      payload.deliveryState = cleanShipper ? 'delivering' : 'available';
    }
  }

  if (updates.status === 'completed') {
    payload.deliveryState = 'done' satisfies DeliveryState;
    payload.completedAt = serverTimestamp();
  } else if (updates.status === 'pending' && updates.deliveryState === undefined) {
    const hasShipper =
      typeof payload.shipperEmail === 'string'
        ? payload.shipperEmail.trim().length > 0
        : typeof payload.shipper_assigned === 'string'
          ? payload.shipper_assigned.trim().length > 0
          : false;
    payload.deliveryState = hasShipper ? 'delivering' : 'available';
  }

  await updateDoc(doc(db, ORDERS_COLLECTION, orderId), payload);
}

export async function assignClusterShipper(
  orderIds: string[],
  shipperAssigned: string
): Promise<void> {
  if (orderIds.length === 0) return;
  const batch = writeBatch(db);
  const cleanShipper = shipperAssigned.trim();
  const nextState: DeliveryState = cleanShipper ? 'delivering' : 'available';

  for (const orderId of orderIds) {
    batch.update(doc(db, ORDERS_COLLECTION, orderId), {
      shipper_assigned: cleanShipper,
      shipperEmail: cleanShipper,
      deliveryState: nextState,
    });
  }

  await batch.commit();
}

export async function deleteOrderById(orderId: string): Promise<void> {
  await deleteDoc(doc(db, ORDERS_COLLECTION, orderId));
}

export async function markOrderCompleted(
  orderId: string,
  shipperEmail: string,
  proofImage?: string
): Promise<void> {
  await updateDoc(doc(db, ORDERS_COLLECTION, orderId), {
    status: 'completed' satisfies OrderStatus,
    deliveryState: 'done' satisfies DeliveryState,
    completedAt: serverTimestamp(),
    deliveredAt: serverTimestamp(),
    completedBy: shipperEmail,
    ...(proofImage ? { proofImage } : {}),
  });
}

export async function claimOrdersAtomic(
  orderIds: string[],
  shipperEmail: string
): Promise<{ claimedIds: string[]; skippedIds: string[] }> {
  const cleanEmail = shipperEmail.trim().toLowerCase();
  if (!cleanEmail || orderIds.length === 0) {
    return { claimedIds: [], skippedIds: [] };
  }

  return runTransaction(db, async (transaction) => {
    const refs = orderIds.map((id) => doc(db, ORDERS_COLLECTION, id));
    const snaps = await Promise.all(refs.map((ref) => transaction.get(ref)));

    const claimedIds: string[] = [];
    const skippedIds: string[] = [];

    snaps.forEach((snap, idx) => {
      const orderId = orderIds[idx];
      if (!snap.exists()) {
        skippedIds.push(orderId);
        return;
      }
      const data = snap.data();
      const status = normalizeOrderStatus(data.status);
      const currentShipper = String(data.shipperEmail ?? data.shipper_assigned ?? '').trim();
      const state = normalizeDeliveryState(
        data.deliveryState,
        status,
        currentShipper,
        String(data.shipper_assigned ?? '')
      );

      if (state !== 'available') {
        skippedIds.push(orderId);
        return;
      }

      transaction.update(refs[idx], {
        deliveryState: 'delivering' satisfies DeliveryState,
        shipperEmail: cleanEmail,
        shipper_assigned: cleanEmail,
        claimedAt: serverTimestamp(),
      });
      claimedIds.push(orderId);
    });

    return { claimedIds, skippedIds };
  });
}

export async function releaseClaimedOrderAtomic(
  orderId: string,
  shipperEmail: string
): Promise<void> {
  const cleanEmail = shipperEmail.trim().toLowerCase();
  const ref = doc(db, ORDERS_COLLECTION, orderId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) {
      throw new Error('Đơn hàng không còn tồn tại trên hệ thống.');
    }
    const data = snap.data();
    const status = normalizeOrderStatus(data.status);
    if (status === 'completed' || data.deliveryState === 'done') {
      throw new Error('Đơn hàng đã giao xong, không thể hủy nhận.');
    }

    const owner = String(data.shipperEmail ?? data.shipper_assigned ?? '')
      .trim()
      .toLowerCase();
    const emailPrefix = cleanEmail.split('@')[0] ?? '';
    const isOwner =
      owner === cleanEmail ||
      (emailPrefix.length >= 3 && owner === emailPrefix);

    if (owner && !isOwner) {
      throw new Error(`Đơn này đang được giao bởi ${owner}, bạn không thể hủy nhận.`);
    }

    transaction.update(ref, {
      deliveryState: 'available' satisfies DeliveryState,
      shipperEmail: '',
      shipper_assigned: '',
    });
  });
}

function sanitizeDispatchConfig(raw: unknown): DispatchConfig {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_DISPATCH_CONFIG;
  }
  const obj = raw as Record<string, unknown>;
  const rawOrigin = (obj.shopOrigin && typeof obj.shopOrigin === 'object'
    ? obj.shopOrigin
    : {}) as Record<string, unknown>;

  const lat = Number(rawOrigin.lat);
  const lng = Number(rawOrigin.lng);
  const validOrigin = isValidHanoiCoordinate(lat, lng);

  const shopOrigin = validOrigin
    ? {
        label: String(rawOrigin.label ?? '').trim() || 'Kho Shop',
        address: String(rawOrigin.address ?? '').trim() || DEFAULT_SHOP_ORIGIN.address,
        lat: Number(lat.toFixed(6)),
        lng: Number(lng.toFixed(6)),
      }
    : DEFAULT_SHOP_ORIGIN;

  const rawMax = Number(obj.maxOrdersPerShipper);
  const maxOrdersPerShipper = Number.isFinite(rawMax)
    ? Math.min(10, Math.max(3, Math.round(rawMax)))
    : DEFAULT_DISPATCH_CONFIG.maxOrdersPerShipper;

  const rawRadius = Number(obj.radiusKm);
  const radiusKm = Number.isFinite(rawRadius)
    ? Math.min(5, Math.max(1, Math.round(rawRadius * 2) / 2))
    : DEFAULT_DISPATCH_CONFIG.radiusKm;

  return {
    shopOrigin,
    maxOrdersPerShipper,
    radiusKm,
  };
}

export function loadLocalDispatchConfig(): DispatchConfig {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return DEFAULT_DISPATCH_CONFIG;
    }
    const raw = window.localStorage.getItem(LOCAL_DISPATCH_CONFIG_KEY);
    if (!raw) return DEFAULT_DISPATCH_CONFIG;
    return sanitizeDispatchConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_DISPATCH_CONFIG;
  }
}

function writeLocalDispatchConfig(config: DispatchConfig): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LOCAL_DISPATCH_CONFIG_KEY, JSON.stringify(config));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function subscribeToDispatchConfig(
  onConfig: (config: DispatchConfig) => void
): Unsubscribe {
  onConfig(loadLocalDispatchConfig());
  const docRef = doc(db, SETTINGS_COLLECTION, DISPATCH_CONFIG_DOC_ID);
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const sanitized = sanitizeDispatchConfig(snap.data());
        writeLocalDispatchConfig(sanitized);
        onConfig(sanitized);
      }
    },
    () => {
      // Fallback gracefully to localStorage if Firestore rules limit settings read
    }
  );
}

export async function saveDispatchConfig(config: DispatchConfig): Promise<void> {
  const clean = sanitizeDispatchConfig(config);
  writeLocalDispatchConfig(clean);
  try {
    await setDoc(
      doc(db, SETTINGS_COLLECTION, DISPATCH_CONFIG_DOC_ID),
      {
        shopOrigin: clean.shopOrigin,
        maxOrdersPerShipper: clean.maxOrdersPerShipper,
        radiusKm: clean.radiusKm,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch {
    // Keep localStorage copy active if Firestore settings write is restricted
  }
}
