import { cn } from "@/lib/utils/cn";

type LoadingSpinnerProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

export function LoadingSpinner({ className, size = "md" }: LoadingSpinnerProps) {
  const sizeClass = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-8 h-8" }[size];
  return (
    <svg
      className={cn("animate-spin text-muted-foreground", sizeClass, className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

type PageLoadingProps = { message?: string };

export function PageLoading({ message = "Loading…" }: PageLoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 min-h-[300px] gap-3 text-muted-foreground">
      <LoadingSpinner size="lg" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
