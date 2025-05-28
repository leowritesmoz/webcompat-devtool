/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global browser */

const typeToName = {
  // Mapping from nsIUrlClassifierBlockedChannel.idl https://searchfox.org/mozilla-central/source/netwerk/url-classifier/nsIChannelClassifierService.idl#16
  0: "Tracking Content",
  1: "Social Tracker",
  2: "Fingerprinting",
  3: "Cryptomining",

  // Mapping from nsIWebProgressListener.idl https://searchfox.org/mozilla-central/source/uriloader/base/nsIWebProgressListener.idl#373
  64: "Fingerprinting",
  2048: "Cryptomining",
  4096: "Tracking Content",
  65536: "Social Tracker",
}

async function sendUnblockedTrackersUpdate(tabId) {
  const unblockedTrackers = await browser.experiments.webcompatDebugger.getUnblockedTrackers();
  browser.runtime.sendMessage({
    msg: "unblocked-trackers",
    unblockedTrackers,
    tabId
  });
}

async function handleMessage(request) {
  switch (request.msg) {
    case "get-unblocked-trackers": {
      await sendUnblockedTrackersUpdate(request.tabId);
      return;
    }
    case "toggle-tracker": {
      // Toggle the blocked status of a single tracker
      const { tracker, blocked, tabId, channelId } = request;

      await browser.experiments.webcompatDebugger.updateTrackingSkipURLs(
        [tracker],
        blocked,
        [channelId]
      );
      await sendUnblockedTrackersUpdate(tabId);
      return;
    }
    case "update-multiple-trackers": {
      const { trackers, blocked, tabId } = request;

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
browser.experiments.webcompatDebugger.blockedRequestObserver.addListener(async ({ url, tabId, trackerType, channelId }) => {
  const { hostname } = new URL(url);
  const tracker = `*://${hostname}/*`;
  browser.runtime.sendMessage({
    msg: "blocked-request",
    tracker,
    tabId,
    channelId,
    trackerType: typeToName[trackerType]
  });
})
