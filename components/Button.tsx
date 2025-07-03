export default function Button({
    children,
    onClick,
    className = '',
    type = 'button',
    disabled = false,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    type?: 'button' | 'submit';
    disabled?: boolean;
  }) {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={`w-fit bg-black text-white font-semibold px-4 py-2 rounded-2xl shadow-soft transition ${disabled ? 'opacity-50 cursor-not-allowed hover:bg-gray-900' : 'hover:bg-gray-900'} ${className}`}
      >
        {children}
      </button>
    );
  }
  