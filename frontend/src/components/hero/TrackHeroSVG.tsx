import { motion } from 'framer-motion';

export default function TrackHeroSVG() {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <svg viewBox="0 0 800 500" className="w-full h-full opacity-20" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="trackGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e11d48" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.3" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* Simplified Bahrain-ish track outline */}
        <motion.path
          d="M 150 250 C 150 150 250 80 400 80 C 550 80 680 150 680 250 C 680 350 600 400 500 420 C 450 430 430 390 400 390 C 370 390 350 430 300 420 C 200 400 150 350 150 250 Z"
          fill="none"
          stroke="url(#trackGrad)"
          strokeWidth="18"
          strokeLinecap="round"
          filter="url(#glow)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.5, ease: 'easeInOut' }}
        />
        <motion.path
          d="M 220 250 C 220 190 290 140 400 140 C 510 140 580 190 580 250 C 580 310 530 345 460 355 C 430 360 415 335 400 335 C 385 335 370 360 340 355 C 270 345 220 310 220 250 Z"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="2"
        />
        {/* Animated car dot */}
        <motion.circle
          r="6"
          fill="#e11d48"
          filter="url(#glow)"
          animate={{
            offsetDistance: ['0%', '100%'],
          }}
          style={{
            offsetPath: "path('M 150 250 C 150 150 250 80 400 80 C 550 80 680 150 680 250 C 680 350 600 400 500 420 C 450 430 430 390 400 390 C 370 390 350 430 300 420 C 200 400 150 350 150 250 Z')",
          }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
        />
      </svg>
      {/* Radial gradient overlay */}
      <div className="absolute inset-0 bg-radial-[ellipse_at_center] from-transparent via-transparent to-[#0A0B14]" />
    </div>
  );
}
