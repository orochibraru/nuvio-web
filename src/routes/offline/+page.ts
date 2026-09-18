// Served by the service worker when a navigation fails for want of a network,
// so it has to work with no server at all : everything it shows comes from
// this device (IndexedDB + the Origin Private File System).
export const ssr = false;
