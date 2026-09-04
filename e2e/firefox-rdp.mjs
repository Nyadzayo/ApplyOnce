// Minimal Firefox Remote Debugging Protocol client — just enough to sideload
// a temporary add-on, which is what `web-ext run` does under the hood. Keeps
// the repo free of an extra devDependency (CLAUDE.md rule 10).
//
// Wire format: `<byteLength>:<json>` packets over TCP. Firefox must be
// started with `-start-debugger-server <port>` and the prompt pref disabled.
import net from "node:net";

export class FirefoxRDP {
  #sock;
  #buf = "";
  #waiters = new Map(); // actor → resolve
  #listeners = new Set(); // (msg) => boolean handled
  #targets = new Map(); // addonId → background target form
  #frames = []; // every frame target form seen
  #watching = new Set();
  #hello;

  static async connect(port, { retries = 40, delayMs = 250 } = {}) {
    let last;
    for (let i = 0; i < retries; i++) {
      try {
        const rdp = new FirefoxRDP();
        await rdp.#open(port);
        return rdp;
      } catch (e) {
        last = e;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw last;
  }

  #open(port) {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ port, host: "127.0.0.1" });
      this.#sock = sock;
      this.#hello = resolve;
      sock.setEncoding("utf8");
      sock.on("data", (d) => this.#onData(d));
      sock.on("error", reject);
    });
  }

  #onData(chunk) {
    this.#buf += chunk;
    for (;;) {
      const colon = this.#buf.indexOf(":");
      if (colon < 0) return;
      const len = Number(this.#buf.slice(0, colon));
      const body = this.#buf.slice(colon + 1);
      if (Buffer.byteLength(body, "utf8") < len) return;
      // slice by bytes, not chars
      const bytes = Buffer.from(body, "utf8");
      const json = bytes.subarray(0, len).toString("utf8");
      this.#buf = bytes.subarray(len).toString("utf8");
      const msg = JSON.parse(json);
      if (this.#hello) {
        this.#hello(this);
        this.#hello = null;
        continue;
      }
      let handled = false;
      for (const l of this.#listeners) if (l(msg)) handled = true;
      if (handled) continue;
      const w = this.#waiters.get(msg.from);
      if (w) {
        this.#waiters.delete(msg.from);
        w(msg);
      }
    }
  }

  request(to, payload) {
    return new Promise((resolve, reject) => {
      this.#waiters.set(to, (m) => (m.error ? reject(new Error(`${m.error}: ${m.message}`)) : resolve(m)));
      const json = JSON.stringify({ to, ...payload });
      this.#sock.write(`${Buffer.byteLength(json, "utf8")}:${json}`);
    });
  }

  /** Sideload an unpacked extension dir; returns { id, manifestURL, uuid }. */
  async installTemporaryAddon(addonPath) {
    const root = await this.request("root", { type: "getRoot" });
    const res = await this.request(root.addonsActor, {
      type: "installTemporaryAddon",
      addonPath,
      openDevTools: false,
    });
    const id = res.addon.id;
    const { addons } = await this.request("root", { type: "listAddons" });
    const mine = addons.find((a) => a.id === id);
    const manifestURL = mine?.manifestURL ?? "";
    const uuid = manifestURL.match(/^moz-extension:\/\/([^/]+)\//)?.[1] ?? "";
    return { id, manifestURL, uuid };
  }

  /** Resolve with the first unsolicited packet matching `pred`. */
  waitFor(pred, timeoutMs = 30_000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.#listeners.delete(l);
        reject(new Error("rdp waitFor timeout"));
      }, timeoutMs);
      const l = (m) => {
        if (!pred(m)) return false;
        clearTimeout(t);
        this.#listeners.delete(l);
        resolve(m);
        return true;
      };
      this.#listeners.add(l);
    });
  }

  /**
   * Evaluate JS inside the add-on's background context (what the DevTools
   * add-on debugger does). `text` may await; return a JSON-able value.
   */
  async evalInAddon(addonId, text) {
    const { addons } = await this.request("root", { type: "listAddons" });
    const desc = addons.find((a) => a.id === addonId);
    if (!desc) throw new Error(`addon ${addonId} not listed`);
    await this.#watch(addonId, desc);
    // several frame targets can appear (fallback document, panel tabs);
    // we want the background page
    const isBg = (t) => /_generated_background_page\.html|background/.test(t?.url ?? "") && !t?.isFallbackExtensionDocument;
    const target = await this.#findFrame(isBg);
    return this.#evalIn(target.consoleActor, text);
  }

  /** Evaluate in an extension page (e.g. sidepanel.html) matched by URL. */
  async evalInPage(addonId, urlRe, text) {
    const { addons } = await this.request("root", { type: "listAddons" });
    const desc = addons.find((a) => a.id === addonId);
    await this.#watch(addonId, desc);
    const target = await this.#findFrame((t) => urlRe.test(t?.url ?? ""));
    return this.#evalIn(target.consoleActor, text);
  }

  async #watch(addonId, desc) {
    if (this.#watching.has(addonId)) return;
    this.#watching.add(addonId);
    // modern protocol: descriptor → watcher → watchTargets → target forms
    const watcher = await this.request(desc.actor, {
      type: "getWatcher",
      isServerTargetSwitchingEnabled: true,
      isPopupDebuggingEnabled: false,
    });
    this.#listeners.add((m) => {
      if (m.from === watcher.actor && m.type === "target-available-form") this.#frames.push(m.target);
      if (m.from === watcher.actor && m.type === "target-destroyed-form") {
        this.#frames = this.#frames.filter((f) => f.actor !== m.target?.actor);
      }
      return false;
    });
    await this.request(watcher.actor, { type: "watchTargets", targetType: "frame" });
  }

  async #findFrame(pred, timeoutMs = 15_000) {
    const t0 = Date.now();
    for (;;) {
      const hit = this.#frames.find(pred);
      if (hit) return hit;
      if (Date.now() - t0 > timeoutMs) {
        throw new Error("no matching frame target; seen: " + this.#frames.map((f) => f.url).join(", "));
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  async #evalIn(consoleActor, text) {
    const done = this.waitFor((m) => m.from === consoleActor && m.type === "evaluationResult");
    await this.request(consoleActor, {
      type: "evaluateJSAsync",
      text: `(async () => { ${text} })().then(v => JSON.stringify(v ?? null), e => "__ERR__" + (e && e.message || e))`,
      mapped: { await: true },
    });
    const res = await done;
    if (res.exceptionMessage) throw new Error(res.exceptionMessage);
    let r = res.result;
    // promise results come back as an object grip; ask for its fulfilled value
    if (r && typeof r === "object" && r.class === "Promise") {
      if (r.promiseState?.state === "fulfilled") r = r.promiseState.value;
      else throw new Error("promise not settled: " + JSON.stringify(r.promiseState));
    }
    if (typeof r === "string" && r.startsWith("__ERR__")) throw new Error(r.slice(7));
    return typeof r === "string" ? JSON.parse(r) : r;
  }

  close() {
    this.#sock.destroy();
  }
}
