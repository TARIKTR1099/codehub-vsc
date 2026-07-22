import * as vscode from "vscode";
import { execSync } from "child_process";

// ── Types ──

interface Profile {
  id: string; name: string; icon?: string;
  shell: "powershell" | "cmd" | "wsl" | "bash" | "zsh" | "custom";
  shellPath?: string; commands: string[]; openIn: "cli" | "desktop" | "vscode";
}

interface LibItem { name: string; icon: string; shell: Profile["shell"]; commands: string[]; openIn: Profile["openIn"]; desc: string; }

// ── I18n ──

const _ = (tr: string, en: string) => ({ tr, en });
const T: Record<string, Record<string, string>> = {
  appName: _("CodeHub", "CodeHub"), settings: _("Ayarlar", "Settings"),
  library: _("Kütüphane", "Library"), addFromLib: _("Kütüphaneden Ekle", "Add from Library"),
  addProfile: _("Profil Ekle", "Add Profile"), deleteProfile: _("Sil", "Delete"),
  noProfiles: _("Henüz profil yok. Kütüphaneden ekleyin.", "No profiles. Add from Library."),
  confirmDel: _("Silmek istediğinize emin misiniz?", "Are you sure?"),
  created: _("Profil oluşturuldu", "Profile created"), deleted: _("Profil silindi", "Profile deleted"),
  updated: _("Profil güncellendi", "Profile updated"),
  statusTip: _("CodeHub - En üstteki profili çalıştır", "CodeHub - Run top profile"),
  serverWait: _("OpenCode sunucu başlatılıyor...", "Starting OpenCode server..."),
  serverErr: _("OpenCode CLI bulunamadı. PATH kontrol edin.", "OpenCode CLI not found. Check PATH."),
  loading: _("Yükleniyor...", "Loading..."), closeAll: _("Tümünü Kapat", "Close All"),
  confirmAllClose: _("Tüm terminalleri kapat?", "Close all terminals?"),
  terminalCount: _("{n} terminal", "{n} terminals"), yes: _("Evet", "Yes"), no: _("Hayır", "No"),
  profileList: _("Profiller ({n})", "Profiles ({n})"), first: _("En üstteki (ilk)", "Topmost (first)"),
  setStatusBar: _("Durum çubuğu profili seç", "Choose status bar profile"),
  setStartup: _("Başlangıç profili seç", "Choose startup profile"),
  setShortcut: _("Kısayol (Ctrl+Alt+T) profili seç", "Choose shortcut profile"),
  statusBarCur: _("Durum çubuğu: {name}", "Status bar: {name}"),
  startupCur: _("Başlangıç: {name}", "Startup: {name}"),
  shortcutCur: _("Kısayol: {name}", "Shortcut: {name}"),
  profileName: _("Profil adı", "Profile name"),
  iconLabel: _("İkon", "Icon"), noIcon: _("İkonsuz (Enter)", "No Icon (Enter)"),
  pickFile: _("Dosya Seç", "Pick File"), pasteUrl: _("URL Yapıştır", "Paste URL"),
  iconTheme: _("Tema İkonu", "Theme Icon"),
  shellType: _("Shell türü", "Shell type"), custom: _("Özelleştirilmiş", "Custom"),
  commands: _("Komutlar (alt satır = yeni, boş = direkt shell)", "Commands (new line = new, empty = direct)"),
  openIn: _("Açılacağı yer", "Open location"),
  cliOpt: _("OpenCode CLI (tam ekran)", "OpenCode CLI (fullscreen)"),
  desktopOpt: _("OpenCode Desktop (web panel)", "OpenCode Desktop (web panel)"),
  vscodeOpt: _("OpenCode VSCode (panel)", "OpenCode VSCode (panel)"),
  runPanel: _("Panelde aç", "Open in Panel"),
  runDesktop: _("Desktop", "Desktop"),
  quickActions: _("Hızlı Eylemler", "Quick Actions"),
  runDefCLI: _("CLI'de Çalıştır", "Run in CLI"),
  runDefDesktop: _("Desktop'ta Aç", "Open Desktop"),
  runDefVSC: _("VSCode'da Çalıştır", "Run in VSCode"),
};

