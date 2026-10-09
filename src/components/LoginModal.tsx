import React, { useState } from 'react';
import { Modal, Button, Input } from './ui';
import { useAuth } from '../context/AuthContext';
import { Lock, LogIn, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const { error } = await signIn(email, password);
      if (error) {
        setErrorMsg(error.message || 'Authentication failed. Please check credentials.');
      } else {
        toast.success('Signed in successfully!');
        setEmail('');
        setPassword('');
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unexpected login error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Supabase Cloud Sign In" maxWidth="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3 p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-800">
          <div className="p-2 bg-blue-600 text-white rounded-lg shrink-0">
            <Lock size={16} />
          </div>
          <div>
            <p className="font-bold text-blue-900">Authenticate CRM Session</p>
            <p className="text-[11px] text-blue-700 mt-0.5">
              Sign in with your verified Supabase user profile to synchronize offline changes.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-xs text-red-700 animate-in fade-in duration-150">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="space-y-3">
          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. admin@sccjobs.in"
            required
            autoComplete="email"
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your account password"
            required
            autoComplete="current-password"
          />
        </div>

        <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={loading} className="gap-1.5">
            <LogIn size={14} />
            <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
};
