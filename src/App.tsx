import React from 'react';
import { Droplets, Printer, Archive, BarChart3, Save, RotateCcw, Plus, Trash2, LogIn, LogOut, User, Activity, Droplet, Download, Shield, Users as UsersIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { ReportData, MaintenanceRow, UserRole } from './types';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Legend, PieChart, Pie, Cell 
} from 'recharts';

// Firebase imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User as FirebaseUser, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, serverTimestamp, Timestamp, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Initial state function for the form
const getInitialReport = (): ReportData => ({
  id: Date.now() + Math.random(),
  savedAt: new Date().toISOString(),
  dayName: 'الأحد',
  dateGreg: new Date().toISOString().split('T')[0],
  dateHijri: '',
  opCompany: 'SWA',
  city: 'الرياض',
  sector: 'الأوسط',
  station: 'الحاير',
  beneficiary: '',
  waterSource: 'مياه جوفية',
  designProd: '',
  opMode: 'ذاتي',
  totalWells: '',
  activeWells: '',
  reverseOsmosis: '',
  wellNumbers: '',
  
  nasah_prod: '',
  nasah_hpp: '',
  nasah_pump_total: '',
  nasah_pump_out: '',
  nasah_pump_reason: '',
  nasah_notes: '',
  
  manf_prod: '',
  manf_hpp: '',
  manf_pump_total: '',
  manf_pump_out: '',
  manf_pump_reason: '',
  manf_notes: '',

  equipment: {
    lift: { loc: '', total: '', active: '', out: '', reason: '' },
    trans: { loc: '', total: '', active: '', out: '', reason: '' },
    chlor: { loc: '', total: '', active: '', out: '', reason: '' },
    starter: { loc: '', total: '', active: '', out: '', reason: '' },
    gen: { loc: '', total: '', active: '', out: '', reason: '' },
    elec: { loc: 'لدى الشركة', total: '', active: '', out: '', reason: '' },
  },

  opNotes: '',
  maintRows: [{ num: 1, type: 'وقائية', equip: '', loc: '', work: '', notes: '' }],
  maintNotes: '',

  quality: {
    raw: { time: '', temp: '', turbidity: '', freeChlorine: '', ph: '', conductivity: '', tds: '', iron: '', notes: '' },
    prod: { time: '', temp: '', turbidity: '', freeChlorine: '', ph: '', conductivity: '', tds: '', iron: '', notes: '' },
    rej: { time: '', temp: '', turbidity: '', freeChlorine: '', ph: '', conductivity: '', tds: '', iron: '', notes: '' },
  },

  supervisor: '',
  nwcSupervisor: '',
});

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path
  };
  console.error('Firestore Error Detailed: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [activeTab, setActiveTab] = React.useState<'form' | 'records' | 'stats' | 'users'>('form');
  const [report, setReport] = React.useState<ReportData>(getInitialReport());
  const [lastSavedReport, setLastSavedReport] = React.useState<string>(JSON.stringify(report));
  const [savedReports, setSavedReports] = React.useState<ReportData[]>([]);
  const [user, setUser] = React.useState<FirebaseUser | null>(null);
  const [userRole, setUserRole] = React.useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [printData, setPrintData] = React.useState<ReportData | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Fetch/Sync user profile
        try {
          const userRef = doc(db, 'users', u.uid);
          let userDoc;
          try {
            userDoc = await getDoc(userRef);
          } catch (e) {
            handleFirestoreError(e, OperationType.GET, `users/${u.uid}`);
          }

          let role: UserRole = 'viewer';
          if (userDoc && userDoc.exists()) {
            role = userDoc.data().role;
            setUserRole(role);
          } else {
            // First time user - default to viewer unless it's the supervisor
            const isAdminEmail = u.email === 'dosnasser717@gmail.com';
            role = isAdminEmail ? 'admin' : 'viewer';
            const newProfile = {
              email: u.email,
              displayName: u.displayName || '',
              photoURL: u.photoURL || '',
              role: role,
              createdAt: serverTimestamp()
            };
            try {
              await setDoc(userRef, newProfile);
            } catch (e) {
              handleFirestoreError(e, OperationType.WRITE, `users/${u.uid}`);
            }
            setUserRole(role);
          }
          
          if (role === 'viewer' && activeTab === 'form') {
            setActiveTab('records');
          }
        } catch (e) {
          console.error("Error syncing user profile", e);
        }
        fetchReports();
      } else {
        setSavedReports([]);
        setUserRole(null);
        setActiveTab('form'); // Reset to form for login prompt
        setIsLoading(false);
      }
    });

    // Before unload listener
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(report) !== lastSavedReport) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [report, lastSavedReport]);

  const handleTabChange = (tab: 'form' | 'records' | 'stats' | 'users') => {
    if (activeTab === 'form' && tab !== 'form' && JSON.stringify(report) !== lastSavedReport) {
      if (!confirm('لديك تغييرات غير محفوظة في التقرير. هل أنت متأكد من الانتقال؟ (سيتم الاحتفاظ بالبيانات في المتصفح حالياً ولكن قد تفقدها عند التحديث)')) {
        return;
      }
    }
    setActiveTab(tab);
  };

  const fetchReports = async () => {
    try {
      const q = query(collection(db, 'reports'), orderBy('savedAt', 'desc'));
      let querySnapshot;
      try {
        querySnapshot = await getDocs(q);
      } catch (e) {
        handleFirestoreError(e, OperationType.LIST, 'reports');
      }
      const reports = querySnapshot.docs.map(d => ({ 
        ...d.data() as ReportData, 
        firebaseId: d.id 
      }));
      setSavedReports(reports);
    } catch (e) {
      console.error("Error fetching reports: ", e);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      console.error("Login failed", e);
    }
  };

  const logout = () => signOut(auth);

  const handleInputChange = (field: keyof ReportData, value: any) => {
    setReport(prev => ({ ...prev, [field]: value }));
  };

  const handleEquipmentChange = (key: keyof ReportData['equipment'], field: keyof any, value: string) => {
    setReport(prev => ({
      ...prev,
      equipment: {
        ...prev.equipment,
        [key]: { ...prev.equipment[key], [field]: value }
      }
    }));
  };

  const handleQualityChange = (section: keyof ReportData['quality'], field: keyof any, value: string) => {
    setReport(prev => ({
      ...prev,
      quality: {
        ...prev.quality,
        [section]: { ...prev.quality[section], [field]: value }
      }
    }));
  };

  const addMaintRow = () => {
    setReport(prev => ({
      ...prev,
      maintRows: [
        ...prev.maintRows,
        { num: prev.maintRows.length + 1, type: 'وقائية', equip: '', loc: '', work: '', notes: '' }
      ]
    }));
  };

  const removeMaintRow = (index: number) => {
    if (report.maintRows.length > 1) {
      setReport(prev => ({
        ...prev,
        maintRows: prev.maintRows.filter((_, i) => i !== index).map((row, i) => ({ ...row, num: i + 1 }))
      }));
    }
  };

  const saveReportAction = async () => {
    if (!user) {
      alert('يرجى تسجيل الدخول لحفظ التقرير ومشاركته مع الآخرين');
      login();
      return;
    }

    if (userRole === 'viewer') {
      alert('ليس لديك صلاحية لإضافة تقارير (مشاهد فقط)');
      return;
    }

    const reportToSave = {
      ...report,
      authorId: user.uid,
      savedAt: new Date().toISOString(),
    };

    try {
      try {
        await addDoc(collection(db, 'reports'), reportToSave);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'reports');
      }
      alert('تم الحفظ بنجاح ومشاركته مع الفريق!');
      fetchReports();
      const fresh = getInitialReport();
      setReport(fresh);
      setLastSavedReport(JSON.stringify(fresh));
    } catch (e) {
      console.error("Error saving report: ", e);
      alert('حدث خطأ أثناء الحفظ السحابي');
    }
  };

  const handleDelete = async () => {
    if (deleteId) {
      try {
        try {
          await deleteDoc(doc(db, 'reports', deleteId));
        } catch (e) {
          handleFirestoreError(e, OperationType.DELETE, `reports/${deleteId}`);
        }
        setDeleteId(null);
        fetchReports();
        alert('تم الحذف بنجاح');
      } catch (e) {
        console.error("Error deleting from Firebase", e);
        alert('حدث خطأ أثناء الحذف - قد يكون بسبب نقص الصلاحيات');
      }
    }
  };

  const updateUserRole = async (uid: string, newRole: string) => {
    if (userRole !== 'admin') return;
    try {
      try {
        await updateDoc(doc(db, 'users', uid), { role: newRole });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `users/${uid}`);
      }
      alert('تم تحديث الصلاحية بنجاح');
    } catch (e) {
      console.error("Error updating role", e);
      alert('فشل في تحديث الصلاحية');
    }
  };

  const handlePrint = (data?: ReportData) => {
    setPrintData(data || report);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const clearForm = () => {
    if (confirm('هل تريد مسح البيانات الحالية؟')) {
      const fresh = getInitialReport();
      setReport(fresh);
      setLastSavedReport(JSON.stringify(fresh));
    }
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Modal for Deletion Confirmation */}
      <AnimatePresence>
        {deleteId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold mb-2">تأكيد الحذف</h3>
              <p className="text-slate-500 text-sm mb-6">هل أنت متأكد من حذف هذا التقرير نهائياً من السحابة؟ لا يمكن التراجع عن هذا الإجراء.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteId(null)}
                  className="flex-1 px-4 py-2 border rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  إلغاء
                </button>
                <button 
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
                >
                  حذف نهائي
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Header */}
      <header className="bg-linear-to-br from-swa-blue-dark to-swa-blue-mid text-white p-4 shadow-lg sticky top-0 z-50 no-print">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-swa-blue shadow-inner group cursor-pointer hover:rotate-12 transition-transform">
              <Droplets className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">نظام تقرير التشغيل اليومي</h1>
              <p className="text-[10px] uppercase font-bold opacity-75 tracking-widest">وكالة تنقية المياه الجوفية – القطاع الأوسط</p>
            </div>
          </div>
          <div className="hidden md:flex gap-3">
             {user ? (
               <div className="flex items-center gap-3">
                 <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20">
                   {user.photoURL ? (
                     <img src={user.photoURL} className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
                   ) : (
                     <User className="w-4 h-4" />
                   )}
                   <span className="text-xs font-bold truncate max-w-[100px]">{user.displayName || user.email}</span>
                 </div>
                 <button onClick={logout} className="p-2 hover:bg-white/10 rounded-lg text-white/70 hover:text-white transition-all">
                   <LogOut className="w-5 h-5" />
                 </button>
               </div>
             ) : (
               <button
                 onClick={login}
                 className="bg-white text-swa-blue px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 shadow-md hover:bg-slate-50"
               >
                 <LogIn className="w-4 h-4" />
                 تسجيل الدخول
               </button>
             )}
             <button
               onClick={() => handlePrint()}
               className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 border border-white/20"
             >
               <Printer className="w-4 h-4" />
               طباعة
             </button>
             <button
               onClick={saveReportAction}
               className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 shadow-md"
             >
               <Save className="w-4 h-4" />
               حفظ ومشاركة
             </button>
          </div>
        </div>
      </header>

      {/* Tabs Control */}
      <nav className="bg-white border-b-4 border-swa-blue shadow-sm sticky top-[80px] z-40 no-print overflow-x-auto">
        <div className="max-w-7xl mx-auto flex gap-1 px-4 pt-2">
          {userRole !== 'viewer' && (
            <TabButton 
              active={activeTab === 'form'} 
              onClick={() => handleTabChange('form')}
              icon={<Plus className="w-4 h-4" />}
              label="إدخال التقرير"
            />
          )}
          <TabButton 
            active={activeTab === 'records'} 
            onClick={() => handleTabChange('records')}
            icon={<Archive className="w-4 h-4" />}
            label="سجل التقارير"
          />
          <TabButton 
            active={activeTab === 'stats'} 
            onClick={() => handleTabChange('stats')}
            icon={<BarChart3 className="w-4 h-4" />}
            label="إحصائيات"
          />
          {userRole === 'admin' && (
            <TabButton 
              active={activeTab === 'users'} 
              onClick={() => handleTabChange('users')}
              icon={<UsersIcon className="w-4 h-4" />}
              label="إدارة المستخدمين"
            />
          )}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 gap-4"
            >
              <div className="w-12 h-12 border-4 border-swa-blue border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-500 font-bold">جاري تحميل البيانات...</p>
            </motion.div>
          ) : (
            <>
              {activeTab === 'form' && (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <ReportForm 
                    report={report} 
                    userRole={userRole}
                    onChange={handleInputChange} 
                    onEquipmentChange={handleEquipmentChange}
                    onQualityChange={handleQualityChange}
                    addMaintRow={addMaintRow}
                    removeMaintRow={removeMaintRow}
                    onSave={saveReportAction}
                    onPrint={() => handlePrint()}
                    clearForm={clearForm}
                  />
                </motion.div>
              )}

          {activeTab === 'records' && (
            <motion.div
              key="records"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
            >
              <RecordsTable 
                records={savedReports} 
                userId={user?.uid}
                userRole={userRole}
                onPrint={handlePrint}
                onDelete={(firebaseId) => setDeleteId(firebaseId)}
              />
            </motion.div>
          )}

           {activeTab === 'stats' && (
            <motion.div
              key="stats"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <StatsDashboard reports={savedReports} />
            </motion.div>
          )}

          {activeTab === 'users' && userRole === 'admin' && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <UserManagement userRole={userRole} onUpdateRole={updateUserRole} />
            </motion.div>
          )}
            </>
          )}
        </AnimatePresence>
      </main>

      {/* Print Wrapper - Always present but off-screen to ensure rendering */}
      <div className="fixed top-[-9999px] left-[-9999px] print:static print:block w-full">
        {printData && <PrintTemplate report={printData} />}
      </div>
    </div>
  );
}

