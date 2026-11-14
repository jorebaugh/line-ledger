// Home-screen install and offline updates. Nothing here talks to anything but this site.

let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}

export const onInstallChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

const isAppleTouch = () => /iPhone|iPad|iPod/.test(navigator.platform || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function installState() {
  if (typeof window === 'undefined') return 'other';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) return 'installed';
  if (deferred) return 'prompt';
  if (isAppleTouch()) return 'ios';
  return 'other';
}

export async function promptInstall() {
  if (!deferred) return 'unavailable';
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  notify();
  return outcome;
}

export const INSTALL_HELP = {
  installed: 'Installed. It opens full screen and works with no signal.',
  prompt: 'Put it on your home screen. It opens full screen and works with no signal.',
  ios: "In Safari, tap Share, then Add to Home Screen. It opens full screen, works with no signal, and keeps your entries. Safari can clear a website's saved data after a week of not opening it.",
  other: "Use your browser's menu: Install app, or Add to Home Screen.",
};

// Offline cache. Skipped on this computer's own test server unless the address has ?sw.
export function registerOffline(onUpdate) {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  if (local && !/[?&]sw\b/.test(location.search)) return;
  // Reload only when the user asked for the new version, never on the first visit.
  let wantReload = false;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const apply = () => { wantReload = true; reg.waiting?.postMessage('skipWaiting'); };
    const waiting = () => { if (reg.waiting && navigator.serviceWorker.controller) onUpdate(apply); };
    waiting();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed') waiting(); });
    });
  }).catch(() => { /* offline support is a bonus; the app works without it */ });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!wantReload) return;
    wantReload = false;
    location.reload();
  });
}
