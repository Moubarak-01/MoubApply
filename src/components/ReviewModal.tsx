import React from 'react';
import { X, FileText, Send, CheckCircle } from 'lucide-react';

interface ReviewModalProps {
  application: any | null;
  onClose: () => void;
  onApprove: (appId: string) => void;
}

export const ReviewModal: React.FC<ReviewModalProps> = ({ application, onClose, onApprove }) => {
  if (!application) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300 border border-slate-200 dark:border-slate-800 transition-colors">

        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 sticky top-0 z-10">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Review Application Bundle</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{application.role} at {application.company}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">

          {/* Left: Tailored Resume PDF */}
          <div className="flex-1 border-r border-slate-100 dark:border-slate-800 flex flex-col bg-slate-50 dark:bg-slate-950">
            <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">Tailored Resume (AI Optimized)</span>
            </div>
            <iframe
              src={`http://localhost:5001${application.tailoredPdfUrl}`}
              className="w-full h-full border-none"
              title="Tailored Resume"
            />
          </div>

          {/* Right: Cover Letter Text */}
          <div className="w-1/3 flex flex-col bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800">
            <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-600 dark:text-emerald-500" />
              <span className="font-bold text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300">AI Generated Cover Letter</span>
            </div>
            <div className="flex-1 p-6 overflow-y-auto whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-serif bg-white dark:bg-slate-900">
              {application.coverLetter || "Generating cover letter..."}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-4 bg-white dark:bg-slate-900 sticky bottom-0 z-10 transition-colors">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onApprove(application._id);
              onClose();
            }}
            className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
          >
            <CheckCircle className="w-5 h-5" />
            Approve & Apply Now
          </button>
        </div>

      </div>
    </div>
  );
};
