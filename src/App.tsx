import React, { useState, useEffect, useRef } from 'react';
import { JobDeck } from './components/JobDeck';
import { Tracker } from './components/Tracker';
import { JobDetailModal } from './components/JobDetailModal';
import AiAssistant from './components/AiAssistant';
import type { AiAssistantRef } from './components/AiAssistant';
import { type Job } from './components/JobCard';
import { LayoutGrid, Layers, User as UserIcon, Settings, Loader2, UploadCloud, FileText, Trash2, LogOut } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from './services/api';
import { useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';

type View = 'discovery' | 'tracker' | 'profile';

interface UploadedFile {
    originalName: string;
    filename: string;
    path: string;
    mimetype: string;
    uploadedAt: string;
}

function App() {
  const { user, logout, loading: authLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(false);
  const assistantRef = useRef<AiAssistantRef>(null);

  const [currentView, setCurrentView] = useState<View>('discovery');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<any[]>([]); 
  const [loadingData, setLoadingData] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  
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
      } catch (err) { console.error(err); } finally { setLoadingData(false); }
  };

  useEffect(() => { if (user) loadData(); }, [user]);

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
        } catch (error) { alert("Failed to upload files."); } finally { setUploading(false); }
    }
  };

  const handleDeleteFile = async (filename: string) => {
      if (!confirm("Delete?")) return;
      try {
          const response = await api.deleteFile(filename);
          setUploadedFiles(response.files);
      } catch (error) { alert("Error"); }
  };

  if (authLoading) return <div className="h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  if (!user) return isLogin ? <Login onSwitch={() => setIsLogin(false)} /> : <Signup onSwitch={() => setIsLogin(true)} />;

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      <nav className="w-20 lg:w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 transition-all duration-300">
        <div className="h-20 flex items-center justify-center lg:justify-start lg:px-6 border-b border-slate-100">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200"><Layers className="text-white w-6 h-6" /></div>
          <span className="ml-3 font-bold text-xl hidden lg:block tracking-tight text-slate-800">JobSwipe</span>
        </div>
        <div className="flex-1 py-6 flex flex-col gap-2 px-2 lg:px-4">
          <NavButton active={currentView === 'discovery'} onClick={() => setCurrentView('discovery')} icon={LayoutGrid} label="Discovery" />
          <NavButton active={currentView === 'tracker'} onClick={() => setCurrentView('tracker')} icon={Layers} label="Tracker" badge={applications.length > 0 ? applications.length : undefined} />
          <NavButton active={currentView === 'profile'} onClick={() => setCurrentView('profile')} icon={UserIcon} label="Profile" />
        </div>
        <div className="p-4 border-t border-slate-100">
           <button onClick={logout} className="flex items-center justify-center lg:justify-start w-full p-3 rounded-xl hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition-colors"><LogOut className="w-5 h-5" /><span className="ml-3 hidden lg:block font-medium">Sign Out</span></button>
        </div>
      </nav>
      <main className="flex-1 relative overflow-hidden flex flex-col">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-30">
           <div><h1 className="text-xl font-bold text-slate-800">{currentView.toUpperCase()}</h1><p className="text-xs text-slate-500 font-medium">Welcome back, {user.name}</p></div>
           <div className="flex items-center gap-4"><div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold border-2 border-white shadow-sm">{user.name.charAt(0).toUpperCase()}</div></div>
        </header>
        <div className="flex-1 overflow-y-auto relative p-6">
           {currentView === 'discovery' && (
             <div className="h-full flex flex-col items-center justify-center">
                {loadingData ? <Loader2 className="animate-spin" /> : <JobDeck initialJobs={jobs} userGradYear={2026} userId={user._id} onJobSelect={setSelectedJob} onDeckEmpty={() => {}} onSwipeAction={handleSwipe} />}
             </div>
           )}
           {currentView === 'tracker' && <Tracker userId={user._id} />}
           {currentView === 'profile' && (
             <div className="max-w-2xl mx-auto py-10">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                   <div className="text-center mb-8"><h2 className="text-2xl font-bold text-slate-800 mb-2">My Resumes</h2><p className="text-slate-500">Upload up to 6 resumes.</p></div>
                   <div className="p-8 border-2 border-dashed border-indigo-200 rounded-xl bg-indigo-50/50 hover:bg-indigo-50 transition-colors text-center cursor-pointer relative">
                      <input type="file" multiple onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className="flex flex-col items-center gap-3 pointer-events-none">
                          <div className="p-3 bg-white rounded-full shadow-sm text-indigo-600">{uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <UploadCloud className="w-6 h-6" />}</div>
                          <div><p className="font-bold text-indigo-900">Click to Upload</p></div>
                      </div>
                   </div>
                   <div className="mt-8 flex flex-col gap-3">
                       {uploadedFiles.map((file, index) => (
                           <div key={index} className="flex items-center p-3 bg-slate-50 border border-slate-200 rounded-lg group">
                               <div className="p-2 bg-white rounded-md border border-slate-100 mr-3 text-indigo-500"><FileText className="w-5 h-5" /></div>
                               <div className="flex-1 min-w-0"><p className="font-medium text-slate-800 truncate">{file.originalName}</p></div>
                               <button onClick={() => handleDeleteFile(file.filename)} className="p-2 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                           </div>
                       ))}
                   </div>
                </div>
             </div>
           )}
        </div>
      </main>
      <AiAssistant ref={assistantRef} userId={user._id} />
      <JobDetailModal job={selectedJob} onClose={() => setSelectedJob(null)} />
    </div>
  );
}

const NavButton: React.FC<{active: boolean, onClick: () => void, icon: React.ElementType, label: string, badge?: number}> = ({ active, onClick, icon: Icon, label, badge }) => (
  <button onClick={onClick} className={clsx("flex items-center justify-center lg:justify-start w-full p-3 lg:px-4 rounded-xl transition-all duration-200 group relative", active ? "bg-indigo-600 text-white" : "hover:bg-indigo-50 text-slate-500")}>
    <Icon className={clsx("w-6 h-6")} />
    <span className={clsx("ml-3 font-medium hidden lg:block")}>{label}</span>
    {badge && <span className={clsx("absolute top-2 right-2 lg:top-auto lg:right-4 w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-600")}>{badge}</span>}
  </button>
);

export default App;