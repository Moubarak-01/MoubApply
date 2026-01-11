import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, AlertTriangle, Trophy } from 'lucide-react';
import { type Job } from './JobCard';

interface JobDetailModalProps {
  job: Job | null;
  onClose: () => void;
}

export const JobDetailModal: React.FC<JobDetailModalProps> = ({ job, onClose }) => {
  return (
    <AnimatePresence>
      {job && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-center items-end sm:items-center p-4 sm:p-0"
          >
            {/* Modal */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            >
              <div className="relative h-32 bg-indigo-600 shrink-0">
                  <div className="absolute top-4 right-4">
                      <button onClick={onClose} className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors">
                          <X className="w-5 h-5" />
                      </button>
                  </div>
                  <div className="absolute -bottom-8 left-8 bg-white p-3 rounded-2xl shadow-lg border border-slate-100">
                     <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-bold text-xl">
                        {job.company.charAt(0)}
                     </div>
                  </div>
              </div>

              <div className="pt-10 px-8 pb-8 overflow-y-auto">
                  <h2 className="text-2xl font-bold text-slate-900">{job.title}</h2>
                  <p className="text-slate-500 font-medium mb-6">{job.company}</p>

                  <div className="space-y-6">
                      {/* AI Summary Section */}
                      <div className="bg-indigo-50/50 rounded-xl p-5 border border-indigo-100">
                          <div className="flex items-center gap-2 mb-3 text-indigo-700 font-bold text-sm uppercase tracking-wide">
                              <Sparkles className="w-4 h-4" />
                              AI Summary
                          </div>
                          
                          <div className="space-y-4">
                              <div>
                                  <h4 className="font-semibold text-slate-800 flex items-center gap-2 text-sm mb-1">
                                      <Trophy className="w-4 h-4 text-amber-500" />
                                      Why you'll love it
                                  </h4>
                                  <p className="text-sm text-slate-600 pl-6 leading-relaxed">
                                      {/* Mock AI content */}
                                      High impact role with modern tech stack. Strong mentorship program for interns.
                                  </p>
                              </div>
                               <div>
                                  <h4 className="font-semibold text-slate-800 flex items-center gap-2 text-sm mb-1">
                                      <AlertTriangle className="w-4 h-4 text-rose-500" />
                                      The catch
                                  </h4>
                                  <p className="text-sm text-slate-600 pl-6 leading-relaxed">
                                      Strict return-to-office policy (3 days/week). Legacy codebase in some modules.
                                  </p>
                              </div>
                          </div>
                      </div>

                      <div>
                          <h3 className="font-bold text-slate-800 mb-3">Requirements</h3>
                           <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">
                               {job.description}
                           </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                          {job.tags.map(tag => (
                              <span key={tag} className="px-3 py-1 bg-slate-100 text-slate-700 text-sm rounded-full">
                                  {tag}
                              </span>
                          ))}
                      </div>
                  </div>
              </div>
              
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                  <button onClick={onClose} className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-700 hover:bg-slate-200 transition-colors">
                      Pass
                  </button>
                  <button onClick={() => { console.log('Apply from modal'); onClose(); }} className="flex-1 py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200">
                      Add to Queue
                  </button>
              </div>

            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
