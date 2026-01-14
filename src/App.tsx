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
  const { user, token, login, logout, loading: authLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isLogin, setIsLogin] = useState(() => {
    // Default to login if user has previously logged in
    return localStorage.getItem('hasAccount') === 'true';
  });
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

  // Profile form state - defaults must match UI select defaults!
  const [isEditingProfile, setIsEditingProfile] = useState(false); // Profile edit mode
  const [profileFormData, setProfileFormData] = useState({
    personalDetails: {
      phone: '', address: '', city: '', state: '', zip: '', linkedin: '', github: '', portfolio: '',
      university: '', degree: '', gpa: '', gradMonth: '', gradYear: ''
    },
    demographics: { gender: 'Male', race: 'Black or African American', veteran: 'I am not a protected veteran', disability: 'No, I do not have a disability' },
    commonReplies: { workAuth: 'Yes', sponsorship: 'No', relocation: 'Yes', formerEmployee: 'No' },
    customAnswers: { pronouns: '', conflictOfInterest: 'No', familyRel: 'No', govOfficial: 'No' },
    essayAnswers: { whyExcited: '', howDidYouHear: '' },
    preferences: { autoGenerateEssays: false }
  });

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
      // Pass userId to filter out applied/rejected jobs
      const jobsData = await api.getJobs(user._id);
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
    if (!user) return alert('Please log in first');
    console.log(`🔍 [TELEMETRY] User ${user._id} initiating job ingest with query: "${query}"`);
    setLoadingData(true);
    try {
      await fetch('http://localhost:5000/api/jobs/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, userId: user._id })
      });
      console.log(`✅ [TELEMETRY] Job ingest successful`);
      await loadData();
    } catch (err) {
      console.error(`❌ [TELEMETRY] Job ingest failed:`, err);
      alert('Failed to fetch jobs');
    } finally {
      setLoadingData(false);
    }
  };



  const isProfileComplete = () => {
    if (!user) return false;
    const pd = profileFormData.personalDetails;
    const demo = profileFormData.demographics;
    const common = profileFormData.commonReplies;
    const essay = profileFormData.essayAnswers;

    // Debug: Show what's missing
    const missing: string[] = [];
    if (!pd.phone) missing.push('phone');
    if (!pd.address) missing.push('address');
    if (!pd.city) missing.push('city');
    if (!pd.state) missing.push('state');
    if (!pd.zip) missing.push('zip');
    if (!pd.linkedin) missing.push('linkedin');
    if (!pd.university) missing.push('university');
    if (!pd.degree) missing.push('degree');
    if (!demo.gender) missing.push('gender');
    if (!demo.race) missing.push('race');
    if (!demo.veteran) missing.push('veteran');
    if (!demo.disability) missing.push('disability');
    if (!common.workAuth) missing.push('workAuth');
    if (!common.sponsorship) missing.push('sponsorship');
    if (!common.relocation) missing.push('relocation');
    if (!common.formerEmployee) missing.push('formerEmployee');
    if (!essay.whyExcited) missing.push('whyExcited');
    if (!essay.howDidYouHear) missing.push('howDidYouHear');

    if (missing.length > 0) {
      console.warn(`🚨 [PROFILE_CHECK] Missing fields:`, missing);
    }

    return missing.length === 0;
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

  // Sync user data to profile form (only override defaults if DB has actual values)
  useEffect(() => {
    if (user) {
      // Helper: merge objects but only use source values if they're not empty strings
      const smartMerge = (defaults: any, source: any) => {
        if (!source) return defaults;
        const result = { ...defaults };
        for (const key of Object.keys(source)) {
          if (source[key] !== '' && source[key] !== null && source[key] !== undefined) {
            result[key] = source[key];
          }
        }
        return result;
      };

      setProfileFormData(prev => ({
        personalDetails: smartMerge(prev.personalDetails, user.personalDetails),
        demographics: smartMerge(prev.demographics, user.demographics),
        commonReplies: smartMerge(prev.commonReplies, user.commonReplies),
        customAnswers: smartMerge(prev.customAnswers, user.customAnswers),
        essayAnswers: smartMerge(prev.essayAnswers, user.essayAnswers),
        preferences: smartMerge(prev.preferences, user.preferences)
      }));
    }
  }, [user]);

  const handleSwipe = async (direction: 'right' | 'left', job: Job) => {
    if (direction === 'right' && user) {
      console.log(`👉 [TELEMETRY] User ${user._id} swiped RIGHT on job: ${job.title} at ${job.company}`);
      fetch('http://localhost:5000/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'SWIPE_RIGHT', userId: user._id, data: { title: job.title, company: job.company, jobId: job._id } }) }).catch(() => { });

      if (!isProfileComplete()) {
        console.warn(`⚠️ [TELEMETRY] Profile incomplete! Blocking application.`);
        fetch('http://localhost:5000/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'PROFILE_INCOMPLETE', userId: user._id, data: {} }) }).catch(() => { });
        alert('⚠️ Please complete your profile in the Profile tab before applying to jobs!');
        setCurrentView('profile');
        return;
      }

      try {
        const response = await api.apply(user._id, job._id);
        console.log(`✅ [TELEMETRY] Application created: ${response._id}`);
        alert(`Applied to ${job.title}!`);
        const apps = await api.getApplications(user._id);
        setApplications(apps);
      } catch (err) {
        console.error(`❌ [TELEMETRY] Application failed:`, err);
        alert('Application failed');
      }
    } else if (direction === 'left') {
      console.log(`👈 [TELEMETRY] User swiped LEFT (rejected) on job: ${job.title} at ${job.company}`);
      if (user) {
        fetch('http://localhost:5000/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'SWIPE_LEFT', userId: user._id, data: { title: job.title, company: job.company, jobId: job._id } }) }).catch(() => { });
        try {
          await api.rejectJob(user._id, job._id);
          console.log(`🚫 [TELEMETRY] Job ${job._id} permanently rejected`);
        } catch (err) {
          console.error(`❌ [TELEMETRY] Rejection failed:`, err);
        }
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    console.log(`📤 [TELEMETRY] User ${user._id} uploading ${files.length} file(s): ${Array.from(files).map(f => f.name).join(', ')}`);
    fetch('http://localhost:5000/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event: 'RESUME_UPLOAD', userId: user._id, data: { filename: files[0].name, count: files.length } }) }).catch(() => { });
    setUploading(true);
    try {
      const result = await api.uploadFiles(user._id, Array.from(files));
      console.log(`✅ [TELEMETRY] Files uploaded successfully. Auto-populating profile from resume...`);
      setUploadedFiles(result.allFiles);
      alert('Files uploaded! Your profile has been auto-populated from your resume.');

      // Refresh user data to get auto-populated fields
      const refreshedUser = await api.getUser(token!);
      console.log(`🔄 [TELEMETRY] Profile auto-populated with parsed resume data`);

      if (token && refreshedUser) {
        // Force update of global user state to reflect changes immediately
        login(token, refreshedUser);
      }
    } catch (err: any) {
      console.error(`❌ [TELEMETRY] File upload failed:`, err);
      alert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
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

  const handleSaveProfile = async () => {
    if (!user || !token) return;
    try {
      await api.updateUser(user._id, profileFormData);
      const updatedUser = await api.getUser(token);
      login(token, updatedUser);
      setIsEditingProfile(false);
      alert("✅ Profile saved successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save profile.");
    }
  };

  const handleClearProfile = async () => {
    if (!user || !token) return;
    if (!confirm("⚠️ Are you sure you want to clear all profile data? This will erase your auto-filled answers.")) return;

    const emptyUserInfo = {
      personalDetails: { phone: '', address: '', city: '', state: '', zip: '', linkedin: '', github: '', portfolio: '', university: '', degree: '', gpa: '', gradMonth: '', gradYear: '' },
      demographics: { gender: '', race: '', veteran: '', disability: '' },
      commonReplies: { workAuth: '', sponsorship: '', relocation: '', formerEmployee: '' },
      customAnswers: { pronouns: '', conflictOfInterest: 'No', familyRel: 'No', govOfficial: 'No' },
      essayAnswers: { whyExcited: '', howDidYouHear: '' },
      preferences: { autoGenerateEssays: false }
    };

    setProfileFormData(emptyUserInfo);

    setIsEditingProfile(true); // Switch to edit mode to see changes? Or save immediately.
    try {
      await api.updateUser(user._id, emptyUserInfo);
      const updated = await api.getUser(token);
      login(token, updated);
      alert("🗑️ Profile data cleared.");
    } catch (e) {
      console.error(e);
      alert("Error clearing data");
    }
  };

  const updateProfileField = (section: keyof typeof profileFormData, field: string, value: string | boolean) => {
    setProfileFormData(prev => ({
      ...prev,
      [section]: {
        ...prev[section] as any,
        [field]: value
      }
    }));
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
          {user && hasLoadedInitialData && (!uploadedFiles || uploadedFiles.length === 0) && currentView !== 'profile' && (
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
            <div className="flex flex-col h-full">
              {/* Manual Job Input */}
              <div className="px-6 pt-6 pb-2">
                <div className="max-w-3xl flex gap-2">
                  <input
                    type="text"
                    id="manual-job-link"
                    placeholder="Paste any job link (LinkedIn, Lever, Greenhouse, Workday)..."
                    className="flex-1 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500"
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value;
                        if (val && user) {
                          try {
                            await api.createManualJob(user._id, val);
                            (e.target as HTMLInputElement).value = '';
                            const apps = await api.getApplications(user._id);
                            setApplications(apps);
                            alert("Job Added! Check 'Queued' column.");
                          } catch (err) { alert("Failed to add link"); }
                        }
                      }
                    }}
                  />
                  <button
                    onClick={async () => {
                      const input = document.getElementById('manual-job-link') as HTMLInputElement;
                      if (input?.value && user) {
                        try {
                          await api.createManualJob(user._id, input.value);
                          input.value = '';
                          const apps = await api.getApplications(user._id);
                          setApplications(apps);
                          alert("Job Added! Check 'Queued' column.");
                        } catch (err) { alert("Failed to add link"); }
                      }
                    }}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors"
                  >
                    Add & Track
                  </button>
                </div>
              </div>

              <Tracker
                userId={user._id}
                onReview={(app) => setReviewApp(app)}
                onApplicationsChange={(updatedApps) => setApplications(updatedApps)}
              />
            </div>
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
                  {uploadedFiles?.map((file, index) => (
                    <div key={index} className="flex items-center p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg group transition-colors">
                      <div className="p-2 bg-white dark:bg-slate-700 rounded-md border border-slate-100 dark:border-slate-600 mr-3 text-indigo-500 dark:text-indigo-400"><FileText className="w-5 h-5" /></div>
                      <div className="flex-1 min-w-0"><p className="font-medium text-slate-800 dark:text-white truncate">{file.originalName}</p></div>
                      <button onClick={() => handleDeleteFile(file.filename)} className="p-2 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>

                {/* Auto-Fill Preferences Form */}
                <div className="mt-10 border-t border-slate-200 dark:border-slate-800 pt-8">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">🤖 Auto-Fill Preferences</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        The bot uses these answers to fill dropdowns automatically. Be accurate!
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {!isEditingProfile ? (
                        <button onClick={() => setIsEditingProfile(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm transition-all">
                          ✏️ Edit Profile
                        </button>
                      ) : (
                        <div className="flex gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                          <button onClick={handleClearProfile} className="px-3 py-2 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200 font-medium text-sm flex items-center gap-1 transition-colors">
                            <Trash2 className="w-4 h-4" /> Clear
                          </button>
                          <button onClick={handleSaveProfile} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-bold shadow-sm flex items-center gap-1 transition-colors">
                            <RefreshCw className="w-4 h-4" /> Save Changes
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Personal Details (Auto-Fill) */}
                    <div className="space-y-4 md:col-span-2">
                      <h4 className="font-bold text-slate-700 dark:text-slate-300 border-b pb-2 border-slate-200 dark:border-slate-700">📍 Personal Details (For Auto-Fill)</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <label className="block">
                          <span className="text-xs font-bold text-slate-500 uppercase">Phone</span>
                          <input type="text" className="w-full mt-1 p-2 text-sm rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900"
                            placeholder="e.g. 555-123-4567"
                            value={profileFormData.personalDetails?.phone || ""}
                            onChange={(e) => updateProfileField('personalDetails', 'phone', e.target.value)}
                            disabled={!isEditingProfile}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold text-slate-500 uppercase">Address</span>
                          <input type="text" className="w-full mt-1 p-2 text-sm rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900"
                            placeholder="e.g. 123 Main St"
                            value={profileFormData.personalDetails?.address || ""}
                            onChange={(e) => updateProfileField('personalDetails', 'address', e.target.value)}
                            disabled={!isEditingProfile}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold text-slate-500 uppercase">City</span>
                          <input type="text" className="w-full mt-1 p-2 text-sm rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900"
                            placeholder="e.g. San Francisco"
                            value={profileFormData.personalDetails?.city || ""}
                            onChange={(e) => updateProfileField('personalDetails', 'city', e.target.value)}
                            disabled={!isEditingProfile}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold text-slate-500 uppercase">State</span>
                          <input type="text" className="w-full mt-1 p-2 text-sm rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900"
                            placeholder="e.g. CA"
                            value={profileFormData.personalDetails?.state || ""}
                            onChange={(e) => updateProfileField('personalDetails', 'state', e.target.value)}
                            disabled={!isEditingProfile}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold text-slate-500 uppercase">Zip</span>
                          <input type="text" className="w-full mt-1 p-2 text-sm rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900"
                            placeholder="e.g. 94105"
                            value={profileFormData.personalDetails?.zip || ""}
                            onChange={(e) => updateProfileField('personalDetails', 'zip', e.target.value)}
                            disabled={!isEditingProfile}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold text-slate-500 uppercase">LinkedIn URL</span>
                          <input type="text" className="w-full mt-1 p-2 text-sm rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900"
                            placeholder="https://linkedin.com/in/..."
                            value={profileFormData.personalDetails?.linkedin || ""}
                            onChange={(e) => updateProfileField('personalDetails', 'linkedin', e.target.value)}
                            disabled={!isEditingProfile}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold text-slate-500 uppercase">University</span>
                          <input type="text" className="w-full mt-1 p-2 text-sm rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900"
                            placeholder="e.g. Stanford University"
                            value={profileFormData.personalDetails?.university || ""}
                            onChange={(e) => updateProfileField('personalDetails', 'university', e.target.value)}
                            disabled={!isEditingProfile}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold text-slate-500 uppercase">Degree</span>
                          <input type="text" className="w-full mt-1 p-2 text-sm rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900"
                            placeholder="e.g. BS Computer Science"
                            value={profileFormData.personalDetails?.degree || ""}
                            onChange={(e) => updateProfileField('personalDetails', 'degree', e.target.value)}
                            disabled={!isEditingProfile}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-bold text-slate-500 uppercase">GPA</span>
                          <input type="text" className="w-full mt-1 p-2 text-sm rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900"
                            placeholder="e.g. 3.8"
                            value={profileFormData.personalDetails?.gpa || ""}
                            onChange={(e) => updateProfileField('personalDetails', 'gpa', e.target.value)}
                            disabled={!isEditingProfile}
                          />
                        </label>
                      </div>
                    </div>

                    {/* Demographics */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-700 dark:text-slate-300">Demographics</h4>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Gender</span>
                        <select
                          className="w-full mt-1 p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50"
                          value={profileFormData.demographics?.gender || "Male"}
                          onChange={(e) => updateProfileField('demographics', 'gender', e.target.value)}
                          disabled={!isEditingProfile}
                        >
                          <option>Male</option><option>Female</option><option>Non-binary</option><option>Decline to Identify</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Race</span>
                        <select
                          className="w-full mt-1 p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50"
                          value={profileFormData.demographics?.race || "Black or African American"}
                          onChange={(e) => updateProfileField('demographics', 'race', e.target.value)}
                          disabled={!isEditingProfile}
                        >
                          <option>Black or African American</option><option>White</option><option>Asian</option><option>Hispanic/Latino</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Veteran Status</span>
                        <select
                          className="w-full mt-1 p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50"
                          value={profileFormData.demographics?.veteran || "I am not a protected veteran"}
                          onChange={(e) => updateProfileField('demographics', 'veteran', e.target.value)}
                          disabled={!isEditingProfile}
                        >
                          <option>I am not a protected veteran</option><option>I am a protected veteran</option><option>Decline to Identify</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Disability</span>
                        <select
                          className="w-full mt-1 p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50"
                          value={profileFormData.demographics?.disability || "No, I do not have a disability"}
                          onChange={(e) => updateProfileField('demographics', 'disability', e.target.value)}
                          disabled={!isEditingProfile}
                        >
                          <option>No, I do not have a disability</option><option>Yes, I have a disability</option><option>Decline to Identify</option>
                        </select>
                      </label>
                    </div>

                    {/* Common Questions */}
                    <div className="space-y-4">
                      <h4 className="font-bold text-slate-700 dark:text-slate-300">Common Questions</h4>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Work Authorization?</span>
                        <select
                          className="w-full mt-1 p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50"
                          value={profileFormData.commonReplies?.workAuth || "Yes"}
                          onChange={(e) => updateProfileField('commonReplies', 'workAuth', e.target.value)}
                          disabled={!isEditingProfile}
                        >
                          <option>Yes</option><option>No</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Require Sponsorship?</span>
                        <select
                          className="w-full mt-1 p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50"
                          value={profileFormData.commonReplies?.sponsorship || "No"}
                          onChange={(e) => updateProfileField('commonReplies', 'sponsorship', e.target.value)}
                          disabled={!isEditingProfile}
                        >
                          <option>No</option><option>Yes</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Open to Relocation?</span>
                        <select
                          className="w-full mt-1 p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50"
                          value={profileFormData.commonReplies?.relocation || "Yes"}
                          onChange={(e) => updateProfileField('commonReplies', 'relocation', e.target.value)}
                          disabled={!isEditingProfile}
                        >
                          <option>Yes</option><option>No</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Former Employee?</span>
                        <select
                          className="w-full mt-1 p-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50"
                          value={profileFormData.commonReplies?.formerEmployee || "No"}
                          onChange={(e) => updateProfileField('commonReplies', 'formerEmployee', e.target.value)}
                          disabled={!isEditingProfile}
                        >
                          <option>No</option><option>Yes</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Detailed Q&A (New) */}
                <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800">
                  <h4 className="font-bold text-slate-700 dark:text-slate-300 border-b pb-2 border-slate-200 dark:border-slate-700 mb-4">📝 Detailed Q&A (Essays & Misc)</h4>
                  <div className="grid grid-cols-1 gap-6">
                    {/* Auto-Generate Toggle */}
                    <label className="flex items-center gap-3 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800 cursor-pointer hover:shadow-md transition-all">
                      <input
                        type="checkbox"
                        checked={!!profileFormData.preferences?.autoGenerateEssays}
                        onChange={(e) => updateProfileField('preferences', 'autoGenerateEssays', e.target.checked)}
                        disabled={!isEditingProfile}
                        className="w-5 h-5 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 disabled:opacity-50"
                      />
                      <div>
                        <span className="font-bold text-indigo-700 dark:text-indigo-300">✨ Auto-Generate "Why Us" for each job</span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">AI will write a tailored essay for every application using your resume and the job description.</p>
                      </div>
                    </label>

                    <label className="block">
                      <span className="text-xs font-bold text-slate-500 uppercase">Why do you want to join? (Fallback / Generic "Why Us")</span>
                      <textarea className="w-full mt-1 p-2 text-sm rounded-lg border dark:bg-slate-800 dark:border-slate-700 h-24 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900"
                        placeholder="I admire the mission..."
                        value={profileFormData.essayAnswers?.whyExcited || ""}
                        onChange={(e) => updateProfileField('essayAnswers', 'whyExcited', e.target.value)}
                        disabled={!isEditingProfile}
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-bold text-slate-500 uppercase">How did you hear about us?</span>
                      <input type="text" className="w-full mt-1 p-2 text-sm rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900"
                        placeholder="e.g. LinkedIn, Glassdoor, Referral"
                        value={profileFormData.essayAnswers?.howDidYouHear || ""}
                        onChange={(e) => updateProfileField('essayAnswers', 'howDidYouHear', e.target.value)}
                        disabled={!isEditingProfile}
                      />
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <label className="block">
                        <span className="text-xs font-bold text-slate-500 uppercase">Preferred Pronouns</span>
                        <input type="text" className="w-full mt-1 p-2 text-sm rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900"
                          placeholder="e.g. He/Him, She/Her, They/Them"
                          value={profileFormData.customAnswers?.pronouns || ""}
                          onChange={(e) => updateProfileField('customAnswers', 'pronouns', e.target.value)}
                          disabled={!isEditingProfile}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold text-slate-500 uppercase">Confidence Scale (1-5)</span>
                        <input type="text" className="w-full mt-1 p-2 text-sm rounded-lg border dark:bg-slate-800 dark:border-slate-700 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900"
                          placeholder="Very Confident"
                          defaultValue={"Very Confident"}
                          disabled
                        />
                      </label>
                    </div>
                  </div>
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
      </main >
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
    </div >
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