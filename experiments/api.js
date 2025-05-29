/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global Services, ExtensionAPI */

this.webcompatDebugger = class extends ExtensionAPI {
  getAPI(context) {
    if (!context.unblockedChannels) {
      context.unblockedChannels = {}
    }
    return {
      experiments: {
        webcompatDebugger: {
          async getUnblockedTrackers(tabId) {
            return context.unblockedChannels[tabId] ? Array.from(context.unblockedChannels[tabId]) : [];
          },
          async updateUnblockedChannels(hostnames, blocked, tabId) {
            if (!context.unblockedChannels) {
              context.unblockedChannels = {}
            }
            if (!context.unblockedChannels[tabId]) {
              context.unblockedChannels[tabId] = new Set();
            }
            hostnames.forEach(hostname => {
              if (blocked) {
                context.unblockedChannels[tabId].delete(hostname)
              } else {
                context.unblockedChannels[tabId].add(hostname)
              }
            })
          },
          async clearUnblockList(tabId) {
            context.unblockedChannels[tabId] = new Set()
          },
          blockedRequestObserver: new ExtensionCommon.EventManager({
            context,
            name: "webcompatDebugger.stopRequestObserver",
            register: fire => {
              const channelClassifier = Cc[
                "@mozilla.org/url-classifier/channel-classifier-service;1"
              ].getService(Ci.nsIChannelClassifierService);
              const { tabManager } = this.extension
              const observer = {
                observe: (subject) => {
                  const windows = Services.wm.getEnumerator("navigator:browser");
                  let targetTab;
                  while (windows.hasMoreElements() && !targetTab) {
                    const win = windows.getNext();
                    if (!win.gBrowser) {
                      continue;
                    }
                    targetTab = Array.from(win.gBrowser.tabs).find(tab => {
                      const { browserId } = win.gBrowser.getBrowserForTab(tab);
                      return browserId === subject.browserId;
                    });
                  }
                  if (!targetTab) {
                    console.error("Unable to find tab");
                    return;
                  }
                  const tabId = tabManager.convert(targetTab).id;
                  const channel = subject.QueryInterface(Ci.nsIUrlClassifierBlockedChannel)
                  if (context.unblockedChannels?.[tabId]?.has(channel.url)) {
                    channel.allow()
                  }
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