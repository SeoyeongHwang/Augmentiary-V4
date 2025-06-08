export default function Button({
    children,
    onClick,
    className = '',
    type = 'button',
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    type?: 'button' | 'submit';
  }) {
    return (
      <button
        type={type}
        onClick={onClick}
        className={`bg-black text-white font-semibold px-4 py-2 rounded-2xl shadow-soft hover:bg-gray-900 transition ${className}`}
      >
        {children}
      </button>
    );
  }
  