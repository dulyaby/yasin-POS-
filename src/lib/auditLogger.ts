import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { AuditLog, AuditActionType, AuditCategory } from '../types';

export const SWAHILI_DAYS = [
  'Jumapili',
  'Jumatatu',
  'Jumanne',
  'Jumatano',
  'Alhamisi',
  'Ijumaa',
  'Jumamosi'
];

export const SWAHILI_MONTHS = [
  'Januari',
  'Februari',
  'Machi',
  'Aprili',
  'Mei',
  'Juni',
  'Julai',
  'Agosti',
  'Septemba',
  'Oktoba',
  'Novemba',
  'Desemba'
];

export function getDayNameSwahili(date: Date = new Date()): string {
  return SWAHILI_DAYS[date.getDay()];
}

export function formatDateSwahili(date: Date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const monthName = SWAHILI_MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${monthName} ${year}`;
}

export function formatTimeWithSeconds(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function parseDayDateFromTimestamp(timestampStr?: string): { day: string; date: string; time: string } {
  try {
    const d = timestampStr ? new Date(timestampStr) : new Date();
    if (isNaN(d.getTime())) {
      const now = new Date();
      return {
        day: getDayNameSwahili(now),
        date: formatDateSwahili(now),
        time: formatTimeWithSeconds(now)
      };
    }
    return {
      day: getDayNameSwahili(d),
      date: formatDateSwahili(d),
      time: formatTimeWithSeconds(d)
    };
  } catch {
    const now = new Date();
    return {
      day: getDayNameSwahili(now),
      date: formatDateSwahili(now),
      time: formatTimeWithSeconds(now)
    };
  }
}

export interface LogEventInput {
  businessId: string;
  type: AuditActionType;
  category?: AuditCategory;
  title?: string;
  details: string;
  cashierId: string;
  cashierName?: string;
  productId?: string;
  productName?: string;
  originalPrice?: number;
  newPrice?: number;
  originalCostPrice?: number;
  newCostPrice?: number;
  originalValue?: string | number;
  newValue?: string | number;
  reason?: string;
  metadata?: Record<string, any>;
  notifyCeo?: boolean;
}

export async function logAuditEvent(input: LogEventInput): Promise<string | null> {
  if (!input.businessId) return null;

  const now = new Date();
  const timestamp = now.toISOString();
  const timeStr = formatTimeWithSeconds(now);
  const dayStr = getDayNameSwahili(now);
  const dateStr = formatDateSwahili(now);

  // Determine category if not explicitly provided
  let category: AuditCategory = input.category || 'other';
  if (!input.category) {
    if (input.type.startsWith('delete_')) category = 'delete';
    else if (input.type === 'void_item' || input.type === 'clear_cart' || input.type === 'void') category = 'void';
    else if (input.type === 'price_change' || input.type === 'cost_price_change') category = 'price';
    else if (input.type === 'stock_update') category = 'stock';
    else if (input.type === 'manual_discount') category = 'discount';
    else if (input.type === 'permission_change' || input.type === 'pin_change' || input.type === 'cash_drawer') category = 'security';
    else category = 'update';
  }

  // Derive human-readable Swahili title if not given
  let title = input.title;
  if (!title) {
    switch (input.type) {
      case 'delete_product':
        title = `Kufuta Bidhaa${input.productName ? `: ${input.productName}` : ''}`;
        break;
      case 'delete_expense':
        title = 'Kufuta Matumizi / Gharama';
        break;
      case 'delete_category':
        title = 'Kufuta Kundi la Matumizi';
        break;
      case 'delete_supplier':
        title = 'Kufuta Msambazaji';
        break;
      case 'delete_branch':
        title = 'Kufuta Tawi / Duka';
        break;
      case 'void_item':
        title = `Kutoa Bidhaa Kapuni: ${input.productName || ''}`;
        break;
      case 'clear_cart':
        title = 'Kufuta Kapu Zima (Clear Cart)';
        break;
      case 'price_change':
        title = `Kubadilisha Bei ya Kuuza: ${input.productName || ''}`;
        break;
      case 'cost_price_change':
        title = `Kubadilisha Bei ya Kununua: ${input.productName || ''}`;
        break;
      case 'stock_update':
        title = `Marekebisho ya Stoo: ${input.productName || ''}`;
        break;
      case 'product_update':
        title = `Kurekebisha Taarifa za Bidhaa: ${input.productName || ''}`;
        break;
      case 'manual_discount':
        title = 'Kutoa Punguzo la Bei';
        break;
      case 'permission_change':
        title = 'Kubadilisha Ruhusa za Mfanyakazi';
        break;
      case 'pin_change':
        title = 'Kubadilisha PIN ya Usalama';
        break;
      case 'cash_drawer':
        title = 'Kutoa Pesa Kwenye Droo';
        break;
      default:
        title = 'Mabadiliko Yasiyo ya Kawaida';
    }
  }

  const logData: Omit<AuditLog, 'id'> = {
    type: input.type,
    category,
    title,
    details: input.details,
    cashierId: input.cashierId,
    cashierName: input.cashierName || 'Staff',
    businessId: input.businessId,
    timestamp,
    timeStr, // e.g. "14:35:12"
    dayStr,  // e.g. "Jumanne"
    dateStr, // e.g. "15 Septemba 2026"
    ...(input.productId ? { productId: input.productId } : {}),
    ...(input.productName ? { productName: input.productName } : {}),
    ...(input.originalPrice !== undefined ? { originalPrice: input.originalPrice } : {}),
    ...(input.newPrice !== undefined ? { newPrice: input.newPrice } : {}),
    ...(input.originalCostPrice !== undefined ? { originalCostPrice: input.originalCostPrice } : {}),
    ...(input.newCostPrice !== undefined ? { newCostPrice: input.newCostPrice } : {}),
    ...(input.originalValue !== undefined ? { originalValue: input.originalValue } : {}),
    ...(input.newValue !== undefined ? { newValue: input.newValue } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  };

  try {
    const docRef = await addDoc(collection(db, 'auditLogs'), logData);

    // If it's a void action, also duplicate to voidLogs for backwards compatibility
    if (category === 'void' || input.type === 'void_item' || input.type === 'clear_cart') {
      addDoc(collection(db, 'voidLogs'), {
        productId: input.productId || 'multiple',
        productName: input.productName || title,
        cashierId: input.cashierId,
        businessId: input.businessId,
        timestamp,
        reason: input.details
      }).catch(err => console.warn('voidLogs shadow write error:', err));
    }

    // Optional CEO / High Priority Security Notification
    if (input.notifyCeo || category === 'delete' || category === 'security' || input.type === 'price_change') {
      addDoc(collection(db, 'notifications'), {
        type: 'security',
        title: `Security Log: ${title}`,
        message: `${input.cashierName || 'Mtumiaji'} - ${input.details} (${dayStr} ${dateStr} saa ${timeStr})`,
        businessId: input.businessId,
        timestamp,
        read: false,
        importance: 'high'
      }).catch(err => console.warn('Notification write error:', err));
    }

    return docRef.id;
  } catch (err) {
    console.error('Error recording audit log:', err);
    return null;
  }
}
