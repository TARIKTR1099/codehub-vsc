import * as vscode from "vscode";
import { execSync } from "child_process";

// ── Types ──

interface Profile {
  id: string; name: string; icon?: string;
  executable: string; arguments: string;
  shell: "powershell" | "cmd" | "wsl" | "bash" | "zsh" | "custom";
  shellPath?: string; openIn: "cli" | "desktop" | "vscode";
  category?: string; checkCommand?: string;
}

interface LibEntry {
  name: string; icon: string; executable: string; arguments: string;
  shell: Profile["shell"]; openIn: Profile["openIn"];
  category: string; checkCommand?: string; desc: string; group: string;
}

// ── I18n ──

const _ = (tr: string, en: string) => ({ tr, en });
const T: Record<string, Record<string, string>> = {
  appName: _("CodeHub", "CodeHub"), settings: _("Ayarlar", "Settings"),
  library: _("Kütüphane", "Library"), addFromLib: _("Kütüphaneden Ekle", "Add from Library"),
  addProfile: _("Profil Ekle", "Add Profile"),
  noProfiles: _("Henüz profil yok. Kütüphane'den ekleyin.", "No profiles yet. Add from Library."),
  created: _("Profil oluşturuldu", "Profile created"), deleted: _("Profil silindi", "Profile deleted"),
  updated: _("Profil güncellendi", "Profile updated"), closeAll: _("Tümünü Kapat", "Close All"),
  profileList: _("Profiller", "Profiles"), first: _("En üstteki (ilk)", "Topmost (first)"),
  setStatusBar: _("Durum çubuğu profili", "Status bar profile"),
  setStartup: _("Başlangıç profili", "Startup profile"),
  setShortcut: _("Kısayol profili", "Shortcut profile"),
  profileName: _("Profil adı", "Profile name"), shellType: _("Shell", "Shell"),
  exec: _("Çalıştır", "Executable"), args: _("Argümanlar", "Arguments"),
  openIn: _("Açılacağı yer", "Open location"),
  cliOpt: _("OpenCode CLI (tam ekran)", "OpenCode CLI (fullscreen)"),
  desktopOpt: _("OpenCode Desktop (web)", "OpenCode Desktop (web)"),
  vscodeOpt: _("OpenCode VSCode (panel)", "OpenCode VSCode (panel)"),
  edit: _("Düzenle", "Edit"), del: _("Sil", "Delete"),
  up: _("Yukarı", "Up"), down: _("Aşağı", "Down"),
  terminalCount: _("{n} terminal", "{n} terminals"), terminalCountZero: _("terminal yok", "no terminals"),
  runPanel: _("Panelde aç", "Open in Panel"),
  statusTip: _("CodeHub - En üstteki profili çalıştır", "CodeHub - Run top profile"),
  serverWait: _("OpenCode sunucu başlatılıyor...", "Starting OpenCode server..."),
  serverErr: _("OpenCode CLI bulunamadı.", "OpenCode CLI not found."),
  exportTitle: _("Dışa Aktar", "Export"), importTitle: _("İçe Aktar", "Import"),
  exported: _("Profiller dışa aktarıldı", "Profiles exported"), imported: _("Profiller içe aktarıldı", "Profiles imported"),
  installed: _("Kurulu", "Installed"), notInstalled: _("Kurulu değil", "Not installed"),
  groups: { tr: "Yapay Zeka|Diller & Araçlar|Shell'ler", en: "AI Agents|Languages & Tools|Shells" },
  searchLib: _("Kütüphanede ara...", "Search library..."),
};

