const UKRAINE_BORDER_PATH =
  "M309.7 18.2 L302.5 22.9 L289.5 19.6 L289.3 26.6 L282.6 30.8 L266.1 26.7 L261.7 30.5 L254.2 28.7 L243.3 46.9 L247.0 55.2 L244.8 59.6 L235.3 50.1 L225.8 52.8 L223.8 49.5 L214.2 55.2 L209.1 44.7 L201.8 48.4 L200.1 53.7 L197.8 48.1 L190.3 49.2 L188.0 43.9 L182.7 48.2 L177.6 45.8 L175.5 51.6 L173.3 50.0 L174.7 46.7 L162.7 46.8 L161.9 40.5 L155.5 41.9 L126.7 33.8 L92.2 36.4 L90.6 41.3 L82.6 47.6 L74.7 44.9 L74.0 58.5 L86.3 74.0 L81.6 76.8 L84.5 79.8 L84.4 87.6 L64.9 102.5 L49.1 123.7 L51.7 130.0 L50.8 136.9 L55.3 139.8 L55.3 143.1 L47.0 140.4 L41.7 155.1 L37.5 158.7 L36.8 165.4 L39.9 165.3 L47.9 176.5 L53.7 176.1 L55.4 182.1 L62.3 176.0 L70.2 181.6 L71.1 179.6 L88.3 184.3 L96.7 181.6 L104.6 190.7 L110.2 189.6 L115.0 183.6 L136.6 180.7 L140.3 173.6 L147.4 171.6 L148.8 167.1 L152.2 169.5 L150.0 165.2 L163.8 166.7 L164.6 164.0 L167.8 165.3 L171.1 162.2 L183.2 168.6 L183.6 171.7 L190.2 171.4 L189.0 175.3 L192.0 174.1 L193.5 178.0 L195.7 173.7 L202.2 175.8 L204.3 181.9 L210.4 180.7 L213.1 184.6 L210.0 200.5 L214.0 200.9 L216.7 206.7 L220.3 203.8 L219.9 219.1 L230.0 223.8 L227.7 234.4 L234.8 239.3 L228.1 241.6 L224.4 237.1 L221.0 241.5 L214.8 235.9 L212.1 240.7 L211.9 233.9 L204.4 237.7 L204.9 245.0 L207.8 247.4 L205.6 254.5 L200.6 255.7 L200.8 260.9 L194.3 264.4 L194.2 273.2 L189.0 271.5 L186.7 274.4 L195.3 282.5 L200.7 282.9 L201.1 279.3 L204.7 281.3 L216.7 275.3 L222.2 279.2 L223.2 284.6 L229.6 285.5 L234.0 289.5 L239.4 288.8 L242.4 279.4 L238.5 275.4 L232.6 275.6 L232.4 273.0 L241.5 265.2 L259.4 239.5 L266.4 251.6 L299.3 261.1 L287.5 270.4 L285.8 281.0 L290.0 285.9 L300.7 286.2 L312.2 294.0 L307.4 309.6 L311.8 316.1 L320.1 321.1 L335.4 320.2 L347.7 307.2 L358.6 306.7 L369.8 297.3 L375.5 299.4 L391.1 296.6 L394.0 294.0 L392.0 284.4 L395.3 278.4 L395.4 268.5 L373.6 267.9 L368.4 273.6 L358.0 257.2 L375.1 239.4 L383.3 243.2 L391.2 235.1 L399.4 237.4 L406.0 229.1 L413.4 228.6 L418.9 223.9 L431.8 222.7 L436.7 218.3 L433.9 213.0 L436.5 207.6 L433.8 206.2 L435.3 197.4 L437.0 194.7 L447.4 192.1 L449.1 185.5 L471.2 186.8 L472.2 179.0 L474.8 178.9 L478.2 171.0 L477.4 168.7 L473.8 169.0 L476.4 167.3 L474.0 159.4 L469.3 157.9 L472.7 149.2 L477.1 151.0 L479.7 148.2 L473.4 147.6 L469.6 141.9 L476.1 141.3 L483.1 134.1 L478.4 126.5 L481.9 122.3 L481.0 120.5 L472.9 122.7 L468.1 116.1 L460.0 115.3 L457.4 110.4 L451.3 113.8 L445.3 106.0 L440.4 107.6 L436.1 103.0 L432.7 103.3 L433.8 107.0 L429.1 110.0 L419.4 99.7 L415.7 89.3 L400.4 93.7 L394.9 98.2 L389.6 94.0 L386.2 95.4 L381.1 89.6 L369.7 93.2 L363.9 84.7 L366.5 81.1 L362.3 71.1 L364.3 67.4 L357.9 66.1 L358.0 60.9 L349.7 62.9 L345.9 60.0 L335.3 59.3 L337.9 56.0 L335.0 53.7 L337.2 49.9 L331.5 44.5 L340.4 41.0 L331.9 31.9 L330.9 24.6 L325.2 18.6 L318.7 20.9 L309.7 18.2 Z";

