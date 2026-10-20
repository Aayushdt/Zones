import type { SVGProps } from 'react'

interface LogoProps extends SVGProps<SVGSVGElement> {
  size?: number
  glow?: boolean
}

export function LogoMark({ size = 32, glow = true, className = '', ...props }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`logo-mark ${glow ? 'logo-mark--glow' : ''} ${className}`}
      aria-hidden="true"
      {...props}
    >
      <circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" strokeDasharray="3 3" />
      <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="2" strokeOpacity="0.8" />
      <path d="M24 3V8M24 40V45M3 24H8M40 24H45" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.5" />
      <circle cx="24" cy="24" r="4.5" fill="currentColor" />
      <path d="M24 24L34 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="34" cy="14" r="2.5" fill="#38BDF8" />
    </svg>
  )
}

export function Logo({
  markSize = 36,
  showTagline = false,
  className = '',
}: {
  markSize?: number
  showTagline?: boolean
  className?: string
}) {
  return (
    <div className={`brand-lockup ${className}`}>
      <div className="brand-lockup__mark">
        <LogoMark size={markSize} />
      </div>
      <div className="brand-lockup__text">
        <span className="brand-lockup__name">XZONES</span>
        {showTagline && <span className="brand-lockup__tagline">GPS HIDE &amp; SEEK</span>}
      </div>
    </div>
  )
}
