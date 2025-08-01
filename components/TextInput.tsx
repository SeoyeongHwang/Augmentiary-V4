import { forwardRef } from 'react';

const TextInput = forwardRef<HTMLInputElement, {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: string;
    className?: string;
  }>(({
    value,
    onChange,
    placeholder,
    type = 'text',
    className = '',
  }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full border border-gray-300 rounded-xl px-6 py-4 focus:ring-highlight transition ${className}`}
      />
    );
  }
);

TextInput.displayName = 'TextInput';

export default TextInput;
  