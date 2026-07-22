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
  addProfile: _("Profil Ekle", "Add Profile"),
  noProfiles: _("Henüz profil yok. Kütüphaneden ekleyin veya + ile oluşturun.", "No profiles yet. Add from Library or tap +."),
  created: _("Profil oluşturuldu", "Profile created"), deleted: _("Profil silindi", "Profile deleted"),
  updated: _("Profil güncellendi", "Profile updated"),
  statusTip: _("CodeHub - En üstteki profili çalıştır", "CodeHub - Run top profile"),
  serverWait: _("OpenCode sunucu başlatılıyor...", "Starting OpenCode server..."),
  serverErr: _("OpenCode CLI bulunamadı. PATH kontrol edin.", "OpenCode CLI not found. Check PATH."),
  terminalCount: _("{n} terminal", "{n} terminals"),
  terminalCountZero: _("terminal yok", "no terminals"),
  closeAll: _("Tümünü Kapat", "Close All"),
  setStatusBar: _("Durum çubuğu profili seç", "Choose status bar profile"),
  setStartup: _("Başlangıç profili seç", "Choose startup profile"),
  setShortcut: _("Kısayol (Ctrl+Alt+T) profili seç", "Choose shortcut profile"),
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
  run: _("Çalıştır", "Run"), runPanel: _("Panelde aç", "Open in Panel"), edit: _("Düzenle", "Edit"),
  del: _("Sil", "Delete"), up: _("Yukarı", "Up"), down: _("Aşağı", "Down"),
  sort: _("Sıra", "Order"),
  statusBarCur: _("Durum çubuğu: {name}", "Status bar: {name}"),
  startupCur: _("Başlangıç: {name}", "Startup: {name}"),
  shortcutCur: _("Kısayol: {name}", "Shortcut: {name}"),
};

