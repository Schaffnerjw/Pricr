// Native signature pad — the finger-draw canvas backed by react-native-signature-canvas.
// The web build resolves SignaturePad.web.tsx instead (an HTML5 <canvas>), keeping the same
// ref API (readSignature / clearSignature) and props so ClosingCard is platform-agnostic.
export { default } from "react-native-signature-canvas";
