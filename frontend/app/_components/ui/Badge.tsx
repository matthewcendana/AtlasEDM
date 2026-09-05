interface BadgeProps {
  variant: "accent" | "neutral";
  children: React.ReactNode;
  className?: string;
}

// Small uppercase pill label - the "FESTIVAL" tag on a festival event row and the
// "VENUE" tag on a venue search result are the same shape, just different colors.
// (The festival tag used to be plain colored text with no pill background; unified
// here so every badge in the app reads as the same shape, per the app's one-radius-
// scale convention.)
export function Badge({ variant, children, className = "" }: BadgeProps) {
  const variantClasses =
    variant === "accent" ? "bg-accent/10 text-accent" : "bg-surface-sunken text-text-secondary";

  return (
    <span
      className={`inline-block w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${variantClasses} ${className}`}
    >
      {children}
    </span>
  );
}
