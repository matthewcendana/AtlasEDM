// Shared pin colors: black by default, the app's single pink accent when selected —
// same two values on both /map's venue pins and the homepage globe's
// flagship-festival pins, so neither map can drift out of sync with the other.
export const PIN_COLOR_DEFAULT = "#000000";
export const PIN_COLOR_SELECTED = "#e8368f";

// Draws a classic teardrop map-pin (circle + tapered tip) into an offscreen canvas
// and hands back raw RGBA pixels in the shape mapboxgl.Map#addImage expects. Shared
// between /map's venue pins and the homepage globe's flagship-festival pins so both
// render the same pin silhouette, just registered under different colors/ids.
export function buildPinIcon(color: string): ImageData {
  const width = 28;
  const height = 36;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new ImageData(width, height);

  const cx = width / 2;
  const r = 9;
  const cy = r + 2;
  const tipY = height - 2;

  // Teardrop path: a long arc around the top of the circle (skipping the ~90deg
  // wedge at the bottom), then straight lines down to a single point — the
  // standard "map pin" silhouette, anchored at its tip below.
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI / 4, (3 * Math.PI) / 4, true);
  ctx.lineTo(cx, tipY);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  return ctx.getImageData(0, 0, width, height);
}