function t(k: string): string {
  const l = vscode.workspace.getConfiguration("codehub").get<string>("language", "tr") === "en" ? "en" : "tr";
  return T[k]?.[l] ?? k;
}
function tg(k: string, i: number): string {
  const l = vscode.workspace.getConfiguration("codehub").get<string>("language", "tr") === "en" ? "en" : "tr";
  const v = T[k]?.[l] ?? k; return v.split("|")[i] || v;
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
function dens(): string { return cfg().get<string>("density", "comfortable"); }
function anims(): boolean { return cfg().get<boolean>("animations", true); }
function autoFocus(): boolean { return cfg().get<boolean>("autoFocus", true); }
function showUnavail(): boolean { return cfg().get<boolean>("showUnavailable", true); }

// ── Library ──

const LIB: LibEntry[] = [
  { group: "ai", name: "Claude Code", icon: "comment-discussion", executable: "claude", arguments: "", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "claude --version", desc: "Anthropic AI agent CLI" },
  { group: "ai", name: "OpenCode CLI", icon: "terminal", executable: "opencode", arguments: "", shell: "cmd", openIn: "cli", category: "ai", desc: "OpenCode AI CLI" },
  { group: "ai", name: "OpenCode Desktop", icon: "browser", executable: "opencode", arguments: "", shell: "cmd", openIn: "desktop", category: "ai", desc: "OpenCode web panel" },
  { group: "ai", name: "OpenCode VSCode", icon: "terminal-powershell", executable: "opencode", arguments: "", shell: "cmd", openIn: "vscode", category: "ai", desc: "OpenCode VS Code panel" },
  { group: "ai", name: "OpenAI Codex", icon: "symbol-ruler", executable: "codex", arguments: "", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "codex --version", desc: "OpenAI coding agent CLI" },
  { group: "ai", name: "Gemini CLI", icon: "sparkle", executable: "gemini", arguments: "", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "gemini --version", desc: "Google Gemini CLI" },
  { group: "ai", name: "Aider", icon: "tools", executable: "aider", arguments: "--model sonnet", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "aider --version", desc: "AI pair programming CLI" },
  { group: "ai", name: "Kiro CLI", icon: "terminal-bash", executable: "kiro-cli", arguments: "chat", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "kiro-cli --version", desc: "Kiro interactive CLI" },
  { group: "ai", name: "GitHub Copilot", icon: "github", executable: "copilot", arguments: "", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "copilot --version", desc: "GitHub Copilot CLI" },
  { group: "ai", name: "Amazon Q", icon: "cloud", executable: "q", arguments: "", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "q --version", desc: "Amazon Q Developer CLI" },
  { group: "ai", name: "Goose", icon: "star", executable: "goose", arguments: "", shell: "cmd", openIn: "cli", category: "ai", checkCommand: "goose --version", desc: "Goose AI agent" },
  { group: "tools", name: "Node.js", icon: "symbol-variable", executable: "node", arguments: "", shell: "cmd", openIn: "vscode", category: "langs", checkCommand: "node --version", desc: "JavaScript runtime" },
  { group: "tools", name: "Python", icon: "symbol-ruler", executable: "python", arguments: "", shell: "cmd", openIn: "vscode", category: "langs", checkCommand: "python --version", desc: "Python interpreter" },
  { group: "tools", name: "Deno", icon: "symbol-misc", executable: "deno", arguments: "", shell: "cmd", openIn: "vscode", category: "langs", checkCommand: "deno --version", desc: "Deno runtime" },
  { group: "tools", name: "Rust (Cargo)", icon: "symbol-key", executable: "cargo", arguments: "", shell: "cmd", openIn: "vscode", category: "langs", checkCommand: "cargo --version", desc: "Rust build tool & pkg mgr" },
  { group: "tools", name: "npm", icon: "package", executable: "npm", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "npm --version", desc: "Node package manager" },
  { group: "tools", name: "pnpm", icon: "package", executable: "pnpm", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "pnpm --version", desc: "Fast, disk-space-efficient npm" },
  { group: "tools", name: "yarn", icon: "package", executable: "yarn", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "yarn --version", desc: "Alternative npm client" },
  { group: "tools", name: "bun", icon: "zap", executable: "bun", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "bun --version", desc: "All-in-one JS/TS runtime" },
  { group: "tools", name: "pip", icon: "symbol-ruler", executable: "pip", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "pip --version", desc: "Python package installer" },
  { group: "tools", name: "uv", icon: "zap", executable: "uv", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "uv --version", desc: "Fast Python pkg mgr (Rust)" },
  { group: "tools", name: "Git", icon: "git-branch", executable: "git", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "git --version", desc: "Distributed version control" },
  { group: "tools", name: "GitHub CLI", icon: "github", executable: "gh", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "gh --version", desc: "GitHub from terminal" },
  { group: "tools", name: "Docker", icon: "server-process", executable: "docker", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "docker --version", desc: "Container runtime & tools" },
  { group: "tools", name: "Docker Compose", icon: "server-process", executable: "docker", arguments: "compose", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "docker compose version", desc: "Multi-container Docker apps" },
  { group: "tools", name: "kubectl", icon: "server", executable: "kubectl", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "kubectl version --client", desc: "Kubernetes cluster manager" },
  { group: "tools", name: "Terraform", icon: "symbol-key", executable: "terraform", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "terraform --version", desc: "Infrastructure as Code" },
  { group: "tools", name: "AWS CLI", icon: "cloud", executable: "aws", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "aws --version", desc: "Amazon Web Services CLI" },
  { group: "tools", name: "Azure CLI", icon: "cloud", executable: "az", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "az --version", desc: "Microsoft Azure CLI" },
  { group: "tools", name: "Helm", icon: "symbol-key", executable: "helm", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "helm version", desc: "Kubernetes package mgr" },
  { group: "tools", name: "SQLite", icon: "database", executable: "sqlite3", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "sqlite3 --version", desc: "Lightweight SQL database" },
  { group: "tools", name: "Redis CLI", icon: "database", executable: "redis-cli", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "redis-cli --version", desc: "Redis database CLI" },
  { group: "tools", name: "CMake", icon: "tools", executable: "cmake", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "cmake --version", desc: "Cross-platform build system" },
  { group: "shells", name: "CMD Prompt", icon: "terminal-cmd", executable: "cmd.exe", arguments: "", shell: "cmd", openIn: "vscode", category: "shells", desc: "Windows Command Prompt" },
  { group: "shells", name: "PowerShell 5", icon: "terminal-powershell", executable: "powershell.exe", arguments: "", shell: "powershell", openIn: "vscode", category: "shells", desc: "Windows PowerShell" },
  { group: "shells", name: "PowerShell 7", icon: "terminal-powershell", executable: "pwsh.exe", arguments: "", shell: "powershell", openIn: "vscode", category: "shells", desc: "PowerShell 7 (cross-platform)" },
  { group: "shells", name: "Git Bash", icon: "terminal-bash", executable: "bash.exe", arguments: "", shell: "bash", openIn: "vscode", category: "shells", desc: "Git for Windows Bash" },
  { group: "shells", name: "WSL Ubuntu", icon: "terminal-linux", executable: "wsl.exe", arguments: "-d Ubuntu", shell: "wsl", openIn: "vscode", category: "shells", desc: "WSL Ubuntu Linux distro" },
];

function fromLib(l: LibEntry): Profile {
  return { id: genId(), name: l.name, icon: l.icon, executable: l.executable, arguments: l.arguments, shell: l.shell, openIn: l.openIn, category: l.category, checkCommand: l.checkCommand };
}

// ── Helpers ──

function resolveShell(p: Profile): string | undefined {
  const m: Record<string, string | undefined> = { powershell: "powershell.exe", cmd: "cmd.exe", wsl: "wsl.exe", bash: "bash", zsh: "zsh" };
  return p.shell === "custom" ? p.shellPath || undefined : m[p.shell];
}

function isInst(executable: string): boolean {
  try { execSync(process.platform === "win32" ? `where ${executable.split(" ")[0]} 2>nul` : `command -v ${executable.split(" ")[0]} 2>/dev/null`, { encoding: "utf-8", timeout: 1500, windowsHide: true, stdio: "pipe" }); return true; } catch { return false; }
}

function buildCmd(p: Profile): string { return [p.executable, p.arguments].filter(Boolean).join(" "); }

async function runProf(p: Profile) {
  const loc = p.openIn === "cli" ? { viewColumn: vscode.ViewColumn.One, preserveFocus: !autoFocus() } as const : undefined;
  const cmd = buildCmd(p);
  const term = vscode.window.createTerminal({ name: `${p.name} - CodeHub`, iconPath: new vscode.ThemeIcon(p.icon || "terminal"), location: loc, shellPath: resolveShell(p) });
  term.show(); if (loc) await vscode.commands.executeCommand("workbench.action.closeEditorsInOtherGroups");
  if (cmd.trim()) setTimeout(() => term.sendText(cmd.trim(), true), 800);
}

function runDef() { const p = findP(cfg().get<string>("defaultProfile", "") || topId()); if (p) runProf(p); }

async function pickProf(title: string, sk: string) {
  const pl = getP(); const items = [{ label: `$(chevron-up) ${t("first")}`, id: "first" }, ...pl.map((p) => ({ label: `$(${p.icon || "terminal"}) ${p.name}`, description: p.executable, id: p.id }))];
  const pick = await vscode.window.showQuickPick(items, { placeHolder: title }); if (pick) setA(sk, pick.id);
}

// ── Desktop Panel ──

let desktopPanel: vscode.WebviewPanel | undefined;
const srvPorts = new Set<number>(); const SRV = "oc-server";
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
  desktopPanel.webview.html = `<html><body style="display:flex;align-items:center;justify-content:center;height:100%;font-family:var(--vscode-font-family);color:var(--vscode-foreground)"><div style="text-align:center"><div style="width:28px;height:28px;border:3px solid rgba(128,128,128,.3);border-top-color:var(--vscode-foreground);border-radius:50%;animation:spin .8s infinite;margin:0 auto 12px"></div><div style="opacity:.6">${t("serverWait")}</div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></body></html>`;
  desktopPanel.onDidDispose(() => { desktopPanel = undefined; });
  const port = Math.floor(Math.random() * 50000) + 1024; startSrv(port);
  const ok = await waitSrv(port);
  if (!desktopPanel) return;
  if (!ok) { desktopPanel.webview.html = `<html><body style="display:flex;align-items:center;justify-content:center;height:100%;font-family:var(--vscode-font-family);color:var(--vscode-errorForeground)">${t("serverErr")}</body></html>`; return; }
  desktopPanel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; frame-src http://localhost:${port} https:"><style>*{margin:0;padding:0}html,body{height:100%;overflow:hidden;background:var(--vscode-panel-background)}iframe{width:100%;height:100%;border:none}</style></head><body><iframe src="http://localhost:${port}"></iframe></body></html>`;
}

