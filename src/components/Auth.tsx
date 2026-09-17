import React, { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInAnonymously,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, setDoc, collection, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { toast } from 'react-hot-toast';
import { triggerScreenFlash } from './ScreenFlash';
import { LogIn, UserPlus, Store, Chrome, ArrowRight, Mail, Lock, User as UserIcon, Building2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../AuthContext';
import { cn } from '../lib/utils';

export const Auth: React.FC = () => {
  const { user, profile, isGenesisMode, loginAsStaff } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [activeRole, setActiveRole] = useState<'staff' | 'ceo'>('staff');
  const [identifier, setIdentifier] = useState('');
  const [pinOrPass, setPinOrPass] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);

  useEffect(() => {
    if (isGenesisMode) {
      setIsLogin(false);
      setActiveRole('ceo');
    }
  }, [isGenesisMode]);

  useEffect(() => {
    if (user && !profile) {
      setNeedsProfile(true);
    } else {
      setNeedsProfile(false);
    }
  }, [user, profile]);

  const handleAnonymousLogin = async () => {
    setLoading(true);
    try {
      const userCredential = await signInAnonymously(auth);
      const user = userCredential.user;
      
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (!docSnap.exists()) {
        const businessId = doc(collection(db, 'businesses')).id;
        await setDoc(doc(db, 'businesses', businessId), {
          id: businessId,
          name: 'Biashara ya Maonyesho',
          ownerUid: user.uid,
          createdAt: new Date().toISOString(),
        });

        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: 'guest@partner.ai',
          displayName: 'Mtumiaji wa Maonyesho',
          pin: '0000',
          role: 'cashier',
          businessId,
          createdAt: new Date().toISOString(),
          permissions: {
            view_real_profit: false,
            edit_buying_price: false,
            void_transaction: false,
            view_stock_valuation: false,
            expense_entry: true,
          },
          isActive: true
        });
      }
      
      triggerScreenFlash('success');
      toast.success('Karibu kwenye Maonyesho!');
    } catch (error: any) {
      if (error?.code === 'auth/admin-restricted-operation' || error?.message?.includes('admin-restricted-operation')) {
        console.warn('Anonymous login is disabled in Firebase console config of this project.');
        toast.error('Njia ya kuingia kama mgeni haijawezeshwa kwenye Firebase bado. Tafadhali wasiliana na Bosi ili kuiwasha kule console au tumia njia nyingine.');
      } else {
        console.error('Anonymous Login Error:', error);
        toast.error('Imeshindikana kuingia kama mgeni.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLoginWithRedirect = async () => {
    if (!navigator.onLine) {
      toast.error('Huna internet. Tafadhali kagua muunganisho wako.');
      return;
    }

    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithRedirect(auth, provider);
    } catch (error: any) {
      console.error('Google Redirect Login Error:', error);
      toast.error('Imeshindikana kuanzisha Login.');
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!navigator.onLine) {
      toast.error('Huna internet.');
      return;
    }

    if (loading) return; // Prevent concurrent requests
    setLoading(true);
    const safetyTimeout = setTimeout(() => setLoading(false), 15000);

    try {
      // Small delay to ensure any previous processes are cleaned up
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      
      // Clean any stale welcome flag so new login displays welcome screen
      try {
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const key = sessionStorage.key(i);
          if (key && (key.startsWith('has_seen_welcome_') || key.includes('welcome'))) {
            sessionStorage.removeItem(key);
          }
        }
      } catch (e) {}

      // Attempt login
      const result = await signInWithPopup(auth, provider);
      
      if (result.user) {
        clearTimeout(safetyTimeout);
        triggerScreenFlash('success');
        toast.success('Umeingia kwa mafanikio!');
      }
    } catch (error: any) {
      clearTimeout(safetyTimeout);
      console.error('Google Login Error:', error);
      
      // Specifically handle cancellation without a big error toast if possible
      if (error.code === 'auth/cancelled-popup-request') {
        // Silently fail or simple info
        console.log('Login request cancelled');
      } else if (error.code === 'auth/popup-closed-by-user') {
        toast.error('Dirisha la Google limefungwa.');
      } else {
        triggerScreenFlash('warning');
        toast.error('Imeshindikana kuingia na Google.');
      }
    } finally {
      clearTimeout(safetyTimeout);
      setLoading(false);
    }
  };

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (pin.length !== 4) {
      toast.error('Tafadhali weka PIN ya namba 4.');
      return;
    }
    setLoading(true);

    try {
      const businessId = doc(collection(db, 'businesses')).id;
      await setDoc(doc(db, 'businesses', businessId), {
        id: businessId,
        name: businessName,
        ownerUid: user.uid,
        createdAt: new Date().toISOString(),
      });

      const permissions = {
        view_real_profit: true,
        edit_buying_price: true,
        void_transaction: true,
        view_stock_valuation: true,
        expense_entry: true,
      };

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || displayName,
        pin: pin,
        role: isGenesisMode ? 'ceo' : 'owner',
        businessId,
        createdAt: new Date().toISOString(),
        permissions,
        isActive: true
      });

      triggerScreenFlash('success');
      toast.success(isGenesisMode ? 'Karibu Boss. Mfumo umesecuriwa!' : 'Wasifu na Biashara imekamilika!');
      
      // Update local state by forcing a reload or letting context handle it
      window.location.reload(); 
    } catch (error: any) {
      triggerScreenFlash();
      toast.error('Imeshindikana kukamilisha wasifu');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin && pinOrPass.length < 4) {
      toast.error('Neno la siri au PIN lazima iwe na angalau namba/herufi 4.');
      return;
    }
    setLoading(true);
    const safetyTimeout = setTimeout(() => setLoading(false), 15000);

    try {
      if (isLogin) {
        try {
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const key = sessionStorage.key(i);
            if (key && (key.startsWith('has_seen_welcome_') || key.includes('welcome'))) {
              sessionStorage.removeItem(key);
            }
          }
        } catch (e) {}
        // This is now Local Staff Login
        const success = await loginAsStaff(identifier, pinOrPass, activeRole);
        clearTimeout(safetyTimeout);
        if (success) {
          triggerScreenFlash('success');
          toast.success('Karibu kwenye Kazi!');
        } else {
          triggerScreenFlash('warning');
          toast.error('Jina au PIN si sahihi. Kagua maelezo yako.');
        }
      } else {
        // CEO Registration (Only if Genesis Mode) -> We now prefer Google Login
        // But if they really want manual, we'll try, but explain Google is better.
        toast.error('Tafadhali tumia Google Login ili kuwa CEO. Inasecuriwa zaidi.');
        setIsLogin(true);
      }
    } catch (error: any) {
      console.error(error);
      triggerScreenFlash();
      if (error.code === 'auth/operation-not-allowed') {
        toast.error('Akaunti hii imezuiwa au haijawezeshwa.');
      } else if (error.code === 'auth/user-not-found') {
        toast.error('Akaunti hii haipo.');
      } else if (error.code === 'auth/wrong-password') {
        toast.error('Neno la siri si sahihi.');
      } else {
        toast.error(error.message || 'Kuna tatizo limetokea');
      }
    } finally {
      setLoading(false);
    }
  };

  if (needsProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F2F2F7] p-6 font-sans">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#007AFF]/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#5856D6]/5 rounded-full blur-[120px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-white/80 backdrop-blur-2xl p-10 rounded-[48px] shadow-2xl max-w-md w-full border border-white/40 relative z-10"
        >
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-gradient-to-br from-[#007AFF] to-[#5856D6] rounded-[28px] flex items-center justify-center text-white mx-auto mb-6 shadow-xl shadow-[#007AFF]/20">
              <Building2 size={36} />
            </div>
            <h2 className="text-3xl font-sans font-black text-black tracking-tight">{isGenesisMode ? 'Genesis Mode: Karibu Boss' : 'Kamilisha Usajili'}</h2>
            <p className="text-gray-600 font-medium mt-2">{isGenesisMode ? 'Hili ni tendo la kwanza. Usisahau PIN yako.' : 'Karibu! Tafadhali jaza maelezo yako ili kuanza.'}</p>
          </div>

          <form onSubmit={handleCompleteProfile} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[13px] font-bold text-black uppercase tracking-widest ml-1">Jina la Biashara</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-[#007AFF] transition-colors">
                  <Store size={20} />
                </div>
                <input
                  type="text"
                  required
                  className="apple-input pl-12"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Mfano: Juma Grocery"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[13px] font-bold text-black uppercase tracking-widest ml-1">PIN ya Usalama (Namba 4)</label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-[#007AFF] transition-colors">
                  <Lock size={20} />
                </div>
                <input
                  type="password"
                  maxLength={4}
                  required
                  className="apple-input pl-12"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full apple-button-primary py-5 text-lg flex items-center justify-center gap-3"
            >
              {loading ? (
                <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Kamilisha Usajili</span>
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent p-6 font-sans relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#007AFF]/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#5856D6]/10 rounded-full blur-[150px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/80 backdrop-blur-2xl p-10 md:p-12 rounded-[56px] shadow-2xl max-w-lg w-full border border-white/40 relative z-10"
      >
        <div className="text-center mb-12">
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 15 }}
            className="w-24 h-24 bg-gradient-to-br from-[#007AFF] to-[#5856D6] rounded-[32px] flex items-center justify-center text-white mx-auto mb-8 shadow-2xl shadow-[#007AFF]/30"
          >
            <Store size={44} />
          </motion.div>
          
          <h2 className="text-4xl font-sans font-black text-black tracking-tight mb-3">
            {isGenesisMode ? 'Genesis Mode : Boss' : 'Karibu Tena'}
          </h2>
          <p className="text-gray-600 font-medium text-lg">
            {isGenesisMode ? 'Tafadhali jisajili kama Boss/CEO ili kuanza.' : 'Ingia kwenye POS kukamilisha mauzo'}
          </p>
        </div>

        {/* Apple-style Segmented Control Toggle for Boss (CEO) and Staff */}
        {!isGenesisMode && (
          <div className="flex bg-black/[0.05] p-1.5 rounded-3xl mb-10 border border-black/[0.02] relative z-10 select-none">
            <button
              type="button"
              onClick={() => setActiveRole('staff')}
              className={cn(
                "flex-1 py-4 text-[15px] font-black rounded-2xl transition-all duration-300 flex items-center justify-center gap-2",
                activeRole === 'staff' 
                  ? "bg-white text-black shadow-md scale-[1.02]" 
                  : "text-gray-500 hover:text-black hover:bg-black/[0.02]"
              )}
            >
              <UserIcon size={18} className={activeRole === 'staff' ? "text-[#007AFF]" : "text-gray-500"} />
              <span>Mfanyakazi (Staff)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveRole('ceo')}
              className={cn(
                "flex-1 py-4 text-[15px] font-black rounded-2xl transition-all duration-300 flex items-center justify-center gap-2",
                activeRole === 'ceo' 
                  ? "bg-white text-black shadow-md scale-[1.02]" 
                  : "text-gray-500 hover:text-black hover:bg-black/[0.02]"
              )}
            >
              <Building2 size={18} className={activeRole === 'ceo' ? "text-[#5856D6]" : "text-gray-500"} />
              <span>Miliki au Boss (CEO)</span>
            </button>
          </div>
        )}

        <div className="space-y-8">
          <AnimatePresence mode="wait">
            {activeRole === 'ceo' || isGenesisMode ? (
              <motion.div
                key="ceo-login"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="bg-[#5856D6]/5 p-5 rounded-3xl border border-[#5856D6]/10 mb-2">
                  <p className="text-[13px] font-bold text-[#5856D6] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Sparkles size={14} fill="currentColor" />
                    USALAMA WA KIWANGO CHA JUU
                  </p>
                  <p className="text-gray-600 font-medium text-xs leading-relaxed">
                    Kwa usalama zaidi wa duka lako, Boss unaruhusiwa kuingia kwa kutumia Google pekee. Hakuna PIN inayoweza kuibiwa mtandaoni.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 pt-2">
                  <button
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full bg-white border border-black/[0.1] text-black py-5 rounded-[28px] font-bold hover:shadow-2xl hover:scale-[1.01] transition-all duration-300 flex items-center justify-center gap-4 shadow-sm active:scale-[0.98] relative overflow-hidden group disabled:opacity-70"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/[0.02] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    {loading ? (
                      <div className="w-6 h-6 border-3 border-[#4285F4] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Chrome size={24} className="text-[#4285F4]" />
                    )}
                    <span className="text-lg">Kuingia na Google (Boss)</span>
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="staff-login"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[12px] font-black text-black uppercase tracking-widest ml-1">Jina la Kazi (Username / Jina)</label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#007AFF] transition-colors">
                        <UserIcon size={20} />
                      </div>
                      <input
                        type="text"
                        required
                        className="apple-input pl-12 font-bold"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="Andika Username yako"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[12px] font-black text-black uppercase tracking-widest ml-1">Neno la siri au password / pin</label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#007AFF] transition-colors">
                        <Lock size={20} />
                      </div>
                      <input
                        type="password"
                        required
                        className="apple-input pl-12 font-bold"
                        value={pinOrPass}
                        onChange={(e) => setPinOrPass(e.target.value)}
                        placeholder="Andika password yako ya POS"
                      />
                    </div>
                  </div>
                  
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full apple-button-primary py-5 text-lg flex items-center justify-center gap-3 mt-6"
                  >
                    {loading ? (
                      <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <LogIn size={22} className="text-white" />
                        <span>Kuingia Kwenye POS (Staff)</span>
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-10 text-center">
          <p className="text-gray-400 text-[11px] font-black uppercase tracking-widest leading-relaxed">
            Mfumo unakumbuka password zako zote kikamilifu na kumuonyesha mfanyakazi menu zilizochaguliwa na Boss pekee.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
