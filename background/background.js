/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global browser */
async function sendUnblockedTrackersUpdate(tabId) {
  const unblockedTrackers = await browser.experiments.webcompatDebugger.getUnblockedTrackers();
  console.assert(Array.isArray(unblockedTrackers), "unblockedTrackers should be an array");
  browser.runtime.sendMessage({
    msg: "unblocked-trackers",
    unblockedTrackers,
    tabId
  });
}

async function handleMessage(request) {
  console.assert(request && typeof request === "object", "Request should be an object");
  console.assert(request.msg, "Request must have a msg property");

  switch (request.msg) {
    case "fetch-initial-trackers": {
      console.assert(request.tabId, "fetch-initial-trackers: tabId is required");
      const trackingFlags = [1 << 12, 1 << 6, 1 << 11, 1 << 16];
      const trackers = await browser.experiments.webcompatDebugger.getContentBlockingLog(request.tabId);
      console.assert(trackers, "getContentBlockingLog should return a value");
      const parsedTrackers = JSON.parse(trackers);
      console.assert(typeof parsedTrackers === "object", "Parsed trackers should be an object");
      const regexTrackers = Object.entries(parsedTrackers)
        .filter(([_, flags]) => flags.some(el =>
          trackingFlags.includes(el[0])
        ))
        .map(([tracker, flags]) => {
          const { hostname } = new URL(tracker);
          return `*://${hostname}/*`;
        })
      browser.runtime.sendMessage({
        msg: "initial-trackers",
        trackers: regexTrackers,
        tabId: request.tabId
      });
      break;
    }
    case "get-unblocked-trackers": {
      await sendUnblockedTrackersUpdate(request.tabId);
      return;
    }
    case "toggle-tracker": {
      // Toggle the blocked status of a single tracker
      const { tracker, blocked, tabId } = request;
      console.assert(typeof tracker === "string", "toggle-tracker: tracker must be a string");
      console.assert(typeof blocked === "boolean", "toggle-tracker: blocked must be a boolean");
      console.assert(tabId, "toggle-tracker: tabId is required");

      await browser.experiments.webcompatDebugger.updateTrackingSkipURLs(
        [tracker],
        blocked
      );
      await sendUnblockedTrackersUpdate(tabId);
      browser.tabs.reload(tabId, { bypassCache: true });
      return;
    }
    case "update-multiple-trackers": {
      const { trackers, blocked, tabId } = request;
      console.assert(Array.isArray(trackers) || trackers instanceof Set, "update-multiple-trackers: trackers must be an array or set");
      console.assert(typeof blocked === "boolean", "update-multiple-trackers: blocked must be a boolean");
      console.assert(tabId, "update-multiple-trackers: tabId is required");

      await browser.experiments.webcompatDebugger.updateTrackingSkipURLs(
        Array.from(trackers),
        blocked
      );
      await sendUnblockedTrackersUpdate(tabId);
      browser.tabs.reload(tabId, { bypassCache: true });
      return;
    }
    case "reset": {
      const { tabId } = request;
      console.assert(tabId, "reset: No tabId provided.")

      await browser.experiments.webcompatDebugger.clearPreference();
      await sendUnblockedTrackersUpdate(tabId);
      browser.tabs.reload(tabId, { bypassCache: true });
      return;
    }
    default:
      console.error("Unknown message:", request);
  }
}

browser.runtime.onMessage.addListener(handleMessage);

// Listen for blocked requests and send them to the content script
browser.experiments.webcompatDebugger.blockedRequestObserver.addListener(async ({ url, tabId }) => {
  console.assert(typeof url === "string", "blockedRequestObserver: url must be a string");
  const { hostname } = new URL(url);
  const tracker = `*://${hostname}/*`;
  browser.runtime.sendMessage({
    msg: "blocked-request",
    tracker
  });
})
