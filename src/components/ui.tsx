import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  className = '',
  variant = 'primary',
  size = 'md',
  children,
  disabled,
  ...props
}) => {
  const baseStyle =
    'inline-flex items-center justify-center font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-1';

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-xs md:text-sm px-3.5 py-2 gap-2',
    lg: 'text-sm md:text-base px-5 py-2.5 gap-2.5',
  };

  const variants = {
    primary:
      'bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-500/20 focus:ring-blue-500 border border-blue-600',
    secondary:
      'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 shadow-sm focus:ring-slate-400',
    danger:
      'bg-red-600 text-white hover:bg-red-700 shadow-sm shadow-red-500/20 focus:ring-red-500 border border-red-600',
    success:
      'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-500/20 focus:ring-emerald-500 border border-emerald-600',
    ghost:
      'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent focus:ring-slate-300',
    outline:
      'bg-transparent text-blue-600 border border-blue-300 hover:bg-blue-50 focus:ring-blue-400',
  };

  return (
    <button
      className={`${baseStyle} ${sizeStyles[size]} ${variants[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', label, error, helperText, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold text-slate-700 mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full px-3 py-2 text-xs md:text-sm bg-white border rounded-lg transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
            error
              ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
              : 'border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-blue-100'
          } ${className}`}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="mt-1 text-xs text-red-600 font-medium" role="alert">
            {error}
          </p>
        )}
        {!error && helperText && <p className="mt-1 text-[11px] text-slate-400">{helperText}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

export const Label: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <label className={`block text-xs font-semibold text-slate-700 mb-1 ${className}`}>{children}</label>;

export const Badge: React.FC<{
  children: React.ReactNode;
  color?: string;
  variant?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}> = ({ children, color, variant, className = '' }) => {
  if (color) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide ${color} ${className}`}>
        {children}
      </span>
    );
  }

  const variantStyles = {
    neutral: 'bg-slate-100 text-slate-700 border border-slate-200/80',
    primary: 'bg-blue-50 text-blue-700 border border-blue-200/80',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200/80',
    danger: 'bg-red-50 text-red-700 border border-red-200/80',
    info: 'bg-indigo-50 text-indigo-700 border border-indigo-200/80',
  };

  const style = variantStyles[variant || 'neutral'];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide ${style} ${className}`}>
      {children}
    </span>
  );
};

export const Modal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}> = ({ isOpen, onClose, title, children, maxWidth = 'md' }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl border border-slate-100 w-full ${maxWidthStyles[maxWidth]} max-h-[92vh] flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
          <h3 id="modal-title" className="text-base font-bold text-slate-800 tracking-tight">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4 flex-1">{children}</div>
      </div>
    </div>
  );
};

export const Drawer: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}> = ({ isOpen, onClose, title, children, footer, width = 'xl' }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthStyles = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs transition-opacity duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bg-white h-full w-full ${widthStyles[width]} shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 bg-slate-50/70 shrink-0">
          <div className="text-base font-bold text-slate-800 tracking-tight flex-1 pr-3">
            {title}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-5 flex-1 bg-white">{children}</div>
        {footer && (
          <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/80 shrink-0 flex items-center justify-between gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export const Card: React.FC<{
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}> = ({ children, className = '', onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-xl border border-slate-200/80 shadow-sm hover:shadow transition-shadow ${
      onClick ? 'cursor-pointer hover:border-blue-200' : ''
    } ${className}`}
  >
    {children}
  </div>
);

export const EmptyState: React.FC<{
  icon?: any;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, title, description, action, className = '' }) => (
  <div className={`p-8 text-center flex flex-col items-center justify-center ${className}`}>
    {Icon && (
      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
        <Icon size={24} />
      </div>
    )}
    <h4 className="text-sm font-semibold text-slate-700">{title}</h4>
    {description && <p className="text-xs text-slate-400 mt-1 max-w-sm">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const CardSkeleton: React.FC = () => (
  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 space-y-3 animate-pulse">
    <div className="h-4 bg-slate-200 rounded w-3/4"></div>
    <div className="h-3 bg-slate-200 rounded w-1/2"></div>
    <div className="flex gap-2 mt-2">
      <div className="h-8 bg-slate-200 rounded w-1/3"></div>
      <div className="h-8 bg-slate-200 rounded w-1/3"></div>
    </div>
  </div>
);