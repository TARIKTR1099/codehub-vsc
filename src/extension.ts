import * as vscode from "vscode";

// ── Types ──

interface ProfileCommand {
  id: string;
  name: string;
  icon?: string;
  shell: "powershell" | "cmd" | "wsl" | "bash" | "zsh" | "custom";
  shellPath?: string;
  commands: string[];
  openIn: "fullscreen" | "panel";
}

// ── I18n ──

type Lang = "tr" | "en";
const S: Record<string, Record<Lang, string>> = {
  appName: { tr: "CodeHub", en: "CodeHub" },
  fullTerminal: { tr: "Tam Terminal", en: "Full Terminal" },
  desktop: { tr: "Desktop", en: "Desktop" },
  vscTerminal: { tr: "VSCode Terminal", en: "VSCode Terminal" },
  addProfile: { tr: "Profil Ekle", en: "Add Profile" },
  editProfile: { tr: "Düzenle", en: "Edit" },
  deleteProfile: { tr: "Sil", en: "Delete" },
  moveUp: { tr: "Yukarı", en: "Move Up" },
  moveDown: { tr: "Aşağı", en: "Move Down" },
  settings: { tr: "Ayarlar", en: "Settings" },
  profileName: { tr: "Profil adı", en: "Profile name" },
  iconOptional: { tr: "İkon (opsiyonel)", en: "Icon (optional)" },
  iconLabel: { tr: "İkon seç veya URL yapıştır", en: "Pick icon or paste URL" },
  pickFile: { tr: "Dosya Seç", en: "Pick File" },
  pasteUrl: { tr: "URL Yapıştır", en: "Paste URL" },
  noIcon: { tr: "İkonsuz", en: "No Icon" },
  shellType: { tr: "Shell türü", en: "Shell type" },
  commands: { tr: "Komutlar (her satır bir komut)", en: "Commands (one per line)" },
  openIn: { tr: "Açılacağı yer", en: "Open location" },
  fullOpt: { tr: "Tam Terminal (tam ekran)", en: "Fullscreen" },
  panelOpt: { tr: "VSCode Terminal (panel)", en: "Panel" },
  confirmDel: { tr: "Silmek istediğinize emin misiniz?", en: "Are you sure?" },
  created: { tr: "Profil oluşturuldu", en: "Profile created" },
  deleted: { tr: "Profil silindi", en: "Profile deleted" },
  updated: { tr: "Profil güncellendi", en: "Profile updated" },
  defaultSet: { tr: "Varsayılan olarak ayarlandı", en: "Set as default" },
  noProfiles: { tr: "Henüz profil yok. + butonuna tıklayın.", en: "No profiles yet. Tap + to add." },
  statusTerminals: { tr: "{n} terminal", en: "{n} terminals" },
  statusTip: { tr: "CodeHub - Varsayılan profili çalıştır", en: "CodeHub - Run default profile" },
};

function t(k: string): string {
  const l: Lang = vscode.workspace.getConfiguration("codehub").get<string>("language", "tr") === "en" ? "en" : "tr";
  return S[k]?.[l] ?? k;
}

function tt(k: string, a: Record<string, string | number>): string {
  let s = t(k);
  for (const [k2, v] of Object.entries(a)) s = s.replace(`{${k2}}`, String(v));
  return s;
}

// ── Defaults ──

function ensureDefaults() {
  if (getProfiles().length > 0) return;
  setProfiles([
    { id: "ps1", name: "PowerShell", shell: "powershell", commands: [], openIn: "panel" },
    { id: "cmd1", name: "CMD", shell: "cmd", commands: [], openIn: "panel" },
  ]);
  setDefault("ps1");
}

// ── Storage ──

const K = "codehub";

function getProfiles(): ProfileCommand[] {
  return vscode.workspace.getConfiguration(K).get<ProfileCommand[]>("terminalProfiles", []);
}

function setProfiles(p: ProfileCommand[]) {
  vscode.workspace.getConfiguration(K).update("terminalProfiles", p, vscode.ConfigurationTarget.Global);
}

function getDefault(): string {
  return vscode.workspace.getConfiguration(K).get<string>("defaultProfile", "");
}

