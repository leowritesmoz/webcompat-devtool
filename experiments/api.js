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
              console.assert(typeof prefName === "string", "Preference name should be a string");
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
            console.assert(tabId, "tabId must be provided");
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
              console.log(oldPrefsSet);
              Services.prefs.setStringPref(
                prefName,
                Array.from(oldPrefsSet).join(",")
              );
            };

            TRACKING_PREF_SKIP_LISTS.forEach(prefName => {
              updatePref(prefName);
            });
          },
          async clearPreference() {
            TRACKING_PREF_SKIP_LISTS.forEach(pref => {
              console.assert(typeof pref === "string", "Preference name should be a string");
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
              console.assert(channelClassifier, "channelClassifier should be available");
              const observer = {
                observe: (subject) => {
                  console.assert(subject && typeof subject === "object", "Observer subject should be an object");
                  console.assert("url" in subject, "Observer subject should have a url property");
                  console.log(subject)
                  fire.sync({
                    url: subject.url
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