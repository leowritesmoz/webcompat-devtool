/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global Services, ExtensionAPI, ExtensionError */

const TRACKING_PREF_SKIP_LISTS = [
  "urlclassifier.trackingSkipURLs",
  "urlclassifier.features.fingerprinting.skipURLs",
  "urlclassifier.features.socialtracking.skipURLs",
  "urlclassifier.features.emailtracking.skipURLs",
  "urlclassifier.features.emailtracking.datacollection.skipURLs",
  "urlclassifier.features.cryptomining.skipURLs",
];

this.webcompatDebugger = class extends ExtensionAPI {
  getAPI(context) {
    const { tabManager } = context.extension;
    return {
      experiments: {
        webcompatDebugger: {
          async getContentBlockingLog(tabId) {
            const tab = tabManager.get(tabId);
            if (!tab) {
              throw new ExtensionError("Invalid tabId");
            }
            return tab.browsingContext.currentWindowGlobal.contentBlockingLog;
          },
          async updateTrackingSkipURLs(hostnames, blocked) {
            const updatePref = prefName => {
              const oldPrefs = Services.prefs.getStringPref(prefName, "");
              const oldPrefsSet = new Set(
                oldPrefs
                  .split(",")
                  .map(s => s.trim())
                  .filter(s => s)
              );
              hostnames.forEach(hostname => {
                const regexUrl = `*://${hostname}/*`;
                if (blocked) {
                  oldPrefsSet.delete(regexUrl);
                } else {
                  oldPrefsSet.add(regexUrl);
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
          },
        },
      },
    };
  }
};
