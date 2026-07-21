import * as vscode from "vscode";
import { execSync } from "child_process";

// ── Types ──

interface Profile {
  id: string;
  name: string;
  icon?: string;   // ThemeIcon id or "file:path" or "url:..."
  shell: "powershell" | "cmd" | "wsl" | "bash" | "zsh" | "custom";
  shellPath?: string;
  commands: string[];
  openIn: "cli" | "desktop" | "vscode";
}

interface LibraryItem {
  name: string;
  icon: string;
  shell: Profile["shell"];
  commands: string[];
  openIn: Profile["openIn"];
  desc: string;
}

// ── I18n ──

type L = "tr" | "en";
const _ = (tr: string, en: string) => ({ tr, en });
const T: Record<string, Record<L, string>> = {
  appName: _("CodeHub", "CodeHub"),
  library: _("Kütüphane", "Library"),
  addFromLib: _("Kütüphaneden Ekle", "Add from Library"),
  opencodeCLI: _("OpenCode CLI", "OpenCode CLI"),
  opencodeDesktop: _("OpenCode Desktop", "OpenCode Desktop"),
  opencodeVSCode: _("OpenCode VSCode", "OpenCode VSCode"),
  claudeCode: _("Claude Code CLI", "Claude Code CLI"),
  claudeVSC: _("Claude Code Panel", "Claude Code Panel"),
  devTerminal: _("Geliştirici Terminali", "Dev Terminal"),
  nodeJS: _("Node.js", "Node.js"),
  gitBash: _("Git Bash", "Git Bash"),
  pythonEnv: _("Python Env", "Python Env"),
  dockerTerm: _("Docker Terminal", "Docker Terminal"),
  sshTerm: _("SSH Terminal", "SSH Terminal"),
  wslTerm: _("WSL Ubuntu", "WSL Ubuntu"),
  closeAll: _("Tümünü Kapat", "Close All"),
  addProfile: _("Profil Ekle", "Add Profile"),
  duplicate: _("Kopyala", "Duplicate"),
  deleteProfile: _("Sil", "Delete"),
  moveUp: _("Yukarı", "Up"),
  moveDown: _("Aşağı", "Down"),
  settings: _("Ayarlar", "Settings"),
  profileName: _("Profil adı", "Profile name"),
  iconLabel: _("İkon seç veya URL yapıştır", "Pick icon or paste URL"),
  noIcon: _("İkonsuz (Enter)", "No Icon (Enter)"),
  pickFile: _("Dosya Seç", "Pick File"),
  pasteUrl: _("URL Yapıştır", "Paste URL"),
  iconTheme: _("Tema İkonu", "Theme Icon"),
  shellType: _("Shell türü", "Shell type"),
  commands: _("Komutlar (alt satır = yeni, boş = direkt shell)", "Commands (new line = new, empty = direct)"),
  openIn: _("Açılacağı yer", "Open location"),
  cliOpt: _("OpenCode CLI (tam ekran)", "OpenCode CLI (fullscreen)"),
  desktopOpt: _("OpenCode Desktop (web panel)", "OpenCode Desktop (web panel)"),
  vscodeOpt: _("OpenCode VSCode (panel)", "OpenCode VSCode (panel)"),
  custom: _("Özelleştirilmiş", "Custom"),
  confirmDel: _("Silmek istediğinize emin misiniz?", "Are you sure?"),
  created: _("Profil oluşturuldu", "Profile created"),
  deleted: _("Profil silindi", "Profile deleted"),
  updated: _("Profil güncellendi", "Profile updated"),
  duplicated: _("Profil kopyalandı", "Profile duplicated"),
  defaultSet: _("Varsayılan yapıldı", "Set as default"),
  noProfiles: _("Henüz profil yok. Kütüphaneden ekleyin veya + ile oluşturun.", "No profiles. Add from Library or tap +."),
  statusTip: _("CodeHub - En üstteki profili çalıştır", "CodeHub - Run top profile"),
  serverWait: _("OpenCode sunucu başlatılıyor...", "Starting OpenCode server..."),
  serverErr: _("Sunucuya ulaşılamadı. opencode CLI kurulu mu?", "Server unreachable. Is opencode CLI installed?"),
  loading: _("Yükleniyor...", "Loading..."),
  terminalCount: _("{n} terminal", "{n} terminals"),
  confirmAllClose: _("Tüm CodeHub terminallerini kapat?", "Close all CodeHub terminals?"),
  statusBarAction: _("Durum çubuğu profili", "Status bar profile"),
  startupProfile: _("Başlangıç profili", "Startup profile"),
  shortcutAction: _("Kısayol (Ctrl+Alt+T)", "Shortcut (Ctrl+Alt+T)"),
  firstProfile: _("En üstteki (ilk)", "Topmost (first)"),
  none: _("Hiçbiri", "None"),
  yes: _("Evet", "Yes"),
  no: _("Hayır", "No"),
  profileList: _("Profiller ({n})", "Profiles ({n})"),
  viewInSidebar: _("Etkinlik çubuğunda göster", "Show in Activity Bar"),
  libraryDesc: _("Hazır profilleri ekleyin", "Add ready-made profiles"),
  runPanel: _("Panelde aç", "Open in Panel"),
  runFull: _("Tam ekran aç", "Open Fullscreen"),
  runDesktop: _("Desktop aç", "Open Desktop"),
};