function t(k: string): string {
  const l = vscode.workspace.getConfiguration("codehub").get<string>("language", "tr") === "en" ? "en" : "tr";
  return T[k]?.[l] ?? k;
}
function tt(k: string, a: Record<string, string | number>): string {
  let s = t(k); for (const [k2, v] of Object.entries(a)) s = s.replace(`{${k2}}`, String(v)); return s;
}

// ── Config ──

const K = "codehub";
function cfg() { return vscode.workspace.getConfiguration(K); }
function getP(): Profile[] { return cfg().get<Profile[]>("terminalProfiles", []); }
function setP(p: Profile[]) { cfg().update("terminalProfiles", p, vscode.ConfigurationTarget.Global); }
function genId(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function getA(k: string): string { return cfg().get<string>(k, "first"); }
function setA(k: string, v: string) { cfg().update(k, v, vscode.ConfigurationTarget.Global); }
function topId(): string { const l = getP(); return l.length > 0 ? l[0].id : ""; }
function resolveId(id: string): string { return id === "first" ? topId() : id; }
function findP(id: string): Profile | undefined { return getP().find((x) => x.id === id); }
function profileName(id: string): string {
  if (id === "first") return t("first");
  const p = findP(id); return p ? p.name : t("first");
}

// ── Library ──

const LIB: LibItem[] = [
  { name: "OpenCode CLI", icon: "terminal", shell: "powershell", commands: ["opencode"], openIn: "cli", desc: "OpenCode tam ekran" },
  { name: "OpenCode Desktop", icon: "browser", shell: "powershell", commands: ["opencode"], openIn: "desktop", desc: "OpenCode web panel" },
  { name: "OpenCode VSCode", icon: "terminal-powershell", shell: "powershell", commands: ["opencode"], openIn: "vscode", desc: "OpenCode panel" },
  { name: "Claude Code CLI", icon: "comment-discussion", shell: "cmd", commands: ["claude"], openIn: "cli", desc: "Claude Code tam ekran" },
  { name: "Claude Code Panel", icon: "comment-discussion", shell: "cmd", commands: ["claude"], openIn: "vscode", desc: "Claude Code panel" },
  { name: "Dev Terminal (Bash)", icon: "terminal-bash", shell: "bash", commands: [], openIn: "vscode", desc: "Bash terminali" },
  { name: "Node.js", icon: "symbol-variable", shell: "cmd", commands: ["node --version", "npm --version"], openIn: "vscode", desc: "Node.js" },
  { name: "Git Bash", icon: "git-branch", shell: "bash", commands: [], openIn: "vscode", desc: "Git Bash" },
  { name: "Python", icon: "symbol-ruler", shell: "cmd", commands: ["python --version"], openIn: "vscode", desc: "Python" },
  { name: "Docker", icon: "server-process", shell: "bash", commands: ["docker ps"], openIn: "vscode", desc: "Docker" },
  { name: "SSH", icon: "plug", shell: "powershell", commands: ["ssh user@host"], openIn: "cli", desc: "SSH" },
  { name: "WSL Ubuntu", icon: "linux", shell: "wsl", commands: [], openIn: "vscode", desc: "WSL Ubuntu" },
  { name: "PowerShell 7", icon: "terminal-powershell", shell: "powershell", commands: ["pwsh"], openIn: "vscode", desc: "pwsh" },
  { name: "CMD Classic", icon: "terminal-cmd", shell: "cmd", commands: [], openIn: "vscode", desc: "CMD" },
];

function fromLib(l: LibItem): Profile {
  return { id: genId(), name: l.name, icon: l.icon, shell: l.shell, commands: l.commands, openIn: l.openIn };
}

// ── Shell ──

function resolveShell(p: Profile): string | undefined {
  const m: Record<string, string | undefined> = { powershell: "powershell.exe", cmd: "cmd.exe", wsl: "wsl.exe", bash: "bash", zsh: "zsh" };
  return p.shell === "custom" ? p.shellPath || undefined : m[p.shell];
}

function resolveIcon(p: Profile): vscode.Uri | vscode.ThemeIcon {
  if (!p.icon) return new vscode.ThemeIcon("terminal");
  if (p.icon.startsWith("file:")) return vscode.Uri.file(p.icon.slice(5));
  if (p.icon.startsWith("url:")) return vscode.Uri.parse(p.icon.slice(4));
  return new vscode.ThemeIcon(p.icon);
}

// ── Terminal Runner ──

async function runTerminal(p: Profile) {
  const loc = p.openIn === "cli" ? { viewColumn: vscode.ViewColumn.One, preserveFocus: false } as const : undefined;
  const term = vscode.window.createTerminal({
    name: `${p.name} - CodeHub`, iconPath: resolveIcon(p),
    location: loc, shellPath: resolveShell(p),
  });
  term.show();
  if (loc) await vscode.commands.executeCommand("workbench.action.closeEditorsInOtherGroups");
  p.commands.forEach((c, i) => { if (c.trim()) setTimeout(() => term.sendText(c.trim(), true), i * 400 + 600); });
}

// ── Desktop Panel ──

let desktopPanel: vscode.WebviewPanel | undefined;
const srvPorts = new Set<number>();
const SRV = "oc-server";

function getOC(): string { return cfg().get<string>("opencodePath", "opencode"); }
function isOC(): boolean {
  try {
    const r = execSync(process.platform === "win32" ? `where ${getOC().split(" ")[0]} 2>nul` : `command -v ${getOC().split(" ")[0]} 2>/dev/null`, { encoding: "utf-8", timeout: 3000, windowsHide: true, stdio: "pipe" });
    return r.trim().length > 0;
  } catch { return false; }
}

function startSrv(port: number) {
  const t = vscode.window.createTerminal({ name: SRV, iconPath: new vscode.ThemeIcon("server"), location: undefined, hideFromUser: true, env: { _CH_PORT: port.toString() } as any });
  t.sendText(`${getOC()} --port ${port}`);
  srvPorts.add(port);
  const d = vscode.window.onDidCloseTerminal((x) => { if (x === t) { srvPorts.delete(port); d.dispose(); } });
}

async function waitSrv(port: number, tries = 40): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://localhost:${port}/app`); if (r.ok || r.status === 404) return true; } catch {}
    try { const r = await fetch(`http://localhost:${port}`); if (r.ok || r.status === 404) return true; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function openDesktop(ctx: vscode.ExtensionContext) {
  if (desktopPanel) { desktopPanel.reveal(vscode.ViewColumn.Active, false); return; }
  if (!isOC()) {
    const r = await vscode.window.showErrorMessage(t("serverErr"), t("settings"));
    if (r === t("settings")) vscode.commands.executeCommand("workbench.action.openSettings", `${K}.opencodePath`);
    return;
  }
  const nn = () => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; let r = ""; for (let i = 0; i < 32; i++) r += c[Math.floor(Math.random() * c.length)]; return r; };
  desktopPanel = vscode.window.createWebviewPanel("ch.desktop", "OpenCode Desktop", vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
  const n0 = nn();
  desktopPanel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${n0}'"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;display:flex;align-items:center;justify-content:center;background:var(--vscode-panel-background);color:var(--vscode-foreground);font-family:var(--vscode-font-family)}.sp{width:28px;height:28px;border:3px solid rgba(128,128,128,.3);border-top-color:var(--vscode-foreground);border-radius:50%;animation:sp .8s infinite}.t{margin-top:12px;font-size:13px;opacity:.6}@keyframes sp{to{transform:rotate(360deg)}}</style></head><body><div style="text-align:center"><div class="sp"></div><div class="t">${t("serverWait")}</div></div></body></html>`;
  desktopPanel.onDidDispose(() => { desktopPanel = undefined; });
  const port = Math.floor(Math.random() * 50000) + 1024;
  startSrv(port);
  const ok = await waitSrv(port);
  if (!desktopPanel) return;
  if (!ok) { desktopPanel.webview.html = `<!DOCTYPE html><html><body style="display:flex;align-items:center;justify-content:center;height:100%;font-family:var(--vscode-font-family);color:var(--vscode-errorForeground)">${t("serverErr")}</body></html>`; return; }
  const n1 = nn();
  desktopPanel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${n1}'; frame-src http://localhost:${port} https:"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;overflow:hidden;background:var(--vscode-panel-background)}iframe{width:100%;height:100%;border:none;background:#fff}</style></head><body><iframe src="http://localhost:${port}" allow="clipboard-read;clipboard-write"></iframe><script nonce="${n1}">acquireVsCodeApi()<\/script></body></html>`;
}

// ── Profile Actions ──

function runDefault() {
  const id = cfg().get<string>("defaultProfile", "") || topId();
  const p = findP(id); if (p) runTerminal(p);
}

async function pickProfile(title: string, settingKey: string) {
  const profiles = getP();
  const current = getA(settingKey);
  const items = [
    { label: `$(chevron-up) ${t("first")}`, description: "", id: "first" },
    ...profiles.map((p) => ({ label: `$(terminal) ${p.name}`, description: p.shell, id: p.id })),
  ];
  const pick = await vscode.window.showQuickPick(items, { placeHolder: title });
  if (!pick) return;
  setA(settingKey, pick.id);
  vscode.window.showInformationMessage(`${title}: ${pick.label.replace(/^\$\([^\)]+\) /, "")}`);
}

// ── Icon Picker ──

async function pickIcon(existing?: string): Promise<string | undefined> {
  const ch = await vscode.window.showQuickPick([
    { label: t("noIcon"), id: "none" }, { label: t("iconTheme"), id: "theme" },
    { label: t("pickFile"), id: "file" }, { label: t("pasteUrl"), id: "url" },
  ], { placeHolder: t("iconLabel") });
  if (!ch) return undefined;
  if (ch.id === "none") return existing !== undefined ? existing : "";
  if (ch.id === "file") {
    const f = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectMany: false, filters: { Images: ["png", "jpg", "jpeg", "svg", "ico", "webp"] } });
    if (!f || f.length === 0) return undefined; return "file:" + f[0].fsPath;
  }
  if (ch.id === "url") {
    const u = await vscode.window.showInputBox({ prompt: t("iconLabel"), value: existing || "", placeHolder: "https://... / data:..." });
    return u === undefined ? undefined : u ? "url:" + u : "";
  }
  const icons = ["terminal","terminal-powershell","terminal-cmd","terminal-bash","terminal-linux","browser","globe","comment-discussion","git-branch","symbol-variable","symbol-ruler","server","server-process","database","cloud","plug","tools","beaker","light-bulb","star","heart","info","check","pulse","book","code","rocket","zap","sync","play","debug","gear","search","home","pin","bell","mail","calendar","clock","person","organization","link","extensions","window","layout-sidebar-left","layout-panel","screen-full","split-horizontal","split-vertical","folder","file","package","shield","lock","key"];
  const pick = await vscode.window.showQuickPick(icons.map((i) => ({ label: `$(${i}) ${i}`, id: i })), { placeHolder: t("iconLabel") });
  return pick?.id;
}