function t(k: string): string {
  return T[k]?.[vscode.workspace.getConfiguration("codehub").get<string>("language", "tr") === "en" ? "en" : "tr"] ?? k;
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
function profileName(id: string): string { return id === "first" ? t("first") : findP(id)?.name || t("first"); }
function skipConfirms(): boolean { return cfg().get<boolean>("skipConfirmations", true); }

// ── Library ──

const LIB: LibItem[] = [
  { name: "OpenCode CLI", icon: "terminal", shell: "powershell", commands: ["opencode"], openIn: "cli", desc: "OpenCode tam ekran" },
  { name: "OpenCode Desktop", icon: "browser", shell: "powershell", commands: ["opencode"], openIn: "desktop", desc: "OpenCode web panel" },
  { name: "OpenCode VSCode", icon: "terminal-powershell", shell: "powershell", commands: ["opencode"], openIn: "vscode", desc: "OpenCode panel" },
  { name: "Claude Code CLI", icon: "comment-discussion", shell: "cmd", commands: ["claude"], openIn: "cli", desc: "Claude Code tam ekran" },
  { name: "Claude Code Panel", icon: "comment-discussion", shell: "cmd", commands: ["claude"], openIn: "vscode", desc: "Claude Code panel" },
  { name: "Dev Bash", icon: "terminal-bash", shell: "bash", commands: [], openIn: "vscode", desc: "Bash terminali" },
  { name: "Node.js", icon: "symbol-variable", shell: "cmd", commands: ["node --version", "npm --version"], openIn: "vscode", desc: "Node.js" },
  { name: "Git Bash", icon: "git-branch", shell: "bash", commands: [], openIn: "vscode", desc: "Git Bash" },
  { name: "Python", icon: "symbol-ruler", shell: "cmd", commands: ["python --version"], openIn: "vscode", desc: "Python" },
  { name: "Docker", icon: "server-process", shell: "bash", commands: ["docker ps"], openIn: "vscode", desc: "Docker" },
  { name: "SSH", icon: "plug", shell: "powershell", commands: ["ssh user@host"], openIn: "cli", desc: "SSH" },
  { name: "WSL Ubuntu", icon: "terminal-linux", shell: "wsl", commands: [], openIn: "vscode", desc: "WSL Ubuntu" },
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

function resolveIcon(p: Profile): vscode.ThemeIcon {
  const i = p.icon || "terminal";
  if (i.startsWith("file:") || i.startsWith("url:")) return new vscode.ThemeIcon("terminal");
  return new vscode.ThemeIcon(i);
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
  const t = vscode.window.createTerminal({ name: SRV, iconPath: new vscode.ThemeIcon("server"), hideFromUser: true, env: { _CH_PORT: port.toString() } as any });
  t.sendText(`${getOC()} --port ${port}`); srvPorts.add(port);
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
  desktopPanel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${n0}'"><style>*{margin:0;padding:0}html,body{height:100%;display:flex;align-items:center;justify-content:center;background:var(--vscode-panel-background);color:var(--vscode-foreground);font-family:var(--vscode-font-family)}.sp{width:28px;height:28px;border:3px solid rgba(128,128,128,.3);border-top-color:var(--vscode-foreground);border-radius:50%;animation:sp .8s infinite}.t{margin-top:12px;font-size:13px;opacity:.6}@keyframes sp{to{transform:rotate(360deg)}}</style></head><body><div style="text-align:center"><div class="sp"></div><div class="t">${t("serverWait")}</div></div></body></html>`;
  desktopPanel.onDidDispose(() => { desktopPanel = undefined; });
  const port = Math.floor(Math.random() * 50000) + 1024;
  startSrv(port);
  const ok = await waitSrv(port);
  if (!desktopPanel) return;
  if (!ok) { desktopPanel.webview.html = `<html><body style="display:flex;align-items:center;justify-content:center;height:100%;font-family:var(--vscode-font-family);color:var(--vscode-errorForeground)">${t("serverErr")}</body></html>`; return; }
  const n1 = nn();
  desktopPanel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${n1}'; frame-src http://localhost:${port} https:"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;overflow:hidden;background:var(--vscode-panel-background)}iframe{width:100%;height:100%;border:none;background:#fff}</style></head><body><iframe src="http://localhost:${port}" allow="clipboard-read;clipboard-write"></iframe></body></html>`;
}

// ── Helpers ──

function runDefault() {
  const id = cfg().get<string>("defaultProfile", "") || topId();
  const p = findP(id); if (p) runTerminal(p);
}

async function pickProfile(title: string, settingKey: string) {
  const profiles = getP();
  const items = [
    { label: `$(chevron-up) ${t("first")}`, id: "first" },
    ...profiles.map((p) => ({ label: `$(${p.icon || "terminal"}) ${p.name}`, description: p.shell, id: p.id })),
  ];
  const pick = await vscode.window.showQuickPick(items, { placeHolder: title });
  if (!pick) return;
  setA(settingKey, pick.id);
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
    const f = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectMany: false, filters: { Images: ["png","jpg","svg","ico","webp"] } });
    if (!f || f.length === 0) return undefined; return "file:" + f[0].fsPath;
  }
  if (ch.id === "url") {
    const u = await vscode.window.showInputBox({ prompt: t("iconLabel"), value: existing || "", placeHolder: "https://..." });
    return u === undefined ? undefined : u ? "url:" + u : "";
  }
  const icons = ["terminal","terminal-powershell","terminal-cmd","terminal-bash","terminal-linux","browser","globe","comment-discussion","comment","mention","git-branch","git-commit","git-pull-request","github","symbol-variable","symbol-ruler","symbol-key","symbol-misc","server","server-process","database","vm","cloud","lock","key","plug","tools","wrench","beaker","light-bulb","flame","star","heart","info","warning","error","check","pulse","graph","note","book","mortar-board","code","file-directory","folder","file-directory","repo","package","rocket","zap","sync","refresh","play","debug","run-all","run","save","edit","trash","add","remove","search","home","pin","bell","mail","calendar","clock","watch","person","organization","people","link","extensions","window","layout-sidebar-left","layout-panel","layout-statusbar","screen-full","split-horizontal","split-vertical","terminal-view","debug-console","notebook","symbol-class","symbol-interface","symbol-method","symbol-function","symbol-field","symbol-event","symbol-array","symbol-namespace"];
  const pick = await vscode.window.showQuickPick(icons.map((i) => ({ label: `$(${i}) ${i}`, id: i })), { placeHolder: t("iconLabel") });
  return pick?.id;
}