function t(k: string): string {
  const l: L = vscode.workspace.getConfiguration("codehub").get<string>("language", "tr") === "en" ? "en" : "tr";
  return T[k]?.[l] ?? k;
}
function tt(k: string, a: Record<string, string | number>): string {
  let s = t(k);
  for (const [k2, v] of Object.entries(a)) s = s.replace(`{${k2}}`, String(v));
  return s;
}

// ── Config ──

const K = "codehub";
function cfg() { return vscode.workspace.getConfiguration(K); }
function getP(): Profile[] { return cfg().get<Profile[]>("terminalProfiles", []); }
function setP(p: Profile[]) { cfg().update("terminalProfiles", p, vscode.ConfigurationTarget.Global); }
function getDef(): string { return cfg().get<string>("defaultProfile", ""); }
function setDef(id: string) { cfg().update("defaultProfile", id, vscode.ConfigurationTarget.Global); }
function genId(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function topId(): string { const list = getP(); return list.length > 0 ? list[0].id : ""; }
function resolveId(id: string): string { return id === "first" ? topId() : id; }
function findP(id: string): Profile | undefined { return getP().find((x) => x.id === id); }

// ── Profile Library ──

const LIBRARY: LibraryItem[] = [
  { name: "OpenCode CLI", icon: "terminal", shell: "powershell", commands: ["opencode"], openIn: "cli", desc: "OpenCode tam ekran terminal" },
  { name: "OpenCode Desktop", icon: "browser", shell: "powershell", commands: ["opencode"], openIn: "desktop", desc: "OpenCode web panel" },
  { name: "OpenCode VSCode", icon: "terminal-powershell", shell: "powershell", commands: ["opencode"], openIn: "vscode", desc: "OpenCode VSCode panel" },
  { name: "Claude Code CLI", icon: "comment-discussion", shell: "cmd", commands: ["claude"], openIn: "cli", desc: "Claude Code tam ekran" },
  { name: "Claude Code Panel", icon: "comment-discussion", shell: "cmd", commands: ["claude"], openIn: "vscode", desc: "Claude Code VSCode panel" },
  { name: "Dev Terminal", icon: "terminal-bash", shell: "bash", commands: [], openIn: "vscode", desc: "Bash geliştirme terminali" },
  { name: "Node.js", icon: "symbol-variable", shell: "cmd", commands: ["node --version", "npm --version"], openIn: "vscode", desc: "Node.js ortamı" },
  { name: "Git Bash", icon: "git-branch", shell: "bash", commands: [], openIn: "vscode", desc: "Git Bash terminali" },
  { name: "Python Env", icon: "symbol-ruler", shell: "cmd", commands: ["python --version", "pip list"], openIn: "vscode", desc: "Python ortamı" },
  { name: "Docker Terminal", icon: "server-process", shell: "bash", commands: ["docker ps"], openIn: "vscode", desc: "Docker komutları" },
  { name: "SSH Terminal", icon: "plug", shell: "powershell", commands: ["ssh user@host"], openIn: "cli", desc: "SSH bağlantısı" },
  { name: "WSL Ubuntu", icon: "linux", shell: "wsl", commands: [], openIn: "vscode", desc: "WSL Ubuntu terminali" },
  { name: "PowerShell 7", icon: "terminal-powershell", shell: "powershell", commands: ["pwsh"], openIn: "vscode", desc: "PowerShell 7 (pwsh)" },
  { name: "CMD Classic", icon: "terminal-cmd", shell: "cmd", commands: [], openIn: "vscode", desc: "Klasik CMD" },
];

function addFromLib(item: LibraryItem): Profile {
  return {
    id: genId(), name: item.name, icon: item.icon,
    shell: item.shell, commands: item.commands, openIn: item.openIn,
  };
}

// ── Shell ──

function resolveShell(p: Profile): string | undefined {
  const m: Record<string, string | undefined> = {
    powershell: "powershell.exe", cmd: "cmd.exe", wsl: "wsl.exe",
    bash: "bash", zsh: "zsh",
  };
  return p.shell === "custom" ? p.shellPath || undefined : m[p.shell];
}

function resolveIcon(p: Profile): vscode.Uri | vscode.ThemeIcon {
  if (!p.icon) return new vscode.ThemeIcon("terminal");
  if (p.icon.startsWith("file:")) return vscode.Uri.file(p.icon.slice(5));
  if (p.icon.startsWith("url:")) return vscode.Uri.parse(p.icon.slice(4));
  return new vscode.ThemeIcon(p.icon);
}

// ── Runner ──

async function runTerminal(p: Profile) {
  const loc = p.openIn === "cli"
    ? { viewColumn: vscode.ViewColumn.One, preserveFocus: false } as const
    : p.openIn === "vscode" ? undefined : undefined;

  const term = vscode.window.createTerminal({
    name: `${p.name} - CodeHub`,
    iconPath: resolveIcon(p),
    location: loc,
    shellPath: resolveShell(p),
  });
  term.show();
  if (loc) await vscode.commands.executeCommand("workbench.action.closeEditorsInOtherGroups");
  p.commands.forEach((c, i) => {
    if (!c.trim()) return;
    setTimeout(() => term.sendText(c.trim(), true), i * 400 + 600);
  });
}

// ── Server (Desktop) ──

let desktopPanel: vscode.WebviewPanel | undefined;
const serverPorts = new Set<number>();
const SRV = "opencode-server";

function getOC(): string { return cfg().get<string>("opencodePath", "opencode"); }

function isOCInstalled(): boolean {
  try {
    const r = execSync(
      process.platform === "win32"
        ? `where ${getOC().split(" ")[0]} 2>nul`
        : `command -v ${getOC().split(" ")[0]} 2>/dev/null`,
      { encoding: "utf-8", timeout: 3000, windowsHide: true, stdio: "pipe" },
    );
    return r.trim().length > 0;
  } catch { return false; }
}

function startSrv(port: number) {
  const t = vscode.window.createTerminal({ name: SRV, iconPath: new vscode.ThemeIcon("server"), location: undefined, hideFromUser: true, env: { _CODEHUB_PORT: port.toString() } as Record<string, string> });
  t.sendText(`${getOC()} --port ${port}`);
  serverPorts.add(port);
  const d = vscode.window.onDidCloseTerminal((x) => { if (x === t) { serverPorts.delete(port); d.dispose(); } });
}

async function waitSrv(port: number, tries = 30): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://localhost:${port}`); if (r.ok || r.status === 404) return true; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function openDesktop(ctx: vscode.ExtensionContext) {
  if (desktopPanel) { desktopPanel.reveal(vscode.ViewColumn.Active, false); return; }
  if (!isOCInstalled()) {
    const c = await vscode.window.showErrorMessage(`${getOC()} CLI ${t("serverErr")}`, t("settings"));
    if (c === t("settings")) vscode.commands.executeCommand("workbench.action.openSettings", `${K}.opencodePath`);
    return;
  }
  const nn = () => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; let r = ""; for (let i = 0; i < 32; i++) r += c[Math.floor(Math.random() * c.length)]; return r; };
  desktopPanel = vscode.window.createWebviewPanel("codehub.desktop", "OpenCode Desktop", vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
  desktopPanel.webview.html = `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;display:flex;align-items:center;justify-content:center;background:var(--vscode-panel-background);color:var(--vscode-foreground);font-family:var(--vscode-font-family)}.sp{width:28px;height:28px;border:3px solid rgba(128,128,128,.3);border-top-color:var(--vscode-foreground);border-radius:50%;animation:sp .8s infinite}.t{margin-top:12px;font-size:13px;opacity:.6}@keyframes sp{to{transform:rotate(360deg)}}</style></head><body><div style="text-align:center"><div class="sp"></div><div class="t">${t("serverWait")}</div></div></body></html>`;
  desktopPanel.onDidDispose(() => { desktopPanel = undefined; });
  const port = Math.floor(Math.random() * 40000) + 16384;
  startSrv(port);
  const ok = await waitSrv(port);
  if (!desktopPanel) return;
  if (!ok) { desktopPanel.webview.html = `<html><body style="display:flex;align-items:center;justify-content:center;height:100%;font-family:var(--vscode-font-family);color:var(--vscode-errorForeground)">${t("serverErr")}</body></html>`; return; }
  const n = nn();
  desktopPanel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';script-src 'nonce-${n}';frame-src http://localhost:${port} https:;"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;overflow:hidden;background:var(--vscode-panel-background)}iframe{width:100%;height:100%;border:none}</style></head><body><iframe src="http://localhost:${port}"></iframe><script nonce="${n}">acquireVsCodeApi()<\/script></body></html>`;
}