function setDefault(id: string) {
  vscode.workspace.getConfiguration(K).update("defaultProfile", id, vscode.ConfigurationTarget.Global);
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Runner ──

function shellPath(s: ProfileCommand): string | undefined {
  const m: Record<string, string | undefined> = {
    powershell: "powershell.exe", cmd: "cmd.exe", wsl: "wsl.exe",
    bash: "bash", zsh: "zsh", custom: s.shellPath || undefined,
  };
  return m[s.shell];
}

async function run(p: ProfileCommand) {
  const loc = p.openIn === "fullscreen"
    ? { viewColumn: vscode.ViewColumn.One, preserveFocus: false } as const
    : undefined;
  const t = vscode.window.createTerminal({
    name: `${p.name} - CodeHub`,
    iconPath: p.icon ? vscode.Uri.file(p.icon) : new vscode.ThemeIcon("terminal"),
    location: loc,
    shellPath: shellPath(p),
  });
  t.show();
  if (loc) await vscode.commands.executeCommand("workbench.action.closeEditorsInOtherGroups");
  for (let i = 0; i < p.commands.length; i++) {
    const c = p.commands[i].trim();
    if (!c) continue;
    setTimeout(() => t.sendText(c, true), i * 300);
  }
}

// ── Quick Actions ──

function openFullTerminal() {
  const p = getProfiles().find((x) => x.id === getDefault());
  if (p) run({ ...p, openIn: "fullscreen" });
}

function openDesktop() {
  vscode.window.showInformationMessage("Desktop panel yakında...");
}

function openVscTerminal() {
  const p = getProfiles().find((x) => x.id === getDefault());
  if (p) run({ ...p, openIn: "panel" });
}

// ── Icon picker ──

async function pickIcon(): Promise<string | undefined> {
  const choice = await vscode.window.showQuickPick([
    { label: t("pickFile"), id: "file" },
    { label: t("pasteUrl"), id: "url" },
    { label: t("noIcon"), id: "none" },
  ], { placeHolder: t("iconLabel") });
  if (!choice) return undefined;
  if (choice.id === "none") return "";
  if (choice.id === "url") {
    const url = await vscode.window.showInputBox({ prompt: t("iconLabel"), placeHolder: "https://... / data:..." });
    if (url === undefined) return undefined;
    return url || "";
  }
  const files = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectMany: false, filters: { Images: ["png", "jpg", "jpeg", "svg", "ico", "webp"] } });
  if (!files || files.length === 0) return undefined;
  return files[0].fsPath;
}

// ── Profile dialog ──

async function profileDialog(existing?: ProfileCommand): Promise<ProfileCommand | undefined> {
  const name = await vscode.window.showInputBox({ prompt: t("profileName"), value: existing?.name || "", placeHolder: "Claude Code" });
  if (name === undefined) return;

  let icon: string | undefined;
  if (existing?.icon !== undefined) icon = existing.icon;
  else {
    const r = await pickIcon();
    if (r === undefined) return;
    icon = r;
  }

  const shellPick = await vscode.window.showQuickPick([
    { label: "PowerShell", id: "powershell" }, { label: "CMD", id: "cmd" },
    { label: "WSL", id: "wsl" }, { label: "Bash", id: "bash" },
    { label: "Zsh", id: "zsh" }, { label: "Custom", id: "custom" },
  ], { placeHolder: t("shellType") });
  if (!shellPick) return;
  const shell = shellPick.id as ProfileCommand["shell"];

  let shellPath: string | undefined;
  if (shell === "custom") {
    const p = await vscode.window.showInputBox({ prompt: "Custom shell path", value: existing?.shellPath || "" });
    if (p === undefined) return;
    shellPath = p || undefined;
  }

  const cmds = existing?.commands.length ? existing.commands : [""];
  const cmdR = await vscode.window.showInputBox({ prompt: t("commands"), value: cmds.join("\n"), placeHolder: "echo hello\nnpm start" });
  if (cmdR === undefined) return;
  const commands = cmdR.split("\n").map((l) => l.trim()).filter(Boolean);

  const openPick = await vscode.window.showQuickPick([
    { label: t("fullOpt"), id: "fullscreen" },
    { label: t("panelOpt"), id: "panel" },
  ], { placeHolder: t("openIn") });
  if (!openPick) return;

  return { id: existing?.id || genId(), name, icon: icon || undefined, shell, shellPath, commands, openIn: openPick.id as "fullscreen" | "panel" };
}