// ── Profile Dialog ──

async function profileDialog(existing?: Profile): Promise<Profile | undefined> {
  const name = await vscode.window.showInputBox({ prompt: t("profileName"), value: existing?.name || "", placeHolder: "Claude Code CLI, Dev, ..." });
  if (name === undefined) return;
  const icon = await pickIcon(existing?.icon);
  if (icon === undefined) return;
  const sp = await vscode.window.showQuickPick([
    { label: "PowerShell", id: "powershell" }, { label: "CMD", id: "cmd" }, { label: "WSL", id: "wsl" },
    { label: "Bash", id: "bash" }, { label: "Zsh", id: "zsh" }, { label: t("custom"), id: "custom" },
  ], { placeHolder: t("shellType") });
  if (!sp) return;
  const shell = sp.id as Profile["shell"];
  let shellPath: string | undefined;
  if (shell === "custom") { const p = await vscode.window.showInputBox({ prompt: "C:\\tools\\my-shell.exe", value: existing?.shellPath || "" }); if (p === undefined) return; shellPath = p || undefined; }
  const cr = await vscode.window.showInputBox({ prompt: t("commands"), value: (existing?.commands || [""]).join("\n"), placeHolder: "echo hello\nnpm start" });
  if (cr === undefined) return;
  const commands = cr.split("\n").map((l) => l.trim()).filter(Boolean);
  const op = await vscode.window.showQuickPick([
    { label: t("cliOpt"), id: "cli" }, { label: t("desktopOpt"), id: "desktop" }, { label: t("vscodeOpt"), id: "vscode" },
  ], { placeHolder: t("openIn") });
  if (!op) return;
  return { id: existing?.id || genId(), name, icon: icon || undefined, shell, shellPath, commands, openIn: op.id as "cli" | "desktop" | "vscode" };
}

