import React, { useState, useEffect } from 'react';
import { Clock, Loader2, CheckCircle2, AlertCircle, Zap, Wand2, Eye } from 'lucide-react';
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
}

const statusConfig = {
  'Queued': { icon: Clock, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
  'Processing': { icon: Loader2, color: 'text-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  'Applied': { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  'Action Needed': { icon: AlertCircle, color: 'text-rose-500', bg: 'bg-rose-50', border: 'border-rose-200' },
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
      const formattedApps = data.map((app: any) => ({
        _id: app._id,
        company: app.jobId.company,
        role: app.jobId.title,
        status: app.status,
        date: new Date(app.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        tailoredPdfUrl: app.tailoredPdfUrl,
        coverLetter: app.coverLetter
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

  return (
    <div className="flex h-full gap-4 overflow-x-auto p-4 bg-slate-50/50">
      {columns.map((status) => {
        const apps = applications.filter((app) => app.status === status);
        const { icon: Icon, color, bg, border } = statusConfig[status];

        return (
          <div key={status} className="flex-shrink-0 w-80 flex flex-col">
            <div className={clsx("flex items-center gap-2 mb-4 p-3 rounded-lg border", bg, border)}>
              <Icon className={clsx("w-5 h-5", color, status === 'Processing' && "animate-spin")} />
              <h3 className={clsx("font-bold text-sm", color)}>{status}</h3>
              <span className="ml-auto bg-white/50 px-2 py-0.5 rounded text-xs font-bold text-slate-600">
                {apps.length}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col gap-3">
              {apps.map((app) => (
                <div key={app._id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                  <h4 className="font-bold text-slate-800">{app.company}</h4>
                  <p className="text-sm text-slate-500 mb-2">{app.role}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    
                    {status === 'Queued' && (
                        <button 
                            onClick={() => handleTailor(app._id)}
                            disabled={!!loadingId}
                            className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                        >
                            {loadingId === app._id ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wand2 className="w-3 h-3" />}
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
                                {loadingId === app._id ? <Loader2 className="w-3 h-3 animate-spin"/> : <Zap className="w-3 h-3 fill-current" />}
                                Auto-Apply
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