// ── Helpers ──

function runDefault() {
  const id = getDef() || topId();
  const p = findP(id);
  if (p) runTerminal(p);
}

async function runFor(action: "statusBar" | "startup" | "shortcut", ctx: vscode.ExtensionContext) {
  const key = action === "statusBar" ? "statusBarProfile" : action === "startup" ? "startupProfile" : "shortcutProfile";
  const raw = cfg().get<string>(key, "first");
  const id = resolveId(raw);
  const p = findP(id);
  if (!p) { runDefault(); return; }
  if (p.openIn === "desktop") { openDesktop(ctx); return; }
  await runTerminal(p);
}

// ── Icon Picker ──

async function pickIcon(existing?: string): Promise<string | undefined> {
  const ch = await vscode.window.showQuickPick([
    { label: t("noIcon"), id: "none" },
    { label: t("iconTheme"), id: "theme" },
    { label: t("pickFile"), id: "file" },
    { label: t("pasteUrl"), id: "url" },
  ], { placeHolder: t("iconLabel") });
  if (!ch) return undefined;
  if (ch.id === "none") return existing !== undefined ? existing : "";
  if (ch.id === "file") {
    const f = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectMany: false, filters: { Images: ["png", "jpg", "jpeg", "svg", "ico", "webp"] } });
    if (!f || f.length === 0) return undefined;
    return "file:" + f[0].fsPath;
  }
  if (ch.id === "url") {
    const u = await vscode.window.showInputBox({ prompt: t("iconLabel"), value: existing || "", placeHolder: "https://... / data:..." });
    return u === undefined ? undefined : u ? "url:" + u : "";
  }
  const icons = ["terminal","terminal-powershell","terminal-cmd","terminal-bash","terminal-linux","terminal-ubuntu","browser","globe","comment-discussion","git-branch","github","symbol-variable","symbol-ruler","symbol-key","server","server-process","database","cloud","lock","key","plug","wrench","tools","beaker","flame","light-bulb","star","heart","info","warning","error","check","pulse","graph","note","book","mortar-board","code","file-directory","folder","file","package","rocket","zap","refresh","sync","play","debug","run","save","edit","trash","add","remove","gear","search","home","pin","bell","mail","calendar","clock","person","organization","link","qr","extensions","terminal-view","window","layout-sidebar-left","layout-panel","layout-statusbar","screen-full","split-horizontal","split-vertical"];
  const pick = await vscode.window.showQuickPick(icons.map((i) => ({ label: `$(${i}) ${i}`, id: i })), { placeHolder: t("iconLabel") });
  if (!pick) return undefined;
  return pick.id;
}

