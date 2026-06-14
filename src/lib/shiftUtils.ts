export function classifyShift(shift: { startTime: string; endTime?: string }): {
  isNight: boolean;
  isEarlyMorning: boolean;
  requiresEscort: boolean;
  label: "APAC" | "EMEA" | "IST" | "NIGHT" | "GENERAL";
} {
  const [hStr, mStr = "0"] = shift.startTime.split(":");
  const hour = parseInt(hStr, 10);
  const minute = parseInt(mStr, 10) || 0;
  const startMinutes = hour * 60 + minute;

  const isNight = hour >= 20 || hour < 6;
  const isEarlyMorning = hour >= 4 && hour < 7;

  let label: "APAC" | "EMEA" | "IST" | "NIGHT" | "GENERAL" = "GENERAL";

  // APAC: 04:00–06:59
  if (startMinutes >= 4 * 60 && startMinutes < 7 * 60) {
    label = "APAC";
  }
  // IST: 08:00–12:59
  else if (startMinutes >= 8 * 60 && startMinutes < 13 * 60) {
    label = "IST";
  }
  // EMEA: 14:00–16:59
  else if (startMinutes >= 14 * 60 && startMinutes < 17 * 60) {
    label = "EMEA";
  }
  // NIGHT: 20:00–02:59
  else if (hour >= 20 || hour < 3) {
    label = "NIGHT";
  }

  const requiresEscort = isNight || isEarlyMorning;

  return { isNight, isEarlyMorning, requiresEscort, label };
}
