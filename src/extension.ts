import * as vscode from "vscode";

// ── Types ──

interface TerminalProfile {
  id: string;
  name: string;
  shell: "powershell" | "cmd" | "wsl" | "bash" | "zsh" | "custom";
  shellPath?: string;
  commands: string[];
  openIn: "fullscreen" | "panel";
}

// ── I18n ──

type Lang = "tr" | "en";
const STRINGS: Record<string, Record<Lang, string>> = {
  addProfile: { tr: "Profil Ekle", en: "Add Profile" },
  editProfile: { tr: "Profili Düzenle", en: "Edit Profile" },
  deleteProfile: { tr: "Profili Sil", en: "Delete Profile" },
  runProfile: { tr: "Çalıştır", en: "Run" },
  setDefault: { tr: "Varsayılan Yap", en: "Set as Default" },
  profileName: { tr: "Profil Adı", en: "Profile Name" },
  shellType: { tr: "Shell Türü", en: "Shell Type" },
  customPath: { tr: "Özel Shell Yolu", en: "Custom Shell Path" },
  commands: { tr: "Komutlar", en: "Commands" },
  openIn: { tr: "Açılacağı Yer", en: "Open Location" },
  fullscreen: { tr: "Tam Ekran", en: "Fullscreen" },
  panel: { tr: "Panel", en: "Panel" },
  confirmDelete: { tr: "Bu profili silmek istediğinize emin misiniz?", en: "Are you sure?" },
  profileCreated: { tr: "Profil oluşturuldu", en: "Profile created" },
  profileDeleted: { tr: "Profil silindi", en: "Profile deleted" },
  profileUpdated: { tr: "Profil güncellendi", en: "Profile updated" },
  defaultSet: { tr: "Varsayılan olarak ayarlandı", en: "Set as default" },
  enterName: { tr: "Profil adını girin", en: "Enter profile name" },
  noProfiles: { tr: "Henüz profil yok. + butonuna tıklayarak ekleyin.", en: "No profiles yet. Click + to add one." },
  statusTooltip: { tr: "OpenCode VSCode - Terminal Aç", en: "OpenCode VSCode - Open Terminal" },
  statusTooltipCount: { tr: "OpenCode VSCode - {count} terminal aktif", en: "OpenCode VSCode - {count} terminals active" },
  terminalTitle: { tr: "{name} - OpenCode", en: "{name} - OpenCode" },
  welcomeTitle: { tr: "OpenCode VSCode", en: "OpenCode VSCode" },
  welcomeText: { tr: "Terminal profillerinizi yönetin.", en: "Manage your terminal profiles." },
  runDefault: { tr: "Varsayılanı Çalıştır", en: "Run Default" },
  addNew: { tr: "Yeni Profil", en: "New Profile" },
  settings: { tr: "Ayarlar", en: "Settings" },
  save: { tr: "Kaydet", en: "Save" },
  cancel: { tr: "İptal", en: "Cancel" },
  compact: { tr: "Kompakt", en: "Compact" },
  detailed: { tr: "Detaylı", en: "Detailed" },
  profileCount: { tr: "{count} profil", en: "{count} profiles" },
};

function t(key: string): string {
  const lang: Lang = vscode.workspace.getConfiguration("opencode").get<string>("language", "tr") === "en" ? "en" : "tr";
  return STRINGS[key]?.[lang] ?? key;
}

function tt(key: string, args: Record<string, string | number>): string {
  let s = t(key);
  for (const [k, v] of Object.entries(args)) s = s.replace(`{${k}}`, String(v));
  return s;
}

// ── Default profiles ──

function ensureDefaultProfiles() {
  if (getProfiles().length > 0) return;
  setProfiles([
    { id: "powershell-default", name: "PowerShell", shell: "powershell", commands: [], openIn: "panel" },
    { id: "cmd-default", name: "CMD", shell: "cmd", commands: [], openIn: "panel" },
  ]);
  setDefaultProfileId("powershell-default");
}

// ── Profile Storage ──

