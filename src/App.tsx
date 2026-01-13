import React, { useState, useEffect, useRef } from 'react';
import { JobDeck } from './components/JobDeck';
import { Tracker } from './components/Tracker';
import { JobDetailModal } from './components/JobDetailModal';
import { ReviewModal } from './components/ReviewModal';
import { AiAssistant } from './components/AiAssistant';
import { type Job } from './components/JobCard';
import { LayoutGrid, Layers, User as UserIcon, Loader2, UploadCloud, FileText, Trash2, LogOut, Search, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from './services/api';
import { useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { Sun, Moon } from 'lucide-react';

type View = 'discovery' | 'tracker' | 'profile' | 'settings';

interface UploadedFile {
  originalName: string;
  filename: string;
  path: string;
  mimetype: string;
  uploadedAt: string;
}

function AppContent() {
  const { user, logout, loading: authLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isLogin, setIsLogin] = useState(false);
  const assistantRef = useRef<any>(null);

  const [currentView, setCurrentView] = useState<View>('discovery');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>(user?.resumes || []);
  const [uploading, setUploading] = useState(false);
  const [reviewApp, setReviewApp] = useState<any | null>(null);
  const [hasLoadedInitialData, setHasLoadedInitialData] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        assistantRef.current?.toggleOpen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadData = async () => {
    if (!user) return;
    setLoadingData(true);
    try {
      const response = await fetch('http://localhost:5000/api/jobs');
      const jobsData = await response.json();
      setJobs(jobsData);
      const userRes = await fetch('http://localhost:5000/api/auth/me', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const userData = await userRes.json();
      if (userData.resumes) setUploadedFiles(userData.resumes);
      const appsRes = await api.getApplications(user._id);
      setApplications(appsRes);
    } catch (err) { console.error(err); } finally {
      setLoadingData(false);
      setHasLoadedInitialData(true);
    }
  };

  const handleIngest = async (query: string) => {
    setLoadingData(true);
    try {
      const res = await fetch('http://localhost:5000/api/jobs/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          range: 'month',
          clearFirst: true,
          userId: user?._id
        })
      });
      if (res.ok) {
        await loadData();
      } else {
        alert("Ingestion failed. Check RAPIDAPI_KEY.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (user) {
      if (user.resumes) setUploadedFiles(user.resumes);
      loadData();
    } else {
      setHasLoadedInitialData(false);
      setUploadedFiles([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSwipe = async (direction: 'right' | 'left', job: Job) => {
    if (direction === 'right' && user) {
      try {
        await api.apply(user._id, job._id);
        const appsRes = await api.getApplications(user._id);
        setApplications(appsRes);
      } catch (err) { console.error(err); }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0 && user) {
      setUploading(true);
      try {
        const filesArray = Array.from(event.target.files);
        const response = await api.uploadFiles(user._id, filesArray);
        setUploadedFiles(response.totalFiles);
        alert(`Upload Success: ${response.parseStatus}`);
      } catch (err) { alert("Failed to upload files."); console.error(err); } finally { setUploading(false); }
    }
  };

  const handleDeleteFile = async (filename: string) => {
    if (!confirm("Delete?")) return;
    try {
      const response = await api.deleteFile(filename);
      setUploadedFiles(response.files);
    } catch (err) { alert("Error deleting file"); console.error(err); }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    const confirmed = confirm("⚠️ PERMANENT ACTION: Delete your account and all data? This cannot be undone.");
    if (confirmed) {
      try {
        await api.deleteAccount(user._id);
        logout();
      } catch (err) {
        alert("Failed to delete account.");
        console.error(err);
      }
    }
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  if (!user) return isLogin ? <Login onSwitch={() => setIsLogin(false)} /> : <Signup onSwitch={() => setIsLogin(true)} />;

  if (!hasLoadedInitialData) return <div className="h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 font-sans overflow-hidden transition-colors duration-300">
      <nav className="w-20 lg:w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col flex-shrink-0 transition-all duration-300">
        <div className="h-20 flex items-center justify-center lg:justify-start lg:px-6 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200"><Layers className="text-white w-6 h-6" /></div>
          <span className="ml-3 font-bold text-xl hidden lg:block tracking-tight text-slate-800 dark:text-white">JobSwipe</span>
        </div>
        <div className="flex-1 py-6 flex flex-col gap-2 px-2 lg:px-4">
          <NavButton active={currentView === 'discovery'} onClick={() => setCurrentView('discovery')} icon={LayoutGrid} label="Discovery" />
          <NavButton active={currentView === 'tracker'} onClick={() => setCurrentView('tracker')} icon={Layers} label="Tracker" badge={applications.length > 0 ? applications.length : undefined} />
          <NavButton active={currentView === 'profile'} onClick={() => setCurrentView('profile')} icon={UserIcon} label="Profile" />
        </div>
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <button onClick={toggleTheme} className="flex items-center justify-center lg:justify-start w-full p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            <span className="ml-3 hidden lg:block font-medium">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
          </button>
          <button onClick={logout} className="flex items-center justify-center lg:justify-start w-full p-3 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"><LogOut className="w-5 h-5" /><span className="ml-3 hidden lg:block font-medium">Sign Out</span></button>
        </div>
      </nav>
      <main className="flex-1 relative overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
        <header className="h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 sticky top-0 z-30 font-bold transition-colors duration-300">
          <div><h1 className="text-xl font-bold text-slate-800 dark:text-white">{currentView.toUpperCase()}</h1><p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Welcome back, {user.name}</p></div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-xs font-bold text-indigo-700">{applications.filter(a => a.status === 'Applied').length}/30 Applications Today</span>
            </div>
            <button
              onClick={() => setCurrentView('settings')}
              className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold border-2 border-white shadow-sm hover:ring-2 hover:ring-indigo-500 transition-all cursor-pointer"
            >
              {user.name.charAt(0).toUpperCase()}
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto relative p-6">
          {user && hasLoadedInitialData && uploadedFiles.length === 0 && currentView !== 'profile' && (
            <div className="absolute inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center border border-slate-100 dark:border-slate-800">
                <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6 text-indigo-600 dark:text-indigo-400">
                  <UploadCloud className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Resume Required</h2>
                <p className="text-slate-500 dark:text-slate-400 mb-8">To start matching you with the best jobs, we need your resume. Upload it once, and we'll handle the rest.</p>
                <button
                  onClick={() => setCurrentView('profile')}
                  className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                >
                  Go to Profile to Upload
                </button>
              </div>
            </div>
          )}

          {currentView === 'discovery' && (
            <div className="h-full flex flex-col items-center">
              <div className="w-full max-w-2xl mb-8 flex gap-3 items-center bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search jobs (e.g. Frontend Developer)..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white dark:placeholder-slate-400 transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value;
                        handleIngest(val);
                      }
                    }}
                  />
                </div>
                <button
                  onClick={() => {
                    const input = document.querySelector('input[placeholder*="Search jobs"]') as HTMLInputElement;
                    handleIngest(input?.value || 'Software Engineer');
                  }}
                  disabled={loadingData}
                  className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 disabled:opacity-50 flex items-center gap-2"
                >
                  {loadingData ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Fetch Real
                </button>
              </div>

              <div className="flex-1 w-full flex flex-col items-center justify-center">
                {loadingData ? <Loader2 className="animate-spin text-indigo-600 w-10 h-10" /> : <JobDeck initialJobs={jobs} userGradYear={2026} onJobSelect={setSelectedJob} onDeckEmpty={() => { }} onSwipeAction={handleSwipe} />}
              </div>
            </div>
          )}
          {currentView === 'tracker' && (
            <Tracker
              userId={user._id}
              onReview={(app) => setReviewApp(app)}
              onApplicationsChange={(updatedApps) => setApplications(updatedApps)}
            />
          )}
          {currentView === 'profile' && (
            <div className="max-w-2xl mx-auto py-10">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
                <div className="text-center mb-8"><h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">My Resumes</h2><p className="text-slate-500 dark:text-slate-400">Upload up to 6 resumes.</p></div>
                <div className="p-8 border-2 border-dashed border-indigo-200 dark:border-indigo-800 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/10 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-center cursor-pointer relative">
                  <input type="file" multiple onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <div className="flex flex-col items-center gap-3 pointer-events-none">
                    <div className="p-3 bg-white dark:bg-slate-800 rounded-full shadow-sm text-indigo-600 dark:text-indigo-400">{uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <UploadCloud className="w-6 h-6" />}</div>
                    <div><p className="font-bold text-indigo-900 dark:text-indigo-300">Click to Upload</p></div>
                  </div>
                </div>
                <div className="mt-8 flex flex-col gap-3">
                  {uploadedFiles.map((file, index) => (
                    <div key={index} className="flex items-center p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg group transition-colors">
                      <div className="p-2 bg-white dark:bg-slate-700 rounded-md border border-slate-100 dark:border-slate-600 mr-3 text-indigo-500 dark:text-indigo-400"><FileText className="w-5 h-5" /></div>
                      <div className="flex-1 min-w-0"><p className="font-medium text-slate-800 dark:text-white truncate">{file.originalName}</p></div>
                      <button onClick={() => handleDeleteFile(file.filename)} className="p-2 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentView === 'settings' && (
            <div className="max-w-xl mx-auto py-10">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-6">Account Settings</h2>

                <div className="space-y-6">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 transition-colors">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Signed in as</p>
                    <p className="font-bold text-slate-800 dark:text-white">{user.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
                  </div>

                  <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-rose-600 uppercase tracking-widest mb-4">Danger Zone</h3>
                    <div className="p-6 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/50 rounded-2xl transition-colors">
                      <p className="text-sm text-rose-800 dark:text-rose-300 font-medium mb-4">Permanently delete your account and all associated data, including resumes and applications.</p>
                      <button
                        onClick={handleDeleteAccount}
                        className="w-full py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-colors shadow-lg shadow-rose-200 dark:shadow-none flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-5 h-5" />
                        Delete Account Permanently
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <AiAssistant ref={assistantRef} userId={user._id} jobs={jobs} applications={applications} />
      <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      <ReviewModal
        application={reviewApp}
        onClose={() => setReviewApp(null)}
        onApprove={async (appId) => {
          try {
            await fetch(`http://localhost:5000/api/applications/${appId}/apply`, { method: 'POST' });
          } catch (err) { alert("Apply failed"); }
        }}
      />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const NavButton: React.FC<{ active: boolean, onClick: () => void, icon: React.ElementType, label: string, badge?: number }> = ({ active, onClick, icon: Icon, label, badge }) => (
  <button onClick={onClick} className={clsx("flex items-center justify-center lg:justify-start w-full p-3 lg:px-4 rounded-xl transition-all duration-200 group relative", active ? "bg-indigo-600 text-white shadow-md" : "hover:bg-indigo-50 text-slate-500")}>
    <Icon className={clsx("w-6 h-6")} />
    <span className={clsx("ml-3 font-medium hidden lg:block")}>{label}</span>
    {badge && <span className={clsx("absolute top-2 right-2 lg:top-auto lg:right-4 w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-600")}>{badge}</span>}
  </button>
);

export default App;