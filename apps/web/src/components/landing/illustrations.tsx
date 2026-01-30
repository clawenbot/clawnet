"use client";

// Simple, minimal SVG illustrations for the landing page
// Inspired by modern SaaS landing pages

export function HeroIllustration() {
  return (
    <svg
      viewBox="0 0 400 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-w-md"
    >
      {/* Background shapes */}
      <circle cx="200" cy="150" r="120" className="fill-primary/5" />
      <circle cx="320" cy="80" r="40" className="fill-primary/10" />
      <circle cx="80" cy="220" r="30" className="fill-primary/10" />
      
      {/* Main robot/agent figure */}
      <g transform="translate(140, 60)">
        {/* Body */}
        <rect x="30" y="80" width="60" height="80" rx="12" className="fill-primary/80" />
        
        {/* Head */}
        <rect x="25" y="30" width="70" height="55" rx="10" className="fill-primary" />
        
        {/* Eyes */}
        <circle cx="45" cy="52" r="8" className="fill-background" />
        <circle cx="75" cy="52" r="8" className="fill-background" />
        <circle cx="47" cy="54" r="4" className="fill-foreground" />
        <circle cx="77" cy="54" r="4" className="fill-foreground" />
        
        {/* Antenna */}
        <line x1="60" y1="30" x2="60" y2="15" className="stroke-primary" strokeWidth="3" />
        <circle cx="60" cy="12" r="5" className="fill-primary" />
        
        {/* Arms */}
        <rect x="5" y="90" width="20" height="50" rx="8" className="fill-primary/60" />
        <rect x="95" y="90" width="20" height="50" rx="8" className="fill-primary/60" />
        
        {/* Screen/chest display */}
        <rect x="40" y="95" width="40" height="30" rx="4" className="fill-background" />
        <rect x="45" y="100" width="30" height="4" rx="2" className="fill-primary/40" />
        <rect x="45" y="108" width="20" height="4" rx="2" className="fill-primary/40" />
        <rect x="45" y="116" width="25" height="4" rx="2" className="fill-primary/40" />
      </g>
      
      {/* Floating connection nodes */}
      <g className="animate-pulse">
        <circle cx="80" cy="100" r="12" className="fill-primary/30" />
        <circle cx="80" cy="100" r="6" className="fill-primary" />
      </g>
      <g className="animate-pulse" style={{ animationDelay: "0.3s" }}>
        <circle cx="320" cy="180" r="12" className="fill-primary/30" />
        <circle cx="320" cy="180" r="6" className="fill-primary" />
      </g>
      <g className="animate-pulse" style={{ animationDelay: "0.6s" }}>
        <circle cx="300" cy="250" r="10" className="fill-primary/30" />
        <circle cx="300" cy="250" r="5" className="fill-primary" />
      </g>
      
      {/* Connection lines */}
      <path 
        d="M92 100 Q 150 80 175 95" 
        className="stroke-primary/30" 
        strokeWidth="2" 
        strokeDasharray="4 4"
        fill="none"
      />
      <path 
        d="M308 180 Q 280 160 265 145" 
        className="stroke-primary/30" 
        strokeWidth="2" 
        strokeDasharray="4 4"
        fill="none"
      />
    </svg>
  );
}

export function NetworkIllustration() {
  return (
    <svg
      viewBox="0 0 300 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-w-xs"
    >
      {/* Central node */}
      <circle cx="150" cy="100" r="25" className="fill-primary" />
      <text x="150" y="105" textAnchor="middle" className="fill-background text-xl" fontSize="20">🤖</text>
      
      {/* Surrounding nodes */}
      <g>
        <circle cx="70" cy="60" r="18" className="fill-primary/70" />
        <text x="70" y="65" textAnchor="middle" className="fill-background" fontSize="14">🤖</text>
      </g>
      <g>
        <circle cx="230" cy="60" r="18" className="fill-primary/70" />
        <text x="230" y="65" textAnchor="middle" className="fill-background" fontSize="14">🤖</text>
      </g>
      <g>
        <circle cx="50" cy="140" r="18" className="fill-primary/70" />
        <text x="50" y="145" textAnchor="middle" className="fill-background" fontSize="14">🤖</text>
      </g>
      <g>
        <circle cx="250" cy="140" r="18" className="fill-primary/70" />
        <text x="250" y="145" textAnchor="middle" className="fill-background" fontSize="14">🤖</text>
      </g>
      <g>
        <circle cx="150" cy="180" r="18" className="fill-primary/70" />
        <text x="150" y="185" textAnchor="middle" className="fill-background" fontSize="14">🤖</text>
      </g>
      
      {/* Connection lines */}
      <line x1="125" y1="85" x2="85" y2="70" className="stroke-primary/40" strokeWidth="2" />
      <line x1="175" y1="85" x2="215" y2="70" className="stroke-primary/40" strokeWidth="2" />
      <line x1="130" y1="115" x2="65" y2="130" className="stroke-primary/40" strokeWidth="2" />
      <line x1="170" y1="115" x2="235" y2="130" className="stroke-primary/40" strokeWidth="2" />
      <line x1="150" y1="125" x2="150" y2="162" className="stroke-primary/40" strokeWidth="2" />
    </svg>
  );
}

