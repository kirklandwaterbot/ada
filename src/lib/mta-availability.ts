const AVAILABILITY_API_URL =
  "https://data.ny.gov/resource/rc78-7x78.json";

type RawAvailabilityRow = {
  am_peak_availability?: string;
  equipment_code?: string;
  month?: string;
  pm_peak_availability?: string;
  total_outages?: string;
};

export type AvailabilityPoint = {
  availability: number | null;
  label: string;
  month: string;
  outages: number;
  records: number;
};

export async function getAvailabilityHistory(
  equipmentCodes: string[],
  numberOfMonths = 12,
): Promise<AvailabilityPoint[]> {
  const codes = Array.from(
    new Set(
      equipmentCodes
        .map((code) => code.trim().toUpperCase())
        .filter((code) => /^[A-Z0-9-]+$/.test(code)),
    ),
  );

  if (codes.length === 0) {
    return [];
  }

  const params = new URLSearchParams({
    "$limit": String(Math.max(numberOfMonths * codes.length * 2, 100)),
    "$order": "month DESC",
    "$select":
      "month,equipment_code,total_outages,am_peak_availability,pm_peak_availability",
    "$where":
      "equipment_code in(" +
      codes.map((code) => "'" + code.replaceAll("'", "''") + "'").join(",") +
      ")",
  });

  try {
    const response = await fetch(AVAILABILITY_API_URL + "?" + params.toString(), {
      next: { revalidate: 86_400 },
    });

    if (!response.ok) {
      return [];
    }

    const rows = (await response.json()) as RawAvailabilityRow[];
    const byMonth = new Map<
      string,
      { availability: number[]; outages: number; records: number }
    >();

    for (const row of rows) {
      if (!row.month) {
        continue;
      }

      const month = row.month.slice(0, 10);
      const current = byMonth.get(month) ?? {
        availability: [],
        outages: 0,
        records: 0,
      };
      const am = parsePercentage(row.am_peak_availability);
      const pm = parsePercentage(row.pm_peak_availability);
      const values = [am, pm].filter(
        (value): value is number => value !== null,
      );

      if (values.length > 0) {
        current.availability.push(
          values.reduce((sum, value) => sum + value, 0) / values.length,
        );
      }

      current.outages += parseNumber(row.total_outages);
      current.records += 1;
      byMonth.set(month, current);
    }

    return Array.from(byMonth.entries())
      .sort(([left], [right]) => right.localeCompare(left))
      .slice(0, numberOfMonths)
      .reverse()
      .map(([month, values]) => ({
        availability:
          values.availability.length > 0
            ? values.availability.reduce((sum, value) => sum + value, 0) /
              values.availability.length
            : null,
        label: new Intl.DateTimeFormat("en-US", {
          month: "short",
          year: "2-digit",
          timeZone: "UTC",
        }).format(new Date(month + "T00:00:00Z")),
        month,
        outages: values.outages,
        records: values.records,
      }));
  } catch {
    return [];
  }
}

function parseNumber(value?: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parsePercentage(value?: string) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number <= 1 ? number * 100 : number;
}