const VIEWBOX = { width: 520, height: 340, margin: 18 };

const GEO_BOUNDS = {
  minLon: 22.137691099999977,
  maxLon: 40.22758009999997,
  minLat: 44.184598,
  maxLat: 52.379147300000035,
};

export interface UkraineRadarSignal {
  id: string;
  tenderUid: string;
  city: string;
  region: string;
  lat: number;
  lon: number;
  severity: "low" | "medium" | "high" | "critical";
  score: number;
  title: string;
  tenderId: string | null;
  buyerName: string | null;
  createdAt: Date;
  isNew: boolean;
}

const signalColors = {
  low: "#34d399",
  medium: "#fde047",
  high: "#fb923c",
  critical: "#f43f5e",
};

function projectGeoPoint(props: { lon: number; lat: number }) {
  const midLat = (GEO_BOUNDS.minLat + GEO_BOUNDS.maxLat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const minX = GEO_BOUNDS.minLon * cosLat;
  const maxX = GEO_BOUNDS.maxLon * cosLat;
  const minY = GEO_BOUNDS.minLat;
  const maxY = GEO_BOUNDS.maxLat;
  const scale = Math.min(
    (VIEWBOX.width - VIEWBOX.margin * 2) / (maxX - minX),
    (VIEWBOX.height - VIEWBOX.margin * 2) / (maxY - minY),
  );
  const shapeWidth = (maxX - minX) * scale;
  const shapeHeight = (maxY - minY) * scale;
  const offsetX = (VIEWBOX.width - shapeWidth) / 2;
  const offsetY = (VIEWBOX.height - shapeHeight) / 2;

  return {
    x: offsetX + (props.lon * cosLat - minX) * scale,
    y: offsetY + (maxY - props.lat) * scale,
  };
}

export function UkraineRadarMap(props: { signals: UkraineRadarSignal[] }) {
  return (
    <svg
      className="absolute inset-[17%] h-[66%] w-[66%] overflow-visible drop-shadow-[0_0_22px_rgba(34,197,94,0.45)]"
      viewBox="0 0 520 340"
      role="img"
      aria-label="Контур України на радарі ризиків"
    >
      <path
        d={UKRAINE_BORDER_PATH}
        fill="none"
        stroke="rgba(34, 197, 94, 0.42)"
        strokeWidth="8"
      />
      <path
        d={UKRAINE_BORDER_PATH}
        fill="rgba(22, 163, 74, 0.18)"
        stroke="rgba(134, 239, 172, 0.92)"
        strokeWidth="3"
      />
      {props.signals.map((signal) => {
        const point = projectGeoPoint(signal);
        const color = signalColors[signal.severity];
        const radius = Math.max(5, Math.min(8, signal.score / 12));
        const pulseRadius = Math.max(12, Math.min(20, signal.score / 5));
        const opacity = Math.max(0.58, Math.min(1, signal.score / 100 + 0.2));

        return (
          <g key={signal.id}>
            <a
              aria-label={`Відкрити аналіз закупівлі ${signal.tenderId ?? signal.tenderUid}`}
              href={`#procurement-${signal.tenderUid}`}
            >
              <title>{`${signal.city}: ${signal.title}`}</title>
              {signal.isNew && (
                <circle
                  className="radar-signal-pulse"
                  cx={point.x}
                  cy={point.y}
                  r={pulseRadius}
                  fill={color}
                />
              )}
              <circle
                cx={point.x}
                cy={point.y}
                r={radius}
                fill={color}
                opacity={opacity}
                stroke="rgba(2, 6, 23, 0.72)"
                strokeWidth="1.5"
                style={{
                  filter: `drop-shadow(0 0 ${Math.max(6, Math.round(signal.score / 6))}px ${color})`,
                }}
              />
            </a>
          </g>
        );
      })}
    </svg>
  );
}