async function pickFromLib(): Promise<Profile | undefined> {
  const pick = await vscode.window.showQuickPick(
    LIB.map((l) => ({ label: `$(${l.icon}) ${l.name}`, description: l.desc, detail: `${l.shell} | ${l.openIn}${l.commands.length ? " | " + l.commands.join(", ") : ""}`, lib: l })),
    { placeHolder: t("library"), matchOnDescription: true, matchOnDetail: true }
  );
  return pick ? fromLib(pick.lib) : undefined;
}

// ── Side Panel ──

class SidePanel implements vscode.WebviewViewProvider {
  static vt = "codehub.sidePanel";
  private v?: vscode.WebviewView;
  constructor(private ctx: vscode.ExtensionContext) {}

  resolveWebviewView(vw: vscode.WebviewView) {
    this.v = vw; vw.webview.options = { enableScripts: true };
    vw.webview.html = this.html();
    vw.onDidDispose(() => { this.v = undefined; });
    vw.webview.onDidReceiveMessage(async (m) => {
      const g = () => findP(m.id);
      if (m.type === "qs-cli") { const p = findP(getA("statusBarProfile") === "first" ? topId() : getA("statusBarProfile")); if (p) await runTerminal({ ...p, openIn: "cli" }); this.sync(); return; }
      if (m.type === "qs-desk") { openDesktop(this.ctx); return; }
      if (m.type === "qs-vsc") { const p = findP(getA("statusBarProfile") === "first" ? topId() : getA("statusBarProfile")); if (p) await runTerminal({ ...p, openIn: "vscode" }); this.sync(); return; }
      if (m.type === "run") { const x = g(); if (x) { if (x.openIn === "desktop") { openDesktop(this.ctx); return; } await runTerminal(x); } this.sync(); return; }
      if (m.type === "runV") { const x = g(); if (x) await runTerminal({ ...x, openIn: "vscode" }); this.sync(); return; }
      if (m.type === "runD") { const x = g(); if (x) { openDesktop(this.ctx); } this.sync(); return; }
      if (m.type === "closeAll") {
        if (cfg().get<boolean>("confirmCloseAll", true)) { const r = await vscode.window.showQuickPick([t("yes"), t("no")], { placeHolder: t("confirmAllClose") }); if (r !== t("yes")) return; }
        vscode.window.terminals.filter((t) => t.name.includes("CodeHub") || t.name === SRV).forEach((t) => t.dispose()); srvPorts.clear(); this.sync(); return;
      }
      if (m.type === "addLib") { const l = await pickFromLib(); if (!l) { this.sync(); return; } const list = getP(); list.push(l); setP(list); this.sync(); vscode.window.showInformationMessage(`${t("created")}: ${l.name}`); return; }
      if (m.type === "add") { const r = await profileDialog(); if (!r) { this.sync(); return; } const list = getP(); list.push(r); setP(list); this.sync(); vscode.window.showInformationMessage(`${t("created")}: ${r.name}`); return; }
      if (m.type === "edit") { const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return; const u = await profileDialog(list[i]); if (!u) { this.sync(); return; } list[i] = u; setP(list); this.sync(); vscode.window.showInformationMessage(t("updated")); return; }
      if (m.type === "delete") { const ok = (await vscode.window.showQuickPick([t("yes"), t("no")], { placeHolder: t("confirmDel") })) === t("yes"); if (!ok) { this.sync(); return; } const list = getP().filter((x) => x.id !== m.id); setP(list); if (cfg().get<string>("defaultProfile", "") === m.id) cfg().update("defaultProfile", "", vscode.ConfigurationTarget.Global); this.sync(); vscode.window.showInformationMessage(t("deleted")); return; }
      if (m.type === "dup") { const x = g(); if (!x) return; const c = { ...x, id: genId(), name: `${x.name} (kopya)` }; const list = getP(); list.push(c); setP(list); this.sync(); vscode.window.showInformationMessage(t("updated")); return; }
      if (m.type === "up" || m.type === "down") { const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return; const j = m.type === "up" ? i - 1 : i + 1; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; setP(list); this.sync(); return; }
      if (m.type === "p-status") { pickProfile(t("setStatusBar"), "statusBarProfile"); this.sync(); return; }
      if (m.type === "p-startup") { pickProfile(t("setStartup"), "startupProfile"); this.sync(); return; }
      if (m.type === "p-shortcut") { pickProfile(t("setShortcut"), "shortcutProfile"); this.sync(); return; }
      if (m.type === "set") { vscode.commands.executeCommand("workbench.action.openSettings", K); return; }
    });
  }