// ── Profile Dialog ──

async function profileDialog(existing?: Profile): Promise<Profile | undefined> {
  const name = await vscode.window.showInputBox({ prompt: t("profileName"), value: existing?.name || "", placeHolder: "Claude Code CLI" });
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
    { label: `$(terminal) ${t("cliOpt")}`, id: "cli" }, { label: `$(browser) ${t("desktopOpt")}`, id: "desktop" }, { label: `$(terminal-powershell) ${t("vscodeOpt")}`, id: "vscode" },
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
      if (m.type === "run") { const x = g(); if (x) { if (x.openIn === "desktop") { openDesktop(this.ctx); return; } await runTerminal(x); } this.sync(); return; }
      if (m.type === "runV") { const x = g(); if (x) await runTerminal({ ...x, openIn: "vscode" }); this.sync(); return; }
      if (m.type === "closeAll") { vscode.window.terminals.filter((t) => t.name.includes("CodeHub") || t.name === SRV).forEach((t) => t.dispose()); srvPorts.clear(); this.sync(); return; }
      if (m.type === "addLib") { const l = await pickFromLib(); if (!l) { this.sync(); return; } const list = getP(); list.push(l); setP(list); this.sync(); vscode.window.showInformationMessage(`${t("created")}: ${l.name}`); return; }
      if (m.type === "add") { const r = await profileDialog(); if (!r) { this.sync(); return; } const list = getP(); list.push(r); setP(list); this.sync(); vscode.window.showInformationMessage(`${t("created")}: ${r.name}`); return; }
      if (m.type === "edit") { const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return; const u = await profileDialog(list[i]); if (!u) { this.sync(); return; } list[i] = u; setP(list); this.sync(); vscode.window.showInformationMessage(t("updated")); return; }
      if (m.type === "delete") { const list = getP().filter((x) => x.id !== m.id); setP(list); if (cfg().get<string>("defaultProfile", "") === m.id) cfg().update("defaultProfile", "", vscode.ConfigurationTarget.Global); this.sync(); vscode.window.showInformationMessage(t("deleted")); return; }
      if (m.type === "up" || m.type === "down") { const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return; const j = m.type === "up" ? i - 1 : i + 1; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; setP(list); this.sync(); return; }
      if (m.type === "reorder") { const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return; const to = Math.max(0, Math.min(list.length - 1, (parseInt(m.value) || 1) - 1)); const item = list.splice(i, 1)[0]; list.splice(to, 0, item); setP(list); this.sync(); return; }
      if (m.type === "p-status") { pickProfile(t("setStatusBar"), "statusBarProfile"); this.sync(); return; }
      if (m.type === "p-startup") { pickProfile(t("setStartup"), "startupProfile"); this.sync(); return; }
      if (m.type === "p-shortcut") { pickProfile(t("setShortcut"), "shortcutProfile"); this.sync(); return; }
      if (m.type === "desktop") { openDesktop(this.ctx); return; }
      if (m.type === "settings") { vscode.commands.executeCommand("workbench.action.openSettings", K); return; }
    });
  }

  sync() { if (this.v) this.v.webview.html = this.html(); }

  private html(): string {
    const list = getP(); const lang = cfg().get<string>("language", "tr") === "en" ? "en" : "tr";
    const tc = vscode.window.terminals.filter((t) => t.name.includes("CodeHub")).length;
    const n = () => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; let r = ""; for (let i = 0; i < 32; i++) r += c[Math.floor(Math.random() * c.length)]; return r; };
    const esc = (s: string) => s.replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[m] || m);
    const defId = cfg().get<string>("defaultProfile", "") || topId();

    const rows = list.map((p, idx) => {
      const isDef = p.id === defId;
      const first = idx === 0; const last = idx === list.length - 1;
      const icon = p.icon ? `<span class="ic codicon codicon-${esc(p.icon)}"></span>` : `<span class="ic-s">${p.shell[0].toUpperCase()}</span>`;
      return `<div class="cr ${isDef?"d":""}">
        <div class="ch">
          <input class="on" type="number" value="${idx+1}" min="1" max="${list.length}" onchange="p('reorder','${p.id}',this.value)">
          <span class="cb play" onclick="p('run','${p.id}')">${icon}</span>
          <div class="cn" onclick="p('run','${p.id}')">
            <span class="cn-t">${esc(p.name)}${isDef?' <span class="cd">\u2605</span>':''}</span>
            <span class="cn-s">${p.shell} <span class="cd c-${p.openIn}">${p.openIn}</span></span>
          </div>
          <div class="ca">
            <button class="b play" onclick="p('runV','${p.id}')" title="${t("runPanel")}">\u25A1</button>
            <button class="b" onclick="p('edit','${p.id}')" title="${t("edit")}">\u270E</button>
            <button class="b del" onclick="p('delete','${p.id}')" title="${t("del")}">\u2716</button>
            <button class="b arr" onclick="p('up','${p.id}')" ${first?'disabled':''} title="${t("up")}" style="${first?'opacity:.15':''}">\u25B2</button>
            <button class="b arr" onclick="p('down','${p.id}')" ${last?'disabled':''} title="${t("down")}" style="${last?'opacity:.15':''}">\u25BC</button>
          </div>
        </div>
        ${p.commands.length > 0 ? `<div class="cx">${esc(p.commands.join("; "))}</div>` : ""}
      </div>`;
    }).join("");

    const sb = profileName(getA("statusBarProfile"));
    const su = profileName(getA("startupProfile"));
    const sk = profileName(getA("shortcutProfile"));

    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"/><style>
