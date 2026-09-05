// Tracks whether `/map` has been reached via the app's own client-side search flow
// at least once in this document's lifetime — the signal MapView needs to tell a
// real browser refresh apart from client-side navigation (including back/forward,
// which never re-executes this module's top-level code within the same session).
//
// Deliberately an in-memory flag, not sessionStorage: a hard refresh re-runs this
// module from scratch, resetting it to false exactly when it should be, whereas
// sessionStorage would survive the refresh and need explicit clearing — which would
// also have to un-set itself on first read, breaking the browser's forward button
// (going /map -> back -> forward would find the flag already consumed and
// incorrectly redirect). Never cleared once set, so every navigation to /map within
// the same session after the first stays a normal client-side one.
let clientNavigatedToMap = false;

export function markMapClientNavigation() {
  clientNavigatedToMap = true;
}

export function wasMapReachedByClientNavigation() {
  return clientNavigatedToMap;
}
