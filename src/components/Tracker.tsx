import React, { useState, useEffect } from 'react';
import { Clock, Loader2, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import { clsx } from 'clsx';

interface Application {
  _id: string;
  company: string;
  role: string;
  status: 'Queued' | 'Processing' | 'Applied' | 'Action Needed';
  date: string;
}

const statusConfig = {
  'Queued': { icon: Clock, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
  'Processing': { icon: Loader2, color: 'text-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  'Applied': { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  'Action Needed': { icon: AlertCircle, color: 'text-rose-500', bg: 'bg-rose-50', border: 'border-rose-200' },
};

interface TrackerProps {
  userId: string;
}

export const Tracker: React.FC<TrackerProps> = ({ userId }) => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [applyingId, setApplyingId] = useState<string | null>(null);
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
        date: new Date(app.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }));
      setApplications(formattedApps);
    } catch (error) {
      console.error('Error fetching applications:', error);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchApplications();
    }
  }, [userId]);

  const handleAutoApply = async (appId: string) => {
      setApplyingId(appId);
      try {
          await fetch(`http://localhost:5000/api/applications/${appId}/apply`, {
              method: 'POST'
          });
          // Optimistic update or refresh
          await fetchApplications();
      } catch (error) {
          console.error("Auto apply failed", error);
          alert("Failed to start auto-apply");
      } finally {
          setApplyingId(null);
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
                  <div className="flex items-center justify-between text-xs text-slate-400 mt-3">
                    <span>{app.date}</span>
                    
                    {status === 'Queued' && (
                        <button 
                            onClick={() => handleAutoApply(app._id)}
                            disabled={applyingId === app._id}
                            className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm shadow-indigo-200"
                        >
                            {applyingId === app._id ? <Loader2 className="w-3 h-3 animate-spin"/> : <Zap className="w-3 h-3 fill-current" />}
                            Auto-Apply
                        </button>
                    )}

                    {status === 'Applied' && (
                        <span className="text-emerald-600 font-medium">View Confirmation</span>
                    )}
                     {status === 'Action Needed' && (
                        <button className="bg-rose-100 text-rose-600 px-2 py-1 rounded font-medium hover:bg-rose-200">
                            Resolve
                        </button>
                    )}
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
