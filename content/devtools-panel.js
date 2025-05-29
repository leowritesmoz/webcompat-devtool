/* This Source Code Form is subject to the terms of the Mozilla Public * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global browser */

class WebcompatDebugger {
  constructor() {
    this.selectedTrackers = new Set();
    this.unblockedTrackers = new Set();
    this.allTrackers = {};
    this.debuggerFSMContext = undefined
    this.tabId = browser.devtools.inspectedWindow.tabId;
    document.addEventListener( "DOMContentLoaded", () => { this.init(); }, { once: true });
  }

  /**
   * Initialize listeners and request initial tracker data.
   */
  init = () => {
    this.setupListeners();
    this.sendMessage("get-unblocked-trackers", {
      tabId: this.tabId
    });
  };

  /**
   * Set up UI and message listeners.
   */
  setupListeners = () => {
    browser.runtime.onMessage.addListener(request => this.onMessage(request));
    this.addClickListener("reset", () => { 
      this.sendMessage("reset", { tabId: this.tabId }); 
    }); 
    this.addClickListener("block-selected", () => { 
      this.blockOrUnblockSelected(true); 
    });
    this.addClickListener("unblock-selected", () => {
      this.blockOrUnblockSelected(false);
    });
    this.addClickListener("interactive-debugging", () => {
      this.debuggerFSMContext = new DebuggerFSMContext(Object.keys(this.allTrackers));
    });
    this.addClickListener("website-broke", () => {
      this.debuggerFSMContext?.onWebsiteBroke();
    });
    this.addClickListener("test-next-tracker", () => {
      this.debuggerFSMContext?.onTestNextTracker();
    });
    this.addClickListener("stop-debugging", () => {
      this.debuggerFSMContext = undefined;
    });
  };

