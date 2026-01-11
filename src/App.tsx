import React, { useState, useEffect } from 'react';
import { JobDeck } from './components/JobDeck';
import { Tracker } from './components/Tracker';
import { JobDetailModal } from './components/JobDetailModal';
import { type Job } from './components/JobCard';
import { LayoutGrid, Layers, User, Settings, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from './services/api';

// Mock Applications (Removed)

type View = 'discovery' | 'tracker' | 'profile';

function App() {
  const [currentView, setCurrentView] = useState<View>('discovery');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<any[]>([]); // New state for apps
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  
  // User Profile Data
  const userGradYear = 2026;

  // Fetch Data Function
  const loadData = async () => {
      try {
        const [jobsData, userData] = await Promise.all([
            api.getJobs(),
            api.getUser()
        ]);
        
        const formattedJobs = jobsData.map((j: any) => ({ ...j, id: j._id }));
        setJobs(formattedJobs);
        setUserId(userData._id);

        // Fetch applications if user exists
        if (userData._id) {
            const appsData = await api.getApplications(userData._id);
            // Format for Tracker: extracting company/role from the populated jobId
            const formattedApps = appsData.map((app: any) => ({
                id: app._id,
                company: app.jobId.company,
                role: app.jobId.title,
                status: app.status,
                date: new Date(app.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }));
            setApplications(formattedApps);
        }

      } catch (err) {
        console.error("Failed to load data", err);
      } finally {
        setLoading(false);
      }
  };

  // Initial Load
  useEffect(() => {
    loadData();
  }, []);

  const handleSwipe = async (direction: 'right' | 'left', job: Job) => {
    if (direction === 'right' && userId) {
       try {
         await api.apply(userId, job.id);
         console.log(`Applied to ${job.company}`);
         // Refresh applications list quietly
         const appsData = await api.getApplications(userId);
         const formattedApps = appsData.map((app: any) => ({
            id: app._id,
            company: app.jobId.company,
            role: app.jobId.title,
            status: app.status,
            date: new Date(app.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }));
        setApplications(formattedApps);
       } catch (err) {
         console.error("Failed to apply", err);
       }
    } else if (!userId) {
        console.error("User ID not found, cannot apply");
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <nav className="w-20 lg:w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 transition-all duration-300">
        <div className="h-20 flex items-center justify-center lg:justify-start lg:px-6 border-b border-slate-100">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
             <Layers className="text-white w-6 h-6" />
          </div>
          <span className="ml-3 font-bold text-xl hidden lg:block tracking-tight text-slate-800">JobSwipe</span>
        </div>

        <div className="flex-1 py-6 flex flex-col gap-2 px-2 lg:px-4">
          <NavButton 
            active={currentView === 'discovery'} 
            onClick={() => setCurrentView('discovery')}
            icon={LayoutGrid} 
            label="Discovery" 
          />
          <NavButton 
            active={currentView === 'tracker'} 
            onClick={() => setCurrentView('tracker')}
            icon={Layers} 
            label="Tracker" 
            badge={applications.length}
          />
          <NavButton 
            active={currentView === 'profile'} 
            onClick={() => setCurrentView('profile')}
            icon={User} 
            label="Profile" 
          />
        </div>

        <div className="p-4 border-t border-slate-100">
           <button className="flex items-center justify-center lg:justify-start w-full p-3 rounded-xl hover:bg-slate-50 text-slate-500 transition-colors">
              <Settings className="w-5 h-5" />
              <span className="ml-3 hidden lg:block font-medium">Settings</span>
           </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {/* Header */}
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-30">
           <div>
             <h1 className="text-xl font-bold text-slate-800">
               {currentView === 'discovery' && 'Discover Jobs'}
               {currentView === 'tracker' && 'Application Tracker'}
               {currentView === 'profile' && 'Your Profile'}
             </h1>
             <p className="text-xs text-slate-500 font-medium">
               {currentView === 'discovery' && 'Swipe right to apply'}
               {currentView === 'tracker' && 'Track your progress'}
             </p>
           </div>
           
           <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span className="text-xs font-bold text-indigo-700">{applications.filter(a => a.date === new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).length}/30 Applications Today</span>
              </div>
              <div className="w-10 h-10 bg-slate-200 rounded-full overflow-hidden border-2 border-white shadow-sm">
                 <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" />
              </div>
           </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto relative p-6">
           {currentView === 'discovery' && (
             <div className="h-full flex flex-col items-center justify-center">
                {loading ? (
                  <div className="flex flex-col items-center gap-2 text-indigo-600">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="font-medium">Finding best matches...</span>
                  </div>
                ) : (
                  <JobDeck 
                    initialJobs={jobs} 
                    userGradYear={userGradYear}
                    onJobSelect={setSelectedJob}
                    onDeckEmpty={() => console.log("Deck empty!")}
                    onSwipeAction={handleSwipe}
                  />
                )}
             </div>
           )}

           {currentView === 'tracker' && (
              // @ts-ignore
             <Tracker applications={applications} />
           )}

           {currentView === 'profile' && (
             <div className="max-w-2xl mx-auto py-10">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 text-center">
                   <h2 className="text-2xl font-bold text-slate-800 mb-2">My Profile</h2>
                   <p className="text-slate-500 mb-6">Manage your resume and preferences</p>
                   <div className="p-10 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                      <p className="text-slate-400 font-medium">Resume Upload Placeholder</p>
                   </div>
                </div>
             </div>
           )}
        </div>
      </main>

      {/* Modals */}
      <JobDetailModal 
        job={selectedJob} 
        onClose={() => setSelectedJob(null)} 
      />
    </div>
  );
}

interface NavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  badge?: number;
}

const NavButton: React.FC<NavButtonProps> = ({ active, onClick, icon: Icon, label, badge }) => (
  <button 
    onClick={onClick}
    className={clsx(
      "flex items-center justify-center lg:justify-start w-full p-3 lg:px-4 rounded-xl transition-all duration-200 group relative",
      active 
        ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" 
        : "hover:bg-indigo-50 text-slate-500 hover:text-indigo-600"
    )}
  >
    <Icon className={clsx("w-6 h-6", active ? "text-white" : "text-slate-400 group-hover:text-indigo-600")} />
    <span className={clsx("ml-3 font-medium hidden lg:block", active ? "text-white" : "text-slate-600 group-hover:text-indigo-700")}>{label}</span>
    {badge && (
      <span className={clsx(
        "absolute top-2 right-2 lg:top-auto lg:right-4 w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full",
        active ? "bg-white text-indigo-600" : "bg-indigo-100 text-indigo-600"
      )}>
        {badge}
      </span>
    )}
  </button>
);

export default App;