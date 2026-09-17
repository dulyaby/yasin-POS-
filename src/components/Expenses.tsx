import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  deleteDoc, 
  doc,
  updateDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import { Expense, ExpenseCategory } from '../types';
import { Plus, Receipt, Trash2, Wallet, Calendar, X, AlertCircle, Settings2, Edit2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO } from 'date-fns';
import { cn } from '../lib/utils';
import { logAuditEvent } from '../lib/auditLogger';

export const Expenses: React.FC = () => {
  const { profile, activeBusiness } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<ExpenseCategory | null>(null);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Form state
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const defaultCategories = ['Mishahara', 'Kodi', 'Umeme/Maji', 'Usafiri', 'Chakula', 'Mengineyo'];
  const allCategories = categories.length > 0 ? categories : defaultCategories.map(name => ({ id: name, name, businessId: '', isCustom: false }));

  const handleAddCategory = async () => {
    if (!newCategoryName.trim() || !activeBusiness?.id) return;
    try {
      await addDoc(collection(db, 'expenseCategories'), {
        name: newCategoryName.trim(),
        businessId: activeBusiness.id,
        isCustom: true
      });
      setNewCategoryName('');
      toast.success('Kundi limeongezwa!');
    } catch (error) {
      toast.error('Imeshindikana kuongeza kundi');
    }
  };

  const handleUpdateCategory = async (id: string, newName: string) => {
    try {
      await updateDoc(doc(db, 'expenseCategories', id), { name: newName });
      
      if (activeBusiness?.id) {
        logAuditEvent({
          businessId: activeBusiness.id,
          type: 'update',
          category: 'update',
          title: 'Kubadilisha Kundi la Matumizi',
          details: `Jina la kundi la matumizi limebadilishwa kuwa '${newName}' na ${profile?.displayName || 'Staff'}.`,
          cashierId: profile?.uid || 'unknown',
          cashierName: profile?.displayName || 'CEO',
          newValue: newName
        });
      }

      setEditingCategory(null);
      toast.success('Kundi limebadilishwa!');
    } catch (error) {
      toast.error('Imeshindikana kubadilisha kundi');
    }
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;
    const cat = categoryToDelete;
    try {
      await deleteDoc(doc(db, 'expenseCategories', cat.id));

      if (activeBusiness?.id) {
        logAuditEvent({
          businessId: activeBusiness.id,
          type: 'delete_category',
          category: 'delete',
          title: `Kufuta Kundi la Matumizi: ${cat.name}`,
          details: `Kundi la matumizi '${cat.name}' limefutwa na ${profile?.displayName || 'Staff'}.`,
          cashierId: profile?.uid || 'unknown',
          cashierName: profile?.displayName || 'CEO',
          originalValue: cat.name
        });
      }

      toast.success('Kundi limefutwa!');
      setCategoryToDelete(null);
    } catch (error) {
      toast.error('Imeshindikana kufuta kundi');
    }
  };

  useEffect(() => {
    if (!activeBusiness?.id) return;

    // Fetch Expenses
    const qExpenses = query(
      collection(db, 'expenses'),
      where('businessId', '==', activeBusiness.id)
    );

    const unsubscribeExpenses = onSnapshot(qExpenses, (snapshot) => {
      const exps: Expense[] = [];
      snapshot.forEach((doc) => {
        exps.push({ id: doc.id, ...doc.data() } as Expense);
      });
      exps.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setExpenses(exps);
    });

    // Fetch Categories
    const qCategories = query(
      collection(db, 'expenseCategories'),
      where('businessId', '==', activeBusiness.id)
    );

    const unsubscribeCategories = onSnapshot(qCategories, (snapshot) => {
      const cats: ExpenseCategory[] = [];
      snapshot.forEach((doc) => {
        cats.push({ id: doc.id, ...doc.data() } as ExpenseCategory);
      });
      setCategories(cats);
      
      // Set default category if none selected
      if (!category && cats.length > 0) {
        setCategory(cats[0].name);
      } else if (!category && defaultCategories.length > 0) {
        setCategory(defaultCategories[0]);
      }
    });

    return () => {
      unsubscribeExpenses();
      unsubscribeCategories();
    };
  }, [activeBusiness?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness?.id) return;
    setIsSaving(true);

    try {
      await addDoc(collection(db, 'expenses'), {
        description,
        amount: Number(amount),
        category,
        businessId: activeBusiness.id,
        timestamp: new Date().toISOString()
      });
      toast.success('Matumizi yamehifadhiwa!');
      setIsModalOpen(false);
      setDescription('');
      setAmount('');
      setCategory('Mengineyo');
    } catch (error) {
      toast.error('Imeshindikana kuhifadhi matumizi');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!expenseToDelete) return;
    const exp = expenses.find(e => e.id === expenseToDelete);
    try {
      await deleteDoc(doc(db, 'expenses', expenseToDelete));

      if (exp && activeBusiness?.id) {
        logAuditEvent({
          businessId: activeBusiness.id,
          type: 'delete_expense',
          category: 'delete',
          title: 'Kufuta Rekodi ya Matumizi',
          details: `Gharama ya Tsh ${exp.amount.toLocaleString()} (${exp.description} - ${exp.category}) imefutwa na ${profile?.displayName || 'Staff'}.`,
          cashierId: profile?.uid || 'unknown',
          cashierName: profile?.displayName || 'CEO',
          originalValue: exp.amount
        });
      }

      toast.success('Rekodi imefutwa!');
      setExpenseToDelete(null);
    } catch (error) {
      toast.error('Imeshindikana kufuta rekodi');
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-10 font-sans pb-10">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <h2 className="text-4xl font-sans font-black text-black tracking-tight">Matumizi (Expenses)</h2>
          <p className="text-gray-600 font-medium mt-1">Rekodi gharama zote za uendeshaji wa biashara yako</p>
        </motion.div>
        <div className="flex gap-4">
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="apple-button-secondary w-fit"
          >
            <Settings2 size={20} />
            Makundi
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="apple-button-primary w-fit"
          >
            <Plus size={20} />
            Rekodi Matumizi
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="apple-card p-8 bg-[#FF3B30]/5 border-[#FF3B30]/10"
        >
          <div className="w-12 h-12 bg-[#FF3B30]/10 text-[#FF3B30] rounded-2xl flex items-center justify-center mb-6 shadow-sm">
            <Wallet size={24} />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-600 mb-2">Jumla ya Matumizi</p>
          <h4 className="text-3xl font-sans font-black text-black tracking-tight">Tsh {totalExpenses.toLocaleString()}</h4>
          <p className="text-[11px] font-medium text-gray-600/60 mt-2">Gharama zote zilizorekodiwa</p>
        </motion.div>
      </div>

      <div className="apple-card overflow-hidden">
        <div className="p-8 border-b border-black/[0.05] bg-white/50 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-sans font-black text-black tracking-tight">Orodha ya Matumizi</h3>
            <p className="text-[11px] text-gray-600 font-bold uppercase tracking-widest mt-1">Rekodi za hivi karibuni</p>
          </div>
          <div className="bg-[#F2F2F7] px-4 py-2 rounded-full flex items-center gap-2 text-[11px] font-bold text-gray-600 uppercase tracking-widest">
            <Receipt size={14} />
            <span>{expenses.length} Rekodi</span>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.2em] text-gray-600 border-b border-black/[0.03]">
                <th className="px-8 py-5 font-bold">Maelezo</th>
                <th className="px-8 py-5 font-bold">Kundi</th>
                <th className="px-8 py-5 font-bold">Tarehe</th>
                <th className="px-8 py-5 font-bold">Kiasi</th>
                <th className="px-8 py-5 font-bold text-right">Vitendo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.02]">
              {expenses.map((expense) => (
                <tr key={expense.id} className="group hover:bg-black/[0.01] transition-all duration-300">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-[#F2F2F7] rounded-xl flex items-center justify-center text-gray-600 group-hover:bg-[#FF3B30]/10 group-hover:text-[#FF3B30] transition-all">
                        <Receipt size={18} />
                      </div>
                      <span className="font-bold text-black text-[15px]">{expense.description}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="px-3 py-1 bg-[#F2F2F7] text-gray-600 rounded-full text-[11px] font-bold uppercase tracking-wider">
                      {expense.category}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2 text-gray-600 font-medium text-[13px]">
                      <Calendar size={14} />
                      {format(parseISO(expense.timestamp), 'dd MMM, yyyy')}
                    </div>
                  </td>
                  <td className="px-8 py-6 text-[15px] font-black text-black">Tsh {expense.amount.toLocaleString()}</td>
                  <td className="px-8 py-6 text-right">
                    <button 
                      onClick={() => setExpenseToDelete(expense.id)}
                      className="p-2.5 text-[#FF3B30] bg-[#FF3B30]/5 hover:bg-[#FF3B30]/15 rounded-xl transition-all shadow-sm border border-[#FF3B30]/10 group"
                    >
                      <Trash2 size={18} className="group-hover:scale-110 transition-transform" />
                    </button>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-8 py-20 text-center">
                    <div className="w-20 h-20 bg-[#F2F2F7] rounded-[24px] flex items-center justify-center mx-auto mb-6 text-gray-600">
                      <Receipt size={32} />
                    </div>
                    <p className="text-gray-600 font-medium">Hakuna rekodi za matumizi bado.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white/90 backdrop-blur-xl p-10 rounded-[40px] max-w-md w-full shadow-2xl border border-white/20"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-sans font-black text-black tracking-tight">Rekodi Matumizi</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-[#F2F2F7] rounded-full transition-all">
                  <X size={20} className="text-gray-600" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-600 ml-1">Maelezo ya Matumizi</label>
                  <input
                    type="text"
                    required
                    className="apple-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Mfano: Umeme wa mwezi huu"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-600 ml-1">Kiasi (Tsh)</label>
                  <input
                    type="number"
                    required
                    className="apple-input"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-600 ml-1">Kundi (Category)</label>
                  <select
                    className="apple-input cursor-pointer"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {allCategories.map(cat => (
                      <option key={cat.id} value={cat.name}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex gap-4 pt-6">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 apple-button-secondary"
                  >
                    Ghairi
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 apple-button-primary"
                  >
                    {isSaving ? 'Inahifadhi...' : 'Hifadhi'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {expenseToDelete && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[110]">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white/90 backdrop-blur-xl p-10 rounded-[40px] max-w-sm w-full shadow-2xl border border-white/20 text-center"
            >
              <div className="w-20 h-20 bg-[#FF3B30]/10 text-[#FF3B30] rounded-[24px] flex items-center justify-center mx-auto mb-6 shadow-sm">
                <AlertCircle size={36} />
              </div>
              <h3 className="text-2xl font-sans font-black text-black mb-3 tracking-tight">Futa Rekodi?</h3>
              <p className="text-gray-600 font-medium mb-10 leading-relaxed">Una uhakika unataka kufuta rekodi hii ya matumizi? Kitendo hiki hakiwezi kurudishwa.</p>
              <div className="flex gap-4">
                <button
                  onClick={() => setExpenseToDelete(null)}
                  className="flex-1 apple-button-secondary"
                >
                  Hapana
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 bg-[#FF3B30] text-white font-bold rounded-2xl px-6 py-4 shadow-lg shadow-[#FF3B30]/20 hover:bg-[#D70015] transition-all active:scale-[0.97]"
                >
                  Futa
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Category Management Modal */}
      <AnimatePresence>
        {isCategoryModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white/90 backdrop-blur-xl p-10 rounded-[40px] max-w-md w-full shadow-2xl border border-white/20 flex flex-col max-h-[80vh]"
            >
              <div className="flex items-center justify-between mb-8 shrink-0">
                <div>
                  <h3 className="text-2xl font-sans font-black text-black tracking-tight">Makundi ya Matumizi</h3>
                  <p className="text-[11px] text-gray-600 font-bold uppercase tracking-widest mt-1">Ongeza au badilisha makundi</p>
                </div>
                <button onClick={() => setIsCategoryModalOpen(false)} className="p-2 hover:bg-[#F2F2F7] rounded-full transition-all">
                  <X size={20} className="text-gray-600" />
                </button>
              </div>

              <div className="space-y-4 mb-8 shrink-0">
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="apple-input"
                    placeholder="Jina la kundi jipya..."
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  />
                  <button 
                    onClick={handleAddCategory}
                    className="p-4 bg-[#007AFF] text-white rounded-2xl hover:bg-[#0056b3] transition-all"
                  >
                    <Plus size={24} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                {categories.length === 0 && (
                  <div className="text-center py-10 bg-black/[0.02] rounded-3xl border border-dashed border-black/10">
                    <p className="text-sm text-gray-500 font-medium">Hakuna makundi uliyoongeza.</p>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest leading-loose">Makundi ya kawaida yataonyeshwa.</p>
                  </div>
                )}
                {categories.map((cat) => (
                  <div key={cat.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-black/[0.05] shadow-sm group">
                    {editingCategory?.id === cat.id ? (
                      <input
                        autoFocus
                        className="flex-1 text-[15px] font-bold text-black border-none bg-transparent p-0 focus:ring-0"
                        value={editingCategory.name}
                        onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                        onBlur={() => handleUpdateCategory(cat.id, editingCategory.name)}
                        onKeyDown={(e) => e.key === 'Enter' && handleUpdateCategory(cat.id, editingCategory.name)}
                      />
                    ) : (
                      <span className="text-[15px] font-bold text-black">{cat.name}</span>
                    )}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => setEditingCategory(cat)}
                        className="p-2 text-gray-400 hover:text-[#007AFF] hover:bg-[#007AFF]/10 rounded-xl transition-all"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => setCategoryToDelete(cat)}
                        className="p-2 text-gray-400 hover:text-[#FF3B30] hover:bg-[#FF3B30]/10 rounded-xl transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-6 border-t border-black/[0.05] shrink-0">
                <button
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="w-full apple-button-primary"
                >
                  Imekamilika
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Category Delete Confirmation Modal */}
      <AnimatePresence>
        {categoryToDelete && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[110]">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white/90 backdrop-blur-xl p-10 rounded-[40px] max-w-sm w-full shadow-2xl border border-white/20 text-center"
            >
              <div className="w-20 h-20 bg-[#FF3B30]/10 text-[#FF3B30] rounded-[24px] flex items-center justify-center mx-auto mb-6 shadow-sm">
                <AlertCircle size={36} />
              </div>
              <h3 className="text-2xl font-sans font-black text-black mb-3 tracking-tight">Futa Kundi?</h3>
              <p className="text-gray-600 font-medium mb-10 leading-relaxed">
                Una uhakika unataka kufuta kundi la <span className="font-bold text-black">"{categoryToDelete.name}"</span>? 
                Kitendo hiki hakiathiri matumizi yaliyokwisha rekodiwa.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setCategoryToDelete(null)}
                  className="flex-1 apple-button-secondary"
                >
                  Hapana
                </button>
                <button
                  onClick={handleDeleteCategory}
                  className="flex-1 bg-[#FF3B30] text-white font-bold rounded-2xl px-6 py-4 shadow-lg shadow-[#FF3B30]/20 hover:bg-[#D70015] transition-all active:scale-[0.97]"
                >
                  Futa
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
