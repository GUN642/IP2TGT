// Cockpit-Rahmen (Scheibenstreben, Glareshield, Instrumententafel) als SVG-Overlay.
// Koordinaten im viewBox 1600x900 = Sichtfeld bei Kopf geradeaus; Rahmen reicht
// weit über den Rand hinaus, damit beim Umsehen nichts abreißt.

const MFD = (x, y, w, h) => `
  <g>
    <rect x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 12}" rx="8" fill="#0b0c0e" stroke="#2a2d31" stroke-width="2"/>
    <rect class="mfd" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>
    <g class="mfd-lines" stroke-width="2" fill="none">
      <line x1="${x + w * 0.1}" y1="${y + h * 0.55}" x2="${x + w * 0.9}" y2="${y + h * 0.5}"/>
      <circle cx="${x + w / 2}" cy="${y + h * 0.52}" r="${h * 0.22}"/>
      <line x1="${x + w * 0.2}" y1="${y + h * 0.15}" x2="${x + w * 0.8}" y2="${y + h * 0.15}"/>
      <line x1="${x + w * 0.2}" y1="${y + h * 0.88}" x2="${x + w * 0.55}" y2="${y + h * 0.88}"/>
    </g>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="${x - 4 + (w / 5) * i + 6}" y="${y + h + 8}" width="${w / 5 - 12}" height="6" rx="2" fill="#2b2e33"/>`).join("")}
  </g>`;

function frame(style) {
  const ch47 = style === "ch47";
  const panelTop = ch47 ? 650 : 625;
  const post = ch47 ? 545 : 510; // Mittelstrebe (Pilot sitzt rechts)
  const side = ch47 ? 1470 : 1430;
  return `
  <defs>
    <linearGradient id="cpFrameGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--frame-hi)"/>
      <stop offset="1" stop-color="var(--frame-lo)"/>
    </linearGradient>
    <linearGradient id="cpPanelGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--panel-hi)"/>
      <stop offset="1" stop-color="var(--panel-lo)"/>
    </linearGradient>
  </defs>
  <g id="frame">
    <!-- Dachkonsole / oberer Rahmen -->
    <path fill="url(#cpFrameGrad)" d="M-1600 -900 L3200 -900 L3200 ${ch47 ? 40 : 60}
      Q 2400 ${ch47 ? 70 : 95} 1600 ${ch47 ? 55 : 75} Q 800 ${ch47 ? 20 : 30} 0 ${ch47 ? 55 : 75}
      Q -800 ${ch47 ? 70 : 95} -1600 ${ch47 ? 40 : 60} Z"/>
    <!-- Mittelstrebe -->
    <path fill="url(#cpFrameGrad)" d="M${post - 20} 0 L${post + 20} 0 L${post + 34} ${panelTop} L${post - 34} ${panelTop} Z"/>
    <!-- Magnetkompass an der Mittelstrebe -->
    <rect x="${post - 30}" y="${ch47 ? 70 : 92}" width="60" height="42" rx="6" fill="#111" stroke="#333" stroke-width="2"/>
    <rect x="${post - 20}" y="${ch47 ? 80 : 102}" width="40" height="22" rx="3" fill="#2e2a1e"/>
    <!-- rechte Seitenstrebe -->
    <path fill="url(#cpFrameGrad)" d="M${side} 0 L${side + 70} 0 L${side + 150} ${panelTop + 40} L${side + 40} ${panelTop + 40} Z"/>
    <!-- linke (Copilot-)Seitenstrebe -->
    <path fill="url(#cpFrameGrad)" d="M${post - 900} 0 L${post - 830} 0 L${post - 760} ${panelTop + 40} L${post - 880} ${panelTop + 40} Z"/>
    <!-- Türrahmen rechts -->
    <path fill="url(#cpFrameGrad)" d="M${side + 420} -900 L3200 -900 L3200 1800 L${side + 360} 1800 L${side + 470} ${panelTop - 60} Z"/>
    <!-- Glareshield + Instrumententafel -->
    <path fill="url(#cpPanelGrad)" d="M-1600 1800 L-1600 ${panelTop + 70}
      Q -400 ${panelTop + 40} ${post - 120} ${panelTop + 18}
      Q ${post + 300} ${panelTop - 22} ${side - 180} ${panelTop + 4}
      Q ${side + 80} ${panelTop + 18} ${side + 420} ${panelTop + 70}
      L3200 ${panelTop + 120} L3200 1800 Z"/>
    <path fill="none" stroke="#000" stroke-opacity="0.5" stroke-width="4" d="M-1600 ${panelTop + 70}
      Q -400 ${panelTop + 40} ${post - 120} ${panelTop + 18}
      Q ${post + 300} ${panelTop - 22} ${side - 180} ${panelTop + 4}
      Q ${side + 80} ${panelTop + 18} ${side + 420} ${panelTop + 70}"/>
    ${MFD(post + 330, panelTop + 70, 210, 165)}
    ${MFD(post + 590, panelTop + 70, 210, 165)}
    ${MFD(post - 330, panelTop + 85, 200, 155)}
    ${MFD(post - 80, panelTop + 85, 200, 155)}
    <!-- Zyklischer Steuerknüppel (angedeutet) -->
    <path fill="#0d0e10" d="M${post + 520} 1800 L${post + 560} ${panelTop + 290} Q ${post + 575} ${panelTop + 255} ${post + 600} ${panelTop + 290} L${post + 640} 1800 Z"/>
  </g>`;
}

export function mountCockpit(svg, style) {
  svg.setAttribute("viewBox", "0 0 1600 900");
  svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
  svg.innerHTML = frame(style);
}

/** Rahmen entsprechend Kopfbewegung verschieben. pxPerDegVB = viewBox-Pixel pro Grad */
// Der Rahmen ist fest mit dem Luftfahrzeug verbunden, daher nur Kopfbewegung (keine Rolllage).
export function moveCockpit(svg, yawDeg, pitchDeg, pxPerDegVB) {
  const g = svg.querySelector("#frame");
  if (!g) return;
  const dx = -yawDeg * pxPerDegVB;
  const dy = pitchDeg * pxPerDegVB;
  g.setAttribute("transform", `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`);
}