  sync() { if (this.v) this.v.webview.html = this.html(); }

  private html(): string {
    const list = getP(); const lang = cfg().get<string>("language", "tr") === "en" ? "en" : "tr";
    const tc = vscode.window.terminals.filter((t) => t.name.includes("CodeHub")).length;
    const n = () => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; let r = ""; for (let i = 0; i < 32; i++) r += c[Math.floor(Math.random() * c.length)]; return r; };
    const esc = (s: string) => s.replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[m] || m);

    const profileRows = list.map((p) => {
      const isDef = p.id === (cfg().get<string>("defaultProfile", "") || topId());
      const icon = p.icon ? `<span class="ti codicon codicon-${esc(p.icon)}"></span>` : `<span class="si">${p.shell[0].toUpperCase()}</span>`;
      const mc = p.openIn === "cli" ? "mc-c" : p.openIn === "desktop" ? "mc-d" : "mc-v";
      return `<div class="pr ${isDef?"d":""}">
        <div class="pi" onclick="p('run','${p.id}')">
          ${icon}<span class="pn">${esc(p.name)}</span>
          <span class="mc ${mc}"></span>
        </div>
        <div class="pa">
          <button class="b" onclick="p('runV','${p.id}')" title="VSCode">\u25B3</button>
          <button class="b" onclick="p('runD','${p.id}')" title="Desktop">\u25A0</button>
          <button class="b" onclick="p('dup','${p.id}')" title="Kopyala">\u{1F4CB}</button>
          <button class="b" onclick="p('up','${p.id}')" title="Yukar\u0131">\u25B2</button>
          <button class="b" onclick="p('down','${p.id}')" title="A\u015Fa\u011F\u0131">\u25BC</button>
          <button class="b" onclick="p('edit','${p.id}')" title="D\u00FCzenle">\u270E</button>
          <button class="b d" onclick="p('delete','${p.id}')" title="Sil">\u2716</button>
        </div>
      </div>`;
    }).join("");

    const sb = profileName(getA("statusBarProfile"));
    const su = profileName(getA("startupProfile"));
    const sk = profileName(getA("shortcutProfile"));

    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"/><style>
