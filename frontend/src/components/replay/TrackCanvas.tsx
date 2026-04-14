import { useEffect, useRef, type RefObject } from 'react';
import type { Frame, Track } from '../../types/api';
import type { InterpolationState } from '../../hooks/useReplayPlayback';

interface TrackCanvasProps {
  track: Track;
  circuitRotation: number;
  frames: Frame[];
  driverColors: Record<string, string>;
  interpRef: RefObject<InterpolationState>;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export default function TrackCanvas({
  track,
  circuitRotation,
  frames,
  driverColors,
  interpRef,
}: TrackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackImageRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | undefined>(undefined);

  const padding = 40;
  const rad = (circuitRotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const cx = track.x_min + (track.x_max - track.x_min) / 2;
  const cy = track.y_min + (track.y_max - track.y_min) / 2;
  const rangeX = track.x_max - track.x_min || 1;
  const rangeY = track.y_max - track.y_min || 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !track) return;

    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width;
    canvas.height = height;

    const scale = Math.min(
      (width - padding * 2) / rangeX,
      (height - padding * 2) / rangeY
    );

    const toCanvas = (x: number, y: number) => {
      const dx = x - cx;
      const dy = y - cy;
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      return { x: width / 2 + rx * scale, y: height / 2 - ry * scale };
    };

    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext('2d')!;

    // Outer boundary
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < track.outer_x.length; i++) {
      const { x, y } = toCanvas(track.outer_x[i], track.outer_y[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // Inner boundary
    ctx.beginPath();
    for (let i = 0; i < track.inner_x.length; i++) {
      const { x, y } = toCanvas(track.inner_x[i], track.inner_y[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // DRS zones
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
    ctx.lineWidth = 2;
    track.drs_zones.forEach((zone) => {
      ctx.beginPath();
      const s = toCanvas(zone.start.x, zone.start.y);
      const e = toCanvas(zone.end.x, zone.end.y);
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    trackImageRef.current = offscreen;
  }, [track, circuitRotation, cx, cy, rangeX, rangeY, cos, sin, padding]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !track || frames.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    const scale = Math.min(
      (w - padding * 2) / rangeX,
      (h - padding * 2) / rangeY
    );

    const toCanvas = (x: number, y: number) => {
      const dx = x - cx;
      const dy = y - cy;
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      return { x: w / 2 + rx * scale, y: h / 2 - ry * scale };
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      if (trackImageRef.current) {
        ctx.drawImage(trackImageRef.current, 0, 0);
      }

      const { indexA, indexB, alpha } = interpRef.current;
      const frameA = frames[indexA];
      const frameB = frames[indexB];
      if (!frameA?.drivers) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const driversA = frameA.drivers;
      const driversB = frameB?.drivers ?? driversA;

      for (const code of Object.keys(driversA)) {
        const a = driversA[code];
        const b = driversB[code] ?? a;

        const worldX = lerp(a.x, b.x, alpha);
        const worldY = lerp(a.y, b.y, alpha);
        const { x: px, y: py } = toCanvas(worldX, worldY);

        const color = driverColors[code] || '#888';

        // Glow effect
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    };
  }, [track, circuitRotation, frames, driverColors, interpRef, cx, cy, rangeX, rangeY, cos, sin, padding]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}
