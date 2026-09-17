export interface UserPermissions {
  view_real_profit: boolean;
  edit_buying_price: boolean;
  void_transaction: boolean;
  view_stock_valuation: boolean;
  expense_entry: boolean;
}

export type UserRole = 'ceo' | 'manager' | 'cashier' | 'owner';

export interface UserProfile {
  uid: string;
  email: string;
  username?: string;
  displayName: string;
  phone?: string;
  pin: string;
  role: UserRole;
  businessId: string;
  createdAt: string;
  permissions: UserPermissions;
  isActive: boolean;
  password?: string;
  allowedFeatures?: Record<string, boolean>;
}

export interface Business {
  id: string;
  name: string;
  ownerUid: string;
  address?: string;
  phone?: string;
  createdAt: string;
  isMain?: boolean;
  managerPin?: string; // 4-digit PIN for sensitive actions
  lastSaleNumber?: number;
}

export interface Transfer {
  id: string;
  fromBusinessId: string;
  toBusinessId: string;
  items: SaleItem[];
  status: 'pending' | 'completed' | 'cancelled';
  timestamp: string;
  senderId: string;
  receiverId?: string;
}

export type UnitType = 'pcs' | 'kg' | 'g' | 'L' | 'ml';

export interface Product {
  id: string;
  name: string;
  price: number;
  costPrice: number;
  stock: number;
  category: string;
  barcode?: string;
  expiryDate?: string;
  lowStockThreshold?: number;
  unit: UnitType;
  businessId: string;
  updatedAt: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  unit?: UnitType;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  total: number;
  discount?: number; // Discount applied at checkout
  netTotal: number; // total - discount
  isDiscounted?: boolean;
  cashierId: string;
  businessId: string;
  timestamp: string;
  adjustedTotal?: number; // Net total after adjustments
  paymentMethod: 'cash' | 'card' | 'm-pesa' | 'credit';
  mobileNetwork?: string | null; // e.g. M-Pesa, Tigo Pesa, Airtel Money, etc.
  cardName?: string | null; // e.g. Visa, Mastercard, CRDB, NMB, KCB, Stanbic, etc.
  customerId?: string; // If sold on credit
  saleNumber?: number;
}

export interface AdjustmentItem {
  productId: string;
  name: string;
  quantity: number; // Positive for returns (add to stock), negative for errors (remove from stock)
  price: number;
}

export interface Adjustment {
  id: string;
  saleId: string;
  businessId: string;
  amount: number; // The change in total (e.g., -500 for a return)
  reason: 'return' | 'error' | 'discount' | 'other';
  note?: string;
  userId: string;
  createdAt: string;
  items: AdjustmentItem[];
}

export interface VoidLog {
  id: string;
  productId: string;
  productName: string;
  cashierId: string;
  businessId: string;
  timestamp: string;
  reason: string;
}

export type AuditActionType = 
  | 'delete_product' 
  | 'delete_expense' 
  | 'delete_category' 
  | 'delete_supplier' 
  | 'delete_branch' 
  | 'void_item' 
  | 'clear_cart' 
  | 'price_change' 
  | 'cost_price_change' 
  | 'product_update' 
  | 'stock_update' 
  | 'update'
  | 'manual_discount' 
  | 'permission_change' 
  | 'pin_change' 
  | 'cash_drawer' 
  | 'login' 
  | 'void' 
  | 'other';

export type AuditCategory = 'delete' | 'update' | 'price' | 'void' | 'stock' | 'discount' | 'security' | 'other';

export interface AuditLog {
  id: string;
  type: AuditActionType | string;
  category?: AuditCategory;
  title?: string;
  productId?: string;
  productName?: string;
  originalPrice?: number;
  newPrice?: number;
  originalCostPrice?: number;
  newCostPrice?: number;
  originalValue?: string | number;
  newValue?: string | number;
  cashierId: string;
  cashierName?: string;
  businessId: string;
  timestamp: string;
  details: string;
  reason?: string;
  timeStr?: string; // Saa (e.g. "14:35:10")
  dayStr?: string;  // Siku (e.g. "Jumanne")
  dateStr?: string; // Tarehe (e.g. "15/09/2026")
  metadata?: Record<string, any>;
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  debtAmount: number;
  dueDate?: string;
  businessId: string;
}

export interface StockAdjustment {
  id: string;
  productId: string;
  productName: string;
  previousStock: number;
  newStock: number;
  difference: number;
  reason: 'correction' | 'damage' | 'found' | 'expired' | 'other';
  note?: string;
  userId: string;
  businessId: string;
  timestamp: string;
}

export interface Overstock {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  value: number;
  timestamp: string;
  businessId: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  businessId: string;
  timestamp: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  totalDebt: number;
  businessId: string;
  createdAt: string;
}

export interface CustomerDebt {
  id: string;
  customerId: string;
  amount: number;
  saleId?: string;
  type: 'debt' | 'payment';
  note?: string;
  timestamp: string;
  businessId: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  businessId: string;
  isCustom?: boolean;
}
