// Draws the 1200 x 630 link-preview card shown when the page is shared on
// WhatsApp and elsewhere: the portrait in a candle-lit gold ring on plum,
// beside his name, the dates and the tribute line.

import type { Fundraiser } from "@/lib/types";

const W = 1200;
const H = 630;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The memorial photo could not be loaded."));
    img.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Text with letter spacing, drawn glyph by glyph where the canvas lacks letterSpacing. */
function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
}

export async function createSharePreview(f: Fundraiser, publicHost: string | null): Promise<Blob> {
  await Promise.all([
    document.fonts.load("600 76px 'Cormorant Garamond'"),
    document.fonts.load("italic 500 34px 'Cormorant Garamond'"),
    document.fonts.load("500 36px 'Cormorant Garamond'"),
    document.fonts.load("600 24px 'Source Sans 3 Variable'"),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the preview.");

  // Deep plum background with a warm glow behind the portrait.
  const bg = ctx.createRadialGradient(330, 300, 40, 520, 320, 900);
  bg.addColorStop(0, "#3b2c47");
  bg.addColorStop(0.5, "#241a2d");
  bg.addColorStop(1, "#140f18");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const cx = 330;
  const cy = 290;
  const r = 180;
  const glow = ctx.createRadialGradient(cx, cy + 20, r * 0.7, cx, cy + 20, r * 1.9);
  glow.addColorStop(0, "rgba(255, 200, 115, 0.42)");
  glow.addColorStop(0.45, "rgba(244, 156, 72, 0.16)");
  glow.addColorStop(1, "rgba(244, 156, 72, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  if (f.memorial_photo_updated_at) {
    const img = await loadImage(`/api/public/memorial-photo?v=${encodeURIComponent(f.memorial_photo_updated_at)}`);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, cx - r, cy - r, r * 2, r * 2);
    // Candlelight falling across the photo from below.
    const light = ctx.createRadialGradient(cx, cy + r * 1.15, 10, cx, cy + r * 1.15, r * 1.4);
    light.addColorStop(0, "rgba(255, 176, 88, 0.42)");
    light.addColorStop(1, "rgba(255, 176, 88, 0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = light;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }
  // Gold ring with a soft outer halo.
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(255, 196, 110, 0.18)";
  ctx.beginPath();
  ctx.arc(cx, cy, r + 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#e8c27a";
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
  ctx.stroke();

  // A small burning candle beneath the portrait.
  const wax = ctx.createLinearGradient(cx - 9, 0, cx + 9, 0);
  wax.addColorStop(0, "#d9cdbd");
  wax.addColorStop(0.45, "#f8f1e6");
  wax.addColorStop(1, "#c9bdac");
  ctx.fillStyle = wax;
  ctx.fillRect(cx - 9, cy + r + 52, 18, 46);
  const flame = ctx.createRadialGradient(cx, cy + r + 44, 1, cx, cy + r + 40, 18);
  flame.addColorStop(0, "#fffbe8");
  flame.addColorStop(0.35, "#ffd56b");
  flame.addColorStop(0.75, "rgba(243, 154, 61, 0.9)");
  flame.addColorStop(1, "rgba(243, 154, 61, 0)");
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r + 36, 9, 17, 0, 0, Math.PI * 2);
  ctx.fill();

  // Words on the right.
  const x = 610;
  const maxWidth = W - x - 60;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(246, 239, 228, 0.72)";
  ctx.font = "600 22px 'Source Sans 3 Variable', sans-serif";
  let y = 170;
  if (f.memorial_name) {
    spaced(ctx, "IN LOVING MEMORY OF", x, y, 5);
    y += 74;
  }
  ctx.fillStyle = "#f6efe4";
  ctx.font = "600 74px 'Cormorant Garamond', Georgia, serif";
  const nameLines = wrap(ctx, f.memorial_name || f.name, maxWidth).slice(0, 3);
  for (const line of nameLines) {
    ctx.fillText(line, x, y);
    y += 78;
  }
  y -= 18;
  if (f.memorial_dates) {
    ctx.fillStyle = "rgba(246, 239, 228, 0.85)";
    ctx.font = "500 34px 'Cormorant Garamond', Georgia, serif";
    for (const line of wrap(ctx, f.memorial_dates, maxWidth)) {
      ctx.fillText(line, x, y);
      y += 42;
    }
  }
  if (f.memorial_tribute) {
    ctx.fillStyle = "#ffd086";
    ctx.font = "italic 500 34px 'Cormorant Garamond', Georgia, serif";
    for (const line of wrap(ctx, f.memorial_tribute, maxWidth).slice(0, 2)) {
      ctx.fillText(line, x, y + 6);
      y += 42;
    }
  }
  // Gold rule, then what the link is for.
  const ruleY = Math.min(y + 26, H - 110);
  const rule = ctx.createLinearGradient(x, 0, x + 220, 0);
  rule.addColorStop(0, "rgba(255, 208, 134, 0.8)");
  rule.addColorStop(1, "rgba(255, 208, 134, 0)");
  ctx.fillStyle = rule;
  ctx.fillRect(x, ruleY, 220, 2);
  ctx.fillStyle = "rgba(246, 239, 228, 0.88)";
  ctx.font = "500 27px 'Source Sans 3 Variable', sans-serif";
  ctx.fillText("Funeral contributions", x, ruleY + 44);
  ctx.fillStyle = "rgba(246, 239, 228, 0.6)";
  ctx.font = "400 22px 'Source Sans 3 Variable', sans-serif";
  ctx.fillText(publicHost ? `Give through M-Pesa · ${publicHost}` : "Give through M-Pesa and see every shilling", x, ruleY + 78);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The preview could not be created."))), "image/jpeg", 0.9),
  );
}
