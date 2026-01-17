/**
 * Button - Unified button component with multiple variants
 * Supports modern, retro FT2, and custom button styles
 */

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'default' | 'ghost' | 'icon' | 'ft2' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  color?: 'default' | 'red' | 'green' | 'yellow' | 'blue' | 'purple' | 'cyan' | 'amber';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'default',
  size = 'md',
  color = 'default',
  fullWidth = false,
  loading = false,
  icon,
  iconPosition = 'left',
  children,
  className = '',
  disabled,
  ...props
}) => {
  // Base classes for all buttons
  const baseClasses = 'inline-flex items-center justify-center gap-2 font-medium transition-colors focus:outline-none';

  // Variant classes
  const variantClasses: Record<string, string> = {
    primary: 'btn-primary',
    default: 'btn',
    ghost: 'btn-ghost',
    icon: 'btn-icon',
    danger: 'px-4 py-2 bg-red-600 text-white hover:bg-red-700 border border-red-700 rounded-md',
    ft2: '', // FT2 handled separately with color variants
  };

  // Size classes for non-FT2 buttons
  const sizeClasses: Record<string, string> = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-6 py-3',
    icon: 'p-2',
  };

  // FT2 specific classes
  const ft2BaseClasses = 'ft2-btn';
  const ft2SizeClasses: Record<string, string> = {
    sm: 'ft2-btn-small',
    md: '',
    lg: '',
    icon: '',
  };

  const ft2ColorClasses: Record<string, string> = {
    default: '',
    red: 'ft2-btn-red',
    green: 'ft2-btn-green',
    yellow: 'ft2-btn-yellow',
    blue: 'ft2-btn-blue',
    purple: 'ft2-btn-purple',
    cyan: '',
    amber: '',
  };

  // Build final class string
  let buttonClasses = baseClasses;

  if (variant === 'ft2') {
    buttonClasses += ` ${ft2BaseClasses} ${ft2SizeClasses[size]} ${ft2ColorClasses[color]}`;
  } else {
    const variantClass = variantClasses[variant] || variantClasses.default;

    // Only add size classes if not using CSS class-based variants
    if (!['primary', 'default', 'ghost', 'icon'].includes(variant)) {
      buttonClasses += ` ${sizeClasses[size]}`;
    }

    buttonClasses += ` ${variantClass}`;
  }

  if (fullWidth) {
    buttonClasses += ' w-full';
  }

  if (disabled || loading) {
    buttonClasses += ' opacity-50 cursor-not-allowed';
  }

  // Add custom className
  if (className) {
    buttonClasses += ` ${className}`;
  }

  // Loading spinner
  const loadingSpinner = (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  return (
    <button
      {...props}
      className={buttonClasses}
      disabled={disabled || loading}
    >
      {loading && loadingSpinner}
      {!loading && icon && iconPosition === 'left' && icon}
      {children}
      {!loading && icon && iconPosition === 'right' && icon}
    </button>
  );
};