// Sub-components

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-6 py-2.5 rounded-t-xl font-bold text-sm transition-all flex items-center gap-2 border-b-0",
        active 
          ? "bg-swa-blue text-white shadow-[0_-2px_10px_rgba(0,0,0,0.1)]" 
          : "bg-slate-100 text-swa-blue hover:bg-slate-200"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

interface FormProps {
  report: ReportData;
  userRole: UserRole | null;
  onChange: (field: keyof ReportData, value: any) => void;
  onEquipmentChange: (key: keyof ReportData['equipment'], field: keyof any, value: string) => void;
  onQualityChange: (section: keyof ReportData['quality'], field: keyof any, value: string) => void;
  addMaintRow: () => void;
  removeMaintRow: (index: number) => void;
  onSave: () => void;
  onPrint: () => void;
  clearForm: () => void;
}

// Constants for suggestions
const COMMON_CITIES = ['الرياض', 'جدة', 'الدمام', 'المدينة المنورة', 'مكة المكرمة', 'الخبر', 'أبها', 'تبوك', 'بريدة', 'حائل'];
const COMMON_STATIONS = ['الحاير', 'نساح', 'منفوحة', 'لبن', 'نمار', 'عرقة', 'البويب', 'صلبوخ'];
const COMMON_BENEFICIARIES = ['شركة المياه الوطنية (NWC)', 'الهيئة السعودية للمياه (SWA)', 'وزارة البيئة والمياه والزراعة'];

