import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { AuditLog, VoidLog } from '../types';
import { 
  ShieldAlert, 
  Clock, 
  Calendar,
  User, 
  Package, 
  AlertCircle, 
  History, 
  Trash2, 
  Edit3, 
  DollarSign, 
  Boxes, 
  Lock, 
  Search, 
  Filter, 
  ArrowRight,
  TrendingDown,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseDayDateFromTimestamp } from '../lib/auditLogger';

type FilterCategory = 'all' | 'delete' | 'update' | 'price' | 'stock' | 'security';
type DateFilter = 'all' | 'today' | 'week' | 'month';

export const Logs: React.FC = () => {
  const { activeBusiness } = useAuth();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [voidLogs, setVoidLogs] = useState<VoidLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<FilterCategory>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  // Fetch Audit Logs (Primary collection for all deletions, price changes, stock, permissions)
  useEffect(() => {
    if (!activeBusiness?.id) return;

    setLoading(true);

    const qAudit = query(
      collection(db, 'auditLogs'),
      where('businessId', '==', activeBusiness.id),
      orderBy('timestamp', 'desc'),
      limit(250)
    );

    const unsubAudit = onSnapshot(qAudit, (snapshot) => {
      const logs: AuditLog[] = [];
      snapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() } as AuditLog);
      });
      setAuditLogs(logs);
      setLoading(false);
    }, (err) => {
      console.error("Error loading auditLogs:", err);
      setLoading(false);
    });

    // Also fetch voidLogs to make sure any legacy or cart void records are included
    const qVoid = query(
      collection(db, 'voidLogs'),
      where('businessId', '==', activeBusiness.id),
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    const unsubVoid = onSnapshot(qVoid, (snapshot) => {
      const voids: VoidLog[] = [];
      snapshot.forEach((doc) => {
        voids.push({ id: doc.id, ...doc.data() } as VoidLog);
      });
      setVoidLogs(voids);
    }, (err) => {
      console.error("Error loading voidLogs:", err);
    });

    return () => {
      unsubAudit();
      unsubVoid();
    };
  }, [activeBusiness?.id]);

  // Merge and normalize all logs
  const unifiedLogs = useMemo<AuditLog[]>(() => {
    const list: AuditLog[] = [...auditLogs];

    // Merge voidLogs that don't already exist in auditLogs
    voidLogs.forEach((v) => {
      const alreadyInAudit = list.some(
        a => a.timestamp === v.timestamp && (a.productId === v.productId || a.productName === v.productName)
      );
      if (!alreadyInAudit) {
        list.push({
          id: `void-${v.id}`,
          type: 'void_item',
          category: 'void',
          title: `Kutoa Bidhaa Kapuni: ${v.productName}`,
          productId: v.productId,
          productName: v.productName,
          cashierId: v.cashierId,
          cashierName: 'Cashier',
          businessId: v.businessId,
          timestamp: v.timestamp,
          details: v.reason || 'Bidhaa imeondolewa kwenye kapu la mauzo kabla ya malipo.',
          reason: v.reason
        });
      }
    });

    // Sort descending by timestamp
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [auditLogs, voidLogs]);

  // Filter by category, date, and search
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return unifiedLogs.filter((log) => {
      const logTime = new Date(log.timestamp).getTime();

      // Date filter
      if (dateFilter === 'today' && logTime < todayStart) return false;
      if (dateFilter === 'week' && logTime < weekStart) return false;
      if (dateFilter === 'month' && logTime < monthStart) return false;

      // Category filter
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'delete') {
          const isDel = log.category === 'delete' || log.category === 'void' || log.type.startsWith('delete_') || log.type === 'void_item' || log.type === 'clear_cart' || log.type === 'void';
          if (!isDel) return false;
        } else if (selectedCategory === 'price') {
          const isPrice = log.category === 'price' || log.category === 'discount' || log.type === 'price_change' || log.type === 'cost_price_change' || log.type === 'manual_discount';
          if (!isPrice) return false;
        } else if (selectedCategory === 'stock') {
          const isStock = log.category === 'stock' || log.type === 'stock_update';
          if (!isStock) return false;
        } else if (selectedCategory === 'security') {
          const isSec = log.category === 'security' || log.type === 'permission_change' || log.type === 'pin_change' || log.type === 'cash_drawer';
          if (!isSec) return false;
        } else if (selectedCategory === 'update') {
          const isUp = log.category === 'update' || log.type === 'product_update';
          if (!isUp) return false;
        }
      }

      // Search query filter
      if (searchQuery.trim()) {
        const queryLower = searchQuery.toLowerCase().trim();
        const { day, date, time } = parseDayDateFromTimestamp(log.timestamp);
        const matchText = [
          log.title,
          log.details,
          log.productName,
          log.cashierName,
          log.cashierId,
          log.reason,
          log.dayStr || day,
          log.dateStr || date,
          log.timeStr || time,
          log.type
        ].filter(Boolean).join(' ').toLowerCase();

        if (!matchText.includes(queryLower)) return false;
      }

      return true;
    });
  }, [unifiedLogs, selectedCategory, dateFilter, searchQuery]);

  // Statistics counters
  const stats = useMemo(() => {
    let deletions = 0;
    let modifications = 0;
    let priceChanges = 0;
    let stockAdjustments = 0;

    unifiedLogs.forEach((l) => {
      const isDel = l.category === 'delete' || l.category === 'void' || l.type.startsWith('delete_') || l.type === 'void_item' || l.type === 'clear_cart' || l.type === 'void';
      const isPrice = l.category === 'price' || l.category === 'discount' || l.type === 'price_change' || l.type === 'cost_price_change' || l.type === 'manual_discount';
      const isStock = l.category === 'stock' || l.type === 'stock_update';

      if (isDel) deletions++;
      else if (isPrice) priceChanges++;
      else if (isStock) stockAdjustments++;
      else modifications++;
    });

    return {
      total: unifiedLogs.length,
      deletions,
      modifications,
      priceChanges,
      stockAdjustments
    };
  }, [unifiedLogs]);

  const getCategoryBadge = (log: AuditLog) => {
    const isDel = log.category === 'delete' || log.category === 'void' || log.type.startsWith('delete_') || log.type === 'void_item' || log.type === 'clear_cart' || log.type === 'void';
    const isPrice = log.category === 'price' || log.category === 'discount' || log.type === 'price_change' || log.type === 'cost_price_change' || log.type === 'manual_discount';
    const isStock = log.category === 'stock' || log.type === 'stock_update';
    const isSecurity = log.category === 'security' || log.type === 'permission_change' || log.type === 'pin_change' || log.type === 'cash_drawer';

    if (isDel) {
      return {
        label: 'Kufuta / Void',
        icon: Trash2,
        bg: 'bg-[#FF3B30]/10 text-[#FF3B30] border-[#FF3B30]/20',
        cardBorder: 'border-l-4 border-l-[#FF3B30]'
      };
    }
    if (isPrice) {
      return {
        label: 'Bei & Punguzo',
        icon: DollarSign,
        bg: 'bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/20',
        cardBorder: 'border-l-4 border-l-[#FF9500]'
      };
    }
    if (isStock) {
      return {
        label: 'Marekebisho Stoo',
        icon: Boxes,
        bg: 'bg-[#34C759]/10 text-[#34C759] border-[#34C759]/20',
        cardBorder: 'border-l-4 border-l-[#34C759]'
      };
    }
    if (isSecurity) {
      return {
        label: 'Usalama & PIN',
        icon: Lock,
        bg: 'bg-[#AF52DE]/10 text-[#AF52DE] border-[#AF52DE]/20',
        cardBorder: 'border-l-4 border-l-[#AF52DE]'
      };
    }
    return {
      label: 'Mabadiliko',
      icon: Edit3,
      bg: 'bg-[#007AFF]/10 text-[#007AFF] border-[#007AFF]/20',
      cardBorder: 'border-l-4 border-l-[#007AFF]'
    };
  };

  return (
    <div className="space-y-8 font-sans pb-12 max-w-7xl mx-auto">
      {/* Header Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF3B30] to-[#FF9500] text-white flex items-center justify-center shadow-lg shadow-[#FF3B30]/20">
              <ShieldAlert size={26} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-black tracking-tight flex items-center gap-2">
                Valid Audit Logs
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-black/5 text-gray-700">
                  Ufuatiliaji wa Usalama
                </span>
              </h1>
              <p className="text-gray-600 text-sm font-medium mt-0.5">
                Rekodi zote za matukio yasiyo ya kawaida: Kufuta, Kubadilisha bei, Punguzo, Stoo na Ruhusa
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-5 border border-black/[0.06] shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-black/5 flex items-center justify-center text-black shrink-0">
            <History size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Jumla ya Matukio</p>
            <p className="text-2xl font-black text-black">{stats.total}</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-[#FF3B30]/15 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#FF3B30]/10 flex items-center justify-center text-[#FF3B30] shrink-0">
            <Trash2 size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-[#FF3B30] uppercase tracking-wider">Yaliyofutwa (Deletions)</p>
            <p className="text-2xl font-black text-[#FF3B30]">{stats.deletions}</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-[#FF9500]/15 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#FF9500]/10 flex items-center justify-center text-[#FF9500] shrink-0">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-[#FF9500] uppercase tracking-wider">Bei & Punguzo</p>
            <p className="text-2xl font-black text-[#FF9500]">{stats.priceChanges}</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-[#007AFF]/15 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#007AFF]/10 flex items-center justify-center text-[#007AFF] shrink-0">
            <Edit3 size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-[#007AFF] uppercase tracking-wider">Mabadiliko / Stoo</p>
            <p className="text-2xl font-black text-[#007AFF]">{stats.modifications + stats.stockAdjustments}</p>
          </div>
        </div>
      </div>

      {/* Control Bar: Search & Filters */}
      <div className="bg-white rounded-3xl p-5 border border-black/[0.06] shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Search Input */}
          <div className="relative w-full md:w-96">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tafuta kwa bidhaa, jina la cashier, siku au maelezo..."
              className="w-full pl-11 pr-4 py-3 bg-[#F2F2F7] rounded-2xl text-sm font-medium text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#007AFF] border border-transparent transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 hover:text-black bg-gray-200 px-2 py-0.5 rounded-full"
              >
                ✕
              </button>
            )}
          </div>

          {/* Date Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-[#F2F2F7] rounded-2xl self-stretch md:self-auto overflow-x-auto">
            {(['all', 'today', 'week', 'month'] as DateFilter[]).map((d) => (
              <button
                key={d}
                onClick={() => setDateFilter(d)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  dateFilter === d 
                    ? 'bg-white text-black shadow-sm' 
                    : 'text-gray-500 hover:text-black'
                }`}
              >
                {d === 'all' && 'Zote'}
                {d === 'today' && 'Leo'}
                {d === 'week' && 'Wiki Hii'}
                {d === 'month' && 'Mwezi Huu'}
              </button>
            ))}
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 border-t border-black/[0.04] pt-3 scrollbar-none">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-black text-white shadow-sm'
                : 'bg-[#F2F2F7] text-gray-600 hover:text-black'
            }`}
          >
            <History size={14} />
            <span>Matukio Yote ({unifiedLogs.length})</span>
          </button>

          <button
            onClick={() => setSelectedCategory('delete')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
              selectedCategory === 'delete'
                ? 'bg-[#FF3B30] text-white shadow-sm shadow-[#FF3B30]/30'
                : 'bg-[#FF3B30]/10 text-[#FF3B30] hover:bg-[#FF3B30]/20'
            }`}
          >
            <Trash2 size={14} />
            <span>🗑️ Yaliyofutwa / Voids ({stats.deletions})</span>
          </button>

          <button
            onClick={() => setSelectedCategory('price')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
              selectedCategory === 'price'
                ? 'bg-[#FF9500] text-white shadow-sm shadow-[#FF9500]/30'
                : 'bg-[#FF9500]/10 text-[#FF9500] hover:bg-[#FF9500]/20'
            }`}
          >
            <DollarSign size={14} />
            <span>💰 Bei & Punguzo ({stats.priceChanges})</span>
          </button>

          <button
            onClick={() => setSelectedCategory('stock')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
              selectedCategory === 'stock'
                ? 'bg-[#34C759] text-white shadow-sm shadow-[#34C759]/30'
                : 'bg-[#34C759]/10 text-[#34C759] hover:bg-[#34C759]/20'
            }`}
          >
            <Boxes size={14} />
            <span>📦 Stoo & Marekebisho ({stats.stockAdjustments})</span>
          </button>

          <button
            onClick={() => setSelectedCategory('update')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
              selectedCategory === 'update'
                ? 'bg-[#007AFF] text-white shadow-sm shadow-[#007AFF]/30'
                : 'bg-[#007AFF]/10 text-[#007AFF] hover:bg-[#007AFF]/20'
            }`}
          >
            <Edit3 size={14} />
            <span>✏️ Mabadiliko ya Bidhaa ({stats.modifications})</span>
          </button>

          <button
            onClick={() => setSelectedCategory('security')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
              selectedCategory === 'security'
                ? 'bg-[#AF52DE] text-white shadow-sm shadow-[#AF52DE]/30'
                : 'bg-[#AF52DE]/10 text-[#AF52DE] hover:bg-[#AF52DE]/20'
            }`}
          >
            <Lock size={14} />
            <span>🔒 Ruhusa & PIN</span>
          </button>
        </div>
      </div>

      {/* Logs List Container */}
      <div className="bg-white rounded-3xl border border-black/[0.06] shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Inapakia kumbukumbu za logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-24 px-6 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-[#F2F2F7] rounded-3xl flex items-center justify-center text-gray-400 mb-4">
              <CheckCircle2 size={40} className="text-[#34C759]" />
            </div>
            <h3 className="text-xl font-black text-black">Hakuna matukio yaliyopatikana</h3>
            <p className="text-gray-500 font-medium text-sm mt-1 max-w-md">
              {searchQuery 
                ? 'Hakuna log inayolingana na maneno uliyotafuta. Jaribu kurekebisha neno la utafutaji.'
                : 'Mfumo haujarekodi tukio lolote lisilo la kawaida katika kipindi hiki.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.05]">
            {filteredLogs.map((log, index) => {
              const { day, date, time } = parseDayDateFromTimestamp(log.timestamp);
              const dayDisplay = log.dayStr || day;
              const dateDisplay = log.dateStr || date;
              const timeDisplay = log.timeStr || time;
              const badge = getCategoryBadge(log);
              const BadgeIcon = badge.icon;

              return (
                <motion.div
                  key={log.id || index}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.3) }}
                  className={`p-6 hover:bg-[#F2F2F7]/50 transition-all group ${badge.cardBorder}`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    {/* Left Column: Event info & description */}
                    <div className="flex-1 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${badge.bg}`}>
                          <BadgeIcon size={13} />
                          <span>{badge.label}</span>
                        </span>

                        <h3 className="text-base font-black text-black tracking-tight">
                          {log.title || log.productName || 'Mabadiliko Yasiyo ya Kawaida'}
                        </h3>
                      </div>

                      <p className="text-sm font-medium text-gray-700 leading-relaxed">
                        {log.details}
                      </p>

                      {/* Price diff pills if price changed */}
                      {log.originalPrice !== undefined && log.newPrice !== undefined && (
                        <div className="inline-flex items-center gap-2 bg-[#F2F2F7] px-3.5 py-1.5 rounded-xl text-xs font-bold text-black border border-black/[0.04]">
                          <span className="text-gray-500 line-through">Tsh {log.originalPrice.toLocaleString()}</span>
                          <ArrowRight size={14} className="text-[#FF9500]" />
                          <span className="text-[#FF9500] font-black">Tsh {log.newPrice.toLocaleString()}</span>
                        </div>
                      )}

                      {/* Cost price diff pills */}
                      {log.originalCostPrice !== undefined && log.newCostPrice !== undefined && (
                        <div className="inline-flex items-center gap-2 bg-[#F2F2F7] px-3.5 py-1.5 rounded-xl text-xs font-bold text-black border border-black/[0.04]">
                          <span className="text-gray-500">Gharama: </span>
                          <span className="text-gray-500 line-through">Tsh {log.originalCostPrice.toLocaleString()}</span>
                          <ArrowRight size={14} className="text-[#007AFF]" />
                          <span className="text-[#007AFF] font-black">Tsh {log.newCostPrice.toLocaleString()}</span>
                        </div>
                      )}

                      {/* Reason note if present */}
                      {log.reason && (
                        <div className="flex items-start gap-2 bg-[#F2F2F7]/80 p-3 rounded-2xl border border-black/[0.03] text-xs text-gray-600 font-medium max-w-xl">
                          <AlertCircle size={14} className="text-gray-400 mt-0.5 shrink-0" />
                          <span>Sababu: "{log.reason}"</span>
                        </div>
                      )}
                    </div>

                    {/* Right Column: Exact Time (Saa), Day (Siku), Date (Tarehe), Cashier (Aliyefanya) */}
                    <div className="flex flex-wrap lg:flex-nowrap items-center gap-3 shrink-0 self-start lg:self-center">
                      {/* Saa (Time) Pill */}
                      <div className="flex items-center gap-2 px-3.5 py-2 bg-[#F2F2F7] group-hover:bg-white rounded-2xl border border-black/[0.04] transition-all" title="Saa iliyofanyika">
                        <Clock size={16} className="text-[#007AFF] shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight">Saa</p>
                          <p className="text-xs font-black text-black leading-tight">{timeDisplay}</p>
                        </div>
                      </div>

                      {/* Siku (Day) Pill */}
                      <div className="flex items-center gap-2 px-3.5 py-2 bg-[#F2F2F7] group-hover:bg-white rounded-2xl border border-black/[0.04] transition-all" title="Siku ya wiki">
                        <Calendar size={16} className="text-[#FF9500] shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight">Siku</p>
                          <p className="text-xs font-black text-black leading-tight">{dayDisplay}</p>
                        </div>
                      </div>

                      {/* Tarehe (Date) Pill */}
                      <div className="flex items-center gap-2 px-3.5 py-2 bg-[#F2F2F7] group-hover:bg-white rounded-2xl border border-black/[0.04] transition-all" title="Tarehe">
                        <Calendar size={16} className="text-[#34C759] shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight">Tarehe</p>
                          <p className="text-xs font-black text-black leading-tight">{dateDisplay}</p>
                        </div>
                      </div>

                      {/* Aliyefanya (Cashier / User) Pill */}
                      <div className="flex items-center gap-2 px-3.5 py-2 bg-[#F2F2F7] group-hover:bg-white rounded-2xl border border-black/[0.04] transition-all" title="Mtumiaji aliyefanya tendo hili">
                        <User size={16} className="text-gray-500 shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight">Aliyefanya</p>
                          <p className="text-xs font-black text-black leading-tight">
                            {log.cashierName || log.cashierId?.slice(0, 8) || 'Staff'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
