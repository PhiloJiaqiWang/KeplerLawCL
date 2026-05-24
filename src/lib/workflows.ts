import type { SimulationType, Stage } from "@/lib/types";

export const STAGE_ORDER: Stage[] = ["Planning", "Investigation", "Discussion", "Submission"];

export const STAGE_OBJECTIVES_BY_SIMULATION: Record<SimulationType, Record<Stage, string>> = {
  "Kepler First Law": {
    Planning: "",
    Investigation:
      "You can now use the measurement tool: select two points in the simulation, then click Measure to record the fixed distance value.",
    Discussion:
      "Compare your evidence and agree on the most likely orbit model.",
    Submission:
      "Submit your final orbit conclusion with the key measurements that support it.",
  },
  "Kepler Second Law": {
    Planning: "Plan how to compare equal-time swept areas and what data you need.",
    Investigation: "Collect time-window and area observations from the orbit.",
    Discussion: "Discuss whether equal times correspond to equal swept areas.",
    Submission: "Submit your final second-law conclusion.",
  },
  "Kepler Third Law": {
    Planning: "Plan how to relate orbital period to semi-major axis across cases.",
    Investigation: "Collect period and axis-length measurements from available orbits.",
    Discussion: "Discuss the observed period-axis relationship.",
    Submission: "Submit your final third-law conclusion.",
  },
};
