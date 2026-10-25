export function SaMonogram({ color = "#F5F4EC", height = 32, className }: { color?: string; height?: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 58 48"
      role="img"
      aria-label="SA"
      height={height}
      className={className}
      style={{ height, width: "auto" }}
    >
      <g fill="none" stroke={color} strokeWidth="5" strokeLinejoin="miter">
        <path d="M22 8.5H10.5a4 4 0 0 0-4 4V20a4 4 0 0 0 4 4h5a4 4 0 0 1 4 4v7.5a4 4 0 0 1-4 4H4" />
        <path d="M15.5 24H44" />
      </g>
      <path fill={color} d="M25.4 42 37.6 6h4.8l12.2 36h-5.3L40 14.5 30.7 42z" />
    </svg>
  );
}
