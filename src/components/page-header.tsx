type PageHeaderProps = {
  actions?: React.ReactNode;
  description: string;
  eyebrow: string;
  title: string;
};

export function PageHeader({
  actions,
  description,
  eyebrow,
  title,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
      <div className="max-w-3xl">
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--accent-600)]">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-[var(--ink)] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-strong)] sm:text-base">
          {description}
        </p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </header>
  );
}
