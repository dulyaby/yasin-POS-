import React, { useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { ProductProvider } from './context/ProductContext';
import { LanguageProvider } from './context/LanguageContext';
import { Auth } from './components/Auth';
import { Layout } from './components/Layout';
import { POS } from './components/POS';
import { Dashboard } from './components/Dashboard';
import { Inventory } from './components/Inventory';
import { Suppliers } from './components/Suppliers';
import { Expenses } from './components/Expenses';
import { Purchase } from './components/Purchase';
import { CashControl } from './components/CashControl';
import { Logs } from './components/Logs';
import { Reports } from './components/Reports';
import { Branches } from './components/Branches';
import { Transfers } from './components/Transfers';
import { SalesHistory } from './components/SalesHistory';
import { BossAI } from './components/BossAI';
import { StockControl } from './components/StockControl';
import { Accounting } from './components/Accounting';
import { LockScreen } from './components/LockScreen';
import { OnlineStatus } from './components/OnlineStatus';
import { ScreenFlash } from './components/ScreenFlash';
import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MobileUploader } from './components/MobileUploader';

import { AIProvider } from './context/AIContext';

const AppContent: React.FC = () => {
  // Handle mobile phone QR scanner upload session
  const urlParams = new URLSearchParams(window.location.search);
  const mobileSessionId = urlParams.get('session');
  if (mobileSessionId) {
    return (
      <MobileUploader 
        sessionId={mobileSessionId} 
        initialTarget={urlParams.get('target')} 
        bizParam={urlParams.get('biz')}
        staffParam={urlParams.get('staff')}
      />
    );
  }

  const { user, profile, loading, isLocked } = useAuth();
  const [activeTab, setActiveTab] = useState('pos');

  React.useEffect(() => {
    if (profile?.allowedFeatures && (profile.role === 'manager' || profile.role === 'cashier')) {
      const isCurrentlyAllowed = profile.allowedFeatures[activeTab] === true;
      if (!isCurrentlyAllowed) {
        const firstAllowed = Object.keys(profile.allowedFeatures).find(key => profile.allowedFeatures?.[key] === true);
        if (firstAllowed) {
          setActiveTab(firstAllowed);
        }
      }
    }
  }, [profile, activeTab]);

  React.useEffect(() => {
    if (user && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="w-12 h-12 border-4 border-[#007AFF] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return <Auth />;
  }

  if (isLocked) {
    return <LockScreen profile={profile} />;
  }
  
  const renderContent = () => {
    switch (activeTab) {
      case 'pos': return <POS />;
      case 'sales_history': return <SalesHistory />;
      case 'dashboard': return <Dashboard onNavigate={setActiveTab} />;
      case 'inventory': return <Inventory />;
      case 'stock_control': return <StockControl />;
      case 'transfers': return <Transfers />;
      case 'suppliers': return <Suppliers />;
      case 'expenses': return <Expenses />;
      case 'purchase': return <Purchase />;
      case 'cash_control': return <CashControl />;
      case 'reports': return <Reports />;
      case 'accounting': return <Accounting />;
      case 'branches': return <Branches />;
      case 'logs': return <Logs />;
      case 'boss_ai': return <BossAI />;
      default: return <POS />;
    }
  };

  return (
    <>
      <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
        <OnlineStatus />
        <ScreenFlash />
        {renderContent()}
      </Layout>
    </>
  );
};

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ProductProvider>
          <AIProvider>
            {/* High-Performance Clean Background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-[-1] bg-[#F5F5F7]" />
        
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
        <Toaster 
          position="top-right" 
          toastOptions={{
            error: {
              className: 'toast-error-glow',
              duration: 4000,
              style: {
                borderRadius: '24px',
                padding: '16px 24px',
                fontWeight: 'bold',
              }
            },
            success: {
              className: 'toast-success-glow',
              duration: 3000,
              style: {
                borderRadius: '24px',
                padding: '16px 24px',
                fontWeight: 'bold',
              }
            }
          }}
        />
        </AIProvider>
      </ProductProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
