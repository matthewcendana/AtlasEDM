/**
 * A simple geometric mark stands in for Edmtrain's real logo until an
 * official asset is sourced with proper permission - this deliberately
 * avoids reproducing a third party's actual trademark from memory.
 */
export function PoweredByEdmtrain() {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-500">
      <span>Powered by Edmtrain</span>
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="2"
          y="2"
          width="8"
          height="8"
          rx="1"
          transform="rotate(45 6 6)"
          fill="var(--color-accent)"
          opacity="0.5"
        />
        <rect
          x="6"
          y="6"
          width="8"
          height="8"
          rx="1"
          transform="rotate(45 10 10)"
          fill="var(--color-accent)"
        />
      </svg>
    </div>
  );
}
