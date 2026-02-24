import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps): React.ReactNode {
  const baseStyles = 'inline-flex items-center justify-center rounded-default font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary';
  const variantStyles = {
    primary: 'bg-accent-primary text-text-primary hover:bg-accent-hover',
    secondary: 'bg-bg-secondary text-text-primary hover:bg-bg-hover',
    ghost: 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
  };
  const sizeStyles = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
