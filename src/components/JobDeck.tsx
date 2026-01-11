import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { JobCard, type Job } from './JobCard';

interface JobDeckProps {
  initialJobs: Job[];
  userGradYear: number;
  userId: string;
  onJobSelect: (job: Job) => void;
  onDeckEmpty: () => void;
  onSwipeAction?: (direction: 'right' | 'left', job: Job) => void;
}

export const JobDeck: React.FC<JobDeckProps> = ({ initialJobs, userGradYear, userId, onJobSelect, onDeckEmpty, onSwipeAction }) => {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);

  // Update internal state when initialJobs changes (e.g. after API load)
  React.useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  const handleSwipe = async (direction: 'right' | 'left', job: Job) => {
    if (onSwipeAction) {
      onSwipeAction(direction, job);
    }

    if (direction === 'right') {
      console.log(`Apply to ${job.company}`);
      try {
        await fetch('http://localhost:5000/api/applications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: userId,
            jobId: job._id,
          }),
        });
      } catch (error) {
        console.error('Error applying to job:', error);
      }
    } else {
      console.log(`Reject ${job.company}`);
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
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <p className="text-xl">No more jobs to swipe!</p>
        <p className="text-sm">Check back later.</p>
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