function ReportForm({ report, userRole, onChange, onEquipmentChange, onQualityChange, addMaintRow, removeMaintRow, onSave, onPrint, clearForm }: FormProps) {
  return (
    <div className="space-y-6 pb-12">
      {/* Suggestions DataLists */}
      <datalist id="cities-list">
        {COMMON_CITIES.map(c => <option key={c} value={c} />)}
      </datalist>
      <datalist id="stations-list">
        {COMMON_STATIONS.map(s => <option key={s} value={s} />)}
      </datalist>
      <datalist id="beneficiaries-list">
        {COMMON_BENEFICIARIES.map(b => <option key={b} value={b} />)}
      </datalist>

      {/* 1. Station Info */}
      <section className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="bg-swa-blue-header text-white px-4 py-2 font-bold flex items-center gap-2 text-sm">
          <Droplets className="w-4 h-4" />
          معلومات المحطة
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <InputGroup label="اليوم" element={
            <select 
              value={report.dayName} 
              onChange={(e) => onChange('dayName', e.target.value)}
              className="w-full border rounded-lg p-1.5 text-sm"
            >
              {['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'].map(d => <option key={d}>{d}</option>)}
            </select>
          }/>
          <InputGroup label="التاريخ الميلادي" element={
            <input 
              type="date" 
              value={report.dateGreg} 
              onChange={(e) => onChange('dateGreg', e.target.value)}
              className="w-full border rounded-lg p-1.5 text-sm" 
            />
          }/>
          <InputGroup label="التاريخ الهجري" element={
            <input 
              type="text" 
              value={report.dateHijri} 
              onChange={(e) => onChange('dateHijri', e.target.value)}
              className="w-full border rounded-lg p-1.5 text-sm" 
            />
          }/>
          <InputGroup label="الشركة المشغّلة" element={
            <input 
              type="text" 
              value={report.opCompany} 
              onChange={(e) => onChange('opCompany', e.target.value)}
              className="w-full border rounded-lg p-1.5 text-sm" 
            />
          }/>
          
          <InputGroup label="المدينة" element={<input type="text" list="cities-list" value={report.city} onChange={(e) => onChange('city', e.target.value)} className="w-full border rounded-lg p-1.5 text-sm" />}/>
          <InputGroup label="القطاع" element={<input type="text" value={report.sector} onChange={(e) => onChange('sector', e.target.value)} className="w-full border rounded-lg p-1.5 text-sm" />}/>
          <InputGroup label="المحطة" element={<input type="text" list="stations-list" value={report.station} onChange={(e) => onChange('station', e.target.value)} className="w-full border rounded-lg p-1.5 text-sm" />}/>
          <InputGroup label="المستفيد" element={<input type="text" list="beneficiaries-list" value={report.beneficiary} onChange={(e) => onChange('beneficiary', e.target.value)} className="w-full border rounded-lg p-1.5 text-sm" />}/>
          <InputGroup label="مصدر المياه" element={
            <select value={report.waterSource} onChange={(e) => onChange('waterSource', e.target.value)} className="w-full border rounded-lg p-1.5 text-sm">
              <option>مياه جوفية</option><option>تحلية</option><option>سطحية</option><option>معالجة</option>
            </select>
          }/>
        </div>
      </section>

      {/* 2. Production Section */}
       <section className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="bg-swa-blue-header text-white px-4 py-2 font-bold text-sm">الإنتاج وحالة مضخات الرفع</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50">
                <th className="border p-2 bg-swa-blue-header text-white min-w-[80px]">الموقع</th>
                <th className="border p-2 min-w-[120px]">كمية الإنتاج (م³/يوم)</th>
                <th className="border p-2 min-w-[120px]">التصدير HPP (م³/يوم)</th>
                <th className="border p-2">مضخات الرفع (كلي)</th>
                <th className="border p-2">خارج الخدمة</th>
                <th className="border p-2">السبب</th>
                <th className="border p-2">ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              <ProductionRow 
                name="نساح" 
                prefix="nasah" 
                report={report} 
                onChange={onChange} 
              />
              <ProductionRow 
                name="منفوحة" 
                prefix="manf" 
                report={report} 
                onChange={onChange} 
              />
            </tbody>
          </table>
        </div>
      </section>

      {/* 2.5 Equipment Status (The Missing Part) */}
      <section className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="bg-swa-blue-header text-white px-4 py-2 font-bold text-sm">معدات التشغيل الخارجة عن الخدمة</div>
        <div className="overflow-x-auto">
           <table className="w-full border-collapse text-center text-xs">
              <thead>
                 <tr className="bg-slate-100 italic">
                    <th className="border p-2">البيان</th>
                    <th className="border p-2">مضخات الرفع</th>
                    <th className="border p-2">المحولات</th>
                    <th className="border p-2">مضخات تجريع الكلور</th>
                    <th className="border p-2">بادئ تشغيل</th>
                    <th className="border p-2">مولدات ديزل</th>
                    <th className="border p-2">الكهرباء</th>
                 </tr>
              </thead>
              <tbody>
                 <EquipmentRow label="الموقع" field="loc" report={report} onEquipmentChange={onEquipmentChange} />
                 <EquipmentRow label="العدد" field="total" report={report} onEquipmentChange={onEquipmentChange} />
                 <EquipmentRow label="في الخدمة" field="active" report={report} onEquipmentChange={onEquipmentChange} />
                 <EquipmentRow label="خارج الخدمة" field="out" report={report} onEquipmentChange={onEquipmentChange} />
                 <EquipmentRow label="السبب" field="reason" report={report} onEquipmentChange={onEquipmentChange} />
              </tbody>
           </table>
        </div>
      </section>

      {/* 3. Water Quality */}
      <section className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="bg-swa-blue-header text-white px-4 py-2 font-bold text-sm">تقرير جودة المياه – Physical Analysis</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center text-[11px]">
            <thead>
              <tr className="bg-swa-blue text-white">
                <th className="p-2 border">Sampling Point</th>
                <th className="p-2 border">الوقت</th>
                <th className="p-2 border">الحرارة °C</th>
                <th className="p-2 border">عكارة NTU</th>
                <th className="p-2 border">الكلور الحر</th>
                <th className="p-2 border">pH</th>
                <th className="p-2 border">TDS</th>
                <th className="p-2 border">الحديد</th>
                <th className="p-2 border">الملاحظات</th>
              </tr>
              <tr className="bg-swa-blue-row/40 text-[9px] font-bold text-swa-blue-dark">
                <td className="border p-1 bg-swa-blue-row">MEWA Std. (Standards)</td>
                <td className="border p-1">—</td>
                <td className="border p-1 font-bold">{WATER_STANDARDS.temp.label}</td>
                <td className="border p-1 font-bold">{WATER_STANDARDS.turbidity.label}</td>
                <td className="border p-1 font-bold">{WATER_STANDARDS.freeChlorine.label}</td>
                <td className="border p-1 font-bold">{WATER_STANDARDS.ph.label}</td>
                <td className="border p-1 font-bold">—</td>
                <td className="border p-1 font-bold">{WATER_STANDARDS.tds.label}</td>
                <td className="border p-1 font-bold">{WATER_STANDARDS.iron.label}</td>
                <td className="border p-1">—</td>
              </tr>
            </thead>
            <tbody>
              <QualityRow label="Raw water" section="raw" report={report} onQualityChange={onQualityChange} />
              <QualityRow label="Product Water" section="prod" report={report} onQualityChange={onQualityChange} />
              <QualityRow label="Rejected Water" section="rej" report={report} onQualityChange={onQualityChange} />
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Maintenance */}
      <section className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="bg-swa-blue-header text-white px-4 py-2 font-bold flex justify-between items-center text-sm">
          <span>تقرير الصيانة</span>
          <button onClick={addMaintRow} className="bg-white/20 hover:bg-white/30 p-1 rounded transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="p-0 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-slate-100 italic">
              <tr>
                <th className="border p-2 w-10">#</th>
                <th className="border p-2 min-w-[100px]">نوع الصيانة</th>
                <th className="border p-2 min-w-[120px]">اسم المعدة</th>
                <th className="border p-2 min-w-[100px]">الموقع</th>
                <th className="border p-2 min-w-[200px]">وصف العمل</th>
                <th className="border p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {report.maintRows.map((row, idx) => (
                <tr key={idx}>
                  <td className="border p-2 text-center text-slate-400">{row.num}</td>
                  <td className="border p-1">
                    <select 
                      className="w-full border-0 focus:ring-0 bg-transparent text-xs"
                      value={row.type}
                      onChange={(e) => {
                        const newRows = [...report.maintRows];
                        newRows[idx].type = e.target.value as any;
                        onChange('maintRows', newRows);
                      }}
                    >
                      <option>وقائية</option><option>تصحيحية</option><option>طارئة</option>
                    </select>
                  </td>
                  <td className="border p-1">
                    <input 
                      type="text" 
                      className="w-full border-0 focus:ring-0 bg-transparent text-xs"
                      value={row.equip}
                      onChange={(e) => {
                        const newRows = [...report.maintRows];
                        newRows[idx].equip = e.target.value;
                        onChange('maintRows', newRows);
                      }}
                    />
                  </td>
                   <td className="border p-1">
                    <input 
                      type="text" 
                      className="w-full border-0 focus:ring-0 bg-transparent text-xs"
                      value={row.loc}
                      onChange={(e) => {
                        const newRows = [...report.maintRows];
                        newRows[idx].loc = e.target.value;
                        onChange('maintRows', newRows);
                      }}
                    />
                  </td>
                   <td className="border p-1">
                    <input 
                      type="text" 
                      className="w-full border-0 focus:ring-0 bg-transparent text-xs"
                      value={row.work}
                      onChange={(e) => {
                        const newRows = [...report.maintRows];
                        newRows[idx].work = e.target.value;
                        onChange('maintRows', newRows);
                      }}
                    />
                  </td>
                  <td className="border p-1 text-center">
                    <button onClick={() => removeMaintRow(idx)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="w-4 h-4 mx-auto" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Approval Section */}
      <section className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="bg-swa-blue-header text-white px-4 py-2 font-bold text-sm">الاعتماد</div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputGroup label="معد التقرير" element={
            <input 
              type="text" 
              value={report.supervisor} 
              onChange={(e) => onChange('supervisor', e.target.value)}
              className="w-full border rounded-lg p-1.5 text-sm" 
              placeholder="الاسم"
            />
          }/>
          <InputGroup label="مشرف التشغيل" element={
            <input 
              type="text" 
              value={report.nwcSupervisor} 
              onChange={(e) => onChange('nwcSupervisor', e.target.value)}
              className="w-full border rounded-lg p-1.5 text-sm" 
              placeholder="الاسم"
            />
          }/>
        </div>
      </section>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4 p-4 justify-end no-print">
        <button onClick={clearForm} className="flex items-center gap-2 px-6 py-2 border rounded-xl hover:bg-slate-100 transition-all font-bold text-sm text-slate-600">
          <RotateCcw className="w-4 h-4" />
          مسح الحقول
        </button>
        <button onClick={onPrint} className="flex items-center gap-2 px-6 py-2 border border-amber-500 text-amber-600 rounded-xl hover:bg-amber-50 transition-all font-bold text-sm">
          <Printer className="w-5 h-5" />
          معاينة الطباعة
        </button>
        <button 
          onClick={onSave}
          disabled={userRole === 'viewer'}
          className={cn(
            "flex items-center gap-2 px-8 py-2 rounded-xl shadow-lg transition-all font-bold group",
            userRole === 'viewer' ? "bg-slate-300 cursor-not-allowed" : "bg-swa-blue text-white hover:shadow-swa-blue/30"
          )}
        >
          <Save className="w-5 h-5 group-active:scale-90 transition-transform" />
          {userRole === 'viewer' ? 'مشاهد فقط' : 'حفظ ومشاركة'}
        </button>
      </div>
    </div>
  );
}

