import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { compressImage } from '../lib/imageCompressor';
import { 
  Camera, 
  Upload, 
  CheckCircle2, 
  RefreshCw, 
  Smartphone, 
  Sparkles, 
  Store, 
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import toast, { Toaster } from 'react-hot-toast';

interface MobileUploaderProps {
  sessionId: string;
  initialTarget?: string | null;
  bizParam?: string | null;
  staffParam?: string | null;
}

export const MobileUploader: React.FC<MobileUploaderProps> = ({ 
  sessionId, 
  initialTarget,
  bizParam,
  staffParam 
}) => {
  const [sessionData, setSessionData] = useState<any>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Listen to the session document in real time
  useEffect(() => {
    if (!sessionId) {
      setErrorMsg('Namba ya QR session haipo au haitambuliki.');
      setLoadingSession(false);
      return;
    }

    const docRef = doc(db, 'qr_upload_sessions', sessionId);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      setLoadingSession(false);
      if (snap.exists()) {
        const data = snap.data();
        setSessionData(data);
        if (data.status === 'completed' && !selectedFile) {
          setIsCompleted(true);
        }
      } else {
        // Fallback to params if doc not yet created
        setSessionData({
          target: initialTarget || 'inventory',
          businessId: bizParam || 'Default',
          staffName: staffParam ? decodeURIComponent(staffParam) : 'Mfanyakazi'
        });
      }
    }, (err) => {
      console.error('Session listener error:', err);
      setLoadingSession(false);
      // Still allow upload using fallback params
      setSessionData({
        target: initialTarget || 'inventory',
        businessId: bizParam || 'Default',
        staffName: staffParam ? decodeURIComponent(staffParam) : 'Mfanyakazi'
      });
    });

    return () => unsubscribe();
  }, [sessionId, initialTarget, bizParam, staffParam]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setIsCompleted(false);
  };

  const handleUploadNow = async () => {
    if (!selectedFile) {
      toast.error('Tafadhali chagua au piga picha kwanza!');
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading('Inabana na kutuma picha kwenye POS...');

    try {
      // Compress mobile image to high-clarity ~200KB sharp JPEG
      const compressedBase64 = await compressImage(selectedFile, 1280, 0.78);

      const docRef = doc(db, 'qr_upload_sessions', sessionId);
      await updateDoc(docRef, {
        status: 'completed',
        imageUrl: compressedBase64,
        uploadedAt: new Date().toISOString(),
        uploadedFrom: 'mobile_web'
      });

      setIsCompleted(true);
      setSelectedFile(null);
      setPreviewUrl(null);
      toast.success('Picha imetumwa kikamilifu kwenye POS!', { id: toastId });
    } catch (err: any) {
      console.error('Failed to upload image:', err);
      toast.error('Hitilafu ya kutuma picha. Tafadhali jaribu tena.', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  const isInventory = (sessionData?.target || initialTarget) === 'inventory';
  const targetTitle = isInventory ? 'Kuingiza Bidhaa Stoo' : 'Risiti ya Manunuzi (Purchase)';
  const targetBadge = isInventory ? 'Stoo ya Bidhaa' : 'Purchase / Manunuzi';

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 border-4 border-[#007AFF] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-700 font-bold text-lg">Inaunganisha na kompyuta ya POS...</p>
        <p className="text-gray-600 text-sm mt-1">Subiri sekunde chache</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex flex-col justify-between max-w-lg mx-auto shadow-2xl overflow-hidden font-sans">
      <Toaster position="top-center" />

      {/* Top Header */}
      <div className="bg-white border-b border-black/[0.08] px-5 py-4 flex items-center justify-between sticky top-0 z-20 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center font-black">
            <Smartphone size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-[#007AFF] bg-[#007AFF]/10 px-2 py-0.5 rounded-md">
                {targetBadge}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                POS Ipo Hewani
              </span>
            </div>
            <h1 className="text-base font-black text-gray-900 mt-0.5 leading-tight">
              {sessionData?.businessName || 'Smart POS Scanner'}
            </h1>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[11px] text-gray-600 block">Aliyeomba:</span>
          <span className="text-xs font-bold text-gray-800">
            {sessionData?.staffName || 'Mfanyakazi'}
          </span>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-5 flex-1 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {isCompleted ? (
            <motion.div
              key="completed-state"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-8 border border-black/[0.06] shadow-xl text-center flex flex-col items-center"
            >
              <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-5 shadow-inner">
                <CheckCircle2 size={44} className="animate-bounce" />
              </div>

              <span className="px-3 py-1 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-full uppercase tracking-wider border border-emerald-200">
                Imepokelewa kwenye POS
              </span>

              <h2 className="text-2xl font-black text-gray-900 mt-4 mb-2 tracking-tight">
                Picha Imefika Salama!
              </h2>

              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                Kompyuta ya POS imepokea picha hii na <strong>Partner AI</strong> anasoma bidhaa na bei moja kwa moja. Unaweza kutazama matokeo kwenye skrini ya POS.
              </p>

              <button
                onClick={() => {
                  setIsCompleted(false);
                  setSelectedFile(null);
                  setPreviewUrl(null);
                }}
                className="w-full py-3.5 px-6 rounded-2xl bg-[#007AFF] hover:bg-[#0066CC] active:scale-[0.98] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#007AFF]/25 transition-all"
              >
                <RefreshCw size={18} />
                Pakia Picha Nyingine
              </button>
            </motion.div>
          ) : previewUrl ? (
            <motion.div
              key="preview-state"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white rounded-3xl p-6 border border-black/[0.06] shadow-xl flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-gray-900 font-bold text-sm">
                  <ImageIcon size={18} className="text-[#007AFF]" />
                  Hakiki Picha Uliyochagua
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewUrl(null);
                  }}
                  className="text-xs text-red-600 hover:text-red-700 font-bold px-2 py-1 bg-red-50 rounded-lg"
                >
                  Badilisha
                </button>
              </div>

              <div className="relative w-full h-80 rounded-2xl overflow-hidden bg-black/5 border border-black/10 flex items-center justify-center mb-5">
                <img
                  src={previewUrl}
                  alt="Uhakiki wa Picha"
                  className="w-full h-full object-contain"
                />
              </div>

              <p className="text-xs text-gray-600 text-center mb-5">
                Hakikisha maandishi au bidhaa zote zinaonekana wazi kabla ya kubonyeza kitufe cha kutuma.
              </p>

              {/* Upload Now Button */}
              <button
                onClick={handleUploadNow}
                disabled={isUploading}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#007AFF] to-[#0055D4] hover:from-[#0066CC] hover:to-[#004BB8] active:scale-[0.98] text-white font-black text-base flex items-center justify-center gap-3 shadow-xl shadow-[#007AFF]/30 transition-all disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <RefreshCw size={22} className="animate-spin" />
                    Inatuma Kwenye POS...
                  </>
                ) : (
                  <>
                    <Upload size={22} />
                    Upload Now (Pakia Sasa)
                  </>
                )}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="select-state"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white rounded-3xl p-6 border border-black/[0.06] shadow-xl flex flex-col"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#007AFF]/15 to-purple-500/15 text-[#007AFF] flex items-center justify-center mx-auto mb-3">
                  <Sparkles size={32} />
                </div>
                <h2 className="text-xl font-black text-gray-900 tracking-tight">
                  {targetTitle}
                </h2>
                <p className="text-gray-600 text-xs mt-1.5 leading-relaxed">
                  Piga picha au chagua picha ya risiti/mzigo kutoka kwenye simu yako. Picha itatumwa moja kwa moja kwenye POS alipo scan.
                </p>
              </div>

              {/* Hidden file inputs */}
              <input
                type="file"
                ref={galleryInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <input
                type="file"
                ref={cameraInputRef}
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Two Requested Selection Buttons */}
              <div className="space-y-3.5">
                {/* Take a Photo Button */}
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full py-4 px-5 rounded-2xl bg-black hover:bg-gray-900 text-white font-bold text-sm flex items-center justify-between shadow-lg shadow-black/15 active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                      <Camera size={22} className="text-white" />
                    </div>
                    <div className="text-left">
                      <span className="block font-black text-sm">Take a photo (Piga Picha)</span>
                      <span className="block text-[11px] text-gray-300">Tumia kamera ya simu papo hapo</span>
                    </div>
                  </div>
                  <ArrowRight size={18} className="text-white/60" />
                </button>

                {/* Upload from Gallery Button */}
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="w-full py-4 px-5 rounded-2xl bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-[#007AFF] text-gray-900 font-bold text-sm flex items-center justify-between shadow-xs active:scale-[0.98] transition-all"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center">
                      <Upload size={22} />
                    </div>
                    <div className="text-left">
                      <span className="block font-black text-sm">Upload (Chagua Picha)</span>
                      <span className="block text-[11px] text-gray-600">Kutoka kwenye faili au picha za simu</span>
                    </div>
                  </div>
                  <ArrowRight size={18} className="text-gray-400" />
                </button>
              </div>

              <div className="mt-8 pt-5 border-t border-black/[0.06] flex items-center justify-center gap-2 text-gray-600 text-xs">
                <ShieldCheck size={16} className="text-emerald-600" />
                <span>Salama • Imeunganishwa moja kwa moja na POS</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Info */}
      <div className="p-4 text-center text-gray-600 text-[11px] bg-white/60 backdrop-blur-md border-t border-black/[0.04]">
        Smart POS & Partner AI • Simu Upload System
      </div>
    </div>
  );
};