// ── Import/Export ──

async function exportProfiles() {
  const uri = await vscode.window.showSaveDialog({ filters: { "CodeHub Profiles": ["json"] }, defaultUri: vscode.Uri.file(`codehub-profiles-${new Date().toISOString().slice(0, 10)}.json`) });
  if (!uri) return;
  const data = JSON.stringify(getP(), null, 2);
  try { vscode.workspace.fs.writeFile(uri, Buffer.from(data, "utf-8")); vscode.window.showInformationMessage(t("exported")); } catch { vscode.window.showErrorMessage("Export failed"); }
}

async function importProfiles() {
  const uri = await vscode.window.showOpenDialog({ filters: { "CodeHub Profiles": ["json"] }, canSelectMany: false });
  if (!uri || !uri.length) return;
  try {
    const data = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri[0]));
    const profiles = JSON.parse(data) as Profile[];
    if (!Array.isArray(profiles)) throw new Error();
    profiles.forEach((p) => { if (!p.id) p.id = genId(); });
    setP(profiles); vscode.window.showInformationMessage(`${t("imported")} (${profiles.length})`);
  } catch { vscode.window.showErrorMessage("Import failed: invalid file"); }
}

// ── Icon Picker ──

async function pickIcon(existing?: string): Promise<string | undefined> {
  const ch = await vscode.window.showQuickPick([
    { label: `$(close) ${t("first").split(" ")[0]} (Enter)`, id: "none" },
    { label: `$(symbol-color) ${t("exec")} ${t("shellType")}`, id: "theme" },
  ], { placeHolder: t("args") });
  if (!ch) return undefined;
  if (ch.id === "none") return existing !== undefined ? existing : "";
  const icons = ["terminal","terminal-powershell","terminal-cmd","terminal-bash","terminal-linux","browser","globe","comment-discussion","comment","mention","git-branch","git-commit","git-pull-request","github","symbol-variable","symbol-ruler","symbol-key","symbol-misc","server","server-process","database","vm","cloud","lock","key","plug","tools","wrench","beaker","light-bulb","flame","star","heart","info","warning","error","check","pulse","graph","note","book","mortar-board","code","file-directory","folder","repo","package","rocket","zap","sync","refresh","play","debug","run-all","save","edit","trash","add","remove","search","home","pin","bell","mail","calendar","clock","watch","person","organization","people","link","extensions","window","layout-sidebar-left","layout-panel","screen-full","split-horizontal","terminal-view","debug-console","notebook","symbol-class","symbol-interface","symbol-method","symbol-function","symbol-field","symbol-event","symbol-array","symbol-namespace","sparkle","wand","merge","shield","verified","unverified","circuit-board","globe","hubot","inbox","issue-closed","issue-opened","issue-reopened"];
  const pick = await vscode.window.showQuickPick(icons.map((i) => ({ label: `$(${i}) ${i}`, id: i })), { placeHolder: t("args") });
  return pick?.id;
}

