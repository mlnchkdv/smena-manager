import { createPointerRenderGate } from '../shared/pointer-render-gate.js';
import { render } from '../shell/render.js';

const gate = createPointerRenderGate();
document.addEventListener('pointerdown', () => gate.press(), true);
for (const event of ['pointerup', 'pointercancel']) document.addEventListener(event, () => gate.release(), true);
window.addEventListener('blur', () => gate.release());
export const backgroundRender = (callback = render) => gate.request(callback);
