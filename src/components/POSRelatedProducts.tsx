import React from 'react';
import { Product } from '../types';
import { SuggestedProduct } from '../services/recommendationEngine';
import { Sparkles, Plus, Check, ShoppingBag, TrendingUp, Layers, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface POSRelatedProductsProps {
  suggestions: SuggestedProduct[];
  onAddToCart: (product: Product) => void;
  language?: 'sw' | 'en';
  variant?: 'cart' | 'grid-banner';
  lastAddedProductName?: string | null;
}

export const POSRelatedProducts: React.FC<POSRelatedProductsProps> = ({
  suggestions,
  onAddToCart,
  language = 'sw',
  variant = 'cart',
  lastAddedProductName
}) => {
  const [justAddedId, setJustAddedId] = React.useState<string | null>(null);

  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  const handleAdd = (product: Product) => {
    setJustAddedId(product.id);
    onAddToCart(product);
    setTimeout(() => {
      setJustAddedId(null);
    }, 600);
  };

  if (variant === 'grid-banner') {
    return (
      <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-purple-50/70 border border-[#007AFF]/20 rounded-2xl p-3 mb-4 shadow-sm">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-[#007AFF] text-white flex items-center justify-center shadow-sm">
              <Sparkles size={13} />
            </div>
            <span className="text-xs font-black text-gray-900 tracking-tight">
              {language === 'en' ? 'Frequently Bought Together' : 'Wateja Hununua Pamoja Na Hii'}
            </span>
            {lastAddedProductName && (
              <span className="text-[11px] font-semibold text-[#007AFF] bg-white/80 px-2 py-0.5 rounded-md border border-[#007AFF]/20 truncate max-w-[150px]">
                {lastAddedProductName}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            {language === 'en' ? 'Smart Suggestions' : 'Mapendekezo'}
          </span>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide py-1">
          <AnimatePresence>
            {suggestions.map((s) => (
              <motion.div
                key={s.product.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-xl p-2.5 border border-black/[0.06] shadow-sm flex items-center gap-3 min-w-[210px] max-w-[240px] shrink-0 hover:border-[#007AFF]/30 transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {s.badge === 'frequent' && (
                      <span className="text-[9px] font-black text-amber-700 bg-amber-100/90 px-1.5 py-0.2 rounded uppercase">
                        {language === 'en' ? 'Cross-sell' : 'Huenda Pamoja'}
                      </span>
                    )}
                    {s.badge === 'category' && (
                      <span className="text-[9px] font-black text-blue-700 bg-blue-100/90 px-1.5 py-0.2 rounded uppercase">
                        {s.product.category || 'Kundi'}
                      </span>
                    )}
                  </div>
                  <h5 className="font-bold text-gray-900 text-xs truncate leading-tight group-hover:text-[#007AFF] transition-colors">
                    {s.product.name}
                  </h5>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-black text-[#007AFF]">
                      Tsh {s.product.price.toLocaleString()}
                    </span>
                    <span className="text-[9px] text-gray-400 font-medium">
                      {s.product.stock} {s.product.unit || 'pcs'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleAdd(s.product)}
                  className={cn(
                    "w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0 active:scale-90 shadow-sm",
                    justAddedId === s.product.id
                      ? "bg-emerald-500 text-white shadow-emerald-500/30"
                      : "bg-[#007AFF] hover:bg-[#0062cc] text-white shadow-[#007AFF]/20"
                  )}
                  title={language === 'en' ? 'Add to cart' : 'Weka kwenye kapu'}
                >
                  {justAddedId === s.product.id ? <Check size={14} /> : <Plus size={14} />}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // Variant: Cart Sidebar view (Compact list inside Cart)
  return (
    <div className="mt-3 p-3 bg-gradient-to-b from-[#007AFF]/[0.03] to-[#007AFF]/[0.08] rounded-2xl border border-[#007AFF]/15">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-[#007AFF]" />
          <h4 className="text-[11px] font-black uppercase tracking-wider text-gray-800">
            {language === 'en' ? 'Customers Also Bought' : 'Wateja Hununua Pamoja Na:'}
          </h4>
        </div>
        <span className="text-[9px] font-bold bg-[#007AFF]/10 text-[#007AFF] px-1.5 py-0.5 rounded-full uppercase">
          AI Suggest
        </span>
      </div>

      <div className="space-y-1.5">
        {suggestions.map((s) => (
          <motion.div
            key={s.product.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-2 rounded-xl border border-black/[0.05] shadow-xs flex items-center justify-between gap-2 group hover:border-[#007AFF]/30 transition-all"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-xs text-gray-900 truncate leading-tight">
                  {s.product.name}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] font-black text-[#007AFF]">
                  Tsh {s.product.price.toLocaleString()}
                </span>
                <span className="text-[9px] text-gray-400 font-medium truncate max-w-[140px]" title={s.reason}>
                  {s.reason}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleAdd(s.product)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all shrink-0 active:scale-95",
                justAddedId === s.product.id
                  ? "bg-emerald-500 text-white"
                  : "bg-[#007AFF]/10 hover:bg-[#007AFF] text-[#007AFF] hover:text-white"
              )}
            >
              {justAddedId === s.product.id ? (
                <>
                  <Check size={12} />
                  <span>{language === 'en' ? 'Added' : 'Imewekwa'}</span>
                </>
              ) : (
                <>
                  <Plus size={12} />
                  <span>{language === 'en' ? 'Add' : 'Weka'}</span>
                </>
              )}
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