// ── Profile Dialog ──

async function profileDialog(existing?: Profile): Promise<Profile | undefined> {
  const name = await vscode.window.showInputBox({ prompt: t("profileName"), value: existing?.name || "", placeHolder: "Claude Code CLI, Dev, ..." });
  if (name === undefined) return;
  const icon = await pickIcon(existing?.icon);
  if (icon === undefined) return;
  const shellPick = await vscode.window.showQuickPick([
    { label: "PowerShell", id: "powershell" }, { label: "CMD", id: "cmd" }, { label: "WSL", id: "wsl" },
    { label: "Bash", id: "bash" }, { label: "Zsh", id: "zsh" }, { label: t("custom"), id: "custom" },
  ], { placeHolder: t("shellType") });
  if (!shellPick) return;
  const shell = shellPick.id as Profile["shell"];
  let shellPath: string | undefined;
  if (shell === "custom") {
    const p = await vscode.window.showInputBox({ prompt: "Örnek: C:\\tools\\my-shell.exe", value: existing?.shellPath || "" });
    if (p === undefined) return; shellPath = p || undefined;
  }
  const cmdR = await vscode.window.showInputBox({ prompt: t("commands"), value: (existing?.commands || [""]).join("\n"), placeHolder: "echo hello\nnpm start" });
  if (cmdR === undefined) return;
  const commands = cmdR.split("\n").map((l) => l.trim()).filter(Boolean);
  const openPick = await vscode.window.showQuickPick([
    { label: t("cliOpt"), id: "cli" }, { label: t("desktopOpt"), id: "desktop" }, { label: t("vscodeOpt"), id: "vscode" },
  ], { placeHolder: t("openIn") });
  if (!openPick) return;
  return { id: existing?.id || genId(), name, icon: icon || undefined, shell, shellPath, commands, openIn: openPick.id as "cli" | "desktop" | "vscode" };
}

