import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, setDoc, getDoc, limit, getDocs, addDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, Business } from './types';
import { handleFirestoreError, OperationType } from './lib/firestore-utils';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  businesses: Business[];
  activeBusiness: Business | null;
  setActiveBusiness: (business: Business) => void;
  loading: boolean;
  isAuthReady: boolean;
  isGenesisMode: boolean;
  currentStaff: UserProfile | null;
  isLocked: boolean;
  lock: () => void;
  unlock: (pin: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  loginAsStaff: (identifier: string, pin: string, role: 'staff' | 'ceo') => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  businesses: [],
  activeBusiness: null,
  setActiveBusiness: () => {},
  loading: true,
  isAuthReady: false,
  isGenesisMode: false,
  currentStaff: null,
  isLocked: false,
  lock: () => {},
  unlock: async () => false,
  signOut: async () => {},
  loginAsStaff: async () => false,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusiness, setActiveBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isGenesisMode, setIsGenesisMode] = useState(false);
  const [currentStaff, setCurrentStaff] = useState<UserProfile | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    // Initial staff setup from profile when it loads
    if (profile && !currentStaff) {
      setCurrentStaff(profile);
    }
  }, [profile]);

  const lock = () => setIsLocked(true);

  const signOut = async () => {
    try {
      localStorage.removeItem('active_staff_id');
      localStorage.removeItem('active_local_staff_id');

      // Clear welcome screen session flags so next login (boss or staff) always shows welcome screen
      try {
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const key = sessionStorage.key(i);
          if (key && (key.startsWith('has_seen_welcome_') || key.includes('welcome'))) {
            sessionStorage.removeItem(key);
          }
        }
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('has_seen_welcome_') || key.includes('welcome'))) {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {
        console.error("Error clearing welcome keys on sign out:", e);
      }

      await auth.signOut();
      setUser(null);
      setProfile(null);
      setCurrentStaff(null);
      setIsLocked(false);
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  const loginAsStaff = async (identifier: string, pin: string, role: 'staff' | 'ceo'): Promise<boolean> => {
    try {
      setLoading(true);
      
      // 0. Try to find local staff first
      const localAccounts = JSON.parse(localStorage.getItem('local_accounts') || '[]');
      const matchedLocal = localAccounts.find((acc: any) => 
        acc.username?.toLowerCase() === identifier.toLowerCase() && 
        (acc.password === pin || acc.pin === pin) &&
        (acc.role === role || (role === 'staff' && acc.role !== 'ceo')) // Basic role heuristic
      );

      if (matchedLocal) {
        // Sign in anonymously in backend to back firestore queries
        try {
          if (!auth.currentUser) {
            await signInAnonymously(auth);
          }
        } catch (e: any) {
          if (e?.code === 'auth/admin-restricted-operation' || e?.message?.includes('admin-restricted-operation')) {
            console.log("Anonymous authentication is disabled in Firebase console config of this project. Proceeding in offline/local-only mode.");
          } else {
            console.warn("Silent anonymous trigger failed/skipped for local staff login:", e);
          }
        }

        try {
          sessionStorage.removeItem(`has_seen_welcome_${matchedLocal.uid}`);
        } catch (e) {}

        setCurrentStaff(matchedLocal);
        setProfile(matchedLocal);
        localStorage.setItem('active_local_staff_id', matchedLocal.uid);
        
        // Fetch and set activeBusiness for local staff
        const bId = matchedLocal.businessId || activeBusiness?.id || 'local_business';
        try {
          const bizDoc = await getDoc(doc(db, 'businesses', bId));
          if (bizDoc.exists()) {
            setActiveBusiness({ id: bizDoc.id, ...bizDoc.data() } as Business);
          } else {
            setActiveBusiness({ id: bId, name: 'Biashara ya POS' } as Business);
          }
        } catch (e) {
          console.error("Failed to restore business for local staff login", e);
          setActiveBusiness({ id: bId, name: 'Biashara ya POS' } as Business);
        }

        try {
          await addDoc(collection(db, 'audit_logs'), {
            type: 'login',
            cashierId: matchedLocal.uid,
            cashierName: matchedLocal.displayName || 'Staff',
            businessId: bId,
            timestamp: new Date().toISOString(),
            details: `${matchedLocal.displayName || 'Staff'} logged in as ${matchedLocal.role || 'Staff'} (Local Account)`
          });
        } catch (e) {
          console.error("Local audit log failed during staff login", e);
        }

        setLoading(false);
        return true;
      }
      
      // 1. Try to find staff by username or email
      const usersRef = collection(db, 'users');
      
      // We'll check for both email and username
      const q1 = query(usersRef, where('username', '==', identifier), where('pin', '==', pin));
      const q2 = query(usersRef, where('email', '==', identifier), where('pin', '==', pin));
      
      const [snap1, snap2] = await Promise.all([
        getDocs(q1).catch(() => ({ empty: true, docs: [] })),
        getDocs(q2).catch(() => ({ empty: true, docs: [] }))
      ]);
      
      const snapshot = !snap1.empty ? snap1 : snap2;
      
      if (!snapshot.empty) {
        const staffData = (snapshot as any).docs[0].data() as UserProfile;
        
        // If they are active
        if (staffData.isActive) {
          try {
            sessionStorage.removeItem(`has_seen_welcome_${staffData.uid}`);
          } catch (e) {}

          setCurrentStaff(staffData);
          setProfile(staffData);
          localStorage.setItem('active_staff_id', staffData.uid);
          
          // Fetch business
          const bizDoc = await getDoc(doc(db, 'businesses', staffData.businessId));
          if (bizDoc.exists()) {
            setActiveBusiness({ id: bizDoc.id, ...bizDoc.data() } as Business);
          }

          // Audit
          try {
            await addDoc(collection(db, 'audit_logs'), {
              type: 'login',
              cashierId: staffData.uid,
              cashierName: staffData.displayName || 'Staff',
              businessId: staffData.businessId,
              timestamp: new Date().toISOString(),
              details: `${staffData.displayName || 'Staff'} logged in as ${staffData.role || 'Staff'} via Credentials`
            });
          } catch (e) {
            console.error("Audit log failed during staff login", e);
          }

          setLoading(false);
          return true;
        }
      }
      
      setLoading(false);
      return false;
    } catch (err) {
      console.error("Staff Login Error:", err);
      setLoading(false);
      return false;
    }
  };

  const unlock = async (pin: string): Promise<boolean> => {
    try {
      if (!activeBusiness?.id) return false;
      
      // 0. Try to find local staff first
      const localAccounts = JSON.parse(localStorage.getItem('local_accounts') || '[]');
      const matchedLocal = localAccounts.find((acc: any) => 
        acc.isActive && (acc.pin === pin || acc.password === pin)
      );

      if (matchedLocal) {
        setCurrentStaff(matchedLocal);
        setProfile(matchedLocal);
        localStorage.setItem('active_local_staff_id', matchedLocal.uid);
        setIsLocked(false);
        
        try {
          await addDoc(collection(db, 'audit_logs'), {
            type: 'login',
            cashierId: matchedLocal.uid,
            cashierName: matchedLocal.displayName || 'Staff',
            businessId: activeBusiness.id,
            timestamp: new Date().toISOString(),
            details: `${matchedLocal.displayName || 'Staff'} unlocked session via PIN (Local Account)`
          });
        } catch (e) {
          console.error("Local unlock audit log failed", e);
        }

        return true;
      }
      
      const q = query(
        collection(db, 'users'),
        where('businessId', '==', activeBusiness.id),
        where('pin', '==', pin),
        where('isActive', '==', true)
      );
      
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const staffData = snapshot.docs[0].data() as UserProfile;
        setCurrentStaff(staffData);
        setIsLocked(false);
        
        // Audit login
        await addDoc(collection(db, 'audit_logs'), {
          type: 'login',
          cashierId: staffData.uid,
          cashierName: staffData.displayName || 'Staff',
          businessId: activeBusiness.id,
          timestamp: new Date().toISOString(),
          details: `${staffData.displayName || 'Staff'} unlocked session via PIN`
        });
        
        return true;
      }
      return false;
    } catch (err) {
      console.error("Unlock error:", err);
      return false;
    }
  };

  useEffect(() => {
    // Check if any users exist for Genesis Mode
    const checkGenesisMode = async () => {
      try {
        const usersQ = query(collection(db, 'users'), limit(1));
        const snapshot = await getDocs(usersQ);
        setIsGenesisMode(snapshot.empty);
      } catch (err) {
        console.error("Error checking genesis mode:", err);
      }
    };
    
    checkGenesisMode();

    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeBusinesses: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // If anonymous, check if we have a stored staff ID
        if (firebaseUser.isAnonymous) {
          const storedLocalStaffId = localStorage.getItem('active_local_staff_id');
          const storedStaffId = localStorage.getItem('active_staff_id');
          
          if (storedLocalStaffId) {
            const localAccounts = JSON.parse(localStorage.getItem('local_accounts') || '[]');
            const matchedLocal = localAccounts.find((a: any) => a.uid === storedLocalStaffId);
            if (matchedLocal) {
              setProfile(matchedLocal);
              setCurrentStaff(matchedLocal);
              
              if (matchedLocal.businessId) {
                try {
                  const bizDoc = await getDoc(doc(db, 'businesses', matchedLocal.businessId));
                  if (bizDoc.exists()) {
                    setActiveBusiness({ id: bizDoc.id, ...bizDoc.data() } as Business);
                  } else {
                    setActiveBusiness({ id: matchedLocal.businessId, name: 'Biashara ya POS' } as Business);
                  }
                } catch (e) {
                  console.error("Failed to restore business for local staff", e);
                  setActiveBusiness({ id: matchedLocal.businessId, name: 'Biashara ya POS' } as Business);
                }
              }
            }
          } else if (storedStaffId) {
            const staffDoc = await getDoc(doc(db, 'users', storedStaffId));
            if (staffDoc.exists()) {
              const profileData = staffDoc.data() as UserProfile;
              setProfile(profileData);
              setCurrentStaff(profileData);
              
              const bizDoc = await getDoc(doc(db, 'businesses', profileData.businessId));
              if (bizDoc.exists()) {
                setActiveBusiness({ id: bizDoc.id, ...bizDoc.data() } as Business);
              }
            }
          }
          setLoading(false);
          setIsAuthReady(true);
          return;
        }

        // Standard Auth (CEO/Google)
        // Clean up previous profile listener if it exists
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }
        if (unsubscribeBusinesses) {
          unsubscribeBusinesses();
          unsubscribeBusinesses = null;
        }

        // Listen to profile changes in real-time
        const docRef = doc(db, 'users', firebaseUser.uid);
        unsubscribeProfile = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            const profileData = docSnap.data() as UserProfile;
            
            // Check if there is an active local staff session we should preserve
            const storedLocalStaffId = localStorage.getItem('active_local_staff_id');
            if (storedLocalStaffId) {
              const localAccounts = JSON.parse(localStorage.getItem('local_accounts') || '[]');
              const matchedLocal = localAccounts.find((a: any) => a.uid === storedLocalStaffId);
              if (matchedLocal) {
                setProfile(matchedLocal);
                setCurrentStaff(matchedLocal);
              } else {
                setProfile(profileData);
              }
            } else {
              setProfile(profileData);
            }
            
            // Listen to businesses owned by this user or where they work
            const businessesQ = query(
              collection(db, 'businesses'),
              where('ownerUid', '==', firebaseUser.uid)
            );
            
            unsubscribeBusinesses = onSnapshot(businessesQ, (snapshot) => {
              const b: Business[] = [];
              snapshot.forEach((doc) => b.push({ id: doc.id, ...doc.data() } as Business));
              setBusinesses(b);
              
              if (b.length > 0) {
                const currentActive = b.find(biz => biz.id === profileData.businessId) || b[0];
                setActiveBusiness(currentActive);
              }
              setLoading(false);
              setIsAuthReady(true);
            }, (error) => {
              handleFirestoreError(error, OperationType.GET, 'businesses');
            });
          } else {
            // Profile doesn't exist, allow Auth.tsx to handle it
            setProfile(null);
            setLoading(false);
            setIsAuthReady(true);
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        });
      } else {
        // If firebaseUser is null but they have an active local session on browser refresh,
        // we restore their profile immediately on browser refresh if we have an active local session so they don't lock out.
        const storedLocalStaffId = localStorage.getItem('active_local_staff_id');
        if (storedLocalStaffId) {
          const localAccounts = JSON.parse(localStorage.getItem('local_accounts') || '[]');
          const matchedLocal = localAccounts.find((a: any) => a.uid === storedLocalStaffId);
          if (matchedLocal) {
            setProfile(matchedLocal);
            setCurrentStaff(matchedLocal);
            
            // Restore active business
            if (matchedLocal.businessId) {
              getDoc(doc(db, 'businesses', matchedLocal.businessId))
                .then(bizDoc => {
                  if (bizDoc.exists()) {
                    setActiveBusiness({ id: bizDoc.id, ...bizDoc.data() } as Business);
                  } else {
                    setActiveBusiness({ id: matchedLocal.businessId, name: 'Biashara ya POS' } as Business);
                  }
                })
                .catch(err => {
                  console.error("Failed to fetch business for active local session", err);
                  setActiveBusiness({ id: matchedLocal.businessId, name: 'Biashara ya POS' } as Business);
                });
            }
            
            setLoading(false);
            setIsAuthReady(true);
            return;
          }
        }

        setUser(null);
        setProfile(null);
        setCurrentStaff(null);
        setBusinesses([]);
        setActiveBusiness(null);
        localStorage.removeItem('active_staff_id');
        setLoading(false);
        setIsAuthReady(true);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
      if (unsubscribeBusinesses) unsubscribeBusinesses();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      businesses, 
      activeBusiness, 
      setActiveBusiness, 
      loading, 
      isAuthReady,
      isGenesisMode,
      currentStaff,
      isLocked,
      lock,
      unlock,
      signOut,
      loginAsStaff
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
