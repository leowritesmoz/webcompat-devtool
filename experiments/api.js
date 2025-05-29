/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global Services, ExtensionAPI */

this.webcompatDebugger = class extends ExtensionAPI {
  getAPI(context) {
    return {
      experiments: {
        webcompatDebugger: {
          async getUnblockedTrackers() {
            return context.unblockedChannels ? Array.from(context.unblockedChannels) : [];
          },
          async updateTrackingSkipURLs(hostnames, blocked) {
            if (!context.unblockedTrackers) {
              context.unblockedChannels = new Set();
            }
            hostnames.forEach(hostname => {
              if (blocked) {
                context.unblockedChannels.delete(hostname)
              } else {
                context.unblockedChannels.add(hostname)
              }
            })
          },
          async clearUnblockList() {
            context.unblockedChannels = new Set()
          },
          blockedRequestObserver: new ExtensionCommon.EventManager({
            context,
            name: "webcompatDebugger.stopRequestObserver",
            register: fire => {
              const channelClassifier = Cc[
                "@mozilla.org/url-classifier/channel-classifier-service;1"
              ].getService(Ci.nsIChannelClassifierService);
              const observer = {
                observe: (subject) => {
                  const channel = subject.QueryInterface(Ci.nsIUrlClassifierBlockedChannel)
                  if (context.unblockedChannels?.has(channel.url)) {
                    channel.allow()
                  }

                const windows = Services.wm.getEnumerator("navigator:browser");
                let targetTab;
                if (!subject || !subject.browserId) {
                  console.error("No subject or browserId");
                  return;
                }
                while (windows.hasMoreElements() && !targetTab) {
                  const win = windows.getNext();
                  if (!win.gBrowser) {
                    continue;
                  }
                  for (const tab of win.gBrowser.tabs) {
                    const { browserId } = win.gBrowser.getBrowserForTab(tab);
                    if (browserId === subject.browserId) {
                      targetTab = tab;
                      break;
                    }
                  }
                }
                if (!targetTab) {
                  console.error("Unable to find tab");
                  return;
                }
                  const { tabManager } = this.extension
                  const tabId = tabManager.convert(targetTab).id; 
                  fire.sync({
                    tabId,
                    url: subject.url,
                    trackerType: subject.reason,
                  });
                },
              };
              channelClassifier.addListener(observer);
              return () => {
                channelClassifier.removeListener(observer);
              };
            },
          }).api()
        },
      },
    };
  }
};