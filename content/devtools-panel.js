/* This Source Code Form is subject to the terms of the Mozilla Public * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global browser */

/**
 * Send a message to the background script.
 */
const sendMessage = (msg, request) => {
  browser.runtime.sendMessage({
    msg,
    ...request,
  });
};

/**
 * Helper to toggle the disabled state of a button.
 */
const toggleButtonDisabledState = (buttonName, isDisabled) => {
  const el = document.getElementById(buttonName)
  el.disabled = isDisabled
}

/**
 * Helper to add click event listeners safely.
 */
const addClickListener = (id, handler) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("click", handler);
  }
};


class WebcompatDebugger {
  constructor() {
    this.selectedTrackers = new Set();
    this.unblockedTrackers = new Set();
    this.allTrackers = {};
    this.debuggerFSMContext = undefined
    this.tabId = browser.devtools.inspectedWindow.tabId;
    document.addEventListener("DOMContentLoaded", () => { this.init(); }, { once: true });
  }

  /**
   * Initialize listeners and request initial tracker data.
   */
  init = () => {
    this.setupListeners();
    sendMessage("get-unblocked-trackers", {
      tabId: this.tabId
    });
  };

  /**
   * Set up UI and message listeners.
   */
  setupListeners = () => {
    browser.runtime.onMessage.addListener(request => this.onMessage(request));
    addClickListener("reset", () => {
      sendMessage("reset", { tabId: this.tabId });
    });
    addClickListener("block-selected", () => {
      this.blockOrUnblockSelected(true);
    });
    addClickListener("unblock-selected", () => {
      this.blockOrUnblockSelected(false);
    });
    addClickListener("interactive-debugging", () => {
      this.debuggerFSMContext = new DebuggerFSMContext(Object.keys(this.allTrackers));
    });
    addClickListener("website-broke", () => {
      this.debuggerFSMContext?.onWebsiteBroke();
    });
    addClickListener("test-next-tracker", () => {
      this.debuggerFSMContext?.onTestNextTracker();
    });
    addClickListener("stop-debugging", () => {
      this.debuggerFSMContext.stop();
      this.debuggerFSMContext = undefined;
    });
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
      sendMessage("update-multiple-trackers", {
        trackers: [tracker],
        blocked: !isBlocked,
        tabId: this.tabId
      });
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
    sendMessage("update-multiple-trackers", {
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

// TODO: implement additional state to automatically unblock and refresh until no more new
// hostnames are added to this.allTrackers

/**
 * FSM context for interactive debugging of tracker blocking.
 */
class DebuggerFSMContext {
  /**
   * @param {string[]} allTrackers - List of all tracker hostnames.
   */
  constructor(allTrackers) {
    this.allTrackers = Array.isArray(allTrackers) ? allTrackers : [];
    this.subdomainStageTrackers = new Set();
    this.necessaryTrackers = new Set();
    this.tabId = browser.devtools.inspectedWindow.tabId;
    this.sendTrackersUpdate(false, this.allTrackers);
    this.state = new DomainStageState(this);
    toggleButtonDisabledState('stop-debugging', false)
  }

  /**
   * Transition to a new FSM state.
   * @param {object} state - The new state instance.
   */
  changeState(state) {
    this.state = state;
    if (state && state.constructor && state.constructor.name) {
      console.log(`FSM transitioned to: ${state.constructor.name}`);
    }
  }

  /**
   * Called when user clicks "Continue".
   */
  onTestNextTracker = () => {
    this.state.onTestNextTracker();
  }

  /**
   * Called when user clicks "Website Broke".
   */
  onWebsiteBroke = () => {
    this.state.onWebsiteBroke();
  }

  /**
   * Update the prompt text in the UI.
   * @param {number} count - Number of items left.
   * @param {string} text - Prompt message.
   */
  updatePromptText = (count, text) => {
    const el = document.getElementById("interactive-debugger-prompt");
    if (el) {
      el.textContent = (count !== undefined ? `[${count} left] ` : ``) + text;
    }
  }

  /**
   * Helper to send a message to the background script.
   */
  sendTrackersUpdate = (blocked, trackers) => {
    sendMessage("update-multiple-trackers", {
      blocked,
      trackers: Array.from(trackers),
      tabId: this.tabId
    });
  }


  /**
   * Stop interactive debugging and reset all states.
   */
  stop = () => {
    this.updatePromptText(
      undefined,
      `Interactive debugger stopped.`
    );
    sendMessage("reset", { tabId: this.tabId })
    toggleButtonDisabledState('test-next-tracker', true)
    toggleButtonDisabledState('website-broke', true)
    toggleButtonDisabledState('stop-debugging', true)
  }
}

/**
 * Domain stage: block/unblock by top-level domain groupings.
 */
class DomainStageState {
  constructor(debuggerFSMContext) {
    this.debuggerFSMContext = debuggerFSMContext;
    this.domainGroups = this.groupByDomain(debuggerFSMContext.allTrackers);
    this.lastGroup = null;
    this.debuggerFSMContext.updatePromptText(
      this.domainGroups.length,
      "Click 'Continue' to start domain debugging."
    );
    toggleButtonDisabledState('test-next-tracker', false)
  }

  /**
   * Group trackers by their top-level domain.
   */
  groupByDomain(trackers) {
    const domainGroupsMap = {};
    trackers.forEach(tracker => {
      const domain = tracker.split('.').slice(-2).join('.');
      if (!domainGroupsMap[domain]) domainGroupsMap[domain] = new Set();
      domainGroupsMap[domain].add(tracker);
    });
    return Object.entries(domainGroupsMap).map(([domain, hosts]) => ({ domain, hosts: Array.from(hosts) }));
  }

  onTestNextTracker = () => {
    this.lastGroup = this.domainGroups.shift();
    const count = this.domainGroups.length;
    if (!this.lastGroup) {
      this.debuggerFSMContext.updatePromptText(
        count,
        "Domain debugging finished. Starting subdomain tracker stage. Click 'Continue' to proceed."
      );
      toggleButtonDisabledState('website-broke', true)
      this.debuggerFSMContext.changeState(new SubdomainStageState(this.debuggerFSMContext));
      return;
    }
    this.debuggerFSMContext.sendTrackersUpdate(true, this.lastGroup.hosts);
    toggleButtonDisabledState('website-broke', false)
    this.debuggerFSMContext.updatePromptText(
      count,
      `Blocked domain group '${this.lastGroup.domain}'. If the website is broken, click 'Website Broke', otherwise 'Continue'.`
    );
  }

  onWebsiteBroke = () => {
    if (this.lastGroup && this.lastGroup.hosts) {
      this.lastGroup.hosts.forEach(tracker => this.debuggerFSMContext.subdomainStageTrackers.add(tracker));
      // Unblock the group to restore site
      this.debuggerFSMContext.sendTrackersUpdate(false, this.lastGroup.hosts);
      const count = this.domainGroups.length;
      this.debuggerFSMContext.updatePromptText(
        count,
        `Domain group '${this.lastGroup.domain}' will be tested individually later. Click 'Continue' to test the next domain group.`
      );
      toggleButtonDisabledState('website-broke', true)
    }
  }

}

/**
 * Subdomain stage: block/unblock each tracker separately.
 */
class SubdomainStageState {
  constructor(debuggerFSMContext) {
    this.debuggerFSMContext = debuggerFSMContext;
    this.subdomains = Array.from(debuggerFSMContext.subdomainStageTrackers);
    this.lastSubdomain = null;
  }


  onTestNextTracker = () => {
    this.lastSubdomain = this.subdomains.shift();
    const count = this.subdomains.length;
    if (!this.lastSubdomain) {
      this.debuggerFSMContext.changeState(new CompletedState(this.debuggerFSMContext))
      return;
    }
    this.debuggerFSMContext.sendTrackersUpdate(true, [this.lastSubdomain]);
    toggleButtonDisabledState('website-broke', false)
    this.debuggerFSMContext.updatePromptText(
      count,
      `Blocked subdomain '${this.lastSubdomain}'. If the website is broken, click 'Website Broke', otherwise 'Continue'.`
    );
  }

  onWebsiteBroke = () => {
    if (this.lastSubdomain) {
      this.debuggerFSMContext.necessaryTrackers.add(this.lastSubdomain);
      this.debuggerFSMContext.sendTrackersUpdate(false, [this.lastSubdomain]);
      const count = this.subdomains.length;
      toggleButtonDisabledState('website-broke', true)
      this.debuggerFSMContext.updatePromptText(
        count,
        `Added '${this.lastSubdomain}' to necessary trackers. Click 'Continue' to test the next subdomain.`
      );
    }
  }
}

class CompletedState {
  constructor(debuggerFSMContext) {
    this.debuggerFSMContext = debuggerFSMContext
    this.debuggerFSMContext.updatePromptText(
      undefined,
      `Subdomain debugging finished. Please add the following to the exceptions list: ${Array.from(this.debuggerFSMContext.necessaryTrackers).join(', ')}`
    );
    toggleButtonDisabledState('test-next-tracker', true)
    toggleButtonDisabledState('website-broke', true)
    toggleButtonDisabledState('stop-debugging', true)
  }
}

// Export FSM classes for testing
module.exports = {
  DebuggerFSMContext,
  DomainStageState,
  SubdomainStageState,
  CompletedState
};

new WebcompatDebugger();
