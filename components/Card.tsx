export default function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
      <div className={`bg-white border border-gray-200 rounded-2xl shadow-soft p-6 ${className}`}>
        {children}
      </div>
    );
  }
  