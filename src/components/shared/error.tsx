type PageErrorProps = {
  message?: string;
  onRetry?: () => void;
};

export function PageError({ message = "Something went wrong.", onRetry }: PageErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-[300px] gap-4 text-center px-4">
      <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-destructive" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Error</p>
        <p className="text-sm text-muted-foreground mt-1">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}
