// HUD-Symbologie (an ANVIS/HUD- bzw. DNVS-Darstellungen angelehnt) auf einem 2D-Canvas.

import { fmtCourse, fmtTime, norm180, NM, FT, KT } from "./geo.js";

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = 1;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.dpr = dpr;
    return { w, h };
  }

  clear() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * d: { st (Flugzustand), view, nvg, ralt, altMsl, vs, ete, bearingTgt, pxPerDeg, headYaw, headPitch,
   *      tgtScreen, ipScreen, fpvScreen, message, full }
   */
  draw(d) {
    const { w, h } = this.resize();
    const c = this.ctx;
    this.clear();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const col = d.nvg ? "rgba(190,255,170,0.95)" : "rgba(80,255,120,0.95)";
    const shadow = d.nvg ? "rgba(120,255,120,0.6)" : "rgba(0,0,0,0.85)";
    c.strokeStyle = col;
    c.fillStyle = col;
    c.lineWidth = 1.6;
    c.shadowColor = shadow;
    c.shadowBlur = d.nvg ? 6 : 3;
    const scale = Math.max(0.75, Math.min(1.25, Math.min(w, h) / 820));
    const font = (px, weight = 600) =>
      `${weight} ${Math.round(px * scale)}px "JetBrains Mono", ui-monospace, monospace`;
    c.textBaseline = "middle";
    const st = d.st;
    const cx = w / 2,
      cy = h * (d.full ? 0.47 : 0.5);

    // Tote Zone für Instrumententafel im Cockpit
    const top = d.full ? Math.max(18, h * 0.07) : 64;

    // -------- Kursband ----------------------------------------------------
    const showTape = d.full || w > 700;
    const tapeW = Math.min(w * 0.5, 620 * scale);
    const tapeX = cx - tapeW / 2,
      tapeY = top + 24 * scale;
    const span = 50; // Grad sichtbar
    const ppd = tapeW / span;
    const hdg = st.heading + (d.headYaw || 0);
    c.font = font(12);
    c.textAlign = "center";
    if (showTape) {
      c.beginPath();
      for (let deg = Math.floor((hdg - span / 2) / 5) * 5; deg <= hdg + span / 2; deg += 5) {
        const x = cx + norm180(deg - hdg) * ppd;
        if (x < tapeX - 1 || x > tapeX + tapeW + 1) continue;
        const major = ((deg % 10) + 10) % 10 === 0;
        c.moveTo(x, tapeY);
        c.lineTo(x, tapeY - (major ? 10 : 5) * scale);
        if (major) {
          const v = ((deg % 360) + 360) % 360;
          const lbl = { 0: "N", 90: "E", 180: "S", 270: "W" }[v] ?? String(v / 10).padStart(2, "0");
          c.fillText(lbl, x, tapeY - 20 * scale);
        }
      }
      c.stroke();
      // Kurs zum TGT (Bug)
      if (d.bearingTgt != null && st.distToGo > 20) {
        const off = norm180(d.bearingTgt - hdg);
        const x = cx + Math.max(-span / 2, Math.min(span / 2, off)) * ppd;
        c.beginPath();
        c.moveTo(x, tapeY + 2);
        c.lineTo(x - 6 * scale, tapeY + 11 * scale);
        c.lineTo(x + 6 * scale, tapeY + 11 * scale);
        c.closePath();
        Math.abs(off) <= span / 2 ? c.fill() : c.stroke();
      }
      // Zentrierte Kursanzeige
      c.font = font(16, 700);
      const bw = 58 * scale,
        bh = 24 * scale;
      c.clearRect(cx - bw / 2, tapeY + 14 * scale, bw, bh);
      c.strokeRect(cx - bw / 2, tapeY + 14 * scale, bw, bh);
      c.fillText(fmtCourse(hdg), cx, tapeY + 14 * scale + bh / 2 + 1);
    }

    // -------- Geschwindigkeit links / Höhen rechts --------------------------
    const sideY = cy;
    const leftX = cx - Math.min(w * 0.3, 380 * scale);
    const rightX = cx + Math.min(w * 0.3, 380 * scale);
    c.font = font(20, 700);
    c.textAlign = "right";
    c.fillText(String(Math.round(st.gs / KT)).padStart(3, " "), leftX, sideY);
    c.font = font(11);
    c.fillText("GS KT", leftX, sideY + 20 * scale);
    if (d.vs != null) {
      c.font = font(13);
      c.fillText(`${d.vs >= 0 ? "↑" : "↓"}${Math.abs(Math.round(d.vs / 10) * 10)}`, leftX, sideY + 46 * scale);
      c.font = font(10);
      c.fillText("FPM", leftX, sideY + 62 * scale);
    }

    // Radarhöhe: Zahl + analoger Balken (0–200 ft)
    c.textAlign = "left";
    c.font = font(20, 700);
    const raltFt = Math.max(0, d.ralt / FT);
    c.fillText(`R${Math.round(raltFt)}`, rightX, sideY);
    c.font = font(11);
    c.fillText("RALT FT", rightX, sideY + 20 * scale);
    c.font = font(13);
    if (d.altMsl != null) c.fillText(`${Math.round(d.altMsl / FT)}`, rightX, sideY + 46 * scale);
    c.font = font(10);
    if (d.altMsl != null) c.fillText("MSL FT", rightX, sideY + 62 * scale);
    const barX = rightX - 16 * scale,
      barH = 130 * scale,
      barTop = sideY - barH / 2 - 10 * scale;
    c.beginPath();
    c.moveTo(barX, barTop);
    c.lineTo(barX, barTop + barH);
    for (let f = 0; f <= 200; f += 50) {
      const y = barTop + barH - (f / 200) * barH;
      c.moveTo(barX - 5 * scale, y);
      c.lineTo(barX, y);
    }
    c.stroke();
    const fill = (Math.min(raltFt, 200) / 200) * barH;
    c.fillRect(barX + 2, barTop + barH - fill, 4 * scale, fill);
    // Sollhöhe
    if (d.aglCmdFt != null) {
      const y = barTop + barH - (Math.min(d.aglCmdFt, 200) / 200) * barH;
      c.beginPath();
      c.moveTo(barX - 10 * scale, y - 4 * scale);
      c.lineTo(barX - 4 * scale, y);
      c.lineTo(barX - 10 * scale, y + 4 * scale);
      c.stroke();
    }

    // -------- Horizont / Nicklage (nur bei Blick nach vorn) ------------------
    if (d.full && d.pxPerDeg && Math.abs(d.headYaw || 0) < 25) {
      const ppd = d.pxPerDeg;
      // Projektion der Rumpflängsachse (Wasserlinie)
      const ox = cx - (d.headYaw || 0) * ppd;
      const oy = cy + (d.headPitch || 0) * ppd;
      c.save();
      c.translate(ox, oy);
      c.rotate((-st.roll * Math.PI) / 180);
      const hy = st.pitch * ppd;
      const gap = 60 * scale,
        len = 120 * scale;
      c.beginPath();
      c.moveTo(-gap - len, hy);
      c.lineTo(-gap, hy);
      c.moveTo(gap, hy);
      c.lineTo(gap + len, hy);
      c.stroke();
      for (const p of [-10, -5, 5, 10]) {
        const y = hy - p * ppd;
        const l = 26 * scale,
          g2 = gap + 20 * scale;
        c.setLineDash(p < 0 ? [5, 4] : []);
        c.beginPath();
        c.moveTo(-g2 - l, y);
        c.lineTo(-g2, y);
        c.lineTo(-g2, y + (p > 0 ? 6 : -6) * scale);
        c.moveTo(g2 + l, y);
        c.lineTo(g2, y);
        c.lineTo(g2, y + (p > 0 ? 6 : -6) * scale);
        c.stroke();
        c.setLineDash([]);
        c.font = font(10);
        c.textAlign = "right";
        c.fillText(String(Math.abs(p)), -g2 - l - 4, y);
      }
      c.restore();
      // Wasserlinien-Symbol
      c.beginPath();
      c.moveTo(ox - 28 * scale, oy);
      c.lineTo(ox - 10 * scale, oy);
      c.lineTo(ox - 5 * scale, oy + 7 * scale);
      c.lineTo(ox, oy);
      c.lineTo(ox + 5 * scale, oy + 7 * scale);
      c.lineTo(ox + 10 * scale, oy);
      c.lineTo(ox + 28 * scale, oy);
      c.stroke();
    }

    // -------- Flugbahnvektor ------------------------------------------------
    if (d.fpvScreen && st.gs > 3) {
      const { x, y } = d.fpvScreen;
      const r = 7 * scale;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.moveTo(x - r, y);
      c.lineTo(x - r - 12 * scale, y);
      c.moveTo(x + r, y);
      c.lineTo(x + r + 12 * scale, y);
      c.moveTo(x, y - r);
      c.lineTo(x, y - r - 8 * scale);
      c.stroke();
    }

    // -------- LZ / IP Marker -----------------------------------------------
    const marker = (p, label, sub, shape) => {
      if (!p) return;
      const m = 30;
      const on = p.visible && p.x > m && p.x < w - m && p.y > m && p.y < h - m;
      if (on) {
        const s = shape === "box" ? 16 * scale : 10 * scale;
        c.beginPath();
        if (shape === "box") {
          c.rect(p.x - s, p.y - s, 2 * s, 2 * s);
          c.moveTo(p.x - s * 0.4, p.y);
          c.lineTo(p.x + s * 0.4, p.y);
          c.moveTo(p.x, p.y - s * 0.4);
          c.lineTo(p.x, p.y + s * 0.4);
        } else {
          c.moveTo(p.x, p.y - s);
          c.lineTo(p.x + s, p.y);
          c.lineTo(p.x, p.y + s);
          c.lineTo(p.x - s, p.y);
          c.closePath();
        }
        c.stroke();
        c.font = font(12, 700);
        c.textAlign = "left";
        c.fillText(label, p.x + s + 6, p.y - 7 * scale);
        if (sub) {
          c.font = font(11);
          c.fillText(sub, p.x + s + 6, p.y + 8 * scale);
        }
      } else {
        // Richtungspfeil am Rand
        const dx = p.x - cx,
          dy = p.y - cy;
        const ang = Math.atan2(dy, dx);
        const rx = w / 2 - 50,
          ry = h / 2 - 70;
        const k = Math.min(Math.abs(rx / Math.cos(ang)), Math.abs(ry / Math.sin(ang)));
        const ex = cx + Math.cos(ang) * k,
          ey = cy + Math.sin(ang) * k;
        c.save();
        c.translate(ex, ey);
        c.rotate(ang);
        c.beginPath();
        c.moveTo(12 * scale, 0);
        c.lineTo(-6 * scale, -8 * scale);
        c.lineTo(-6 * scale, 8 * scale);
        c.closePath();
        c.fill();
        c.restore();
        c.font = font(11, 700);
        c.textAlign = "center";
        c.fillText(label, ex - Math.cos(ang) * 26, ey - Math.sin(ang) * 22);
      }
    };
    if (st.distToIP > 30) marker(d.ipScreen, "IP", `${(st.distToIP / NM).toFixed(1)}`, "diamond");
    marker(d.tgtScreen, "LZ", st.distToGo > 50 ? `${(st.distToGo / NM).toFixed(2)} NM` : null, "box");

    // -------- Unten: Distanz / Zeit / Phase ----------------------------------
    const by = d.full ? h * 0.66 : h - (w < 860 ? 250 : 120);
    c.textAlign = "center";
    c.font = font(15, 700);
    const dist = st.distToGo / NM;
    c.fillText(`TGT ${dist >= 10 ? dist.toFixed(1) : dist.toFixed(2)} NM   ${fmtTime(d.ete)}`, cx, by);
    c.font = font(12);
    c.fillText(st.phase, cx, by + 20 * scale);
    if (d.message) {
      c.font = font(22, 800);
      c.fillText(d.message, cx, cy - 90 * scale);
    }
  }
}
