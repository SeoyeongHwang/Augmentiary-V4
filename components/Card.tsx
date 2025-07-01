export default function Card({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
    return (
      <div className={`bg-white border border-gray-200 rounded-2xl shadow-soft p-6 ${className}`} onClick={onClick}>
        {children}
      </div>
    );
  }
  