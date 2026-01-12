import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { JobCard, type Job } from './JobCard';
import { Loader2, RefreshCw, Search } from 'lucide-react';

interface JobDeckProps {
  initialJobs: Job[];
  userGradYear: number;
  onJobSelect: (job: Job) => void;
  onDeckEmpty: () => void;
  onSwipeAction?: (direction: 'right' | 'left', job: Job) => void;
}

export const JobDeck: React.FC<JobDeckProps> = ({ initialJobs, userGradYear, onJobSelect, onDeckEmpty, onSwipeAction }) => {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [isIngesting, setIsIngesting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('Software Engineer Intern');

  // Update internal state when initialJobs changes (e.g. after API load)
  React.useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  const handleFetchRealJobs = async () => {
      setIsIngesting(true);
      try {
          const res = await fetch('http://localhost:5000/api/jobs/ingest', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: searchQuery, range: 'week' })
          });
          if (res.ok) {
              const data = await res.json();
              alert(`Fetched ${data.newJobs} real jobs!`);
              // Reload page or trigger a parent refresh
              window.location.reload(); 
          }
      } catch (err) {
          alert("Failed to fetch real jobs. Check RAPIDAPI_KEY.");
      } finally {
          setIsIngesting(false);
      }
  };

  const handleSwipe = async (direction: 'right' | 'left', job: Job) => {
    if (onSwipeAction) {
      onSwipeAction(direction, job);
    }

    setJobs((prev) => {
      const newJobs = prev.filter((j) => j._id !== job._id);
      if (newJobs.length === 0) {
        onDeckEmpty();
      }
      return newJobs;
    });
  };

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-6 p-10 bg-white rounded-3xl border border-dashed border-slate-200 shadow-inner">
        <div className="text-center">
            <p className="text-xl font-bold text-slate-800">No more jobs to swipe!</p>
            <p className="text-sm">Swipe more real jobs from the API below.</p>
        </div>
        
        <div className="w-full max-w-sm space-y-4">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="Search query (e.g. React Developer)"
                />
            </div>
            <button 
                onClick={handleFetchRealJobs}
                disabled={isIngesting}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-50"
            >
                {isIngesting ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                {isIngesting ? 'Fetching Real Jobs...' : 'Fetch Real Jobs (RapidAPI)'}
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[600px] flex justify-center items-center overflow-hidden">
      <AnimatePresence>
        {jobs.map((job, index) => {
             // Only render the top card and the one below it
             if (index > 1) return null;
             
             return (
              <JobCard
                key={job._id}
                job={job}
                userGradYear={userGradYear}
                onSwipe={handleSwipe}
                onClick={onJobSelect}
                className={index === 0 ? "z-10" : "z-0 scale-95 translate-y-4 opacity-50"}
              />
            );
        }).reverse()} 
      </AnimatePresence>
    </div>
  );
};

// Note: The .reverse() logic in mapping is tricky with stacking contexts.
// A simpler way for a stack: The last element in the array is rendered last (on top).
// So if jobs[0] is the "current" job, we want it rendered last.
// My previous logic: `jobs.slice(0, 2)` takes the first two.
// If I reverse them, `jobs[1]` is rendered first (bottom), `jobs[0]` is rendered second (top).
// That works.
