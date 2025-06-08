import React from 'react';

export default function Heading({
    level = 1,
    children,
    className = '',
  }: {
    level?: 1 | 2 | 3 | 4;
    children: React.ReactNode;
    className?: string;
  }) {
    const size = {
      1: 'text-3xl',
      2: 'text-2xl',
      3: 'text-xl',
      4: 'text-lg',
    }[level];
  
    return React.createElement(
      `h${level}`,
      { className: `${size} font-bold text-gray-900 mb-4 ${className}` },
      children
    );
  }
  