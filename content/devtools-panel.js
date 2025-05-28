/* This Source Code Form is subject to the terms of the Mozilla Public * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global browser */

class WebcompatDebugger {
  allTrackers;
  unblockedTrackers;
  selectedTrackers;

  constructor() {
    this.selectedTrackers = new Set();
    this.unblockedTrackers = new Set();
    this.allTrackers = {};
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        this.init();
      },
      { once: true }
    );
    this.tabId = browser.devtools.inspectedWindow.tabId;
  }

  init() {
    this.setupListeners();
    this.sendMessage("get-unblocked-trackers", {
      tabId: this.tabId
    });
  }

  setupListeners() {
    browser.runtime.onMessage.addListener(request => this.onMessage(request));
    document.getElementById("reset").addEventListener("click", () => {
      this.sendMessage("reset", { tabId: this.tabId })
    });
    document.getElementById("block-selected").addEventListener("click", () => {
      this.blockOrUnblockSelected(true)
    });
    document.getElementById("unblock-selected").addEventListener("click", () => {
      this.blockOrUnblockSelected(false)
    });
  }

  populateTrackerTable() {
    const table = document.getElementById("tracker-table");
    table.innerHTML = '';
    table.appendChild(this.createTableHead());
    table.appendChild(this.createTableBody());
    if (this.unblockedTrackers.size === 0 && Object.keys(this.allTrackers).length === 0) {
      const noContentMessage = document.createElement("p");
      noContentMessage.textContent = "No blocked resources, try refreshing the page.";
      table.appendChild(noContentMessage);
    }
  }

  createTableHead() {
    const thead = document.createElement("thead");
    thead.id = 'tracker-table-head';
    const headerRow = document.createElement("tr");
    headerRow.id = 'tracker-table-header';

    // Select all checkbox
    const selectAllTh = document.createElement("th");
    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllCheckbox.addEventListener("change", (e) => {
      const checked = e.target.checked;
      this.selectedTrackers = new Set();
      document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.checked = checked;
        if (checked) this.selectedTrackers.add(cb.dataset.tracker);
      });
    });
    selectAllTh.appendChild(selectAllCheckbox);
    headerRow.appendChild(selectAllTh);

    ["Blocked", "Hostname", "Type", "Action"].forEach(name => {
      const th = document.createElement("th");
      th.textContent = name;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    return thead;
  }

  createTableBody() {
    const tbody = document.createElement("tbody");
    Object.entries(this.allTrackers).forEach(([hostname, trackerData]) => {
      tbody.appendChild(this.createTrackerRow(hostname, trackerData));
    });
    return tbody;
  }

  createTrackerRow(hostname, trackerData) {
    const isBlocked = !this.unblockedTrackers.has(hostname);
    const row = document.createElement("tr");

    // Checkbox column
    row.appendChild(this.createRowCheckboxCell(hostname));

    const isBlockedCell = document.createElement("td");
    isBlockedCell.textContent = isBlocked;
    row.appendChild(isBlockedCell);

    const hostnameCell = document.createElement("td");
    hostnameCell.textContent = hostname;
    row.appendChild(hostnameCell);

    const trackerTypeCell = document.createElement("td");
    trackerTypeCell.textContent = trackerData.trackerType || "N/A";
    row.appendChild(trackerTypeCell);

    row.appendChild(this.createActionCell(hostname, isBlocked));

    return row;
  }

  createRowCheckboxCell(tracker) {
    const checkboxCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "row-checkbox";
    checkbox.dataset.tracker = tracker;
    checkbox.checked = this.selectedTrackers.has(tracker);
    checkbox.addEventListener("change", (e) => {
      if (e.target.checked) {
        this.selectedTrackers.add(tracker);
      } else {
        this.selectedTrackers.delete(tracker);
      }
    });
    checkboxCell.appendChild(checkbox);
    return checkboxCell;
  }

  createActionCell(tracker, isBlocked) {
    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.textContent = isBlocked ? "Unblock" : "Block";
    button.addEventListener("click", () => {
      this.sendMessage("toggle-tracker", {
        tracker,
        blocked: !isBlocked,
        channelId: this.allTrackers[tracker].channelId,
        tabId: this.tabId
      });
      // Optimistically update UI
      if (isBlocked) {
        this.unblockedTrackers.add(tracker);
      } else {
        this.unblockedTrackers.delete(tracker);
      }
      this.populateTrackerTable();
    });
    actionCell.appendChild(button);
    return actionCell;
  }

  blockOrUnblockSelected(blocked) {
    if (this.selectedTrackers.size === 0) return;
    this.sendMessage("update-multiple-trackers", {
      blocked,
      trackers: Array.from(this.selectedTrackers),
      tabId: this.tabId
    });
    // Optimistically update UI
    this.selectedTrackers.forEach(tracker => {
      if (blocked) {
        this.unblockedTrackers.delete(tracker);
      } else {
        this.unblockedTrackers.add(tracker);
      }
    });
    this.populateTrackerTable();
  }

  sendMessage(msg, request) {
    browser.runtime.sendMessage({
      msg,
      ...request,
    });
  }

  onMessage(request) {
    if (request.tabId != browser.devtools.inspectedWindow.tabId) {
      return;
    }
    switch (request.msg) {
      case "blocked-request":
        const { tracker, trackerType, channelId } = request;
        // console.log(channelId)
        this.allTrackers[tracker] = {
          channelId: channelId,
          trackerType
        };
        this.populateTrackerTable();
        break;
      case "unblocked-trackers":
        const { unblockedTrackers } = request;
        unblockedTrackers.forEach(tracker => {
          if (!(tracker in this.allTrackers)) {
            this.allTrackers[tracker] = { channelId: 0, trackerType: "N/A" }
          }
        })
        this.unblockedTrackers = new Set(unblockedTrackers);
        this.populateTrackerTable();
        break;
      default:
        console.error("Unknown message:", request);
    }
  }
}