*{margin:0;padding:0;box-sizing:border-box}
body{padding:12px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);line-height:1.5}
.h{font-size:15px;font-weight:600;display:flex;align-items:center;gap:8px;margin-bottom:10px}
.h .s{font-size:12px;font-weight:400;opacity:.5;margin-left:auto}
.q{display:flex;gap:6px;margin-bottom:8px}
.qb{flex:1;padding:10px 8px;border:none;border-radius:6px;cursor:pointer;font-size:13px;text-align:center;background:var(--vscode-button-background);color:var(--vscode-button-foreground);font-weight:500}
.qb:hover{opacity:.85}
.qs{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.sl{font-size:12px;text-transform:uppercase;opacity:.5;letter-spacing:.5px;margin:10px 0 6px;font-weight:600}
.ac{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.acb{padding:8px 10px;border:none;border-radius:6px;cursor:pointer;font-size:12px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);flex:1;min-width:100px;text-align:center}
.acb:hover{opacity:.85}
.acb .lbl{font-size:10px;opacity:.6;display:block;margin-bottom:3px}
.pr{display:flex;align-items:center;gap:4px;padding:8px 8px;border-radius:6px;margin:3px 0;transition:background .1s}
.pr:hover{background:var(--vscode-list-hoverBackground)}
.pr.d{background:color-mix(in srgb,var(--vscode-focusBorder) 8%,transparent);border:1px solid color-mix(in srgb,var(--vscode-focusBorder) 20%,transparent)}
.pi{display:flex;align-items:center;gap:8px;cursor:pointer;flex:1;min-width:0}
.ti{width:22px;height:22px;font-size:18px;flex-shrink:0;display:flex;align-items:center;justify-content:center;opacity:.9}
.si{width:24px;height:24px;border-radius:5px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0}
.pn{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.mc{width:8px;height:8px;border-radius:4px;flex-shrink:0}
.mc-c{background:var(--vscode-testing-iconPassed)}
.mc-d{background:var(--vscode-testing-iconFailed)}
.mc-v{background:var(--vscode-testing-iconQueued)}
.pa{display:flex;gap:4px;flex-shrink:0}
.b{width:24px;height:24px;border:none;border-radius:4px;cursor:pointer;font-size:11px;background:transparent;color:var(--vscode-foreground);opacity:.4;display:flex;align-items:center;justify-content:center;padding:0;transition:all .1s}
.b:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground);transform:scale(1.15)}
.b.d:hover{color:var(--vscode-errorForeground)}
.st{font-size:12px;opacity:.4}
.emp{padding:20px;text-align:center;font-size:13px;opacity:.5;line-height:1.6}
.acb-a{background:color-mix(in srgb,var(--vscode-button-background) 20%,transparent);color:var(--vscode-foreground)}
</style></head><body>
<div class="h">CodeHub <span class="s">${tc > 0 ? tt("terminalCount",{n:tc}) : ''}</span></div>

