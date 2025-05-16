/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global browser */

/**
 *
 */
class WebcompatDebugger {
  allTrackers = new Set(); 
  unblocked = new Set();
  // when a page refreshes, need to clear the allTrackers
  // need to maintain two lists: one for the entire block list, another for the trackers 
  // that are allowed to be unblocked for now
  // when the pages 
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
    this.sendMessage("get-unblocked-trackers");
    this.sendMessage("fetch-initial-trackers", {
      tabId: browser.devtools.inspectedWindow.tabId,
    });
  }

  setupListeners() {
    browser.runtime.onMessage.addListener(request => this.onMessage(request));
    document.getElementById("block-all").addEventListener("click", () => {
      this.sendMessage("update-all-trackers", {
        blocked: true,
        allTrackers: this.allTrackers,
      });
      document.querySelectorAll(".tracker-checkbox").forEach(checkbox => {
        checkbox.checked = true;
      });
    });
    document.getElementById("unblock-all").addEventListener("click", () => {
      this.sendMessage("update-all-trackers", {
        blocked: false,
        allTrackers: this.allTrackers,
      });
      document.querySelectorAll(".tracker-checkbox").forEach(checkbox => {
        checkbox.checked = false;
      });
    });
  }

  populateTrackersList() {
    const list = document.getElementById("trackers-list");
    list.innerHTML = ""; // Clear existing items
    this.allTrackers.forEach(tracker => {
      this.addTrackerToList(tracker);
    })   
  }

  addTrackerToList(tracker) {
    const list = document.getElementById("trackers-list");
    const listItem = document.createElement("li");
    listItem.className = "tracker-item";

    const checkbox = document.createElement("input");
    checkbox.id = `tracker-${tracker}`;
    checkbox.name = `tracker-${tracker}`;
    checkbox.type = "checkbox";
    checkbox.className = "tracker-checkbox";
    checkbox.checked = !(this.unblocked.has(tracker));
    listItem.appendChild(checkbox);

    const listItemText = document.createElement("label");
    listItemText.className = "tracker-text";
    listItemText.textContent = tracker;
    listItemText.setAttribute("for", `tracker-${tracker}`);
    listItem.appendChild(listItemText);

    list.appendChild(listItem);
    checkbox.addEventListener("change", event => {
      this.sendMessage("toggle-tracker", {
        tracker,
        blocked: event.target.checked,
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
      case "initial-trackers":
        const { trackers } = request;
        this.allTrackers = new Set(trackers);
        this.populateTrackersList();
        break;
      case "blocked-request":
        const { tracker } = request;
        this.allTrackers.add(tracker);
        this.populateTrackersList();
        break;
      case "unblocked-trackers":
        const { unblockedTrackers } = request;
        this.unblocked = new Set(unblockedTrackers);
        console.log("unblocked trackers", this.unblocked);
        this.populateTrackersList();
        break;
      default:
        console.error("Unknown message:", request);
    }
  }
}

new WebcompatDebugger();