// ── Profile Dialog ──

async function profDlg(existing?: Profile): Promise<Profile | undefined> {
  const name = await vscode.window.showInputBox({ prompt: t("profileName"), value: existing?.name || "", placeHolder: "Claude Code" }); if (name === undefined) return;
  const icon = await pickIcon(existing?.icon); if (icon === undefined) return;
  const exec = await vscode.window.showInputBox({ prompt: t("exec"), value: existing?.executable || "", placeHolder: "claude, node, git ..." }); if (exec === undefined) return;
  const args = await vscode.window.showInputBox({ prompt: t("args"), value: existing?.arguments || "", placeHolder: "--version, run dev" }); if (args === undefined) return;
  const sp = await vscode.window.showQuickPick([
    { label: "$(terminal-cmd) CMD", id: "cmd" }, { label: "$(terminal-powershell) PowerShell", id: "powershell" },
    { label: "$(terminal-linux) WSL", id: "wsl" }, { label: "$(terminal-bash) Bash", id: "bash" },
    { label: "$(terminal-bash) Zsh", id: "zsh" }, { label: "$(tools) Custom", id: "custom" },
  ], { placeHolder: t("shellType") }); if (!sp) return;
  const shell = sp.id as Profile["shell"];
  let shellPath: string | undefined;
  if (shell === "custom") { const p = await vscode.window.showInputBox({ prompt: "Custom shell path", value: existing?.shellPath || "" }); if (p === undefined) return; shellPath = p || undefined; }
  const op = await vscode.window.showQuickPick([
    { label: "$(terminal) " + t("cliOpt"), id: "cli" }, { label: "$(browser) " + t("desktopOpt"), id: "desktop" }, { label: "$(terminal-powershell) " + t("vscodeOpt"), id: "vscode" },
  ], { placeHolder: t("openIn") }); if (!op) return;
  return { id: existing?.id || genId(), name, icon: icon || undefined, executable: exec, arguments: args, shell, shellPath, openIn: op.id as "cli" | "desktop" | "vscode" };
}

