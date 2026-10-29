// Script inline scritti a mano (is:inline). Stanno qui perché astro.config.mjs ne calcola l'hash
// per la CSP: se cambi il testo, l'hash si aggiorna da solo (ADR-060).

/** L'ingresso animato del FAB si vede solo alla prima pagina della sessione (va eseguito prima del render). */
export const DOCK_SEEN_SCRIPT =
  "try{if(sessionStorage.getItem('kuf-dock-seen'))document.documentElement.classList.add('dock-seen')}catch(e){}";