const CFG = "opencode";

function getProfiles(): TerminalProfile[] {
  return vscode.workspace.getConfiguration(CFG).get<TerminalProfile[]>("terminalProfiles", []);
}

function setProfiles(profiles: TerminalProfile[]) {
  vscode.workspace.getConfiguration(CFG).update("terminalProfiles", profiles, vscode.ConfigurationTarget.Global);
}

function getDefaultProfileId(): string {
  return vscode.workspace.getConfiguration(CFG).get<string>("defaultProfile", "");
}

function setDefaultProfileId(id: string) {
  vscode.workspace.getConfiguration(CFG).update("defaultProfile", id, vscode.ConfigurationTarget.Global);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Profile Runner ──

async function runProfile(profile: TerminalProfile) {
  const shellMap: Record<string, string | undefined> = {
    powershell: "powershell.exe",
    cmd: "cmd.exe",
    wsl: "wsl.exe",
    bash: "bash",
    zsh: "zsh",
    custom: profile.shellPath || undefined,
  };

  const location = profile.openIn === "fullscreen"
    ? { viewColumn: vscode.ViewColumn.One, preserveFocus: false } as const
    : undefined;

  const terminal = vscode.window.createTerminal({
    name: tt("terminalTitle", { name: profile.name }),
    iconPath: new vscode.ThemeIcon("terminal"),
    location,
    shellPath: shellMap[profile.shell],
  });

  terminal.show();
  if (location) await vscode.commands.executeCommand("workbench.action.closeEditorsInOtherGroups");

  for (let i = 0; i < profile.commands.length; i++) {
    const cmd = profile.commands[i].trim();
    if (!cmd) continue;
    setTimeout(() => terminal.sendText(cmd, true), i * 300);
  }
}

// ── Profile Dialogs ──

async function showProfileDialog(existing?: TerminalProfile): Promise<TerminalProfile | undefined> {
  const name = await vscode.window.showInputBox({
    prompt: t("enterName"),
    value: existing?.name || "",
    placeHolder: "Claude Code, Dev, ...",
  });
  if (name === undefined) return;

  const shellPick = await vscode.window.showQuickPick(
    [
      { label: "PowerShell", description: "powershell.exe", id: "powershell" },
      { label: "CMD", description: "cmd.exe", id: "cmd" },
      { label: "WSL", description: "wsl.exe", id: "wsl" },
      { label: "Bash", description: "bash", id: "bash" },
      { label: "Zsh", description: "zsh", id: "zsh" },
      { label: "Custom...", description: t("customPath"), id: "custom" },
    ],
    { placeHolder: t("shellType") },
  );
  if (!shellPick) return;
  const shell = shellPick.id as TerminalProfile["shell"];

  let shellPath: string | undefined;
  if (shell === "custom") {
    const p = await vscode.window.showInputBox({ prompt: t("customPath"), value: existing?.shellPath || "" });
    if (p === undefined) return;
    shellPath = p || undefined;
  }

  const commands: string[] = existing?.commands.length ? [...existing.commands] : [""];
  const cmdResult = await vscode.window.showInputBox({
    prompt: `${t("commands")} (` + "her satır bir komut" + `)`,
    value: commands.join("\n"),
    placeHolder: "echo Hello\nnpm start\nclaude",
  });
  if (cmdResult === undefined) return;
  const finalCommands = cmdResult.split("\n").map((l) => l.trim()).filter(Boolean);

  const openPick = await vscode.window.showQuickPick(
    [
      { label: t("fullscreen"), id: "fullscreen" },
      { label: t("panel"), id: "panel" },
    ],
    { placeHolder: t("openIn") },
  );
  if (!openPick) return;

  return {
    id: existing?.id || generateId(),
    name,
    shell,
    shellPath,
    commands: finalCommands,
    openIn: openPick.id as "fullscreen" | "panel",
  };
}

// ── Profile Tree ──

class ProfileItem extends vscode.TreeItem {
  constructor(
    public readonly profile: TerminalProfile,
    public readonly isDefault: boolean,
  ) {
    super(profile.name, vscode.TreeItemCollapsibleState.None);

    const icons: Record<string, string> = {
      powershell: "terminal-powershell", cmd: "terminal-cmd", wsl: "linux",
      bash: "terminal-bash", zsh: "terminal-bash", custom: "terminal",
    };
    this.iconPath = new vscode.ThemeIcon(icons[profile.shell] || "terminal");
    this.description = profile.shell + (profile.openIn === "fullscreen" ? " \u25A1" : "");
    this.tooltip =
      `${profile.name}\nShell: ${profile.shell}\n` +
      `${t("commands")}: ${profile.commands.length}\n` +
      `${t("openIn")}: ${profile.openIn === "fullscreen" ? t("fullscreen") : t("panel")}` +
      (isDefault ? `\n\u2605 ${t("setDefault")}` : "");
    this.contextValue = isDefault ? "profileDefault" : "profile";
    this.command = { command: "opencode.runProfile", title: t("runProfile"), arguments: [profile.id] };
  }
}

class ProfileProvider implements vscode.TreeDataProvider<ProfileItem> {
  private _onDidChange = new vscode.EventEmitter<ProfileItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  refresh() { this._onDidChange.fire(undefined); }

  getTreeItem(el: ProfileItem): vscode.TreeItem { return el; }

  getChildren(): ProfileItem[] {
    const defaultId = getDefaultProfileId();
    return getProfiles().map((p) => new ProfileItem(p, p.id === defaultId));
  }
}

// ── Side Panel ──

class SidePanel implements vscode.WebviewViewProvider {
  static readonly viewType = "opencode.sidePanel";
  private view?: vscode.WebviewView;

  constructor(private readonly extUri: vscode.Uri) {}

  resolveWebviewView(v: vscode.WebviewView) {
    this.view = v;
    v.webview.options = { enableScripts: true };
    v.webview.html = this.html(v.webview);
    v.onDidDispose(() => { this.view = undefined; });
    v.webview.onDidReceiveMessage((m) => {
      if (m.type === "runDefault") vscode.commands.executeCommand("opencode.runDefaultProfile");
      if (m.type === "addProfile") vscode.commands.executeCommand("opencode.addProfile");
      if (m.type === "openSettings") vscode.commands.executeCommand("opencode.openSettings");
    });
  }

  refresh() { if (this.view) this.view.webview.html = this.html(this.view.webview); }

  private html(wv: vscode.Webview): string {
    const profiles = getProfiles();
    const defId = getDefaultProfileId();
    const defName = profiles.find((p) => p.id === defId)?.name || "\u2014";
    const count = profiles.length;
    const nonce = (() => {
      const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let r = "";
      for (let i = 0; i < 32; i++) r += c[Math.floor(Math.random() * c.length)];
      return r;
    })();
    return `<!DOCTYPE html>
<html lang="${(vscode.workspace.getConfiguration(CFG).get<string>("language", "tr") || "tr") === "en" ? "en" : "tr"}">
<head><meta charset="UTF-8"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{padding:12px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);display:flex;flex-direction:column;gap:8px}
  .btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:7px 0;border:none;border-radius:4px;cursor:pointer;font-size:13px;width:100%;background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
  .btn:hover{opacity:.9}
  .btn-s{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
  .lbl{font-size:11px;text-transform:uppercase;opacity:.5;letter-spacing:.3px}
  .info{font-size:11px;opacity:.6}
</style></head>
<body>
  <div class="lbl" style="margin-bottom:2px">${t("welcomeTitle")}</div>
  <div class="info" style="margin-bottom:4px">${count} ${tt("profileCount", { count })}</div>
  <button class="btn" id="b-run">${t("runDefault")}: ${defName}</button>
  <button class="btn btn-s" id="b-add">${t("addNew")}</button>
  <div style="margin-top:8px"><button class="btn btn-s" id="b-set">${t("settings")}</button></div>
  <script nonce="${nonce}">
    (() => {
      const v = acquireVsCodeApi();
      document.getElementById("b-run").onclick = () => v.postMessage({type:"runDefault"});
      document.getElementById("b-add").onclick = () => v.postMessage({type:"addProfile"});
      document.getElementById("b-set").onclick = () => v.postMessage({type:"openSettings"});
    })();
  </script>
</body></html>`;
  }
}

// ── Status Bar ──

function updateStatus(item: vscode.StatusBarItem | undefined) {
  if (!item) return;
  const n = getProfiles().length;
  const c = vscode.window.terminals.filter((t) => t.name.includes("OpenCode")).length;
  item.text = c > 0 ? `$(terminal) OpenCode (${c})` : "$(terminal) OpenCode";
  item.tooltip = c > 0 ? tt("statusTooltipCount", { count: c }) : t("statusTooltip");
}

// ── Activate ──

export function activate(context: vscode.ExtensionContext) {
  ensureDefaultProfiles();

  const tree = new ProfileProvider();
  context.subscriptions.push(vscode.window.registerTreeDataProvider("opencodeProfiles", tree));

  const side = new SidePanel(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidePanel.viewType, side, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("opencode.addProfile", async () => {
      const p = await showProfileDialog();
      if (!p) return;
      const list = getProfiles();
      list.push(p);
      setProfiles(list);
      tree.refresh();
      side.refresh();
      vscode.window.showInformationMessage(`${t("profileCreated")}: ${p.name}`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("opencode.editProfile", async (item?: ProfileItem) => {
      const p = item?.profile;
      if (!p) return;
      const u = await showProfileDialog(p);
      if (!u) return;
      const list = getProfiles();
      const i = list.findIndex((x) => x.id === p.id);
      if (i < 0) return;
      list[i] = u;
      setProfiles(list);
      tree.refresh();
      side.refresh();
      vscode.window.showInformationMessage(t("profileUpdated"));
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("opencode.deleteProfile", async (item?: ProfileItem) => {
      const p = item?.profile;
      if (!p) return;
      const ok = (await vscode.window.showQuickPick([t("save"), t("cancel")], {
        placeHolder: `${t("confirmDelete")} "${p.name}"`,
      })) === t("save");
      if (!ok) return;
      setProfiles(getProfiles().filter((x) => x.id !== p.id));
      if (getDefaultProfileId() === p.id) setDefaultProfileId("");
      tree.refresh();
      side.refresh();
      vscode.window.showInformationMessage(`${t("profileDeleted")}: ${p.name}`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("opencode.setDefaultProfile", async (item?: ProfileItem) => {
      const p = item?.profile;
      if (!p) return;
      setDefaultProfileId(p.id);
      tree.refresh();
      side.refresh();
      vscode.window.showInformationMessage(`${t("defaultSet")}: ${p.name}`);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("opencode.runProfile", async (id?: string) => {
      const p = getProfiles().find((x) => x.id === (id || getDefaultProfileId()));
      if (p) await runProfile(p);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("opencode.runDefaultProfile", async () => {
      const p = getProfiles().find((x) => x.id === getDefaultProfileId());
      if (p) await runProfile(p);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("opencode.openSettings", () => {
      vscode.commands.executeCommand("workbench.action.openSettings", CFG);
    }),
  );

  const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  sb.command = "opencode.runDefaultProfile";
  sb.show();
  context.subscriptions.push(sb);
  updateStatus(sb);

  context.subscriptions.push(vscode.window.onDidOpenTerminal(() => updateStatus(sb)));
  context.subscriptions.push(vscode.window.onDidCloseTerminal(() => { updateStatus(sb); tree.refresh(); side.refresh(); }));
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(CFG)) { tree.refresh(); side.refresh(); }
  }));

  if (vscode.workspace.getConfiguration(CFG).get<string>("startupMode", "defaultProfile") === "defaultProfile") {
    setTimeout(() => vscode.commands.executeCommand("opencode.runDefaultProfile"), 1000);
  }
}

export function deactivate() {}