async function pickLib(): Promise<Profile | undefined> {
  const groups = ["ai", "tools", "shells"]; const separators: any[] = [];
  groups.forEach((g, i) => { if (LIB.some((l) => l.group === g)) separators.push({ label: tg("groups", i), kind: vscode.QuickPickItemKind.Separator }); });
  const items = LIB.filter((l) => showUnavail() || isInst(l.executable)).map((l) => ({ label: `$(${l.icon}) ${l.name}`, description: `${l.executable} ${l.arguments}`.trim(), detail: `${l.desc} \u2022 ${l.shell} \u2022 ${l.openIn}`, lib: l }));
  const all: any[] = []; groups.forEach((g) => { const s = separators[groups.indexOf(g)]; if (s) all.push(s); all.push(...items.filter((i) => i.lib.group === g)); });
  const pick = await vscode.window.showQuickPick(all, { placeHolder: t("searchLib"), matchOnDescription: true, matchOnDetail: true });
  return pick ? fromLib(pick.lib) : undefined;
}

// ── Side Panel ──

class SidePanel implements vscode.WebviewViewProvider {
  static vt = "codehub.sidePanel";
  private v?: vscode.WebviewView;
  constructor(private ctx: vscode.ExtensionContext) {}

  resolveWebviewView(vw: vscode.WebviewView) {
    this.v = vw; vw.webview.options = { enableScripts: true }; this.render();
    vw.onDidDispose(() => { this.v = undefined; });
    vw.webview.onDidReceiveMessage(async (m) => {
      if (m.type === "run") { const p = findP(m.id); if (p) { if (p.openIn === "desktop") openDesktop(this.ctx); else await runProf(p); } this.render(); return; }
      if (m.type === "runV") { const p = findP(m.id); if (p) await runProf({ ...p, openIn: "vscode" }); this.render(); return; }
      if (m.type === "closeAll") { vscode.window.terminals.filter((t) => t.name.includes("CodeHub") || t.name === SRV).forEach((t) => t.dispose()); srvPorts.clear(); this.render(); return; }
      if (m.type === "addLib") { const l = await pickLib(); if (!l) { this.render(); return; } const list = getP(); list.push(l); setP(list); this.render(); vscode.window.showInformationMessage(`${t("created")}: ${l.name}`); return; }
      if (m.type === "add") { const r = await profDlg(); if (!r) { this.render(); return; } const list = getP(); list.push(r); setP(list); this.render(); vscode.window.showInformationMessage(`${t("created")}: ${r.name}`); return; }
      if (m.type === "edit") { const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return; const u = await profDlg(list[i]); if (!u) { this.render(); return; } list[i] = u; setP(list); this.render(); vscode.window.showInformationMessage(t("updated")); return; }
      if (m.type === "delete") { setP(getP().filter((x) => x.id !== m.id)); if (cfg().get<string>("defaultProfile", "") === m.id) cfg().update("defaultProfile", "", vscode.ConfigurationTarget.Global); this.render(); vscode.window.showInformationMessage(t("deleted")); return; }
      if (m.type === "up" || m.type === "down") { const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return; const j = m.type === "up" ? i - 1 : i + 1; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; setP(list); this.render(); return; }
      if (m.type === "reorder") { const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return; const to = Math.max(0, Math.min(list.length - 1, (parseInt(m.value) || 1) - 1)); const item = list.splice(i, 1)[0]; list.splice(to, 0, item); setP(list); this.render(); return; }
      if (m.type === "p-status" || m.type === "p-startup" || m.type === "p-shortcut") { const keys: Record<string, string> = { "p-status": "statusBarProfile", "p-startup": "startupProfile", "p-shortcut": "shortcutProfile" }; const titles: Record<string, string> = { "p-status": "setStatusBar", "p-startup": "setStartup", "p-shortcut": "setShortcut" }; await pickProf(t(titles[m.type]!), keys[m.type]!); this.render(); return; }
      if (m.type === "export") { await exportProfiles(); return; }
      if (m.type === "import") { await importProfiles(); this.render(); return; }
      if (m.type === "desktop") { openDesktop(this.ctx); return; }
      if (m.type === "settings") { vscode.commands.executeCommand("workbench.action.openSettings", K); return; }
    });
  }