<div class="ac">
  <button class="acb acb-a" onclick="p('p-status')"><span class="lbl">${t("setStatusBar")}</span>${esc(sb)}</button>
  <button class="acb" onclick="p('p-startup')"><span class="lbl">${t("setStartup")}</span>${esc(su)}</button>
  <button class="acb" onclick="p('p-shortcut')"><span class="lbl">${t("setShortcut")}</span>${esc(sk)}</button>
</div>

<div class="sl">${t("addProfile")}</div>
${list.length > 0 ? profileRows : `<div class="emp">${t("noProfiles")}</div>`}

<div style="display:flex;gap:4px;margin-top:4px">
  <button class="qb qs" style="flex:1;border:1px dashed var(--vscode-input-border)" onclick="p('add')">+ ${t("addProfile")}</button>
  <button class="qb qs" style="flex:1" onclick="p('addLib')">${t("addFromLib")}</button>
</div>

<button class="qb qs" style="margin-top:8px" onclick="p('set')">${t("settings")}</button>
<button class="qb qs" style="margin-top:4px;background:color-mix(in srgb,var(--vscode-errorForeground) 15%,transparent);color:var(--vscode-errorForeground)" onclick="p('closeAll')">${t("closeAll")}</button>

<script nonce="${n()}">const v=acquireVsCodeApi();function p(t,i){v.postMessage({type:t,id:i})}<\/script>
</body></html>`;
  }
}

// ── Activate ──

export function activate(ctx: vscode.ExtensionContext) {
  const side = new SidePanel(ctx);
  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider(SidePanel.vt, side, { webviewOptions: { retainContextWhenHidden: true } }));

  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.runDefault", runDefault));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openDesktop", () => openDesktop(ctx)));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.closeAllTerminals", () => vscode.window.terminals.filter((t) => t.name.includes("CodeHub") || t.name === SRV).forEach((t) => t.dispose())));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", K)));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setStatusBarProfile", () => pickProfile(t("setStatusBar"), "statusBarProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setStartupProfile", () => pickProfile(t("setStartup"), "startupProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setShortcutProfile", () => pickProfile(t("setShortcut"), "shortcutProfile")));

  const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  sb.show(); ctx.subscriptions.push(sb);
  const upd = () => {
    const n = vscode.window.terminals.filter((t) => t.name.includes("CodeHub")).length;
    sb.text = n > 0 ? `$(terminal) CodeHub (${n})` : "$(terminal) CodeHub";
    sb.command = "codehub.runDefault";
  };
  upd();
  ctx.subscriptions.push(vscode.window.onDidOpenTerminal(upd));
  ctx.subscriptions.push(vscode.window.onDidCloseTerminal(() => { upd(); side.sync(); }));
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(K)) side.sync(); }));

  const delay = cfg().get<number>("startupDelay", 1200);
  if (cfg().get<string>("startupMode", "defaultProfile") !== "none") {
    setTimeout(() => {
      const id = getA("startupProfile");
      const p = findP(resolveId(id));
      if (p) runTerminal(p); else runDefault();
    }, delay);
  }
}

export function deactivate() { srvPorts.clear(); }
