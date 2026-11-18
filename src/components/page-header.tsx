type PageHeaderProps = {
  actions?: React.ReactNode;
  children?: React.ReactNode;
  description: string;
  /** Kept for callers; the active nav item already names the section. */
  eyebrow?: string;
  title: string;
};

export function PageHeader({ actions, children, description, title }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-5 border-b border-[var(--border)] pb-7 xl:flex-row xl:items-end xl:justify-between">
      <div className="max-w-3xl">
        <h1 className="text-[2.1rem] font-bold leading-[1.08] tracking-[-0.025em] text-[var(--ink)] sm:text-[2.75rem]">
          {title}
        </h1>
        <p className="mt-3 max-w-[62ch] text-[1.0625rem] leading-7 text-[var(--muted-strong)]">
          {description}
        </p>
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}
