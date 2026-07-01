import React from 'react';

export default function Toast({ notification, onClose }) {
  if (!notification) return null;

  return (
    <div className="fixed top-5 right-5 z-55 max-w-sm w-full bg-white border border-slate-200 rounded-2xl p-4 shadow-none flex items-start space-x-3.5 animate-in slide-in-from-top duration-300">
      <div className={`p-2 rounded-xl ${notification.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
        {notification.type === 'success' ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        )}
      </div>
      <div className="flex-1">
        <h4 className="text-sm font-semibold text-slate-900">
          {notification.type === 'success' ? 'Submission Successful' : 'Action Required'}
        </h4>
        <p className="text-xs text-slate-500 mt-0.5">{notification.message}</p>
      </div>
      <button 
        onClick={onClose}
        className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