// ── Side Panel Webview ──

class SidePanel implements vscode.WebviewViewProvider {
  static readonly vt = "codehub.sidePanel";
  private v?: vscode.WebviewView;
  constructor(private readonly uri: vscode.Uri) {}

  resolveWebviewView(vw: vscode.WebviewView) {
    this.v = vw;
    vw.webview.options = { enableScripts: true };
    vw.webview.html = this.html(vw.webview);
    vw.onDidDispose(() => { this.v = undefined; });
    vw.webview.onDidReceiveMessage(async (m) => {
      if (m.type === "fullTerminal") { openFullTerminal(); this.refresh(); return; }
      if (m.type === "desktop") { openDesktop(); return; }
      if (m.type === "vscTerminal") { openVscTerminal(); this.refresh(); return; }
      if (m.type === "add") {
        const p = await profileDialog();
        if (!p) { this.refresh(); return; }
        const list = getProfiles();
        list.push(p);
        setProfiles(list);
        this.refresh();
        vscode.window.showInformationMessage(`${t("created")}: ${p.name}`);
        return;
      }
      if (m.type === "edit") {
        const p = getProfiles().find((x) => x.id === m.id);
        if (!p) return;
        const u = await profileDialog(p);
        if (!u) { this.refresh(); return; }
        const list = getProfiles();
        const i = list.findIndex((x) => x.id === p.id);
        if (i < 0) return;
        list[i] = u;
        setProfiles(list);
        this.refresh();
        vscode.window.showInformationMessage(t("updated"));
        return;
      }
      if (m.type === "delete") {
        const ok = (await vscode.window.showQuickPick([t("deleteProfile"), t("cancel")], { placeHolder: t("confirmDel") })) === t("deleteProfile");
        if (!ok) { this.refresh(); return; }
        const list = getProfiles().filter((x) => x.id !== m.id);
        setProfiles(list);
        if (getDefault() === m.id) setDefault(list[0]?.id || "");
        this.refresh();
        vscode.window.showInformationMessage(t("deleted"));
        return;
      }
      if (m.type === "moveUp" || m.type === "moveDown") {
        const list = getProfiles();
        const i = list.findIndex((x) => x.id === m.id);
        if (i < 0) return;
        const j = m.type === "moveUp" ? i - 1 : i + 1;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        setProfiles(list);
        this.refresh();
        return;
      }
      if (m.type === "run") {
        const p = getProfiles().find((x) => x.id === m.id);
        if (p) { await run(p); this.refresh(); }
        return;
      }
      if (m.type === "setDefault") {
        setDefault(m.id);
        this.refresh();
        vscode.window.showInformationMessage(`${t("defaultSet")}: ${getProfiles().find((x) => x.id === m.id)?.name}`);
        return;
      }
      if (m.type === "openSettings") {
        vscode.commands.executeCommand("workbench.action.openSettings", "codehub");
        return;
      }
    });
  }

  refresh() { if (this.v) this.v.webview.html = this.html(this.v.webview); }

  private html(wv: vscode.Webview): string {
    const list = getProfiles();
    const def = getDefault();
    const n = () => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; let r = ""; for (let i = 0; i < 32; i++) r += c[Math.floor(Math.random() * c.length)]; return r; };
    const lang = vscode.workspace.getConfiguration(K).get<string>("language", "tr") === "en" ? "en" : "tr";
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

    const profileRows = list.map((p, idx) => {
      const isDef = p.id === def;
      const iconHtml = p.icon ? `<img src="${esc(p.icon)}" style="width:18px;height:18px;border-radius:3px;object-fit:contain;flex-shrink:0">` : "";
      return `<div class="prof ${isDef ? "def" : ""}" data-id="${p.id}">
        <div class="pi" onclick="post('run','${p.id}')" title="${t("runProfile")}">
          ${iconHtml || `<span class="sh-ic">${p.shell[0].toUpperCase()}</span>`}
          <span class="pn">${esc(p.name)}${isDef ? ' <span class="star">\u2605</span>' : ""}</span>
        </div>
        <div class="pa">
          <button class="pb" onclick="post('setDefault','${p.id}')" title="${t("defaultSet")}">\u2605</button>
          <button class="pb" onclick="post('moveUp','${p.id}')" title="${t("moveUp")}">\u25B2</button>
          <button class="pb" onclick="post('moveDown','${p.id}')" title="${t("moveDown")}">\u25BC</button>
          <button class="pb" onclick="post('edit','${p.id}')" title="${t("editProfile")}">\u270E</button>
          <button class="pb d" onclick="post('delete','${p.id}')" title="${t("deleteProfile")}">\u2716</button>
        </div>
      </div>`;
    }).join("");