// Helper Small Components

// Water quality standards for validation
const WATER_STANDARDS = {
  temp: { max: 40, label: 'Max 40' },
  turbidity: { max: 5, label: 'Max 5' },
  freeChlorine: { min: 0.2, max: 0.5, label: '0.2 - 0.5' },
  ph: { min: 6.5, max: 8.5, label: '6.5 - 8.5' },
  tds: { min: 100, max: 1000, label: '100 - 1000' },
  iron: { max: 0.3, label: 'Max 0.3' },
};

function isOutOfRange(field: string, value: string) {
  const num = parseFloat(value);
  if (isNaN(num)) return false;
  
  const std = (WATER_STANDARDS as any)[field];
  if (!std) return false;
  
  if (std.max !== undefined && num > std.max) return true;
  if (std.min !== undefined && num < std.min) return true;
  
  return false;
}

function QualityInput({ field, value, onChange, placeholder }: { field: string, value: string, onChange: (val: string) => void, placeholder?: string }) {
  const outOfRange = isOutOfRange(field, value);
  
  return (
    <input 
      type="text" 
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full bg-transparent border-0 text-center text-[10px] focus:ring-0 transition-colors rounded",
        outOfRange ? "text-red-600 font-bold bg-red-50" : "text-slate-700"
      )}
    />
  );
}

