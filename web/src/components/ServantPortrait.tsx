interface ServantPortraitProps {
  readonly src: string | undefined;
  readonly alt: string;
  readonly size?: number;
}

/** A servant/CE face icon — a real fetched Atlas Academy asset, or a plain initials fallback when a record genuinely has none (never a fabricated picture). */
export function ServantPortrait({ src, alt, size = 56 }: ServantPortraitProps) {
  if (src === undefined) {
    return (
      <div
        style={{ width: size, height: size }}
        className="grid shrink-0 place-items-center rounded-md bg-[var(--ground-inset)] text-xs font-semibold text-[var(--ink-dim)] ring-1 ring-[var(--rule)]"
        aria-hidden="true"
      >
        {alt.slice(0, 2).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      style={{ width: size, height: size }}
      className="shrink-0 rounded-md bg-[var(--ground-inset)] object-cover ring-1 ring-[var(--rule)]"
    />
  );
}
