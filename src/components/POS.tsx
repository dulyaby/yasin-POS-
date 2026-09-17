import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  doc, 
  updateDoc, 
  increment,
  getDocs,
  runTransaction,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { Product, SaleItem, Customer, UnitType } from '../types';
import { useProducts } from '../context/ProductContext';
import { useLanguage } from '../context/LanguageContext';
import { Search, ShoppingCart, Trash2, Plus, Minus, CheckCircle, AlertTriangle, X, Receipt, Share2, Percent, Printer, Mic, MicOff, Loader2, Sparkles, Zap, History, Layers, UserPlus, CreditCard, Banknote, Smartphone, Package, Globe } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { triggerScreenFlash } from './ScreenFlash';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { differenceInDays, parseISO, format } from 'date-fns';
import { PinModal } from './PinModal';
import fuzzysort from 'fuzzysort';
import { processVoiceTranscript } from '../services/partnerAIService';
import { useAI } from '../context/AIContext';
import { buildAssociationMatrix, getRelatedProducts, AssociationMatrix } from '../services/recommendationEngine';
import { POSRelatedProducts } from './POSRelatedProducts';

import { handleFirestoreError, OperationType } from '../lib/firestore-utils';
import { logAuditEvent } from '../lib/auditLogger';

let audioCtxSingleton: AudioContext | null = null;

