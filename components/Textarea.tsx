import { forwardRef } from 'react';

const Textarea = forwardRef<HTMLTextAreaElement, {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    rows?: number;
    className?: string;
    disabled?: boolean;
  }>(({
    value,
    onChange,
    placeholder,
    rows = 20,
    className = '',
    disabled = false,
  }, ref) => {
    return (
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={`scroll-smooth w-full border border-gray-300 rounded-xl px-6 py-6 text-base leading-8 antialiased font-serif font-normal text-black focus:ring-2 focus:ring-highlight focus:border-highlight transition resize-none placeholder:text-muted caret-stone-900 ${className}`}
        style={{
          fontFamily: `'Nanum Myeongjo', -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Apple SD Gothic Neo", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif`,
        }}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;
  