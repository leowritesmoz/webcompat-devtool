// Jest tests for the FSM (DebuggerFSMContext and states)

const { JSDOM } = require('jsdom');

global.browser = {
    devtools: {
        inspectedWindow: { tabId: 1 }
    },
    runtime: {
        sendMessage: jest.fn(),
        onMessage: { addListener: jest.fn() }
    }
};

global.document = (new JSDOM(`
  <div>
    <div id="interactive-debugger-prompt"></div>
    <button id="test-next-tracker"></button>
    <button id="website-broke"></button>
    <button id="stop-debugging"></button>
  </div>
`)).window.document;

global.getElementById = id => document.getElementById(id);

global.console = { log: jest.fn(), error: jest.fn() };

// Mock helpers
const sendMessage = jest.fn();
const toggleButtonDisabledState = jest.fn();

// Import FSM classes from the file under test
let DebuggerFSMContext, DomainStageState, SubdomainStageState, CompletedState;
beforeAll(() => {
    const fsmModule = require('../content/devtools-panel.js');
    DebuggerFSMContext = fsmModule.DebuggerFSMContext;
    DomainStageState = fsmModule.DomainStageState;
    SubdomainStageState = fsmModule.SubdomainStageState;
    CompletedState = fsmModule.CompletedState;
});

describe('DebuggerFSMContext', () => {
    let fsm;
    beforeEach(() => {
        fsm = new DebuggerFSMContext(['a.example.com', 'b.example.com', 'c.test.com']);
        fsm.sendTrackersUpdate = jest.fn();
        fsm.updatePromptText = jest.fn();
        fsm.changeState = jest.fn();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    })

    it('initializes with allTrackers', () => {
        expect(fsm.allTrackers).toEqual(['a.example.com', 'b.example.com', 'c.test.com']);
    });

    it('calls sendTrackersUpdate on construction', () => {
        expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith({
            msg: "update-multiple-trackers",
            blocked: false,
            trackers: ['a.example.com', 'b.example.com', 'c.test.com'],
            tabId: 1
        });
    });

    it('transitions state on onTestNextTracker', () => {
        fsm.state.onTestNextTracker = jest.fn();
        fsm.onTestNextTracker();
        expect(fsm.state.onTestNextTracker).toHaveBeenCalled();
    });

    it('transitions state on onWebsiteBroke', () => {
        fsm.state.onWebsiteBroke = jest.fn();
        fsm.onWebsiteBroke();
        expect(fsm.state.onWebsiteBroke).toHaveBeenCalled();
    });

    it('stop disables buttons and updates prompt', () => {
        fsm.updatePromptText = jest.fn();
        fsm.stop();
        expect(fsm.updatePromptText).toHaveBeenCalledWith(undefined, expect.stringContaining('stopped'));
    });
});

describe('DomainStageState', () => {
    let fsm, state;
    beforeEach(() => {
        fsm = {
            allTrackers: ['a.example.com', 'b.example.com', 'c.test.com'],
            updatePromptText: jest.fn(),
            sendTrackersUpdate: jest.fn(),
            subdomainStageTrackers: new Set(),
            changeState: jest.fn()
        };
        state = new DomainStageState(fsm);
    });

    it('groups trackers by domain', () => {
        const groups = state.groupByDomain(['a.example.com', 'b.example.com', 'c.test.com']);

        expect(groups).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ domain: 'example.com', hosts: expect.arrayContaining(['a.example.com', 'b.example.com']) }),
                expect.objectContaining({ domain: 'test.com', hosts: expect.arrayContaining(['c.test.com']) })
            ])
        );
    });

    it('onTestNextTracker blocks next group and updates prompt', () => {
        state.domainGroups = [
            { domain: 'example.com', hosts: ['a.example.com', 'b.example.com'] },
            { domain: 'test.com', hosts: ['c.test.com'] }
        ];

        state.onTestNextTracker();

        expect(fsm.sendTrackersUpdate).toHaveBeenCalledWith(true, ['a.example.com', 'b.example.com']);
        expect(fsm.updatePromptText).toHaveBeenCalledWith(1, expect.stringContaining('example.com'));
        expect(state.lastGroup).toEqual(
            expect.objectContaining({ domain: 'example.com', hosts: ['a.example.com', 'b.example.com'] })
        );
        expect(state.domainGroups.length).toBe(1);
    });

    it('onTestNextTracker transitions to SubdomainStageState when domainGroups is empty', () => {
        state.domainGroups = [];

        state.onTestNextTracker();

        expect(fsm.changeState).toHaveBeenCalled();
        const calledWith = fsm.changeState.mock.calls[0][0];
        expect(calledWith.constructor.name).toBe('SubdomainStageState');
    });

    it('onWebsiteBroke unblocks last group and adds to subdomainStageTrackers', () => {
        state.lastGroup = { domain: 'example.com', hosts: ['a.example.com', 'b.example.com'] };
        state.domainGroups = [];

        state.onWebsiteBroke();

        expect(fsm.sendTrackersUpdate).toHaveBeenCalledWith(false, ['a.example.com', 'b.example.com']);
        expect(fsm.subdomainStageTrackers.has('a.example.com')).toBe(true);
        expect(fsm.subdomainStageTrackers.has('b.example.com')).toBe(true);
    });
});

describe('SubdomainStageState', () => {
    let fsm, state;
    beforeEach(() => {
        fsm = {
            subdomainStageTrackers: new Set(['a.example.com', 'b.example.com']),
            necessaryTrackers: new Set(),
            sendTrackersUpdate: jest.fn(),
            updatePromptText: jest.fn(),
            changeState: jest.fn()
        };
        state = new SubdomainStageState(fsm);
    });

    it('onTestNextTracker blocks next subdomain and updates prompt', () => {
        state.subdomains = ['a.example.com', 'b.example.com'];

        state.onTestNextTracker();

        expect(fsm.sendTrackersUpdate).toHaveBeenCalledWith(true, ['a.example.com']);
        expect(fsm.updatePromptText).toHaveBeenCalledWith(1, expect.stringContaining('a.example.com'));
    });

    it('onTestNextTracker transitions to CompletedState when domainGroups is empty', () => {
        state.subdomains = [];

        state.onTestNextTracker();

        expect(fsm.changeState).toHaveBeenCalled();
        const calledWith = fsm.changeState.mock.calls[0][0];
        expect(calledWith.constructor.name).toBe('CompletedState');
    });

    it('onWebsiteBroke adds to necessaryTrackers and unblocks', () => {
        state.lastSubdomain = 'a.example.com';
        state.subdomains = ['b.example.com'];

        state.onWebsiteBroke();

        expect(fsm.necessaryTrackers.has('a.example.com')).toBe(true);
        expect(fsm.sendTrackersUpdate).toHaveBeenCalledWith(false, ['a.example.com']);
        expect(fsm.updatePromptText).toHaveBeenCalledWith(1, expect.stringContaining('a.example.com'));
    });
});

describe('CompletedState', () => {
    it('updates prompt and disables buttons', () => {
        const fsm = {
            necessaryTrackers: new Set(['a.example.com']),
            updatePromptText: jest.fn()
        };
        global.toggleButtonDisabledState = jest.fn();

        new CompletedState(fsm);

        expect(fsm.updatePromptText).toHaveBeenCalledWith(
            undefined,
            expect.stringContaining('a.example.com')
        );
    });
});
