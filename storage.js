// Заместител на вградения artifact storage с localStorage,
// за да работи приложението като обикновен уеб сайт (GitHub Pages и др.).
export function installStorage() {
  if (typeof window === "undefined") return;
  if (window.storage && typeof window.storage.get === "function") return; // вече е наличен (claude.ai)
  window.storage = {
    get: async (key) => {
      const v = localStorage.getItem(key);
      return v == null ? null : { key, value: v };
    },
    set: async (key, value) => {
      localStorage.setItem(key, value);
      return { key, value };
    },
    delete: async (key) => {
      localStorage.removeItem(key);
      return { key, deleted: true };
    },
    list: async (prefix = "") => ({
      keys: Object.keys(localStorage).filter((k) => k.startsWith(prefix)),
      prefix,
    }),
  };
}
