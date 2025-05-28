/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global Services, ExtensionAPI, ExtensionError */

const TRACKING_PREF_SKIP_LISTS = [
  "urlclassifier.trackingSkipURLs",
  "urlclassifier.features.fingerprinting.skipURLs",
  "urlclassifier.features.socialtracking.skipURLs",
  "urlclassifier.features.cryptomining.skipURLs",
];

this.webcompatDebugger = class extends ExtensionAPI {
  getAPI(context) {
    const { tabManager } = context.extension;
    return {
      experiments: {
        webcompatDebugger: {
          async getUnblockedTrackers() {
            const unblockedTrackers = new Set();
            TRACKING_PREF_SKIP_LISTS.forEach(prefName => {
              const prefValue = Services.prefs.getStringPref(prefName, "");
              prefValue.split(",").forEach(hostname => {
                if (hostname.trim()) {
                  unblockedTrackers.add(hostname.trim());
                }
              });
            });
            return Array.from(unblockedTrackers);
          },
          async getContentBlockingLog(tabId) {
            const tab = tabManager.get(tabId);
            return tab.browsingContext.currentWindowGlobal.contentBlockingLog;
          },
          async updateTrackingSkipURLs(hostnames, blocked) {
            console.assert(Array.isArray(hostnames) || hostnames instanceof Set, "hostnames must be an array or set");
            console.assert(typeof blocked === "boolean", "blocked must be a boolean");
            const hostArr = Array.from(hostnames);
            hostArr.forEach(hostname => {
              console.assert(typeof hostname === "string", "Each hostname must be a string");
            });

            const updatePref = prefName => {
              const oldPrefs = Services.prefs.getStringPref(prefName, "");
              const a = oldPrefs
                .split(",")
                .map(s => s.trim())
              const oldPrefsSet = new Set(a);
              hostArr.forEach(hostname => {
                if (blocked) {
                  oldPrefsSet.delete(hostname);
                } else {
                  oldPrefsSet.add(hostname);
                }
              });
              Services.prefs.setStringPref(
                prefName,
                Array.from(oldPrefsSet).join(",")
              );
            };

            TRACKING_PREF_SKIP_LISTS.forEach(prefName => {
              updatePref(prefName);
            });
            // channelIds.forEach(channelId => {
            //   const channel = context.channels[channelId]
            //   if (!channel) {
            //     return;
            //   }
            //   channel.allow() // not sure if this is working
            //   console.log(`Allowed channel ${channelId}`)
            // })
          },
          async clearPreference() {
            TRACKING_PREF_SKIP_LISTS.forEach(pref => {
              Services.prefs.clearUserPref(pref)
            })
          },
          blockedRequestObserver: new ExtensionCommon.EventManager({
            context,
            name: "webcompatDebugger.stopRequestObserver",
            register: fire => {
              const channelClassifier = Cc[
                "@mozilla.org/url-classifier/channel-classifier-service;1"
              ].getService(Ci.nsIChannelClassifierService);
              if (!context.channels) {
                context.channels = {}
              }
              const observer = {
                observe: (subject) => {
                  // To get the correct tabId:
                  // - Iterate through all tabs in all windows, for each tab, check if browserId
                  //    matches subject.browserId
                  // - On match, use tabManager.convert() to convert the tab element into 
                  //    the WebExtension tab, with the correct Id
                  const channel = subject.QueryInterface(Ci.nsIUrlClassifierBlockedChannel)
                  // channel.allow() // this works
                  const { channelId } = channel;
                  context.channels[channelId] = channel;
                  const windows = Services.wm.getEnumerator("navigator:browser");
                  let targetTab;
                  if (!subject || !subject.browserId) {
                    console.log("No subject or browserId");
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
                    console.log("Unable to find tab");
                    return;
                  }
                  const { tabManager } = this.extension
                  const tabId = tabManager.convert(targetTab).id; 
                  fire.sync({
                    tabId,
                    channelId,
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