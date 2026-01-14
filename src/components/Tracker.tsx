import React, { useState, useEffect } from 'react';
import { Clock, Loader2, CheckCircle2, AlertCircle, Zap, Wand2, Eye, ExternalLink, X } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../services/api';

interface Application {
  _id: string;
  company: string;
  role: string;
  status: 'Queued' | 'Processing' | 'Applied' | 'Action Needed';
  date: string;
  tailoredPdfUrl?: string;
  coverLetter?: string;
  applyLink?: string;
  updatedAt?: string;
}

const statusConfig = {
  'Queued': { icon: Clock, color: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-900', border: 'border-slate-200 dark:border-slate-800' },
  'Processing': { icon: Loader2, color: 'text-indigo-500 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/10', border: 'border-indigo-200 dark:border-indigo-900/30' },
  'Applied': { icon: CheckCircle2, color: 'text-emerald-500 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/10', border: 'border-emerald-200 dark:border-emerald-900/30' },
  'Action Needed': { icon: AlertCircle, color: 'text-rose-500 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/10', border: 'border-rose-200 dark:border-rose-900/30' },
};

interface TrackerProps {
  userId: string;
  onReview: (app: Application) => void;
  onApplicationsChange?: (apps: Application[]) => void;
}

export const Tracker: React.FC<TrackerProps> = ({ userId, onReview, onApplicationsChange }) => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const columns: (keyof typeof statusConfig)[] = ['Queued', 'Processing', 'Applied', 'Action Needed'];

  const fetchApplications = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/applications?userId=${userId}`);
      const data = await response.json();
      const formattedApps = data
        .filter((app: any) => app.jobId) // Filter out apps where job was deleted
        .map((app: any) => ({
          _id: app._id,
          company: app.jobId.company || 'Unknown Company',
          role: app.jobId.title || 'Unknown Role',
          status: app.status,
          date: new Date(app.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          tailoredPdfUrl: app.tailoredPdfUrl,
          coverLetter: app.coverLetter,
          applyLink: app.jobId.applyLink,
          updatedAt: app.updatedAt ? new Date(app.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
        }));
      setApplications(formattedApps);
      if (onApplicationsChange) onApplicationsChange(formattedApps);
    } catch (error) {
      console.error('Error fetching applications:', error);
    }
  };

  useEffect(() => {
    if (userId) fetchApplications();
  }, [userId]);

  const handleTailor = async (appId: string) => {
    setLoadingId(appId);
    try {
      await api.tailorResume(appId);
      await fetchApplications();
    } catch (err) {
      alert("Tailoring failed. Check terminal.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleAutoApply = async (appId: string) => {
    setLoadingId(appId);
    try {
      await fetch(`http://localhost:5000/api/applications/${appId}/apply`, { method: 'POST' });
      await fetchApplications();
    } catch (error) {
      alert("Auto apply failed");
    } finally {
      setLoadingId(null);
    }
  };

  const handleCancel = async (appId: string, company: string, role: string) => {
    if (!confirm(`🗑️ Cancel application to ${role} at ${company}?\n\nThis will permanently delete this application.`)) return;

    try {
      const response = await fetch(`http://localhost:5000/api/applications/${appId}`, { method: 'DELETE' });
      if (response.ok) {
        await fetchApplications();
        console.log(`🗑️ [TRACKER] Application ${appId} cancelled successfully`);
      } else {
        alert('Failed to cancel application');
      }
    } catch (error) {
      console.error('Error cancelling application:', error);
      alert('Failed to cancel application');
    }
  };

  return (
    <div className="flex h-full gap-4 overflow-x-auto p-4 bg-slate-50/50 dark:bg-slate-950/50 transition-colors">
      {columns.map((status) => {
        const apps = applications.filter((app) => app.status === status);
        const { icon: Icon, color, bg, border } = statusConfig[status];

        return (
          <div key={status} className="flex-shrink-0 w-80 flex flex-col">
            <div className={clsx("flex items-center gap-2 mb-4 p-3 rounded-lg border transition-colors", bg, border)}>
              <Icon className={clsx("w-5 h-5", color, status === 'Processing' && "animate-spin")} />
              <h3 className={clsx("font-bold text-sm", color)}>{status}</h3>
              <span className="ml-auto bg-white/50 dark:bg-slate-800/50 px-2 py-0.5 rounded text-xs font-bold text-slate-600 dark:text-slate-300">
                {apps.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-3">
              {apps.map((app) => (
                <div key={app._id} className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md transition-all">
                  <h4 className="font-bold text-slate-800 dark:text-white">{app.company}</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{app.role}</p>

                  {/* Processing State Hint */}
                  {status === 'Processing' && (
                    <div className="mb-3 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/40 rounded-lg flex items-start gap-2">
                      <div className="mt-0.5 relative">
                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300">Browser is Open!</p>
                        <p className="text-[10px] text-indigo-600 dark:text-indigo-400 leading-tight mt-0.5">
                          Please check the popup window, review the form, and click "Submit".
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Applied Date Badge */}
                  {status === 'Applied' && (
                    <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-md border border-emerald-100 dark:border-emerald-900/40">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Applied on {app.updatedAt}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mt-3">

                    {/* Always visible: View Job Link */}
                    {app.applyLink && (
                      <a
                        href={app.applyLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        title="Open Job in New Tab"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Job
                      </a>
                    )
                    }

                    {status === 'Queued' && (
                      <button
                        onClick={() => handleTailor(app._id)}
                        disabled={!!loadingId}
                        className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                      >
                        {loadingId === app._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                        Tailor & Prep
                      </button>
                    )}

                    {status === 'Action Needed' && (
                      <>
                        <button
                          onClick={() => onReview(app)}
                          className="flex items-center gap-1 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-slate-200 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          Review
                        </button>
                        <button
                          onClick={() => handleAutoApply(app._id)}
                          disabled={!!loadingId}
                          className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          {loadingId === app._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 fill-current" />}
                          Auto-Apply
                        </button>
                        <button
                          onClick={() => handleCancel(app._id, app.company, app.role)}
                          className="flex items-center gap-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                          title="Cancel Application"
                        >
                          <X className="w-3 h-3" />
                          Cancel
                        </button>
                      </>
                    )}

                    <span className="ml-auto text-[10px] text-slate-400">{app.date}</span>
                  </div>
                </div>
              ))}
              {apps.length === 0 && (
                <div className="text-center py-10 text-slate-400 text-sm border-2 border-dashed border-slate-100 rounded-xl">
                  No items
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