    return `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="UTF-8"/><style>
*{margin:0;padding:0;box-sizing:border-box}
body{padding:10px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground)}
.btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:7px;border:none;border-radius:4px;cursor:pointer;font-size:12px;width:100%;background:var(--vscode-button-background);color:var(--vscode-button-foreground);margin-bottom:4px}
.btn:hover{opacity:.9}
.btn-s{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
.lbl{font-size:10px;text-transform:uppercase;opacity:.5;letter-spacing:.5px;margin:8px 0 4px}
.prof{display:flex;align-items:center;justify-content:space-between;padding:4px 6px;border-radius:4px;margin:1px 0;background:var(--vscode-sideBar-background);border:1px solid transparent}
.prof.def{border-color:var(--vscode-focusBorder)}
.pi{display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;min-width:0}
.sh-ic{width:18px;height:18px;border-radius:3px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0}
.pn{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.star{color:var(--vscode-editorMarkerNavigationWarning-background);font-size:11px}
.pa{display:flex;gap:2px;flex-shrink:0;margin-left:4px}
.pb{width:20px;height:20px;border:none;border-radius:3px;cursor:pointer;font-size:10px;background:transparent;color:var(--vscode-foreground);opacity:.5;display:flex;align-items:center;justify-content:center;padding:0}
.pb:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground)}
.pb.d:hover{color:var(--vscode-errorForeground)}
</style></head><body>
<div class="lbl" style="margin-top:0">${t("appName")}</div>
<button class="btn" onclick="post('fullTerminal')">${t("fullTerminal")}</button>
<button class="btn btn-s" onclick="post('desktop')">${t("desktop")}</button>
<button class="btn btn-s" onclick="post('vscTerminal')">${t("vscTerminal")}</button>

<div class="lbl">${t("addProfile")}</div>
${profileRows}

<button class="btn btn-s" style="margin-top:4px;border:1px dashed var(--vscode-input-border)" onclick="post('add')">+ ${t("addProfile")}</button>

<div style="margin-top:8px"><button class="btn btn-s" onclick="post('openSettings')">${t("settings")}</button></div>

<script nonce="${n()}">
const v = acquireVsCodeApi();
function post(t,id){v.postMessage({type:t,id})}
<\/script>
</body></html>`;
  }
}

// ── Status Bar ──

function updSB(sb: vscode.StatusBarItem | undefined) {
  if (!sb) return;
  const n = vscode.window.terminals.filter((t) => t.name.includes("CodeHub")).length;
  sb.text = n > 0 ? `$(terminal) CodeHub (${n})` : "$(terminal) CodeHub";
  sb.tooltip = t("statusTip");
}

// ── Activate ──

export function activate(ctx: vscode.ExtensionContext) {
  ensureDefaults();

  const side = new SidePanel(ctx.extensionUri);
  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider(SidePanel.vt, side, { webviewOptions: { retainContextWhenHidden: true } }));

  // Register commands so keybindings / command palette works
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.runDefault", () => { const p = getProfiles().find((x) => x.id === getDefault()); if (p) run(p); }));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openFullTerminal", openFullTerminal));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openDesktop", openDesktop));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openVscTerminal", openVscTerminal));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", K)));

  const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  sb.command = "codehub.runDefault";
  sb.show();
  ctx.subscriptions.push(sb);
  updSB(sb);
  ctx.subscriptions.push(vscode.window.onDidOpenTerminal(() => updSB(sb)));
  ctx.subscriptions.push(vscode.window.onDidCloseTerminal(() => updSB(sb)));
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(K)) side.refresh(); }));

  if (vscode.workspace.getConfiguration(K).get<string>("startupMode", "defaultProfile") === "defaultProfile") {
    setTimeout(() => vscode.commands.executeCommand("codehub.runDefault"), 1000);
  }
}

export function deactivate() {}
