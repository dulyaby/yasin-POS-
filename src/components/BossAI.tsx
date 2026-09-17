import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Sale, Expense, Product, VoidLog, AuditLog, StockAdjustment } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle, 
  Bell, 
  Zap, 
  BarChart3, 
  ShieldCheck, 
  Clock, 
  Package, 
  DollarSign, 
  Users,
  ShieldAlert,
  CheckCircle2,
  Info,
  Plus,
  RefreshCw,
  Printer,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  FileText,
  Wallet,
  Calendar
} from 'lucide-react';
import { format, startOfDay, isAfter, subDays, parseISO } from 'date-fns';
import confetti from 'canvas-confetti';
import ReactMarkdown from 'react-markdown';
import { generateTextViaProxy } from '../services/ai/geminiClient';
import { useAI } from '../context/AIContext';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';

interface PartnerMessage {
  id: string;
  type: 'alert' | 'success' | 'info' | 'motivation' | 'report';
  title: string;
  body: string;
  timestamp: Date;
  icon: any;
  color: string;
}

export const BossAI: React.FC = () => {
  const { activeBusiness, profile } = useAuth();
  const { language, t } = useLanguage();
  const { startTask, endTask, isTyping } = useAI();
  
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashHistory, setCashHistory] = useState<any[]>([]);
  const [stockAdjustments, setStockAdjustments] = useState<StockAdjustment[]>([]);
  const [voidLogs, setVoidLogs] = useState<VoidLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [messages, setMessages] = useState<PartnerMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingStaff, setIsGeneratingStaff] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [activeTab, setActiveTab] = useState<'briefing' | 'analytics' | 'staff' | 'stock'>('briefing');
  const [briefingReport, setBriefingReport] = useState<string | null>(null);
  const [lastBriefingTime, setLastBriefingTime] = useState<Date | null>(null);
  
  const lastProcessedVoidId = useRef<string | null>(null);
  const lastProcessedAuditId = useRef<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const hasAutoTriggeredBriefing = useRef(false);

  // Check if already installed
  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
      setIsStandalone(!!isStandaloneMode);
    };
    checkStandalone();
    
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // Dynamic Greeting based on time & language
  useEffect(() => {
    const hour = new Date().getHours();
    if (language === 'sw') {
      if (hour < 12) setGreeting('Habari ya asubuhi Bosi, muhtasari wako wa leo uko tayari.');
      else if (hour < 17) setGreeting('Habari ya mchana Bosi, biashara inaendelea vizuri.');
      else setGreeting('Habari ya jioni Bosi, huu hapa muhtasari wa kiutendaji wa leo.');
    } else {
      if (hour < 12) setGreeting('Good morning Boss, your operational briefing is ready.');
      else if (hour < 17) setGreeting('Good afternoon Boss, business operations are progressing well.');
      else setGreeting('Good evening Boss, here is today\'s executive briefing.');
    }
  }, [language]);

  // Fetch Firestore Data in Real-time
  useEffect(() => {
    if (!activeBusiness?.id) return;

    const today = startOfDay(new Date());
    const yesterday = startOfDay(subDays(new Date(), 1));

    const salesQ = query(
      collection(db, 'sales'),
      where('businessId', '==', activeBusiness.id),
      where('timestamp', '>=', yesterday.toISOString()),
      orderBy('timestamp', 'desc')
    );

    const productsQ = query(
      collection(db, 'products'),
      where('businessId', '==', activeBusiness.id)
    );

    const voidsQ = query(
      collection(db, 'voidLogs'),
      where('businessId', '==', activeBusiness.id),
      where('timestamp', '>=', today.toISOString()),
      orderBy('timestamp', 'desc')
    );

    const auditQ = query(
      collection(db, 'auditLogs'),
      where('businessId', '==', activeBusiness.id),
      where('timestamp', '>=', today.toISOString()),
      orderBy('timestamp', 'desc')
    );

    const expensesQ = query(
      collection(db, 'expenses'),
      where('businessId', '==', activeBusiness.id),
      where('timestamp', '>=', today.toISOString()),
      orderBy('timestamp', 'desc')
    );

    const cashHistoryQ = query(
      collection(db, 'cash_history'),
      where('businessId', '==', activeBusiness.id),
      where('timestamp', '>=', today.toISOString()),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const stockAdjustmentsQ = query(
      collection(db, 'stockAdjustments'),
      where('businessId', '==', activeBusiness.id),
      where('timestamp', '>=', today.toISOString()),
      orderBy('timestamp', 'desc')
    );

    const unsubSales = onSnapshot(salesQ, (snap) => {
      const s: Sale[] = [];
      snap.forEach(doc => s.push({ id: doc.id, ...doc.data() } as Sale));
      setSales(s);
    }, (error) => console.error("Sales Error:", error));

    const unsubExpenses = onSnapshot(expensesQ, (snap) => {
      const e: Expense[] = [];
      snap.forEach(doc => e.push({ id: doc.id, ...doc.data() } as Expense));
      setExpenses(e);
    }, (error) => console.error("Expenses Error:", error));

    const unsubCashHistory = onSnapshot(cashHistoryQ, (snap) => {
      const ch: any[] = [];
      snap.forEach(doc => ch.push({ id: doc.id, ...doc.data() }));
      setCashHistory(ch);
    }, (error) => console.error("Cash History Error:", error));

    const unsubStockAdjustments = onSnapshot(stockAdjustmentsQ, (snap) => {
      const sa: StockAdjustment[] = [];
      snap.forEach(doc => sa.push({ id: doc.id, ...doc.data() } as StockAdjustment));
      setStockAdjustments(sa);
    }, (error) => console.error("Stock Adjustments Error:", error));

    const unsubProducts = onSnapshot(productsQ, (snap) => {
      const p: Product[] = [];
      snap.forEach(doc => p.push({ id: doc.id, ...doc.data() } as Product));
      setProducts(p);
    }, (error) => console.error("Products Error:", error));

    const unsubVoids = onSnapshot(voidsQ, (snap) => {
      const v: VoidLog[] = [];
      snap.forEach(doc => v.push({ id: doc.id, ...doc.data() } as VoidLog));
      setVoidLogs(v);
    }, (error) => console.error("Voids Error:", error));

    const unsubAudit = onSnapshot(auditQ, (snap) => {
      const a: AuditLog[] = [];
      snap.forEach(doc => a.push({ id: doc.id, ...doc.data() } as AuditLog));
      setAuditLogs(a);
    }, (error) => console.error("Audit Error:", error));

    return () => {
      unsubSales();
      unsubProducts();
      unsubExpenses();
      unsubCashHistory();
      unsubStockAdjustments();
      unsubVoids();
      unsubAudit();
    };
  }, [activeBusiness?.id]);

  // Real-Time Calculated Metrics for the Partner Dashboard
  const metrics = useMemo(() => {
    const todayStart = startOfDay(new Date());
    const yesterdayStart = startOfDay(subDays(new Date(), 1));

    const todaySales = sales.filter(s => {
      try {
        return parseISO(s.timestamp) >= todayStart;
      } catch (e) {
        return false;
      }
    });

    const yesterdaySales = sales.filter(s => {
      try {
        const t = parseISO(s.timestamp);
        return t >= yesterdayStart && t < todayStart;
      } catch (e) {
        return false;
      }
    });

    const todayExpenses = expenses.filter(e => {
      try {
        return parseISO(e.timestamp) >= todayStart;
      } catch (e) {
        return false;
      }
    });

    // Total Revenue
    const totalRevenue = todaySales.reduce((sum, s) => sum + (s.netTotal || s.total || 0), 0);
    const yesterdayRevenue = yesterdaySales.reduce((sum, s) => sum + (s.netTotal || s.total || 0), 0);
    
    // Revenue Growth % vs Yesterday
    let revenueGrowth = 0;
    if (yesterdayRevenue > 0) {
      revenueGrowth = ((totalRevenue - yesterdayRevenue) / yesterdayRevenue) * 100;
    } else if (totalRevenue > 0) {
      revenueGrowth = 100;
    }

    // COGS
    let totalCOGS = 0;
    todaySales.forEach(sale => {
      if (sale.items) {
        sale.items.forEach(item => {
          const product = products.find(p => p.id === item.productId);
          const cost = product?.costPrice || 0;
          totalCOGS += (cost * (item.quantity || 1));
        });
      }
    });

    // Gross Profit
    const grossProfit = totalRevenue - totalCOGS;
    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // Expenses
    const totalExpensesAmount = todayExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // Stock Waste / Shrinkage
    let totalWasteValue = 0;
    stockAdjustments.forEach(adj => {
      if (adj.difference < 0) {
        const product = products.find(p => p.id === adj.productId);
        const cost = product?.costPrice || 0;
        totalWasteValue += (Math.abs(adj.difference) * cost);
      }
    });

    // Real Net Profit
    const realProfit = grossProfit - (totalExpensesAmount + totalWasteValue);
    const netMargin = totalRevenue > 0 ? (realProfit / totalRevenue) * 100 : 0;

    // Cash Reconciliation
    const latestCash = cashHistory[0];
    const cashVariance = latestCash ? latestCash.difference : null;
    const auditStatus = cashVariance === null ? 'PENDING' : (cashVariance === 0 ? 'CLEAN' : 'DISCREPANCY');

    // Stock Health
    const inventoryValue = products.reduce((sum, p) => sum + ((p.price || 0) * (p.stock || 0)), 0);
    const lowStockItems = products.filter(p => (p.stock || 0) <= (p.lowStockThreshold || 5));
    const outOfStockItems = products.filter(p => (p.stock || 0) <= 0);

    // Staff / Transactions
    const transactionCount = todaySales.length;
    const averageBasket = transactionCount > 0 ? totalRevenue / transactionCount : 0;
    const activeStaff = Array.from(new Set(todaySales.map(s => (s as any).cashierName || s.cashierId || 'Cashier')));

    return {
      totalRevenue,
      yesterdayRevenue,
      revenueGrowth,
      totalCOGS,
      grossProfit,
      grossMargin,
      totalExpensesAmount,
      totalWasteValue,
      realProfit,
      netMargin,
      cashVariance,
      auditStatus,
      inventoryValue,
      lowStockItems,
      outOfStockItems,
      transactionCount,
      averageBasket,
      activeStaff,
      todaySales
    };
  }, [sales, products, expenses, stockAdjustments, cashHistory]);

  // Hourly Chart Data for Today
  const hourlySalesData = useMemo(() => {
    const hoursMap: { [key: string]: { hour: string; sales: number; profit: number } } = {};
    for (let h = 8; h <= 21; h += 2) {
      const key = `${h.toString().padStart(2, '0')}:00`;
      hoursMap[key] = { hour: key, sales: 0, profit: 0 };
    }

    metrics.todaySales.forEach(s => {
      try {
        const date = parseISO(s.timestamp);
        const h = date.getHours();
        const bucket = `${(Math.floor(h / 2) * 2).toString().padStart(2, '0')}:00`;
        if (hoursMap[bucket]) {
          hoursMap[bucket].sales += (s.netTotal || s.total || 0);
          // Estimated rough gross profit
          hoursMap[bucket].profit += ((s.netTotal || s.total || 0) * 0.3);
        }
      } catch (e) {
        // ignore
      }
    });

    return Object.values(hoursMap);
  }, [metrics.todaySales]);

  // Financial Breakdown Bars Data
  const breakdownData = useMemo(() => {
    return [
      { name: language === 'sw' ? 'Mauzo' : 'Revenue', amount: metrics.totalRevenue, fill: '#007AFF' },
      { name: language === 'sw' ? 'Gharama za Bidhaa' : 'COGS', amount: metrics.totalCOGS, fill: '#8E8E93' },
      { name: language === 'sw' ? 'Matumizi & Hasara' : 'Expenses & Loss', amount: metrics.totalExpensesAmount + metrics.totalWasteValue, fill: '#FF9500' },
      { name: language === 'sw' ? 'Faida Halisi' : 'Net Profit', amount: Math.max(0, metrics.realProfit), fill: '#34C759' }
    ];
  }, [metrics, language]);

  // Watchdog Intelligence Feed
  useEffect(() => {
    if (sales.length === 0 && voidLogs.length === 0) return;

    const newMessages: PartnerMessage[] = [];

    // 1. Void Alert
    const latestVoid = voidLogs[0];
    if (latestVoid && latestVoid.id !== lastProcessedVoidId.current) {
      lastProcessedVoidId.current = latestVoid.id;
      newMessages.push({
        id: `void-${latestVoid.id}`,
        type: 'alert',
        title: language === 'sw' ? 'Tahadhari ya Kufuta Bidhaa (Void)' : 'Instant Void Alert',
        body: language === 'sw' 
          ? `Keshia ${(latestVoid as any).cashierName || latestVoid.cashierId || ''} amefuta ${latestVoid.productName} kwenye kapu. Sababu: "${latestVoid.reason}"`
          : `Cashier ${(latestVoid as any).cashierName || latestVoid.cashierId || ''} voided ${latestVoid.productName}. Reason: "${latestVoid.reason}"`,
        timestamp: new Date(latestVoid.timestamp),
        icon: ShieldAlert,
        color: 'text-[#FF3B30]'
      });
      triggerVibration('heavy');
    }

    // 2. Milestone Cheers
    const totalSales = metrics.totalRevenue;
    if (totalSales > 0 && totalSales % 100000 < 5000 && sales.length > 0) {
      const milestone = Math.floor(totalSales / 100000) * 100000;
      if (milestone > 0) {
        newMessages.push({
          id: `milestone-${milestone}`,
          type: 'success',
          title: language === 'sw' ? 'Hongera Bosi! 🎉' : 'Milestone Achieved! 🎉',
          body: language === 'sw'
            ? `Tumefikisha mauzo ya Tsh ${milestone.toLocaleString()}! Biashara inakwenda vizuri sana leo.`
            : `Crossed revenue of Tsh ${milestone.toLocaleString()}! Excellent business performance.`,
          timestamp: new Date(),
          icon: Zap,
          color: 'text-[#34C759]'
        });
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#007AFF', '#5856D6', '#34C759']
        });
      }
    }

    // 3. Price Change Alert
    const latestAudit = auditLogs[0];
    if (latestAudit && latestAudit.id !== lastProcessedAuditId.current) {
      lastProcessedAuditId.current = latestAudit.id;
      if (latestAudit.type === 'price_change') {
        newMessages.push({
          id: `audit-${latestAudit.id}`,
          type: 'alert',
          title: language === 'sw' ? 'Tahadhari: Mabadiliko ya Bei' : 'Security Alert: Price Override',
          body: language === 'sw'
            ? `Keshia amebadilisha bei ya ${latestAudit.productName} kutoka Tsh ${latestAudit.originalPrice?.toLocaleString()} hadi Tsh ${latestAudit.newPrice?.toLocaleString()}.`
            : `Price override recorded for ${latestAudit.productName} from Tsh ${latestAudit.originalPrice?.toLocaleString()} to Tsh ${latestAudit.newPrice?.toLocaleString()}.`,
          timestamp: new Date(latestAudit.timestamp),
          icon: ShieldAlert,
          color: 'text-[#FF3B30]'
        });
        triggerVibration('heavy');
      }
    }

    if (newMessages.length > 0) {
      setMessages(prev => [...newMessages, ...prev].slice(0, 25));
    }
  }, [sales, voidLogs, auditLogs, metrics.totalRevenue, language]);

  // CRITICAL USER INTENT:
  // "pale mtu akiingia kwenye tab ya patner tab yenyew inaonesha briefing summary"
  // Automatically trigger briefing on entry if not yet generated!
  useEffect(() => {
    if (!hasAutoTriggeredBriefing.current && activeBusiness?.id && !isGenerating && !isTyping) {
      hasAutoTriggeredBriefing.current = true;
      // Slight delay to ensure Firestore data subscription has initialized
      const timer = setTimeout(() => {
        generateBriefingSummary();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [activeBusiness?.id]);

  const triggerVibration = (type: 'heavy' | 'smooth') => {
    if ('vibrate' in navigator) {
      if (type === 'heavy') {
        navigator.vibrate([200, 100, 200]);
      } else {
        navigator.vibrate(250);
      }
    }
  };

  const generateBriefingSummary = async () => {
    setIsGenerating(true);
    const taskId = startTask('report', 'Generating Executive Briefing');
    try {
      const promptLanguage = language === 'sw' ? 'Swahili' : 'English';
      const prompt = `
        System Role: You are "Partner", an elite Senior Forensic Accountant, Operations Director, and Business Strategist.
        You are the business owner's confidential partner inside the store.
        Language: Respond strictly in ${promptLanguage}.

        STYLE: Clean, professional, bold, decisive. NO robotic filler.
        
        STORE METRICS:
        - Store Name: ${activeBusiness?.name || 'PartnerPOS Store'}
        - Total Revenue Today: Tsh ${metrics.totalRevenue.toLocaleString()}
        - Transactions: ${metrics.transactionCount}
        - Cost of Goods Sold (COGS): Tsh ${metrics.totalCOGS.toLocaleString()}
        - Gross Profit: Tsh ${metrics.grossProfit.toLocaleString()} (${metrics.grossMargin.toFixed(1)}% margin)
        - Operating Expenses: Tsh ${metrics.totalExpensesAmount.toLocaleString()}
        - Shrinkage / Damaged Stock Loss: Tsh ${metrics.totalWasteValue.toLocaleString()}
        - Real Net Profit (Actual Take-Home): Tsh ${metrics.realProfit.toLocaleString()} (${metrics.netMargin.toFixed(1)}% margin)
        - Drawer Status: ${metrics.auditStatus} (Variance: ${metrics.cashVariance !== null ? `Tsh ${metrics.cashVariance.toLocaleString()}` : 'No variance'})
        - Critical Stock Alerts: ${metrics.lowStockItems.map(p => `${p.name} (${p.stock} left)`).join(', ') || 'Healthy'}
        - Voids Recorded: ${voidLogs.length}
        - Price Overrides: ${auditLogs.filter(a => a.type === 'price_change').length}

        OUTPUT STRUCTURE (MANDATORY IN MARKDOWN):
        ### EXECUTIVE BRIEFING SUMMARY
        (Provide an immediate 2-sentence executive summary verdict on whether today's revenue is translating to real profit or if expenses/cogs/voids are dragging margins down).

        ### FINANCIAL PULSE & REAL PROFIT
        - **Total Revenue**: Tsh ${metrics.totalRevenue.toLocaleString()} across ${metrics.transactionCount} transactions.
        - **COGS**: Tsh ${metrics.totalCOGS.toLocaleString()}
        - **Gross Profit**: Tsh ${metrics.grossProfit.toLocaleString()} (${metrics.grossMargin.toFixed(1)}%)
        - **Operating Expenses**: Tsh ${metrics.totalExpensesAmount.toLocaleString()}
        - **Shrinkage/Damage**: Tsh ${metrics.totalWasteValue.toLocaleString()}
        - **Real Net Profit**: **Tsh ${metrics.realProfit.toLocaleString()}** (${metrics.netMargin.toFixed(1)}%)

        ### CASH RECONCILIATION & AUDIT
        - Drawer Status: **${metrics.auditStatus}**
        ${metrics.cashVariance && metrics.cashVariance !== 0 ? `- ALERT: Variance of Tsh ${Math.abs(metrics.cashVariance).toLocaleString()} detected in cashier drawer.` : '- Drawer matches recorded sales.'}

        ### STOCK HEALTH & CRITICAL RISKS
        - Low stock items that need urgent replenishment: ${metrics.lowStockItems.slice(0, 5).map(p => p.name).join(', ') || 'No critical shortages.'}

        ### STRATEGIC VERDICT FROM PARTNER
        - Start directly with "${language === 'sw' ? 'Bosi' : 'Boss'}, ..." 
        - Provide 2 concrete, actionable recommendations for maximizing profit and eliminating revenue leaks today.
      `;

      const text = await generateTextViaProxy(prompt);
      setBriefingReport(text);
      setLastBriefingTime(new Date());

      const msg: PartnerMessage = {
        id: `brief-${Date.now()}`,
        type: 'report',
        title: language === 'sw' ? 'MUHTASARI WA KIUTENDAJI' : 'EXECUTIVE BRIEFING SUMMARY',
        body: text,
        timestamp: new Date(),
        icon: Sparkles,
        color: 'text-[#007AFF]'
      };

      setMessages(prev => [msg, ...prev]);
      triggerVibration('smooth');
      endTask(taskId, 'completed');
    } catch (error) {
      console.error("Briefing summary generation failed:", error);
      endTask(taskId, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateStaffActivityBrief = async () => {
    setIsGeneratingStaff(true);
    const taskId = startTask('report', 'Auditing Staff Activity');
    try {
      const totalVoids = voidLogs.length;
      const priceOverrides = auditLogs.filter(a => a.type === 'price_change');
      const permChanges = auditLogs.filter(a => a.type === 'permission_change');
      const promptLanguage = language === 'sw' ? 'Swahili' : 'English';

      const prompt = `
        System Role: You are "Partner", Chief Operating Auditor.
        Language: Respond strictly in ${promptLanguage}.

        CONTEXT:
        - Active Cashiers: ${metrics.activeStaff.join(', ') || 'N/A'}
        - Total Voids Today: ${totalVoids}
        - Price Overrides: ${priceOverrides.length}
        - Permissions Modified: ${permChanges.length}
        - Recent Voids: ${JSON.stringify(voidLogs.slice(0, 8))}
        - Recent Price Changes: ${JSON.stringify(priceOverrides.slice(0, 5))}

        Provide a sharp, professional staff integrity brief. Highlight if any suspicious patterns exist or if team discipline is solid. End with a verdict addressed to "Bosi" / "Boss".
      `;

      const text = await generateTextViaProxy(prompt);
      const msg: PartnerMessage = {
        id: `staff-${Date.now()}`,
        type: 'report',
        title: language === 'sw' ? 'UKAGUZI WA WAFANYAKAZI' : 'STAFF ACTIVITY AUDIT',
        body: text,
        timestamp: new Date(),
        icon: Users,
        color: 'text-[#5856D6]'
      };

      setMessages(prev => [msg, ...prev]);
      triggerVibration('smooth');
      endTask(taskId, 'completed');
    } catch (error) {
      console.error("Staff brief failed:", error);
      endTask(taskId, 'error');
    } finally {
      setIsGeneratingStaff(false);
    }
  };

  // Determine Overall Business Health Status Badge
  const healthStatus = useMemo(() => {
    if (metrics.realProfit > 50000 && metrics.netMargin > 20) {
      return {
        label: language === 'sw' ? 'Faida Nzuri Sana' : 'Highly Profitable',
        color: 'text-[#34C759]',
        bg: 'bg-[#34C759]/10',
        border: 'border-[#34C759]/20'
      };
    } else if (metrics.realProfit > 0) {
      return {
        label: language === 'sw' ? 'Inazalisha Faida' : 'Profitable',
        color: 'text-[#007AFF]',
        bg: 'bg-[#007AFF]/10',
        border: 'border-[#007AFF]/20'
      };
    } else if (metrics.totalRevenue === 0) {
      return {
        label: language === 'sw' ? 'Inasubiri Mauzo' : 'Ready for Sales',
        color: 'text-[#8E8E93]',
        bg: 'bg-black/[0.05]',
        border: 'border-black/[0.08]'
      };
    } else {
      return {
        label: language === 'sw' ? 'Uangalizi Unahitajika' : 'Attention Needed',
        color: 'text-[#FF3B30]',
        bg: 'bg-[#FF3B30]/10',
        border: 'border-[#FF3B30]/20'
      };
    }
  }, [metrics, language]);

  return (
    <div className="w-full max-w-6xl mx-auto font-sans pb-32 pt-2 px-4 sm:px-6">
      
      {/* PWA Install Prompt for Android */}
      {!isStandalone && deferredPrompt && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-gradient-to-r from-[#007AFF] to-[#5856D6] rounded-2xl text-white flex items-center justify-between shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Plus size={20} />
            </div>
            <div>
              <p className="text-sm font-black">{language === 'sw' ? 'Weka Partner kwenye Skrini' : 'Install Partner App'}</p>
              <p className="text-xs opacity-90">{language === 'sw' ? 'Pata alerts za papo hapo na muhtasari wa mauzo' : 'Get instant alerts and executive briefings'}</p>
            </div>
          </div>
          <button
            onClick={handleInstallClick}
            className="px-4 py-2 bg-white text-[#007AFF] font-black text-xs uppercase tracking-wider rounded-xl shadow active:scale-95 transition-all"
          >
            Install
          </button>
        </motion.div>
      )}

      {/* TOP HEADER: Partner Identity & Quick Actions */}
      <motion.header 
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6"
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-black rounded-[20px] flex items-center justify-center shadow-xl shadow-black/15 border border-white/10 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#007AFF]/30 to-transparent opacity-70" />
            <Sparkles className="text-white relative z-10 group-hover:scale-110 transition-transform" size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl sm:text-3xl font-black text-black tracking-tight leading-none">
                Partner
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-[#007AFF]/10 text-[#007AFF] border border-[#007AFF]/20">
                AI Senior Partner
              </span>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 font-medium mt-1">{greeting}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={generateBriefingSummary}
            disabled={isGenerating || isTyping}
            className="apple-button-primary !py-2.5 !px-4 flex items-center gap-2 text-xs font-black uppercase tracking-wider"
          >
            <RefreshCw size={14} className={isGenerating ? "animate-spin" : ""} />
            <span>{isGenerating ? (language === 'sw' ? 'Inaandaa...' : 'Preparing...') : (language === 'sw' ? 'Sasisha Muhtasari' : 'Refresh Briefing')}</span>
          </button>

          <button
            onClick={generateStaffActivityBrief}
            disabled={isGeneratingStaff || isTyping}
            className="apple-button-secondary !py-2.5 !px-4 flex items-center gap-2 text-xs font-black text-gray-700 hover:text-black uppercase tracking-wider"
          >
            <Users size={14} />
            <span>{isGeneratingStaff ? (language === 'sw' ? 'Inakagua...' : 'Auditing...') : (language === 'sw' ? 'Wafanyakazi' : 'Staff Brief')}</span>
          </button>

          <button
            onClick={() => window.print()}
            className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-600 hover:text-black hover:bg-gray-50 transition-colors shadow-sm"
            title={language === 'sw' ? 'Chapisha Ripoti' : 'Print Report'}
          >
            <Printer size={16} />
          </button>
        </div>
      </motion.header>

      {/* EXECUTIVE BRIEFING DASHBOARD HERO CARD */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="apple-card p-6 md:p-8 bg-gradient-to-br from-white via-white to-blue-50/30 border border-[#007AFF]/15 shadow-xl shadow-blue-500/5 mb-8 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#007AFF]/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-black/[0.06]">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#007AFF] flex items-center gap-1.5">
                <FileText size={13} />
                {t('partner_briefing_summary', 'Muhtasari wa Kiutendaji (Briefing Summary)')}
              </span>
              <span className="text-gray-300">•</span>
              <span className="text-[10px] font-bold text-gray-400">
                {lastBriefingTime ? format(lastBriefingTime, 'HH:mm:ss') : format(new Date(), 'dd/MM/yyyy')}
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-[#1D1D1F] tracking-tight">
              {activeBusiness?.name || 'Store'} Briefing Dashboard
            </h3>
          </div>

          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-black tracking-wide ${healthStatus.bg} ${healthStatus.color} ${healthStatus.border}`}>
              <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
              <span>{healthStatus.label}</span>
            </div>
          </div>
        </div>

        {/* Quick Executive Snapshot Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-6">
          <div>
            <p className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider mb-1">
              {language === 'sw' ? 'Mauzo ya Leo' : "Today's Sales"}
            </p>
            <p className="text-xl sm:text-2xl font-black text-[#1D1D1F]">
              Tsh {metrics.totalRevenue.toLocaleString()}
            </p>
            <div className="flex items-center gap-1 text-[11px] font-bold text-gray-500 mt-1">
              <span>{metrics.transactionCount} {language === 'sw' ? 'mauzo' : 'sales'}</span>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider mb-1">
              {language === 'sw' ? 'Faida Ghafi' : 'Gross Margin'}
            </p>
            <p className="text-xl sm:text-2xl font-black text-[#007AFF]">
              Tsh {metrics.grossProfit.toLocaleString()}
            </p>
            <p className="text-[11px] font-bold text-[#007AFF] mt-1">
              {metrics.grossMargin.toFixed(1)}% {language === 'sw' ? 'ya mauzo' : 'of sales'}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider mb-1">
              {language === 'sw' ? 'Matumizi & Upotevu' : 'Expenses & Waste'}
            </p>
            <p className="text-xl sm:text-2xl font-black text-[#FF9500]">
              Tsh {(metrics.totalExpensesAmount + metrics.totalWasteValue).toLocaleString()}
            </p>
            <p className="text-[11px] font-bold text-gray-500 mt-1">
              {expenses.length} {language === 'sw' ? 'matumizi' : 'records'}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider mb-1">
              {language === 'sw' ? 'Faida Halisi (Net)' : 'Real Net Profit'}
            </p>
            <p className={`text-xl sm:text-2xl font-black ${metrics.realProfit >= 0 ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
              Tsh {metrics.realProfit.toLocaleString()}
            </p>
            <p className="text-[11px] font-bold text-gray-500 mt-1">
              {metrics.netMargin.toFixed(1)}% {language === 'sw' ? 'faida halisi' : 'net margin'}
            </p>
          </div>
        </div>

        {/* Live Partner Verdict / AI Text Box */}
        <div className="p-4 bg-white/70 border border-black/[0.05] rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-black text-[#1D1D1F] uppercase tracking-wider">
              <Sparkles size={14} className="text-[#007AFF]" />
              <span>{language === 'sw' ? 'Uchambuzi wa Haraka kutoka kwa Partner' : 'Instant Strategic Note from Partner'}</span>
            </div>
            {isGenerating && (
              <span className="text-[11px] text-[#007AFF] font-bold flex items-center gap-1">
                <RefreshCw size={11} className="animate-spin" />
                {language === 'sw' ? 'Partner anaandaa uchambuzi...' : 'Partner is analyzing...'}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-gray-700 leading-relaxed">
            {metrics.totalRevenue === 0 ? (
              language === 'sw' 
                ? 'Bosi, bado hakuna mauzo yaliyofanyika leo. Mfumo uko tayari kupokea wateja na kurekodi miamala.'
                : 'Boss, no sales recorded yet today. POS registers are primed and ready for transactions.'
            ) : metrics.realProfit > 0 ? (
              language === 'sw'
                ? `Bosi, biashara inazalisha faida halisi ya Tsh ${metrics.realProfit.toLocaleString()} leo (Margin ya ${metrics.netMargin.toFixed(1)}%). Gharama za bidhaa na matumizi ziko chini ya udhibiti.`
                : `Boss, business is currently generating a real net profit of Tsh ${metrics.realProfit.toLocaleString()} today (${metrics.netMargin.toFixed(1)}% net margin). Cost of goods and operational expenses are currently in healthy proportion.`
            ) : (
              language === 'sw'
                ? `Bosi, tahadhari: Matumizi ya Tsh ${metrics.totalExpensesAmount.toLocaleString()} na gharama za bidhaa zinazidi mapato ya sasa. Tazama mapendekezo kwenye ripoti kamili ya chini.`
                : `Boss, attention: Current operating expenses and COGS are outpacing revenue. Review strategic recommendations in the full report below.`
            )}
          </p>
        </div>
      </motion.div>

      {/* DASHBOARD NAVIGATION TABS */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 no-scrollbar">
        {[
          { id: 'briefing', label: language === 'sw' ? '📄 Muhtasari Kamili (Briefing)' : '📄 Forensic Briefing', icon: FileText },
          { id: 'analytics', label: language === 'sw' ? '📊 Mwenendo & Grafu' : '📊 Visual Analytics', icon: BarChart3 },
          { id: 'staff', label: language === 'sw' ? '👥 Watumishi & Usalama' : '👥 Staff & Security', icon: ShieldCheck },
          { id: 'stock', label: language === 'sw' ? '📦 Hali ya Stoo' : '📦 Stock Health', icon: Package },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-black text-white shadow-md'
                : 'bg-white text-gray-600 hover:text-black border border-black/[0.05]'
            }`}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: EXECUTIVE BRIEFING FULL REPORT */}
      {activeTab === 'briefing' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Main Detailed Briefing Box */}
          <div className="apple-card p-6 md:p-8 bg-white border border-black/[0.06] shadow-sm">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#007AFF]/10 flex items-center justify-center text-[#007AFF]">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h4 className="font-black text-lg text-[#1D1D1F]">
                    {language === 'sw' ? 'Ripoti ya Kina ya Kiutendaji' : 'Detailed Strategic Forensic Report'}
                  </h4>
                  <p className="text-xs text-gray-400 font-medium">
                    {language === 'sw' ? 'Imeandaliwa na Partner AI kulingana na data za biashara yako' : 'Generated by Partner AI based on live verified ledger data'}
                  </p>
                </div>
              </div>

              <button
                onClick={generateBriefingSummary}
                disabled={isGenerating || isTyping}
                className="text-xs font-black text-[#007AFF] hover:underline flex items-center gap-1.5"
              >
                <RefreshCw size={13} className={isGenerating ? "animate-spin" : ""} />
                <span>{language === 'sw' ? 'Tengeneza Upya' : 'Regenerate'}</span>
              </button>
            </div>

            {isGenerating ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-[#007AFF]/10 flex items-center justify-center text-[#007AFF] animate-pulse">
                  <Sparkles size={28} />
                </div>
                <div>
                  <h5 className="font-black text-[#1D1D1F] text-base">
                    {language === 'sw' ? 'Partner anaandaa muhtasari wako...' : 'Partner is compiling your briefing...'}
                  </h5>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
                    {language === 'sw' ? 'Inakokotoa mauzo, gharama za bidhaa (COGS), matumizi na faida halisi ya leo.' : 'Calculating sales, COGS, expenses, and forensic profit margins.'}
                  </p>
                </div>
              </div>
            ) : briefingReport ? (
              <div className="space-y-6 font-sans tracking-tight text-[#1D1D1F]">
                {briefingReport.split('\n\n').map((block, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.08 }}
                    className="bg-[#F9F9FB] p-5 rounded-2xl border border-black/[0.03]"
                  >
                    <ReactMarkdown
                      components={{
                        h3: ({ children }) => (
                          <h3 className="text-base sm:text-lg font-black text-black mb-3 uppercase tracking-tight flex items-center gap-2 border-b border-black/[0.05] pb-2">
                            <span className="w-2 h-2 rounded-full bg-[#007AFF]" />
                            <span>{children}</span>
                          </h3>
                        ),
                        p: ({ children }) => (
                          <p className="text-sm font-medium leading-relaxed mb-2 text-gray-800">
                            {children}
                          </p>
                        ),
                        li: ({ children }) => (
                          <li className="text-sm font-medium mb-1.5 flex items-start gap-2">
                            <span className="text-[#007AFF] font-bold">•</span>
                            <span className="text-gray-700">{children}</span>
                          </li>
                        ),
                        hr: () => <hr className="my-4 border-gray-200" />
                      }}
                    >
                      {block}
                    </ReactMarkdown>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10">
                <p className="text-sm text-gray-500 font-medium mb-4">
                  {language === 'sw' ? 'Bado hakuna ripoti ya kina iliyotengenezwa.' : 'No detailed report compiled yet.'}
                </p>
                <button
                  onClick={generateBriefingSummary}
                  className="apple-button-primary !py-2.5 !px-6 text-xs font-bold"
                >
                  {language === 'sw' ? 'Tengeneza Muhtasari Sasa' : 'Generate Briefing Now'}
                </button>
              </div>
            )}
          </div>

          {/* 6-Metric Financial Pulse Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="apple-card p-5 bg-white border border-black/[0.04]">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  {language === 'sw' ? 'Mauzo ya Leo' : "Gross Sales"}
                </span>
                <div className="p-2 rounded-xl bg-[#007AFF]/10 text-[#007AFF]">
                  <DollarSign size={16} />
                </div>
              </div>
              <h4 className="text-2xl font-black text-[#1D1D1F]">
                Tsh {metrics.totalRevenue.toLocaleString()}
              </h4>
              <p className="text-xs text-gray-500 font-medium mt-1">
                {metrics.transactionCount} {language === 'sw' ? 'wateja waliohudumiwa' : 'customers served'}
              </p>
            </div>

            <div className="apple-card p-5 bg-white border border-black/[0.04]">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  {language === 'sw' ? 'Gharama za Bidhaa (COGS)' : 'Cost of Goods'}
                </span>
                <div className="p-2 rounded-xl bg-gray-100 text-gray-600">
                  <Package size={16} />
                </div>
              </div>
              <h4 className="text-2xl font-black text-gray-700">
                Tsh {metrics.totalCOGS.toLocaleString()}
              </h4>
              <p className="text-xs text-gray-500 font-medium mt-1">
                {language === 'sw' ? 'Mtaji wa bidhaa zilizouzwa' : 'Wholesale value of goods sold'}
              </p>
            </div>

            <div className="apple-card p-5 bg-white border border-black/[0.04]">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  {language === 'sw' ? 'Faida Ghafi' : 'Gross Margin'}
                </span>
                <div className="p-2 rounded-xl bg-[#34C759]/10 text-[#34C759]">
                  <TrendingUp size={16} />
                </div>
              </div>
              <h4 className="text-2xl font-black text-[#34C759]">
                Tsh {metrics.grossProfit.toLocaleString()}
              </h4>
              <p className="text-xs text-[#34C759] font-bold mt-1">
                {metrics.grossMargin.toFixed(1)}% {language === 'sw' ? 'faida kabla ya matumizi' : 'before expenses'}
              </p>
            </div>

            <div className="apple-card p-5 bg-white border border-black/[0.04]">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  {language === 'sw' ? 'Matumizi ya Leo' : 'Operating Expenses'}
                </span>
                <div className="p-2 rounded-xl bg-[#FF9500]/10 text-[#FF9500]">
                  <Wallet size={16} />
                </div>
              </div>
              <h4 className="text-2xl font-black text-[#FF9500]">
                Tsh {metrics.totalExpensesAmount.toLocaleString()}
              </h4>
              <p className="text-xs text-gray-500 font-medium mt-1">
                {expenses.length} {language === 'sw' ? 'rekodi za matumizi' : 'expense entries'}
              </p>
            </div>

            <div className="apple-card p-5 bg-black text-white border border-white/10 shadow-lg">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-white/60">
                  {language === 'sw' ? 'FAIDA HALISI (TAKE-HOME)' : 'REAL NET PROFIT'}
                </span>
                <div className="p-2 rounded-xl bg-white/15 text-[#34C759]">
                  <Zap size={16} />
                </div>
              </div>
              <h4 className={`text-2xl font-black ${metrics.realProfit >= 0 ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                Tsh {metrics.realProfit.toLocaleString()}
              </h4>
              <p className="text-xs text-white/70 font-bold mt-1">
                {metrics.netMargin.toFixed(1)}% {language === 'sw' ? 'ya mauzo yote' : 'of total revenue'}
              </p>
            </div>

            <div className="apple-card p-5 bg-white border border-black/[0.04]">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                  {language === 'sw' ? 'Droo ya Pesa (Drawer Audit)' : 'Cash Drawer Status'}
                </span>
                <div className={`p-2 rounded-xl ${metrics.auditStatus === 'CLEAN' ? 'bg-[#34C759]/10 text-[#34C759]' : 'bg-[#FF9500]/10 text-[#FF9500]'}`}>
                  <ShieldCheck size={16} />
                </div>
              </div>
              <h4 className="text-2xl font-black text-[#1D1D1F]">
                {metrics.auditStatus}
              </h4>
              <p className="text-xs text-gray-500 font-medium mt-1">
                {metrics.cashVariance !== null 
                  ? (metrics.cashVariance === 0 ? (language === 'sw' ? 'Hesabu inalingana 100%' : '100% Balanced') : `Tsh ${Math.abs(metrics.cashVariance).toLocaleString()} ${metrics.cashVariance > 0 ? 'ziada' : 'pungufu'}`)
                  : (language === 'sw' ? 'Inasubiri ukaguzi wa mwisho' : 'Pending reconciliation')}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* TAB 2: VISUAL ANALYTICS & CHARTS */}
      {activeTab === 'analytics' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Revenue & Estimated Profit Hourly Curve */}
          <div className="apple-card p-6 bg-white border border-black/[0.05] shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h4 className="font-black text-base text-[#1D1D1F]">
                  {language === 'sw' ? 'Mwenendo wa Mauzo ya Leo (Kwa Saa)' : "Today's Hourly Revenue Trend"}
                </h4>
                <p className="text-xs text-gray-400 font-medium">
                  {language === 'sw' ? 'Kasi ya mauzo na ongezeko la mtaji leo' : 'Pace of sales and gross margins over time'}
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-bold">
                <div className="flex items-center gap-1.5 text-[#007AFF]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#007AFF]" />
                  <span>{language === 'sw' ? 'Mauzo' : 'Sales'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[#34C759]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#34C759]" />
                  <span>{language === 'sw' ? 'Faida' : 'Profit'}</span>
                </div>
              </div>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlySalesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#007AFF" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#007AFF" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34C759" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#34C759" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5EA" />
                  <XAxis dataKey="hour" stroke="#8E8E93" fontSize={11} tickLine={false} />
                  <YAxis stroke="#8E8E93" fontSize={11} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip 
                    formatter={(val: any) => [`Tsh ${Number(val).toLocaleString()}`, '']}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Area type="monotone" dataKey="sales" name={language === 'sw' ? 'Mauzo' : 'Sales'} stroke="#007AFF" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSales)" />
                  <Area type="monotone" dataKey="profit" name={language === 'sw' ? 'Faida' : 'Profit'} stroke="#34C759" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Revenue Breakdown Bar Chart */}
          <div className="apple-card p-6 bg-white border border-black/[0.05] shadow-sm">
            <h4 className="font-black text-base text-[#1D1D1F] mb-1">
              {language === 'sw' ? 'Mgawanyo wa Kifedha wa Leo (P&L Breakdown)' : "Financial Flow Breakdown (P&L)"}
            </h4>
            <p className="text-xs text-gray-400 font-medium mb-6">
              {language === 'sw' ? 'Jinsi mapato yanavyogawanyika kati ya gharama, matumizi na faida halisi' : 'How revenue decomposes into COGS, operating costs, and take-home profit'}
            </p>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={breakdownData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E5EA" />
                  <XAxis type="number" stroke="#8E8E93" fontSize={11} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" stroke="#1D1D1F" fontSize={12} width={120} tickLine={false} />
                  <Tooltip 
                    formatter={(val: any) => [`Tsh ${Number(val).toLocaleString()}`, '']}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="amount" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>
      )}

      {/* TAB 3: STAFF INTEGRITY & SECURITY WATCHDOG */}
      {activeTab === 'staff' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="apple-card p-6 bg-white border border-black/[0.05] shadow-sm">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#5856D6]/10 flex items-center justify-center text-[#5856D6]">
                  <Users size={20} />
                </div>
                <div>
                  <h4 className="font-black text-base text-[#1D1D1F]">
                    {language === 'sw' ? 'Wafanyakazi na Ukaguzi wa Mauzo' : 'Staff Operations & Transaction Integrity'}
                  </h4>
                  <p className="text-xs text-gray-400 font-medium">
                    {metrics.activeStaff.length} {language === 'sw' ? 'watoa huduma walioingia kwenye mfumo leo' : 'active operators today'}
                  </p>
                </div>
              </div>

              <button
                onClick={generateStaffActivityBrief}
                disabled={isGeneratingStaff || isTyping}
                className="apple-button-secondary !py-2 !px-4 text-xs font-bold"
              >
                {isGeneratingStaff ? 'Auditing...' : (language === 'sw' ? 'Fanya Ukaguzi' : 'Run Audit')}
              </button>
            </div>

            {/* Quick Stats on Voids & Overrides */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Voids (Kufuta)</p>
                <p className="text-xl font-black text-[#FF3B30] mt-1">{voidLogs.length}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Price Overrides</p>
                <p className="text-xl font-black text-[#FF9500] mt-1">{auditLogs.filter(a => a.type === 'price_change').length}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Permission Edits</p>
                <p className="text-xl font-black text-[#007AFF] mt-1">{auditLogs.filter(a => a.type === 'permission_change').length}</p>
              </div>
            </div>

            {/* Voids Table */}
            <div>
              <h5 className="font-black text-xs uppercase tracking-wider text-gray-400 mb-3">
                {language === 'sw' ? 'Miamala ya Kufuta Bidhaa (Void Logs)' : 'Recent Void Records'}
              </h5>
              {voidLogs.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-3">
                  {language === 'sw' ? 'Hakuna bidhaa iliyofutwa kwenye kapu leo.' : 'No voids recorded today.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {voidLogs.slice(0, 8).map(v => (
                    <div key={v.id} className="p-3 bg-[#FFF5F5] border border-[#FFE5E5] rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <p className="font-black text-[#FF3B30]">{v.productName}</p>
                        <p className="text-gray-500 text-[11px]">{(v as any).cashierName || v.cashierId || 'Cashier'} • {v.reason || 'No reason'}</p>
                      </div>
                      <span className="text-gray-400 font-bold">{format(new Date(v.timestamp), 'HH:mm')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* TAB 4: STOCK HEALTH & INTELLIGENCE */}
      {activeTab === 'stock' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="apple-card p-6 bg-white border border-black/[0.05] shadow-sm">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#34C759]/10 flex items-center justify-center text-[#34C759]">
                  <Package size={20} />
                </div>
                <div>
                  <h4 className="font-black text-base text-[#1D1D1F]">
                    {language === 'sw' ? 'Ukaguzi wa Stoo na Bidhaa' : 'Inventory Valuation & Shortage Watch'}
                  </h4>
                  <p className="text-xs text-gray-400 font-medium">
                    {products.length} {language === 'sw' ? 'jumla ya aina za bidhaa' : 'total SKUs registered'}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {language === 'sw' ? 'Thamani ya Stoo' : 'Inventory Value'}
                </p>
                <p className="text-base font-black text-[#007AFF]">
                  Tsh {metrics.inventoryValue.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Low Stock Listing */}
            <div>
              <h5 className="font-black text-xs uppercase tracking-wider text-gray-400 mb-3">
                {language === 'sw' ? 'Bidhaa Zinazohitaji Kuongezwa Haraka (Low Stock)' : 'Critical Low Stock Products'}
              </h5>
              {metrics.lowStockItems.length === 0 ? (
                <div className="p-6 text-center text-[#34C759] font-bold text-xs">
                  {language === 'sw' ? 'Stoo ipo vizuri! Hakuna bidhaa iliyo chini ya kiwango.' : 'Inventory levels healthy! No shortages detected.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {metrics.lowStockItems.slice(0, 10).map(p => (
                    <div key={p.id} className="p-3.5 bg-orange-50/70 border border-orange-100 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <p className="font-black text-orange-950">{p.name}</p>
                        <p className="text-orange-700 text-[11px]">Tsh {p.price.toLocaleString()} • {p.category}</p>
                      </div>
                      <div className="text-right">
                        <span className="px-2.5 py-1 bg-white text-orange-600 font-black rounded-lg border border-orange-200 shadow-sm text-xs">
                          {p.stock} {p.unit || 'pcs'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* TIMELINE ACTIVITY & INTELLIGENCE NOTIFICATIONS */}
      <div className="mt-10 space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-base font-black text-black flex items-center gap-2">
            <Bell size={16} className="text-black" />
            <span>{t('partner_activity_feed', 'Msururu wa Matukio na Tahadhari')}</span>
          </h3>
          <span className="text-[11px] font-bold text-gray-400">
            {messages.length} {language === 'sw' ? 'taarifa' : 'alerts'}
          </span>
        </div>

        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {messages.length === 0 ? (
              <div className="p-8 text-center apple-card bg-white/60">
                <Info size={24} className="text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400 font-medium">
                  {language === 'sw' ? 'Hakuna tahadhari mpya kwa sasa. Mfumo unafuatilia matukio yote.' : 'No alerts at the moment. System is monitoring all events.'}
                </p>
              </div>
            ) : (
              messages.map(msg => (
                <motion.div
                  key={msg.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="p-4 apple-card bg-white border border-black/[0.04] shadow-sm flex items-start gap-3.5"
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm bg-gray-50 ${msg.color}`}>
                    <msg.icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h6 className={`font-black text-xs ${msg.color}`}>{msg.title}</h6>
                      <span className="text-[10px] text-gray-400 font-bold">{format(msg.timestamp, 'HH:mm')}</span>
                    </div>
                    <div className="text-xs text-gray-700 font-medium leading-relaxed">
                      {msg.type === 'report' ? (
                        <p className="line-clamp-2">{msg.body.slice(0, 160)}...</p>
                      ) : (
                        <ReactMarkdown>{msg.body}</ReactMarkdown>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
};
