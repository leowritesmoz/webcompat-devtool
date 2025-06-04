const { handleMessage, initBackground } = require('../background/background');


beforeAll(() => {
  global.browser = {
    experiments: {
      webcompatDebugger: {
        getUnblockedTrackers: jest.fn(async (tabId) => ['tracker1.com', 'tracker2.com']),
        updateUnblockedChannels: jest.fn(async () => {}),
        clearUnblockList: jest.fn(async () => {}),
        blockedRequestObserver: { addListener: jest.fn() },
      },
    },
    runtime: {
      sendMessage: jest.fn(async () => {}),
      onMessage: { addListener: jest.fn() },
    },
    tabs: {
      reload: jest.fn(async () => {}),
    },
  };
  initBackground();
});

describe('background.js handleMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles get-unblocked-trackers', async () => {
    await handleMessage({ msg: 'get-unblocked-trackers', tabId: 1 });
    expect(browser.experiments.webcompatDebugger.getUnblockedTrackers).toHaveBeenCalledWith(1);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      msg: 'unblocked-trackers',
      unblockedTrackers: ['tracker1.com', 'tracker2.com'],
      tabId: 1,
    });
  });

  it('handles update-multiple-trackers', async () => {
    await handleMessage({ msg: 'update-multiple-trackers', trackers: ['a.com'], blocked: true, tabId: 2 });
    expect(browser.experiments.webcompatDebugger.updateUnblockedChannels).toHaveBeenCalledWith(['a.com'], true, 2);
    expect(browser.runtime.sendMessage).toHaveBeenCalled();
    expect(browser.tabs.reload).toHaveBeenCalledWith(2, { bypassCache: true });
  });

  it('handles reset', async () => {
    await handleMessage({ msg: 'reset', tabId: 3 });
    expect(browser.experiments.webcompatDebugger.clearUnblockList).toHaveBeenCalledWith(3);
    expect(browser.runtime.sendMessage).toHaveBeenCalled();
    expect(browser.tabs.reload).toHaveBeenCalledWith(3, { bypassCache: true });
  });

  it('logs unknown message', async () => {
    console.error = jest.fn();
    await handleMessage({ msg: 'unknown', tabId: 4 });
    expect(console.error).toHaveBeenCalledWith('Unknown message:', { msg: 'unknown', tabId: 4 });
  });
});
