type Props = {
  className?: string;
};

export function Skeleton({ className = "h-4 w-full" }: Props) {
  return <div className={`animate-pulse rounded-control bg-panel-border ${className}`} aria-hidden="true" />;
}
