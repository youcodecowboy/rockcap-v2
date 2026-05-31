import type { ColorPalette } from "@/lib/colors";

export function clientStatusTone(status: string | undefined, colors: ColorPalette): string {
  switch ((status ?? "").toLowerCase()) {
    case "active": return colors.accent.green;
    case "prospect": return colors.accent.yellow;
    case "archived":
    case "past": return colors.text.dim;
    default: return colors.text.muted;
  }
}

export function projectStatusTone(status: string | undefined, colors: ColorPalette): string {
  switch ((status ?? "").toLowerCase()) {
    case "active": return colors.accent.green;
    case "completed": return colors.accent.blue;
    case "on-hold": return colors.accent.yellow;
    case "cancelled": return colors.accent.red;
    case "inactive": return colors.text.dim;
    default: return colors.text.muted;
  }
}