  render() { if (this.v) this.v.webview.html = this.html(); }

  private html(): string {
    const list = getP(); const lang = cfg().get<string>("language", "tr") === "en" ? "en" : "tr";
    const tc = vscode.window.terminals.filter((t) => t.name.includes("CodeHub")).length;
    const defId = cfg().get<string>("defaultProfile", "") || topId();
    const density = dens(); const anime = anims();
    const n = () => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; let r = ""; for (let i = 0; i < 32; i++) r += c[Math.floor(Math.random() * c.length)]; return r; };
    const esc = (s: string) => s.replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[m] || m);
    const animCls = anime ? "anim" : "";
    const pad = density === "compact" ? 10 : density === "spacious" ? 22 : 16;
    const gap = density === "compact" ? 3 : density === "spacious" ? 8 : 5;
    const fSize = density === "compact" ? 12 : density === "spacious" ? 15 : 14;
    const rows = list.map((p, idx) => {
      const isDef = p.id === defId; const first = idx === 0; const last = idx === list.length - 1;
      const installed = isInst(p.executable);
      const icon = p.icon ? `<span class="ic codicon codicon-${esc(p.icon)}"></span>` : `<span class="ic-s">${p.executable[0].toUpperCase()}</span>`;
      return `<div class="cr ${isDef?"d":""} ${animCls}" style="animation-delay:${idx*0.025}s">
        <div class="ch">
          <input class="on" type="number" value="${idx+1}" min="1" max="${list.length}" onchange="p('reorder','${p.id}',this.value)">
          <span class="cb ${installed?"play":"na"}" onclick="p('run','${p.id}')">${icon}${!installed?`<span class="ndot"></span>`:""}</span>
          <div class="cn" onclick="p('run','${p.id}')">
            <span class="cn-t">${esc(p.name)}${isDef?' <span class="star">\u2605</span>':''}</span>
            <span class="cn-s">${esc(buildCmd(p))} <span class="c-${p.openIn}">${p.openIn}</span></span>
          </div>
          <div class="ca">
            <button class="b b-p" onclick="p('runV','${p.id}')" title="Panelde a\u00E7">\u25A1</button>
            <button class="b" onclick="p('edit','${p.id}')" title="D\u00FCzenle">\u270E</button>
            <button class="b b-del" onclick="p('delete','${p.id}')" title="Sil">\u2716</button>
            <button class="b b-arr" onclick="p('up','${p.id}')" ${first?'disabled':''} style="${first?'opacity:.1;cursor:default':''}">\u25B2</button>
            <button class="b b-arr" onclick="p('down','${p.id}')" ${last?'disabled':''} style="${last?'opacity:.1;cursor:default':''}">\u25BC</button>
          </div>
        </div>
      </div>`;
    }).join("");

    const sb = profName(getA("statusBarProfile")); const su = profName(getA("startupProfile")); const sk = profName(getA("shortcutProfile"));

    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"/><style>
