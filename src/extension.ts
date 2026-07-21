import * as vscode from "vscode";
import { execSync } from "child_process";

// ── Types ──

interface Profile {
  id: string;
  name: string;
  icon?: string;
  shell: "powershell" | "cmd" | "wsl" | "bash" | "zsh" | "custom";
  shellPath?: string;
  commands: string[];
  openIn: "cli" | "desktop" | "vscode";
}

// ── I18n ──

type L = "tr" | "en";
const _ = (tr: string, en: string) => ({ tr, en });
const T: Record<string, Record<L, string>> = {
  appName: _("CodeHub", "CodeHub"),
  opencodeCLI: _("OpenCode CLI", "OpenCode CLI"),
  opencodeDesktop: _("OpenCode Desktop", "OpenCode Desktop"),
  opencodeVSCode: _("OpenCode VSCode", "OpenCode VSCode"),
  closeAll: _("Tümünü Kapat", "Close All"),
  addProfile: _("Profil Ekle", "Add Profile"),
  duplicate: _("Kopyala", "Duplicate"),
  deleteProfile: _("Sil", "Delete"),
  moveUp: _("Yukarı", "Up"),
  moveDown: _("Aşağı", "Down"),
  settings: _("Ayarlar", "Settings"),
  profileName: _("Profil adı", "Profile name"),
  iconLabel: _("İkon seç veya URL yapıştır", "Pick icon or paste URL"),
  noIcon: _("İkonsuz (Enter ile geç)", "No Icon (press Enter)"),
  pickFile: _("Dosya Seç", "Pick File"),
  pasteUrl: _("URL Yapıştır", "Paste URL"),
  shellType: _("Shell türü", "Shell type"),
  commands: _("Komutlar (alt satır = yeni komut, boş bırak = direkt shell)", "Commands (new line = new command, empty = direct shell)"),
  openIn: _("Açılacağı yer", "Open location"),
  cliOpt: _("OpenCode CLI (tam ekran terminal)", "OpenCode CLI (fullscreen)"),
  desktopOpt: _("OpenCode Desktop (web panel)", "OpenCode Desktop (web panel)"),
  vscodeOpt: _("OpenCode VSCode (panel)", "OpenCode VSCode (panel)"),
  custom: _("Özelleştirilmiş", "Custom"),
  confirmDel: _("Silmek istediğinize emin misiniz?", "Are you sure?"),
  created: _("Profil oluşturuldu", "Profile created"),
  deleted: _("Profil silindi", "Profile deleted"),
  updated: _("Profil güncellendi", "Profile updated"),
  duplicated: _("Profil kopyalandı", "Profile duplicated"),
  defaultSet: _("Varsayılan yapıldı", "Set as default"),
  noProfiles: _("Henüz profil yok. + butonuna tıklayın.", "No profiles yet. Tap +."),
  statusTip: _("CodeHub - Varsayılanı çalıştır", "CodeHub - Run default"),
  serverWait: _("OpenCode sunucu başlatılıyor...", "Starting OpenCode server..."),
  serverErr: _("Sunucuya ulaşılamadı", "Server unreachable"),
  loading: _("Yükleniyor...", "Loading..."),
  terminalCount: _("{n} terminal", "{n} terminals"),
  confirmAllClose: _("Tüm CodeHub terminallerini kapat?", "Close all CodeHub terminals?"),
  opencodePath: _("OpenCode CLI yolu", "OpenCode CLI path"),
  statusBarAction: _("Durum çubuğuna tıkla", "Status bar click action"),
  defaultProfileAction: _("Varsayılan Profil", "Default Profile"),
  opencodeCLIAction: _("OpenCode CLI", "OpenCode CLI"),
  opencodeDesktopAction: _("OpenCode Desktop", "OpenCode Desktop"),
  opencodeVSCodeAction: _("OpenCode VSCode", "OpenCode VSCode"),
  none: _("Hiçbiri", "None"),
  startupDelay: _("Başlatma gecikmesi (ms)", "Startup delay (ms)"),
  yes: _("Evet", "Yes"),
  no: _("Hayır", "No"),
  profileList: _("Profiller ({n})", "Profiles ({n})"),
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
function getProfiles(): Profile[] { return cfg().get<Profile[]>("terminalProfiles", []); }
function setProfiles(p: Profile[]) { cfg().update("terminalProfiles", p, vscode.ConfigurationTarget.Global); }
function getDef(): string { return cfg().get<string>("defaultProfile", ""); }
function setDef(id: string) { cfg().update("defaultProfile", id, vscode.ConfigurationTarget.Global); }
function genId(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// ── Shell mapping ──

function resolveShell(p: Profile): string | undefined {
  const m: Record<string, string | undefined> = {
    powershell: "powershell.exe", cmd: "cmd.exe", wsl: "wsl.exe",
    bash: "bash", zsh: "zsh",
  };
  return p.shell === "custom" ? p.shellPath || undefined : m[p.shell];
}

// ── Terminal Runner ──

async function runTerminal(p: Profile) {
  const loc = p.openIn === "cli"
    ? { viewColumn: vscode.ViewColumn.One, preserveFocus: false } as const
    : p.openIn === "vscode" ? undefined
    : undefined; // desktop handled separately

  const term = vscode.window.createTerminal({
    name: `${p.name} - CodeHub`,
    iconPath: p.icon ? vscode.Uri.file(p.icon) : new vscode.ThemeIcon("terminal"),
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

// ── Opencode Server ──

let desktopPanel: vscode.WebviewPanel | undefined;
const serverPorts = new Set<number>();
const TERM_NAME = "opencode-server";

function getOpencodeCmd(): string {
  return cfg().get<string>("opencodePath", "opencode");
}

function isOpencodeInstalled(): boolean {
  try {
    const r = execSync(
      process.platform === "win32"
        ? `where ${getOpencodeCmd().split(" ")[0]} 2>nul`
        : `command -v ${getOpencodeCmd().split(" ")[0]} 2>/dev/null`,
      { encoding: "utf-8", timeout: 3000, windowsHide: true, stdio: "pipe" },
    );
    return r.trim().length > 0;
  } catch { return false; }
}

function startServer(port: number) {
  const term = vscode.window.createTerminal({
    name: TERM_NAME, iconPath: new vscode.ThemeIcon("server"),
    location: undefined, hideFromUser: true,
    env: { _CODEHUB_PORT: port.toString() } as Record<string, string>,
  });
  term.sendText(`${getOpencodeCmd()} --port ${port}`);
  serverPorts.add(port);
  const d = vscode.window.onDidCloseTerminal((t) => {
    if (t === term) { serverPorts.delete(port); d.dispose(); }
  });
}

async function waitForServer(port: number, tries = 30): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://localhost:${port}`);
      if (r.ok || r.status === 404) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ── Desktop Action ──

async function openDesktop(ctx: vscode.ExtensionContext) {
  if (desktopPanel) { desktopPanel.reveal(vscode.ViewColumn.Active, false); return; }

  // loading HTML
  const loadHtml = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"/><style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;display:flex;align-items:center;justify-content:center;background:var(--vscode-panel-background);color:var(--vscode-foreground);font-family:var(--vscode-font-family)}.sp{width:28px;height:28px;border:3px solid rgba(128,128,128,.3);border-top-color:var(--vscode-foreground);border-radius:50%;animation:sp .8s linear infinite}.t{margin-top:12px;font-size:13px;opacity:.6}@keyframes sp{to{transform:rotate(360deg)}}</style></head><body><div style="text-align:center"><div class="sp"></div><div class="t">${t("serverWait")}</div></div></body></html>`;

  if (!isOpencodeInstalled()) {
    const choice = await vscode.window.showErrorMessage(
      `${getOpencodeCmd()} CLI ${t("serverErr")}`,
      t("settings"),
    );
    if (choice === t("settings")) vscode.commands.executeCommand("workbench.action.openSettings", `${K}.opencodePath`);
    return;
  }

  desktopPanel = vscode.window.createWebviewPanel("codehub.desktop", "OpenCode Desktop", vscode.ViewColumn.Beside, {
    enableScripts: true, retainContextWhenHidden: true,
  });
  desktopPanel.webview.html = loadHtml;
  desktopPanel.onDidDispose(() => { desktopPanel = undefined; });

  const port = Math.floor(Math.random() * 40000) + 16384;
  startServer(port);
  const ok = await waitForServer(port);
  if (!desktopPanel) return;

  if (!ok) {
    desktopPanel.webview.html = `<html><body style="display:flex;align-items:center;justify-content:center;height:100%;font-family:var(--vscode-font-family);color:var(--vscode-errorForeground)">${t("serverErr")}</body></html>`;
    return;
  }

  const nn = (() => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; let r = ""; for (let i = 0; i < 32; i++) r += c[Math.floor(Math.random() * c.length)]; return r; })();
  desktopPanel.webview.html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"/><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nn}'; frame-src http://localhost:${port} https:;"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;overflow:hidden;background:var(--vscode-panel-background)}iframe{width:100%;height:100%;border:none}</style></head><body><iframe src="http://localhost:${port}" allow="clipboard-read;clipboard-write"></iframe><script nonce="${nn}">acquireVsCodeApi()<\/script></body></html>`;
}

// ── Quick Actions ──

function runDefault() {
  const p = getProfiles().find((x) => x.id === getDef());
  if (p) runTerminal(p);
}

async function actionFor(mode: string, ctx: vscode.ExtensionContext) {
  if (mode === "defaultProfile") { runDefault(); return; }
  if (mode === "opencodeCLI") { const p = getProfiles().find((x) => x.id === getDef()); if (p) runTerminal({ ...p, openIn: "cli" }); return; }
  if (mode === "opencodeDesktop") { openDesktop(ctx); return; }
  if (mode === "opencodeVSCode") { const p = getProfiles().find((x) => x.id === getDef()); if (p) runTerminal({ ...p, openIn: "vscode" }); return; }
}

// ── Icon Picker ──

async function pickIcon(existing?: string): Promise<string | undefined> {
  const ch = await vscode.window.showQuickPick([
    { label: t("noIcon"), id: "none" },
    { label: t("pickFile"), id: "file" },
    { label: t("pasteUrl"), id: "url" },
  ], { placeHolder: t("iconLabel") });
  if (!ch) return undefined;
  if (ch.id === "none") return existing !== undefined ? existing : "";
  if (ch.id === "file") {
    const f = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectMany: false, filters: { Images: ["png", "jpg", "jpeg", "svg", "ico", "webp"] } });
    if (!f || f.length === 0) return undefined;
    return f[0].fsPath;
  }
  const u = await vscode.window.showInputBox({ prompt: t("iconLabel"), value: existing || "", placeHolder: "https://... / data:..." });
  return u === undefined ? undefined : u || "";
}

// ── Profile Dialog ──

async function profileDialog(existing?: Profile): Promise<Profile | undefined> {
  const name = await vscode.window.showInputBox({ prompt: t("profileName"), value: existing?.name || "", placeHolder: "Claude Code, Dev, ..." });
  if (name === undefined) return;

  const icon = await pickIcon(existing?.icon);
  if (icon === undefined) return;

  const shellPick = await vscode.window.showQuickPick([
    { label: "PowerShell", id: "powershell" }, { label: "CMD", id: "cmd" },
    { label: "WSL", id: "wsl" }, { label: "Bash", id: "bash" },
    { label: "Zsh", id: "zsh" }, { label: t("custom"), id: "custom" },
  ], { placeHolder: t("shellType") });
  if (!shellPick) return;
  const shell = shellPick.id as Profile["shell"];

  let shellPath: string | undefined;
  if (shell === "custom") {
    const p = await vscode.window.showInputBox({ prompt: "Örnek: C:\\tools\\my-shell.exe", value: existing?.shellPath || "" });
    if (p === undefined) return;
    shellPath = p || undefined;
  }

  const cmdR = await vscode.window.showInputBox({
    prompt: t("commands"), value: (existing?.commands || [""]).join("\n"), placeHolder: "echo hello\nnpm start",
  });
  if (cmdR === undefined) return;
  const commands = cmdR.split("\n").map((l) => l.trim()).filter(Boolean);

  const openPick = await vscode.window.showQuickPick([
    { label: t("cliOpt"), id: "cli" }, { label: t("desktopOpt"), id: "desktop" },
    { label: t("vscodeOpt"), id: "vscode" },
  ], { placeHolder: t("openIn") });
  if (!openPick) return;

  return {
    id: existing?.id || genId(), name, icon: icon || undefined,
    shell, shellPath, commands, openIn: openPick.id as "cli" | "desktop" | "vscode",
  };
}

// ── Side Panel ──

class SidePanel implements vscode.WebviewViewProvider {
  static readonly vt = "codehub.sidePanel";
  private v?: vscode.WebviewView;
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  resolveWebviewView(vw: vscode.WebviewView) {
    this.v = vw;
    vw.webview.options = { enableScripts: true };
    vw.webview.html = this.html();
    vw.onDidDispose(() => { this.v = undefined; });
    vw.webview.onDidReceiveMessage(async (m) => {
      if (m.type === "cli") { const p = getProfiles().find((x) => x.id === getDef()); if (p) await runTerminal({ ...p, openIn: "cli" }); this.refresh(); return; }
      if (m.type === "desktop") { openDesktop(this.ctx); return; }
      if (m.type === "vscode") { const p = getProfiles().find((x) => x.id === getDef()); if (p) await runTerminal({ ...p, openIn: "vscode" }); this.refresh(); return; }
      if (m.type === "closeAll") { this.closeAll(); this.refresh(); return; }
      if (m.type === "add") {
        const p = await profileDialog();
        if (!p) { this.refresh(); return; }
        const list = getProfiles(); list.push(p); setProfiles(list);
        this.refresh(); vscode.window.showInformationMessage(`${t("created")}: ${p.name}`); return;
      }
      if (m.type === "edit") {
        const list = getProfiles(); const i = list.findIndex((x) => x.id === m.id);
        if (i < 0) return;
        const u = await profileDialog(list[i]);
        if (!u) { this.refresh(); return; }
        list[i] = u; setProfiles(list);
        this.refresh(); vscode.window.showInformationMessage(t("updated")); return;
      }
      if (m.type === "delete") {
        const ok = (await vscode.window.showQuickPick([t("yes"), t("no")], { placeHolder: t("confirmDel") })) === t("yes");
        if (!ok) { this.refresh(); return; }
        const list = getProfiles().filter((x) => x.id !== m.id);
        setProfiles(list);
        if (getDef() === m.id) setDef(list[0]?.id || "");
        this.refresh(); vscode.window.showInformationMessage(t("deleted")); return;
      }
      if (m.type === "duplicate") {
        const p = getProfiles().find((x) => x.id === m.id);
        if (!p) return;
        const copy = { ...p, id: genId(), name: `${p.name} (kopya)` };
        const list = getProfiles(); list.push(copy); setProfiles(list);
        this.refresh(); vscode.window.showInformationMessage(t("duplicated")); return;
      }
      if (m.type === "up" || m.type === "down") {
        const list = getProfiles(); const i = list.findIndex((x) => x.id === m.id);
        if (i < 0) return;
        const j = m.type === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]]; setProfiles(list); this.refresh(); return;
      }
      if (m.type === "run") {
        const p = getProfiles().find((x) => x.id === m.id);
        if (!p) return;
        if (p.openIn === "desktop") { openDesktop(this.ctx); return; }
        await runTerminal(p); this.refresh(); return;
      }
      if (m.type === "setDef") { setDef(m.id); this.refresh(); return; }
      if (m.type === "set") { vscode.commands.executeCommand("workbench.action.openSettings", K); return; }
    });
  }

  private async closeAll() {
    if (cfg().get<boolean>("confirmCloseAll", true)) {
      const r = await vscode.window.showQuickPick([t("yes"), t("no")], { placeHolder: t("confirmAllClose") });
      if (r !== t("yes")) return;
    }
    vscode.window.terminals.filter((t) => t.name.includes("CodeHub") || t.name === TERM_NAME).forEach((t) => t.dispose());
    serverPorts.clear();
  }

  refresh() { if (this.v) this.v.webview.html = this.html(); }

  private html(): string {
    const list = getProfiles(); const def = getDef();
    const lang = cfg().get<string>("language", "tr") === "en" ? "en" : "tr";
    const tc = vscode.window.terminals.filter((t) => t.name.includes("CodeHub")).length;
    const nonce = (() => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; let r = ""; for (let i = 0; i < 32; i++) r += c[Math.floor(Math.random() * c.length)]; return r; })();
    const esc = (s: string) => s.replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[m] || m);

    const rows = list.map((p) => {
      const isDef = p.id === def;
      const icon = p.icon ? `<img src="${esc(p.icon)}" style="width:16px;height:16px;border-radius:2px;object-fit:contain;flex-shrink:0" onerror="this.style.display='none'">` : `<span class="si">${p.shell[0].toUpperCase()}</span>`;
      const mode = p.openIn === "cli" ? "\u25A1" : p.openIn === "desktop" ? "\u25A0" : "\u25B3";
      return `<div class="pr ${isDef?"d":""}">
        <div class="pi" onclick="p('run','${p.id}')">
          ${icon}<span class="pn">${esc(p.name)}</span>
          <span class="mo">${mode}</span>
          ${isDef?'<span class="s">\u2605</span>':''}
        </div>
        <div class="pa">
          <button class="b" onclick="p('setDef','${p.id}')" title="${t("defaultSet")}">\u2605</button>
          <button class="b" onclick="p('duplicate','${p.id}')" title="${t("duplicate")}">\u{1F4CB}</button>
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
body{padding:8px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground)}
.l{font-size:10px;text-transform:uppercase;opacity:.5;letter-spacing:.5px;margin:6px 0 3px}
.btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:7px;border:none;border-radius:4px;cursor:pointer;font-size:12px;width:100%;background:var(--vscode-button-background);color:var(--vscode-button-foreground);margin-bottom:3px}
.btn:hover{opacity:.9}
.bs{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.pr{display:flex;align-items:center;gap:2px;padding:3px 4px;border-radius:3px;margin:1px 0;border:1px solid transparent}
.pr.d{border-color:var(--vscode-focusBorder)}
.pi{display:flex;align-items:center;gap:5px;cursor:pointer;flex:1;min-width:0}
.si{width:16px;height:16px;border-radius:2px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;flex-shrink:0}
.pn{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mo{font-size:8px;opacity:.4}
.s{color:var(--vscode-editorMarkerNavigationWarning-background);font-size:10px}
.pa{display:flex;gap:1px;flex-shrink:0}
.b{width:16px;height:16px;border:none;border-radius:2px;cursor:pointer;font-size:8px;background:transparent;color:var(--vscode-foreground);opacity:.4;display:flex;align-items:center;justify-content:center;padding:0}
.b:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground)}
.b.d:hover{color:var(--vscode-errorForeground)}
.st{font-size:10px;opacity:.4;padding:2px 0}
</style></head><body>
<div class="l" style="margin-top:0">${t("appName")} <span class="st">${tc > 0 ? tt("terminalCount",{n:tc}) : ''}</span></div>
<button class="btn" onclick="p('cli')">${t("opencodeCLI")}</button>
<button class="btn bs" onclick="p('desktop')">${t("opencodeDesktop")}</button>
<button class="btn bs" onclick="p('vscode')">${t("opencodeVSCode")}</button>
<button class="btn bs" onclick="p('closeAll')" style="margin-bottom:6px">${t("closeAll")}</button>

<div class="l">${tt("profileList",{n:list.length})}</div>
${rows || `<div style="padding:12px;text-align:center;font-size:11px;opacity:.4">${t("noProfiles")}</div>`}

<button class="btn bs" style="margin-top:3px;border:1px dashed var(--vscode-input-border)" onclick="p('add')">+ ${t("addProfile")}</button>
<button class="btn bs" style="margin-top:6px" onclick="p('set')">${t("settings")}</button>

<script nonce="${nonce}">const v=acquireVsCodeApi();function p(t,i){v.postMessage({type:t,id:i})}<\/script>
</body></html>`;
  }
}

// ── Activate ──

export function activate(ctx: vscode.ExtensionContext) {
  const side = new SidePanel(ctx);
  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider(SidePanel.vt, side, { webviewOptions: { retainContextWhenHidden: true } }));

  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.runDefault", runDefault));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openCLI", () => { const p = getProfiles().find((x) => x.id === getDef()); if (p) runTerminal({ ...p, openIn: "cli" }); }));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openDesktop", () => openDesktop(ctx)));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openVSCode", () => { const p = getProfiles().find((x) => x.id === getDef()); if (p) runTerminal({ ...p, openIn: "vscode" }); }));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.closeAllTerminals", () => vscode.window.terminals.filter((t) => t.name.includes("CodeHub") || t.name === TERM_NAME).forEach((t) => t.dispose())));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", K)));

  const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  sb.show(); ctx.subscriptions.push(sb);
  const upd = () => {
    const n = vscode.window.terminals.filter((t) => t.name.includes("CodeHub")).length;
    sb.text = n > 0 ? `$(terminal) CodeHub (${n})` : "$(terminal) CodeHub";
    sb.tooltip = t("statusTip");
    const act = cfg().get<string>("statusBarAction", "defaultProfile");
    sb.command = act === "defaultProfile" ? "codehub.runDefault"
      : act === "opencodeCLI" ? "codehub.openCLI"
      : act === "opencodeDesktop" ? "codehub.openDesktop"
      : act === "opencodeVSCode" ? "codehub.openVSCode"
      : undefined;
  };
  upd();
  ctx.subscriptions.push(vscode.window.onDidOpenTerminal(upd));
  ctx.subscriptions.push(vscode.window.onDidCloseTerminal(() => { upd(); side.refresh(); }));
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(K)) { upd(); side.refresh(); } }));

  const delay = cfg().get<number>("startupDelay", 1200);
  if (cfg().get<string>("startupMode", "defaultProfile") === "defaultProfile") {
    setTimeout(() => vscode.commands.executeCommand("codehub.runDefault"), delay);
  }
}

export function deactivate() { serverPorts.clear(); }
