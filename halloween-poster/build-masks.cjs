/* Native SVG tears on the two outer paper edges; the image stays intact. */
const fs = require('node:fs');
const path = require('node:path');

function tear(length, seed, base) {
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const points = [];
  let start = 0;
  let end = 35 + random() * 55;
  let from = base;
  let to = base + (random() - .5) * 9;
  let notch = 60 + random() * 100;
  let notchWidth = 3 + random() * 7;
  let notchDepth = 3 + random() * 5;
  for (let at = 0; at < length; at += 2 + random() * 4) {
    if (at > end) {
      start = end;
      end += 24 + random() * 65;
      from = to;
      to = base + (random() - .5) * 11;
    }
    if (at > notch + notchWidth) {
      notch += 70 + random() * 150;
      notchWidth = 3 + random() * 7;
      notchDepth = 3 + random() * 5;
    }
    const progress = (at - start) / (end - start);
    const nick = Math.max(0, 1 - Math.abs(at - notch) / notchWidth) * notchDepth;
    const depth = from + (to - from) * progress + (random() - .5) * 3.6 + nick;
    points.push([+at.toFixed(1), +depth.toFixed(1)]);
  }
  points.push([length, base]);
  return points;
}

const left = tear(1100, 9371, 15).map(([at, depth]) => [depth, at]);
const right = tear(1100, 3917, 10).map(([at, depth]) => [2000 - depth, at]);
const bottom = tear(2000, 9371, 12).map(([at, depth]) => [at, 1100 - depth]);
const coords = points => points.map(p => p.join(' ')).join(' L');
const outline = `M${coords(left)} L${coords(right.slice().reverse())} Z`;
const subtleLeft = left.map(([x, y]) => [+(x * .28).toFixed(1), y]);
const subtleRight = right.map(([x, y]) => [+(2000 - (2000 - x) * .28).toFixed(1), y]);
const insideEdges = `M0 0 L${coords(subtleLeft)} L0 1100 Z M2000 0 L${coords(subtleRight)} L2000 1100 Z`;
const edgeStrokes = `M${coords(left)} M${coords(right)}`;
const bottomOutline = `M0 0 H2000 L${coords(bottom.slice().reverse())} Z`;
const leftOutline = `M${coords(left)} L${coords(bottom)} L2000 0 Z`;
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 1100" preserveAspectRatio="none">${body}</svg>\n`;
const write = (file, body) => fs.writeFileSync(path.join(__dirname, file), svg(body));

write('poster-mask.svg', `<path fill="white" d="${outline}"/>`);
write('paper-edge-mask.svg', `<path fill="white" d="${insideEdges}"/>`);
write('torn-bottom.svg', `<path fill="white" d="${bottomOutline}"/>`);
write('torn-mask.svg', `<path fill="white" d="${leftOutline}"/>`);

// Keep the existing scratches; add tiny broken fibres along the new cuts.
const scuffsPath = path.join(__dirname, 'scuffs.svg');
const scratches = fs.readFileSync(scuffsPath, 'utf8').match(/<g\b[^>]*>[\s\S]*?<\/g>/)[0];
let fibres = '';
for (const [index, [x, y]] of left.entries()) {
  if (index % 6 === 0) fibres += `<path d="M${x} ${y} l2.5 -1.8"/>`;
}
for (const [index, [x, y]] of right.entries()) {
  if (index % 7 === 0) fibres += `<path d="M${x} ${y} l-2.8 -1.2"/>`;
}
write('scuffs.svg', `${scratches}<path d="${edgeStrokes}" fill="none" stroke="#a18c66" stroke-opacity=".32" stroke-width="1.2"/><g fill="none" stroke="#c3ad85" stroke-opacity=".45" stroke-width=".7">${fibres}</g>`);