${anime ? `@keyframes fi{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}` : ""}
:root{--c:var(--vscode-foreground);--c2:color-mix(in srgb,var(--vscode-foreground) 45%,transparent);--bg:var(--vscode-sideBar-background);--bord:color-mix(in srgb,var(--vscode-foreground) 8%,transparent);--hover:var(--vscode-list-hoverBackground);--btn:var(--vscode-button-background);--btnf:var(--vscode-button-foreground);--btn2:var(--vscode-button-secondaryBackground);--focus:var(--vscode-focusBorder);--err:var(--vscode-errorForeground);--succ:var(--vscode-testing-iconPassed);--warn:var(--vscode-editorMarkerNavigationWarning-background);--font:var(--vscode-font-family);--fs:var(--vscode-font-size)}
*{margin:0;padding:0;box-sizing:border-box}
body{padding:${pad}px;font-family:var(--font);font-size:var(--fs);color:var(--c);line-height:1.5}
.hdr{font-size:19px;font-weight:700;display:flex;align-items:center;gap:10px;margin-bottom:${pad}px;padding-bottom:10px;border-bottom:2px solid var(--bord);${anime?"animation:fi .35s ease":""}}
.hdr .sub{font-size:12px;font-weight:400;opacity:.35;margin-left:auto}
.hdr .codicon{font-size:22px;opacity:.8}
.ac{display:flex;flex-direction:column;gap:${gap-2}px;margin-bottom:${pad}px;${anime?"animation:fi .35s ease .05s both":""}}
.acb{display:flex;align-items:center;gap:8px;padding:8px ${pad-4}px;border:none;border-radius:8px;cursor:pointer;font-size:12px;background:var(--btn2);color:var(--c);width:100%;text-align:left;transition:background .12s}
.acb:hover{background:var(--hover)}
.acb .al{opacity:.35;flex-shrink:0;width:18px;font-size:10px}
.acb .av{font-weight:500;flex:1;font-size:${fSize-1}px}
.acb .av2{font-size:${fSize-2}px;opacity:.4}
.sl{font-size:12px;font-weight:600;text-transform:uppercase;opacity:.4;letter-spacing:.8px;margin:${gap+6}px 0 ${gap}px;display:flex;align-items:center;gap:8px}
.sl::after{content:"";flex:1;height:1px;background:var(--bord)}
.cr{margin:${gap}px 0;border-radius:10px;background:color-mix(in srgb,var(--c) 3%,transparent);border:1px solid var(--bord);overflow:hidden;transition:border-color .12s}
.cr:hover{border-color:color-mix(in srgb,var(--c) 18%,transparent)}
.cr.d{border-color:var(--focus);background:color-mix(in srgb,var(--focus) 6%,transparent)}
${anime?".cr{animation:fi .3s ease both}":""}
.ch{display:flex;align-items:center;gap:5px;padding:${density==="compact"?6:8}px ${density==="compact"?6:8}px}
.on{width:26px;height:22px;border-radius:4px;border:1px solid var(--bord);background:transparent;color:var(--c);text-align:center;font-size:10px;font-weight:600;flex-shrink:0}
.on:focus{border-color:var(--focus);outline:none}
.cb{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;transition:all .12s;position:relative}
.cb.play{background:color-mix(in srgb,var(--btn) 12%,transparent);color:var(--btn)}
.cb.play:hover{background:var(--btn);color:var(--btnf);transform:scale(1.06)}
.cb.na{opacity:.3}.cb.na:hover{opacity:.5;transform:scale(1.04)}
.ndot{position:absolute;top:2px;right:2px;width:7px;height:7px;border-radius:50%;background:var(--err);opacity:.6}
.ic{font-size:17px}.ic-s{font-size:10px;font-weight:700;opacity:.4}
.cn{flex:1;min-width:0;cursor:pointer;padding:2px 4px;border-radius:4px;transition:background .1s}
.cn:hover{background:var(--hover)}
.cn-t{font-size:${fSize}px;font-weight:500;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cn-s{font-size:${fSize-3}px;color:var(--c2);display:block;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.star{color:var(--warn);font-size:10px}.c-cli{color:var(--succ)}.c-desktop{color:var(--err)}.c-vscode{color:var(--warn)}
.ca{display:flex;gap:2px;flex-shrink:0}
.b{width:22px;height:22px;border:none;border-radius:4px;cursor:pointer;font-size:9px;background:transparent;color:var(--c);opacity:.2;display:flex;align-items:center;justify-content:center;padding:0;transition:all .1s}
.b:hover{opacity:1;background:var(--hover);transform:scale(1.1)}
.b-del:hover{color:var(--err);opacity:1}.b-p{color:var(--succ);opacity:.4}.b-p:hover{opacity:1;background:color-mix(in srgb,var(--succ) 8%,transparent)}
.b-arr:hover{opacity:.7}.b:disabled{pointer-events:none}
.emp{padding:32px 20px;text-align:center;font-size:13px;opacity:.3;line-height:1.6}
.qb{width:100%;padding:10px 14px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;text-align:center;transition:opacity .1s}
.qb:hover{opacity:.8}
.qb-p{background:var(--btn);color:var(--btnf);margin-bottom:4px}
.qb-s{background:var(--btn2);color:var(--c);margin-bottom:4px}
.qb-d{background:color-mix(in srgb,var(--err) 8%,transparent);color:var(--err)}
.qb-a{border:1.5px dashed var(--bord);background:transparent;color:var(--c2)}
.qb-group{display:flex;gap:4px;margin-top:6px}.qb-group .qb{flex:1;font-size:12px;padding:8px}
</style></head><body>
<div class="hdr"><span class="codicon codicon-terminal"></span>CodeHub<span class="sub">${tc > 0 ? `$(terminal) ${tc}` : `$(circle-slash) 0`}</span></div>

<div class="ac">
  <button class="acb" onclick="p('p-status')"><span class="al">\u25B6</span><span class="av">${t("setStatusBar")}</span><span class="av2">${esc(sb)}</span></button>
  <button class="acb" onclick="p('p-startup')"><span class="al">\u25B6</span><span class="av">${t("setStartup")}</span><span class="av2">${esc(su)}</span></button>
  <button class="acb" onclick="p('p-shortcut')"><span class="al">\u25B6</span><span class="av">${t("setShortcut")}</span><span class="av2">${esc(sk)}</span></button>
</div>

<div class="sl">${t("profileList")}</div>
${list.length > 0 ? rows : `<div class="emp">${t("noProfiles")}</div>`}

<button class="qb qb-a" onclick="p('add')">+ ${t("addProfile")}</button>
<button class="qb qb-s" onclick="p('addLib')">$(database) ${t("addFromLib")}</button>
<button class="qb qb-s" onclick="p('desktop')" style="margin-top:6px">$(browser) OpenCode Desktop</button>
<button class="qb qb-s" onclick="p('settings')">$(gear) ${t("settings")}</button>
<button class="qb qb-d" onclick="p('closeAll')">$(trash) ${t("closeAll")}</button>

<div class="qb-group">
  <button class="qb qb-s" onclick="p('export')">$(save) ${t("exportTitle")}</button>
  <button class="qb qb-s" onclick="p('import')">$(folder) ${t("importTitle")}</button>
</div>

<script nonce="${n()}">const v=acquireVsCodeApi();function p(t,i,v2){v.postMessage({type:t,id:i,value:v2})}<\/script>
</body></html>`;
  }
}

// ── Activate ──

export function activate(ctx: vscode.ExtensionContext) {
  const side = new SidePanel(ctx);
  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider(SidePanel.vt, side, { webviewOptions: { retainContextWhenHidden: true } }));

  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.runDefault", runDef));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openDesktop", () => openDesktop(ctx)));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", K)));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setStatusBarProfile", () => pickProf(t("setStatusBar"), "statusBarProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setStartupProfile", () => pickProf(t("setStartup"), "startupProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setShortcutProfile", () => pickProf(t("setShortcut"), "shortcutProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.exportProfiles", exportProfiles));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.importProfiles", importProfiles));

  const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  sb.show(); ctx.subscriptions.push(sb);
  const upd = () => { const n = vscode.window.terminals.filter((t) => t.name.includes("CodeHub")).length; sb.text = n > 0 ? `$(terminal) CodeHub (${n})` : "$(terminal) CodeHub"; sb.command = "codehub.runDefault"; };
  upd();
  ctx.subscriptions.push(vscode.window.onDidOpenTerminal(upd));
  ctx.subscriptions.push(vscode.window.onDidCloseTerminal(() => { upd(); side.render(); }));
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(K)) side.render(); }));

  const delay = cfg().get<number>("startupDelay", 1200);
  if (cfg().get<string>("startupMode", "defaultProfile") !== "none") {
    setTimeout(() => { const id = getA("startupProfile"); const p = findP(resolveId(id)); if (p) runProf(p); else runDef(); }, delay);
  }
}

export function deactivate() { srvPorts.clear(); }
