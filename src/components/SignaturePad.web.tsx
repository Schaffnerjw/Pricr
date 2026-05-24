import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Web signature pad: a real HTML5 <canvas> with pointer drawing. Mirrors the imperative API of
// react-native-signature-canvas (readSignature / clearSignature) and the callback props
// ClosingCard relies on, so the rest of the app doesn't branch on platform. DOM is only touched
// inside effects/handlers (never at render) so static prerendering stays safe.
type Props = {
  onOK?: (signature: string) => void;
  onEmpty?: () => void;
  onBegin?: () => void;
  onEnd?: () => void;
  penColor?: string;
  backgroundColor?: string;
  // Accepted for API parity with the native lib; unused on web.
  autoClear?: boolean;
  descriptionText?: string;
  webStyle?: string;
};

export default forwardRef<any, Props>(function SignaturePad(
  { onOK, onEmpty, onBegin, onEnd, penColor = "#0A0E1A", backgroundColor = "#FFFFFF" }: Props,
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useImperativeHandle(ref, () => ({
    readSignature: () => {
      const c = canvasRef.current;
      if (!c || !hasInk.current) { onEmpty?.(); return; }
      onOK?.(c.toDataURL("image/png"));
    },
    clearSignature: () => {
      const c = canvasRef.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, c.width, c.height);
      hasInk.current = false;
    },
  }));

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const ctx = () => c.getContext("2d");

    const paintBg = () => {
      const g = ctx();
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.lineWidth = 2.5; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = penColor;
      g.fillStyle = backgroundColor;
      g.fillRect(0, 0, c.width / dpr, c.height / dpr);
    };
    const resize = () => {
      const parent = c.parentElement;
      const w = parent?.clientWidth || c.clientWidth || 300;
      const h = parent?.clientHeight || 200;
      c.width = w * dpr; c.height = h * dpr;
      c.style.width = w + "px"; c.style.height = h + "px";
      paintBg();
      hasInk.current = false;
    };
    resize();

    const at = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const down = (e: PointerEvent) => {
      drawing.current = true; hasInk.current = true;
      const g = ctx(); const p = at(e);
      if (g) { g.beginPath(); g.moveTo(p.x, p.y); }
      onBegin?.();
      try { c.setPointerCapture(e.pointerId); } catch { /* not all browsers */ }
    };
    const move = (e: PointerEvent) => {
      if (!drawing.current) return;
      const g = ctx(); const p = at(e);
      if (g) { g.lineTo(p.x, p.y); g.stroke(); }
    };
    const up = () => { if (!drawing.current) return; drawing.current = false; onEnd?.(); };

    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("resize", resize);
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("resize", resize);
    };
  }, [penColor, backgroundColor]);

  return createElement("canvas", { ref: canvasRef, style: { width: "100%", height: "100%", display: "block", touchAction: "none" } });
});
