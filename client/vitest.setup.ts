import '@testing-library/jest-dom/vitest';

// Polyfill ResizeObserver for Radix UI components in jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Node 25 exposes a built-in localStorage stub (behind --localstorage-file) that
// shadows jsdom's implementation. When the flag has no valid path the object exists
// but its methods are not functions, breaking any code that calls getItem/setItem/etc.
// Ensure a spec-compliant in-memory Storage is always available.
if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, writable: true });
}
