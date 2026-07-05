#!/usr/bin/env node
/**
 * The Quiet Map: renders og.png (1200x630) from ground.json.
 * Run in CI after fetch-ground.mjs. Uses brand fonts if present in ./fonts, else system fonts.
 */
import fs from 'fs';
import { createCanvas, registerFont } from 'canvas';

const OUTPOST = new Set(['IU.GUMO','IU.RAR','IU.AFI','IU.FUNA','IU.TARA','IU.XMAS','IU.MIDW','IU.WAKE',
  'IU.ADK','IU.BBSR','II.ASCN','II.SACV','II.CMLA','II.MSEY','II.DGAR','II.COCO','II.RPN','IU.PTCN',
  'II.HOPE','II.TRIS']);

try { registerFont('fonts/CormorantGaramond-Italic.ttf', { family: 'Cormorant', style: 'italic' }); } catch (e) {}
try { registerFont('fonts/IBMPlexMono-Regular.ttf', { family: 'PlexMono' }); } catch (e) {}

const j = JSON.parse(fs.readFileSync('ground.json', 'utf8'));
let best = null, bestCode = '';
for (const [code, s] of Object.entries(j.stations)) {
  if (OUTPOST.has(code)) continue;
  if (!best || s.p < best.p) { best = s; bestCode = code; }
}
if (!best) { console.log('no stations; skipping og card'); process.exit(0); }

const still = Math.round((1 - best.p) * 100);
const W = 1200, H = 630;
const cv = createCanvas(W, H), x = cv.getContext('2d');

x.fillStyle = '#05070D'; x.fillRect(0, 0, W, H);
for (let i = 0; i < 130; i++) {
  x.fillStyle = `rgba(242,235,214,${Math.random() * 0.12})`;
  x.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
}

x.textAlign = 'center';
x.fillStyle = 'rgba(242,235,214,0.85)'; x.font = '26px PlexMono, monospace';
x.fillText('HUMAN NOISE, MEASURED THROUGH SEISMIC DATA', W / 2, 122);

x.fillStyle = '#5A6A80'; x.font = '18px PlexMono, monospace';
x.fillText('THE QUIETEST PLACE ON EARTH RIGHT NOW IS', W / 2, 186);

const name = `${best.place}, ${best.country}`;
x.fillStyle = '#F2EBD6';
x.font = 'italic 300 84px Cormorant, Georgia, serif';
if (x.measureText(name).width > 1080) x.font = 'italic 300 60px Cormorant, Georgia, serif';
x.shadowColor = 'rgba(242,235,214,0.25)'; x.shadowBlur = 42;
x.fillText(name, W / 2, 312);
x.shadowBlur = 0;

x.fillStyle = '#8B9BB0'; x.font = '22px PlexMono, monospace';
x.fillText(`quieter than ${still}% of its usual hours`, W / 2, 372);

const hist = best.hist || [];
if (hist.length > 4) {
  const vals = hist.map(h => h[1]);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = Math.max(1, hi - lo);
  x.beginPath();
  hist.forEach((h, i) => {
    const hx = 160 + i / (hist.length - 1) * 880;
    const hy = 505 - ((h[1] - lo) / span) * 70;
    i ? x.lineTo(hx, hy) : x.moveTo(hx, hy);
  });
  x.strokeStyle = 'rgba(139,155,176,0.55)'; x.lineWidth = 2; x.stroke();
  const ly = 505 - ((vals[vals.length - 1] - lo) / span) * 70;
  x.fillStyle = '#F2EBD6'; x.beginPath(); x.arc(1040, ly, 5, 0, 6.283); x.fill();
  const hrs = Math.round((hist[hist.length - 1][0] - hist[0][0]) / 3600000);
  x.fillStyle = '#3E4C66'; x.font = '15px PlexMono, monospace';
  x.fillText(`${bestCode.split('.')[1]} · GROUND HUM, LAST ${hrs}H`, W / 2, 545);
}

const d = new Date(j.generated);
x.fillStyle = '#5A6A80'; x.font = '17px PlexMono, monospace';
x.fillText(`THE QUIET MAP · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`, W / 2, 598);

fs.writeFileSync('og.png', cv.toBuffer('image/png'));
console.log('og.png written:', name, `(${still}% still)`);