class DebuggerFSMContext {
  // States:
  // Initialization:
  //  1. unblock all trackers
  // Group stage
  //  1. group by top level domain
  //  2. put groups into a stack
  //  3. pop the stack, and block all of the trackers in the group
  //  4. ask user if website is broken
  //    - broken -> add each tracker in the group to the individualTracker array
  //  5. when the stack is empty, continue to Individual stage
  // Individual stage
  //  1. pop the stack and block the tracker 
  //  2. ask user if website is broken
  //    - broken -> add tracker to an "unblock" array, then unblock the tracker
  //  3. when the stack is empty, return the "unblock" array
  init(allTrackers) {
    this.allTrackers = allTrackers
    this.unblockedTrackers = allTrackers
    this.state = new GroupStageState();
  }
  changeState(state) {
    this.state = state
  }
}

class DebuggerState {
}

class GroupStageState extends DebuggerState {
  constructor(debuggerFSMContext) {
    this.debuggerFSMContext = debuggerFSMContext
    const domainGroupsMap = {}
    debuggerFSMContext.allTrackers.forEach(tracker => {
      const domain = new URL(url).hostname.split('.').slice(-2).join('.');
      domainGroupsMap[domain] = domainGroupsMap[domain] || []
      domainGroupsMap[domain].push(tracker)
    })
    this.domainGroups = Object.entries(domainGroupsMap).map(([domain, hostnames]) => [domain, hostnames])
    this.individualStageTrackers = []
    this.lastGroupTrackers = []
  }

  popAndBlockNextGroup = () => {
    this.lastGroupTrackers = this.domainGroups.pop()
    browser.runtime.sendMessage({
      msg: "update-multiple-trackers",
      blocked,
      trackers: currentGroup[1],
      tabId: this.tabId
    });
  }

  addLastGroupToNextRound = (websiteBroke) => {
    if (websiteBroke) {
      this.individualStageTrackers.push(...this.lastGroupTrackers)
    }
  }
}

class IndiivdualStageState extends DebuggerState {
  constructor(debuggerFSMContext) {
    this.debuggerFSMContext = debuggerFSMContext
  }
}

new WebcompatDebugger();