function EquipmentRow({ label, field, report, onEquipmentChange }: { label: string, field: keyof any, report: any, onEquipmentChange: any }) {
  const keys: (keyof ReportData['equipment'])[] = ['lift', 'trans', 'chlor', 'starter', 'gen', 'elec'];
  return (
    <tr>
      <td className="border p-2 bg-slate-50 font-bold text-[10px]">{label}</td>
      {keys.map(k => (
        <td key={k} className="border p-1">
          <input 
            type="text" 
            className="w-full border-0 text-center bg-transparent focus:ring-0 text-[10px]"
            value={report.equipment[k][field]}
            onChange={(e) => onEquipmentChange(k, field, e.target.value)}
          />
        </td>
      ))}
    </tr>
  );
}


// Helper Small Components

function InputGroup({ label, element }: { label: string, element: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[0.7rem] font-bold text-swa-blue-dark block opacity-75">{label}</label>
      {element}
    </div>
  );
}

function ProductionRow({ name, prefix, report, onChange }: { name: string, prefix: 'nasah' | 'manf', report: any, onChange: any }) {
  return (
    <tr>
      <td className="border p-2 bg-slate-50 font-bold">{name}</td>
      <td className="border p-1"><input type="text" className="w-full border-0 text-center bg-transparent focus:ring-0" value={report[`${prefix}_prod`]} onChange={(e) => onChange(`${prefix}_prod`, e.target.value)} /></td>
      <td className="border p-1"><input type="text" className="w-full border-0 text-center bg-transparent focus:ring-0" value={report[`${prefix}_hpp`]} onChange={(e) => onChange(`${prefix}_hpp`, e.target.value)} /></td>
      <td className="border p-1"><input type="text" className="w-full border-0 text-center bg-transparent focus:ring-0" value={report[`${prefix}_pump_total`]} onChange={(e) => onChange(`${prefix}_pump_total`, e.target.value)} /></td>
      <td className="border p-1"><input type="text" className="w-full border-0 text-center bg-transparent focus:ring-0" value={report[`${prefix}_pump_out`]} onChange={(e) => onChange(`${prefix}_pump_out`, e.target.value)} /></td>
      <td className="border p-1"><input type="text" className="w-full border-0 text-center bg-transparent focus:ring-0" value={report[`${prefix}_pump_reason`]} onChange={(e) => onChange(`${prefix}_pump_reason`, e.target.value)} /></td>
      <td className="border p-1"><input type="text" className="w-full border-0 text-center bg-transparent focus:ring-0" value={report[`${prefix}_notes`]} onChange={(e) => onChange(`${prefix}_notes`, e.target.value)} /></td>
    </tr>
  );
}

