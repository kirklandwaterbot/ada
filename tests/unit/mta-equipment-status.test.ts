import { describe, expect, it } from "vitest";
import {
  buildMtaEquipmentStatusSnapshot,
  mergeMtaEquipmentStatus,
} from "@/lib/mta-equipment-status.mjs";

const equipment = Array.from({ length: 500 }, (_, index) => ({
  equipmentno: `EL${index + 1}`,
}));

describe("MTA current and future equipment status", () => {
  it("excludes future rows from the current outage snapshot", () => {
    const current = {
      ADA: "Y",
      equipment: "EL1",
      equipmenttype: "EL",
      estimatedreturntoservice: "09/24/2026 12:00:00 PM",
      isupcomingoutage: "N",
      outagedate: "09/24/2026 08:00:00 AM",
      reason: "Repair",
      serving: "Street to mezzanine",
      station: "Test Station",
      trainno: "A/C",
    };
    const future = {
      ...current,
      equipment: "EL2",
      isupcomingoutage: "Y",
      outagedate: "09/29/2026 10:00:00 PM",
      reason: "Maintenance",
    };
    const snapshot = buildMtaEquipmentStatusSnapshot(
      equipment,
      [current, future],
      [future],
      "2026-09-24T00:00:00.000Z",
    );

    expect(snapshot.currentOutages.map((outage) => outage.equipmentCode)).toEqual([
      "EL1",
    ]);
    expect(snapshot.futureOutages.map((outage) => outage.equipmentCode)).toEqual([
      "EL2",
    ]);
  });

  it("keeps future work separate from the current operating state", () => {
    const snapshot = buildMtaEquipmentStatusSnapshot(
      equipment,
      [],
      [
        {
          ADA: "Y",
          equipment: "EL2",
          equipmenttype: "EL",
          estimatedreturntoservice: "09/30/2026 06:00:00 AM",
          isupcomingoutage: "Y",
          outagedate: "09/29/2026 10:00:00 PM",
          reason: "Maintenance",
          serving: "Mezzanine to platform",
          station: "125 St",
          trainno: "A/C/B/D",
        },
      ],
      "2026-09-24T00:00:00.000Z",
    );
    const [asset] = mergeMtaEquipmentStatus(
      [{ equipment_code: "EL2", service_status_code: "IFIS" }],
      snapshot,
    );

    expect(asset.live_equipment_status).toBe("operational");
    expect(asset.current_outage).toBe("NO");
    expect(asset.future_outage).toBe("YES");
    expect(JSON.parse(asset.future_outage_details)).toHaveLength(1);
  });
});
