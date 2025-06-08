export default function Section({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
      <section className={`max-w-3xl mx-auto px-6 py-8 ${className}`}>
        {children}
      </section>
    );
  }
  