function QualityRow({ label, section, report, onQualityChange }: { label: string, section: keyof ReportData['quality'], report: any, onQualityChange: any }) {
  const data = report.quality[section];
  return (
    <tr>
      <td className="border p-2 bg-swa-blue-row font-bold">{label}</td>
      <td className="border p-1">
        <input type="time" value={data.time} onChange={(e) => onQualityChange(section, 'time', e.target.value)} className="w-full bg-transparent border-0 text-center text-[10px]" />
      </td>
      <td className="border p-1"><QualityInput field="temp" value={data.temp} onChange={(v) => onQualityChange(section, 'temp', v)} placeholder={WATER_STANDARDS.temp.label} /></td>
      <td className="border p-1"><QualityInput field="turbidity" value={data.turbidity} onChange={(v) => onQualityChange(section, 'turbidity', v)} placeholder={WATER_STANDARDS.turbidity.label} /></td>
      <td className="border p-1"><QualityInput field="freeChlorine" value={data.freeChlorine} onChange={(v) => onQualityChange(section, 'freeChlorine', v)} placeholder={WATER_STANDARDS.freeChlorine.label} /></td>
      <td className="border p-1"><QualityInput field="ph" value={data.ph} onChange={(v) => onQualityChange(section, 'ph', v)} placeholder={WATER_STANDARDS.ph.label} /></td>
      <td className="border p-1"><QualityInput field="tds" value={data.tds} onChange={(v) => onQualityChange(section, 'tds', v)} placeholder={WATER_STANDARDS.tds.label} /></td>
      <td className="border p-1"><QualityInput field="iron" value={data.iron} onChange={(v) => onQualityChange(section, 'iron', v)} placeholder={WATER_STANDARDS.iron.label} /></td>
      <td className="border p-1">
        <input type="text" value={data.notes} onChange={(e) => onQualityChange(section, 'notes', e.target.value)} className="w-full bg-transparent border-0 text-center text-[10px]" />
      </td>
    </tr>
  );
}

