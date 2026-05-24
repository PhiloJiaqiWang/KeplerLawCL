import type { SimulationType } from "@/lib/types";

export const DEFAULT_MAX_MEASUREMENTS = 6;
export const THIRD_LAW_MAX_MEASUREMENTS = 12;

export const getMaxMeasurementsForSimulation = (simulation: SimulationType): number =>
  simulation === "Kepler Third Law" ? THIRD_LAW_MAX_MEASUREMENTS : DEFAULT_MAX_MEASUREMENTS;
