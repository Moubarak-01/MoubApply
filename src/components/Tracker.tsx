import React from 'react';
import { Clock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface Application {
  id: string;
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
  applications: Application[];
}

export const Tracker: React.FC<TrackerProps> = ({ applications }) => {
  const columns: (keyof typeof statusConfig)[] = ['Queued', 'Processing', 'Applied', 'Action Needed'];

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
                <div key={app.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                  <h4 className="font-bold text-slate-800">{app.company}</h4>
                  <p className="text-sm text-slate-500 mb-2">{app.role}</p>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>{app.date}</span>
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
