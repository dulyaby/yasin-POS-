import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'sw' | 'en';

export interface Translations {
  [key: string]: {
    sw: string;
    en: string;
  };
}

export const translations: Translations = {
  // Brand & Subtitle
  nav_brand: { sw: 'Partner', en: 'Partner' },
  nav_assistant: { sw: 'Msaidizi wa Partner', en: 'Partner Assistant' },

  // Navigation
  nav_partner: { sw: 'Partner AI', en: 'Partner AI' },
  nav_pos: { sw: 'Mauzo (POS)', en: 'Sales (POS)' },
  nav_sales_history: { sw: 'Historia ya Mauzo', en: 'Sales History' },
  nav_dashboard: { sw: 'Dashibodi', en: 'Dashboard' },
  nav_inventory: { sw: 'Stoo (Stock)', en: 'Inventory (Stock)' },
  nav_stock_control: { sw: 'Udhibiti wa Stoo', en: 'Stock Control' },
  nav_transfers: { sw: 'Uhamisho (Transfers)', en: 'Transfers' },
  nav_suppliers: { sw: 'Wasambazaji', en: 'Suppliers' },
  nav_expenses: { sw: 'Matumizi', en: 'Expenses' },
  nav_purchase: { sw: 'Manunuzi (Purchases)', en: 'Purchases' },
  nav_cash_control: { sw: 'Udhibiti wa Pesa', en: 'Cash Control' },
  nav_reports: { sw: 'Ripoti', en: 'Reports' },
  nav_accounting: { sw: 'Uhasibu', en: 'Accounting' },
  nav_branches: { sw: 'Maduka (Branches)', en: 'Branches' },
  nav_logs: { sw: 'Kumbukumbu (Void Logs)', en: 'Void Logs' },

  // Roles
  role_owner: { sw: 'Mmiliki', en: 'Owner' },
  role_manager: { sw: 'Meneja', en: 'Manager' },
  role_cashier: { sw: 'Keshia', en: 'Cashier' },
  role_ceo: { sw: 'Mkurugenzi (CEO)', en: 'CEO' },

  // General Actions & Terms
  search: { sw: 'Tafuta...', en: 'Search...' },
  save: { sw: 'Hifadhi', en: 'Save' },
  cancel: { sw: 'Ghairi', en: 'Cancel' },
  delete: { sw: 'Futa', en: 'Delete' },
  edit: { sw: 'Hariri', en: 'Edit' },
  add: { sw: 'Ongeza', en: 'Add' },
  close: { sw: 'Funga', en: 'Close' },
  print: { sw: 'Chapisha', en: 'Print' },
  share: { sw: 'Shiriki', en: 'Share' },
  logout: { sw: 'Ondoka', en: 'Sign Out' },
  confirm: { sw: 'Thibitisha', en: 'Confirm' },
  loading: { sw: 'Inapakia...', en: 'Loading...' },
  success: { sw: 'Imekamilika', en: 'Completed' },
  error: { sw: 'Hitilafu', en: 'Error' },
  install_app: { sw: 'Sakinisha App', en: 'Install App' },
  for_best_exp: { sw: 'Kwa matumizi bora', en: 'For best experience' },
  for_better_experience: { sw: 'Kwa matumizi bora', en: 'For best experience' },
  select_shop: { sw: 'Chagua Duka', en: 'Select Shop' },
  your_shops: { sw: 'Maduka Yako', en: 'Your Shops' },
  add_shop: { sw: 'Ongeza Duka Jipya', en: 'Add New Shop' },
  active_session: { sw: 'Kipindi Kinachoendelea', en: 'Active Session' },
  date: { sw: 'Tarehe', en: 'Date' },
  amount: { sw: 'Kiasi', en: 'Amount' },
  status: { sw: 'Hali', en: 'Status' },
  notes: { sw: 'Maelezo', en: 'Notes' },
  category: { sw: 'Kundi', en: 'Category' },
  actions: { sw: 'Vitendo', en: 'Actions' },
  all: { sw: 'Zote', en: 'All' },
  filter: { sw: 'Chuja', en: 'Filter' },

  // Dashboard Page
  dash_welcome: { sw: 'Karibu', en: 'Welcome' },
  dash_all_shops: { sw: 'Muhtasari wa maduka yote', en: 'Summary of all branches' },
  dash_shop_status: { sw: 'Hali ya duka la', en: 'Status of' },
  dash_today_revenue: { sw: 'Mauzo ya Leo', en: "Today's Revenue" },
  dash_today_sales_count: { sw: 'Idadi ya Mauzo Leo', en: "Today's Sales Count" },
  dash_total_profit: { sw: 'Faida Halisi (Net)', en: 'Real Net Profit' },
  dash_stock_items: { sw: 'Bidhaa Stoo', en: 'Stock Items' },
  dash_low_stock_notice: { sw: 'zimepungua', en: 'low in stock' },
  dash_stock_alert: { sw: 'Tahadhari ya Stoo', en: 'Stock Alert' },
  dash_low_stock_alert: { sw: 'Bidhaa zimepungua', en: 'Products low in stock' },
  dash_quick_pos: { sw: 'Fanya Mauzo', en: 'Make Sale' },
  dash_quick_inventory: { sw: 'Ingiza Bidhaa', en: 'Add Product' },
  dash_quick_expenses: { sw: 'Rekodi Gharama', en: 'Record Expense' },
  dash_quick_reports: { sw: 'Angalia Ripoti', en: 'View Reports' },
  dash_daily_report_btn: { sw: 'Ripoti ya Leo', en: "Today's Report" },
  dash_sales_trend: { sw: 'Mwelekeo wa Mauzo (Siku 7 Zilizopita)', en: 'Sales Trend (Last 7 Days)' },
  dash_top_products: { sw: 'Bidhaa Zinazoongoza kwa Mauzo', en: 'Top Selling Products' },
  dash_recent_transactions: { sw: 'Miamala ya Hivi Karibuni', en: 'Recent Transactions' },
  dash_category_distribution: { sw: 'Mgawanyo wa Bidhaa kwa Kundi', en: 'Products by Category' },
  dash_since_start: { sw: 'Tangu kuanza', en: 'Since start' },
  dash_after_expenses: { sw: 'Baada ya kutoa gharama', en: 'After expenses deducted' },

  // Sales History
  sh_title: { sw: 'Historia ya Mauzo', en: 'Sales History' },
  sh_subtitle: { sw: 'Kumbukumbu kamili za mauzo, marekebisho na risiti', en: 'Full record of sales, adjustments, and receipts' },
  sh_all_tabs: { sw: 'Mauzo Yote', en: 'All Sales' },
  sh_regular_tabs: { sw: 'Ya Kawaida', en: 'Regular' },
  sh_discount_tabs: { sw: 'Yenye Punguzo', en: 'Discounted' },
  sh_filter_cashier: { sw: 'Cashier Wote', en: 'All Cashiers' },
  sh_filter_start: { sw: 'Kuanzia', en: 'From Date' },
  sh_filter_end: { sw: 'Mpaka', en: 'To Date' },
  sh_search_placeholder: { sw: 'Tafuta kwa risiti au jina la bidhaa...', en: 'Search by receipt or product name...' },
  sh_sale_details: { sw: 'Maelezo ya Mauzo', en: 'Sale Details' },
  sh_items_sold: { sw: 'Bidhaa Zilizouzwa', en: 'Items Sold' },
  sh_adjustments_history: { sw: 'Historia ya Marekebisho', en: 'Adjustment History' },

  // Inventory Page
  inv_title: { sw: 'Stoo ya Bidhaa', en: 'Product Inventory' },
  inv_subtitle: { sw: 'Simamia bidhaa na kiasi kilichopo stoo', en: 'Manage products and current stock levels' },
  inv_template: { sw: 'Template', en: 'Template' },
  inv_upload_excel: { sw: 'Pakia Excel', en: 'Upload Excel' },
  inv_uploading: { sw: 'Inapakia...', en: 'Uploading...' },
  inv_demo_data: { sw: 'Demo Data', en: 'Demo Data' },
  inv_delete_all: { sw: 'Futa Zote', en: 'Delete All' },
  inv_add_product: { sw: 'Ingiza Bidhaa', en: 'Add Product' },
  inv_scanner: { sw: 'Partner Scanner', en: 'Partner Scanner' },
  inv_total_products: { sw: 'Jumla ya Bidhaa', en: 'Total Products' },
  inv_selling_valuation: { sw: 'Thamani ya Mauzo', en: 'Selling Valuation' },
  inv_cost_valuation: { sw: 'Thamani ya Mtaji', en: 'Capital Valuation' },
  inv_expected_profit: { sw: 'Faida Inayotarajiwa', en: 'Expected Profit' },
  inv_low_stock: { sw: 'Zilizo Chini', en: 'Low Stock' },
  inv_out_of_stock: { sw: 'Zilizoisha', en: 'Out of Stock' },
  inv_search_placeholder: { sw: 'Tafuta kwa jina la bidhaa au kundi...', en: 'Search by product name or category...' },
  inv_product_name: { sw: 'Jina la Bidhaa', en: 'Product Name' },
  inv_selling_price: { sw: 'Bei ya Kuuza', en: 'Selling Price' },
  inv_cost_price: { sw: 'Bei ya Kununua', en: 'Cost Price' },
  inv_stock_qty: { sw: 'Idadi (Stock)', en: 'Stock Quantity' },
  inv_unit: { sw: 'Kipimo', en: 'Unit' },
  inv_expiry_date: { sw: 'Tarehe ya Kuisha', en: 'Expiry Date' },
  inv_threshold: { sw: 'Kiwango cha Tahadhari', en: 'Alert Threshold' },

  // Stock Control
  sc_title: { sw: 'Udhibiti wa Stoo & Ukaguzi', en: 'Stock Control & Audit' },
  sc_subtitle: { sw: 'Hesabu na kurekebisha kiasi cha bidhaa zilizopo stoo', en: 'Count and reconcile actual physical inventory' },
  sc_record_adjustment: { sw: 'Weka Marekebisho', en: 'New Adjustment' },
  sc_product: { sw: 'Bidhaa', en: 'Product' },
  sc_current_quantity: { sw: 'Idadi ya Sasa', en: 'Current Qty' },
  sc_physical_count: { sw: 'Hesabu Halisi', en: 'Physical Count' },
  sc_difference: { sw: 'Tofauti', en: 'Variance' },
  sc_reason: { sw: 'Sababu', en: 'Reason' },

  // Transfers
  tr_title: { sw: 'Uhamisho wa Bidhaa', en: 'Product Transfers' },
  tr_subtitle: { sw: 'Hamisha bidhaa kati ya maduka au matawi', en: 'Transfer stock between stores and branches' },
  tr_new_transfer: { sw: 'Uhamisho Mpya', en: 'New Transfer' },
  tr_from_branch: { sw: 'Kutoka Duka', en: 'From Branch' },
  tr_to_branch: { sw: 'Kwenda Duka', en: 'To Branch' },
  tr_transfer_date: { sw: 'Tarehe ya Uhamisho', en: 'Transfer Date' },

  // Suppliers
  sup_title: { sw: 'Wasambazaji wa Bidhaa', en: 'Product Suppliers' },
  sup_subtitle: { sw: 'Simamia taarifa za wasambazaji na madeni', en: 'Manage suppliers and pending vendor balances' },
  sup_add_supplier: { sw: 'Ongeza Msambazaji', en: 'Add Supplier' },
  sup_name: { sw: 'Jina la Msambazaji', en: 'Supplier Name' },
  sup_contact: { sw: 'Mawasiliano / Simu', en: 'Phone / Contact' },
  sup_products: { sw: 'Bidhaa Wanazosambaza', en: 'Supplied Products' },
  sup_balance: { sw: 'Deni / Malipo', en: 'Outstanding Balance' },

  // Expenses
  exp_title: { sw: 'Matumizi ya Biashara', en: 'Business Expenses' },
  exp_subtitle: { sw: 'Rekodi na simamia matumizi ya kila siku', en: 'Record and track daily operational expenses' },
  exp_add_expense: { sw: 'Rekodi Matumizi', en: 'Record Expense' },
  exp_category: { sw: 'Kundi la Matumizi', en: 'Expense Category' },
  exp_amount: { sw: 'Kiasi (Tsh)', en: 'Amount (Tsh)' },
  exp_payee: { sw: 'Mlipwaji', en: 'Paid To / Payee' },

  // Purchases
  pur_title: { sw: 'Manunuzi ya Bidhaa', en: 'Stock Purchases' },
  pur_subtitle: { sw: 'Sajili manunuzi mapya kutoka kwa wasambazaji', en: 'Register stock purchases from vendors' },
  pur_new_purchase: { sw: 'Ingiza Manunuzi', en: 'New Purchase' },
  pur_invoice: { sw: 'Namba ya Ankara / Risiti', en: 'Invoice / Receipt No' },
  pur_cost: { sw: 'Gharama ya Jumla', en: 'Total Purchase Cost' },

  // Cash Control
  cc_title: { sw: 'Udhibiti wa Pesa (Cash Drawer)', en: 'Cash Drawer & Shift Control' },
  cc_subtitle: { sw: 'Usimamizi wa droo ya pesa, kuanza na kufunga shift', en: 'Cash drawer auditing, opening & closing shifts' },
  cc_open_shift: { sw: 'Fungua Droo / Shift', en: 'Open Drawer / Shift' },
  cc_close_shift: { sw: 'Funga Droo / Shift', en: 'Close Drawer / Shift' },
  cc_starting_cash: { sw: 'Pesa ya Kuanzia Droo', en: 'Starting Float' },
  cc_expected_cash: { sw: 'Pesa Inayotarajiwa', en: 'Expected Cash' },
  cc_counted_cash: { sw: 'Pesa Iliyohesabiwa', en: 'Counted Cash' },
  cc_discrepancy: { sw: 'Tofauti', en: 'Variance' },

  // Reports
  rep_title: { sw: 'Ripoti za Biashara', en: 'Business Reports' },
  rep_subtitle: { sw: 'Takwimu na ripoti za kifedha, faida, na mwenendo', en: 'Financial analytics, profit & loss, and performance' },
  rep_sales: { sw: 'Ripoti ya Mauzo', en: 'Sales Report' },
  rep_financial: { sw: 'Ripoti ya Kifedha', en: 'Financial Report' },
  rep_inventory: { sw: 'Ripoti ya Stoo', en: 'Inventory Report' },

  // Accounting
  acc_title: { sw: 'Uhasibu & Hesabu za Biashara', en: 'Accounting & Ledger' },
  acc_subtitle: { sw: 'Mizania, mapato, matumizi na mtiririko wa fedha', en: 'Balance sheet, income, expenses & cash flow' },

  // Branches
  br_title: { sw: 'Maduka & Matawi ya Biashara', en: 'Branches & Stores' },
  br_subtitle: { sw: 'Simamia maduka yako yote na matawi', en: 'Manage all branch locations and staff' },
  br_add_branch: { sw: 'Ongeza Duka Jipya', en: 'Add New Branch' },
  br_branch_name: { sw: 'Jina la Duka', en: 'Branch Name' },
  br_location: { sw: 'Mahali / Mtaa', en: 'Location' },

  // Void Logs
  vl_title: { sw: 'Kumbukumbu za Kufuta & Usalama (Void Logs)', en: 'Void & Audit Security Logs' },
  vl_subtitle: { sw: 'Ukaguzi wa usalama wa miamala iliyofutwa au kubadilishwa', en: 'Security audit trail of cancelled transactions' },

  // POS Page
  pos_today_sales: { sw: 'Mauzo ya Leo', en: "Today's Sales" },
  pos_overstock: { sw: 'Overstock', en: 'Overstock' },
  pos_overstock_enabled: { sw: 'IMEWASHWA', en: 'ENABLED' },
  pos_overstock_disabled: { sw: 'IMEZIMWA', en: 'DISABLED' },
  pos_search_placeholder: { sw: 'Tafuta bidhaa kwa jina au barcode...', en: 'Search product by name or barcode...' },
  pos_all_categories: { sw: 'Zote', en: 'All' },
  pos_cart_title: { sw: 'Kapu la Mauzo', en: 'Sales Cart' },
  pos_clear_cart: { sw: 'Futa Yote', en: 'Clear All' },
  pos_cart_empty: { sw: 'Hakuna bidhaa kwenye kapu', en: 'Cart is empty' },
  pos_cart_empty_desc: { sw: 'Bofya bidhaa upande wa kushoto au scan barcode kuanza', en: 'Select products on the left or scan barcode to start' },
  pos_subtotal: { sw: 'Jumla Ndogo', en: 'Subtotal' },
  pos_discount: { sw: 'Punguzo', en: 'Discount' },
  pos_total: { sw: 'Jumla Kuu', en: 'Grand Total' },
  pos_checkout: { sw: 'Kamilisha Mauzo / Lipa', en: 'Checkout / Pay' },
  pos_processing: { sw: 'Inashughulikia...', en: 'Processing...' },
  pos_customer: { sw: 'Mteja', en: 'Customer' },
  pos_walkin_customer: { sw: 'Mteja wa Kawaida', en: 'Walk-in Customer' },
  pos_phone: { sw: 'Namba ya Simu', en: 'Phone Number' },
  pos_payment_method: { sw: 'Aina ya Malipo', en: 'Payment Method' },
  pos_pay_cash: { sw: 'Taslimu (Cash)', en: 'Cash' },
  pos_pay_mobile: { sw: 'Simu (M-Pesa/Tigo/Airtel)', en: 'Mobile Money' },
  pos_pay_bank: { sw: 'Benki / Kadi', en: 'Bank / Card' },
  pos_pay_credit: { sw: 'Mkopo (Deni)', en: 'Credit (Debt)' },
  pos_mobile_network: { sw: 'Mtandao wa Simu', en: 'Mobile Network' },
  pos_add_network: { sw: 'Ongeza Mtandao', en: 'Add Network' },
  pos_new_network_title: { sw: 'Ongeza Mtandao Mpya', en: 'Add New Mobile Network' },
  pos_network_placeholder: { sw: 'Jina la mtandao (mf. Azam Pesa)', en: 'Network name (e.g. Azam Pesa)' },
  pos_card_type: { sw: 'Aina / Jina la Kadi', en: 'Card / Bank Name' },
  pos_add_card: { sw: 'Ongeza Kadi', en: 'Add Card' },
  pos_new_card_title: { sw: 'Ongeza Kadi / Benki Mpya', en: 'Add New Card / Bank' },
  pos_card_placeholder: { sw: 'Jina la kadi/benki (mf. CRDB, NMB, Stanbic, Visa)', en: 'Card/Bank name (e.g. CRDB, NMB, Stanbic, Visa)' },
  pos_card_added_success: { sw: 'imeongezwa!', en: 'added!' },
  pos_amount_paid: { sw: 'Kiasi Kilicholipwa', en: 'Amount Paid' },
  pos_change: { sw: 'Chenji', en: 'Change' },
  pos_hold_cart: { sw: 'Hifadhi Kapu', en: 'Hold Cart' },
  pos_recall_cart: { sw: 'Fungua Yaliyohifadhiwa', en: 'Recall Held' },
  pos_receipt: { sw: 'Risiti ya Mauzo', en: 'Sales Receipt' },
  pos_new_sale: { sw: 'Mauzo Mapya', en: 'New Sale' },
  pos_print_receipt: { sw: 'Chapisha Risiti', en: 'Print Receipt' },
  pos_share_whatsapp: { sw: 'Tuma WhatsApp', en: 'Send WhatsApp' },
  pos_show_more: { sw: 'Onyesha Zaidi', en: 'Show More' },
  pos_remaining: { sw: 'zimebaki', en: 'remaining' },
  pos_out_of_stock: { sw: 'Imeisha', en: 'Out of stock' },
  pos_low_stock: { sw: 'Iko Chini', en: 'Low stock' },
  pos_camera_scan: { sw: 'Scan kwa Kamera', en: 'Scan with Camera' },
  pos_smart_voice: { sw: 'Sauti ya AI', en: 'AI Voice' },
  pos_quick_cash: { sw: 'Pesa ya Haraka', en: 'Quick Cash' },
  pos_order_number: { sw: 'Namba ya Risiti', en: 'Receipt No' },
  pos_date: { sw: 'Tarehe', en: 'Date' },
  pos_served_by: { sw: 'Mhudumu', en: 'Served by' },
  pos_thank_you: { sw: 'Asante kwa kufanya biashara nasi!', en: 'Thank you for your business!' },
  pos_language_sw: { sw: 'Kiswahili', en: 'Swahili' },
  pos_language_en: { sw: 'Kiingereza', en: 'English' },
  pos_language_select: { sw: 'Lugha', en: 'Language' },
  pos_item_price: { sw: 'Bei', en: 'Price' },
  pos_item_qty: { sw: 'Idadi', en: 'Qty' },
  pos_item_total: { sw: 'Jumla', en: 'Total' },
  pos_sale_completed: { sw: 'Mauzo yamekamilika kikamilifu!', en: 'Sale completed successfully!' },
  pos_cart_cleared: { sw: 'Kapu limefutwa', en: 'Cart cleared' },
  pos_item_added: { sw: 'Imeongezwa kwenye kapu', en: 'Added to cart' },

  // Welcome Screen
  welcome_hello: { sw: 'Habari', en: 'Hello' },
  welcome_greeting_title: { sw: 'Habari', en: 'Welcome' },
  welcome_back: { sw: 'Karibu tena kwenye PartnerPOS', en: 'Welcome back to PartnerPOS' },
  welcome_motto: { sw: 'Tujenge mafanikio na biashara bora leo', en: "Let's build success and business excellence today" },
  welcome_preparing: { sw: 'Inaandaa mazingira ya duka lako...', en: 'Preparing your store workspace...' },
  welcome_tap_continue: { sw: 'Gusa popote kuendelea', en: 'Tap anywhere to continue' },
  welcome_ready: { sw: 'Mazingira yako yapo tayari', en: 'Your workspace is ready' },
  welcome_skip: { sw: 'Ruka', en: 'Skip' },
  welcome_pos_system: { sw: 'Mfumo Mahiri wa Mauzo na Usimamizi', en: 'Intelligent POS & Business Operations' },
  welcome_greeting_mteja: { sw: 'Habari ya Leo, Karibu Sana!', en: 'Good Day, Warm Welcome!' },

  // Partner Tab & Briefing Dashboard
  partner_title: { sw: 'Partner AI', en: 'Partner AI' },
  partner_subtitle: { sw: 'Mshirika wako wa kimkakati wa biashara', en: 'Your Strategic Business Partner' },
  partner_briefing_summary: { sw: 'Muhtasari wa Kiutendaji (Briefing Summary)', en: 'Executive Briefing Summary' },
  partner_dashboard: { sw: 'Dashibodi ya Partner', en: 'Partner Dashboard' },
  partner_financial_pulse: { sw: 'Mapigo ya Kifedha & Faida Halisi', en: 'Financial Pulse & Real Profit' },
  partner_revenue_today: { sw: 'Mauzo ya Leo', en: "Today's Revenue" },
  partner_cogs: { sw: 'Gharama za Bidhaa (COGS)', en: 'Cost of Goods (COGS)' },
  partner_gross_profit: { sw: 'Faida Ghafi', en: 'Gross Profit' },
  partner_expenses: { sw: 'Matumizi', en: 'Expenses' },
  partner_waste: { sw: 'Upotevu / Hasara', en: 'Shrinkage & Waste' },
  partner_real_profit: { sw: 'Faida Halisi (Net Profit)', en: 'Real Net Profit' },
  partner_drawer_audit: { sw: 'Ukaguzi wa Droo ya Pesa', en: 'Cash Drawer Audit' },
  partner_refresh_briefing: { sw: 'Sasisha Muhtasari', en: 'Refresh Briefing' },
  partner_generating_briefing: { sw: 'Partner anaandaa muhtasari...', en: 'Partner is preparing briefing...' },
  partner_staff_brief: { sw: 'Ukaguzi wa Wafanyakazi', en: 'Staff Activity Brief' },
  partner_store_health: { sw: 'Hali ya Stoo', en: 'Stock & Inventory Health' },
  partner_activity_feed: { sw: 'Msururu wa Matukio na Tahadhari', en: 'Live Activity & Security Alerts' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'partner_app_language';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === 'en' || saved === 'sw') {
        return saved;
      }
    } catch (e) {
      // ignore
    }
    return 'sw'; // Default to Swahili as requested originally
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch (e) {
      // ignore
    }
  };

  const toggleLanguage = () => {
    const nextLang = language === 'sw' ? 'en' : 'sw';
    setLanguage(nextLang);
  };

  const t = (key: string, fallback?: string): string => {
    const item = translations[key];
    if (item && item[language]) {
      return item[language];
    }
    return fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
