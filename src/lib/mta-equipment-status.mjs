import { fetchWithRetry } from "../../scripts/fetch-with-retry.mjs";

export const MTA_EQUIPMENT_STATUS_PAGE_URL =
  "https://www.mta.info/elevator-escalator-status";

const COMPONENT_URL =
  "https://consist.mta.info/elevators-escalators/index.js";
const API_ORIGIN = "https://api-endpoint.mta.info";
const CURRENT_OUTAGES_PATH =
  "/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json";
const EQUIPMENT_PATH =
  "/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_equipments.json";
const FUTURE_OUTAGES_PATH =
  "/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_upcoming.json";

export async function fetchMtaEquipmentStatus() {
  const componentSource = await fetchWithRetry(
    COMPONENT_URL,
    {
      headers: { "User-Agent": "mta-access-assets/0.1" },
      next: { revalidate: 60 * 60 * 24 },
    },
    { consume: (response) => response.text() },
  );
  const apiKey = extractApiKey(componentSource);
  const headers = {
    Accept: "application/json",
    "User-Agent": "mta-access-assets/0.1",
    "x-api-key": apiKey,
  };

  const [equipment, combinedOutages, futureOutages] = await Promise.all([
    fetchStatusFeed(EQUIPMENT_PATH, headers),
    fetchStatusFeed(CURRENT_OUTAGES_PATH, headers),
    fetchStatusFeed(FUTURE_OUTAGES_PATH, headers),
  ]);
  return buildMtaEquipmentStatusSnapshot(
    equipment,
    combinedOutages,
    futureOutages,
  );
}

export function buildMtaEquipmentStatusSnapshot(
  equipment,
  combinedOutages,
  futureOutages,
  generatedAt = new Date().toISOString(),
) {
  const currentOutages = combinedOutages.filter(
    (outage) => String(outage?.isupcomingoutage || "").toUpperCase() !== "Y",
  );
  const normalizedCurrent = deduplicateOutages(
    currentOutages.map((outage) => normalizeOutage(outage, "current")),
  );
  const normalizedFuture = deduplicateOutages(
    futureOutages.map((outage) => normalizeOutage(outage, "future")),
  );

  validateStatusSnapshot(equipment, normalizedCurrent, normalizedFuture);

  return {
    metadata: {
      generatedAt,
      source: "MTA Elevator & Escalator Status",
      sourceUrl: MTA_EQUIPMENT_STATUS_PAGE_URL,
      componentUrl: COMPONENT_URL,
      equipmentCount: equipment.length,
      currentOutageCount: normalizedCurrent.length,
      futureOutageCount: normalizedFuture.length,
    },
    equipmentCodes: equipment
      .map((item) => String(item?.equipmentno || item?.equipment || "").trim().toUpperCase())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true })),
    currentOutages: normalizedCurrent,
    futureOutages: normalizedFuture,
  };
}

export function mergeMtaEquipmentStatus(assets, snapshot) {
  const currentByEquipment = groupOutagesByEquipment(snapshot.currentOutages);
  const futureByEquipment = groupOutagesByEquipment(snapshot.futureOutages);
  const trackedEquipment = new Set(snapshot.equipmentCodes || []);

  return assets.map((asset) => {
    const equipmentCode = String(asset.equipment_code || "").trim().toUpperCase();
    const current = currentByEquipment.get(equipmentCode) || [];
    const future = futureByEquipment.get(equipmentCode) || [];
    const currentPrimary = current[0] || null;
    const futurePrimary = future[0] || null;

    return {
      ...asset,
      live_equipment_status:
        current.length > 0
          ? "outage"
          : trackedEquipment.has(equipmentCode)
            ? "operational"
            : "unknown",
      current_outage: current.length > 0 ? "YES" : "NO",
      current_outage_count: String(current.length),
      current_outage_reason: currentPrimary?.reason || "",
      current_outage_start: currentPrimary?.outageStart || "",
      current_outage_estimated_return:
        currentPrimary?.estimatedReturnToService || "",
      current_outage_details: JSON.stringify(current),
      future_outage: future.length > 0 ? "YES" : "NO",
      future_outage_count: String(future.length),
      future_outage_reason: futurePrimary?.reason || "",
      future_outage_start: futurePrimary?.outageStart || "",
      future_outage_estimated_return:
        futurePrimary?.estimatedReturnToService || "",
      future_outage_details: JSON.stringify(future),
      equipment_status_checked_at: snapshot.metadata.generatedAt,
      equipment_status_source_url: snapshot.metadata.sourceUrl,
    };
  });
}

function extractApiKey(source) {
  const apiKey = source.match(
    /baseURL:\s*["']https:\/\/api-endpoint\.mta\.info["'][\s\S]{0,250}?["']x-api-key["']\s*:\s*["']([^"']+)["']/i,
  )?.[1];

  if (!apiKey) {
    throw new Error(
      "MTA elevator/escalator component no longer exposes its public status-feed key",
    );
  }
  return apiKey;
}

async function fetchStatusFeed(path, headers) {
  const url = `${API_ORIGIN}${path}`;
  const payload = await fetchWithRetry(
    url,
    {
      headers,
      next: { revalidate: 5 * 60 },
    },
    { consume: (response) => response.json() },
  );

  if (!Array.isArray(payload)) {
    throw new Error(`MTA status feed ${path} did not return an array`);
  }
  return payload;
}

function normalizeOutage(outage, timeframe) {
  const equipmentCode = String(
    outage?.equipment || outage?.equipmentno || "",
  )
    .trim()
    .toUpperCase();

  return {
    timeframe,
    equipmentCode,
    equipmentType:
      String(outage?.equipmenttype || "").toUpperCase() === "ES"
        ? "Escalator"
        : "Elevator",
    station: String(outage?.station || "").trim(),
    routes: String(outage?.trainno || "")
      .split("/")
      .map((route) => route.trim())
      .filter(Boolean),
    serving: String(outage?.serving || "").trim(),
    ada: String(outage?.ADA || "").toUpperCase() === "Y",
    reason: String(outage?.reason || "Outage").trim(),
    outageStart: String(outage?.outagedate || "").trim(),
    estimatedReturnToService: String(
      outage?.estimatedreturntoservice || "",
    ).trim(),
    maintenance:
      String(outage?.ismaintenanceoutage || "").toUpperCase() === "Y",
  };
}

function deduplicateOutages(outages) {
  const unique = new Map();
  for (const outage of outages) {
    const key = [
      outage.timeframe,
      outage.equipmentCode,
      outage.outageStart,
      outage.estimatedReturnToService,
      outage.reason,
    ].join("|");
    unique.set(key, outage);
  }
  return [...unique.values()].sort((left, right) =>
    [left.outageStart, left.equipmentCode].join("|").localeCompare(
      [right.outageStart, right.equipmentCode].join("|"),
    ),
  );
}

function groupOutagesByEquipment(outages) {
  const grouped = new Map();
  for (const outage of outages) {
    const values = grouped.get(outage.equipmentCode) || [];
    values.push(outage);
    grouped.set(outage.equipmentCode, values);
  }
  return grouped;
}

function validateStatusSnapshot(equipment, currentOutages, futureOutages) {
  if (equipment.length < 500) {
    throw new Error(
      `MTA equipment status feed returned only ${equipment.length} equipment records`,
    );
  }
  const invalid = [...currentOutages, ...futureOutages].filter(
    (outage) => !outage.equipmentCode,
  );
  if (invalid.length > 0) {
    throw new Error(`MTA status feeds returned ${invalid.length} outages without equipment IDs`);
  }
}
