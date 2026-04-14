import { type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface GlassPanelProps {
  children?: ReactNode;
  className?: string;
  glow?: boolean;
}

export default function GlassPanel({ children, className, glow = false }: GlassPanelProps) {
  return (
    <div
      className={cn(
        'backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl',
        glow && 'shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_20px_rgba(255,255,255,0.03)]',
        className
      )}
    >
      {children}
    </div>
  );
}
