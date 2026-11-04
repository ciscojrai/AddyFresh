/**
 * PagosPop — NEW FILE, 2026-11-02, updated same day.
 *
 * Small Pagos video in a bubble for AddyFresh-MUSE.
 *
 * The video itself is NOT in this file. It must live at
 * public/pagos.mp4 (the 10-second, 1280x720 Pagos clip the user
 * supplied, 2.7 MB). The <video> below is muted, so it never
 * plays sound, and it only renders when `show` is true.
 *
 * Bubble, small on purpose (user correction: "small, in a bubble"):
 * - Both variants are a 56px circle, like a small chat avatar,
 *   with a white ring and a soft shadow.
 * - "inline": 56px circle, for searches and in PagosChat while
 *   Pagos is thinking. The parent decides where it sits.
 * - "run": 56px circle, fixed to the bottom of the screen, and
 *   animated left-to-right while the globe is updating.
 *   It disappears when `show` turns false.
 *
 * The source video is 16:9 with a light background and Pagos
 * centred, so object-fit: cover crops the empty sides and keeps
 * Pagos big enough to read at 56px.
 */

export type PagosPopVariant = "inline" | "run";

export interface PagosPopProps {
  /** Render nothing when false. Pagos only pops up on demand. */
  show: boolean;
  variant?: PagosPopVariant;
}

const bubbleStyle: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: "50%",
  overflow: "hidden",
  border: "2px solid #ffffff",
  boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
  background: "#dbeeff",
  flexShrink: 0,
};

const videoStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

export default function PagosPop({ show, variant = "inline" }: PagosPopProps) {
  if (!show) return null;

  if (variant === "run") {
    return (
      <>
        <style>{`@keyframes pagos-run-across { from { left: -70px; } to { left: 110vw; } }`}</style>
        <div
          className="pagos-pop pagos-pop-run"
          aria-hidden="true"
          style={{
            ...bubbleStyle,
            position: "fixed",
            bottom: 16,
            left: 0,
            zIndex: 50,
            animation: "pagos-run-across 6s linear infinite",
          }}
        >
          <video src="/pagos.mp4" muted playsInline autoPlay loop style={videoStyle} />
        </div>
      </>
    );
  }

  return (
    <div className="pagos-pop pagos-pop-inline" aria-hidden="true" style={bubbleStyle}>
      <video src="/pagos.mp4" muted playsInline autoPlay loop style={videoStyle} />
    </div>
  );
}