// Records List Component
function RecordsTable({ records, userId, userRole, onDelete, onPrint }: { records: ReportData[], userId?: string, userRole: string | null, onDelete: (firebaseId: string) => void, onPrint: (data: ReportData) => void }) {
  if (records.length === 0) return <div className="text-center py-20 text-slate-400 font-bold">لا توجد تقارير في السحابة</div>;

  const exportToCSV = () => {
    const headers = [
      'التاريخ', 'المحطة', 'المدينة', 'إنتاج نساح', 'تصدير نساح', 'إنتاج منفوحة', 'تصدير منفوحة', 'الإجمالي', 'معد التقرير'
    ];
    
    const rows = records.map(r => {
      const total = (parseFloat(r.nasah_prod) || 0) + (parseFloat(r.manf_prod) || 0);
      return [
        r.dateGreg,
        r.station,
        r.city,
        r.nasah_prod,
        r.nasah_hpp,
        r.manf_prod,
        r.manf_hpp,
        total,
        r.supervisor
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(v => `"${v}"`).join(','))
    ].join('\n');

    // Add BOM for Excel UTF-8 support
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Daily_Reports_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-800">قائمة التقارير المحفوظة</h2>
        <button 
          onClick={exportToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-all font-bold text-sm border border-emerald-200"
        >
          <Download className="w-4 h-4" />
          تصدير CSV
        </button>
      </div>
      {records.map(r => (
        <div key={r.firebaseId || r.id} className="bg-white p-4 rounded-xl shadow-sm border flex justify-between items-center hover:border-swa-blue transition-colors group">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-swa-blue ring-2 ring-transparent group-hover:ring-swa-blue/20 transition-all">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-swa-blue">{r.dateGreg} | {r.station}</div>
              <div className="text-xs text-slate-500">معد التقرير: {r.supervisor || '—'}</div>
            </div>
          </div>
          <div className="flex gap-2">
            {(userRole === 'admin' || (userId === r.authorId && userRole === 'editor')) && (
              <button className="p-2 text-slate-300 hover:text-red-500 transition-colors" onClick={() => r.firebaseId && onDelete(r.firebaseId)}>
                <Trash2 className="w-5 h-5" />
              </button>
            )}
             <button className="p-2 text-swa-blue hover:text-swa-blue-dark transition-colors" onClick={() => onPrint(r)}>
              <Printer className="w-5 h-5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// User Management Component
function UserManagement({ userRole, onUpdateRole }: { userRole: string | null, onUpdateRole: (uid: string, role: string) => void }) {
  const [users, setUsers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (userRole === 'admin') {
      const fetchUsers = async () => {
        try {
          let snapshot;
          try {
            snapshot = await getDocs(collection(db, 'users'));
          } catch (e) {
            handleFirestoreError(e, OperationType.LIST, 'users');
          }
          setUsers(snapshot.docs.map(d => ({ ...d.data(), uid: d.id })));
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      };
      fetchUsers();
    }
  }, [userRole]);

  if (userRole !== 'admin') return <div className="text-center py-10 text-red-500 font-bold">غير مصرح لك بدخول هذه الصفحة</div>;

  return (
    <div className="bg-white rounded-3xl shadow-sm border p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="w-6 h-6 text-swa-blue" />
        <h2 className="text-xl font-bold">إدارة المستخدمين</h2>
      </div>
      
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-8 h-8 border-4 border-swa-blue border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right" dir="rtl">
            <thead>
              <tr className="border-b text-slate-400 text-xs uppercase tracking-wider">
                <th className="p-3 font-bold">المستخدم</th>
                <th className="p-3 font-bold">الإيميل</th>
                <th className="p-3 font-bold">الصلاحية</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.uid} className="border-b hover:bg-slate-50 transition-colors">
                  <td className="p-3 flex items-center gap-3">
                    {u.photoURL ? (
                      <img src={u.photoURL} className="w-8 h-8 rounded-full border shadow-sm" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                    <span className="font-bold text-slate-700">{u.displayName || 'بدون اسم'}</span>
                  </td>
                  <td className="p-3 text-slate-500 text-sm italic">{u.email}</td>
                  <td className="p-3">
                    <select 
                      value={u.role} 
                      onChange={(e) => onUpdateRole(u.uid, e.target.value)}
                      className="bg-slate-100 border-0 rounded-lg text-xs font-bold px-3 py-1.5 focus:ring-2 focus:ring-swa-blue transition-all"
                    >
                      <option value="viewer">مشاهد (Viewer)</option>
                      <option value="editor">محرر (Editor)</option>
                      <option value="admin">مدير (Admin)</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Stats Dashboard Component
function StatsDashboard({ reports }: { reports: ReportData[] }) {
  const sortedReports = [...reports].sort((a, b) => new Date(a.dateGreg).getTime() - new Date(b.dateGreg).getTime());
  
  // 1. Calculate Summary Stats
  const totalReports = reports.length;
  const totalProduction = reports.reduce((acc, r) => 
    acc + (parseFloat(r.nasah_prod) || 0) + (parseFloat(r.manf_prod) || 0), 0);
  const avgProduction = totalReports > 0 ? Math.round(totalProduction / totalReports) : 0;
  const totalMaint = reports.reduce((acc, r) => acc + (r.maintRows?.length || 0), 0);

  // 2. Prepare Production Trend Data
  const prodTrendData = sortedReports.map(r => ({
    date: r.dateGreg,
    nasah: parseFloat(r.nasah_prod) || 0,
    manfuha: parseFloat(r.manf_prod) || 0,
    total: (parseFloat(r.nasah_prod) || 0) + (parseFloat(r.manf_prod) || 0)
  }));

  // 3. Prepare Maintenance Distribution Data
  const maintTypeMap: { [key: string]: number } = {};
  reports.forEach(r => {
    r.maintRows?.forEach(m => {
      maintTypeMap[m.type] = (maintTypeMap[m.type] || 0) + 1;
    });
  });
  const maintData = Object.entries(maintTypeMap).map(([type, count]) => ({ type, count }));

  // 4. Quality Distribution (pH)
  const qualityData = reports.map(r => ({
    date: r.dateGreg,
    phRaw: parseFloat((r.quality as any).raw.ph) || 0,
    phProd: parseFloat((r.quality as any).prod.ph) || 0
  })).filter(d => d.phRaw > 0 && d.phProd > 0);

  const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  if (totalReports === 0) {
    return (
      <div className="text-center py-20 text-slate-400 font-bold border-2 border-dashed rounded-3xl">
        <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
        لا توجد بيانات كافية لإنشاء الإحصائيات
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          icon={<Archive />} 
          label="إجمالي التقارير" 
          value={totalReports} 
          subValue="تقرير مسجل"
          color="bg-swa-blue" 
        />
        <StatCard 
          icon={<Droplet />} 
          label="متوسط الإنتاج اليومي" 
          value={avgProduction.toLocaleString()} 
          subValue="م³ / يومياً"
          color="bg-emerald-600" 
        />
        <StatCard 
          icon={<RotateCcw />} 
          label="إجمالي أعمال الصيانة" 
          value={totalMaint} 
          subValue="طلب عمل منفذ"
          color="bg-amber-600" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Production Trend */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-swa-blue" />
             الإنتاج اليومي (م³)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={prodTrendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" fontSize={10} tickMargin={10} stroke="#94a3b8" />
                <YAxis fontSize={10} stroke="#94a3b8" />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" />
                <Line name="نساح" type="monotone" dataKey="nasah" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line name="منفوحة" type="monotone" dataKey="manfuha" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line name="الإجمالي" type="monotone" dataKey="total" stroke="#64748b" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Maintenance Distribution */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-600" />
            توزيع أعمال الصيانة حسب النوع
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={maintData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" fontSize={10} stroke="#94a3b8" />
                <YAxis dataKey="type" type="category" fontSize={12} width={100} stroke="#64748b" />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar name="عدد الأعمال" dataKey="count" radius={[0, 4, 4, 0]}>
                  {maintData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Quality Trend (pH) */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border lg:col-span-2">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            مراقبة جودة المياه (pH)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={qualityData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" fontSize={10} tickMargin={10} stroke="#94a3b8" />
                <YAxis domain={[6, 9]} fontSize={10} stroke="#94a3b8" />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" />
                <Line name="المياه الخام" type="step" dataKey="phRaw" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                <Line name="المياه المنتجة" type="step" dataKey="phProd" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, subValue, color }: { icon: any, label: string, value: any, subValue?: string, color: string }) {
  return (
    <div className={cn("p-6 rounded-3xl text-white shadow-lg overflow-hidden relative group", color)}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
      <div className="relative z-10">
        <div className="flex justify-between items-start">
          <div className="text-white/80 font-medium text-sm">{label}</div>
          <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">{icon}</div>
        </div>
        <div className="flex items-baseline gap-2 mt-4 text-left">
          <div className="text-4xl font-black">{value}</div>
          {subValue && <div className="text-xs text-white/60 font-bold">{subValue}</div>}
        </div>
      </div>
    </div>
  );
}

// Print Template
function PrintTemplate({ report }: { report: ReportData }) {
  const totalProd = (parseFloat(report.nasah_prod) || 0) + (parseFloat(report.manf_prod) || 0);
  const totalHpp = (parseFloat(report.nasah_hpp) || 0) + (parseFloat(report.manf_hpp) || 0);
  
  return (
    <div className="p-4 sm:p-6 text-black bg-white w-full print:m-0" dir="rtl" style={{ fontSize: '10pt', fontFamily: 'Inter, sans-serif' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: portrait; margin: 1cm; }
          .no-print { display: none !important; }
        }
      `}} />
      <div className="flex justify-between items-center border-b-2 border-swa-blue pb-4 mb-4">
        <div>
          <h1 className="text-lg font-black text-swa-blue">الهيئة السعودية للمياه</h1>
          <p className="text-[7pt] text-swa-blue-mid">Saudi Water Authority</p>
        </div>
        <h2 className="text-xl font-bold">تقرير التشغيل اليومي</h2>
        <table className="text-[8pt] border-collapse w-32">
          <tbody>
            <tr className="border"><td className="bg-swa-blue-header text-white px-1">اليوم</td><td className="px-1 text-center">{report.dayName}</td></tr>
            <tr className="border"><td className="bg-swa-blue-header text-white px-1">التاريخ</td><td className="px-1 text-center">{report.dateGreg}</td></tr>
            <tr className="border"><td className="bg-swa-blue-header text-white px-1">الهجري</td><td className="px-1 text-center">{report.dateHijri}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="bg-swa-blue-header text-white text-center font-bold py-1 mb-2">معلومات المحطة</div>
      <table className="w-full border-collapse border border-swa-blue mb-4 text-[8pt]">
        <thead>
          <tr className="bg-swa-blue-row/50">
            <th className="border border-swa-blue p-1">المدينة</th>
            <th className="border border-swa-blue p-1">المحطة</th>
            <th className="border border-swa-blue p-1">الإنتاج التصميمي</th>
            <th className="border border-swa-blue p-1">مصدر المياه</th>
            <th className="border border-swa-blue p-1">الآبار بالخدمة</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-center">
            <td className="border border-swa-blue p-1">{report.city}</td>
            <td className="border border-swa-blue p-1 font-bold">{report.station}</td>
            <td className="border border-swa-blue p-1">{report.designProd}</td>
            <td className="border border-swa-blue p-1">{report.waterSource}</td>
            <td className="border border-swa-blue p-1">{report.activeWells} / {report.totalWells}</td>
          </tr>
          <tr>
            <td className="border border-swa-blue p-1 bg-swa-blue-row font-bold">أرقام الآبار</td>
            <td colSpan={4} className="border border-swa-blue p-1">{report.wellNumbers}</td>
          </tr>
        </tbody>
      </table>

      <div className="bg-swa-blue-header text-white text-center font-bold py-1 mb-2">الإنتاج</div>
      <table className="w-full border-collapse border border-swa-blue mb-4 text-[8pt]">
        <thead className="bg-swa-blue-row/50">
          <tr>
            <th className="border border-swa-blue p-1">الموقع</th>
            <th className="border border-swa-blue p-1">الإنتاج (م³/يوم)</th>
            <th className="border border-swa-blue p-1">التصدير HPP</th>
            <th className="border border-swa-blue p-1">مضخات الرفع (كلي)</th>
            <th className="border border-swa-blue p-1">خارج الخدمة</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-center">
            <td className="border border-swa-blue p-1 bg-swa-blue-row font-bold">نساح</td>
            <td className="border border-swa-blue p-1">{report.nasah_prod}</td>
            <td className="border border-swa-blue p-1">{report.nasah_hpp}</td>
            <td className="border border-swa-blue p-1">{report.nasah_pump_total}</td>
            <td className="border border-swa-blue p-1">{report.nasah_pump_out}</td>
          </tr>
          <tr className="text-center">
            <td className="border border-swa-blue p-1 bg-swa-blue-row font-bold">منفوحة</td>
            <td className="border border-swa-blue p-1">{report.manf_prod}</td>
            <td className="border border-swa-blue p-1">{report.manf_hpp}</td>
            <td className="border border-swa-blue p-1">{report.manf_pump_total}</td>
            <td className="border border-swa-blue p-1">{report.manf_pump_out}</td>
          </tr>
          <tr className="text-center bg-green-50 font-bold">
            <td className="border border-swa-blue p-1">الإجمالي</td>
            <td className="border border-swa-blue p-1">{totalProd.toLocaleString()}</td>
            <td className="border border-swa-blue p-1">{totalHpp.toLocaleString()}</td>
            <td className="border border-swa-blue p-1" colSpan={2}></td>
          </tr>
        </tbody>
      </table>

      <div className="bg-swa-blue-header text-white text-center font-bold py-1 mb-2">جودة المياه</div>
      <table className="w-full border-collapse border border-swa-blue mb-4 text-[7pt]">
        <thead className="bg-swa-blue-row/50">
          <tr>
            <th className="border border-swa-blue p-1">Sampling Point</th>
            <th className="border border-swa-blue p-1">Temp °C</th>
            <th className="border border-swa-blue p-1">Turb NTU</th>
            <th className="border border-swa-blue p-1">Free Cl</th>
            <th className="border border-swa-blue p-1">pH</th>
            <th className="border border-swa-blue p-1">TDS</th>
            <th className="border border-swa-blue p-1">Iron</th>
          </tr>
        </thead>
        <tbody>
          {['raw', 'prod', 'rej'].map(k => (
            <tr key={k} className="text-center">
              <td className="border border-swa-blue p-1 font-bold">{k === 'raw' ? 'Raw Water' : k === 'prod' ? 'Product Water' : 'Rejected Water'}</td>
              <td className="border border-swa-blue p-1">{(report.quality as any)[k].temp}</td>
              <td className="border border-swa-blue p-1">{(report.quality as any)[k].turbidity}</td>
              <td className="border border-swa-blue p-1">{(report.quality as any)[k].freeChlorine}</td>
              <td className="border border-swa-blue p-1">{(report.quality as any)[k].ph}</td>
              <td className="border border-swa-blue p-1">{(report.quality as any)[k].tds}</td>
              <td className="border border-swa-blue p-1">{(report.quality as any)[k].iron}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="bg-swa-blue-header text-white text-center font-bold py-1 mb-2">تقرير الصيانة</div>
      <table className="w-full border-collapse border border-swa-blue mb-6 text-[8pt]">
        <thead className="bg-swa-blue-row/50">
          <tr>
            <th className="border border-swa-blue p-1">نوع العمل</th>
            <th className="border border-swa-blue p-1">المعدة</th>
            <th className="border border-swa-blue p-1">وصف العمل</th>
          </tr>
        </thead>
        <tbody>
          {report.maintRows.map((m, i) => (
            <tr key={i}>
              <td className="border border-swa-blue p-1 text-center">{m.type}</td>
              <td className="border border-swa-blue p-1">{m.equip}</td>
              <td className="border border-swa-blue p-1">{m.work}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid grid-cols-2 gap-10 mt-10">
        <div className="border-t border-black pt-2 text-center text-sm font-bold">معد التقرير: {report.supervisor}</div>
        <div className="border-t border-black pt-2 text-center text-sm font-bold">مشرف التشغيل: {report.nwcSupervisor}</div>
      </div>
    </div>
  );
}
