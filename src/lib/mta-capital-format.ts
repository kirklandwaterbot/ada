export function formatCapitalDate(value: string | null) {
  if (!value) return "Not published";
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatCapitalTimestamp(value: string | null) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatCapitalMoney(
  value: number | null,
  notation: "compact" | "standard" = "standard",
) {
  if (value === null) return "Not published";

  if (notation === "compact") {
    const absoluteValue = Math.abs(value);
    const scale =
      absoluteValue >= 1_000_000_000_000
        ? { divisor: 1_000_000_000_000, suffix: "T" }
        : absoluteValue >= 1_000_000_000
          ? { divisor: 1_000_000_000, suffix: "B" }
          : absoluteValue >= 1_000_000
            ? { divisor: 1_000_000, suffix: "M" }
            : absoluteValue >= 1_000
              ? { divisor: 1_000, suffix: "K" }
              : { divisor: 1, suffix: "" };
    const amount = absoluteValue / scale.divisor;
    const digits = amount >= 100 || Number.isInteger(amount) ? 0 : 1;
    const sign = value < 0 ? "-" : "";
    return `${sign}$${amount.toFixed(digits)}${scale.suffix}`;
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}
