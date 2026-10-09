import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Briefcase,
  CloudOff,
  CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';

export const Login: React.FC = () => {
  const { signIn } = useAuth();
  const { pendingCount } = useData();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMsg('Please enter both your registered email address and password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await signIn(email.trim(), password);
      if (error) {
        // Human-friendly error translation
        const msg = error.message || '';
        if (msg.toLowerCase().includes('invalid login credentials') || error.status === 400) {
          setErrorMsg('Invalid email or password. Please verify your credentials and try again.');
        } else if (msg.toLowerCase().includes('email not confirmed')) {
          setErrorMsg('Your email has not been verified yet. Please check your inbox.');
        } else {
          setErrorMsg(error.message || 'Authentication failed. Please check your connection and credentials.');
        }
      } else {
        toast.success('Welcome back! Signed in to SCC CRM.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'An unexpected error occurred during sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-blue-600 selection:text-white relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Branding header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-500/20 mb-3 border border-white/20">
            <Briefcase size={28} />
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <h1 className="text-2xl font-black text-white tracking-tight">SCC CRM</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
              v3.6
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-300">Shree Career Consultancy</p>
          <p className="text-xs text-slate-400 mt-0.5">Central India Recruitment & Placement Engine</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl shadow-black/40 border border-white/40 p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-900">Sign in to your account</h2>
            <p className="text-xs text-slate-500 mt-0.5">Enter your verified CRM credentials to access your workspace</p>
          </div>

          {/* Offline Changes Notice if pending queue exists */}
          {pendingCount > 0 && (
            <div className="p-3.5 bg-amber-50/90 border border-amber-200/90 rounded-xl flex items-start gap-2.5 text-xs text-amber-800 animate-in fade-in duration-150">
              <CloudOff size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900">
                  {pendingCount} offline change{pendingCount > 1 ? 's' : ''} saved locally
                </p>
                <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                  Sign in to your authorized account to automatically synchronize these pending updates with Supabase cloud.
                </p>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700 animate-in fade-in duration-150">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
              <div className="leading-relaxed">
                <p className="font-bold text-red-900">Sign in failed</p>
                <p className="text-red-700 mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="login-email">
                Email Address
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@sccjobs.in or telecaller@sccjobs.in"
                  required
                  autoComplete="email"
                  autoFocus
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5" htmlFor="login-password">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  disabled={loading}
                  className="w-full pl-10 pr-11 py-2.5 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.99] text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Verifying credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Workspace</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Security & System Info */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5 text-slate-600 font-medium">
              <ShieldCheck size={14} className="text-emerald-600" />
              <span>Row Level Security (RLS)</span>
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <CheckCircle2 size={12} className="text-blue-500" />
              <span>Supabase Cloud Auth</span>
            </span>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-400 mt-6 leading-relaxed">
          Authorized Shree Career Consultancy personnel only.
          <br />
          Contact system administration for account access or password recovery.
        </p>
      </div>
    </div>
  );
};

export default Login;
