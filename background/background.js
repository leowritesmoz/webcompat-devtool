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
  const unblockedTrackers = await browser.experiments.webcompatDebugger.getUnblockedTrackers(tabId);
  try {
    await browser.runtime.sendMessage({
      msg: "unblocked-trackers",
      unblockedTrackers,
      tabId
    });
  } catch (e) {
    console.warn("Failed to send message to frontend (tab may be closed):", e);
  }
}

async function handleMessage(request) {
  switch (request.msg) {
    case "get-unblocked-trackers": {
      await sendUnblockedTrackersUpdate(request.tabId);
      return;
    }
    case "update-multiple-trackers": {
      const { trackers, blocked, tabId } = request;

      await browser.experiments.webcompatDebugger.updateUnblockedChannels(
        Array.from(trackers),
        blocked,
        tabId
      );
      await sendUnblockedTrackersUpdate(tabId);
      try {
        await browser.tabs.reload(tabId, { bypassCache: true });
      } catch (e) {
        console.warn("Failed to reload tab (may be closed):", e);
      }
      return;
    }
    case "reset": {
      const { tabId } = request;

      await browser.experiments.webcompatDebugger.clearUnblockList(tabId);
      await sendUnblockedTrackersUpdate(tabId);
      try {
        await browser.tabs.reload(tabId, { bypassCache: true });
      } catch (e) {
        console.warn("Failed to reload tab (may be closed):", e);
      }
      return;
    }
    default:
      console.error("Unknown message:", request);
  }
}

// Export an initBackground function for testability
function initBackground() {
  browser.runtime.onMessage.addListener(handleMessage);
  browser.experiments.webcompatDebugger.blockedRequestObserver.addListener(async ({ url, tabId, trackerType }) => {
    try {
      await browser.runtime.sendMessage({
        msg: "blocked-request",
        tracker: url,
        tabId,
        trackerType: typeToName[trackerType]
      });
    } catch (e) {
      console.warn("Failed to send blocked-request message (tab may be closed):", e);
    }
  });
}

module.exports = { handleMessage, initBackground };

// Initialize background listeners if running as a real extension (not in test)
if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
  module.exports.initBackground();
}