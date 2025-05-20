/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global browser */
async function sendUnblockedTrackersUpdate() {
  const unblockedTrackers = await browser.experiments.webcompatDebugger.getUnblockedTrackers();
  browser.runtime.sendMessage({
    msg: "unblocked-trackers",
    unblockedTrackers,
  });
}

async function handleMessage(request) {
  switch (request.msg) {
    case "fetch-initial-trackers": {
      const trackingFlags = [1 << 12, 1 << 6, 1 << 11, 1 << 14, 1 << 16, 1 << 22, 1 << 2];
      const trackers = await browser.experiments.webcompatDebugger.getContentBlockingLog(request.tabId);
      const regexTrackers = Object.entries(JSON.parse(trackers))
        .filter(([_, flags]) => flags.some(el =>
          trackingFlags.includes(el[0])
        ))
        .map(([tracker, _]) => {
          // might be useful to keep flags so we know which preference to add it to
          console.log(tracker)
          const { hostname } = new URL(tracker);
          return `*://${hostname}/*`;
        })
      browser.runtime.sendMessage({
        msg: "initial-trackers",
        trackers: regexTrackers
      });
    }
    case "get-unblocked-trackers": {
      // Fetch and send the list of unblocked trackers
      await sendUnblockedTrackersUpdate();
      return;
    }
    case "toggle-tracker": {
      // Toggle the blocked status of a single tracker
      const { tracker, blocked, tabId } = request;

      await browser.experiments.webcompatDebugger.updateTrackingSkipURLs(
        [tracker],
        blocked
      );

      await sendUnblockedTrackersUpdate();
      browser.tabs.reload(tabId, { bypassCache: true });
      return;
    }
    case "update-all-trackers": {
      const { allTrackers, blocked, tabId } = request;

      await browser.experiments.webcompatDebugger.updateTrackingSkipURLs(
        Array.from(allTrackers),
        blocked
      );

      await sendUnblockedTrackersUpdate();
      browser.tabs.reload(tabId, { bypassCache: true });
      return;
    }
    case "reset": {
      await browser.experiments.webcompatDebugger.clearPreference();
      return;
    }
    default:
      console.error("Unknown message:", request);
  }
}

browser.runtime.onMessage.addListener(handleMessage);

// Listen for blocked requests and send them to the content script
browser.experiments.webcompatDebugger.blockedRequestObserver.addListener(({ url }) => {
  const { hostname } = new URL(url);
  const tracker = `*://${hostname}/*`;
  browser.runtime.sendMessage({
    msg: "blocked-request",
    tracker
  });
})

