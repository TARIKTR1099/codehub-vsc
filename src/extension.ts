import * as vscode from "vscode";
import { execSync } from "child_process";

// ── Types ──

interface Profile {
  id: string; name: string; icon?: string;
  executable: string;
  arguments: string;
  shell: "powershell" | "cmd" | "wsl" | "bash" | "zsh" | "custom";
  shellPath?: string;
  openIn: "cli" | "desktop" | "vscode";
  category?: string;
  checkCommand?: string;
}

interface LibEntry {
  name: string; icon: string; executable: string; arguments: string;
  shell: Profile["shell"]; openIn: Profile["openIn"];
  category: string; checkCommand?: string; desc: string;
}

// ── I18n ──

const _ = (tr: string, en: string) => ({ tr, en });
const T: Record<string, Record<string, string>> = {
  appName: _("CodeHub", "CodeHub"), settings: _("Ayarlar", "Settings"),
  library: _("Kütüphane", "Library"), addFromLib: _("Kütüphaneden Ekle", "Add from Library"),
  addProfile: _("Profil Ekle", "Add Profile"),
  noProfiles: _("Henüz profil yok. Kütüphane'den ekleyin.", "No profiles yet. Add from Library."),
  created: _("Profil oluşturuldu", "Profile created"), deleted: _("Profil silindi", "Profile deleted"),
  updated: _("Profil güncellendi", "Profile updated"),
  statusTip: _("CodeHub - En üstteki profili çalıştır", "CodeHub - Run top profile"),
  serverWait: _("OpenCode sunucu başlatılıyor...", "Starting OpenCode server..."),
  serverErr: _("OpenCode CLI bulunamadı.", "OpenCode CLI not found."),
  terminalCount: _("{n} terminal", "{n} terminals"), terminalCountZero: _("terminal yok", "no terminals"),
  closeAll: _("Tümünü Kapat", "Close All"),
  profileList: _("Profiller", "Profiles"), first: _("En üstteki (ilk)", "Topmost (first)"),
  setStatusBar: _("Durum çubuğu profili", "Status bar profile"),
  setStartup: _("Başlangıç profili", "Startup profile"),
  setShortcut: _("Kısayol profili", "Shortcut profile"),
  profileName: _("Profil adı", "Profile name"), shellType: _("Shell", "Shell"),
  commands: _("Komutlar (boş = direkt shell)", "Commands (empty = direct shell)"),
  openIn: _("Açılacağı yer", "Open location"),
  cliOpt: _("OpenCode CLI (tam ekran)", "OpenCode CLI (fullscreen)"),
  desktopOpt: _("OpenCode Desktop (web)", "OpenCode Desktop (web)"),
  vscodeOpt: _("OpenCode VSCode (panel)", "OpenCode VSCode (panel)"),
  run: _("Çalıştır", "Run"), runPanel: _("Panelde aç", "Open in Panel"),
  edit: _("Düzenle", "Edit"), del: _("Sil", "Delete"),
  up: _("Yukarı", "Up"), down: _("Aşağı", "Down"),
  categories: {
    tr: "AI Agents|Diller|Paket Yön.|Araçlar|Shell'ler",
    en: "AI Agents|Languages|PKG Managers|Dev Tools|Shells",
  },
  installCheck: _("Kurulu değil, kontrol edin", "Not installed, check setup"),
  libSearch: _("Kütüphanede ara...", "Search library..."),
  exec: _("Çalıştır", "Executable"), args: _("Argümanlar", "Arguments"),
};

