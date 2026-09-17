import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  addDoc, 
  doc, 
  runTransaction, 
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  increment 
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { Product, Supplier } from '../types';
import { useProducts } from '../context/ProductContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Minus,
  Search, 
  ShoppingCart, 
  Trash2, 
  Edit2, 
  FileSpreadsheet, 
  Loader2, 
  Wand2, 
  Camera, 
  Keyboard, 
  History,
  TrendingUp,
  AlertCircle,
  XCircle,
  Save,
  CheckCircle2,
  QrCode,
  Smartphone
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import fuzzysort from 'fuzzysort';
import * as XLSX from 'xlsx';
import { triggerScreenFlash } from './ScreenFlash';
import { 
  scanReceiptForPurchases, 
  detectSpreadsheetColumns, 
  ExtractedProduct 
} from '../services/geminiService';
import { compressImage } from '../lib/imageCompressor';
import { processVoiceTranscript } from '../services/partnerAIService';
import { QRUploadModal } from './QRUploadModal';

interface PurchaseItem extends ExtractedProduct {
  confidence?: number;
  productId?: string;
  isNew?: boolean;
  expiryDate?: string;
}

import { useAI } from '../context/AIContext';

export const Purchase: React.FC = () => {
  const { activeBusiness } = useAuth();
  const { products } = useProducts();
  const { runTask, draftPurchases: purchaseHistory, setDraftPurchases: setPurchaseHistory, isTyping } = useAI();
  const [quickText, setQuickText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [expiringProducts, setExpiringProducts] = useState<Product[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'credit'>('cash');
  
  // Partner AI state
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [pastPurchases, setPastPurchases] = useState<any[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch Suppliers
  useEffect(() => {
    if (!activeBusiness?.id) return;
    const q = query(collection(db, 'suppliers'), where('businessId', '==', activeBusiness.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)));
    });
    return () => unsubscribe();
  }, [activeBusiness?.id]);

  // Monitor Expiry on load
  useEffect(() => {
    if (products.length > 0) {
      const soon = products.filter(p => {
        if (!p.expiryDate) return false;
        const days = (new Date(p.expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24);
        return days > 0 && days <= 15; // Expiring in next 15 days
      });
      setExpiringProducts(soon);
    }
  }, [products]);

  // Fetch Purchase History
  const fetchPurchaseHistory = async () => {
    if (!activeBusiness?.id) return;
    setIsLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'purchases'),
        where('businessId', '==', activeBusiness.id),
        orderBy('timestamp', 'desc'),
        limit(20)
      );
      const snapshot = await getDocs(q);
      const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPastPurchases(history);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchPurchaseHistory();
  }, [activeBusiness]);

  // Profit Margin - Suggesting 20% by default if cost is detected
  const suggestPrice = (cost: number) => Math.ceil((cost * 1.2) / 100) * 100;

  // Fuzzy Search & Unit Detection Logic
  useEffect(() => {
    const lines = quickText.split('\n');
    const lastLine = lines[lines.length - 1].trim();

    if (lastLine.length > 1) {
      // Regex: Name followed by Number (Units)
      // Supports: "Kuku 50", "Maziwa 10.5", "Sukari 5"
      const match = lastLine.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
      
      const searchName = match ? match[1] : lastLine;
      
      const results = fuzzysort.go(searchName, products, { 
        key: 'name',
        limit: 5,
        threshold: -1500 // More lenient to catch very bad typos
      });

      setSuggestions(results.map(r => r.obj as Product));
    } else {
      setSuggestions([]);
    }
  }, [quickText, products]);

  const addItemToHistory = (product: Product, units: number) => {
    const newItem: PurchaseItem = {
      name: product.name,
      category: product.category,
      price: product.price,
      costPrice: product.costPrice,
      stock: units,
      productId: product.id,
      isNew: false
    };
    setPurchaseHistory(prev => [newItem, ...prev]);
    toast.success(`Imeongezwa: ${product.name} (${units})`);
    triggerScreenFlash('success');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const lines = quickText.split('\n');
      const lastLine = lines[lines.length - 1].trim();
      
      const match = lastLine.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
      if (match) {
        const name = match[1];
        const units = Number(match[2]);
        
        // Priority 1: Use top suggestion (handles typos)
        if (suggestions.length > 0) {
          addItemToHistory(suggestions[0], units);
        } else {
          // Priority 2: If no matches at all, don't just accept random spelling.
          // In a high-speed environment, random text is usually a mistake.
          toast.error(`"${name}" haipo stoo! Angalia spelling au ongeza kama bidhaa mpya kwa kubonyeza kitufe cha (+) Inventory.`);
          triggerScreenFlash('error');
          return;
        }
        
        const newLines = [...lines];
        newLines.pop();
        setQuickText(newLines.join('\n') + (newLines.length > 0 ? '\n' : ''));
      }
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAiProcessing(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        await runTask('excel', 'Processing Excel', async () => {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(sheet);

          if (jsonData.length === 0) {
            toast.error('Sheet haina data!');
            return;
          }

          // Intelligent Column Detection
          const columnMap = await detectSpreadsheetColumns(jsonData.slice(0, 5));
          
          const newItems: PurchaseItem[] = jsonData.map((row: any) => {
            const name = String(row[columnMap.name] || '').trim();
            const units = Number(row[columnMap.stock] || 0);
            const cost = Number(row[columnMap.costPrice] || 0);
            const expiry = columnMap.expiryDate ? String(row[columnMap.expiryDate] || '') : undefined;
            
            if (!name) return null;

            const results = fuzzysort.go(name, products, { key: 'name', limit: 1 });
            const best = results[0];

            const itemBase = {
              name,
              costPrice: cost,
              stock: units,
              expiryDate: expiry
            };

            if (best && best.score > -500) {
              const p = best.obj as Product;
              return {
                ...itemBase,
                name: p.name,
                category: p.category,
                price: p.price,
                costPrice: cost || p.costPrice,
                productId: p.id,
                isNew: false
              };
            }

            return {
              ...itemBase,
              category: 'General',
              price: suggestPrice(cost),
              isNew: true
            };
          }).filter(Boolean) as PurchaseItem[];

          setPurchaseHistory(prev => [...newItems, ...prev]);
          toast.success(`Bidhaa ${newItems.length} zimeingizwa kutoka Excel!`);
        });
      } catch (err) {
        toast.error('Excel format haijaeleweka');
      } finally {
        setIsAiProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleEditItem = (idx: number) => {
    const item = purchaseHistory[idx];
    setQuickText(`${item.name} ${item.stock}`);
    setPurchaseHistory(prev => prev.filter((_, i) => i !== idx));
    textareaRef.current?.focus();
    toast.success('Imebeba kwenye Smart Input');
  };

  const processPurchaseImage = async (base64: string) => {
    setIsAiProcessing(true);
    try {
      await runTask('image', 'Scanning Receipt', async () => {
        const results = await scanReceiptForPurchases(base64);
        
        const processed = results.map(item => {
          const fs = fuzzysort.go(item.name, products, { key: 'name', limit: 1 });
          if (fs[0] && fs[0].score > -300) {
            const p = fs[0].obj as Product;
            return { ...item, name: p.name, productId: p.id, isNew: false };
          }
          return { ...item, isNew: true };
        });

        setPurchaseHistory(prev => [...processed, ...prev]);
        if (results.length === 0) {
          toast.error('Partner haijapata bidhaa yoyote kwenye risiti hii.');
        } else {
          toast.success(`Partner imegundua bidhaa ${results.length} kwenye risiti!`);
        }
      });
    } catch (err) {
      toast.error('Partner imeshindwa kusoma picha');
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedBase64 = await compressImage(file, 1600, 0.85);
      await processPurchaseImage(compressedBase64);
    } catch (err) {
      console.warn("Direct compression fallback:", err);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result as string;
          await processPurchaseImage(base64);
        };
        reader.readAsDataURL(file);
      } catch {
        setIsAiProcessing(false);
      }
    } finally {
      e.target.value = '';
    }
  };

  const saveAllItems = async () => {
    if (!activeBusiness?.id || purchaseHistory.length === 0) return;
    
    // Safety check for supplier credit
    if (paymentMode === 'credit' && !selectedSupplierId) {
      toast.error('Tafadhali chagua Supplier kwanza kwa ajili ya deni.');
      return;
    }

    setIsSaving(true);
    const loadingToast = toast.loading('Inahifadhi mzigo stoo...');
    
    // Sanitize items for Firestore
    const sanitizedItems = purchaseHistory.map(item => ({
      name: item.name || 'Unnamed Product',
      category: item.category || 'General',
      price: Number(item.price) || 0,
      costPrice: Number(item.costPrice) || 0,
      stock: Number(item.stock) || 0,
      expiryDate: item.expiryDate || null,
      productId: item.productId || null,
      isNew: !!item.isNew,
      unit: item.unit || 'pcs'
    }));

    const totalPurchaseAmount = sanitizedItems.reduce((sum, item) => sum + (item.costPrice * item.stock), 0);

    try {
      await runTransaction(db, async (transaction) => {
        // Create Purchase Log
        const logRef = doc(collection(db, 'purchases'));
        transaction.set(logRef, {
          businessId: activeBusiness.id,
          items: sanitizedItems,
          timestamp: new Date().toISOString(),
          total: totalPurchaseAmount,
          supplierId: selectedSupplierId || null,
          paymentMode: paymentMode
        });

        // Update Supplier Debt if credit
        if (paymentMode === 'credit' && selectedSupplierId) {
          const supplierRef = doc(db, 'suppliers', selectedSupplierId);
          transaction.update(supplierRef, {
            debtAmount: increment(totalPurchaseAmount)
          });
        }

        for (const item of sanitizedItems) {
          const updateData: any = {
            stock: increment(item.stock),
            costPrice: item.costPrice,
            price: item.price,
            updatedAt: new Date().toISOString()
          };
          
          if (item.expiryDate) {
            updateData.expiryDate = item.expiryDate;
          }

          if (item.productId) {
            // Update Existing
            const pRef = doc(db, 'products', item.productId);
            transaction.update(pRef, updateData);
          } else {
            // Create New
            const pColl = collection(db, 'products');
            const newPRef = doc(pColl);
            transaction.set(newPRef, {
              name: item.name,
              category: item.category,
              price: item.price,
              costPrice: item.costPrice,
              stock: item.stock,
              unit: item.unit,
              expiryDate: item.expiryDate,
              businessId: activeBusiness.id,
              updatedAt: new Date().toISOString()
            });
          }
        }
      });

      setPurchaseHistory([]);
      fetchPurchaseHistory();
      toast.success('Mzigo umehifadhiwa kikamilifu!', { id: loadingToast });
      triggerScreenFlash('success');
    } catch (err) {
      toast.error('Imeshindikana kuhifadhi', { id: loadingToast });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn(
      "space-y-10 font-sans pb-10 transition-colors duration-500 rounded-[48px] -m-10 p-10 min-h-screen",
      isDarkMode ? "bg-[#1C1C1E] text-white" : "bg-transparent text-black"
    )}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className={cn("text-4xl font-black tracking-tight", isDarkMode ? "text-white" : "text-black")}>Purchase</h2>
          <p className={isDarkMode ? "text-gray-400" : "text-gray-600"}>Ingiza mzigo mpya kwa kutumia Partner Scanner au Smart Excel</p>
        </motion.div>
        
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={cn(
              "apple-button-secondary flex items-center gap-2.5",
              isDarkMode && "bg-white/10 text-white border-white/10"
            )}
          >
            {isDarkMode ? "Light Mode" : "Premium Dark Mode"}
          </button>

          <label className={cn(
            "apple-button-secondary flex items-center gap-2.5 cursor-pointer",
            isDarkMode && "bg-white/10 text-white border-white/10"
          )}>
            <FileSpreadsheet size={18} />
            Smart Excel
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleExcelUpload} />
          </label>
          
          <label className={cn(
            "apple-button-secondary flex items-center gap-2.5 cursor-pointer",
            isDarkMode && "bg-white/10 text-white border-white/10"
          )}>
            <Camera size={18} />
            Image to purchase
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageCapture} />
          </label>

          <button
            onClick={() => setIsQrModalOpen(true)}
            className={cn(
              "apple-button-secondary bg-indigo-600 hover:bg-indigo-700 text-white border-transparent flex items-center gap-2.5 cursor-pointer shadow-md shadow-indigo-600/20",
              isDarkMode && "bg-indigo-600 text-white border-transparent"
            )}
          >
            <QrCode size={18} />
            Scan Risiti kwa Simu (QR)
          </button>

          <button 
            disabled={purchaseHistory.length === 0 || isSaving}
            onClick={saveAllItems}
            className="apple-button-primary bg-[#007AFF] text-white flex items-center gap-2.5 disabled:opacity-30"
          >
            {isSaving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
            Hifadhi Mzigo
          </button>
        </div>
      </div>

      {/* Supplier & Payment Selection */}
      <div className="flex flex-wrap gap-4 items-center mb-6">
        <div className="flex-1 min-w-[300px]">
          <label className={cn("text-[11px] font-bold uppercase tracking-widest mb-1.5 block", isDarkMode ? "text-white/40" : "text-black/40")}>Supplier / Msambazaji</label>
          <select
            value={selectedSupplierId}
            onChange={(e) => setSelectedSupplierId(e.target.value)}
            className={cn(
              "apple-input w-full",
              isDarkMode ? "bg-white/5 text-white border-white/10" : "bg-white border-black/[0.05]"
            )}
          >
            <option value="">Chagua Supplier (Orodha)</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name} (Deni: Tsh {s.debtAmount.toLocaleString()})</option>
            ))}
          </select>
        </div>
        
        <div className="w-56">
          <label className={cn("text-[11px] font-bold uppercase tracking-widest mb-1.5 block", isDarkMode ? "text-white/40" : "text-black/40")}>Njia ya Malipo</label>
          <select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as 'cash' | 'credit')}
            className={cn(
              "apple-input w-full",
              isDarkMode ? "bg-white/5 text-white border-white/10 font-bold" : "bg-white border-black/[0.05] font-bold",
              paymentMode === 'credit' && "text-[#FF3B30] border-[#FF3B30]/30 bg-[#FF3B30]/5"
            )}
          >
            <option value="cash">Papo hapo (Cash)</option>
            <option value="credit">Deni (Credit Purchase)</option>
          </select>
        </div>

        {paymentMode === 'credit' && (
          <div className="bg-[#FF3B30]/10 text-[#FF3B30] px-6 py-4 rounded-3xl flex items-center gap-3 text-sm font-bold animate-pulse">
            <AlertCircle size={18} />
            <span>Deni litaongezeka kwa huyu Supplier</span>
          </div>
        )}
      </div>

      {/* Main UI */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 h-[calc(100vh-280px)] min-h-[600px]">
        
        {/* Input Area */}
        <div className="lg:col-span-5 flex flex-col space-y-6 h-full">
          <div className={cn(
            "apple-card flex-1 p-8 flex flex-col relative overflow-hidden transition-colors",
            isDarkMode ? "bg-white/5 border-white/10 shadow-none" : "bg-white"
          )}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#007AFF]/10 text-[#007AFF] rounded-xl flex items-center justify-center">
                  <Keyboard size={20} />
                </div>
                <h3 className={cn("text-xl font-black tracking-tight uppercase tracking-[0.1em] text-[12px] font-bold", isDarkMode ? "text-white" : "text-black")}>Smart Input</h3>
              </div>
              <div className={cn(
                "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full",
                isDarkMode ? "bg-white/10 text-white/60" : "bg-gray-100 text-gray-400"
              )}>
                Enter to Add
              </div>
            </div>

            <div className="flex-1 flex flex-col relative">
              <textarea
                ref={textareaRef}
                autoFocus
                className={cn(
                  "w-full flex-1 bg-transparent text-xl font-bold placeholder-gray-300 outline-none resize-none leading-relaxed pb-12",
                  isDarkMode ? "text-white" : "text-black",
                  isProcessingAI && "opacity-50 pointer-events-none"
                )}
                placeholder="Mfano: Sukari 50&#10;Kuku 12"
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              
              <div className="absolute right-0 bottom-0 flex items-center gap-3">
                <button
                  disabled={isProcessingAI || isTyping}
                  className={cn(
                    "p-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 font-bold",
                    isDarkMode ? "bg-white/10 text-white" : "bg-[#007AFF] text-white",
                    (isProcessingAI || isTyping) && "opacity-50"
                  )}
                >
                  {(isProcessingAI || isTyping) ? <Loader2 className="animate-spin" size={20} /> : <Wand2 size={20} />}
                  <span className="hidden sm:inline">Partner</span>
                </button>
              </div>

              {/* Status Overlay */}
              {(isProcessingAI || isTyping) && (
                <div className="absolute inset-0 bg-black/5 backdrop-blur-[2px] rounded-2xl flex items-center justify-center z-50">
                  <div className="bg-white p-4 rounded-2xl shadow-2xl flex items-center gap-3">
                    <Loader2 className="animate-spin text-[#007AFF]" />
                    <span className="font-bold text-gray-600">Partner is typing...</span>
                  </div>
                </div>
              )}
              
              {/* Intelligent Suggestions */}
              <AnimatePresence>
                {suggestions.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className={cn(
                      "absolute left-0 right-0 bottom-0 shadow-2xl rounded-[28px] border p-2 flex flex-col z-10",
                      isDarkMode ? "bg-[#2C2C2E] border-white/10" : "bg-white border-black/[0.05]"
                    )}
                  >
                    {suggestions.map((p, i) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          const lines = quickText.split('\n');
                          const last = lines.pop()?.trim() || '';
                          const match = last.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
                          const units = match ? Number(match[2]) : 0;
                          addItemToHistory(p, units);
                          setQuickText(lines.join('\n') + (lines.length > 0 ? '\n' : ''));
                          textareaRef.current?.focus();
                        }}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-2xl transition-all group",
                          isDarkMode ? "hover:bg-white/5" : "hover:bg-[#007AFF]/5"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                            isDarkMode ? "bg-white/10 text-gray-400" : "bg-gray-100 text-gray-500"
                          )}>
                            <Plus size={18} />
                          </div>
                          <div className="text-left">
                            <p className={cn("font-bold text-[15px]", isDarkMode ? "text-white" : "text-black")}>{p.name}</p>
                            <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mt-0.5">{p.category}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[13px] font-bold text-[#007AFF]">Tsh {p.price.toLocaleString()}</p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Stoo: {p.stock}</p>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            
            {/* AI Processing Overlay */}
            <AnimatePresence>
              {(isAiProcessing || isTyping) && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    "absolute inset-0 backdrop-blur-md flex flex-col items-center justify-center z-20",
                    isDarkMode ? "bg-[#1C1C1E]/80" : "bg-white/80"
                  )}
                >
                  <Wand2 className="w-16 h-16 text-[#007AFF] animate-pulse mb-4" />
                  <p className={cn("text-xl font-black", isDarkMode ? "text-white" : "text-black")}>Partner is typing...</p>
                  <p className="text-sm text-gray-500 mt-2">Inatambua bidhaa na makundi</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* History / Review Area */}
        <div className="lg:col-span-7 flex flex-col space-y-6 h-full border-l border-black/[0.05] pl-10">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                isDarkMode ? "bg-white/5 text-white/40" : "bg-black/5 text-black/60"
              )}>
                <History size={20} />
              </div>
              <h3 className={cn("text-xl font-black tracking-tight uppercase tracking-[0.1em] text-[12px] font-bold", isDarkMode ? "text-white" : "text-black")}>Review Goods ({purchaseHistory.length})</h3>
            </div>
            {purchaseHistory.length > 0 && (
              <button 
                onClick={() => {
                  setPurchaseHistory([]);
                  toast.success('Orodha imesafishwa!');
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-black text-[#FF3B30] bg-[#FF3B30]/10 hover:bg-[#FF3B30]/20 rounded-xl transition-all"
              >
                <Trash2 size={16} />
                Delete All
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-4">
            {purchaseHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4 opacity-50">
                <ShoppingCart size={64} strokeWidth={1} />
                <p className="text-lg font-bold">Orodha yako iko tupu</p>
                <p className="text-sm">Tumia Smart Input au Scan kuanza</p>
              </div>
            ) : (
              purchaseHistory.map((item, idx) => (
                <motion.div 
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={idx}
                  className={cn(
                    "w-full rounded-3xl p-4 flex items-center justify-between group border transition-all duration-300",
                    isDarkMode 
                      ? "bg-white/5 border-white/10 hover:bg-white/10 shadow-none" 
                      : "bg-white/40 backdrop-blur-md border-white/60 shadow-sm hover:shadow-md"
                  )}
                >
                  <div className="flex items-center gap-5 flex-1 min-w-0">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                      item.isNew 
                        ? "bg-[#34C759]/10 text-[#34C759]" 
                        : "bg-black/[0.03] text-gray-400 group-hover:bg-[#007AFF]/10 group-hover:text-[#007AFF]"
                    )}>
                      {item.isNew ? <Plus size={22} /> : <CheckCircle2 size={22} />}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className={cn("font-display font-black text-lg leading-tight group-hover:text-[#007AFF] transition-colors", isDarkMode ? "text-white" : "text-[#1D1D1F]")}>
                          {item.name}
                        </h3>
                        {item.isNew && (
                          <span className="text-[9px] font-black uppercase tracking-widest bg-[#34C759] text-white px-2 py-0.5 rounded-full">New</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] text-[#86868B] font-black uppercase tracking-[0.1em] bg-black/[0.05] px-3 py-0.5 rounded-full">
                          {item.category}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] text-[#007AFF] font-bold uppercase tracking-widest leading-none">
                          <TrendingUp size={12} /> Sug: Tsh {suggestPrice(item.costPrice || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-10 flex-shrink-0">
                    {/* Quantity Control */}
                    <div className="flex flex-col items-end min-w-[140px]">
                      <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1.5 whitespace-nowrap text-right w-full">Kiasi</p>
                      <div className="flex items-center gap-2 bg-black/[0.03] rounded-2xl p-1">
                        <button 
                          onClick={() => {
                            const newHistory = [...purchaseHistory];
                            newHistory[idx].stock = Math.max(1, newHistory[idx].stock - 1);
                            setPurchaseHistory(newHistory);
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-xl bg-white border border-black/[0.05] shadow-sm active:translate-y-[1px] transition-all"
                        >
                          <Minus size={12} className="text-[#1D1D1F]" />
                        </button>
                        <input 
                          type="number"
                          className={cn(
                            "bg-transparent font-black text-lg w-14 text-center outline-none",
                            isDarkMode ? "text-white" : "text-black"
                          )}
                          value={item.stock}
                          onChange={(e) => {
                            const newHistory = [...purchaseHistory];
                            newHistory[idx].stock = Number(e.target.value);
                            setPurchaseHistory(newHistory);
                          }}
                        />
                        <button 
                          onClick={() => {
                            const newHistory = [...purchaseHistory];
                            newHistory[idx].stock = newHistory[idx].stock + 1;
                            setPurchaseHistory(newHistory);
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-xl bg-white border border-black/[0.05] shadow-sm active:translate-y-[1px] transition-all"
                        >
                          <Plus size={12} className="text-[#1D1D1F]" />
                        </button>
                      </div>
                    </div>

                    {/* Cost Control */}
                    <div className="flex flex-col items-end min-w-[160px]">
                      <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest mb-1.5 whitespace-nowrap text-right w-full">Gharama (Tsh)</p>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 font-black text-sm">Tsh</span>
                        <input 
                          type="number"
                          className={cn(
                            "bg-transparent font-black text-xl w-32 text-right outline-none focus:text-[#007AFF] transition-colors border-b-2 border-transparent focus:border-[#007AFF]/20",
                            isDarkMode ? "text-white" : "text-black"
                          )}
                          value={item.costPrice}
                          onChange={(e) => {
                            const newHistory = [...purchaseHistory];
                            newHistory[idx].costPrice = Number(e.target.value);
                            newHistory[idx].price = suggestPrice(Number(e.target.value));
                            setPurchaseHistory(newHistory);
                          }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleEditItem(idx)}
                        className="w-10 h-10 flex items-center justify-center text-gray-300 hover:text-[#007AFF] hover:bg-[#007AFF]/10 rounded-xl transition-all"
                        title="Edit in Smart Input"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => setPurchaseHistory(prev => prev.filter((_, i) => i !== idx))}
                        className="w-10 h-10 flex items-center justify-center text-[#FF3B30] bg-[#FF3B30]/10 hover:bg-[#FF3B30]/20 rounded-xl transition-all"
                        title="Futa Bidhaa"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bonus Features: Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-10 border-t border-black/[0.05]">
        <div className={cn(
          "apple-card p-6 flex items-center gap-6 group hover:translate-y-[-4px] transition-all col-span-2",
          isDarkMode ? "bg-white/5 border-white/10" : "bg-black text-white"
        )}>
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-[#FFD60A] group-hover:scale-110 transition-transform">
            <AlertCircle size={28} />
          </div>
          <div>
            <h4 className="text-lg font-black uppercase tracking-widest text-[12px] text-[#FFD60A]">Expiry Alerts</h4>
            {expiringProducts.length > 0 ? (
              <p className={isDarkMode ? "text-white/60 text-sm mt-1" : "text-white/60 text-sm mt-1"}>
                Bidhaa {expiringProducts.length} zinakaribia kuisha muda. Zikague sasa!
              </p>
            ) : (
              <p className={isDarkMode ? "text-white/60 text-sm mt-1" : "text-white/60 text-sm mt-1"}>
                Stoo iko salama. Hakuna bidhaa inayokaribia kuharibika.
              </p>
            )}
          </div>
        </div>
      </div>
      {/* Purchase History Section */}
      <div className="mt-20 space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#007AFF] text-white rounded-2xl flex items-center justify-center shadow-lg">
              <History size={24} />
            </div>
            <div>
              <h3 className="text-2xl font-black tracking-tight">Purchase History</h3>
              <p className="text-sm text-gray-500 font-medium">Rekodi za hivi karibuni za mzigo uliopokelewa</p>
            </div>
          </div>
          <button 
            onClick={fetchPurchaseHistory}
            className="p-3 hover:bg-black/5 rounded-2xl transition-all"
            title="Refresh History"
          >
            <Loader2 className={cn("text-[#007AFF]", isLoadingHistory && "animate-spin")} size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {pastPurchases.length === 0 ? (
            <div className="bg-white/50 backdrop-blur-md rounded-[32px] p-20 flex flex-col items-center justify-center text-gray-400 border border-black/[0.05]">
              <History size={48} className="mb-4 opacity-20" />
              <p className="font-bold">Hakuna rekodi za manunuzi bado</p>
            </div>
          ) : (
            pastPurchases.map((log: any) => (
              <div 
                key={log.id} 
                className={cn(
                  "rounded-[32px] overflow-hidden border transition-all",
                  isDarkMode ? "bg-white/5 border-white/10" : "bg-white border-black/[0.05] shadow-sm"
                )}
              >
                <div className="px-8 py-6 bg-black/[0.02] flex items-center justify-between border-b border-black/[0.05]">
                  <div className="flex items-center gap-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#007AFF]">Tarehe</span>
                      <span className="text-lg font-black">{format(parseISO(log.timestamp), 'dd MMM, yyyy')}</span>
                    </div>
                    <div className="w-px h-8 bg-black/[0.05]" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Value</span>
                      <span className="text-lg font-black">Tsh {log.total?.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="px-4 py-2 bg-[#F2F2F7] rounded-full text-[10px] font-black uppercase tracking-widest text-gray-500">
                    {log.items?.length} Items
                  </div>
                </div>
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-black/[0.03]">
                        <th className="px-4 py-3">Bidhaa</th>
                        <th className="px-4 py-3">Saa (Time)</th>
                        <th className="px-4 py-3">Idadi (Qty)</th>
                        <th className="px-4 py-3 text-right">Unit Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.02]">
                      {log.items?.map((item: any, i: number) => (
                        <tr key={i} className="hover:bg-black/[0.01] transition-colors">
                          <td className="px-4 py-4">
                            <span className="font-bold text-sm">{item.name}</span>
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-xs font-medium text-[#007AFF] bg-[#007AFF]/5 px-2 py-1 rounded-md">
                              {format(parseISO(log.timestamp), 'HH:mm')}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span className="font-bold text-sm">{item.stock}</span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className="font-bold text-sm text-gray-600">Tsh {item.costPrice?.toLocaleString()}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* QR Code Upload Modal for Purchases */}
      <QRUploadModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        target="purchase"
        title="Scan Risiti ya Manunuzi kwa Simu"
        subtitle="Elekeza kamera ya simu kwenye QR Code kupiga picha ya risiti au invoice ya manunuzi. Partner ataandika bidhaa zote kwenye manunuzi."
        onImageReceived={processPurchaseImage}
      />
    </div>
  );
};
