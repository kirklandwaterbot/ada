import { describe, expect, it } from "vitest";
import { getEquipmentState } from "@/lib/stations";
import type { MtaAsset } from "@/lib/mta-assets";

function asset(overrides: Partial<MtaAsset>): MtaAsset {
  return {
    asset_class: "EL",
    elevator_or_escalator: "Elevator",
    equipment_code: "EL001",
    ...overrides,
  };
}

describe("daily equipment snapshot classification", () => {
  it("classifies explicit RNOS records as outage flags", () => {
    expect(getEquipmentState(asset({ service_status_code: "RNOS" }))).toBe(
      "outage",
    );
  });

  it("classifies modernization and repair notes as work", () => {
    expect(getEquipmentState(asset({ notes: "Closed for modernization" }))).toBe(
      "work",
    );
  });

  it("classifies IFIS records as operational snapshot entries", () => {
    expect(getEquipmentState(asset({ service_status_code: "IFIS" }))).toBe(
      "operational",
    );
  });

  it("does not invent a live status when source fields are absent", () => {
    expect(getEquipmentState(asset({}))).toBe("unknown");
  });
});
