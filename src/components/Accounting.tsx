import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Lock, 
  Shield, 
  Key, 
  AlertCircle, 
  Check, 
  Smartphone,
  Eye,
  EyeOff,
  UserCheck,
  Users,
  ShieldAlert,
  Plus,
  X,
  Loader2,
  ShieldCheck,
  MoreHorizontal
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { doc, updateDoc, collection, query, where, onSnapshot, setDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { cn } from '../lib/utils';
import { logAuditEvent } from '../lib/auditLogger';
import { UserProfile, UserPermissions, AuditLog } from '../types';

// Electric Blue Luxury Switch (from IAM)
const PermissionSwitch: React.FC<{
  enabled: boolean;
  onChange: (val: boolean) => void;
  label: string;
  description: string;
}> = ({ enabled, onChange, label, description }) => {
  return (
    <div className="flex items-center justify-between p-4 bg-white/50 rounded-2xl border border-black/[0.03] transition-all hover:bg-white/80">
      <div className="flex flex-col">
        <span className="text-[14px] font-black text-black tracking-tight">{label}</span>
        <span className="text-[11px] text-gray-500 font-medium">{description}</span>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={cn(
          "relative w-14 h-8 rounded-full transition-all duration-500 ease-out p-1",
          enabled ? "bg-[#007AFF] shadow-[0_0_20px_rgba(0,122,255,0.4)]" : "bg-gray-200"
        )}
      >
        <motion.div
          animate={{ x: enabled ? 24 : 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="w-6 h-6 bg-white rounded-full shadow-lg flex items-center justify-center overflow-hidden"
        >
          {enabled && (
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-1.5 h-1.5 bg-[#007AFF] rounded-full"
            />
          )}
        </motion.div>
        
        {enabled && (
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 rounded-full bg-white ring-4 ring-[#007AFF]/20"
          />
        )}
      </button>
    </div>
  );
};

export const Accounting: React.FC = () => {
  const { profile, activeBusiness, lock } = useAuth();
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Staff Account Management state
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addUsername, setAddUsername] = useState('');
  const [addRole, setAddRole] = useState('Cashier');
  const [addPin, setAddPin] = useState('');
  const [addPassword, setAddPassword] = useState('');

  // Local Accounts management state
  const [localStaff, setLocalStaff] = useState<UserProfile[]>([]);
  const [editingLocalStaff, setEditingLocalStaff] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState('Cashier');
  const [editAllowedFeatures, setEditAllowedFeatures] = useState<Record<string, boolean>>({});

  const [localAllowedFeatures, setLocalAllowedFeatures] = useState<Record<string, boolean>>({
    pos: true,
    sales_history: true,
    expenses: true,
  });

  const AVAILABLE_FEATURES = [
    { id: 'pos', name: 'Mauzo (POS)', desc: 'Kufanya mauzo na malipo kwenye kaunta' },
    { id: 'sales_history', name: 'Historia ya Mauzo', desc: 'Kuhariri na kuona stakabadhi za mauzo' },
    { id: 'dashboard', name: 'Dashboard', desc: 'Kuona ripoti za haraka na chati' },
    { id: 'inventory', name: 'Stoo (Stock)', desc: 'Kusimamia idadi ya bidhaa stoo' },
    { id: 'stock_control', name: 'Stock Control', desc: 'Control na ukaguzi wa bidhaa' },
    { id: 'transfers', name: 'Uhamisho (Transfers)', desc: 'Kuhama bidhaa kwenda tawi jingine' },
    { id: 'suppliers', name: 'Suppliers', desc: 'Kusajili na kusimamia wauzaji wa jumla' },
    { id: 'expenses', name: 'Matumizi', desc: 'Weka na kurekodi matumizi ya biashara' },
    { id: 'purchase', name: 'Purchase', desc: 'Kununua mzigo mpya' },
    { id: 'cash_control', name: 'Cash Control', desc: 'Kusimamia mafuta ya droo' },
    { id: 'reports', name: 'Ripoti ya Kina', desc: 'Kuona faida na ripoti kubwa za duka' },
    { id: 'accounting', name: 'Accounting Control', desc: 'Kufunga session na kubadili PIN' },
    { id: 'branches', name: 'Maduka (Branches)', desc: 'Kuona na kubadili matawi' },
    { id: 'logs', name: 'Void Logs', desc: 'Kuona miamala iliyofutwa' },
    { id: 'boss_ai', name: 'Partner Assistant', desc: 'AI partner msaidizi kwenye biashara' }
  ];

  // Load local accounts on mount
  useEffect(() => {
    const loaded = JSON.parse(localStorage.getItem('local_accounts') || '[]');
    setLocalStaff(loaded);
  }, []);

  // Staff PIN & Permission management state
  const [editingStaff, setEditingStaff] = useState<UserProfile | null>(null);
  const [staffNewPin, setStaffNewPin] = useState('');
  const [selectedStaffForPermissions, setSelectedStaffForPermissions] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!activeBusiness?.id) return;
    const q = query(collection(db, 'users'), where('businessId', '==', activeBusiness.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const s: UserProfile[] = [];
      snapshot.forEach(doc => {
        const u = doc.data() as UserProfile;
        if (u.role !== 'ceo') s.push(u);
      });
      setStaff(s);
    });
    return () => unsubscribe();
  }, [activeBusiness?.id]);

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid) return;

    if (currentPinInput !== profile.pin) {
      toast.error('PIN ya sasa si sahihi.');
      return;
    }

    if (newPinInput.length !== 4) {
      toast.error('PIN mpya lazima iwe namba 4.');
      return;
    }

    if (newPinInput !== confirmPinInput) {
      toast.error('PIN mpya na marudio hazifanani.');
      return;
    }

    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        pin: newPinInput
      });
      toast.success('PIN yako imesasishwa kikamilifu!');
      setIsChangingPin(false);
      setCurrentPinInput('');
      setNewPinInput('');
      setConfirmPinInput('');
    } catch (err) {
      toast.error('Imeshindikana kusasisha PIN.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateLocalAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName || !addUsername || !addPassword) {
      toast.error('Tafadhali jaza maelezo yote.');
      return;
    }

    if (addPassword.length < 3) {
      toast.error('Password lazima iwe na tarakimu 3 au zaidi.');
      return;
    }

    setIsSaving(true);
    try {
      const newLocalStaffId = 'local_' + Date.now();
      
      const newStaffMember: UserProfile = {
        uid: newLocalStaffId,
        email: `${addUsername}@local.ai`,
        username: addUsername,
        displayName: addName,
        pin: addPassword,
        password: addPassword,
        role: addRole.toLowerCase() as any, // 'manager' or 'cashier'
        businessId: activeBusiness?.id || 'local',
        createdAt: new Date().toISOString(),
        permissions: {
          view_real_profit: addRole.toLowerCase() === 'manager',
          edit_buying_price: addRole.toLowerCase() === 'manager',
          void_transaction: addRole.toLowerCase() === 'manager',
          view_stock_valuation: addRole.toLowerCase() === 'manager',
          expense_entry: true,
        },
        isActive: true,
        allowedFeatures: { ...localAllowedFeatures }
      };

      const updatedList = [...localStaff, newStaffMember];
      localStorage.setItem('local_accounts', JSON.stringify(updatedList));
      setLocalStaff(updatedList);
      
      toast.success('Akaunti ya POS imesajiliwa kikamilifu!');
      setIsAddAccountModalOpen(false);
      
      // Reset form variables
      setAddName('');
      setAddUsername('');
      setAddPassword('');
      setAddRole('Cashier');
      setLocalAllowedFeatures({
        pos: true,
        sales_history: true,
        expenses: true,
      });
    } catch (err) {
      toast.error('Imeshindikana kuongeza akaunti.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateLocalAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocalStaff) return;
    if (!editName || !editUsername || !editPassword) {
      toast.error('Tafadhali jaza maelezo yote.');
      return;
    }

    setIsSaving(true);
    try {
      const updatedList = localStaff.map(member => {
        if (member.uid === editingLocalStaff.uid) {
          return {
            ...member,
            displayName: editName,
            username: editUsername,
            pin: editPassword,
            password: editPassword,
            role: editRole.toLowerCase() as any,
            allowedFeatures: { ...editAllowedFeatures }
          };
        }
        return member;
      });

      localStorage.setItem('local_accounts', JSON.stringify(updatedList));
      setLocalStaff(updatedList);
      
      toast.success('Akaunti imesasishwa kikamilifu!');
      setEditingLocalStaff(null);
    } catch (err) {
      toast.error('Imeshindikana kusasisha akaunti.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteLocalAccount = (uid: string) => {
    if (!confirm('Je, una uhakika unataka kufuta kabisa akaunti hii? Hakuna kurudi nyuma.')) return;
    
    try {
      const updatedList = localStaff.filter(member => member.uid !== uid);
      localStorage.setItem('local_accounts', JSON.stringify(updatedList));
      setLocalStaff(updatedList);
      toast.success('Akaunti imefutwa!');
      if (editingLocalStaff?.uid === uid) {
        setEditingLocalStaff(null);
      }
    } catch (err) {
      toast.error('Imeshindikana kufuta akaunti.');
    }
  };

  const togglePermission = async (staffId: string, permission: keyof UserPermissions, currentState: boolean) => {
    try {
      const staffRef = doc(db, 'users', staffId);
      const targetStaff = staff.find(s => s.uid === staffId);
      if (!targetStaff) return;

      const updatedPermissions = {
        ...targetStaff.permissions,
        [permission]: !currentState
      };

      await updateDoc(staffRef, { permissions: updatedPermissions });
      toast.success('Mabadiliko yamehifadhiwa!');

      if (activeBusiness?.id) {
        logAuditEvent({
          businessId: activeBusiness.id,
          type: 'permission_change',
          category: 'security',
          title: `Kubadilisha Ruhusa za Mfanyakazi: ${targetStaff.displayName}`,
          details: `${profile?.displayName || 'CEO'} amebadilisha ruhusa ya '${permission}' kwa ${targetStaff.displayName} (${currentState ? 'Imezimwa' : 'Imewashwa'}).`,
          cashierId: profile?.uid || 'unknown',
          cashierName: profile?.displayName || 'CEO',
          notifyCeo: true
        });
      }
    } catch (err) {
      toast.error('Imeshindikana kuhifadhi mabadiliko.');
    }
  };

  const handleUpdateStaffPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff) return;

    if (staffNewPin.length !== 4) {
      toast.error('PIN lazima iwe namba 4.');
      return;
    }

    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', editingStaff.uid), {
        pin: staffNewPin
      });

      if (activeBusiness?.id) {
        logAuditEvent({
          businessId: activeBusiness.id,
          type: 'pin_change',
          category: 'security',
          title: `Kubadilisha PIN ya Mfanyakazi: ${editingStaff.displayName}`,
          details: `PIN ya usalama ya ${editingStaff.displayName} (${editingStaff.role}) imesasishwa na ${profile?.displayName || 'CEO'}.`,
          cashierId: profile?.uid || 'unknown',
          cashierName: profile?.displayName || 'CEO',
          notifyCeo: true
        });
      }

      toast.success(`PIN ya ${editingStaff.displayName} imesasishwa!`);
      setEditingStaff(null);
      setStaffNewPin('');
    } catch (err) {
      toast.error('Imeshindikana kusasisha PIN.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-6"
      >
        <div>
          <h2 className="text-4xl font-black tracking-tight text-black uppercase">Accounting Control</h2>
          <p className="text-gray-500 font-medium mt-1">Usimamizi wa Kifedha, Usalama wa Session na PIN za Boss.</p>
        </div>
        
        <button 
          onClick={() => setIsAddAccountModalOpen(true)}
          className="apple-button-primary bg-black text-white hover:bg-black/90 flex items-center justify-center gap-2 py-4 px-8 shadow-xl shadow-black/10"
        >
          <Plus size={20} />
          <span>Sajili Account Mpya</span>
        </button>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Session Lock Control */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-[40px] border border-black/[0.05] p-10 flex flex-col justify-between gap-8 shadow-xl shadow-black/[0.02]"
        >
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-[#5856D6]/10 rounded-[30px] flex items-center justify-center text-[#5856D6]">
              <Lock size={40} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-black tracking-tight">Usalama wa Session</h3>
              <p className="text-gray-500 font-medium mt-1">Funga session yako sasa hivi ili kuzuia matumizi yasiyoruhusiwa biashara ikiwa wazi.</p>
            </div>
          </div>
          
          <div className="p-6 bg-[#5856D6]/5 rounded-3xl border border-[#5856D6]/10">
            <div className="flex items-start gap-4">
              <AlertCircle className="text-[#5856D6] shrink-0 mt-0.5" size={20} />
              <p className="text-sm text-[#5856D6] font-medium leading-relaxed">
                Ukifunga session, mfumo utahitaji PIN yako (au ya staff yeyote mwenye ruhusa) ili kuendelea na mauzo. Hii ni muhimu kama unaondoka kwenye kaunta kwa muda.
              </p>
            </div>
          </div>

          <button 
            onClick={() => {
              lock();
              toast.success('Session imefungwa!');
            }}
            className="w-full apple-button-primary bg-[#5856D6] text-white hover:bg-[#4845B8] py-6 text-xl flex items-center justify-center gap-3 shadow-xl shadow-[#5856D6]/30"
          >
            <Lock size={24} />
            <span>Funga Session (Lock)</span>
          </button>
        </motion.div>

        {/* PIN Management */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-[40px] border border-black/[0.05] p-10 shadow-xl shadow-black/[0.02]"
        >
          {!isChangingPin ? (
            <div className="flex flex-col h-full justify-between gap-8">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-[#007AFF]/10 rounded-[30px] flex items-center justify-center text-[#007AFF]">
                  <Shield size={40} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-black tracking-tight">PIN ya Boss (CEO)</h3>
                  <p className="text-gray-500 font-medium mt-1">PIN hii inatumika kufungua session na kukubali void transactions.</p>
                </div>
              </div>

              <div className="bg-black/5 rounded-3xl p-8 border border-black/[0.05]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Smartphone className="text-gray-400" size={24} />
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Status ya PIN</p>
                      <p className="text-lg font-black text-black mt-1">Umeshaseti PIN ya Usalama</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-2xl font-black tracking-widest text-[#007AFF]">****</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setIsChangingPin(true)}
                className="w-full apple-button-primary bg-black text-white py-6 text-xl flex items-center justify-center gap-3"
              >
                <Key size={24} />
                <span>Badilisha PIN Yako</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-black text-black tracking-tight">Sasisha PIN yako</h3>
                <button 
                  onClick={() => setIsChangingPin(false)}
                  className="p-2 bg-black/5 rounded-full"
                >
                  <EyeOff size={20} />
                </button>
              </div>

              <form onSubmit={handleUpdatePin} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-black uppercase tracking-widest ml-1">PIN ya Sasa</label>
                  <div className="relative group">
                    <input 
                      type={showPin ? "text" : "password"}
                      required
                      maxLength={4}
                      value={currentPinInput}
                      onChange={e => setCurrentPinInput(e.target.value.replace(/\D/g, ''))}
                      className="apple-input bg-black/5 border-transparent focus:bg-white text-xl font-mono tracking-[0.5em] pl-6"
                      placeholder="••••"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showPin ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-black uppercase tracking-widest ml-1">PIN Mpya</label>
                  <input 
                    type="password"
                    required
                    maxLength={4}
                    value={newPinInput}
                    onChange={e => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                    className="apple-input bg-black/5 border-transparent focus:bg-white text-xl font-mono tracking-[0.5em] pl-6"
                    placeholder="••••"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[11px] font-black text-black uppercase tracking-widest ml-1">Rudia PIN Mpya</label>
                  <input 
                    type="password"
                    required
                    maxLength={4}
                    value={confirmPinInput}
                    onChange={e => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
                    className="apple-input bg-black/5 border-transparent focus:bg-white text-xl font-mono tracking-[0.5em] pl-6"
                    placeholder="••••"
                  />
                </div>

                <div className="flex gap-4 pt-2">
                  <button 
                    type="button"
                    onClick={() => setIsChangingPin(false)}
                    className="flex-1 apple-button-secondary py-5 text-lg font-bold"
                  >
                    Ghairi
                  </button>
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="flex-[2] apple-button-primary bg-[#007AFF] text-white py-5 text-lg flex items-center justify-center gap-3"
                  >
                    {isSaving ? <Smartphone className="animate-spin" size={20} /> : <Check size={24} />}
                    <span>Sasisha PIN</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </motion.div>
      </div>

      {/* Local Accounts Management */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-[40px] border border-black/[0.05] p-10 shadow-xl shadow-black/[0.02]"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <Users size={24} className="text-[#007AFF]" />
            <div>
              <h3 className="text-2xl font-black text-black tracking-tight">Menejimenti ya Akaunti za POS</h3>
              <p className="text-xs text-gray-500 font-bold">Akaunti zilizohifadhiwa hapa kwenye POS na ruhusa zao za kuwa kurasa gani azione.</p>
            </div>
          </div>
          
          <button 
            type="button"
            onClick={() => {
              setLocalAllowedFeatures({
                pos: true,
                sales_history: true,
                expenses: true,
              });
              setIsAddAccountModalOpen(true);
            }}
            className="px-6 py-3 bg-[#007AFF] text-white rounded-2xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-[#007AFF]/20 hover:bg-[#007AFF]/90 transition-all flex items-center gap-2"
          >
            <Plus size={16} />
            Sajili Account Mpya
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {localStaff.map((member) => (
            <div key={member.uid} className="p-8 bg-black/[0.02] rounded-[32px] border border-black/[0.03] flex flex-col justify-between gap-6 hover:shadow-lg transition-all relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#007AFF]/5 to-transparent pointer-events-none rounded-full" />
              
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center font-black text-white text-lg shadow-md shrink-0">
                    {member.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-black leading-tight">{member.displayName}</h4>
                    <p className="text-xs text-gray-500 font-bold mt-0.5">@{member.username}</p>
                  </div>
                </div>
                
                <span className={cn(
                  "px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                  member.role === 'manager' 
                    ? "bg-[#007AFF]/10 text-[#007AFF]" 
                    : "bg-[#5856D6]/10 text-[#5856D6]"
                )}>
                  {member.role}
                </span>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-black/[0.03] pb-2">
                  <span className="text-[11px] font-black text-gray-400 uppercase tracking-wider mt-1">Neno la siri / PIN</span>
                  <span className="font-mono text-sm font-black text-black bg-black/[0.04] px-3 py-1 rounded-lg">{member.password || member.pin}</span>
                </div>
                
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Kurasa Anazoweza Kuona (Allowed Pages)</span>
                  <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto custom-scrollbar">
                    {AVAILABLE_FEATURES.map((feat) => {
                      const isAllowed = member.allowedFeatures?.[feat.id] === true;
                      if (!isAllowed) return null;
                      return (
                        <span key={feat.id} className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-200/50 rounded-lg px-2.5 py-1 text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          {feat.name}
                        </span>
                      );
                    })}
                    {(!member.allowedFeatures || Object.values(member.allowedFeatures).filter(Boolean).length === 0) && (
                      <span className="text-[11px] text-red-500 font-bold">Haijaruhusiwa kuona ukurasa wowote bado</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => {
                    setEditingLocalStaff(member);
                    setEditName(member.displayName);
                    setEditUsername(member.username || '');
                    setEditPassword(member.password || member.pin || '');
                    setEditRole(member.role === 'manager' ? 'Manager' : 'Cashier');
                    setEditAllowedFeatures(member.allowedFeatures || {});
                  }}
                  className="flex-1 py-3.5 bg-black text-white hover:bg-black/95 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95"
                >
                  Hariri / Tweak
                </button>
                <button 
                  onClick={() => handleDeleteLocalAccount(member.uid)}
                  className="px-4 py-3.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all flex items-center justify-center shrink-0 active:scale-95"
                  title="Futa Akaunti"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
          
          {localStaff.length === 0 && (
            <div className="col-span-full py-16 text-center text-gray-400 bg-black/[0.01] rounded-[32px] border-2 border-dashed border-black/[0.05]">
              <Users size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="font-bold text-gray-600">Hakuna Akaunti ya Kifaa Hiki iliyosajiliwa.</p>
              <p className="text-xs text-gray-400 mt-1">Bofya kitufe cha "Sajili Account Mpya" ili kuongeza wasifu wa Manager au Cashier na kuchagua cha kuona.</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Edit Local Account Modal */}
      <AnimatePresence>
        {editingLocalStaff && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingLocalStaff(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="bg-white rounded-[48px] shadow-2xl w-full max-w-2xl relative overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 border-b border-black/[0.05] flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-black text-black tracking-tight">Hariri Akaunti</h3>
                  <p className="text-xs text-gray-500 font-medium">Badilisha maelezo na uchague tena cha kuona.</p>
                </div>
                <button 
                  onClick={() => setEditingLocalStaff(null)}
                  className="p-3 bg-black/5 rounded-full hover:bg-black/10 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleUpdateLocalAccount} className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-black uppercase tracking-widest ml-1">Jina Kamili</label>
                    <input 
                      required
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="apple-input bg-black/5 border-transparent focus:bg-white"
                      placeholder="Jina la Mfanyakazi"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-black uppercase tracking-widest ml-1">Username / ID ya Kuingia</label>
                    <input 
                      required
                      type="text"
                      value={editUsername}
                      onChange={e => setEditUsername(e.target.value)}
                      className="apple-input bg-black/5 border-transparent focus:bg-white"
                      placeholder="ID ya login"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-black uppercase tracking-widest ml-1">Neno la Siri (Password/PIN)</label>
                    <input 
                      required
                      type="text"
                      value={editPassword}
                      onChange={e => setEditPassword(e.target.value)}
                      className="apple-input bg-black/5 border-transparent focus:bg-white text-md font-mono"
                      placeholder="Weka password au PIN"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-black uppercase tracking-widest ml-1">Cheo / Role (Cheo)</label>
                    <select
                      value={editRole}
                      onChange={e => setEditRole(e.target.value)}
                      className="apple-input bg-black/5 border-transparent focus:bg-white h-[58px]"
                    >
                      <option value="Manager">Manager</option>
                      <option value="Cashier">Cashier</option>
                    </select>
                  </div>
                </div>

                {/* Choose what to see */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-black uppercase tracking-widest ml-1">Chagua Kurasa za Kuona (Choose what to see)</h4>
                  <p className="text-[11px] text-gray-500 font-medium">Bofya vitufe ili kuwasha (Aone) au kuzima (Asione):</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto custom-scrollbar p-1 border border-black/5 rounded-2xl bg-black/[0.01]">
                    {AVAILABLE_FEATURES.map((feat) => {
                      const isSelected = editAllowedFeatures[feat.id] === true;
                      return (
                        <button
                          type="button"
                          key={feat.id}
                          onClick={() => {
                            setEditAllowedFeatures(prev => ({
                              ...prev,
                              [feat.id]: !prev[feat.id]
                            }));
                          }}
                          className={cn(
                            "p-3 rounded-xl border text-left flex items-center justify-between transition-all",
                            isSelected 
                              ? "bg-[#007AFF]/10 border-[#007AFF] text-[#007AFF]" 
                              : "bg-white border-black/[0.05] hover:bg-black/[0.01] text-gray-500"
                          )}
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <span className="text-[12px] font-black leading-none">{feat.name}</span>
                            <span className="text-[9px] opacity-75 truncate mt-1">{feat.desc}</span>
                          </div>
                          <div className={cn(
                            "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all",
                            isSelected 
                              ? "bg-[#007AFF] border-transparent text-white" 
                              : "bg-white border-black/10 text-transparent"
                          )}>
                            <Check size={10} strokeWidth={3} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-4 pt-4 border-t border-black/[0.05]">
                  <button 
                    type="button" 
                    onClick={() => setEditingLocalStaff(null)}
                    className="flex-1 py-4 font-bold text-gray-500 text-sm hover:bg-black/5 rounded-2xl transition-all"
                  >
                    Ghairi
                  </button>
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="flex-[2] apple-button-primary bg-black text-white py-4 font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-95"
                  >
                    {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Check size={20} />}
                    <span>Hifadhi Mabadiliko</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Account Modal */}
      <AnimatePresence>
        {isAddAccountModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddAccountModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="bg-white rounded-[48px] shadow-2xl w-full max-w-2xl relative overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-8 border-b border-black/[0.05] flex items-center justify-between">
                <div>
                  <h3 className="text-3xl font-black text-black tracking-tight">Sajili Akaunti Mpya</h3>
                  <p className="text-xs text-gray-500 font-medium">Sajili wafanyakazi wako na uchague kurasa wanazoweza kuziona.</p>
                </div>
                <button 
                  onClick={() => setIsAddAccountModalOpen(false)}
                  className="p-3 bg-black/5 rounded-full hover:bg-black/10 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateLocalAccount} className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-black uppercase tracking-widest ml-1">Jina Kamili</label>
                    <input 
                      required
                      type="text"
                      value={addName}
                      onChange={e => setAddName(e.target.value)}
                      className="apple-input bg-black/5 border-transparent focus:bg-white"
                      placeholder="Mfano: Juma Hamisi"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-black uppercase tracking-widest ml-1">Username (ID ya kuingia)</label>
                    <input 
                      required
                      type="text"
                      value={addUsername}
                      onChange={e => setAddUsername(e.target.value)}
                      className="apple-input bg-black/5 border-transparent focus:bg-white"
                      placeholder="Mfano: juma123"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-black uppercase tracking-widest ml-1">Password ya Kuingia (Neno la Siri / PIN)</label>
                    <input 
                      required
                      type="text"
                      value={addPassword}
                      onChange={e => setAddPassword(e.target.value)}
                      className="apple-input bg-black/5 border-transparent focus:bg-white text-md font-mono"
                      placeholder="Mfano: 2244 au siri123"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-black uppercase tracking-widest ml-1">Cheo / Role (Cheo)</label>
                    <select
                      value={addRole}
                      onChange={e => setAddRole(e.target.value)}
                      className="apple-input bg-black/5 border-transparent focus:bg-white h-[58px]"
                    >
                      <option value="Manager">Manager</option>
                      <option value="Cashier">Cashier</option>
                    </select>
                  </div>
                </div>

                {/* Choose what to see */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-black uppercase tracking-widest ml-1">Chagua Kurasa za Kuona (Choose what to see)</h4>
                  <p className="text-[11px] text-gray-500 font-medium">Bofya vitufe ili kuwasha kurasa ambazo akaunti hii itaruhusiwa kuona kwenye Sidebar:</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto custom-scrollbar p-1 border border-black/5 rounded-2xl bg-black/[0.01]">
                    {AVAILABLE_FEATURES.map((feat) => {
                      const isSelected = localAllowedFeatures[feat.id] === true;
                      return (
                        <button
                          type="button"
                          key={feat.id}
                          onClick={() => {
                            setLocalAllowedFeatures(prev => ({
                              ...prev,
                              [feat.id]: !prev[feat.id]
                            }));
                          }}
                          className={cn(
                            "p-3 rounded-xl border text-left flex items-center justify-between transition-all",
                            isSelected 
                              ? "bg-[#007AFF]/10 border-[#007AFF] text-[#007AFF]" 
                              : "bg-white border-black/[0.05] hover:bg-black/[0.01] text-gray-500"
                          )}
                        >
                          <div className="flex flex-col min-w-0 pr-2">
                            <span className="text-[12px] font-black leading-none">{feat.name}</span>
                            <span className="text-[9px] opacity-75 truncate mt-1">{feat.desc}</span>
                          </div>
                          <div className={cn(
                            "w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all",
                            isSelected 
                              ? "bg-[#007AFF] border-transparent text-white" 
                              : "bg-white border-black/10 text-transparent"
                          )}>
                            <Check size={10} strokeWidth={3} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-5 bg-[#007AFF]/5 rounded-3xl border border-[#007AFF]/10 flex gap-4">
                  <AlertCircle className="text-[#007AFF] shrink-0 mt-1" size={20} />
                  <p className="text-xs text-blue-800 font-medium leading-relaxed">
                    Akaunti hii itahifadhiwa kwenye kifaa hiki (Offline/POS). Ataingia kwa kutumia **Username** na **Password** yake.
                  </p>
                </div>

                <div className="flex gap-4 pt-4 border-t border-black/[0.05]">
                  <button 
                    type="button" 
                    onClick={() => setIsAddAccountModalOpen(false)}
                    className="flex-1 py-4 font-bold text-gray-500 text-sm hover:bg-black/5 rounded-2xl transition-all"
                  >
                    Ghairi
                  </button>
                  <button 
                    type="submit"
                    disabled={isSaving}
                    className="flex-[2] apple-button-primary bg-black text-white py-4 font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-95"
                  >
                    {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Check size={20} />}
                    <span>Kamilisha Usajili</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

