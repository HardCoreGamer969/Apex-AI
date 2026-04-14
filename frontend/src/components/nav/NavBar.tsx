import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flag, BarChart2, Bookmark, Home } from 'lucide-react';
import { cn } from '../../lib/cn';

const links = [
  { to: '/', label: 'Dashboard', icon: Home },
  { to: '/saved', label: 'Saved', icon: Bookmark },
];

export default function NavBar() {
  const { pathname } = useLocation();

  return (
    <motion.nav
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-white/[0.02] backdrop-blur-xl flex-shrink-0"
    >
      <Link to="/" className="flex items-center gap-2 font-mono font-semibold text-sm tracking-widest text-white/90 hover:text-white transition-colors">
        <Flag size={16} className="text-[var(--accent)]" />
        APEX<span className="text-[var(--accent)]">AI</span>
      </Link>

      <div className="flex items-center gap-1">
        {links.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                active
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              )}
            >
              <Icon size={13} />
              {label}
            </Link>
          );
        })}
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
        >
          <BarChart2 size={13} />
          Telemetry
        </a>
      </div>
    </motion.nav>
  );
}
