import React from 'react';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'success' }> = ({ className, variant = 'primary', ...props }) => {
  const baseStyle = "px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-200",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
    danger: "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100",
    success: "bg-green-600 text-white hover:bg-green-700 shadow-md shadow-green-200"
  };
  
  return <button className={`${baseStyle} ${variants[variant]} ${className || ''}`} {...props} />;
};

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={`w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`} {...props} />
));

export const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-sm font-medium text-slate-700 mb-1">{children}</label>
);

export const Badge: React.FC<{ children: React.ReactNode, color?: string }> = ({ children, color = "bg-slate-100 text-slate-700" }) => (
  <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>{children}</span>
);

export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 text-2xl">&times;</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
};

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