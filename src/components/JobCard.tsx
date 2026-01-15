import React from 'react';
import { motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { Check, X, Briefcase, GraduationCap } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { useTheme } from '../context/ThemeContext';

export interface Job {
  _id: string;
  title: string;
  company: string;
  matchScore: number;
  tags: string[];
  gradYearReq: number;
  description: string; // for the modal
  rawDescription?: string; // from backend for tailoring
  aiSummary: {
    whyYouWillLoveIt: string[];
    theCatch: string[];
    topSkills: string[];
  };
}

interface JobCardProps {
  job: Job;
  userGradYear: number;
  onSwipe: (direction: 'right' | 'left', job: Job) => void;
  onClick: (job: Job) => void;
  className?: string;
}

export const JobCard: React.FC<JobCardProps> = ({ job, userGradYear, onSwipe, onClick, className }) => {
  const { theme } = useTheme();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);

  // Color feedback based on swipe position
  const bgColors = theme === 'dark'
    ? ['rgb(67, 20, 20)', 'rgb(15, 23, 42)', 'rgb(6, 78, 59)'] // Dark: Rose-950/Redish, Slate-900, Emerald-950
    : ['rgb(255, 228, 230)', 'rgb(255, 255, 255)', 'rgb(209, 250, 229)']; // Light

  const background = useTransform(
    x,
    [-150, 0, 150],
    bgColors
  );

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x > 100) {
      onSwipe('right', job);
    } else if (info.offset.x < -100) {
      onSwipe('left', job);
    }
  };

  const isGradMatch = job.gradYearReq === userGradYear;

  return (
    <motion.div
      style={{ x, rotate, opacity, background }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      className={twMerge(
        'absolute w-full max-w-sm h-[500px] rounded-2xl shadow-xl cursor-grab active:cursor-grabbing flex flex-col justify-between p-6 border border-slate-200 dark:border-slate-800 transition-colors',
        className
      )}
      onClick={() => onClick(job)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div>
        <div className="flex justify-between items-start mb-4">
          <div className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full font-bold text-sm border border-indigo-200 dark:border-indigo-800">
            {job.matchScore > 0 ? `${job.matchScore}% Match` : 'New'}
          </div>
          <div className="bg-white dark:bg-slate-800 p-2 rounded-full shadow-sm border border-slate-100 dark:border-slate-700">
            {/* Logo placeholder */}
            <Briefcase className="w-6 h-6 text-slate-400" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-1">{job.title}</h2>
        <p className="text-lg text-slate-500 dark:text-slate-400 font-medium mb-4">{job.company}</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {job.tags.map((tag) => (
            <span key={tag} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs rounded-md font-medium border border-slate-200 dark:border-slate-700">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center px-4 mt-auto">
        <div className="flex flex-col items-center gap-1 text-rose-500 opacity-50">
          <div className="p-3 rounded-full border-2 border-rose-500">
            <X className="w-6 h-6" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider">Reject</span>
        </div>

        <div className="text-xs text-slate-400 font-medium">Swipe to decide</div>

        <div className="flex flex-col items-center gap-1 text-emerald-500 opacity-50">
          <div className="p-3 rounded-full border-2 border-emerald-500">
            <Check className="w-6 h-6" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider">Apply</span>
        </div>
      </div>
    </motion.div>
  );
};