export const POS: React.FC = () => {
  const { profile, activeBusiness, currentStaff } = useAuth();
  const permissions = currentStaff?.permissions;
  const { products } = useProducts();
  const { startTask, endTask, isTyping } = useAI();
  const { language, setLanguage, toggleLanguage, t } = useLanguage();
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [detectedItem, setDetectedItem] = useState<{ product: Product; quantity: number } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState<string>('');
  
  // Partner AI state
  const [isListening, setIsListening] = useState(false);
  const isListeningRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const aiTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [aiTranscript, setAiTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [searchConfidence, setSearchConfidence] = useState<number | null>(null);

  // Staged found voice products queued for "cash" or "sale" command
  const stagedVoiceItemsRef = useRef<{ product: Product; quantity: number }[]>([]);
  const [stagedVoiceCount, setStagedVoiceCount] = useState<number>(0);

  // Keep isListeningRef in sync
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Clean unmount to prevent speech recognition running indefinitely
  useEffect(() => {
    return () => {
      stopVoiceAssistant();
    };
  }, []);

  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  
  const [overstockEnabled, setOverstockEnabled] = useState(false);
  const [overstocks, setOverstocks] = useState<any[]>([]);
  const [overstockHistory, setOverstockHistory] = useState<any[]>([]);
  const [showOverstockHistory, setShowOverstockHistory] = useState(false);

  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const cartRef = useRef<SaleItem[]>([]);

  // Security state
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'remove' | 'discount' | 'void' | 'price_override', data?: any } | null>(null);

  // Sync cartRef with cart state
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  // Receipt state
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [latestCartItemId, setLatestCartItemId] = useState<string | null>(null);
  const [todaySales, setTodaySales] = useState(0);

  // Historical purchasing association matrix for smart cross-sell suggestions
  const [associationMatrix, setAssociationMatrix] = useState<AssociationMatrix>({
    pairCounts: new Map(),
    singleCounts: new Map(),
    totalTransactions: 0
  });

  // Customer & Payment state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'm-pesa' | 'credit'>('cash');
  const [mobileNetworks, setMobileNetworks] = useState<string[]>(['M-Pesa', 'Tigo Pesa', 'Airtel Money', 'Halopesa']);
  const [selectedMobileNetwork, setSelectedMobileNetwork] = useState<string>('M-Pesa');
  const [showAddNetworkModal, setShowAddNetworkModal] = useState(false);
  const [newNetworkName, setNewNetworkName] = useState('');
  
  const [cardNames, setCardNames] = useState<string[]>(['Visa', 'Mastercard', 'CRDB', 'NMB', 'KCB']);
  const [selectedCardName, setSelectedCardName] = useState<string>('Visa');
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [newCardName, setNewCardName] = useState('');

  // Load custom networks and cards from local persistence
  useEffect(() => {
    if (!activeBusiness?.id) return;
    try {
      const savedNets = localStorage.getItem(`pos_mobile_networks_${activeBusiness.id}`);
      if (savedNets) {
        const parsed = JSON.parse(savedNets);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMobileNetworks(parsed);
          setSelectedMobileNetwork(parsed[0]);
        }
      }
      const savedCards = localStorage.getItem(`pos_card_names_${activeBusiness.id}`);
      if (savedCards) {
        const parsedCards = JSON.parse(savedCards);
        if (Array.isArray(parsedCards) && parsedCards.length > 0) {
          setCardNames(parsedCards);
          setSelectedCardName(parsedCards[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load saved payment options:', e);
    }
  }, [activeBusiness?.id]);

  const handleAddNetwork = () => {
    if (newNetworkName.trim()) {
      const name = newNetworkName.trim();
      let updated = mobileNetworks;
      if (!mobileNetworks.includes(name)) {
        updated = [...mobileNetworks, name];
        setMobileNetworks(updated);
        if (activeBusiness?.id) {
          try {
            localStorage.setItem(`pos_mobile_networks_${activeBusiness.id}`, JSON.stringify(updated));
          } catch (e) {
            console.error(e);
          }
        }
      }
      setSelectedMobileNetwork(name);
      setNewNetworkName('');
      setShowAddNetworkModal(false);
      toast.success(language === 'en' ? `Network "${name}" added!` : `Mtandao "${name}" umeongezwa!`);
    }
  };

  const handleAddCardName = () => {
    if (newCardName.trim()) {
      const name = newCardName.trim();
      let updated = cardNames;
      if (!cardNames.includes(name)) {
        updated = [...cardNames, name];
        setCardNames(updated);
        if (activeBusiness?.id) {
          try {
            localStorage.setItem(`pos_card_names_${activeBusiness.id}`, JSON.stringify(updated));
          } catch (e) {
            console.error(e);
          }
        }
      }
      setSelectedCardName(name);
      setNewCardName('');
      setShowAddCardModal(false);
      toast.success(language === 'en' ? `Card "${name}" added!` : `Kadi "${name}" imeongezwa!`);
    }
  };
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [isCustomerSelectionModalOpen, setIsCustomerSelectionModalOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  useEffect(() => {
    if (!activeBusiness?.id) return;
    
    // Fetch customers
    const customersQ = query(
      collection(db, 'customers'),
      where('businessId', '==', activeBusiness.id)
    );

    const unsubCustomers = onSnapshot(customersQ, (snap) => {
      const c: Customer[] = [];
      snap.forEach(doc => c.push({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(c);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const q = query(
      collection(db, 'sales'),
      where('businessId', '==', activeBusiness.id),
      where('timestamp', '>=', startOfDay.toISOString())
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let total = 0;
      snapshot.forEach((doc) => {
        total += doc.data().netTotal || 0;
      });
      setTodaySales(total);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sales');
    });

    // Fetch historical sales to build association patterns
    const historySalesQ = query(
      collection(db, 'sales'),
      where('businessId', '==', activeBusiness.id),
      limit(300)
    );

    const unsubHistorySales = onSnapshot(historySalesQ, (snapshot) => {
      const salesData: any[] = [];
      snapshot.forEach((doc) => {
        salesData.push({ id: doc.id, ...doc.data() });
      });
      setAssociationMatrix(buildAssociationMatrix(salesData));
    }, (error) => {
      console.warn("Could not fetch historical sales for recommendation engine:", error);
    });

    return () => {
      unsubscribe();
      unsubCustomers();
      unsubHistorySales();
    };
  }, [activeBusiness?.id]);

  // Fetch Overstocks
  useEffect(() => {
    if (!activeBusiness?.id) return;

    const q = query(
      collection(db, 'overstocks'),
      where('businessId', '==', activeBusiness.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOverstocks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOverstocks(allOverstocks);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'overstocks');
    });

    return () => unsubscribe();
  }, [activeBusiness?.id]);

  const playPopSound = () => {
    try {
      if (!audioCtxSingleton && typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) audioCtxSingleton = new AudioCtx();
      }
      if (audioCtxSingleton && audioCtxSingleton.state === 'suspended') {
        audioCtxSingleton.resume();
      }
      if (!audioCtxSingleton) return;

      const oscillator = audioCtxSingleton.createOscillator();
      const gainNode = audioCtxSingleton.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(600, audioCtxSingleton.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(200, audioCtxSingleton.currentTime + 0.08);

      gainNode.gain.setValueAtTime(0.3, audioCtxSingleton.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtxSingleton.currentTime + 0.08);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtxSingleton.destination);

      oscillator.start();
      oscillator.stop(audioCtxSingleton.currentTime + 0.08);
    } catch (e) {
      // Audio fallback safe
    }
  };

  const handlePrint58mm = () => {
    if (!lastSale || !activeBusiness) return;

    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (!printWindow) {
      toast.error('Tafadhali ruhusu pop-ups ili kuprint risiti');
      return;
    }

    const receiptHtml = `
      <html>
        <head>
          <title>Risiti - ${activeBusiness.name}</title>
          <style>
            @page { margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              width: 58mm; 
              margin: 0; 
              padding: 5mm; 
              font-size: 12px;
              line-height: 1.2;
              color: #000;
              background: #fff;
            }
            .center { text-align: center; }
            .bold { font-weight: bold; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .flex { display: flex; justify-content: space-between; }
            .header { margin-bottom: 15px; }
            .footer { margin-top: 20px; font-size: 10px; }
            .logo { font-size: 32px; color: #007AFF; margin-bottom: 8px; }
            .business-name { font-size: 18px; font-weight: bold; text-transform: uppercase; margin-bottom: 4px; }
            .item-list { margin: 10px 0; }
            .total-section { margin-top: 10px; }
            .success-badge { 
              display: inline-block; 
              padding: 2px 8px; 
              background: #007AFF; 
              color: white; 
              font-weight: bold; 
              border-radius: 4px;
              margin-top: 10px;
              font-size: 10px;
            }
          </style>
        </head>
        <body>
          <div class="center header">
            <div class="logo">★</div>
            <div class="business-name">${activeBusiness.name}</div>
            <div>${activeBusiness.address || 'Tanzania'}</div>
            <div>Tel: ${activeBusiness.phone || ''}</div>
          </div>
          
          <div class="divider"></div>
          
          <div class="flex">
            <span>Cashier:</span>
            <span class="bold">${profile?.displayName || 'N/A'}</span>
          </div>
          <div class="flex">
            <span>Date:</span>
            <span>${format(new Date(lastSale.timestamp), 'dd/MM/yy HH:mm')}</span>
          </div>
          <div class="flex">
            <span>Payment:</span>
            <span class="bold">${
              lastSale.paymentMethod === 'm-pesa' && lastSale.mobileNetwork
                ? `Simu (${lastSale.mobileNetwork})`
                : lastSale.paymentMethod === 'card' && lastSale.cardName
                ? `Kadi (${lastSale.cardName})`
                : lastSale.paymentMethod === 'credit'
                ? 'Deni'
                : lastSale.paymentMethod?.toUpperCase() || 'CASH'
            }</span>
          </div>
          <div class="flex">
            <span>ID:</span>
            <span>${lastSale.id.slice(-8).toUpperCase()}</span>
          </div>
          
          <div class="divider"></div>
          
          <div class="bold flex">
            <span>Item</span>
            <span>Total</span>
          </div>
          
          <div class="item-list">
            ${lastSale.items.map((item: any) => `
              <div class="flex">
                <span>${item.name} x${item.quantity}</span>
                <span>${(item.quantity * item.price).toLocaleString()}</span>
              </div>
            `).join('')}
          </div>
          
          <div class="divider"></div>
          
          <div class="total-section">
            <div class="flex">
              <span>Subtotal:</span>
              <span>${lastSale.total.toLocaleString()}</span>
            </div>
            ${lastSale.discount > 0 ? `
              <div class="flex">
                <span>Discount:</span>
                <span>-${lastSale.discount.toLocaleString()}</span>
              </div>
            ` : ''}
            <div class="flex bold" style="font-size: 14px; margin-top: 5px; border-top: 1px solid #000; padding-top: 5px;">
              <span>TOTAL:</span>
              <span>Tsh ${lastSale.netTotal.toLocaleString()}</span>
            </div>
          </div>
          
          <div class="center footer">
            <div class="success-badge">SUCCESS</div>
            <p style="margin-top: 15px; font-weight: bold;">Thank you for coming.<br>We are appreciate your sale</p>
            <p style="font-size: 8px; margin-top: 10px;">Powered by Biashara Smart</p>
          </div>
          
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(receiptHtml);
    printWindow.document.close();
  };

  const addToCart = (product: Product) => {
    addToCartWithQuantity(product, 1);
  };

  const addToCartWithQuantity = (product: Product, quantity: number) => {
    if (product.stock <= 0 && !overstockEnabled) {
      triggerScreenFlash('warning');
      toast.error('Bidhaa imeisha stoo!');
      return;
    }

    if (product.stock <= 0 && overstockEnabled) {
      toast.success(`Overstock: ${product.name}`, { icon: '⚠️' });
    }

    playPopSound();
    setLastAddedId(product.id);
    setLatestCartItemId(product.id);
    setTimeout(() => setLastAddedId(null), 1000);

    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => 
          item.productId === product.id 
            ? { ...item, quantity: Number((item.quantity + quantity).toFixed(3)) } 
            : item
        );
      }
      return [...prev, { 
        productId: product.id, 
        name: product.name, 
        price: product.price, 
        quantity: quantity,
        unit: product.unit || null
      }];
    });
  };

  // Dynamic cross-sell product suggestions based on historical purchasing patterns
  const relatedProducts = useMemo(() => {
    if (cart.length === 0) return [];
    return getRelatedProducts(
      cart.map(item => ({ productId: item.productId, name: item.name })),
      products,
      associationMatrix,
      {
        overstockEnabled,
        maxResults: 5,
        lastAddedProductId: latestCartItemId || lastAddedId,
        language: language === 'en' ? 'en' : 'sw'
      }
    );
  }, [cart, products, associationMatrix, overstockEnabled, latestCartItemId, lastAddedId, language]);

  const lastAddedProductName = useMemo(() => {
    const targetId = latestCartItemId || lastAddedId;
    if (!targetId) return null;
    const p = products.find(prod => prod.id === targetId);
    return p ? p.name : null;
  }, [latestCartItemId, lastAddedId, products]);

  // Handle Checkout Logic
  const handleCheckoutClick = () => {
    if (paymentMethod === 'credit' && !selectedCustomerId) {
      setIsCustomerSelectionModalOpen(true);
      return;
    }
    handleCheckout();
  };

  const removeFromCart = (productId: string, name: string) => {
    // IAM: Void permission check
    const canVoid = permissions?.void_transaction ?? true;
    if (!canVoid) {
      setPendingAction({ type: 'remove', data: { productId, name } });
      setPinModalOpen(true);
      return;
    }
    executeRemoveFromCart(productId, name);
  };

  const handleAddCustomer = async () => {
    if (!newCustomerName) return;
    if (!activeBusiness?.id) return;
    try {
      await addDoc(collection(db, 'customers'), {
        name: newCustomerName,
        phone: newCustomerPhone || null,
        totalDebt: 0,
        businessId: activeBusiness.id,
        createdAt: new Date().toISOString()
      });
      setNewCustomerName('');
      setNewCustomerPhone('');
      setCustomerModalOpen(false);
      toast.success('Mteja ameongezwa!');
    } catch (e) {
      toast.error('Imeshindwa kuongeza mteja');
    }
  };

  const executeRemoveFromCart = (productId: string, name: string) => {
    const item = cart.find(i => i.productId === productId);
    if (profile?.uid && activeBusiness?.id) {
      logAuditEvent({
        businessId: activeBusiness.id,
        type: 'void_item',
        category: 'void',
        title: `Kutoa Bidhaa Kapuni: ${name}`,
        details: `Bidhaa '${name}' ${item ? `(${item.quantity} ${item.unit || 'pcs'} @ Tsh ${item.price.toLocaleString()})` : ''} imeondolewa kwenye kapu kabla ya malipo na ${profile?.displayName || 'Cashier'}.`,
        cashierId: profile.uid,
        cashierName: profile?.displayName || 'Cashier',
        productId,
        productName: name,
        reason: 'Manual removal from cart'
      });
    }

    setCart(prev => prev.filter(item => item.productId !== productId));
  };

  const stopVoiceAssistant = () => {
    isListeningRef.current = false;
    setIsListening(false);
    setInterimTranscript('');

    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (aiTimeoutRef.current) {
      clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = null;
    }

    const rec = recognitionRef.current || (window as any).currentRecognition;
    if (rec) {
      try {
        rec.onend = null;
        rec.onerror = null;
        rec.onresult = null;
        rec.onstart = null;
        rec.abort();
      } catch (e) {
        console.debug('Recognition abort error:', e);
      }
      recognitionRef.current = null;
      (window as any).currentRecognition = null;
    }
  };

  const handleDiscount = () => {
    const canVoid = permissions?.void_transaction ?? true;
    if (!canVoid) {
      setPendingAction({ type: 'discount' });
      setPinModalOpen(true);
      return;
    }
    setDiscountModalOpen(true);
  };

  const applyDiscount = (type: 'percentage' | 'fixed', val: string) => {
    const numVal = parseFloat(val);
    if (isNaN(numVal)) {
      setDiscount(0);
      setDiscountModalOpen(false);
      return;
    }

    let calculatedDiscount = 0;
    if (type === 'percentage') {
      calculatedDiscount = (subtotal * numVal) / 100;
      setDiscount(calculatedDiscount);
    } else {
      calculatedDiscount = numVal;
      setDiscount(numVal);
    }

    if (calculatedDiscount > 0 && profile?.uid && activeBusiness?.id) {
      logAuditEvent({
        businessId: activeBusiness.id,
        type: 'manual_discount',
        category: 'discount',
        title: 'Kutoa Punguzo la Bei',
        details: `Punguzo la Tsh ${Math.round(calculatedDiscount).toLocaleString()} limetolewa kwa mteja kwenye mauzo na ${profile?.displayName || 'Cashier'}.`,
        cashierId: profile.uid,
        cashierName: profile?.displayName || 'Cashier',
        newValue: Math.round(calculatedDiscount)
      });
    }

    setDiscountModalOpen(false);
    setDiscountValue('');
  };


  const updateQuantity = (productId: string, delta: number) => {
    playPopSound();
    setLastAddedId(productId);
    setTimeout(() => setLastAddedId(null), 800);
    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        const step = item.unit === 'pcs' ? 1 : (item.unit === 'g' || item.unit === 'ml' ? 100 : 0.1);
        const actualDelta = delta > 0 ? step : -step;
        const newQty = Number(Math.max(step, item.quantity + actualDelta).toFixed(3));
        
        // IAM: Void permission check for reducing quantity
        const canVoid = permissions?.void_transaction ?? true;
        if (delta < 0 && item.quantity > step && !canVoid) {
          setPendingAction({ type: 'void', data: { productId, delta: actualDelta, name: item.name } });
          setPinModalOpen(true);
          return item;
        }

        if (delta < 0 && item.quantity > step && profile?.uid && activeBusiness?.id) {
          logAuditEvent({
            businessId: activeBusiness.id,
            type: 'void_item',
            category: 'void',
            title: `Kupunguza Idadi Kapuni: ${item.name}`,
            details: `Idadi ya '${item.name}' imepunguzwa kutoka ${item.quantity} kwenda ${newQty} na ${profile?.displayName || 'Cashier'}.`,
            cashierId: profile.uid,
            cashierName: profile?.displayName || 'Cashier',
            productId,
            productName: item.name,
            originalValue: item.quantity,
            newValue: newQty,
            reason: `Quantity reduced from ${item.quantity} to ${newQty}`
          });
        }
        
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const setQuantity = (productId: string, value: string) => {
    const newQty = value === '' ? 0 : parseFloat(value);
    if (isNaN(newQty)) return;

    setCart(prev => prev.map(item => {
      if (item.productId === productId) {
        // If reducing quantity significantly, check permissions
        if (newQty < item.quantity && newQty >= 0) {
          const canVoid = permissions?.void_transaction ?? true;
          if (!canVoid) {
            setPendingAction({ type: 'void', data: { productId, delta: newQty - item.quantity, name: item.name } });
            setPinModalOpen(true);
            return item;
          }

          if (profile?.uid && activeBusiness?.id) {
            logAuditEvent({
              businessId: activeBusiness.id,
              type: 'void_item',
              category: 'void',
              title: `Kubadilisha Idadi Kapuni: ${item.name}`,
              details: `Idadi ya '${item.name}' imebadilishwa kutoka ${item.quantity} kwenda ${newQty} na ${profile?.displayName || 'Cashier'}.`,
              cashierId: profile.uid,
              cashierName: profile?.displayName || 'Cashier',
              productId,
              productName: item.name,
              originalValue: item.quantity,
              newValue: newQty,
              reason: `Quantity manually changed from ${item.quantity} to ${newQty}`
            });
          }
        }
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0), [cart]);
  const total = useMemo(() => Math.round(Math.max(0, subtotal - discount)), [subtotal, discount]);

  const handleCheckout = async () => {
    const currentCart = cartRef.current;
    if (currentCart.length === 0) return;
    if (!profile?.uid || !activeBusiness?.id) {
      triggerScreenFlash('warning');
      toast.error('Kuna tatizo la session. Tafadhali jaribu tena.');
      return;
    }
    setLoading(true);

    try {
      const saleRef = doc(collection(db, 'sales'));
      let nextSaleNumber = 1;

      // Recalculate totals based on currentCart
      const subtotal = currentCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const total = Math.max(0, subtotal - discount);

      const saleData = await runTransaction(db, async (transaction) => {
        const bizRef = doc(db, 'businesses', activeBusiness.id);
        const bizDoc = await transaction.get(bizRef);
        
        if (bizDoc.exists()) {
          const currentLast = bizDoc.data()?.lastSaleNumber || 0;
          nextSaleNumber = (currentLast || 0) + 1;
          transaction.update(bizRef, { lastSaleNumber: nextSaleNumber });
        }

        const subtotal = currentCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const netTotal = Math.round(Math.max(0, subtotal - (discount || 0)));

        const sanitizedItems = currentCart.map(item => ({
          productId: item.productId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          unit: item.unit || null
        }));

        const newSaleData = {
          items: sanitizedItems,
          total: subtotal,
          discount: discount || 0,
          netTotal: netTotal,
          isDiscounted: (discount || 0) > 0,
          cashierId: profile.uid,
          businessId: activeBusiness.id,
          timestamp: new Date().toISOString(),
          saleNumber: nextSaleNumber,
          paymentMethod,
          mobileNetwork: paymentMethod === 'm-pesa' ? (selectedMobileNetwork || 'M-Pesa') : null,
          cardName: paymentMethod === 'card' ? (selectedCardName || 'Visa') : null,
          customerId: paymentMethod === 'credit' ? (selectedCustomerId || null) : null
        };

        transaction.set(saleRef, newSaleData);

        // Update customer debt if credit
        if (paymentMethod === 'credit' && selectedCustomerId) {
          const customerRef = doc(db, 'customers', selectedCustomerId);
          transaction.update(customerRef, {
            totalDebt: increment(netTotal)
          });

          const debtRef = doc(collection(db, 'customerDebts'));
          transaction.set(debtRef, {
            customerId: selectedCustomerId,
            amount: netTotal,
            saleId: saleRef.id,
            type: 'debt',
            timestamp: new Date().toISOString(),
            businessId: activeBusiness.id
          });
        }

        currentCart.forEach(item => {
          const productRef = doc(db, 'products', item.productId);
          const product = products.find(p => p.id === item.productId);
          
          if (product) {
            const overstockQty = overstockEnabled ? Math.max(0, item.quantity - product.stock) : 0;
            if (overstockQty > 0) {
              const overstockRef = doc(collection(db, 'overstocks'));
              transaction.set(overstockRef, {
                productId: item.productId,
                productName: item.name,
                quantity: overstockQty,
                value: overstockQty * item.price,
                timestamp: new Date().toISOString(),
                businessId: activeBusiness.id
              });
            }
          }

          transaction.update(productRef, {
            stock: increment(-item.quantity),
            updatedAt: new Date().toISOString()
          });
        });

        return newSaleData;
      });

      setLastSale({ ...saleData, id: saleRef.id });
      setShowReceipt(true);
      setCart([]);
      setDiscount(0);
      setSelectedCustomerId(null);
      setPaymentMethod('cash');
      cartRef.current = []; // Sync ref
      triggerScreenFlash('success');
      toast.success('Malipo yamekamilika!');
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'sales/checkout');
    } finally {
      setLoading(false);
    }
  };

  const handlePinSuccess = () => {
    if (!pendingAction) return;

    if (pendingAction.type === 'remove') {
      executeRemoveFromCart(pendingAction.data.productId, pendingAction.data.name);
    } else if (pendingAction.type === 'discount') {
      setDiscountModalOpen(true);
    } else if (pendingAction.type === 'void') {
      const { productId, delta, name } = pendingAction.data;
      const item = cart.find(i => i.productId === productId);
      if (item && profile?.uid && activeBusiness?.id) {
        const newQty = Math.max(1, item.quantity + delta);
        logAuditEvent({
          businessId: activeBusiness.id,
          type: 'void_item',
          category: 'void',
          title: `Kupunguza Idadi Kapuni: ${name}`,
          details: `Idadi ya '${name}' imepunguzwa kutoka ${item.quantity} kwenda ${newQty} baada ya uthibitisho wa PIN na ${profile?.displayName || 'Cashier'}.`,
          cashierId: profile.uid,
          cashierName: profile?.displayName || 'Cashier',
          productId,
          productName: name,
          originalValue: item.quantity,
          newValue: newQty
        });

        setCart(prev => prev.map(i => i.productId === productId ? { ...i, quantity: newQty } : i));
      }
    } else if (pendingAction.type === 'price_override') {
      const { productId, name, originalPrice } = pendingAction.data;
      const amount = prompt(`Weka bei mpya ya ${name} (Bei ya sasa: Tsh ${originalPrice.toLocaleString()}):`);
      if (amount && !isNaN(Number(amount)) && profile?.uid && activeBusiness?.id) {
        const newPrice = Number(amount);
        logAuditEvent({
          businessId: activeBusiness.id,
          type: 'price_change',
          category: 'price',
          title: `Kubadilisha Bei ya Bidhaa: ${name}`,
          details: `Bei ya '${name}' imebadilishwa kwenye kapu kutoka Tsh ${originalPrice.toLocaleString()} kwenda Tsh ${newPrice.toLocaleString()} na ${profile?.displayName || 'Cashier'}.`,
          cashierId: profile.uid,
          cashierName: profile?.displayName || 'Cashier',
          productId,
          productName: name,
          originalPrice,
          newPrice,
          notifyCeo: true
        });

        setCart(prev => prev.map(i => i.productId === productId ? { ...i, price: newPrice } : i));
      }
    }
    setPendingAction(null);
  };

  const startVoiceAssistant = () => {
    // If already running or previous instance exists, abort cleanly first
    stopVoiceAssistant();

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      toast.error('Browser yako haisupport voice input.');
      return;
    }

    // Reset staged voice items for new session
    stagedVoiceItemsRef.current = [];
    setStagedVoiceCount(0);
    isListeningRef.current = true;
    setIsListening(true);
    setAiTranscript('Sikiliza...');

    const recognition = new SpeechRecognition();
    recognition.lang = 'sw-TZ,en-US';
    recognition.continuous = true; 
    recognition.interimResults = true; // REAL-TIME SEARCHING

    recognition.onstart = () => {
      isListeningRef.current = true;
      setIsListening(true);
      setAiTranscript('Sikiliza...');
    };

    recognition.onresult = (event: any) => {
      if (!isListeningRef.current) return;

      // Inactivity timeout: 30 seconds of no speech resets listening automatically
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        stopVoiceAssistant();
      }, 30 * 1000);

      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (interim) {
        setInterimTranscript(interim);
        // Instant search update for the UI while speaking
        setSearchQuery(interim);
      }

      if (final) {
        setInterimTranscript('');
        setAiTranscript(final);
        processVoiceCommand(final);
      }
    };

    recognition.onerror = (event: any) => {
      if (!isListeningRef.current) return;
      if (event.error === 'no-speech') {
        // Normal non-fatal event when no speech is detected; silently wait or log debug
        console.debug('Speech recognition: no-speech detected, continuing...');
        return;
      }
      if (event.error === 'aborted') {
        console.debug('Speech recognition: aborted');
        return;
      }
      if (event.error === 'not-allowed') {
        toast.error('Ruhusu ufikiaji wa microphone kwenye browser yako.');
        stopVoiceAssistant();
      } else if (event.error === 'network') {
        toast.error('Tatizo la internet kwenye utambuzi wa sauti.', { icon: '🌐' });
        stopVoiceAssistant();
      } else {
        console.warn(`Speech recognition warning: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Only keep listening seamlessly if user has not manually stopped
      if (isListeningRef.current && recognitionRef.current) {
        try { 
          recognition.start(); 
        } catch (e) { 
          console.debug('Recognition restart:', e); 
        }
      } else {
        setIsListening(false);
        setInterimTranscript('');
      }
    };

    recognitionRef.current = recognition;
    (window as any).currentRecognition = recognition;

    try {
      recognition.start();
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
      stopVoiceAssistant();
      toast.error('Imeshindikana kuwasha sauti, jaribu tena.');
      return;
    }
    
    // Auto stop after 30 seconds of inactivity if nothing spoken
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      stopVoiceAssistant();
    }, 30 * 1000);
  };

  // Handle voice actions from AI or local matching
  const handleVoiceAction = (data: any) => {
    switch (data.action) {
      case 'ADD_ITEM':
        data.data.forEach((d: any) => {
          const matchedProduct = products.find(p => p.name.toLowerCase() === d.raw_input?.toLowerCase());
          if (matchedProduct) {
            let finalQty = d.qty || 1;
            // Unit conversion logic
            if (d.unit === 'g' && matchedProduct.unit === 'kg') finalQty = finalQty / 1000;
            if (d.unit === 'ml' && matchedProduct.unit === 'L') finalQty = finalQty / 1000;
            
            addToCartWithQuantity(matchedProduct, finalQty);
            toast.success(`Nimeongeza: ${matchedProduct.name} (${finalQty}${matchedProduct.unit})`);
          } else {
            const matches = fuzzysort.go(d.raw_input || '', products, { key: 'name' });
            if (matches.length > 0) {
              let finalQty = d.qty || 1;
              const p = matches[0].obj;
              if (d.unit === 'g' && p.unit === 'kg') finalQty = finalQty / 1000;
              if (d.unit === 'ml' && p.unit === 'L') finalQty = finalQty / 1000;

              addToCartWithQuantity(p, finalQty);
              toast.success(`Nimeongeza: ${p.name} (${finalQty}${p.unit})`);
            }
          }
        });
        break;
      case 'REMOVE_ITEM':
        data.data.forEach((d: any) => {
          const inCart = cartRef.current.find(c => c.name.toLowerCase().includes(d.raw_input?.toLowerCase() || ''));
          if (inCart) removeFromCart(inCart.productId, inCart.name);
        });
        break;
      case 'CLEAR_CART':
        if (cartRef.current.length > 0 && activeBusiness?.id && profile?.uid) {
          const itemsSummary = cartRef.current.map(i => `${i.quantity}x ${i.name}`).join(', ');
          const totalVal = cartRef.current.reduce((s, i) => s + (i.price * i.quantity), 0);
          logAuditEvent({
            businessId: activeBusiness.id,
            type: 'clear_cart',
            category: 'void',
            title: 'Kufuta Kapu Lote (Voice Command)',
            details: `Kapu zima la bidhaa ${cartRef.current.length} lenye thamani ya Tsh ${totalVal.toLocaleString()} limefutwa kwa sauti na ${profile?.displayName || 'Cashier'}. Bidhaa: ${itemsSummary}`,
            cashierId: profile.uid,
            cashierName: profile?.displayName || 'Cashier',
            originalValue: totalVal,
            notifyCeo: true
          });
        }
        setCart([]);
        setDiscount(0);
        toast.success('Gari imesafishwa!');
        break;
      case 'PROCESS_PAYMENT':
        if (cartRef.current.length > 0) {
          handleCheckout();
        } else {
          toast.error('Gari ni tupu!');
        }
        break;
      case 'SELL_SPECIFIC':
        data.data.forEach((d: any) => {
          const matches = fuzzysort.go(d.raw_input || '', products, { key: 'name' });
          if (matches.length > 0) {
            let finalQty = d.qty || 1;
            const p = matches[0].obj;
            if (d.unit === 'g' && p.unit === 'kg') finalQty = finalQty / 1000;
            if (d.unit === 'ml' && p.unit === 'L') finalQty = finalQty / 1000;

            addToCartWithQuantity(p, finalQty);
            setTimeout(handleCheckout, 300);
          }
        });
        break;
      case 'APPLY_DISCOUNT':
        if (data.data[0]?.value) {
          setDiscount(data.data[0].value);
          toast.success(`Punguzo la ${data.data[0].value}% limewekwa`);
        }
        break;
    }
  };

  // Helper to extract quantities and clean product search name
  const extractQtyAndName = (text: string) => {
    let clean = text.trim();
    clean = clean.replace(/^(niletee|weka|ongeza|nataka|naomba|tafuta|lete|nipatie|nipe|chagua|add|put|find)\s+/i, '').trim();

    const swahiliNums: Record<string, number> = {
      'nusu': 0.5,
      'moja': 1,
      'mbili': 2,
      'tatu': 3,
      'nne': 4,
      'tano': 5,
      'sita': 6,
      'saba': 7,
      'nane': 8,
      'tisa': 9,
      'kumi': 10,
    };

    let qty = 1;
    
    // Pattern: "2 unga" or "unga 2"
    const leadingNumMatch = clean.match(/^(\d+(?:\.\d+)?)\s+(.*)$/);
    if (leadingNumMatch) {
      qty = parseFloat(leadingNumMatch[1]);
      clean = leadingNumMatch[2].trim();
    } else {
      const trailingNumMatch = clean.match(/^(.*?)\s+(\d+(?:\.\d+)?)$/);
      if (trailingNumMatch) {
        clean = trailingNumMatch[1].trim();
        qty = parseFloat(trailingNumMatch[2]);
      } else {
        for (const [word, val] of Object.entries(swahiliNums)) {
          const regexLeading = new RegExp(`^${word}\\s+(.*)$`, 'i');
          const regexTrailing = new RegExp(`^(.*?)\\s+${word}$`, 'i');
          if (regexLeading.test(clean)) {
            qty = val;
            clean = clean.replace(regexLeading, '$1').trim();
            break;
          } else if (regexTrailing.test(clean)) {
            qty = val;
            clean = clean.replace(regexTrailing, '$1').trim();
            break;
          }
        }
      }
    }

    const query = clean.replace(/\b(kilo|kg|lita|litre|pcs|chupa|pakiti|katoni|mfuko|katon)\b/gi, '').trim();
    return { qty: qty > 0 ? qty : 1, query: query || clean };
  };

  const processVoiceCommand = async (transcript: string) => {
    const rawT = transcript.toLowerCase().trim();
    if (!rawT) return;
    setAiTranscript(transcript);

    // 1. CASH / SALE Command Detection: Transfer all found products to cart
    const isCashCommand = /^(cash|lipa|malipo|pesa)$/i.test(rawT) || /\b(cash|lipa|pesa)\b/i.test(rawT);
    const isSaleCommand = /^(sale|uza|mauzo|kamilisha|checkout)$/i.test(rawT) || /\b(sale|uza|checkout)\b/i.test(rawT);

    if (isCashCommand || isSaleCommand) {
      const itemsToPush: { product: Product; quantity: number }[] = [...stagedVoiceItemsRef.current];

      // Also gather any products matching current searchQuery if not yet queued
      const currentQuery = searchQuery.trim().toLowerCase();
      if (currentQuery) {
        const matchingCurrent = products.filter(p => 
          p.name.toLowerCase().includes(currentQuery) || 
          p.category.toLowerCase().includes(currentQuery)
        );
        if (matchingCurrent.length > 0) {
          matchingCurrent.slice(0, 5).forEach(prod => {
            if (!itemsToPush.some(i => i.product.id === prod.id)) {
              itemsToPush.push({ product: prod, quantity: 1 });
            }
          });
        }
      }

      if (itemsToPush.length > 0) {
        // Send all found products to the cart!
        itemsToPush.forEach(item => {
          addToCartWithQuantity(item.product, item.quantity);
        });
        const totalItemsCount = itemsToPush.length;
        stagedVoiceItemsRef.current = [];
        setStagedVoiceCount(0);
        setSearchQuery('');
        toast.success(`Bidhaa zote zilizopatikana (${totalItemsCount}) zimepelekwa kwenye gari!`, {
          icon: '🛒',
          duration: 3500
        });

        if (isCashCommand) {
          setPaymentMethod('cash');
          setTimeout(() => {
            if (cartRef.current.length > 0) {
              handleCheckout();
            }
          }, 300);
        }
        return;
      } else {
        // No new items to push, check if cart already has items
        if (cartRef.current.length > 0) {
          if (isCashCommand) {
            setPaymentMethod('cash');
            handleCheckout();
          } else {
            toast.success('Bidhaa zipo kwenye gari tayari kwa mauzo!');
          }
          return;
        } else {
          toast.error('Hakuna bidhaa zilizopatikana za kuweka kwenye gari!');
          return;
        }
      }
    }

    // 2. Clear / Reset command
    if (/^(clear|cancel|reset|futa zote|ondoa zote)$/i.test(rawT)) {
      stagedVoiceItemsRef.current = [];
      setStagedVoiceCount(0);
      setSearchQuery('');
      toast.success('Orodha ya sauti imesafishwa!');
      return;
    }

    // 3. Remove single item
    if (/^(delete|remove|futa|ondoa|void)\s+(.+)$/i.test(rawT)) {
      const itemToDelete = rawT.replace(/^(delete|remove|futa|ondoa|void)\s+/i, '').trim();
      const inCart = cartRef.current.find(c => c.name.toLowerCase().includes(itemToDelete));
      if (inCart) {
        removeFromCart(inCart.productId, inCart.name);
        toast.success(`Imeondolewa: ${inCart.name}`);
        setSearchQuery('');
        return;
      }
    }

    // 4. Searching product in store inventory:
    // Write spoken product name into the search bar so user sees live search results
    setSearchQuery(transcript);

    // Support single or multiple items (e.g. "panadol na sabuni")
    const phrases = rawT.split(/\s+na\s+|,\s*/i).map(s => s.trim()).filter(Boolean);

    for (const phrase of phrases) {
      const { qty, query } = extractQtyAndName(phrase);
      const searchTarget = (query || phrase).toLowerCase();

      // Find in inventory
      const directMatches = products.filter(p => 
        p.name.toLowerCase() === searchTarget ||
        p.name.toLowerCase().includes(searchTarget) || 
        searchTarget.includes(p.name.toLowerCase()) ||
        (p.barcode && p.barcode.toLowerCase() === searchTarget)
      );

      const fuzzyMatches = fuzzysort.go(searchTarget, products, { key: 'name', threshold: -3500 });
      const bestProduct: Product | null = directMatches.length > 0 
        ? directMatches[0] 
        : (fuzzyMatches.length > 0 ? fuzzyMatches[0].obj : null);

      if (!bestProduct) {
        // POS IKAIKOSA IYO BIDHAA:
        // Asiendeelee kushughulikia mazungumzo! (Do NOT call Gemini deep AI conversation)
        // Atoe notification kuwa bidhaa haipo, wakati huo anaendelea kusikiliza!
        toast.error(`Bidhaa "${phrase}" haipo kwenye stoo!`, {
          icon: '⚠️',
          id: `missing-${phrase.slice(0, 15)}`,
          duration: 3500
        });
        triggerScreenFlash('warning');
        setAiTranscript(`Bidhaa "${phrase}" haipo`);
      } else {
        // POS IMEIPATA BIDHAA:
        // Hifadhi kwenye bidhaa zilizopatikana (staged items)
        const existingIdx = stagedVoiceItemsRef.current.findIndex(i => i.product.id === bestProduct.id);
        if (existingIdx >= 0) {
          stagedVoiceItemsRef.current[existingIdx].quantity += qty;
        } else {
          stagedVoiceItemsRef.current.push({ product: bestProduct, quantity: qty });
        }
        setStagedVoiceCount(stagedVoiceItemsRef.current.length);

        toast.success(`Imepatikana: ${bestProduct.name} (${qty}) - Sema "cash" au "sale" kupeleka kwenye gari`, {
          icon: '✅',
          id: `found-${bestProduct.id}`,
          duration: 3500
        });
        setAiTranscript(`Imepatikana: ${bestProduct.name}`);
      }
    }
  };

  const processBulkSales = () => {
    if (!bulkText.trim()) return;
    const lines = bulkText.split('\n');
    let addedCount = 0;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const match = trimmed.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
      const name = match ? match[1].trim() : trimmed;
      const qty = match ? Number(match[2]) : 1;

      const results = fuzzysort.go(name, products, { key: 'name', limit: 1 });
      if (results.length > 0) {
        const product = results[0].obj;
        addToCartWithQuantity(product, qty);
        addedCount++;
      } else {
        toast.error(`"${name}" haipo!`, { duration: 1500 });
      }
    });

    if (addedCount > 0) {
      toast.success(`Imeongezwa bidhaa ${addedCount}`);
      setBulkText('');
      setIsBulkMode(false);
    }
  };

  const [visibleLimit, setVisibleLimit] = useState(40);

  useEffect(() => {
    setVisibleLimit(40);
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      setDetectedItem(null);
      return;
    }

    const timer = setTimeout(() => {
      // Regex: name + quantity + unit (optional)
      const match = searchQuery.match(/^([a-zA-Z\s]+?)(\d+(?:\.\d+)?)\s*(kg|g|liter|l|ml|pcs)?$/i);
      
      let nameToSearch = searchQuery;
      let quantity = 1;

      if (match) {
        nameToSearch = match[1].trim();
        quantity = Number(match[2]);
      }

      // Fuzzy matching
      const results = fuzzysort.go(nameToSearch, products, { 
        key: 'name',
        limit: 5,
        threshold: -1000 
      });

      const bestMatches = results.map(r => r.obj as Product);
      setSuggestions(bestMatches);

      if (bestMatches.length > 0 && match) {
        setDetectedItem({ product: bestMatches[0], quantity });
      } else {
        setDetectedItem(null);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [searchQuery, products]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (detectedItem) {
        addToCartWithQuantity(detectedItem.product, detectedItem.quantity);
        setSearchQuery('');
      } else if (suggestions.length > 0) {
        addToCart(suggestions[0]);
        setSearchQuery('');
      }
    }
  };

  const handleSuggestionClick = (product: Product) => {
    addToCart(product);
    setSearchQuery('');
    setSuggestions([]);
  };

  const categories = useMemo(() => Array.from(new Set(products.map(p => p.category))), [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q && !selectedCategory) return products;
    return products.filter(p => {
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
      const matchesCategory = !selectedCategory || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  const displayedProducts = useMemo(() => {
    if (searchQuery.trim()) {
      return filteredProducts.slice(0, 100);
    }
    return filteredProducts.slice(0, visibleLimit);
  }, [filteredProducts, searchQuery, visibleLimit]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-screen lg:h-screen font-sans bg-[#F5F5F7] p-3 md:p-4 relative overflow-hidden">
      {/* Products Section */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10 space-y-4">
        {/* Daily Insight Header - Compact */}
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 items-stretch md:items-center justify-between">
          <div className="flex-1 flex items-center gap-4 apple-card p-4">
            <div className="w-10 h-10 bg-[#34C759]/10 rounded-xl flex items-center justify-center text-[#34C759]">
              <CheckCircle size={20} />
            </div>
            <div>
              <p className="text-[10px] text-[#86868B] font-bold uppercase tracking-[0.1em] mb-0.5">{t('pos_today_sales', 'Mauzo ya Leo')}</p>
              <h3 className="text-xl font-display font-black text-[#1D1D1F]">Tsh {todaySales.toLocaleString()}</h3>
            </div>
          </div>

          {/* Language Switcher Card in POS Header - Compact Single Toggle */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="apple-card p-3 md:p-4 flex items-center justify-between gap-3 shrink-0 hover:border-[#007AFF]/40 transition-all text-left cursor-pointer group"
            title={language === 'sw' ? 'Badili kuwa English' : 'Badili kuwa Kiswahili'}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 bg-[#007AFF]/10 group-hover:bg-[#007AFF]/20 rounded-xl flex items-center justify-center text-[#007AFF] transition-colors">
                <Globe size={20} />
              </div>
              <div>
                <p className="text-[9px] text-[#86868B] font-bold uppercase tracking-[0.1em] mb-0.5">
                  {t('pos_language_select', 'Lugha / Language')}
                </p>
                <p className="text-xs font-black text-[#1D1D1F]">
                  {language === 'sw' ? '🇹🇿 Kiswahili' : '🇬🇧 English'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/[0.05] group-hover:bg-[#007AFF] group-hover:text-white text-xs font-black transition-all">
              <span>{language === 'sw' ? '🇬🇧 English' : '🇹🇿 Kiswahili'}</span>
            </div>
          </button>
          
          <motion.div
            initial={false}
            animate={{ 
              backgroundColor: overstockEnabled ? "rgba(255, 255, 255, 0.95)" : "rgba(255, 255, 255, 0.8)",
            }}
            whileHover={{ scale: 1.01, transition: { duration: 0.2 } }}
            className={cn(
              "flex-1 apple-card p-4 cursor-pointer group transition-all duration-500 luxury-3d-card relative overflow-hidden",
              overstockEnabled && "ring-1 ring-[#007AFF]/20 overstock-active"
            )}
            onClick={() => setOverstockEnabled(!overstockEnabled)}
          >
            <div className="flex items-center justify-between relative z-10 h-full">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <motion.div 
                    animate={{ 
                      rotate: overstockEnabled ? 180 : 0,
                      scale: overstockEnabled ? 1.02 : 1,
                    }}
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-700 relative z-10",
                      overstockEnabled 
                        ? "bg-gradient-to-br from-[#007AFF] to-[#5856D6] text-white shadow-lg shadow-[#007AFF]/20" 
                        : "bg-[#F2F2F7] text-[#86868B]"
                    )}
                  >
                    <Layers size={18} strokeWidth={2.5} />
                  </motion.div>
                  {overstockEnabled && (
                    <motion.div 
                      layoutId="overstock-glow-lux"
                      className="absolute inset-0 bg-[#007AFF]/20 blur-xl rounded-full"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    />
                  )}
                </div>
                
                <div className="flex flex-col">
                  <span className="text-[9px] text-[#86868B] font-bold uppercase tracking-[0.15em] mb-0.5" style={{ fontFamily: '-apple-system, "SF Pro Display", sans-serif' }}>
                    {t('pos_overstock', 'Overstock')}
                  </span>
                  <motion.div className="flex flex-col">
                    <span className={cn(
                      "text-[14px] font-black tracking-tight transition-colors duration-500",
                      overstockEnabled ? "text-[#007AFF]" : "text-[#1D1D1F]"
                    )} style={{ fontFamily: '-apple-system, "SF Pro Display", sans-serif' }}>
                      {overstockEnabled ? t('pos_overstock_enabled', 'IMEWASHWA') : t('pos_overstock_disabled', 'IMEZIMWA')}
                    </span>
                  </motion.div>
                </div>
              </div>

              {/* Advanced 3D Toggle Switch - Scaled Down */}
              <div className="relative w-14 h-7 toggle-slot-inner">
                <div className="neon-glow-ring" />
                <motion.div
                  className="absolute inset-0.5 rounded-full"
                  animate={{
                    x: overstockEnabled ? 28 : 0,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 25,
                    mass: 1
                  }}
                >
                  <motion.div 
                    className={cn(
                      "w-6 h-[calc(100%-2px)] rounded-[10px] relative top-[1px] left-[1px] transition-all duration-500",
                      overstockEnabled ? "mesh-gradient-luxury shadow-lg" : "brushed-aluminum"
                    )}
                    animate={{
                      scale: overstockEnabled ? 1.02 : 1,
                      boxShadow: overstockEnabled 
                        ? "0 4px 8px rgba(0, 122, 255, 0.3), inset 0 1px 0 0 rgba(255, 255, 255, 0.4)" 
                        : "0 1px 2px rgba(0, 0, 0, 0.1), inset 0 1px 0 0 rgba(255, 255, 255, 0.3)"
                    }}
                  >
                    <div className="absolute inset-0 rounded-[10px] frosted-glass-lux opacity-40" />
                    
                    <motion.div 
                      className="absolute inset-0 flex items-center justify-center"
                      animate={{ opacity: overstockEnabled ? 1 : 0.3 }}
                    >
                      <div className={cn(
                        "w-0.5 h-2 rounded-full",
                        overstockEnabled ? "bg-white" : "bg-[#86868B]/40"
                      )} />
                    </motion.div>
                  </motion.div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="space-y-4">
          <div className="relative group flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isListening) {
                      stopVoiceAssistant();
                    } else {
                      startVoiceAssistant();
                    }
                  }}
                  className={cn(
                    "relative !py-3 !px-6 flex items-center gap-2.5 rounded-2xl text-white font-bold transition-all duration-300 select-none cursor-pointer overflow-hidden",
                    isListening 
                      ? "ai-speak-btn-listening scale-[1.02] ring-2 ring-[#FF3B30]/50" 
                      : "ai-speak-btn"
                  )}
                  title={isListening ? "Bonyeza kusitisha usikilizaji (Stop)" : "Bonyeza kuuza kwa sauti (Speak to Sale)"}
                >
                  {isListening ? (
                    <>
                      {/* Smooth AI Soundwave Equalizer */}
                      <div className="flex items-center gap-1 h-5 px-0.5">
                        <span className="ai-wave-bar" />
                        <span className="ai-wave-bar" />
                        <span className="ai-wave-bar" />
                        <span className="ai-wave-bar" />
                      </div>
                      <span className="font-display font-black tracking-tight text-xs uppercase">
                        Listening...
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} className="text-white/90 shrink-0" />
                      <span className="font-display font-black tracking-tight text-xs uppercase">
                        Speak to Sale
                      </span>
                    </>
                  )}
                </button>

                {/* Found items counter & quick cart transfer pill */}
                {stagedVoiceCount > 0 && (
                  <button
                    type="button"
                    onClick={() => processVoiceCommand('sale')}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-[#007AFF] to-[#5856D6] text-white text-xs font-bold shadow-md shadow-[#007AFF]/25 transition-all hover:scale-105 cursor-pointer animate-pulse"
                    title="Bonyeza au sema 'sale' au 'cash' kupeleka bidhaa kwenye gari"
                  >
                    <ShoppingCart size={14} className="shrink-0" />
                    <span>{stagedVoiceCount} Zimepatikana (Sema 'cash' au 'sale')</span>
                  </button>
                )}

                {/* Real-time Voice Status Pills */}
                {isListening && interimTranscript && (
                  <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/95 backdrop-blur-md border border-[#8B5CF6]/30 text-xs font-bold text-[#1D1D1F] shadow-sm animate-pulse">
                    <Mic size={14} className="text-[#8B5CF6] shrink-0" />
                    <span className="truncate max-w-[260px]">"{interimTranscript}..."</span>
                  </div>
                )}
                {isProcessingAI && (
                  <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/95 backdrop-blur-md border border-[#007AFF]/30 text-xs font-bold text-[#007AFF] shadow-sm">
                    <Loader2 size={14} className="animate-spin text-[#007AFF] shrink-0" />
                    <span>Inashughulikia mauzo...</span>
                  </div>
                )}
              </div>
            </div>

            <div className="relative">
              {isBulkMode ? (
                <div className="apple-card p-4 flex flex-col gap-3 shadow-xl">
                  <textarea
                    autoFocus
                    placeholder={t('pos_bulk_placeholder', 'Weka bidhaa nyingi...')}
                    className="apple-input w-full min-h-[120px] resize-none text-lg !p-4"
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                  />
                  <div className="flex justify-end pr-2">
                    <button
                      onClick={processBulkSales}
                      disabled={!bulkText.trim()}
                      className="apple-button-primary !px-8 !py-3 text-sm"
                    >
                      {t('pos_add_to_cart', 'Ongeza kwa Gari')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative group">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-[#86868B] group-focus-within:text-[#007AFF] transition-all duration-500" size={20} />
                  <input
                    type="text"
                    autoFocus
                    placeholder={t('pos_search_placeholder', 'Tafuta bidhaa kwa jina au barcode...')}
                    className={cn(
                      "apple-input w-full pl-14 pr-20 !py-4 text-lg shadow-sm border-white/40",
                      isProcessingAI && "opacity-50 pointer-events-none"
                    )}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                  />
                </div>
              )}
              
              <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {!isBulkMode && searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="text-gray-600 hover:text-black p-2 bg-black/[0.05] rounded-full transition-all"
                  >
                    <X size={24} />
                  </button>
                )}
              </div>
            </div>

            {/* AI Status Indicator */}
            {isListening && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute left-14 -bottom-8 flex items-center gap-2"
              >
                <div className="flex gap-1">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="w-1 h-1 bg-[#FF3B30] rounded-full animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
                <span className="text-[10px] font-bold text-[#FF3B30] uppercase tracking-widest">Partner Listening...</span>
              </motion.div>
            )}

            {(isProcessingAI || isTyping) && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute left-14 -bottom-8 flex items-center gap-2"
              >
                <Loader2 size={12} className="animate-spin text-[#007AFF]" />
                <span className="text-[10px] font-bold text-[#007AFF] uppercase tracking-widest">Partner is typing...</span>
              </motion.div>
            )}
            
            {/* Suggestions Dropdown */}
            <AnimatePresence>
              {suggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute left-0 right-0 top-full mt-2 bg-white rounded-[24px] shadow-2xl border border-black/[0.05] overflow-hidden z-50 p-2"
                >
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleSuggestionClick(s)}
                      className="w-full text-left p-4 hover:bg-[#007AFF]/5 rounded-xl transition-all flex justify-between items-center group"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-black group-hover:text-[#007AFF]">{s.name}</span>
                        <span className="text-xs text-gray-500">{s.category}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-[#007AFF]">Tsh {s.price.toLocaleString()}</span>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{s.stock} ipo</p>
                      </div>
                    </button>
                  ))}
                  {detectedItem && (
                    <div className="p-3 bg-[#34C759]/10 border-t border-black/[0.05] flex items-center justify-between">
                      <span className="text-xs font-bold text-[#34C759] uppercase tracking-widest">Auto-Detect: {detectedItem.quantity} units</span>
                      <span className="text-[10px] text-gray-500">Press Enter to add</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
              <h3 className="text-[11px] font-black text-[#86868B] uppercase tracking-[1px]">{t('pos_categories', 'Makundi (Categories)')}</h3>
              <div className="h-[1px] flex-1 mx-4 bg-[#E5E5EA]" />
            </div>
            
            <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide py-2 px-1 -mx-2 items-center min-h-[60px]">
              <button
                onClick={() => setSelectedCategory(null)}
                className={cn(
                  "px-6 py-3 rounded-xl text-sm font-black whitespace-nowrap transition-all duration-300 relative tactile-button flex items-center justify-center",
                  !selectedCategory 
                    ? "bg-[#007AFF] text-white shadow-lg shadow-[#007AFF]/20" 
                    : "bg-white/70 text-[#86868B] hover:bg-white hover:text-[#1D1D1F] border border-white"
                )}
              >
                {t('pos_all_categories', 'Zote')}
                {!selectedCategory && <motion.div layoutId="tab-glow" className="absolute inset-0 bg-white/20" />}
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn(
                    "px-6 py-3 rounded-xl text-sm font-black whitespace-nowrap transition-all duration-300 relative tactile-button flex items-center justify-center",
                    selectedCategory === cat
                      ? "bg-[#007AFF] text-white shadow-lg shadow-[#007AFF]/20" 
                      : "bg-white/70 text-[#86868B] hover:bg-white hover:text-[#1D1D1F] border border-white"
                  )}
                >
                  {cat}
                  {selectedCategory === cat && <motion.div layoutId="tab-glow" className="absolute inset-0 bg-white/20" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto pb-10 custom-scrollbar pr-3 relative z-10">
          {/* Smart cross-sell product suggestions based on items in cart */}
          {cart.length > 0 && relatedProducts.length > 0 && (
            <POSRelatedProducts
              suggestions={relatedProducts}
              onAddToCart={addToCart}
              language={language === 'en' ? 'en' : 'sw'}
              variant="grid-banner"
              lastAddedProductName={lastAddedProductName}
            />
          )}

          {displayedProducts.map((product) => (
            <button
              type="button"
              key={product.id}
              onClick={() => addToCart(product)}
              className={cn(
                "w-full bg-white rounded-2xl p-4 flex items-center justify-between group border border-gray-100/80 shadow-sm hover:shadow-md hover:border-[#007AFF]/30 hover:translate-x-1 active:scale-[0.99] transition-all duration-150 text-left",
                product.stock === 0 && "opacity-60 grayscale cursor-not-allowed"
              )}
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-11 h-11 bg-black/[0.03] rounded-xl flex items-center justify-center text-gray-400 group-hover:bg-[#007AFF]/10 group-hover:text-[#007AFF] transition-colors flex-shrink-0">
                  <Package size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display font-black text-[#1D1D1F] text-base leading-tight group-hover:text-[#007AFF] transition-colors truncate">
                    {product.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-[#86868B] font-black uppercase tracking-[0.05em] bg-black/[0.04] px-2.5 py-0.5 rounded-full">
                      {product.category}
                    </span>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      {product.unit || 'pcs'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4 flex-shrink-0 ml-3">
                <div className="text-right">
                  <p className="text-lg font-display font-black text-[#1D1D1F]">
                    Tsh {(product.price || 0).toLocaleString()}
                  </p>
                  <div className={cn(
                    "text-[10px] font-black uppercase tracking-wider mt-0.5 px-2 py-0.5 rounded-md inline-block",
                    product.stock <= (product.lowStockThreshold || 5) ? "bg-[#FF3B30]/10 text-[#FF3B30]" : "text-gray-400"
                  )}>
                    {Number(product.stock || 0).toFixed(product.unit === 'pcs' ? 0 : 2)} {product.unit || 'pcs'}
                  </div>
                </div>
                <div className="w-9 h-9 bg-[#007AFF] text-white rounded-xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                  <Plus size={18} strokeWidth={2.5} />
                </div>
              </div>
            </button>
          ))}

          {filteredProducts.length > displayedProducts.length && (
            <div className="py-3 text-center">
              <button
                type="button"
                onClick={() => setVisibleLimit(prev => prev + 40)}
                className="px-6 py-2.5 bg-white border border-gray-200 text-[#007AFF] font-bold rounded-xl shadow-sm hover:bg-[#007AFF]/5 transition-all text-sm"
              >
                {t('pos_show_more', 'Onyesha Zaidi')} (+{filteredProducts.length - displayedProducts.length} {t('pos_remaining', 'zimebaki')})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Review Area (Cart Section) - SLENDER */}
      <div className="w-full lg:w-[380px] xl:w-[420px] apple-card !rounded-[32px] flex flex-col p-5 relative z-10 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.08)] h-full max-h-[calc(100vh-32px)]">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#007AFF]/10 rounded-xl flex items-center justify-center text-[#007AFF]">
              <ShoppingCart size={18} />
            </div>
            <div>
              <h2 className="text-lg font-display font-black text-[#1D1D1F] tracking-tight uppercase leading-none">
                {t('pos_cart_title', 'Order')}
              </h2>
              <p className="text-[9px] text-[#86868B] font-bold uppercase tracking-[0.1em] mt-1">
                {t('pos_cart_details', 'Cart Details')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowOverstockHistory(!showOverstockHistory)}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                showOverstockHistory ? "bg-orange-100 text-orange-600 shadow-inner" : "bg-[#F2F2F7] text-[#86868B] hover:text-[#1D1D1F]"
              )}
            >
              <Layers size={16} />
            </button>
            <AnimatePresence>
              {cart.length > 0 && (
                <motion.span 
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="bg-[#007AFF] text-white px-3 py-1 rounded-full text-[10px] font-black shadow-lg"
                >
                  {cart.length}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        {showOverstockHistory ? (
          <div className="flex-1 flex flex-col min-h-0 bg-orange-50/20 rounded-[32px] border border-orange-100 overflow-hidden">
            <div className="p-6 border-b border-orange-100 bg-white/50 backdrop-blur-md flex items-center justify-between">
              <div className="flex items-center gap-3">
                <History className="text-orange-500" size={20} />
                <h3 className="font-display font-black text-orange-900 tracking-tight">
                  {t('pos_overstock_history', 'KUMBUKUMBU')}
                </h3>
              </div>
              <button 
                onClick={() => setShowOverstockHistory(false)}
                className="text-[11px] font-black text-[#86868B] hover:text-[#1D1D1F] uppercase tracking-[0.1em]"
              >
                {t('modal_close', 'Close')}
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {overstocks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-orange-200 py-10">
                  <Layers size={48} className="mb-4 opacity-20" />
                  <p className="text-sm font-bold uppercase tracking-widest">
                    {t('pos_no_history', 'Hakuna Kumbukumbu')}
                  </p>
                </div>
              ) : (
                overstocks
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map((log) => (
                    <div key={log.id} className="bg-white p-5 rounded-[24px] border border-orange-100 shadow-sm hover:shadow-md transition-all duration-300">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                          <span className="text-[10px] font-black text-[#86868B] uppercase tracking-[0.1em]">
                            {format(new Date(log.timestamp), 'HH:mm • dd/MM/yy')}
                          </span>
                        </div>
                        <span className="text-sm font-display font-black text-orange-600">
                          Tsh {log.value.toLocaleString()}
                        </span>
                      </div>
                      <div className="space-y-2 border-t border-orange-50 pt-3">
                        {log.items.map((it, i) => (
                          <div key={i} className="flex justify-between items-center text-[13px]">
                            <span className="font-bold text-[#1D1D1F]">{it.name}</span>
                            <span className="text-[#86868B]">{it.quantity}x</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
              )}
            </div>
            
            <div className="p-6 bg-white border-t border-orange-100 shadow-[0_-10px_30px_rgba(255,149,0,0.05)]">
               <p className="text-[11px] font-black text-[#86868B] uppercase tracking-[0.1em] mb-1">JUMLA KUU (HISTORY)</p>
               <h4 className="text-2xl font-display font-black text-orange-600">
                 Tsh {overstocks.reduce((s, o) => s + o.value, 0).toLocaleString()}
               </h4>
            </div>
          </div>
        ) : (
          <>
          {/* Review Area Items List */}
          <div className="flex-1 overflow-y-auto px-1 space-y-3 custom-scrollbar min-h-0">
            <AnimatePresence initial={false}>
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[#86868B] py-12 text-center opacity-60">
                  <div className="w-16 h-16 bg-[#F2F2F7] rounded-full flex items-center justify-center mb-4">
                    <ShoppingCart size={24} />
                  </div>
                  <p className="text-xs font-black uppercase tracking-widest leading-relaxed">
                    {t('pos_cart_empty', 'Kapu ni tupu')}
                  </p>
                </div>
              ) : (
                cart.map((item) => (
                  <motion.div
                    key={item.productId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      "group p-3 rounded-2xl border transition-all duration-150 space-y-2.5",
                      lastAddedId === item.productId 
                        ? "bg-[#007AFF]/5 border-[#007AFF]/30 shadow-sm" 
                        : "bg-white border-gray-100 shadow-sm hover:border-[#007AFF]/20 hover:shadow"
                    )}
                  >
                    {/* Top Row: Full Product Name & Remove Button */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-display font-black text-[#1D1D1F] text-sm leading-snug break-words">
                          {item.name}
                        </h4>
                        <button 
                          type="button"
                          onClick={() => {
                            setPendingAction({ 
                              type: 'price_override', 
                              data: { productId: item.productId, name: item.name, originalPrice: item.price } 
                            });
                            setPinModalOpen(true);
                          }}
                          className="text-[11px] text-[#007AFF] font-bold hover:underline inline-flex items-center gap-1 mt-0.5"
                          title="Badili bei (PIN inahitajika)"
                        >
                          <span>@ Tsh {item.price.toLocaleString()}</span>
                        </button>
                      </div>

                      <button 
                        type="button"
                        onClick={() => removeFromCart(item.productId, item.name)}
                        className="p-1.5 text-gray-400 hover:text-[#FF3B30] hover:bg-[#FF3B30]/10 rounded-xl transition-all shrink-0 -mt-0.5 -mr-0.5"
                        title="Ondoa bidhaa"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Bottom Row: Compact Quantity Stepper & Line Total */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-gray-50">
                      <div className="flex items-center bg-[#F2F2F7] rounded-xl p-0.5 border border-black/[0.04]">
                        <button 
                          type="button"
                          onClick={() => updateQuantity(item.productId, -1)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white text-gray-700 shadow-xs border border-gray-200/50 active:scale-95 transition-all"
                          title="Punguza"
                        >
                          <Minus size={13} />
                        </button>
                        <div className="flex items-center justify-center px-1.5 min-w-[42px]">
                          <input 
                            type="number"
                            step="any"
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) => setQuantity(item.productId, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className="w-8 bg-transparent text-center text-xs font-black text-[#1D1D1F] focus:outline-none p-0"
                          />
                          <span className="text-[8px] text-gray-400 font-bold uppercase ml-0.5">{item.unit || 'pc'}</span>
                        </div>
                        <button 
                          type="button"
                          onClick={() => updateQuantity(item.productId, 1)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#007AFF] text-white active:scale-95 transition-all shadow-xs"
                          title="Ongeza"
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-display font-black text-[#1D1D1F]">
                          Tsh {(item.price * item.quantity).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>

            {/* Dynamic Related Products suggestion inside cart */}
            {cart.length > 0 && relatedProducts.length > 0 && (
              <POSRelatedProducts
                suggestions={relatedProducts}
                onAddToCart={addToCart}
                language={language === 'en' ? 'en' : 'sw'}
                variant="cart"
                lastAddedProductName={lastAddedProductName}
              />
            )}
          </div>

          {/* Payment & Customer Selection */}
          <div className="flex-none space-y-4 pt-5 border-t border-black/[0.05] mt-2">
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'cash', label: t('payment_cash', 'Cash'), icon: Banknote },
                { id: 'm-pesa', label: t('payment_mobile', 'Simu'), icon: Smartphone },
                { id: 'card', label: t('payment_card', 'Kadi'), icon: CreditCard },
                { id: 'credit', label: t('payment_credit', 'Deni'), icon: History }
              ].map((method) => (
                <button
                  key={method.id}
                  onClick={() => {
                    setPaymentMethod(method.id as any);
                    if (method.id === 'credit' && !selectedCustomerId) {
                      setIsCustomerSelectionModalOpen(true);
                    }
                  }}
                  className={cn(
                    "flex flex-col items-center gap-2 py-3 rounded-2xl border transition-all active:scale-95",
                    paymentMethod === method.id 
                      ? "bg-[#007AFF] border-[#007AFF] text-white shadow-xl shadow-[#007AFF]/20" 
                      : "bg-[#F2F2F7] border-transparent text-[#1D1D1F] hover:bg-[#E5E5EA]"
                  )}
                >
                  <method.icon size={18} />
                  <span className="text-[9px] font-black uppercase tracking-widest leading-none">{method.label}</span>
                </button>
              ))}
            </div>

            {paymentMethod === 'm-pesa' && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 bg-white rounded-2xl border border-gray-200/85 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                    {t('pos_mobile_network', 'Mtandao wa Simu')}
                  </span>
                  <button 
                    onClick={() => setShowAddNetworkModal(true)}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#007AFF] hover:underline bg-[#007AFF]/10 px-2.5 py-1 rounded-xl transition-colors"
                  >
                    <Plus size={14} /> {t('pos_add_network', 'Ongeza Mtandao')}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {mobileNetworks.map((net) => (
                    <button
                      key={net}
                      onClick={() => setSelectedMobileNetwork(net)}
                      className={cn(
                        "px-3.5 py-2 rounded-xl text-xs font-bold transition-all",
                        selectedMobileNetwork === net
                          ? "bg-[#007AFF] text-white shadow-md shadow-[#007AFF]/20 scale-[1.02]"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      )}
                    >
                      {net}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {paymentMethod === 'card' && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 bg-white rounded-2xl border border-gray-200/85 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                    {t('pos_card_type', 'Aina / Jina la Kadi')}
                  </span>
                  <button 
                    onClick={() => setShowAddCardModal(true)}
                    className="flex items-center gap-1 text-[11px] font-bold text-[#007AFF] hover:underline bg-[#007AFF]/10 px-2.5 py-1 rounded-xl transition-colors"
                  >
                    <Plus size={14} /> {t('pos_add_card', 'Ongeza Kadi')}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {cardNames.map((card) => (
                    <button
                      key={card}
                      onClick={() => setSelectedCardName(card)}
                      className={cn(
                        "px-3.5 py-2 rounded-xl text-xs font-bold transition-all",
                        selectedCardName === card
                          ? "bg-[#007AFF] text-white shadow-md shadow-[#007AFF]/20 scale-[1.02]"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      )}
                    >
                      {card}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {selectedCustomerId && paymentMethod === 'credit' && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-2.5 bg-[#007AFF]/5 rounded-2xl border border-[#007AFF]/10 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-[#007AFF] rounded-full flex items-center justify-center text-white">
                    <History size={14} />
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-[#007AFF] uppercase tracking-widest">
                      {t('pos_credit_customer', 'Mteja wa Deni')}
                    </p>
                    <p className="text-[11px] font-bold text-[#1D1D1F]">
                      {customers.find(c => c.id === selectedCustomerId)?.name}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedCustomerId(null)}
                  className="p-1.5 hover:bg-[#FF3B30]/10 text-[#FF3B30] rounded-lg transition-colors"
                >
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </div>

          <div className="pt-5 mt-auto space-y-5 border-t border-[#F2F2F7]">
            <div className="flex items-end justify-between px-2">
              <div>
                <p className="text-[11px] font-black text-[#86868B] uppercase tracking-[1.5px] mb-2 px-1">
                  {t('pos_total', 'Jumla Kuu')}
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-gray-400 font-display font-medium text-sm">Tsh</span>
                  <motion.p 
                    key={total}
                    initial={{ y: 5, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="total-display !text-3xl"
                  >
                    {total.toLocaleString()}
                  </motion.p>
                </div>
              </div>
              {discount > 0 && (
                <div className="text-right pb-1">
                  <p className="text-[10px] font-black text-[#FF3B30] uppercase tracking-[1px] mb-1">
                    {t('pos_discount', 'Punguzo')}
                  </p>
                  <p className="text-xl font-display font-black text-[#FF3B30] tracking-tight">- {discount.toLocaleString()}</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleDiscount}
                disabled={cart.length === 0}
                className="apple-button-secondary !py-4 !px-4 flex items-center justify-center gap-2 text-sm"
              >
                <Percent size={18} className="text-[#007AFF]" />
                <span className="font-display font-black">{t('pos_discount', 'PUNGUZO').toUpperCase()}</span>
              </button>
              <button
                onClick={() => {
                  if (cart.length > 0 && activeBusiness?.id && profile?.uid) {
                    const itemsSummary = cart.map(i => `${i.quantity}x ${i.name}`).join(', ');
                    const totalVal = subtotal;
                    logAuditEvent({
                      businessId: activeBusiness.id,
                      type: 'clear_cart',
                      category: 'void',
                      title: 'Kufuta Kapu Lote (Clear Cart)',
                      details: `Mtumiaji ${profile?.displayName || 'Cashier'} amefuta kapu lenye bidhaa ${cart.length} (Thamani: Tsh ${totalVal.toLocaleString()}). Bidhaa: ${itemsSummary}`,
                      cashierId: profile.uid,
                      cashierName: profile?.displayName || 'Cashier',
                      originalValue: totalVal,
                      notifyCeo: true
                    });
                  }
                  setCart([]);
                  setDiscount(0);
                }}
                disabled={cart.length === 0}
                className="flex-1 px-4 py-4 rounded-3xl flex items-center justify-center gap-2 text-[#FF3B30] bg-[#FF3B30]/5 border border-[#FF3B30]/10 transition-all font-display font-black text-sm disabled:opacity-30 active:scale-95 shadow-sm"
              >
                <Trash2 size={18} />
                <span>{t('pos_clear_cart', 'FUTA ZOTE')}</span>
              </button>
            </div>

            <button
              onClick={handleCheckoutClick}
              disabled={cart.length === 0 || loading}
              className={cn(
                "w-full rounded-full font-black text-xl py-6 transition-all relative group h-[72px] tactile-button font-display tracking-[1px] flex items-center justify-center gap-4 overflow-hidden shadow-2xl shadow-[#007AFF]/30",
                cart.length > 0
                  ? "bg-gradient-to-b from-[#007AFF] to-[#0055FF] text-white active:scale-[0.98] border-t border-white/20" 
                  : "bg-[#F2F2F7] text-[#86868B] pointer-events-none shadow-none"
              )}
            >
              {loading ? (
                <Loader2 size={28} className="animate-spin text-white" />
              ) : (
                <>
                  {paymentMethod === 'credit' ? <History size={26} /> : <CheckCircle size={26} />}
                  <span className="uppercase text-[18px]">
                    {paymentMethod === 'credit' && !selectedCustomerId 
                      ? t('pos_select_customer', 'CHAGUA MTEJA') 
                      : (paymentMethod === 'credit' 
                          ? t('pos_sell_credit', 'UZA KWA DENI') 
                          : paymentMethod === 'card'
                          ? `${t('pos_pay', 'LIPA')} (${t('payment_card', 'KADI')}${selectedCardName ? ` - ${selectedCardName}` : ''})`
                          : paymentMethod === 'm-pesa'
                          ? `${t('pos_pay', 'LIPA')} (${t('payment_mobile', 'SIMU')}${selectedMobileNetwork ? ` - ${selectedMobileNetwork}` : ''})`
                          : `${t('pos_pay', 'LIPA')} (${paymentMethod})`)}
                  </span>
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>

      {/* PIN Modal */}
      <PinModal
        isOpen={pinModalOpen}
        onClose={() => {
          setPinModalOpen(false);
          setPendingAction(null);
        }}
        onSuccess={handlePinSuccess}
        onValidate={async (enteredPin) => {
          if (!activeBusiness?.id) return false;
          
          // Check if it matches any user with CEO or Manager role and this PIN
          const usersRef = collection(db, 'users');
          const q = query(
            usersRef,
            where('businessId', '==', activeBusiness.id),
            where('pin', '==', enteredPin),
            where('isActive', '==', true)
          );
          
          const querySnapshot = await getDocs(q);
          if (querySnapshot.empty) return false;

          const validUser = querySnapshot.docs.find(doc => {
            const data = doc.data();
            return data.role === 'ceo' || data.role === 'manager';
          });

          return !!validUser;
        }}
      />

      {/* Customer Selection Modal for Credit Sales */}
      <AnimatePresence>
        {isCustomerSelectionModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10 shadow-sm">
                <div>
                  <h3 className="text-xl font-display font-black text-[#1D1D1F]">Chagua Mteja</h3>
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mt-1">Kwa uuzaji wa deni pekee</p>
                </div>
                <button 
                  onClick={() => setIsCustomerSelectionModalOpen(false)}
                  className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 hover:text-gray-900 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-4 bg-gray-50/50 border-b border-gray-100">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder="Tafuta jina au namba..."
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    className="w-full pl-11 pr-4 py-4 bg-white border-transparent focus:border-[#007AFF] rounded-2xl shadow-sm outline-none font-bold text-[#1D1D1F] transition-all"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {customers.filter(c => 
                  c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) || 
                  c.phone?.includes(customerSearchQuery)
                ).length > 0 ? (
                  customers
                    .filter(c => 
                      c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) || 
                      c.phone?.includes(customerSearchQuery)
                    )
                    .map(customer => (
                      <button
                        key={customer.id}
                        onClick={() => {
                          setSelectedCustomerId(customer.id);
                          setIsCustomerSelectionModalOpen(false);
                          setTimeout(() => handleCheckout(), 100);
                        }}
                        className="w-full p-4 rounded-2xl border border-transparent hover:border-[#007AFF]/20 hover:bg-[#007AFF]/5 transition-all text-left group flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-[#007AFF]/10 text-[#007AFF] rounded-xl flex items-center justify-center font-black text-xs">
                            {customer.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-[#1D1D1F] group-hover:text-[#007AFF] transition-colors">{customer.name}</p>
                            <p className="text-xs text-gray-500">{customer.phone || 'Hana namba'}</p>
                          </div>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-all translate-x-2 group-hover:translate-x-0">
                           <div className="w-8 h-8 rounded-full bg-[#007AFF] text-white flex items-center justify-center">
                             <Plus size={16} />
                           </div>
                        </div>
                      </button>
                    ))
                ) : (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 opacity-50">
                      <Search size={24} className="text-gray-400" />
                    </div>
                    <p className="text-gray-400 font-bold mb-4">Mteja hajapatikana</p>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-gray-100 bg-white shadow-[0_-10px_20px_rgba(0,0,0,0.02)]">
                <button
                  onClick={() => {
                    setIsCustomerSelectionModalOpen(false);
                    setCustomerModalOpen(true);
                  }}
                  className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center gap-3 text-gray-500 font-black hover:border-[#007AFF] hover:text-[#007AFF] transition-all active:scale-[0.98]"
                >
                  <UserPlus size={20} />
                  <span>SAJILI MTEJA MPYA</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Modal */}
      <AnimatePresence>
        {customerModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#1D1D1F]/60 backdrop-blur-md"
              onClick={() => setCustomerModalOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-[400px] bg-white rounded-[40px] shadow-2xl relative overflow-hidden flex flex-col"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#007AFF]/10 rounded-2xl flex items-center justify-center text-[#007AFF]">
                      <UserPlus size={24} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-display font-black text-[#1D1D1F]">Mteja Mpya</h2>
                      <p className="text-sm font-medium text-[#86868B]">Sajili mteja wa kudaiwa</p>
                    </div>
                  </div>
                  <button onClick={() => setCustomerModalOpen(false)} className="w-10 h-10 bg-[#F2F2F7] rounded-full flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F]">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-[#86868B] uppercase tracking-widest mb-2 px-1">Jina kamili</label>
                    <input 
                      type="text"
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full bg-[#F2F2F7] rounded-2xl px-6 py-4 font-bold outline-none border-2 border-transparent focus:border-[#007AFF] focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-[#86868B] uppercase tracking-widest mb-2 px-1">Namba ya Simu</label>
                    <input 
                      type="tel"
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      placeholder="e.g. 0712345678"
                      className="w-full bg-[#F2F2F7] rounded-2xl px-6 py-4 font-bold outline-none border-2 border-transparent focus:border-[#007AFF] focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <button 
                  onClick={handleAddCustomer}
                  className="w-full bg-[#007AFF] text-white py-5 rounded-[24px] font-display font-black text-lg shadow-xl shadow-[#007AFF]/20 hover:bg-[#0051FF] mt-8 active:scale-[0.98] transition-all"
                >
                  SAJILI MTEJA
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {discountModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#1D1D1F]/60 backdrop-blur-md"
              onClick={() => setDiscountModalOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-[400px] bg-white rounded-[40px] shadow-2xl relative overflow-hidden flex flex-col"
            >
              <div className="p-8 pb-4">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#007AFF]/10 rounded-2xl flex items-center justify-center text-[#007AFF]">
                      <Percent size={24} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-display font-black text-[#1D1D1F]">Punguzo</h2>
                      <p className="text-sm font-medium text-[#86868B]">Chagua au weka punguzo</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setDiscountModalOpen(false)}
                    className="w-10 h-10 bg-[#F2F2F7] rounded-full flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-8">
                  {[5, 10, 20].map((val) => (
                    <button
                      key={val}
                      onClick={() => applyDiscount('percentage', val.toString())}
                      className="py-4 bg-[#F2F2F7] hover:bg-[#007AFF] hover:text-white rounded-3xl font-display font-black transition-all duration-300"
                    >
                      {val}%
                    </button>
                  ))}
                </div>

                <div className="space-y-6">
                  <div className="flex items-center gap-2 p-1 bg-[#F2F2F7] rounded-2xl">
                    <button 
                      onClick={() => setDiscountType('percentage')}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold transition-all text-sm",
                        discountType === 'percentage' ? "bg-white text-[#007AFF] shadow-sm" : "text-[#86868B]"
                      )}
                    >
                      Asilimia (%)
                    </button>
                    <button 
                      onClick={() => setDiscountType('fixed')}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold transition-all text-sm",
                        discountType === 'fixed' ? "bg-white text-[#007AFF] shadow-sm" : "text-[#86868B]"
                      )}
                    >
                      Kiasi (Tsh)
                    </button>
                  </div>

                  <div className="relative">
                    <input 
                      type="number"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountType === 'percentage' ? "Weka % (mf: 15)" : "Weka kiasi (mf: 2000)"}
                      className="w-full bg-[#F2F2F7] border-2 border-transparent focus:border-[#007AFF] focus:bg-white rounded-3xl px-6 py-5 text-xl font-display font-black transition-all outline-none"
                    />
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[#86868B] font-black">
                      {discountType === 'percentage' ? '%' : 'Tsh'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 pt-4">
                <button 
                  onClick={() => applyDiscount(discountType, discountValue)}
                  disabled={!discountValue}
                  className="w-full bg-[#007AFF] text-white py-6 rounded-[28px] font-display font-black text-lg shadow-xl shadow-[#007AFF]/20 hover:bg-[#0051FF] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale disabled:scale-100"
                >
                  WEKA PUNGUZO
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Receipt Modal */}
      <AnimatePresence>
        {showReceipt && lastSale && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-md p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] border border-white/20"
            >
              <div className="p-8 border-b border-black/[0.05] flex justify-between items-center bg-white/50 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#34C759]/10 rounded-xl flex items-center justify-center text-[#34C759]">
                    <CheckCircle size={24} />
                  </div>
                  <h3 className="text-xl font-sans font-black text-[#1C1C1E]">{t('pos_payment_complete', 'Malipo Tayari')}</h3>
                </div>
                <button onClick={() => setShowReceipt(false)} className="p-2.5 bg-black/[0.03] hover:bg-black/[0.06] rounded-full transition-all">
                  <X size={20} className="text-[#8E8E93]" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-10 custom-scrollbar font-luxury" id="receipt-content">
                <div className="text-center mb-10">
                  <div className="w-24 h-24 bg-[#007AFF] rounded-[32px] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-[#007AFF]/20 border-4 border-white">
                    <Receipt className="w-12 h-12 text-white" />
                  </div>
                  <h2 className="text-3xl font-black text-[#007AFF] tracking-tight uppercase leading-tight">{activeBusiness?.name}</h2>
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <div className="h-[1px] w-6 bg-[#007AFF]/20"></div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#007AFF]">
                      {t('pos_official_receipt', 'RISITI HALISI')}
                    </span>
                    <div className="h-[1px] w-6 bg-[#007AFF]/20"></div>
                  </div>
                  <p className="text-[#8E8E93] text-sm font-bold mt-2 uppercase tracking-widest">{activeBusiness?.address || 'Tanzania'}</p>
                  <p className="text-[#007AFF] text-sm font-bold mt-1">{activeBusiness?.phone}</p>
                </div>

                <div className="bg-[#007AFF]/5 rounded-[24px] p-6 mb-8 border border-[#007AFF]/10">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] text-[#8E8E93] font-bold uppercase tracking-widest mb-1">Cashier</p>
                      <p className="text-sm font-bold text-[#1C1C1E]">{profile?.displayName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-[#8E8E93] font-bold uppercase tracking-widest mb-1">Payment</p>
                      <p className="text-sm font-bold text-[#007AFF] uppercase">
                        {lastSale.paymentMethod === 'm-pesa' && lastSale.mobileNetwork
                          ? `Simu (${lastSale.mobileNetwork})`
                          : lastSale.paymentMethod === 'card' && lastSale.cardName
                          ? `Kadi (${lastSale.cardName})`
                          : lastSale.paymentMethod === 'credit'
                          ? 'Deni'
                          : lastSale.paymentMethod}
                      </p>
                    </div>
                    {lastSale.customerId && (
                      <div className="col-span-2 mt-2 pt-2 border-t border-[#007AFF]/10">
                        <p className="text-[10px] text-[#8E8E93] font-bold uppercase tracking-widest mb-1">
                          {t('pos_credit_customer', 'Mteja wa Deni')}
                        </p>
                        <p className="text-sm font-bold text-[#1C1C1E]">
                          {customers.find(c => c.id === lastSale.customerId)?.name || 'Mteja'}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] text-[#8E8E93] font-bold uppercase tracking-widest mb-1">{t('pos_date', 'Tarehe')}</p>
                      <p className="text-sm font-bold text-[#1C1C1E]">{format(new Date(lastSale.timestamp), 'dd/MM/yyyy')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-[#8E8E93] font-bold uppercase tracking-widest mb-1">{t('pos_sale_id', 'ID ya Mauzo')}</p>
                      <p className="text-sm font-bold text-[#1C1C1E]">
                        {lastSale.saleNumber ? lastSale.saleNumber.toString().padStart(6, '0') : lastSale.id.slice(-8).toUpperCase()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6 mb-10">
                  <div className="flex justify-between items-center pb-2 border-b-2 border-[#007AFF]/10">
                    <span className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest">{t('pos_product', 'Bidhaa')}</span>
                    <span className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-widest">{t('pos_price', 'Bei')}</span>
                  </div>
                  {lastSale.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-start group">
                      <div className="flex-1 pr-4">
                        <p className="font-bold text-[#1C1C1E] text-[16px] group-hover:text-[#007AFF] transition-colors">{item.name}</p>
                        <p className="text-[13px] text-[#8E8E93] font-bold">{item.quantity} x {item.price.toLocaleString()}</p>
                      </div>
                      <span className="font-bold text-[#1C1C1E] text-lg">{(item.quantity * item.price).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-4 bg-white rounded-[24px] p-6 shadow-sm border border-black/[0.03]">
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-[#8E8E93]">{t('pos_subtotal', 'Jumla')}</span>
                    <span className="text-[#1C1C1E]">Tsh {lastSale.total.toLocaleString()}</span>
                  </div>
                  {lastSale.discount > 0 && (
                    <div className="flex justify-between text-sm font-bold text-[#FF3B30]">
                      <span>{t('pos_discount', 'Punguzo')}</span>
                      <span>- Tsh {lastSale.discount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="h-px bg-black/[0.05] my-2" />
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] text-[#34C759] font-bold uppercase tracking-widest mb-1">Status</p>
                      <div className="flex items-center gap-1.5 text-[#34C759]">
                        <CheckCircle size={14} />
                        <span className="text-xs font-bold uppercase tracking-wider">Success</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-[#8E8E93] font-bold uppercase tracking-widest mb-1">{t('pos_total', 'Jumla Kuu')}</p>
                      <p className="text-3xl font-sans font-black text-[#007AFF]">Tsh {lastSale.netTotal.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-12 text-center">
                  <div className="inline-block px-6 py-2 bg-[#007AFF] text-white rounded-full mb-4 shadow-lg shadow-[#007AFF]/20">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em]">{t('receipt_thank_you', 'Asante kwa kutembelea')}</p>
                  </div>
                  <p className="text-[#1C1C1E] text-[13px] font-bold">{t('receipt_appreciate', 'Tunathamini ununuzi wako')}</p>
                  <div className="mt-6 flex justify-center gap-1">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#007AFF]/20" />
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-8 bg-white border-t border-black/[0.05] grid grid-cols-2 gap-4">
                <button
                  onClick={handlePrint58mm}
                  className="bg-[#007AFF] text-white py-4 rounded-[20px] font-bold hover:bg-[#0062CC] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#007AFF]/20 active:scale-[0.97]"
                >
                  <Printer size={20} />
                  {t('pos_print_receipt', 'Print 58mm')}
                </button>
                <button
                  onClick={() => {
                    const paymentMethodText = lastSale.paymentMethod === 'm-pesa' && lastSale.mobileNetwork
                      ? `Simu (${lastSale.mobileNetwork})`
                      : lastSale.paymentMethod === 'card' && lastSale.cardName
                      ? `Kadi (${lastSale.cardName})`
                      : lastSale.paymentMethod === 'credit'
                      ? 'Deni'
                      : lastSale.paymentMethod?.toUpperCase() || 'CASH';

                    const text = `*${activeBusiness?.name} Receipt*\n\n` +
                      `Cashier: ${profile?.displayName}\n` +
                      `Payment: ${paymentMethodText}\n` +
                      `Date: ${format(new Date(lastSale.timestamp), 'dd/MM/yyyy HH:mm')}\n` +
                      `ID: ${lastSale.id.slice(-8).toUpperCase()}\n\n` +
                      `*Items:*\n` +
                      lastSale.items.map((i: any) => `- ${i.name} (${i.quantity}x): Tsh ${(i.quantity * i.price).toLocaleString()}`).join('\n') +
                      `\n\n*Subtotal:* Tsh ${lastSale.total.toLocaleString()}` +
                      (lastSale.discount > 0 ? `\n*Discount:* - Tsh ${lastSale.discount.toLocaleString()}` : '') +
                      `\n*Total:* Tsh ${lastSale.netTotal.toLocaleString()}\n\n` +
                      `Thank you for coming. We are appreciate your sale.\n` +
                      `*SUCCESS*`;
                    
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                  }}
                  className="bg-[#25D366] text-white py-4 rounded-[20px] font-bold hover:bg-[#128C7E] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#25D366]/20 active:scale-[0.97]"
                >
                  <Share2 size={20} />
                  WhatsApp
                </button>
                <button
                  onClick={() => setShowReceipt(false)}
                  className="col-span-2 bg-[#F2F2F7] text-[#1C1C1E] py-4 rounded-[20px] font-bold hover:bg-[#E5E5EA] transition-all active:scale-[0.97]"
                >
                  {t('modal_close', 'Funga')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Mobile Network Modal */}
      {showAddNetworkModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[28px] w-full max-w-sm p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-display font-black text-[#1D1D1F]">
                {t('pos_new_network_title', 'Ongeza Mtandao Mpya')}
              </h3>
              <button onClick={() => setShowAddNetworkModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              placeholder={t('pos_network_placeholder', 'Jina la mtandao (mf. Azam Pesa)')}
              value={newNetworkName}
              onChange={(e) => setNewNetworkName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddNetwork();
                }
              }}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:border-[#007AFF] outline-none font-bold text-sm"
              autoFocus
            />
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowAddNetworkModal(false)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm"
              >
                {t('cancel', 'Ghairi')}
              </button>
              <button
                onClick={handleAddNetwork}
                className="flex-1 py-3 rounded-2xl bg-[#007AFF] text-white font-bold text-sm shadow-md"
              >
                {t('save', 'Hifadhi')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Add Card Modal */}
      {showAddCardModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[28px] w-full max-w-sm p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-display font-black text-[#1D1D1F]">
                {t('pos_new_card_title', 'Ongeza Kadi / Benki Mpya')}
              </h3>
              <button onClick={() => setShowAddCardModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              placeholder={t('pos_card_placeholder', 'Jina la kadi (mf. CRDB, NMB, Stanbic, Visa)')}
              value={newCardName}
              onChange={(e) => setNewCardName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddCardName();
                }
              }}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:border-[#007AFF] outline-none font-bold text-sm"
              autoFocus
            />
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowAddCardModal(false)}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 font-bold text-sm"
              >
                {t('cancel', 'Ghairi')}
              </button>
              <button
                onClick={handleAddCardName}
                className="flex-1 py-3 rounded-2xl bg-[#007AFF] text-white font-bold text-sm shadow-md"
              >
                {t('save', 'Hifadhi')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
