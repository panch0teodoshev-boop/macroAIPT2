// API за собствените диалози (без JSX, за да се ползва и от обикновени .js модули).
let show = null;
const pending = [];
function open(kind, opts) {
  return new Promise((resolve) => {
    const d = { kind, ...opts, resolve };
    if (show) show((q) => [...q, d]); else pending.push(d);
  });
}
/** @returns {Promise<boolean>} */
export const confirmDialog = (opts) => open("confirm", opts);
/** @returns {Promise<string|null>} null при отказ */
export const promptDialog = (opts) => open("prompt", opts);
/** @returns {Promise<void>} */
export const alertDialog = (opts) => open("alert", opts);
export function attachHost(setter) {
  show = setter;
  if (pending.length) setter((q) => [...q, ...pending.splice(0)]);
  return () => { if (show === setter) show = null; };
}
