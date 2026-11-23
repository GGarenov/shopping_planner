// Inline script for the root layout <head> (server-safe: no "use client"). Runs before hydration and keeps the
// browser's install event on window.__bip for the «Добави в телефона» button (lib/pwa/install.ts reads it).
export const INSTALL_CAPTURE_SCRIPT = `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bip=e;window.dispatchEvent(new Event('bip-change'));});window.addEventListener('appinstalled',function(){window.__bip=null;window.__bipInstalled=true;window.dispatchEvent(new Event('bip-change'));});`;
