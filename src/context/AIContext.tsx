import React, { createContext, useContext, useState, useEffect } from 'react';

interface TITask {
  id: string;
  type: 'image' | 'voice' | 'excel' | 'report';
  status: 'processing' | 'completed' | 'error';
  label: string;
  startTime: number;
}

interface AIContextType {
  isTyping: boolean;
  activeTasks: TITask[];
  startTask: (type: TITask['type'], label: string) => string;
  endTask: (id: string, status?: TITask['status']) => void;
  runTask: <T>(type: TITask['type'], label: string, taskFn: () => Promise<T>) => Promise<T | undefined>;
  draftPurchases: any[];
  setDraftPurchases: React.Dispatch<React.SetStateAction<any[]>>;
  draftInventory: any[];
  setDraftInventory: React.Dispatch<React.SetStateAction<any[]>>;
}

const AIContext = createContext<AIContextType | undefined>(undefined);

export const AIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTasks, setActiveTasks] = useState<TITask[]>([]);
  const [draftPurchases, setDraftPurchases] = useState<any[]>([]);
  const [draftInventory, setDraftInventory] = useState<any[]>([]);

  // Load from localStorage on mount to handle refresh
  useEffect(() => {
    const savedTasks = localStorage.getItem('partner_active_tasks');
    const savedDrafts = localStorage.getItem('partner_draft_purchases');
    const savedInvDrafts = localStorage.getItem('partner_draft_inventory');
    
    if (savedTasks) {
      try {
        const tasks: TITask[] = JSON.parse(savedTasks);
        const freshTasks = tasks.filter(t => Date.now() - t.startTime < 300000);
        const persistentTasks = freshTasks.map(t => ({
          ...t,
          status: t.status === 'processing' ? 'error' as const : t.status 
        }));
        setActiveTasks(persistentTasks);
      } catch (e) {
        localStorage.removeItem('partner_active_tasks');
      }
    }
    
    if (savedDrafts) {
      try {
        setDraftPurchases(JSON.parse(savedDrafts));
      } catch (e) {
        localStorage.removeItem('partner_draft_purchases');
      }
    }

    if (savedInvDrafts) {
      try {
        setDraftInventory(JSON.parse(savedInvDrafts));
      } catch (e) {
        localStorage.removeItem('partner_draft_inventory');
      }
    }
  }, []);

  // Save to localStorage whenever tasks or drafts change
  useEffect(() => {
    localStorage.setItem('partner_active_tasks', JSON.stringify(activeTasks));
  }, [activeTasks]);

  useEffect(() => {
    localStorage.setItem('partner_draft_purchases', JSON.stringify(draftPurchases));
  }, [draftPurchases]);

  useEffect(() => {
    localStorage.setItem('partner_draft_inventory', JSON.stringify(draftInventory));
  }, [draftInventory]);

  const startTask = (type: TITask['type'], label: string) => {
    const id = Math.random().toString(36).substring(7);
    const newTask: TITask = {
      id,
      type,
      label,
      status: 'processing',
      startTime: Date.now()
    };
    setActiveTasks(prev => [...prev, newTask]);
    return id;
  };

  const endTask = (id: string, status: TITask['status'] = 'completed') => {
    setActiveTasks(prev => prev.filter(t => t.id !== id));
  };

  const runTask = async <T,>(type: TITask['type'], label: string, taskFn: () => Promise<T>): Promise<T | undefined> => {
    const id = startTask(type, label);
    try {
      const result = await taskFn();
      endTask(id, 'completed');
      return result;
    } catch (error) {
      console.error(`Task ${label} failed:`, error);
      endTask(id, 'error');
      throw error;
    }
  };

  const isTyping = activeTasks.length > 0;

  return (
    <AIContext.Provider value={{ 
      isTyping, 
      activeTasks, 
      startTask, 
      endTask, 
      runTask,
      draftPurchases,
      setDraftPurchases,
      draftInventory,
      setDraftInventory
    }}>
      {children}
    </AIContext.Provider>
  );
};

export const useAI = () => {
  const context = useContext(AIContext);
  if (context === undefined) {
    throw new Error('useAI must be used within an AIProvider');
  }
  return context;
};
