import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  update: vi.fn(async () => undefined),
}));
vi.mock("virtual:pwa-register", () => ({ registerSW: mocks.register }));

interface Callbacks {
  onOfflineReady(): void;
  onNeedRefresh(): void;
  onNeedReload(): void;
  onRegisteredSW(url: string, registration: object): void;
}

describe("PWA installation and update lifecycle", () => {
  let browser: EventTarget & { location: { reload: ReturnType<typeof vi.fn> } };
  let callbacks: Callbacks;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("PROD", true);
    browser = Object.assign(new EventTarget(), {
      isSecureContext: true,
      location: { reload: vi.fn() },
      matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
    });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
    vi.stubGlobal("navigator", {
      onLine: true,
      // Remains pending until the test explicitly supplies successful installation callbacks.
      serviceWorker: { ready: new Promise(() => undefined) },
      storage: { persist: vi.fn(async () => true) },
    });
    mocks.register.mockImplementation((value: Callbacks) => {
      callbacks = value;
      return mocks.update;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("registers once and does not report offline readiness before caching completes", async () => {
    const pwa = await import("../../src/pwa/register");
    pwa.initializePwa();
    pwa.initializePwa();
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(pwa.getPwaState().offlineReady).toBe(false);
    callbacks.onOfflineReady();
    expect(pwa.getPwaState().offlineReady).toBe(true);
  });

  it("offers updates without interrupting the game and activates only on explicit request", async () => {
    const pwa = await import("../../src/pwa/register");
    pwa.initializePwa();
    callbacks.onRegisteredSW("sw.js", { waiting: {}, active: {}, update: vi.fn() });
    callbacks.onNeedRefresh();
    expect(pwa.getPwaState().needRefresh).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(browser.location.reload).not.toHaveBeenCalled();
    // An update activated by a different tab must not forcibly reload this game.
    callbacks.onNeedReload();
    expect(browser.location.reload).not.toHaveBeenCalled();
    await pwa.applyPwaUpdate();
    expect(mocks.update).toHaveBeenCalledWith(true);
    callbacks.onNeedReload();
    expect(browser.location.reload).toHaveBeenCalledTimes(1);
  });

  it("uses an active cache after restart and keeps readiness when network disappears", async () => {
    const pwa = await import("../../src/pwa/register");
    pwa.initializePwa();
    callbacks.onRegisteredSW("sw.js", { active: {}, update: vi.fn(async () => undefined) });
    browser.dispatchEvent(new Event("offline"));
    expect(pwa.getPwaState()).toMatchObject({ offlineReady: true, online: false });
    browser.dispatchEvent(new Event("online"));
    expect(pwa.getPwaState().online).toBe(true);
  });

  it("waits for complete offline assets before allowing installation", async () => {
    const pwa = await import("../../src/pwa/register");
    pwa.initializePwa();
    const prompt = vi.fn(async () => undefined);
    browser.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
    }));
    expect(pwa.getPwaState().installAvailable).toBe(true);
    expect(await pwa.installPwa()).toBe(false);
    expect(prompt).not.toHaveBeenCalled();
    callbacks.onOfflineReady();
    expect(await pwa.installPwa()).toBe(true);
    expect(prompt).toHaveBeenCalledTimes(1);
    browser.dispatchEvent(new Event("appinstalled"));
    expect(pwa.getPwaState()).toMatchObject({ installed: true, installAvailable: false });
  });
});
