/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global browser */

async function handleMessage(request) {
  switch (request.msg) {
    case "fetch-trackers": {
      const { tabId } = request;
      if (!tabId) {
        console.error("No tabId provided");
        return;
      }

      const contentBlockingLog =
        await browser.experiments.webcompatDebugger.getContentBlockingLog(
          tabId
        );

      browser.runtime.sendMessage({
        msg: "tracker-fetched",
        contentBlockingLog,
      });
      return;
    }
    case "toggle-tracker": {
      const { url, blocked, tabId } = request;
      if (!url) {
        console.error("No URL provided");
        return;
      }

      const hostname = new URL(url).hostname;
      await browser.experiments.webcompatDebugger.updateTrackingSkipURLs(
        [hostname],
        blocked
      );
      browser.tabs.reload(tabId, { bypassCache: true });
      return;
    }
    case "update-all-trackers": {
      const { blocked, blocklist, tabId } = request;
      const hostnames = blocklist.map(url => new URL(url).hostname);

      await browser.experiments.webcompatDebugger.updateTrackingSkipURLs(
        hostnames,
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
