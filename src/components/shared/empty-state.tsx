type EmptyStateProps = {
  title?: string;
  description?: string;
  action?: React.ReactNode;
};

export function EmptyState({
  title = "No data",
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-[200px] gap-3 text-center px-4 py-12">
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
