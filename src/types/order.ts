export type UserRole = 'admin' | 'shipper';

export type OrderStatus = 'pending' | 'completed';

export type DeliveryState = 'available' | 'delivering' | 'done';

export type DispatchViewMode = 'clusters' | 'district' | 'nearest_gps' | 'all_flat';

export interface AppUserRecord {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  uid?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeliveryOrder {
  id: string;
  ten_khach: string;
  sdt: string;
  dia_chi: string;
  ghi_chu: string;
  cum_khu_vuc: string;
  shipper_assigned: string;
  shipperEmail: string;
  deliveryState: DeliveryState;
  status: OrderStatus;
  lat?: number;
  lng?: number;
  createdAt: string;
  claimedAt?: string;
  completedAt?: string;
  deliveredAt?: string;
  completedBy?: string;
  createdBy?: string;
  proofImage?: string;
}

export interface ExtractedOrderInput {
  ten_khach: string;
  sdt: string;
  dia_chi: string;
  dia_chi_tim_map?: string;
  ghi_chu: string;
  cum_khu_vuc: string;
  lat?: number;
  lng?: number;
}

export interface ShopOrigin {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

export interface DispatchConfig {
  shopOrigin: ShopOrigin;
  maxOrdersPerShipper: number;
  radiusKm: number;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RouteLegInstruction {
  legIndex: number;
  orderId?: string;
  customerName: string;
  address: string;
  distanceKm: number;
  durationMinutes: number;
  streetSummary?: string;
}

export interface OsrmRouteResult {
  coordinates: [number, number][];
  legs: RouteLegInstruction[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  isFallback: boolean;
}

export interface ClusterGroup {
  clusterName: string;
  color: string;
  orders: DeliveryOrder[];
  pendingOrders: DeliveryOrder[];
  completedOrders: DeliveryOrder[];
  assignedShippers: string[];
  primaryShipper: string;
  googleMapsUrl: string;
  totalDistanceKm: number;
  routeDirectionLabel?: string;
}

export interface OrderStats {
  total: number;
  pending: number;
  completed: number;
  activeClusters: number;
  completionRate: number;
}