function t(k: string): string {
  const l = vscode.workspace.getConfiguration("codehub").get<string>("language", "tr") === "en" ? "en" : "tr";
  return T[k]?.[l] ?? k;
}
function tc(k: string, idx: number): string {
  const l = vscode.workspace.getConfiguration("codehub").get<string>("language", "tr") === "en" ? "en" : "tr";
  const v = T[k]?.[l] ?? k;
  return v.split("|")[idx] || v;
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
function profName(id: string): string { return id === "first" ? t("first") : findP(id)?.name || t("first"); }

// ── Profile Library ──

const CATS = ["ai", "langs", "pkgs", "tools", "shells"];

const LIB: LibEntry[] = [
  // AI Agents
  { name: "Claude Code", icon: "comment-discussion", executable: "claude", arguments: "", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "claude --version", desc: "Anthropic AI agent" },
  { name: "OpenCode CLI", icon: "terminal", executable: "opencode", arguments: "", shell: "cmd", openIn: "cli", category: "ai", desc: "OpenCode AI agent" },
  { name: "OpenCode Desktop", icon: "browser", executable: "opencode", arguments: "", shell: "cmd", openIn: "desktop", category: "ai", desc: "OpenCode web panel" },
  { name: "OpenCode VSCode", icon: "terminal-powershell", executable: "opencode", arguments: "", shell: "cmd", openIn: "vscode", category: "ai", desc: "OpenCode panel" },
  { name: "OpenAI Codex", icon: "symbol-ruler", executable: "codex", arguments: "", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "codex --version", desc: "OpenAI coding agent" },
  { name: "Gemini CLI", icon: "sparkle", executable: "gemini", arguments: "", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "gemini --version", desc: "Google Gemini CLI" },
  { name: "Aider", icon: "tools", executable: "aider", arguments: "--model sonnet", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "aider --version", desc: "AI pair programming" },
  { name: "Kiro CLI", icon: "terminal-bash", executable: "kiro-cli", arguments: "chat", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "kiro-cli --version", desc: "Kiro interactive CLI" },
  { name: "GitHub Copilot", icon: "github", executable: "copilot", arguments: "", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "copilot --version", desc: "GitHub Copilot CLI" },
  { name: "Amazon Q", icon: "cloud", executable: "q", arguments: "", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "q --version", desc: "Amazon Q Developer" },
  { name: "Goose", icon: "star", executable: "goose", arguments: "", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "goose --version", desc: "Goose AI agent" },
  // Languages
  { name: "Node.js", icon: "symbol-variable", executable: "node", arguments: "", shell: "cmd", openIn: "vscode", category: "langs", checkCommand: "node --version", desc: "JavaScript runtime" },
  { name: "Python", icon: "symbol-ruler", executable: "python", arguments: "", shell: "cmd", openIn: "vscode", category: "langs", checkCommand: "python --version", desc: "Python interpreter" },
  { name: "Deno", icon: "symbol-misc", executable: "deno", arguments: "", shell: "cmd", openIn: "vscode", category: "langs", checkCommand: "deno --version", desc: "Deno runtime" },
  { name: "Cargo (Rust)", icon: "symbol-key", executable: "cargo", arguments: "", shell: "cmd", openIn: "vscode", category: "langs", checkCommand: "cargo --version", desc: "Rust build tool" },
  // Package Managers
  { name: "npm", icon: "package", executable: "npm", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "npm --version", desc: "Node package manager" },
  { name: "pnpm", icon: "package", executable: "pnpm", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "pnpm --version", desc: "Fast npm alternative" },
  { name: "yarn", icon: "package", executable: "yarn", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "yarn --version", desc: "Yarn package manager" },
  { name: "bun", icon: "zap", executable: "bun", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "bun --version", desc: "All-in-one JS runtime" },
  { name: "pip", icon: "symbol-ruler", executable: "pip", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "pip --version", desc: "Python package manager" },
  { name: "uv", icon: "zap", executable: "uv", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "uv --version", desc: "Rust Python package mgr" },
  // Dev Tools
  { name: "Git", icon: "git-branch", executable: "git", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "git --version", desc: "Version control" },
  { name: "GitHub CLI", icon: "github", executable: "gh", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "gh --version", desc: "GitHub from terminal" },
  { name: "Docker", icon: "server-process", executable: "docker", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "docker --version", desc: "Container runtime" },
  { name: "Docker Compose", icon: "server-process", executable: "docker", arguments: "compose", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "docker compose version", desc: "Multi-container Docker" },
  { name: "kubectl", icon: "server", executable: "kubectl", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "kubectl version --client", desc: "Kubernetes CLI" },
  { name: "Terraform", icon: "symbol-key", executable: "terraform", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "terraform --version", desc: "Infrastructure as Code" },
  { name: "AWS CLI", icon: "cloud", executable: "aws", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "aws --version", desc: "Amazon Web Services" },
  { name: "Azure CLI", icon: "cloud", executable: "az", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "az --version", desc: "Microsoft Azure CLI" },
  { name: "CMake", icon: "tools", executable: "cmake", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "cmake --version", desc: "Build system generator" },
  { name: "Redis CLI", icon: "database", executable: "redis-cli", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "redis-cli --version", desc: "Redis database CLI" },
  { name: "SQLite", icon: "database", executable: "sqlite3", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "sqlite3 --version", desc: "SQLite database" },
  { name: "Helm", icon: "symbol-key", executable: "helm", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "helm version", desc: "Kubernetes package mgr" },
  // Shells
  { name: "CMD Prompt", icon: "terminal-cmd", executable: "cmd.exe", arguments: "", shell: "cmd", openIn: "vscode", category: "shells", desc: "Windows Command Prompt" },
  { name: "PowerShell", icon: "terminal-powershell", executable: "powershell.exe", arguments: "", shell: "powershell", openIn: "vscode", category: "shells", desc: "Windows PowerShell" },
  { name: "PowerShell 7", icon: "terminal-powershell", executable: "pwsh.exe", arguments: "", shell: "powershell", openIn: "vscode", category: "shells", desc: "PowerShell 7 (cross-plat)" },
  { name: "Git Bash", icon: "terminal-bash", executable: "bash.exe", arguments: "", shell: "bash", openIn: "vscode", category: "shells", desc: "Git for Windows Bash" },
  { name: "WSL Ubuntu", icon: "terminal-linux", executable: "wsl.exe", arguments: "-d Ubuntu", shell: "wsl", openIn: "vscode", category: "shells", desc: "WSL Ubuntu Linux" },
];

function fromLib(l: LibEntry): Profile {
  return { id: genId(), name: l.name, icon: l.icon, executable: l.executable, arguments: l.arguments, shell: l.shell, openIn: l.openIn, category: l.category, checkCommand: l.checkCommand };
}

// ── Shell ──

function resolveShell(p: Profile): string | undefined {
  const m: Record<string, string | undefined> = { powershell: "powershell.exe", cmd: "cmd.exe", wsl: "wsl.exe", bash: "bash", zsh: "zsh" };
  return p.shell === "custom" ? p.shellPath || undefined : m[p.shell];
}

function resolveIcon(p: Profile): vscode.ThemeIcon {
  return new vscode.ThemeIcon(p.icon || "terminal");
}

function isInstalled(executable: string, checkCmd?: string): boolean {
  try {
    const cmd = checkCmd || `${executable} --version`;
    execSync(process.platform === "win32" ? `where ${executable.split(" ")[0]} 2>nul` : `command -v ${executable.split(" ")[0]} 2>/dev/null`, { encoding: "utf-8", timeout: 2000, windowsHide: true, stdio: "pipe" });
    return true;
  } catch { return false; }
}

// ── Runner ──

function buildRunCmd(p: Profile): string {
  let parts = [p.executable];
  if (p.arguments) parts.push(p.arguments);
  return parts.join(" ");
}

async function runProfile(p: Profile) {
  const loc = p.openIn === "cli" ? { viewColumn: vscode.ViewColumn.One, preserveFocus: false } as const : undefined;
  const cmd = buildRunCmd(p);
  const term = vscode.window.createTerminal({
    name: `${p.name} - CodeHub`, iconPath: resolveIcon(p),
    location: loc, shellPath: resolveShell(p),
  });
  term.show();
  if (loc) await vscode.commands.executeCommand("workbench.action.closeEditorsInOtherGroups");
  if (cmd.trim()) setTimeout(() => term.sendText(cmd.trim(), true), 800);
}

// ── Desktop Panel ──

let desktopPanel: vscode.WebviewPanel | undefined;
const srvPorts = new Set<number>();
const SRV = "oc-server";

function getOC(): string { return cfg().get<string>("opencodePath", "opencode"); }
function isOC(): boolean { try { execSync(process.platform === "win32" ? `where ${getOC().split(" ")[0]} 2>nul` : `command -v ${getOC().split(" ")[0]} 2>/dev/null`, { encoding: "utf-8", timeout: 2000, windowsHide: true, stdio: "pipe" }); return true; } catch { return false; } }
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
  } return false;
}
async function openDesktop(ctx: vscode.ExtensionContext) {
  if (desktopPanel) { desktopPanel.reveal(vscode.ViewColumn.Active, false); return; }
  if (!isOC()) { const r = await vscode.window.showErrorMessage(t("serverErr"), t("settings")); if (r === t("settings")) vscode.commands.executeCommand("workbench.action.openSettings", `${K}.opencodePath`); return; }
  desktopPanel = vscode.window.createWebviewPanel("ch.desktop", "OpenCode Desktop", vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
  desktopPanel.webview.html = `<html><body style="display:flex;align-items:center;justify-content:center;height:100%;font-family:var(--vscode-font-family);color:var(--vscode-foreground)"><div class="sp" style="width:28px;height:28px;border:3px solid rgba(128,128,128,.3);border-top-color:var(--vscode-foreground);border-radius:50%;animation:sp .8s infinite;margin:0 auto 12px"></div><div style="opacity:.6">${t("serverWait")}</div><style>@keyframes sp{to{transform:rotate(360deg)}}</style></body></html>`;
  desktopPanel.onDidDispose(() => { desktopPanel = undefined; });
  const port = Math.floor(Math.random() * 50000) + 1024; startSrv(port);
  const ok = await waitSrv(port);
  if (!desktopPanel) return;
  if (!ok) { desktopPanel.webview.html = `<html><body style="display:flex;align-items:center;justify-content:center;height:100%;font-family:var(--vscode-font-family);color:var(--vscode-errorForeground)">${t("serverErr")}</body></html>`; return; }
  desktopPanel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; frame-src http://localhost:${port} https:"><style>*{margin:0;padding:0}html,body{height:100%;overflow:hidden;background:var(--vscode-panel-background)}iframe{width:100%;height:100%;border:none}</style></head><body><iframe src="http://localhost:${port}"></iframe></body></html>`;
}

// ── Helpers ──

function runDefault() { const p = findP(cfg().get<string>("defaultProfile", "") || topId()); if (p) runProfile(p); }
async function pickProfile(title: string, sk: string) {
  const pl = getP(); const items = [{ label: `$(chevron-up) ${t("first")}`, id: "first" }, ...pl.map((p) => ({ label: `$(${p.icon || "terminal"}) ${p.name}`, description: p.executable, id: p.id }))];
  const pick = await vscode.window.showQuickPick(items, { placeHolder: title }); if (pick) { setA(sk, pick.id); }
}

// ── Icon Picker ──

async function pickIcon(existing?: string): Promise<string | undefined> {
  const ch = await vscode.window.showQuickPick([
    { label: t("noProfiles").substring(0, 30), id: "none" },
    { label: `$(symbol-color) ${t("addProfile")} ${t("iconTheme")}`, id: "theme" },
  ], { placeHolder: t("commands") });
  if (!ch) return undefined;
  if (ch.id === "none") return existing !== undefined ? existing : "";
  const icons = ["terminal","terminal-powershell","terminal-cmd","terminal-bash","terminal-linux","browser","globe","comment-discussion","comment","mention","git-branch","git-commit","github","symbol-variable","symbol-ruler","symbol-key","symbol-misc","server","server-process","database","vm","cloud","lock","key","plug","tools","wrench","beaker","light-bulb","flame","star","heart","info","warning","error","check","pulse","graph","note","book","mortar-board","code","file-directory","folder","repo","package","rocket","zap","sync","refresh","play","debug","run-all","run","save","edit","trash","add","remove","search","home","pin","bell","mail","calendar","clock","watch","person","organization","people","link","extensions","window","layout-sidebar-left","layout-panel","layout-statusbar","screen-full","split-horizontal","split-vertical","terminal-view","debug-console","notebook","symbol-class","symbol-interface","symbol-method","symbol-function","symbol-field","symbol-event","symbol-array","symbol-namespace","sparkle","wand","merge","law","shield","verified","unverified"];
  const pick = await vscode.window.showQuickPick(icons.map((i) => ({ label: `$(${i}) ${i}`, id: i })), { placeHolder: t("commands") });
  return pick?.id;
}

// ── Profile Dialog ──

async function profileDialog(existing?: Profile): Promise<Profile | undefined> {
  const name = await vscode.window.showInputBox({ prompt: t("profileName"), value: existing?.name || "", placeHolder: "Claude Code" }); if (name === undefined) return;
  const icon = await pickIcon(existing?.icon); if (icon === undefined) return;
  const exec = await vscode.window.showInputBox({ prompt: t("exec"), value: existing?.executable || "", placeHolder: "claude, node, git ..." }); if (exec === undefined) return;
  const args = await vscode.window.showInputBox({ prompt: t("args"), value: existing?.arguments || "", placeHolder: "--version, run dev, ..." }); if (args === undefined) return;
  const sp = await vscode.window.showQuickPick([
    { label: "CMD", id: "cmd" }, { label: "PowerShell", id: "powershell" }, { label: "WSL", id: "wsl" },
    { label: "Bash", id: "bash" }, { label: "Zsh", id: "zsh" }, { label: "Custom", id: "custom" },
  ], { placeHolder: t("shellType") }); if (!sp) return;
  const shell = sp.id as Profile["shell"];
  let shellPath: string | undefined;
  if (shell === "custom") { const p = await vscode.window.showInputBox({ prompt: "Custom shell path", value: existing?.shellPath || "" }); if (p === undefined) return; shellPath = p || undefined; }
  const op = await vscode.window.showQuickPick([
    { label: `$(terminal) ${t("cliOpt")}`, id: "cli" }, { label: `$(browser) ${t("desktopOpt")}`, id: "desktop" }, { label: `$(terminal-powershell) ${t("vscodeOpt")}`, id: "vscode" },
  ], { placeHolder: t("openIn") }); if (!op) return;
  return { id: existing?.id || genId(), name, icon: icon || undefined, executable: exec, arguments: args, shell, shellPath, openIn: op.id as "cli" | "desktop" | "vscode" };
}

async function pickFromLib(): Promise<Profile | undefined> {
  const cats = CATS.map((c, i) => ({ label: `**${tc("categories", i)}**`, id: c, kind: vscode.QuickPickItemKind.Separator }));
  const items = LIB.map((l) => ({ label: `$(${l.icon}) ${l.name}`, description: l.executable + (l.arguments ? " " + l.arguments : ""), detail: `${l.desc} | ${l.shell} | ${l.openIn}`, lib: l }));
  const all = [...cats.reduce((acc: any[], c) => { acc.push(c); acc.push(...items.filter((i) => i.lib.category === c.id)); return acc; }, [])];
  const pick = await vscode.window.showQuickPick(all, { placeHolder: t("library"), matchOnDescription: true, matchOnDetail: true });
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
      if (m.type === "run") { const p = findP(m.id); if (p) { if (p.openIn === "desktop") { openDesktop(this.ctx); } else await runProfile(p); } this.sync(); return; }
      if (m.type === "runV") { const p = findP(m.id); if (p) await runProfile({ ...p, openIn: "vscode" }); this.sync(); return; }
      if (m.type === "closeAll") { vscode.window.terminals.filter((t) => t.name.includes("CodeHub") || t.name === SRV).forEach((t) => t.dispose()); srvPorts.clear(); this.sync(); return; }
      if (m.type === "addLib") { const l = await pickFromLib(); if (!l) { this.sync(); return; } const list = getP(); list.push(l); setP(list); this.sync(); vscode.window.showInformationMessage(`${t("created")}: ${l.name}`); return; }
      if (m.type === "add") { const r = await profileDialog(); if (!r) { this.sync(); return; } const list = getP(); list.push(r); setP(list); this.sync(); vscode.window.showInformationMessage(`${t("created")}: ${r.name}`); return; }
      if (m.type === "edit") { const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return; const u = await profileDialog(list[i]); if (!u) { this.sync(); return; } list[i] = u; setP(list); this.sync(); vscode.window.showInformationMessage(t("updated")); return; }
      if (m.type === "delete") { setP(getP().filter((x) => x.id !== m.id)); if (cfg().get<string>("defaultProfile", "") === m.id) cfg().update("defaultProfile", "", vscode.ConfigurationTarget.Global); this.sync(); vscode.window.showInformationMessage(t("deleted")); return; }
      if (m.type === "up" || m.type === "down") { const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return; const j = m.type === "up" ? i - 1 : i + 1; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; setP(list); this.sync(); return; }
      if (m.type === "reorder") { const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return; const to = Math.max(0, Math.min(list.length - 1, (parseInt(m.value) || 1) - 1)); const item = list.splice(i, 1)[0]; list.splice(to, 0, item); setP(list); this.sync(); return; }
      if (m.type === "p-status" || m.type === "p-startup" || m.type === "p-shortcut") { 
        const key = { "p-status": "statusBarProfile", "p-startup": "startupProfile", "p-shortcut": "shortcutProfile" }[m.type as string]!; 
        const titleKey = { "p-status": "setStatusBar", "p-startup": "setStartup", "p-shortcut": "setShortcut" }[m.type as string]!; 
        await pickProfile(t(titleKey), key); this.sync(); return; 
      }
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
      const isDef = p.id === defId; const first = idx === 0; const last = idx === list.length - 1;
      const installed = isInstalled(p.executable, p.checkCommand);
      const icon = p.icon ? `<span class="ic codicon codicon-${esc(p.icon)}"></span>` : `<span class="ic-s">${p.executable[0].toUpperCase()}</span>`;
      return `<div class="cr ${isDef?"d":""}" style="animation-delay:${idx*0.03}s">
        <div class="ch">
          <input class="on" type="number" value="${idx+1}" min="1" max="${list.length}" onchange="p('reorder','${p.id}',this.value)">
          <span class="cb ${installed?'play':'na'}" onclick="p('run','${p.id}')" title="${installed?'':'Not installed'}">${icon}</span>
          <div class="cn" onclick="p('run','${p.id}')">
            <span class="cn-t">${esc(p.name)}${isDef?' <span class="star">\u2605</span>':''}</span>
            <span class="cn-s">${esc(p.executable)} ${esc(p.arguments)} <span class="c-${p.openIn}">${p.openIn}</span></span>
          </div>
          <div class="ca">
            <button class="b b-p" onclick="p('runV','${p.id}')" title="Panelde a\u00E7">\u25A1</button>
            <button class="b" onclick="p('edit','${p.id}')" title="D\u00FCzenle">\u270E</button>
            <button class="b b-del" onclick="p('delete','${p.id}')" title="Sil">\u2716</button>
            <button class="b b-arr" onclick="p('up','${p.id}')" ${first?'disabled':''} style="${first?'opacity:.12;cursor:default':''}">\u25B2</button>
            <button class="b b-arr" onclick="p('down','${p.id}')" ${last?'disabled':''} style="${last?'opacity:.12;cursor:default':''}">\u25BC</button>
          </div>
        </div>
      </div>`;
    }).join("");

    const sb = profName(getA("statusBarProfile")); const su = profName(getA("startupProfile")); const sk = profName(getA("shortcutProfile"));

    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"/><style>
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
:root{--c:var(--vscode-foreground);--c2:color-mix(in srgb,var(--vscode-foreground) 45%,transparent);--bg:var(--vscode-sideBar-background);--bord:color-mix(in srgb,var(--vscode-foreground) 8%,transparent);--hover:var(--vscode-list-hoverBackground);--btn:var(--vscode-button-background);--btnf:var(--vscode-button-foreground);--btn2:var(--vscode-button-secondaryBackground);--btn2f:var(--vscode-button-secondaryForeground);--focus:var(--vscode-focusBorder);--err:var(--vscode-errorForeground);--succ:var(--vscode-testing-iconPassed);--warn:var(--vscode-editorMarkerNavigationWarning-background);--font:var(--vscode-font-family);--fs:var(--vscode-font-size)}
*{margin:0;padding:0;box-sizing:border-box}
body{padding:16px;font-family:var(--font);font-size:var(--fs);color:var(--c);line-height:1.5;background:var(--bg)}
.hdr{font-size:19px;font-weight:700;display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid var(--bord);animation:fade .4s ease}
.hdr .sub{font-size:12px;font-weight:400;opacity:.35;margin-left:auto}
.hdr .codicon{font-size:22px;opacity:.8}
.ac{display:flex;flex-direction:column;gap:5px;margin-bottom:14px;animation:fade .4s ease .05s both}
.acb{display:flex;align-items:center;gap:8px;padding:10px 12px;border:none;border-radius:8px;cursor:pointer;font-size:12px;background:var(--btn2);color:var(--c);width:100%;text-align:left;transition:background .15s,transform .12s}
.acb:hover{background:var(--hover);transform:translateX(2px)}
.acb .al{opacity:.4;flex-shrink:0;width:20px;font-size:10px}
.acb .av{font-weight:500;flex:1}
.acb .av2{font-size:11px;opacity:.45}
.sl{font-size:12px;font-weight:600;text-transform:uppercase;opacity:.45;letter-spacing:.8px;margin:16px 0 8px;display:flex;align-items:center;gap:8px;animation:fade .4s ease .08s both}
.sl::after{content:"";flex:1;height:1px;background:var(--bord)}
.cr{margin:5px 0;border-radius:10px;background:color-mix(in srgb,var(--c) 3%,transparent);border:1px solid var(--bord);overflow:hidden;transition:border-color .15s,box-shadow .15s;animation:fade .35s ease both}
.cr:hover{border-color:color-mix(in srgb,var(--c) 20%,transparent);box-shadow:0 1px 4px rgba(0,0,0,.04)}
.cr.d{border-color:var(--focus);background:color-mix(in srgb,var(--focus) 6%,var(--bg))}
.ch{display:flex;align-items:center;gap:6px;padding:8px 8px}
.on{width:28px;height:24px;border-radius:5px;border:1px solid var(--bord);background:transparent;color:var(--c);text-align:center;font-size:11px;font-weight:600;flex-shrink:0;transition:border-color .12s}
.on:focus{border-color:var(--focus);outline:none;background:color-mix(in srgb,var(--focus) 5%,transparent)}
.cb{width:34px;height:34px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;transition:all .15s}
.cb.play{background:color-mix(in srgb,var(--btn) 12%,transparent);color:var(--btn)}
.cb.play:hover{background:var(--btn);color:var(--btnf);transform:scale(1.08)}
.cb.na{opacity:.35}.cb.na:hover{opacity:.6;transform:scale(1.05)}
.ic{font-size:18px}.ic-s{font-size:11px;font-weight:700;opacity:.5}
.cn{flex:1;min-width:0;cursor:pointer;padding:3px 6px;border-radius:5px;transition:background .12s}
.cn:hover{background:var(--hover)}
.cn-t{font-size:14px;font-weight:500;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cn-s{font-size:10px;color:var(--c2);display:block;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.star{color:var(--warn);font-size:11px}
.c-cli{color:var(--succ)}.c-desktop{color:var(--err)}.c-vscode{color:var(--warn)}
.ca{display:flex;gap:2px;flex-shrink:0}
.b{width:24px;height:24px;border:none;border-radius:4px;cursor:pointer;font-size:10px;background:transparent;color:var(--c);opacity:.25;display:flex;align-items:center;justify-content:center;padding:0;transition:all .12s}
.b:hover{opacity:1;background:var(--hover);transform:scale(1.12)}
.b-del:hover{color:var(--err);opacity:1}
.b-p{color:var(--succ);opacity:.5}.b-p:hover{opacity:1;background:color-mix(in srgb,var(--succ) 10%,transparent)}
.b-arr:hover{opacity:.8}
.b:disabled{pointer-events:none}.b:disabled:hover{transform:none;background:transparent}
.emp{padding:36px 20px;text-align:center;font-size:13px;opacity:.35;line-height:1.6;animation:fade .4s ease}
.qb{width:100%;padding:11px 16px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;text-align:center;transition:opacity .12s,transform .12s;display:block}
.qb:hover{opacity:.82;transform:translateY(-1px)}
.qb-p{background:var(--btn);color:var(--btnf);margin-bottom:5px}.qb-s{background:var(--btn2);color:var(--c);margin-bottom:5px}
.qb-d{background:color-mix(in srgb,var(--err) 10%,transparent);color:var(--err)}
.qb-add{border:1.5px dashed var(--bord);background:transparent;color:var(--c2)}
.qb-add:hover{border-color:var(--c);color:var(--c)}
</style></head><body>
<div class="hdr"><span class="codicon codicon-terminal"></span>CodeHub<span class="sub">${tc > 0 ? `$(terminal) ${tc} terminal` : `$(circle-slash) ${t("terminalCountZero")}`}</span></div>

<div class="ac">
  <button class="acb" onclick="p('p-status')"><span class="al">\u25B6</span><span class="av">${t("setStatusBar")}</span><span class="av2">${esc(sb)}</span></button>
  <button class="acb" onclick="p('p-startup')"><span class="al">\u25B6</span><span class="av">${t("setStartup")}</span><span class="av2">${esc(su)}</span></button>
  <button class="acb" onclick="p('p-shortcut')"><span class="al">\u25B6</span><span class="av">${t("setShortcut")}</span><span class="av2">${esc(sk)}</span></button>
</div>

<div class="sl">${t("profileList")}</div>
${list.length > 0 ? rows : `<div class="emp">${t("noProfiles")}</div>`}

<button class="qb qb-add" onclick="p('add')">+ ${t("addProfile")}</button>
<button class="qb qb-s" onclick="p('addLib')">$(database) ${t("addFromLib")}</button>
<button class="qb qb-s" onclick="p('desktop')" style="margin-top:8px">$(browser) OpenCode Desktop</button>
<button class="qb qb-s" onclick="p('settings')">$(gear) ${t("settings")}</button>
<button class="qb qb-d" onclick="p('closeAll')" style="margin-top:4px">$(trash) ${t("closeAll")}</button>

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
  const upd = () => { const n = vscode.window.terminals.filter((t) => t.name.includes("CodeHub")).length; sb.text = n > 0 ? `$(terminal) CodeHub (${n})` : "$(terminal) CodeHub"; sb.command = "codehub.runDefault"; };
  upd();
  ctx.subscriptions.push(vscode.window.onDidOpenTerminal(upd));
  ctx.subscriptions.push(vscode.window.onDidCloseTerminal(() => { upd(); side.sync(); }));
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(K)) side.sync(); }));

  const delay = cfg().get<number>("startupDelay", 1200);
  if (cfg().get<string>("startupMode", "defaultProfile") !== "none") {
    setTimeout(() => { const id = getA("startupProfile"); const p = findP(resolveId(id)); if (p) runProfile(p); else runDefault(); }, delay);
  }
}

export function deactivate() { srvPorts.clear(); }