export function ProfileIllustration() {
  return (
    <svg
      viewBox="0 0 300 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-w-xs"
    >
      {/* Card background */}
      <rect x="50" y="20" width="200" height="160" rx="12" className="fill-card stroke-border" strokeWidth="2" />
      
      {/* Header banner */}
      <rect x="50" y="20" width="200" height="50" rx="12" className="fill-primary/20" />
      <rect x="50" y="50" width="200" height="20" className="fill-primary/20" />
      
      {/* Avatar */}
      <circle cx="100" cy="70" r="30" className="fill-background stroke-card" strokeWidth="4" />
      <circle cx="100" cy="70" r="25" className="fill-primary/80" />
      <text x="100" y="78" textAnchor="middle" className="fill-background" fontSize="24">🤖</text>
      
      {/* Name lines */}
      <rect x="70" y="110" width="80" height="10" rx="3" className="fill-foreground/80" />
      <rect x="70" y="125" width="60" height="6" rx="3" className="fill-muted-foreground/50" />
      
      {/* Stats */}
      <rect x="160" y="85" width="70" height="25" rx="6" className="fill-primary/10" />
      <rect x="165" y="92" width="30" height="5" rx="2" className="fill-primary/40" />
      <rect x="165" y="100" width="20" height="4" rx="2" className="fill-muted-foreground/30" />
      
      {/* Skills pills */}
      <rect x="70" y="145" width="40" height="18" rx="9" className="fill-primary/20" />
      <rect x="115" y="145" width="50" height="18" rx="9" className="fill-primary/20" />
      <rect x="170" y="145" width="35" height="18" rx="9" className="fill-primary/20" />
    </svg>
  );
}

export function OpportunitiesIllustration() {
  return (
    <svg
      viewBox="0 0 300 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-auto max-w-xs"
    >
      {/* Briefcase */}
      <rect x="100" y="60" width="100" height="80" rx="8" className="fill-primary/80" />
      <rect x="120" y="45" width="60" height="25" rx="4" className="fill-primary stroke-primary" strokeWidth="2" />
      <rect x="135" y="45" width="30" height="12" className="fill-background" />
      
      {/* Handle */}
      <rect x="140" y="35" width="20" height="15" rx="3" className="fill-none stroke-primary" strokeWidth="4" />
      
      {/* Briefcase details */}
      <line x1="100" y1="90" x2="200" y2="90" className="stroke-primary/60" strokeWidth="2" />
      <circle cx="150" cy="90" r="8" className="fill-background" />
      <circle cx="150" cy="90" r="4" className="fill-primary" />
      
      {/* Floating elements */}
      <g transform="translate(220, 50)">
        <rect width="60" height="40" rx="6" className="fill-card stroke-border" strokeWidth="1" />
        <rect x="8" y="8" width="30" height="4" rx="2" className="fill-primary/40" />
        <rect x="8" y="16" width="44" height="3" rx="1" className="fill-muted-foreground/30" />
        <rect x="8" y="22" width="35" height="3" rx="1" className="fill-muted-foreground/30" />
        <rect x="8" y="30" width="25" height="6" rx="3" className="fill-primary/20" />
      </g>
      
      <g transform="translate(20, 80)">
        <rect width="60" height="40" rx="6" className="fill-card stroke-border" strokeWidth="1" />
        <rect x="8" y="8" width="35" height="4" rx="2" className="fill-primary/40" />
        <rect x="8" y="16" width="44" height="3" rx="1" className="fill-muted-foreground/30" />
        <rect x="8" y="22" width="30" height="3" rx="1" className="fill-muted-foreground/30" />
        <rect x="8" y="30" width="25" height="6" rx="3" className="fill-primary/20" />
      </g>
      
      {/* Stars/sparkles */}
      <g className="animate-pulse">
        <circle cx="250" cy="120" r="4" className="fill-primary/60" />
      </g>
      <g className="animate-pulse" style={{ animationDelay: "0.5s" }}>
        <circle cx="50" cy="50" r="3" className="fill-primary/60" />
      </g>
    </svg>
  );
}

export function SkillBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-secondary hover:bg-secondary/80 transition-colors cursor-pointer border border-border">
      {children}
    </span>
  );
}
