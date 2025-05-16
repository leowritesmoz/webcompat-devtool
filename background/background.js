/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global browser */

async function handleMessage(request) {
  switch (request.msg) {
    case "fetch-initial-trackers": {
      console.log(request.tabId)
     const trackers = await browser.experiments.webcompatDebugger.getContentBlockingLog(request.tabId); 
     const regexTrackers = Object.keys(JSON.parse(trackers)).map(tracker => {
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
      const unblockedTrackers = await browser.experiments.webcompatDebugger.getUnblockedTrackers();
      browser.runtime.sendMessage({
        msg: "unblocked-trackers",
        unblockedTrackers,
      });
      return;
    }
    case "toggle-tracker": {
      // Toggle the blocked status of a single tracker
      const { tracker, blocked, tabId } = request;

      await browser.experiments.webcompatDebugger.updateTrackingSkipURLs(
        [tracker],
        blocked
      );
      const unblockedTrackers = await browser.experiments.webcompatDebugger.getUnblockedTrackers();
      browser.runtime.sendMessage({
        msg: "unblocked-trackers",
        unblockedTrackers,
      });

      browser.tabs.reload(tabId, { bypassCache: true });
      return;
    }
    case "update-all-trackers": {
      const { allTrackers, blocked, tabId } = request;

      await browser.experiments.webcompatDebugger.updateTrackingSkipURLs(
        Array.from(allTrackers),
        blocked
      );

      browser.tabs.reload(tabId, { bypassCache: true });
      return;
    }
    default:
      console.error("Unknown message:", request);
  }
}

browser.runtime.onMessage.addListener(handleMessage); 

// Listen for blocked requests and send them to the content script
browser.experiments.webcompatDebugger.stopRequestObserver.addListener(({ url }) => {
  const { hostname } = new URL(url);
    const tracker = `*://${hostname}/*`;
    browser.runtime.sendMessage({
      msg: "blocked-request",
      tracker
    });
})