// ── Library Dialog ──

async function pickFromLibrary(): Promise<Profile | undefined> {
  const items = LIBRARY.map((l) => ({
    label: `$(${l.icon}) ${l.name}`,
    description: l.desc,
    detail: `${l.shell} | ${l.openIn}${l.commands.length > 0 ? " | " + l.commands.join(", ") : ""}`,
    lib: l,
  }));
  const pick = await vscode.window.showQuickPick(items, { placeHolder: t("libraryDesc"), matchOnDescription: true, matchOnDetail: true });
  if (!pick) return undefined;
  return addFromLib(pick.lib);
}

// ── Side Panel ──

class SidePanel implements vscode.WebviewViewProvider {
  static readonly vt = "codehub.sidePanel";
  private v?: vscode.WebviewView;
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  resolveWebviewView(vw: vscode.WebviewView) {
    this.v = vw; vw.webview.options = { enableScripts: true };
    vw.webview.html = this.html();
    vw.onDidDispose(() => { this.v = undefined; });
    vw.webview.onDidReceiveMessage(async (m) => {
      const p = () => findP(m.id);
      const refresh = () => this.refresh();

      if (m.type === "cli" || m.type === "vscode") {
        const def = findP(getDef() || topId()); if (!def) { refresh(); return; }
        await runTerminal({ ...def, openIn: m.type === "cli" ? "cli" : "vscode" }); refresh(); return;
      }
      if (m.type === "desktop") { openDesktop(this.ctx); return; }
      if (m.type === "closeAll") {
        if (cfg().get<boolean>("confirmCloseAll", true)) {
          const r = await vscode.window.showQuickPick([t("yes"), t("no")], { placeHolder: t("confirmAllClose") });
          if (r !== t("yes")) return;
        }
        vscode.window.terminals.filter((t) => t.name.includes("CodeHub") || t.name === SRV).forEach((t) => t.dispose());
        serverPorts.clear(); refresh(); return;
      }
      if (m.type === "run") { const x = p(); if (x) { if (x.openIn === "desktop") { openDesktop(this.ctx); return; } await runTerminal(x); } refresh(); return; }
      if (m.type === "runPanel") { const x = p(); if (x) await runTerminal({ ...x, openIn: "vscode" }); refresh(); return; }
      if (m.type === "runDesktop") { const x = p(); if (x) { setDef(x.id); openDesktop(this.ctx); } refresh(); return; }
      if (m.type === "addLib") {
        const lib = await pickFromLibrary();
        if (!lib) { refresh(); return; }
        const list = getP(); list.push(lib); setP(list);
        refresh(); vscode.window.showInformationMessage(`${t("created")}: ${lib.name}`); return;
      }
      if (m.type === "add") {
        const r = await profileDialog(); if (!r) { refresh(); return; }
        const list = getP(); list.push(r); setP(list);
        refresh(); vscode.window.showInformationMessage(`${t("created")}: ${r.name}`); return;
      }
      if (m.type === "edit") {
        const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return;
        const u = await profileDialog(list[i]); if (!u) { refresh(); return; }
        list[i] = u; setP(list); refresh(); vscode.window.showInformationMessage(t("updated")); return;
      }
      if (m.type === "delete") {
        const ok = (await vscode.window.showQuickPick([t("yes"), t("no")], { placeHolder: t("confirmDel") })) === t("yes");
        if (!ok) { refresh(); return; }
        const list = getP().filter((x) => x.id !== m.id); setP(list);
        if (getDef() === m.id) setDef(list[0]?.id || "");
        refresh(); vscode.window.showInformationMessage(t("deleted")); return;
      }
      if (m.type === "dup") {
        const x = p(); if (!x) return;
        const c = { ...x, id: genId(), name: `${x.name} (kopya)` };
        const list = getP(); list.push(c); setP(list); refresh(); vscode.window.showInformationMessage(t("duplicated")); return;
      }
      if (m.type === "up" || m.type === "down") {
        const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return;
        const j = m.type === "up" ? i - 1 : i + 1; if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]]; setP(list); refresh(); return;
      }
      if (m.type === "set") { vscode.commands.executeCommand("workbench.action.openSettings", K); return; }
    });
  }

  refresh() { if (this.v) this.v.webview.html = this.html(); }

  private html(): string {
    const list = getP(); const defId = getDef();
    const top = list.length > 0 ? list[0].id : "";
    const lang = cfg().get<string>("language", "tr") === "en" ? "en" : "tr";
    const tc = vscode.window.terminals.filter((t) => t.name.includes("CodeHub")).length;
    const nonce = (() => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; let r = ""; for (let i = 0; i < 32; i++) r += c[Math.floor(Math.random() * c.length)]; return r; })();
    const esc = (s: string) => s.replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[m] || m);

    const profileRows = list.map((p) => {
      const isDef = p.id === defId;
      const isTop = p.id === top;
      const icon = p.icon ? `<span class="ti codicon codicon-${esc(p.icon)}"></span>` : `<span class="si">${p.shell[0].toUpperCase()}</span>`;
      const modeCls = p.openIn === "cli" ? "m-cli" : p.openIn === "desktop" ? "m-desk" : "m-vsc";
      return `<div class="pr ${isDef?'d':''} ${isTop&&!defId?'t':''}">
        <div class="pi" onclick="p('run','${p.id}')">
          ${icon}<span class="pn">${esc(p.name)}</span>
          <span class="m ${modeCls}"></span>
        </div>
        <div class="pa">
          <button class="b" onclick="p('runPanel','${p.id}')" title="${t("runPanel")}">\u25B3</button>
          <button class="b" onclick="p('runDesktop','${p.id}')" title="${t("runDesktop")}">\u25A0</button>
          <button class="b" onclick="p('dup','${p.id}')" title="${t("duplicate")}">\u{1F4CB}</button>
          <button class="b" onclick="p('up','${p.id}')" title="${t("moveUp")}">\u25B2</button>
          <button class="b" onclick="p('down','${p.id}')" title="${t("moveDown")}">\u25BC</button>
          <button class="b" onclick="p('edit','${p.id}')" title="${t("addProfile")}">\u270E</button>
          <button class="b d" onclick="p('delete','${p.id}')" title="${t("deleteProfile")}">\u2716</button>
        </div>
      </div>`;
    }).join("");

    return `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="UTF-8"/><style>
*{margin:0;padding:0;box-sizing:border-box}
body{padding:10px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);background:var(--vscode-sideBar-background)}
.hdr{font-size:13px;font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:6px}
.hdr .sub{font-size:10px;font-weight:400;opacity:.4;margin-left:auto}
.btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 10px;border:none;border-radius:5px;cursor:pointer;font-size:12px;width:100%;background:var(--vscode-button-background);color:var(--vscode-button-foreground);margin-bottom:4px;font-weight:500}
.btn:hover{opacity:.85}
.bs{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.bd{background:color-mix(in srgb,var(--vscode-errorForeground) 15%,transparent);color:var(--vscode-errorForeground)}
.sec{margin-top:10px}
.sl{font-size:10px;text-transform:uppercase;opacity:.4;letter-spacing:.5px;margin-bottom:5px;font-weight:600}
.pr{display:flex;align-items:center;gap:3px;padding:5px 6px;border-radius:5px;margin:2px 0;background:var(--vscode-sideBar-background);transition:background .1s}
.pr:hover{background:var(--vscode-list-hoverBackground)}
.pr.d{background:color-mix(in srgb,var(--vscode-focusBorder) 10%,var(--vscode-sideBar-background));border:1px solid color-mix(in srgb,var(--vscode-focusBorder) 30%,transparent)}
.pr.t{background:color-mix(in srgb,var(--vscode-editorMarkerNavigationWarning-background) 8%,var(--vscode-sideBar-background))}
.pi{display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;min-width:0;padding:2px 0}
.ti{width:18px;height:18px;font-size:16px;flex-shrink:0;display:flex;align-items:center;justify-content:center;opacity:.8}
.si{width:20px;height:20px;border-radius:4px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0}
.pn{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.m{width:14px;height:14px;border-radius:3px;font-size:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;opacity:.5}
.m-cli{background:var(--vscode-testing-iconPassed);color:#fff}
.m-desk{background:var(--vscode-testing-iconFailed);color:#fff}
.m-vsc{background:var(--vscode-testing-iconQueued);color:#fff}
.pa{display:flex;gap:2px;flex-shrink:0}
.b{width:20px;height:20px;border:none;border-radius:3px;cursor:pointer;font-size:10px;background:transparent;color:var(--vscode-foreground);opacity:.3;display:flex;align-items:center;justify-content:center;padding:0;transition:all .1s}
.b:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground);transform:scale(1.1)}
.b.d:hover{color:var(--vscode-errorForeground)}
.st{font-size:10px;opacity:.3;padding:2px 0}
.empty{padding:16px;text-align:center;font-size:11px;opacity:.4;line-height:1.5}
</style></head><body>
<div class="hdr">${t("appName")} <span class="sub">${tc > 0 ? tt("terminalCount",{n:tc}) : ''}</span></div>

<button class="btn" onclick="p('cli')">${t("opencodeCLI")}</button>
<div style="display:flex;gap:4px">
  <button class="btn bs" style="flex:1" onclick="p('desktop')">${t("opencodeDesktop")}</button>
  <button class="btn bs" style="flex:1" onclick="p('vscode')">${t("opencodeVSCode")}</button>
</div>
<button class="btn bs bd" onclick="p('closeAll')">${t("closeAll")}</button>

<div class="sec">
  <div class="sl">${tt("profileList",{n:list.length})}</div>
  ${list.length > 0 ? profileRows : `<div class="empty">${t("noProfiles")}</div>`}

  <div style="display:flex;gap:4px;margin-top:4px">
    <button class="btn bs" style="flex:1;border:1px dashed var(--vscode-input-border)" onclick="p('add')">+ ${t("addProfile")}</button>
    <button class="btn bs" style="flex:1" onclick="p('addLib')">${t("addFromLib")}</button>
  </div>
</div>

<button class="btn bs" style="margin-top:8px" onclick="p('set')">${t("settings")}</button>

<script nonce="${nonce}">const v=acquireVsCodeApi();function p(t,i){v.postMessage({type:t,id:i})}<\/script>
</body></html>`;
  }
}