  /**
   * Helper to add click event listeners safely.
   */
  addClickListener = (id, handler) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("click", handler);
    }
  };

  /**
   * Render the tracker table.
   */
  populateTrackerTable = () => {
    const table = document.getElementById("tracker-table");
    if (!table) return;
    table.innerHTML = '';
    table.appendChild(this.createTableHead());
    table.appendChild(this.createTableBody());
    if (this.unblockedTrackers.size === 0 && Object.keys(this.allTrackers).length === 0) {
      const noContentMessage = document.createElement("p");
      noContentMessage.textContent = "No blocked resources, try refreshing the page.";
      table.appendChild(noContentMessage);
    }
  };

  /**
   * Create the table head for the tracker table.
   */
  createTableHead = () => {
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
  };

  /**
   * Create the table body for the tracker table.
   */
  createTableBody = () => {
    const tbody = document.createElement("tbody");
    Object.entries(this.allTrackers).forEach(([hostname, trackerData]) => {
      tbody.appendChild(this.createTrackerRow(hostname, trackerData));
    });
    return tbody;
  };

  /**
   * Create a row for a tracker.
   */
  createTrackerRow = (hostname, trackerData) => {
    const isBlocked = !this.unblockedTrackers.has(hostname);
    const row = document.createElement("tr");
    row.appendChild(this.createRowCheckboxCell(hostname));

    const isBlockedCell = document.createElement("td");
    isBlockedCell.textContent = isBlocked;
    row.appendChild(isBlockedCell);

    const hostnameCell = document.createElement("td");
    hostnameCell.className = "hostname-cell";
    hostnameCell.textContent = hostname;
    hostnameCell.title = hostname;
    row.appendChild(hostnameCell);

    const trackerTypeCell = document.createElement("td");
    trackerTypeCell.textContent = trackerData.trackerType || "N/A";
    row.appendChild(trackerTypeCell);

    row.appendChild(this.createActionCell(hostname, isBlocked));
    return row;
  };

  /**
   * Create a checkbox cell for a tracker row.
   */
  createRowCheckboxCell = (tracker) => {
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
  };

  /**
   * Create an action cell (block/unblock button) for a tracker row.
   */
  createActionCell = (tracker, isBlocked) => {
    const actionCell = document.createElement("td");
    const button = document.createElement("button");
    button.textContent = isBlocked ? "Unblock" : "Block";
    button.addEventListener("click", () => {
      this.sendMessage("toggle-tracker", {
        tracker,
        blocked: !isBlocked,
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
  };

  /**
   * Block or unblock all selected trackers.
   */
  blockOrUnblockSelected = (blocked) => {
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
  };

  /**
   * Send a message to the background script.
   */
  sendMessage = (msg, request) => {
    browser.runtime.sendMessage({
      msg,
      ...request,
    });
  };

  /**
   * Handle incoming messages from the background script.
   */
  onMessage = (request) => {
    if (request.tabId != browser.devtools.inspectedWindow.tabId) {
      return;
    }
    switch (request.msg) {
      case "blocked-request": {
        const { tracker, trackerType } = request;
        this.allTrackers[tracker] = { trackerType };
        this.populateTrackerTable();
        break;
      }
      case "unblocked-trackers": {
        const { unblockedTrackers } = request;
        unblockedTrackers.forEach(tracker => {
          if (!(tracker in this.allTrackers)) {
            this.allTrackers[tracker] = { trackerType: "N/A" };
          }
        });
        this.unblockedTrackers = new Set(unblockedTrackers);
        this.populateTrackerTable();
        break;
      }
      default:
        console.error("Unknown message:", request);
    }
  };
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
  constructor(allTrackers) {
    this.allTrackers = allTrackers
    console.log(allTrackers)
    this.state = new GroupStageState(this);
    this.individualStageTrackers = []
    this.necessaryTrackers = []
    // TODO: continously unblock all cookies until nothing more loads
  }
  changeState(state) {
    this.state = state
  }

  onTestNextTracker = () => {
    this.state.onTestNextTracker()
  }

  onWebsiteBroke = () => {
    this.state.onWebsiteBroke()
  }

  updatePromptText = (text) => {
    const el = document.getElementById("interactive-debugger-prompt")
    el.textContent = text
  }
}

class GroupStageState {
  constructor(debuggerFSMContext) {
    this.debuggerFSMContext = debuggerFSMContext
    const domainGroupsMap = {}
    this.debuggerFSMContext.allTrackers.forEach(tracker => {
      const domain = new URL(tracker).hostname.split('.').slice(-2).join('.');
      domainGroupsMap[domain] = domainGroupsMap[domain] || []
      domainGroupsMap[domain].push(tracker)
    })
    this.domainGroups = Object.entries(domainGroupsMap).map(([domain, hostnames]) => [domain, hostnames])
    this.lastGroupTrackers = []
    this.debuggerFSMContext.updatePromptText(`Please click on "Continue" to start debugging`)
  }

  onTestNextTracker = () => {
    this.lastGroupTrackers = this.domainGroups.pop()
    if (!this.lastGroupTrackers) {
      this.debuggerFSMContext.changeState(new IndiivdualStageState(this.debuggerFSMContext))
      return;
    }
    browser.runtime.sendMessage({
      msg: "update-multiple-trackers",
      blocked: true,
      trackers: this.lastGroupTrackers[1],
      tabId: this.tabId
    });
    this.debuggerFSMContext.updatePromptText(`Please click on "Website Broke" if the website is broken, or "Continue" to test the next tracker `)
  }

  onWebsiteBroke = () => {
    this.debuggerFSMContext.individualStageTrackers.push(...this.lastGroupTrackers[1])
    // unblock the group to make sure the page works again
    browser.runtime.sendMessage({
      msg: "update-multiple-trackers",
      blocked: false,
      trackers: this.lastGroupTrackers[1],
      tabId: this.tabId
    })
    this.debuggerFSMContext.updatePromptText(`Group ${this.lastGroupTrackers[0]} will be tested later`)
  }
}

class IndiivdualStageState {
  constructor(debuggerFSMContext) {
    this.debuggerFSMContext = debuggerFSMContext
  }
  onTestNextTracker = () => {
    this.lastTracker = this.debuggerFSMContext.individualStageTrackers.pop()
    if (!this.lastTracker) {
      this.debuggerFSMContext.updatePromptText(`Debugging finished, please add ${this.debuggerFSMContext.necessaryTrackers} to
      the exceptions list`)
      return;
    }
    browser.runtime.sendMessage({
      msg: "update-multiple-trackers",
      blocked: true,
      trackers: this.lastTracker,
      tabId: this.tabId
    });
  }

  onWebsiteBroke = () => {
    this.debuggerFSMContext.necessaryTrackers.push(...this.lastTracker)
    browser.runtime.sendMessage({
      msg: "update-multiple-trackers",
      blocked: false,
      trackers: this.lastTracker,
      tabId: this.tabId
    })
    this.debuggerFSMContext.updatePromptText(`Added ${this.lastTracker} to necessary trackers`)
  }
}

new WebcompatDebugger();
