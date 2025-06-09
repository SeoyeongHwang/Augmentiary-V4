import React from 'react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode;
};

const CircleIconButton = ({ children, className = '', ...props }: Props) => (
  <button
    type="button"
    className={`rounded-full w-10 h-10 flex items-center justify-center bg-gray-50 drop-shadow-md hover:bg-gray-200 drop-shadow-md transition-colors ${className}`}
    {...props}
  >
    {children}
  </button>
);

export default CircleIconButton; 