:root{--c:var(--vscode-foreground);--c2:color-mix(in srgb,var(--vscode-foreground) 50%,transparent);--bg:var(--vscode-sideBar-background);--bg2:var(--vscode-sideBar-background);--bord:color-mix(in srgb,var(--vscode-foreground) 8%,transparent);--hover:var(--vscode-list-hoverBackground);--btn:var(--vscode-button-background);--btnf:var(--vscode-button-foreground);--btn2:var(--vscode-button-secondaryBackground);--btn2f:var(--vscode-button-secondaryForeground);--focus:var(--vscode-focusBorder);--err:var(--vscode-errorForeground);--succ:var(--vscode-testing-iconPassed);--warn:var(--vscode-editorMarkerNavigationWarning-background);--font:var(--vscode-font-family);--fs:var(--vscode-font-size)}
*{margin:0;padding:0;box-sizing:border-box}
body{padding:16px;font-family:var(--font);font-size:var(--fs);color:var(--c);background:var(--bg);line-height:1.5}
.hdr{font-size:18px;font-weight:700;display:flex;align-items:center;gap:10px;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid var(--bord)}
.hdr .sub{font-size:12px;font-weight:400;opacity:.4;margin-left:auto}
.ac{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.acb{display:flex;align-items:center;gap:8px;padding:10px 14px;border:none;border-radius:8px;cursor:pointer;font-size:13px;background:var(--btn2);color:var(--c);width:100%;text-align:left}
.acb:hover{opacity:.85;background:var(--hover)}
.acb .al{font-size:10px;opacity:.5;flex-shrink:0;width:28px}
.acb .av{flex:1;font-weight:500}
.acb .av2{font-size:11px;opacity:.5}
.sl{font-size:13px;font-weight:600;text-transform:uppercase;opacity:.5;letter-spacing:.8px;margin:16px 0 8px;display:flex;align-items:center;gap:8px}
.sl::after{content:"";flex:1;height:1px;background:var(--bord)}
.cr{margin:6px 0;border-radius:10px;background:color-mix(in srgb,var(--c) 3%,transparent);border:1px solid var(--bord);overflow:hidden}
.cr.d{border-color:var(--focus);background:color-mix(in srgb,var(--focus) 6%,var(--bg))}
.ch{display:flex;align-items:center;gap:6px;padding:8px 10px}
.on{width:30px;height:26px;border-radius:5px;border:1px solid var(--bord);background:transparent;color:var(--c);text-align:center;font-size:11px;font-weight:600;flex-shrink:0}
.on:focus{border-color:var(--focus);outline:none}
.cb{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;transition:all .12s}
.cb.play{background:color-mix(in srgb,var(--btn) 15%,transparent);color:var(--btn)}
.cb.play:hover{background:var(--btn);color:var(--btnf);transform:scale(1.1)}
.ic{font-size:20px}
.ic-s{font-size:12px;font-weight:700;opacity:.6}
.cn{flex:1;min-width:0;cursor:pointer;padding:2px 4px;border-radius:4px}
.cn:hover{background:var(--hover)}
.cn-t{font-size:15px;font-weight:500;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cn-s{font-size:11px;color:var(--c2);display:block;margin-top:1px}
.cd{color:var(--warn);font-size:12px}
.c-cli{color:var(--succ)}.c-desktop{color:var(--err)}.c-vscode{color:var(--warn)}
.ca{display:flex;gap:2px;flex-shrink:0}
.b{width:26px;height:26px;border:none;border-radius:5px;cursor:pointer;font-size:11px;background:transparent;color:var(--c);opacity:.3;display:flex;align-items:center;justify-content:center;padding:0;transition:all .1s}
.b:hover{opacity:1;background:var(--hover);transform:scale(1.1)}
.b.del:hover{color:var(--err)}
.b.play{color:var(--succ)}.b.play:hover{opacity:1;background:color-mix(in srgb,var(--succ) 15%,transparent)}
.b.arr:hover{opacity:1}
.cx{padding:4px 52px 6px;font-size:11px;color:var(--c2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-top:1px solid var(--bord)}
.cx::before{content:"$ ";opacity:.3}
.emp{padding:32px 20px;text-align:center;font-size:13px;opacity:.4;line-height:1.6}
.qb{width:100%;padding:12px 16px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;text-align:center;margin-bottom:6px;transition:opacity .12s}
.qb-p{background:var(--btn);color:var(--btnf)}.qb-s{background:var(--btn2);color:var(--c)}.qb:hover{opacity:.85}
.qb-d{background:color-mix(in srgb,var(--err) 12%,transparent);color:var(--err)}
.qb-add{border:1.5px dashed var(--bord);background:transparent}
</style></head><body>
<div class="hdr"><span class="codicon codicon-terminal" style="font-size:22px"></span>CodeHub<span class="sub">${tc > 0 ? tt("terminalCount",{n:tc}) : t("terminalCountZero")}</span></div>

<div class="ac">
  <button class="acb" onclick="p('p-status')"><span class="al">\u25B6</span><span class="av">${t("setStatusBar")}</span><span class="av2">${esc(sb)}</span></button>
  <button class="acb" onclick="p('p-startup')"><span class="al">\u25B6</span><span class="av">${t("setStartup")}</span><span class="av2">${esc(su)}</span></button>
  <button class="acb" onclick="p('p-shortcut')"><span class="al">\u25B6</span><span class="av">${t("setShortcut")}</span><span class="av2">${esc(sk)}</span></button>
</div>

<div class="sl">${t("profileList")}</div>
${list.length > 0 ? rows : `<div class="emp">${t("noProfiles")}</div>`}

<button class="qb qb-add" onclick="p('add')">+ ${t("addProfile")}</button>
<button class="qb qb-s" onclick="p('addLib')">${t("addFromLib")}</button>
<button class="qb qb-s" onclick="p('desktop')" style="margin-top:8px">\u25A0 ${t("cliOpt").split(" ")[0]}</button>
<button class="qb qb-s" onclick="p('settings')">${t("settings")}</button>
<button class="qb qb-d" onclick="p('closeAll')" style="margin-top:4px">\u2716 ${t("closeAll")}</button>

<script nonce="${n()}">const v=acquireVsCodeApi();function p(t,i,v2){v.postMessage({type:t,id:i,value:v2})}<\/script>
</body></html>`;
  }
}

// ── Activate ──

export function activate(ctx: vscode.ExtensionContext) {
  const side = new SidePanel(ctx);
  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider(SidePanel.vt, side, { webviewOptions: { retainContextWhenHidden: true } }));

  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.runDefault", runDefault));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openDesktop", () => openDesktop(ctx)));
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
      const id = getA("startupProfile"); const p = findP(resolveId(id));
      if (p) runTerminal(p); else runDefault();
    }, delay);
  }
}

export function deactivate() { srvPorts.clear(); }
