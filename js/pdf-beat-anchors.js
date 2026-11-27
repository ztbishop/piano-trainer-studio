// SMuFL code points for common printed noteheads, clefs and rests.
const notehead = /^[\uE0A2-\uE0A4]$/u;
const clef = /^[\uE050\uE05C\uE062]$/u;
const rest = /^[\uE4E3-\uE4EB]$/u;

export async function readBeatGlyphs(page, viewport) {
  if (viewport.rotation !== 0) return [];
  const {items} = await page.getTextContent({disableNormalization: true});
  const glyphs = [];
  for (const item of items) {
    const text = item.str?.trim();
    if (!notehead.test(text) && !clef.test(text) && !rest.test(text)) continue;
    const [, skewY, skewX, , left, baseline] = item.transform;
    if (skewX || skewY || !(item.width > 0)) continue;
    const [x, y] = viewport.convertToViewportPoint(left + item.width / 2, baseline);
    glyphs.push({x: x / viewport.width, y: y / viewport.height, text});
  }
  return glyphs.sort((a, b) => a.x - b.x);
}

export function beatInset(box, glyphs) {
  const row = glyphs.filter(({x, y}) =>
    x >= box.x && x < box.x + box.w && y >= box.y && y <= box.y + box.h);
  const first = row.find(({text}) => notehead.test(text));
  if (!first) return 0;
  const inset = (first.x - box.x) / box.w;
  if (inset < 0.08 || inset > 0.55) return 0;
  const hasClef = row.some(({x, text}) => x < first.x && clef.test(text));
  const hasPriorRest = row.some(({x, text}) => x < first.x && rest.test(text));
  const hasLaterNote = row.some(({x, text}) => x > first.x + box.w * 0.025 && notehead.test(text));
  return hasClef && !hasPriorRest && hasLaterNote ? inset : 0;
}
