// Owner-fork test loader (BL-002). Registered as a Lovelace resource; costs
// ~1 KB on every dashboard and only imports the fork bundle (which defines
// <camera-gallery-card-fork>) when an admin opens the hidden test dashboard.
const TEST_PATH = "/cgc-fork-test";
const BUNDLE = new URL("./camera-gallery-card-fork.js", import.meta.url);
BUNDLE.search = new URL(import.meta.url).search; // same ?v= cache-bust as the loader
let loading = null;
const maybeLoad = () => {
  if (loading || !location.pathname.startsWith(TEST_PATH)) return;
  loading = import(BUNDLE.href).catch((err) => {
    loading = null;
    console.error("cgc-fork-loader: failed to load the fork bundle", err);
  });
};
maybeLoad();
window.addEventListener("location-changed", maybeLoad);
window.addEventListener("popstate", maybeLoad);
