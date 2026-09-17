import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, ArrowRight, User, Sparkles, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '../lib/utils';

import { UserProfile } from '../types';

interface LockScreenProps {
  profile: UserProfile;
}

export const LockScreen: React.FC<LockScreenProps> = ({ profile }) => {
  const { unlock, activeBusiness, signOut } = useAuth();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (pin.length < 3) {
      toast.error('Andika angalau tarakimu 3');
      return;
    }

    setLoading(true);
    const success = await unlock(pin);
    if (!success) {
      toast.error('PIN isiyo sahihi. Jaribu tena.');
      setPin('');
    } else {
      toast.success('Karibu!');
    }
    setLoading(false);
  };

  const handleNumber = (num: string) => {
    if (pin.length < 6) {
      const newPin = pin + num;
      setPin(newPin);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#F2F2F7]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="luxury-bg-glow -bottom-[10%] -right-[10%] w-[90%] h-[90%] bg-[#007AFF]/30" />
        <div className="luxury-bg-glow -top-[10%] -left-[10%] w-[70%] h-[70%] bg-[#5856D6]/20" />
        <div className="absolute inset-0 bg-white/20 backdrop-blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white/80 backdrop-blur-3xl p-10 md:p-12 rounded-[56px] shadow-[0_32px_80px_rgba(0,0,0,0.1)] border border-white max-w-sm w-full relative z-10 text-center"
      >
        <div className="mb-10 text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-black to-[#3A3A3C] rounded-[32px] flex items-center justify-center text-white mx-auto mb-8 shadow-2xl">
            <Sparkles size={44} />
          </div>
          <h2 className="text-3xl font-black text-black tracking-tight uppercase">Partner</h2>
          <p className="text-[11px] text-[#007AFF] font-black uppercase tracking-[0.3em] mt-2">Locked Session</p>
        </div>

        <div className="mb-8">
          <div className="flex justify-center gap-4 mb-2 min-h-[16px]">
            {Array.from({ length: Math.max(pin.length, 3) }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0 }}
                animate={{ 
                  scale: pin.length > i ? 1.2 : 0.8,
                  backgroundColor: pin.length > i ? "#007AFF" : "rgba(0,0,0,0.1)"
                }}
                className="w-4 h-4 rounded-full"
              />
            ))}
          </div>
          <p className="text-[12px] font-bold text-gray-400 uppercase tracking-widest mt-4">Jaza PIN yako</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleNumber(num)}
              className="w-16 h-16 rounded-full bg-white border border-black/[0.03] text-2xl font-black text-black hover:bg-[#007AFF] hover:text-white hover:shadow-xl hover:shadow-[#007AFF]/30 transition-all active:scale-90"
            >
              {num}
            </button>
          ))}
          <button
            onClick={() => setPin('')}
            className="w-16 h-16 rounded-full bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center active:scale-90"
          >
            <X size={24} />
          </button>
          <button
            onClick={() => handleNumber('0')}
            className="w-16 h-16 rounded-full bg-white border border-black/[0.03] text-2xl font-black text-black hover:bg-[#007AFF] hover:text-white hover:shadow-xl hover:shadow-[#007AFF]/30 transition-all active:scale-90"
          >
            0
          </button>
          <button
            onClick={() => handleUnlock()}
            disabled={loading || pin.length < 3}
            className="w-16 h-16 rounded-full bg-[#007AFF] text-white hover:bg-[#007AFF]/90 transition-all flex items-center justify-center active:scale-90 disabled:opacity-50"
          >
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ArrowRight size={24} />}
          </button>
        </div>

        <div className="mt-8 flex flex-col gap-4 text-center">
          <button
            onClick={() => {
              if (profile.role === 'ceo' || profile.role === 'owner') {
                const currentPinHint = profile.pin ? ` (PIN ya sasa ni: ${profile.pin})` : '';
                const newPin = prompt(`Weka PIN mpya${currentPinHint}:`);
                if (newPin && newPin.length >= 3 && newPin.length <= 6 && /^\d+$/.test(newPin)) {
                  import('firebase/firestore').then(async ({ doc, updateDoc }) => {
                    try {
                      await updateDoc(doc(db, 'users', profile.uid), { pin: newPin });
                      toast.success(`PIN imebadilishwa kuwa ${newPin}! Itumie sasa.`);
                    } catch (e) {
                      toast.error('Imeshindikana kubadili PIN.');
                    }
                  });
                } else if (newPin) {
                  toast.error('PIN lazima iwe namba 3 hadi 6.');
                }
              } else {
                toast.error('Tafadhali wasiliana na Meneja wako.');
              }
            }}
            className="text-[12px] font-bold text-[#007AFF] hover:underline"
          >
            Sahau PIN au Badili?
          </button>

          <button
            onClick={signOut}
            className="text-[12px] font-bold text-gray-400 hover:text-black transition-colors"
          >
            Back to Login (Logout)
          </button>
        </div>

        <div className="mt-12">
          <div className="bg-black/5 p-4 rounded-2xl border border-black/[0.03]">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed">
              Business: <span className="text-black font-black">{activeBusiness?.name}</span>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
