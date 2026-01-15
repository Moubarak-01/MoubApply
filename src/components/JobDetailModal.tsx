
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, AlertTriangle, Trophy, Zap, Loader2, BrainCircuit } from 'lucide-react';
import { ReviewModal } from './ReviewModal';
import { type Job } from './JobCard';
import { useAuth } from '../context/AuthContext';

interface JobDetailModalProps {
    job: Job | null;
    onClose: () => void;
}

// Helper to unescape HTML entities if backend sends them encoded
const unescapeHtml = (html: string) => {
    const txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
};

export const JobDetailModal: React.FC<JobDetailModalProps> = ({ job, onClose }) => {
    const { user } = useAuth();
    const [analyzing, setAnalyzing] = useState(false);
    const [applying, setApplying] = useState(false);
    const [localJob, setLocalJob] = useState<Job | null>(job);
    const [reviewApp, setReviewApp] = useState<any | null>(null);

    // Sync prop changes
    React.useEffect(() => {
        setLocalJob(job);
    }, [job]);

    const handleAnalyze = async () => {
        if (!localJob || !user) return;
        setAnalyzing(true);
        try {
            const res = await fetch(`http://localhost:5001/api/jobs/${localJob._id}/match`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user._id })
            });
            const updatedJob = await res.json();
            setLocalJob(updatedJob);
        } catch (err) {
            alert("Analysis failed.");
        } finally {
            setAnalyzing(false);
        }
    };

    const handleAutoApply = async () => {
        if (!localJob || !user) return;

        setApplying(true);
        try {
            // 1. Create Application (Queue)
            const appRes = await fetch('http://localhost:5001/api/applications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user._id, jobId: localJob._id })
            });
            const appData = await appRes.json();
            const appId = appData._id;

            // 2. Tailor Resume (Generates PDF + CL) - Wait for review!
            const tailorRes = await fetch(`http://localhost:5001/api/applications/${appId}/tailor`, { method: 'POST' });
            if (!tailorRes.ok) throw new Error("Tailoring failed");

            // Fetch updated application to show in review
            const updatedAppRes = await fetch(`http://localhost:5001/api/applications/${appId}`);
            const updatedApp = await updatedAppRes.json();

            // Open Review Modal
            setReviewApp(updatedApp);

        } catch (err) {
            console.error(err);
            alert("Auto-Apply preparation failed.");
        } finally {
            setApplying(false);
        }
    };

    const handleApproveApplication = async (appId: string) => {
        try {
            console.log("Approving application:", appId);
            // 3. Trigger Auto-Apply (Background/Playwright)
            await fetch(`http://localhost:5001/api/applications/${appId}/apply`, { method: 'POST' });
            alert("Application started in background browser! Please watch the browser window to confirm submission.");
            onClose();
            setReviewApp(null);
        } catch (e) {
            alert("Failed to start application automation.");
        }
    };

    const handleCancelReview = async () => {
        if (reviewApp?._id) {
            try {
                // Clean up generated files on backend
                await fetch(`http://localhost:5001/api/applications/${reviewApp._id}/cancel`, { method: 'DELETE' });
                console.log("Application canceled and files cleaned up.");
            } catch (e) {
                console.error("Cancel cleanup failed:", e);
            }
        }
        setReviewApp(null);
    };

    return (
        <AnimatePresence>
            {localJob && (
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
                            className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col transition-colors"
                        >
                            <div className="relative h-32 bg-indigo-600 shrink-0">
                                <div className="absolute top-4 right-4">
                                    <button onClick={onClose} className="p-2 bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="absolute -bottom-8 left-8 bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700">
                                    <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-300 font-bold text-xl">
                                        {localJob.company?.charAt(0) || '?'}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-10 px-8 pb-8 overflow-y-auto">
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{localJob.title}</h2>
                                <p className="text-slate-500 dark:text-slate-400 font-medium mb-6">{localJob.company}</p>

                                <div className="space-y-6">
                                    {/* AI Summary Section */}
                                    {localJob.matchScore === 0 ? (
                                        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-6 border border-slate-100 dark:border-slate-700 text-center">
                                            <BrainCircuit className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                                            <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">Match Analysis Not Run</h4>
                                            <p className="text-sm text-slate-500 mb-4">Save API costs by only analyzing jobs you're interested in.</p>
                                            <button
                                                onClick={handleAnalyze}
                                                disabled={analyzing}
                                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 mx-auto disabled:opacity-50"
                                            >
                                                {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                                Analyze Match
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl p-5 border border-indigo-100 dark:border-indigo-900/20 transition-colors">
                                            <div className="flex items-center gap-2 mb-3 text-indigo-700 dark:text-indigo-300 font-bold text-sm uppercase tracking-wide">
                                                <Sparkles className="w-4 h-4" />
                                                AI Summary ({localJob.matchScore}% Match)
                                            </div>

                                            <div className="space-y-4">
                                                <div>
                                                    <h4 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm mb-1">
                                                        <Trophy className="w-4 h-4 text-amber-500" />
                                                        Why you'll love it
                                                    </h4>
                                                    <ul className="list-disc pl-5 mt-2 space-y-2">
                                                        {localJob.aiSummary?.whyYouWillLoveIt?.map((point, i) => (
                                                            <li key={i} className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                                                {point}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                                <div>
                                                    <h4 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm mb-1">
                                                        <AlertTriangle className="w-4 h-4 text-rose-500" />
                                                        The catch
                                                    </h4>
                                                    <ul className="list-disc pl-5 mt-2 space-y-2">
                                                        {localJob.aiSummary?.theCatch?.map((point, i) => (
                                                            <li key={i} className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                                                {point}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-6">
                                    <h3 className="font-bold text-slate-800 dark:text-white mb-3">Requirements</h3>
                                    <div
                                        className="prose dark:prose-invert text-slate-600 dark:text-slate-400 text-sm leading-relaxed max-w-none [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5"
                                        dangerouslySetInnerHTML={{ __html: unescapeHtml(localJob.rawDescription || localJob.description) }}
                                    />
                                </div>

                                <div className="flex flex-wrap gap-2 mt-4">
                                    {localJob.tags?.map(tag => (
                                        <span key={tag} className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm rounded-full border border-slate-200 dark:border-slate-700">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex gap-3">
                                <button onClick={onClose} className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                                    Pass
                                </button>
                                <button
                                    onClick={handleAutoApply}
                                    disabled={applying}
                                    className="flex-[2] py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {applying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                                    {applying ? 'Tailoring & Applying...' : 'Auto-Apply'}
                                </button>
                            </div>

                        </motion.div>
                    </motion.div>

                    {/* Review Modal Layer */}
                    <ReviewModal
                        application={reviewApp}
                        onClose={handleCancelReview}
                        onApprove={handleApproveApplication}
                    />
                </>
            )}
        </AnimatePresence>
    );
};