// ── Activate ──

export function activate(ctx: vscode.ExtensionContext) {
  const side = new SidePanel(ctx);
  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider(SidePanel.vt, side, { webviewOptions: { retainContextWhenHidden: true } }));

  // Register commands
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.runDefault", runDefault));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openCLI", () => runFor("shortcut", ctx)));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openDesktop", () => openDesktop(ctx)));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openVSCode", () => { const p = findP(resolveId(cfg().get<string>("shortcutProfile", "first"))); if (p) runTerminal({ ...p, openIn: "vscode" }); }));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.closeAllTerminals", () => vscode.window.terminals.filter((t) => t.name.includes("CodeHub") || t.name === SRV).forEach((t) => t.dispose())));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", K)));

  // Status bar
  const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  sb.show(); ctx.subscriptions.push(sb);
  const upd = () => {
    const n = vscode.window.terminals.filter((t) => t.name.includes("CodeHub")).length;
    sb.text = n > 0 ? `$(terminal) CodeHub (${n})` : "$(terminal) CodeHub";
    sb.tooltip = t("statusTip");
    const raw = cfg().get<string>("statusBarProfile", "first");
    sb.command = raw === "first" || !findP(raw) ? "codehub.runDefault" : "codehub.runDefault";
  };
  upd();
  ctx.subscriptions.push(vscode.window.onDidOpenTerminal(upd));
  ctx.subscriptions.push(vscode.window.onDidCloseTerminal(() => { upd(); side.refresh(); }));
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(K)) { upd(); side.refresh(); } }));

  // Startup
  const delay = cfg().get<number>("startupDelay", 1200);
  if (cfg().get<string>("startupMode", "defaultProfile") !== "none") {
    setTimeout(() => runFor("startup", ctx), delay);
  }
}

export function deactivate() { serverPorts.clear(); }
