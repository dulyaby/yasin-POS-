import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { Product, AuditLog } from '../types';
import { logAuditEvent } from '../lib/auditLogger';
import { 
  Package, 
  Plus, 
  Minus, 
  Search, 
  Database, 
  Check, 
  Loader2, 
  AlertCircle,
  Lock,
  LockOpen,
  TrendingUp,
  History,
  ShieldAlert
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

export const StockControl: React.FC = () => {
  const { activeBusiness, profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  
  // Update state per product
  const [inlineAdjustments, setInlineAdjustments] = useState<Record<string, { 
    purchase: string, 
    adjust: string, 
    reason: string, 
    isSaving: boolean, 
    showCheck: boolean,
    isEditing: boolean
  }>>({});

  useEffect(() => {
    if (!activeBusiness?.id) return;

    const q = query(
      collection(db, 'products'),
      where('businessId', '==', activeBusiness.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const p = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      // Sort alphabetically by name
      setProducts(p.sort((a, b) => a.name.localeCompare(b.name)));
      
      // Initialize editing state if not present
      setInlineAdjustments(prev => {
        const next = { ...prev };
        p.forEach(product => {
          if (!next[product.id]) {
            next[product.id] = {
              purchase: '',
              adjust: '',
              reason: '',
              isSaving: false,
              showCheck: false,
              isEditing: false
            };
          }
        });
        return next;
      });

      setLoading(false);
    });

    return () => unsubscribe();
  }, [activeBusiness]);

  const categories = ['All', ...new Set(products.map(p => p.category))];

  const toggleEdit = (productId: string) => {
    setInlineAdjustments(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        isEditing: !prev[productId]?.isEditing
      }
    }));
  };

  const handleInlineChange = (productId: string, field: 'purchase' | 'adjust' | 'reason', value: string) => {
    setInlineAdjustments(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value
      }
    }));
  };

  const saveUpdate = async (product: Product, type: 'purchase' | 'adjust') => {
    if (!activeBusiness?.id || !profile?.uid) return;
    
    const adjustment = inlineAdjustments[product.id];
    if (!adjustment) return;

    const valueStr = type === 'purchase' ? adjustment.purchase : adjustment.adjust;
    const value = parseFloat(valueStr);
    
    if (isNaN(value) || value <= 0) {
      toast.error('Weka kiasi sahihi.');
      return;
    }

    // if (type === 'adjust' && !adjustment.reason) {
    //   toast.error('Tafadhali chagua sababu ya kupunguza.');
    //   return;
    // }

    // Set saving
    setInlineAdjustments(prev => ({
      ...prev,
      [product.id]: { ...prev[product.id], isSaving: true }
    }));

    try {
      const finalValue = type === 'purchase' ? value : -value;
      const newStock = Number((product.stock + finalValue).toFixed(3));
      
      await updateDoc(doc(db, 'products', product.id), {
        stock: newStock,
        updatedAt: new Date().toISOString()
      });

      // Audit Log with complete day, date, time
      await logAuditEvent({
        businessId: activeBusiness.id,
        type: 'stock_update',
        category: 'stock',
        title: type === 'purchase' ? `Kuingiza Mzigo Mpya: ${product.name}` : `Kurekebisha Stoo: ${product.name}`,
        productId: product.id,
        productName: product.name,
        cashierId: profile.uid,
        cashierName: profile.displayName || 'CEO',
        originalValue: product.stock,
        newValue: newStock,
        reason: adjustment.reason || (type === 'purchase' ? 'Ununuzi mpya' : 'Kurekebisha idadi'),
        details: type === 'purchase' 
          ? `${profile.displayName || 'CEO'} ameingiza mzigo wa +${value}${product.unit} kwa ${product.name}. Stoo imefikia ${newStock}${product.unit}.`
          : `${profile.displayName || 'CEO'} amepunguza -${value}${product.unit} kwa ${product.name}. Sababu: ${adjustment.reason || 'Hatua ya Haraka'}. Stoo imefikia ${newStock}${product.unit}.`,
        notifyCeo: type === 'adjust' && value > 10
      });

      setInlineAdjustments(prev => ({
        ...prev,
        [product.id]: { 
          ...prev[product.id], 
          isSaving: false, 
          showCheck: true,
          isEditing: false, // Lock after save
          purchase: type === 'purchase' ? '' : prev[product.id]?.purchase,
          adjust: type === 'adjust' ? '' : prev[product.id]?.adjust,
          reason: type === 'adjust' ? '' : prev[product.id]?.reason
        }
      }));

      setTimeout(() => {
        setInlineAdjustments(prev => {
          if (!prev[product.id]) return prev;
          return {
            ...prev,
            [product.id]: { ...prev[product.id], showCheck: false }
          };
        });
      }, 2000);

      toast.success(type === 'purchase' ? 'Stock mpya imeongezwa!' : 'Marekebisho yamehifadhiwa!');

    } catch (err) {
      toast.error('Imeshindikana kuhifadhi.');
      setInlineAdjustments(prev => ({
        ...prev,
        [product.id]: { ...prev[product.id], isSaving: false }
      }));
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'All' || p.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-10 max-w-[1400px] mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-sans font-black text-black tracking-tight mb-2">Stock Control</h2>
          <p className="text-gray-500 font-medium flex items-center gap-2">
            <ShieldAlert size={16} className="text-[#007AFF]" />
            Dhibiti na Ongeza Bidhaa kwenye Stoo yako moja kwa moja.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-white/50 backdrop-blur-md p-2 rounded-3xl border border-black/[0.03] shadow-sm">
           <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Tafuta bidhaa..."
                className="bg-transparent pl-11 pr-4 py-3 rounded-2xl outline-none text-black font-bold placeholder:text-gray-400 min-w-[280px]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>
           <div className="h-8 w-px bg-black/[0.05]" />
           <select 
             className="bg-transparent px-4 py-3 rounded-2xl outline-none font-bold text-[#007AFF] cursor-pointer"
             value={filterCategory}
             onChange={(e) => setFilterCategory(e.target.value)}
           >
             {categories.map(c => <option key={c} value={c}>{c}</option>)}
           </select>
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <Loader2 className="animate-spin text-[#007AFF]" size={40} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <AnimatePresence mode="popLayout">
            {filteredProducts.map((product) => (
              <motion.div
                layout
                key={product.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                whileHover={{ y: -3 }}
                className="bg-white/40 backdrop-blur-md rounded-[32px] p-5 md:p-6 border border-white/50 shadow-[0_8px_40px_-10px_rgba(0,0,0,0.03)] transition-all duration-500 hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.08)] group relative flex flex-col lg:flex-row lg:items-center gap-8 overflow-hidden"
              >
                {/* 1. Brand & Info Section */}
                <div className="flex items-center gap-5 min-w-[280px]">
                  <div className="relative group-hover:scale-110 transition-transform duration-500">
                    <div className="w-14 h-14 bg-white/60 backdrop-blur-md rounded-[22px] flex items-center justify-center border border-white/40 shadow-sm">
                      <Package size={26} className="text-[#8E8E93] group-hover:text-[#007AFF] transition-colors" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-sans font-black text-black leading-tight tracking-tight">{product.name}</h3>
                    <div className="flex items-center gap-2.5 mt-1.5">
                      <span className="text-[10px] font-black uppercase text-gray-400 tracking-[0.15em] bg-black/[0.03] px-2 py-0.5 rounded-full">{product.category}</span>
                      <span className="text-[10px] font-black uppercase text-[#007AFF] tracking-[0.1em]">{product.unit}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Luxury Inventory Pulse (Quantity) */}
                <div className="flex items-center gap-10 lg:border-l lg:border-black/[0.04] lg:pl-10">
                  <div className="relative">
                    <p className="text-[10px] font-black text-[#8E8E93] uppercase tracking-[0.2em] mb-1">Mizani Sasa</p>
                    <div className="flex items-baseline gap-2">
                      <span className={cn(
                        "text-4xl font-luxury font-black leading-none tracking-tighter",
                        (product.stock || 0) <= (product.lowStockThreshold || 5) ? "text-[#FF3B30] drop-shadow-[0_0_10px_rgba(255,59,48,0.2)]" : "text-black"
                      )}>
                        {Number(product.stock || 0).toFixed(product.unit === 'pcs' ? 0 : 2)}
                      </span>
                      <span className="text-[10px] font-black text-[#8E8E93] uppercase tracking-widest">{product.unit}</span>
                    </div>
                  </div>
                  
                  {product.stock <= (product.lowStockThreshold || 5) && (
                    <motion.div 
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="bg-[#FF3B30]/10 px-3 py-1.5 rounded-xl flex items-center gap-2 border border-[#FF3B30]/10"
                    >
                      <AlertCircle size={14} className="text-[#FF3B30]" />
                      <span className="text-[9px] font-black text-[#FF3B30] uppercase tracking-widest">Low Stock</span>
                    </motion.div>
                  )}
                </div>

                {/* 3. Transaction Hub (Command UI) */}
                <div className="flex-1 flex flex-wrap items-center justify-end gap-4 lg:pl-10">
                  
                  {/* Edit/Lock Toggle Button */}
                  <div className="mr-4">
                    <button
                      onClick={() => toggleEdit(product.id)}
                      className={cn(
                        "flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all duration-300 shadow-sm hover:scale-105 active:scale-95",
                        inlineAdjustments[product.id]?.isEditing 
                          ? "bg-black text-white" 
                          : "bg-white text-[#007AFF] border border-[#007AFF]/20"
                      )}
                    >
                      {inlineAdjustments[product.id]?.isEditing ? (
                        <>
                          <LockOpen size={14} />
                          <span>Cancel Edit</span>
                        </>
                      ) : (
                        <>
                          <Lock size={14} />
                          <span>Edit Changes</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Buy Cluster */}
                  <div className={cn(
                    "relative min-w-[160px] transition-all duration-500",
                    !inlineAdjustments[product.id]?.isEditing && "opacity-40 grayscale pointer-events-none"
                  )}>
                    <span className="absolute -top-3 left-4 px-3 py-0.5 bg-black rounded-full text-[13px] font-black text-white uppercase tracking-wider z-10 shadow-lg">Nunua (+)</span>
                    <div className="relative group/field">
                      <input
                        type="number"
                        step="0.001"
                        placeholder="0.00"
                        disabled={!inlineAdjustments[product.id]?.isEditing}
                        value={inlineAdjustments[product.id]?.purchase || ''}
                        onChange={(e) => handleInlineChange(product.id, 'purchase', e.target.value)}
                        className="w-full bg-white/40 backdrop-blur-md border border-white/60 rounded-[20px] px-6 py-5 text-xl font-luxury font-black text-black outline-none focus:bg-white/80 focus:border-[#34C759]/30 focus:shadow-[0_0_20px_rgba(52,199,89,0.1)] transition-all placeholder:text-gray-300"
                      />
                      <AnimatePresence>
                        {inlineAdjustments[product.id]?.purchase && inlineAdjustments[product.id]?.isEditing && (
                          <motion.button 
                            initial={{ scale: 0, x: 10 }}
                            animate={{ scale: 1, x: 0 }}
                            exit={{ scale: 0, x: 10 }}
                            onClick={() => saveUpdate(product, 'purchase')}
                            disabled={inlineAdjustments[product.id]?.isSaving}
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#34C759] text-white rounded-2xl shadow-[0_8px_16px_rgba(52,199,89,0.3)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                          >
                            {inlineAdjustments[product.id]?.isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={18} strokeWidth={4} />}
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Drain Cluster (Adjustment) */}
                  <div className={cn(
                    "flex flex-col gap-3 min-w-[240px] transition-all duration-500",
                    !inlineAdjustments[product.id]?.isEditing && "opacity-40 grayscale pointer-events-none"
                  )}>
                    <div className="relative">
                      <span className="absolute -top-3 left-4 px-3 py-0.5 bg-black rounded-full text-[13px] font-black text-white uppercase tracking-wider z-10 shadow-lg">Punguza (-)</span>
                      <div className="relative group/field">
                        <input
                          type="number"
                          step="0.001"
                          placeholder="0.00"
                          disabled={!inlineAdjustments[product.id]?.isEditing}
                          value={inlineAdjustments[product.id]?.adjust || ''}
                          onChange={(e) => handleInlineChange(product.id, 'adjust', e.target.value)}
                          className="w-full bg-white/40 backdrop-blur-md border border-white/60 rounded-[20px] px-6 py-5 text-xl font-luxury font-black text-black outline-none focus:bg-white/80 focus:border-[#FF3B30]/30 focus:shadow-[0_0_20px_rgba(255,59,48,0.1)] transition-all placeholder:text-gray-300"
                        />
                        <AnimatePresence>
                          {inlineAdjustments[product.id]?.adjust && inlineAdjustments[product.id]?.isEditing && (
                            <motion.button 
                              initial={{ scale: 0, x: 10 }}
                              animate={{ scale: 1, x: 0 }}
                              exit={{ scale: 0, x: 10 }}
                              onClick={() => saveUpdate(product, 'adjust')}
                              disabled={inlineAdjustments[product.id]?.isSaving}
                              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-[#FF3B30] text-white rounded-2xl shadow-[0_8px_16px_rgba(255,59,48,0.3)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                            >
                              {inlineAdjustments[product.id]?.isSaving ? <Loader2 size={16} className="animate-spin" /> : <Check size={18} strokeWidth={4} />}
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    <AnimatePresence>
                      {inlineAdjustments[product.id]?.adjust && inlineAdjustments[product.id]?.isEditing && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                        >
                          <select
                            value={inlineAdjustments[product.id]?.reason || ''}
                            onChange={(e) => handleInlineChange(product.id, 'reason', e.target.value)}
                            className="w-full bg-black/[0.03] border-2 border-black/[0.05] rounded-xl px-4 py-3 text-xs font-black text-black outline-none transition-all focus:border-black/20 appearance-none cursor-pointer"
                          >
                            <option value="">(RECOMMENDED) CHAGUA SABABU...</option>
                            <option value="Damaged">DAMAGED - IMEHARIBIKA</option>
                            <option value="Drip Loss">DRIP LOSS - DROPLOSS</option>
                            <option value="Expired">EXPIRED - IMEISHA MUDA</option>
                            <option value="Theft">THEFT - WIZI / PUNGUFU</option>
                            <option value="Correction">CORRECTION - USAHIHI</option>
                          </select>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Success Animation Shield */}
                <AnimatePresence>
                  {inlineAdjustments[product.id]?.showCheck && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center z-20"
                    >
                      <motion.div
                        initial={{ scale: 0, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        className="flex flex-col items-center gap-3"
                      >
                        <div className="w-16 h-16 bg-[#007AFF] text-white rounded-[24px] flex items-center justify-center shadow-[0_20px_40px_rgba(0,122,255,0.3)]">
                          <Check size={32} strokeWidth={4} />
                        </div>
                        <div className="text-center">
                          <span className="block text-2xl font-sans font-black text-black tracking-tight">SAVED</span>
                          <span className="block text-[10px] font-black text-[#007AFF] uppercase tracking-[0.2em] mt-1">Stoo Imerekebishwa</span>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Subtle Geometric Decor */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-black/[0.03] to-transparent rounded-full -mr-16 -mt-16 pointer-events-none" />
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredProducts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 bg-white/30 rounded-[48px] border-2 border-dashed border-black/[0.05] backdrop-blur-sm">
              <Database size={64} className="text-gray-200 mb-6" />
              <h3 className="text-2xl font-sans font-black text-gray-400">Hakuna bidhaa inayopatikana</h3>
              <p className="text-gray-400 text-xs font-black uppercase tracking-[0.3em] mt-2">Jaribu kutafuta upya</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
