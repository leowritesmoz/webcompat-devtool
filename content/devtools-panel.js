/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global browser */

/**
 *
 */
class WebcompatDebugger {
  blocklist = [];
  constructor() {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        this.init();
      },
      { once: true }
    );
  }

  init() {
    this.setupListeners();
    this.sendMessage("fetch-trackers", {
      tabId: browser.devtools.inspectedWindow.tabId,
    });
  }

  setupListeners() {
    browser.runtime.onMessage.addListener(request => this.onMessage(request));
    document.getElementById("block-all").addEventListener("click", () => {
      this.sendMessage("update-all-trackers", {
        blocked: true,
        blocklist: this.blocklist,
      });
      document.querySelectorAll(".tracker-checkbox").forEach(checkbox => {
        checkbox.checked = true;
      });
    });
    document.getElementById("unblock-all").addEventListener("click", () => {
      this.sendMessage("update-all-trackers", {
        blocked: false,
        blocklist: this.blocklist,
      });
      document.querySelectorAll(".tracker-checkbox").forEach(checkbox => {
        checkbox.checked = false;
      });
    });
  }

  populateTrackersList(tracker) {
    const list = document.getElementById("trackers-list");
    list.innerHTML = ""; // Clear existing items
    tracker.forEach(url => {
      const listItem = document.createElement("li");
      listItem.className = "tracker-item";

      const checkbox = document.createElement("input");
      checkbox.id = `tracker-${url}`;
      checkbox.name = `tracker-${url}`;
      checkbox.type = "checkbox";
      checkbox.className = "tracker-checkbox";
      checkbox.checked = true;
      listItem.appendChild(checkbox);

      const listItemText = document.createElement("label");
      listItemText.className = "tracker-text";
      listItemText.textContent = url;
      listItemText.setAttribute("for", `tracker-${url}`);
      listItem.appendChild(listItemText);

      list.appendChild(listItem);
      checkbox.addEventListener("change", event => {
        this.sendMessage("toggle-tracker", {
          url,
          blocked: event.target.checked,
        });
      });
    });
  }

  sendMessage(msg, request) {
    browser.runtime.sendMessage({
      msg,
      ...request,
    });
  }

  onMessage(request) {
    switch (request.msg) {
      case "tracker-fetched":
        this.blocklist = Object.entries(
          JSON.parse(request.contentBlockingLog)
        ).map(([url, _]) => url);
        this.populateTrackersList(this.blocklist);
        break;
      default:
        console.error("Unknown message:", request);
    }
  }
}

new WebcompatDebugger();
