export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const parts = dateStr.split("T")[0].split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function formatDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const parts = dateStr.split("T")[0].split("-");
  if (parts.length === 3) {
    const m = MONTHS_SHORT[parseInt(parts[1], 10) - 1] || parts[1];
    return `${parts[2]} ${m} ${parts[0]}`;
  }
  return dateStr;
}
