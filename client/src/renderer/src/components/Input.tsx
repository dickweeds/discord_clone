import React, { useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className = '', id, ...props }: InputProps): React.ReactNode {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1">
      {label && <label htmlFor={inputId} className="text-sm text-text-secondary">{label}</label>}
      <input
        id={inputId}
        className={`rounded-default bg-bg-tertiary px-3 py-2 text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-accent-primary ${className}`}
        {...props}
      />
    </div>
  );
}
