import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { 
  X, 
  Smartphone, 
  Copy, 
  Check, 
  ExternalLink, 
  Loader2, 
  Sparkles, 
  Camera, 
  CheckCircle2, 
  RefreshCw,
  Zap,
  ArrowRight,
  HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast from 'react-hot-toast';

interface QRUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: 'inventory' | 'purchase';
  title?: string;
  subtitle?: string;
  onImageReceived: (base64Image: string) => Promise<void> | void;
}

export const QRUploadModal: React.FC<QRUploadModalProps> = ({
  isOpen,
  onClose,
  target,
  title,
  subtitle,
  onImageReceived
}) => {
  const { profile, activeBusiness } = useAuth();
  const [sessionId, setSessionId] = useState<string>('');
  const [uploadUrl, setUploadUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [receivedImage, setReceivedImage] = useState<string | null>(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<'waiting' | 'received' | 'processing' | 'done'>('waiting');
  
  const hasTriggeredRef = useRef(false);

  // Initialize fresh session when modal opens
  useEffect(() => {
    if (!isOpen || !activeBusiness?.id) return;

    hasTriggeredRef.current = false;
    setReceivedImage(null);
    setIsProcessingAI(false);
    setSessionStatus('waiting');

    const newSessionId = `qr_${target}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setSessionId(newSessionId);

    const fullUrl = `${window.location.origin}/?session=${newSessionId}&target=${target}&biz=${encodeURIComponent(activeBusiness.id)}&staff=${encodeURIComponent(profile?.displayName || 'Cashier')}`;
    setUploadUrl(fullUrl);

    // Create session document in Firestore
    const sessionDocRef = doc(db, 'qr_upload_sessions', newSessionId);
    setDoc(sessionDocRef, {
      id: newSessionId,
      businessId: activeBusiness.id,
      businessName: activeBusiness.name || 'Duka Langu',
      ceoId: (activeBusiness as any).ownerId || (activeBusiness as any).ceoId || profile?.uid || 'ceo',
      staffId: profile?.uid || 'staff',
      staffName: profile?.displayName || 'Staff',
      target,
      status: 'pending',
      createdAt: new Date().toISOString()
    }).catch(err => console.error("Error creating QR session doc:", err));

    // Listen for mobile upload
    const unsubscribe = onSnapshot(sessionDocRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === 'completed' && data.imageUrl && !hasTriggeredRef.current) {
          hasTriggeredRef.current = true;
          setReceivedImage(data.imageUrl);
          setSessionStatus('received');
          
          // Play notification sound
          try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
            osc.start();
            osc.stop(ctx.currentTime + 0.35);
          } catch (e) {
            // Audio ignore
          }

          toast.success('Picha imepokelewa kutoka kwenye simu! Partner anasoma bidhaa...', { icon: '📸' });
          setIsProcessingAI(true);
          setSessionStatus('processing');

          try {
            await onImageReceived(data.imageUrl);
            setSessionStatus('done');
            setTimeout(() => {
              onClose();
            }, 1200);
          } catch (err) {
            console.error("Error processing received image:", err);
            toast.error("Partner amepata tatizo kusoma picha hii.");
            setIsProcessingAI(false);
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen, target, activeBusiness?.id, profile?.uid, profile?.displayName]);

  const handleCopyLink = () => {
    if (!uploadUrl) return;
    navigator.clipboard.writeText(uploadUrl);
    setIsCopied(true);
    toast.success('Link imenakiliwa! Unaweza kuituma WhatsApp au SMS.');
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleOpenLocalTest = () => {
    window.open(uploadUrl, '_blank');
  };

  if (!isOpen) return null;

  const modalTitle = title || (target === 'inventory' ? 'Scan Mzigo Mpya kwa Simu (Stoo)' : 'Scan Risiti ya Manunuzi kwa Simu');
  const modalSubtitle = subtitle || (target === 'inventory' 
    ? 'Elekeza simu yako kwenye QR Code kupiga picha ya mzigo/bidhaa. Picha itatumwa moja kwa moja hapa na Partner ataandika bidhaa zote stoo.'
    : 'Elekeza simu yako kwenye QR Code kupiga picha ya risiti au invoice ya manunuzi. Partner ataingiza vitu vyote kiotomatiki.');

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-black/10 flex flex-col"
        >
          {/* Header */}
          <div className="p-6 border-b border-black/[0.06] flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center">
                <Smartphone size={22} />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-lg leading-tight">
                  {modalTitle}
                </h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] font-bold text-[#007AFF] uppercase tracking-wider bg-[#007AFF]/10 px-2 py-0.5 rounded-md">
                    {target === 'inventory' ? 'Stoo ya Bidhaa' : 'Purchase / Manunuzi'}
                  </span>
                  <span className="text-xs text-gray-500">
                    Akaunti: {activeBusiness?.name}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-black/5 hover:bg-black/10 text-gray-600 hover:text-black flex items-center justify-center transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Modal Content */}
          <div className="p-6 flex flex-col items-center text-center">
            {receivedImage ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full flex flex-col items-center"
              >
                <div className="relative w-48 h-48 rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-xl mb-4 bg-black/5 flex items-center justify-center">
                  <img 
                    src={receivedImage} 
                    alt="Picha Iliyopokelewa" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 right-2 bg-emerald-500 text-white p-1 rounded-full shadow-md">
                    <Check size={16} />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-emerald-600 font-black text-lg mb-1">
                  <CheckCircle2 size={22} />
                  Picha Imepokelewa!
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 size={16} className="animate-spin text-[#007AFF]" />
                  <span>Partner AI inasoma bidhaa na bei zilizopo kwenye picha...</span>
                </div>
              </motion.div>
            ) : (
              <>
                <p className="text-xs text-gray-600 max-w-sm mb-5 leading-relaxed">
                  {modalSubtitle}
                </p>

                {/* QR Code Container */}
                <div className="p-5 bg-white rounded-3xl shadow-xl border border-gray-100 relative group mb-5">
                  <div className="bg-white p-2 rounded-2xl">
                    {uploadUrl ? (
                      <QRCodeSVG
                        value={uploadUrl}
                        size={210}
                        level="M"
                        includeMargin={false}
                      />
                    ) : (
                      <div className="w-[210px] h-[210px] flex items-center justify-center">
                        <Loader2 className="animate-spin text-[#007AFF]" size={32} />
                      </div>
                    )}
                  </div>

                  {/* Pulse Indicator */}
                  <div className="absolute -top-2.5 -right-2.5 bg-emerald-500 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded-full shadow-md flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                    Live Scan
                  </div>
                </div>

                {/* Step Instructions */}
                <div className="w-full bg-gray-50 rounded-2xl p-4 border border-black/[0.05] text-left mb-4 space-y-2">
                  <div className="flex items-start gap-2.5 text-xs text-gray-700">
                    <span className="w-5 h-5 rounded-full bg-black text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                    <span>Fungua kamera ya simu na uielekeze kwenye QR Code hii.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-xs text-gray-700">
                    <span className="w-5 h-5 rounded-full bg-black text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                    <span>Bofya link kwenye simu: Chagua <strong>"Take a photo"</strong> kupiga picha au <strong>"Upload"</strong> kutoka galari.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-xs text-gray-700">
                    <span className="w-5 h-5 rounded-full bg-[#007AFF] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                    <span>Bonyeza <strong>"Upload Now"</strong> kwenye simu — picha itaonekana hapa papo hapo!</span>
                  </div>
                </div>

                {/* Direct Link Options */}
                <div className="flex items-center gap-2 w-full">
                  <button
                    onClick={handleCopyLink}
                    className="flex-1 py-2.5 px-3 rounded-xl border border-gray-200 hover:bg-gray-50 active:scale-[0.98] text-gray-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
                  >
                    {isCopied ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                    {isCopied ? 'Link Imenakiliwa!' : 'Nakili Link ya Simu'}
                  </button>

                  <button
                    onClick={handleOpenLocalTest}
                    title="Fungua kwenye tab mpya kujaribu"
                    className="py-2.5 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-[0.98] text-gray-700 text-xs font-bold flex items-center gap-1 transition-all"
                  >
                    <ExternalLink size={15} />
                    Fungua Tab Mpya
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Footer Info */}
          <div className="p-4 bg-gray-50 border-t border-black/[0.06] flex items-center justify-between text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Inasubiri picha kutoka kwenye simu...
            </span>
            <span>QR Session: {sessionId ? sessionId.slice(-8) : ''}</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
