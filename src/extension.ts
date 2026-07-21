import * as vscode from "vscode";

// ── Types ──

interface TerminalProfile {
  id: string;
  name: string;
  shell: "powershell" | "cmd" | "wsl" | "bash" | "zsh" | "custom";
  shellPath?: string;
  commands: string[];
  openIn: "fullscreen" | "panel";
  color?: string;
}

// ── I18n ──

type Lang = "tr" | "en";
const STRINGS: Record<string, Record<Lang, string>> = {
  appName: { tr: "CodeHub", en: "CodeHub" },
  addProfile: { tr: "Profil Ekle", en: "Add Profile" },
  editProfile: { tr: "Profili Düzenle", en: "Edit Profile" },
  deleteProfile: { tr: "Profili Sil", en: "Delete Profile" },
  runProfile: { tr: "Çalıştır", en: "Run" },
  setDefault: { tr: "Varsayılan Yap", en: "Set as Default" },
  profileName: { tr: "Profil Adı", en: "Profile Name" },
  shellType: { tr: "Shell Türü", en: "Shell Type" },
  customPath: { tr: "Özel Shell Yolu", en: "Custom Shell Path" },
  commands: { tr: "Komutlar", en: "Commands" },
  addCommand: { tr: "Komut Ekle", en: "Add Command" },
  openIn: { tr: "Açılacağı Yer", en: "Open Location" },
  fullscreen: { tr: "Tam Ekran", en: "Fullscreen" },
  panel: { tr: "Panel", en: "Panel" },
  confirmDelete: { tr: "Bu profili silmek istediğinize emin misiniz?", en: "Are you sure you want to delete this profile?" },
  profileCreated: { tr: "Profil oluşturuldu", en: "Profile created" },
  profileDeleted: { tr: "Profil silindi", en: "Profile deleted" },
  profileUpdated: { tr: "Profil güncellendi", en: "Profile updated" },
  defaultSet: { tr: "Varsayılan profil olarak ayarlandı", en: "Set as default profile" },
  enterName: { tr: "Profil adını girin", en: "Enter profile name" },
  noProfiles: { tr: "Henüz profil eklenmemiş. + butonuna tıklayarak ekleyin.", en: "No profiles yet. Click + to add one." },
  statusTooltip: { tr: "CodeHub - Terminal Aç", en: "CodeHub - Open Terminal" },
  statusTooltipCount: { tr: "CodeHub - {count} terminal aktif", en: "CodeHub - {count} terminals active" },
  runningProfile: { tr: "Çalıştırılıyor: {name}", en: "Running: {name}" },
  profileSettings: { tr: "CodeHub Ayarları", en: "CodeHub Settings" },
  save: { tr: "Kaydet", en: "Save" },
  cancel: { tr: "İptal", en: "Cancel" },
  terminalTitle: { tr: "{name} - CodeHub", en: "{name} - CodeHub" },
};

function t(key: string): string {
  const lang: Lang = vscode.workspace.getConfiguration("codehub").get<string>("language", "tr") === "en" ? "en" : "tr";
  return STRINGS[key]?.[lang] ?? key;
}

function tt(key: string, args: Record<string, string | number>): string {
  let s = t(key);
  for (const [k, v] of Object.entries(args)) s = s.replace(`{${k}}`, String(v));
  return s;
}

// ── Profile Storage ──

function getProfiles(): TerminalProfile[] {
  return vscode.workspace.getConfiguration("codehub").get<TerminalProfile[]>("terminalProfiles", []);
}

function setProfiles(profiles: TerminalProfile[]) {
  vscode.workspace.getConfiguration("codehub").update("terminalProfiles", profiles, vscode.ConfigurationTarget.Global);
}

function getDefaultProfileId(): string {
  return vscode.workspace.getConfiguration("codehub").get<string>("defaultProfile", "");
}

function setDefaultProfileId(id: string) {
  vscode.workspace.getConfiguration("codehub").update("defaultProfile", id, vscode.ConfigurationTarget.Global);
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

  const shellPath = shellMap[profile.shell];

  const location = profile.openIn === "fullscreen"
    ? { viewColumn: vscode.ViewColumn.One, preserveFocus: false } as const
    : undefined;

  const terminalName = tt("terminalTitle", { name: profile.name });

  const terminal = vscode.window.createTerminal({
    name: terminalName,
    iconPath: new vscode.ThemeIcon("terminal"),
    location,
    shellPath,
  });

  terminal.show();

  if (location) {
    await vscode.commands.executeCommand("workbench.action.closeEditorsInOtherGroups");
  }

  // Commands'ları sırayla çalıştır
  for (let i = 0; i < profile.commands.length; i++) {
    const cmd = profile.commands[i].trim();
    if (!cmd) continue;
    setTimeout(() => {
      terminal.sendText(cmd, true);
    }, i * 300);
  }
}

// ── Profile Dialogs ──

async function showProfileDialog(existing?: TerminalProfile): Promise<TerminalProfile | undefined> {
  const isEdit = !!existing;

  const name = await vscode.window.showInputBox({
    prompt: t("enterName"),
    value: existing?.name || "",
    placeHolder: "Claude Code, Custom Dev, ...",
  });
  if (name === undefined) return;

  const shellStr = await vscode.window.showQuickPick(
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
  if (!shellStr) return;
  const shell = shellStr.id as TerminalProfile["shell"];

  let shellPath: string | undefined;
  if (shell === "custom") {
    const p = await vscode.window.showInputBox({ prompt: t("customPath"), value: existing?.shellPath || "" });
    if (p === undefined) return;
    shellPath = p || undefined;
  }

  const commands: string[] = existing?.commands.length ? [...existing.commands] : [""];
  const editCommands = async (cmds: string[]): Promise<string[] | undefined> => {
    const result = await vscode.window.showInputBox({
      prompt: t("commands") + " (her satır bir komut)",
      value: cmds.join("\n"),
      placeHolder: "claude\necho Hello\nnpm start",
      validateInput: (v) => v.trim() ? null : t("commands") + " gerekli",
    });
    if (result === undefined) return;
    return result.split("\n").map((l) => l.trim()).filter(Boolean);
  };

  const finalCommands = await editCommands(commands);
  if (!finalCommands) return;

  const openIn = await vscode.window.showQuickPick(
    [
      { label: t("fullscreen"), description: t("fullscreen"), id: "fullscreen" },
      { label: t("panel"), description: t("panel"), id: "panel" },
    ],
    { placeHolder: t("openIn") },
  );
  if (!openIn) return;

  return {
    id: existing?.id || generateId(),
    name,
    shell,
    shellPath,
    commands: finalCommands,
    openIn: openIn.id as "fullscreen" | "panel",
  };
}

// ── Profile Tree Data Provider ──

class ProfileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly profile: TerminalProfile,
    public readonly isDefault: boolean,
  ) {
    super(profile.name, vscode.TreeItemCollapsibleState.None);

    const shellIcon: Record<string, string> = {
      powershell: "terminal-powershell",
      cmd: "terminal-cmd",
      wsl: "linux",
      bash: "terminal-bash",
      zsh: "terminal-bash",
      custom: "terminal",
    };

    this.iconPath = new vscode.ThemeIcon(shellIcon[profile.shell] || "terminal");
    this.description = `${profile.shell}${profile.openIn === "fullscreen" ? " (tam)" : ""}`;
    this.tooltip = `${profile.name}\nShell: ${profile.shell}\nKomutlar: ${profile.commands.length}\nYer: ${profile.openIn === "fullscreen" ? t("fullscreen") : t("panel")}${isDefault ? "\n★ Varsayılan" : ""}`;

    this.contextValue = isDefault ? "profileDefault" : "profile";

    this.command = {
      command: "codehub.runProfile",
      title: t("runProfile"),
      arguments: [profile.id],
    };
  }
}

class ProfileTreeProvider implements vscode.TreeDataProvider<ProfileTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ProfileTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh() { this._onDidChangeTreeData.fire(undefined); }

  getTreeItem(element: ProfileTreeItem): vscode.TreeItem { return element; }

  getChildren(): ProfileTreeItem[] {
    const profiles = getProfiles();
    const defaultId = getDefaultProfileId();
    if (profiles.length === 0) return [];
    return profiles.map((p) => new ProfileTreeItem(p, p.id === defaultId));
  }
}

// ── Side Panel ──

class SidePanelProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "codehub.sidePanel";
  private view?: vscode.WebviewView;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.onDidDispose(() => { this.view = undefined; });
    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "runDefaultProfile") vscode.commands.executeCommand("codehub.runDefaultProfile");
      if (msg.type === "addProfile") vscode.commands.executeCommand("codehub.addProfile");
      if (msg.type === "openSettings") vscode.commands.executeCommand("codehub.openSettings");
    });
  }

  refresh() {
    if (this.view) this.view.webview.html = this.getHtml(this.view.webview);
  }

  private getHtml(webview: vscode.Webview): string {
    const defaultId = getDefaultProfileId();
    const profiles = getProfiles();
    const defaultName = profiles.find((p) => p.id === defaultId)?.name || "—";
    const htmlLang = (vscode.workspace.getConfiguration("codehub").get("language", "tr") || "tr") as string;
    return `<!DOCTYPE html>
<html lang="${htmlLang === "en" ? "en" : "tr"}">
<head><meta charset="UTF-8"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{padding:12px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);display:flex;flex-direction:column;gap:6px}
  .btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:6px 10px;border:none;border-radius:4px;cursor:pointer;font-size:12px;width:100%;background:var(--vscode-button-background);color:var(--vscode-button-foreground);transition:opacity .15s}
  .btn:hover{opacity:.85}
  .btn-sec{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground)}
  .section{margin-top:8px}
  .title{font-size:11px;text-transform:uppercase;opacity:.5;margin-bottom:4px}
  .info{font-size:11px;opacity:.6;padding:4px 0}
</style></head>
<body>
  <div class="section"><div class="title">${t("runProfile")}</div></div>
  <button class="btn" id="btn-default">${t("runProfile")}: ${defaultName}</button>
  <button class="btn btn-sec" id="btn-add">${t("addProfile")}</button>
  <div class="section"><div class="title">${t("profileSettings")}</div></div>
  <button class="btn btn-sec" id="btn-settings">${t("settings")}</button>
  <script nonce="${(() => {let p = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", t = ""; for (let i = 0; i < 32; i++) t += p[Math.floor(Math.random() * p.length)]; return t;})()}">
    document.getElementById("btn-default").onclick = () => acquireVsCodeApi().postMessage({type:"runDefaultProfile"});
    document.getElementById("btn-add").onclick = () => acquireVsCodeApi().postMessage({type:"addProfile"});
    document.getElementById("btn-settings").onclick = () => acquireVsCodeApi().postMessage({type:"openSettings"});
  </script>
</body></html>`;
  }
}

// ── Status Bar ──

function updateStatusBar(item: vscode.StatusBarItem | undefined) {
  if (!item) return;
  const count = vscode.window.terminals.filter((t) => t.name.includes("CodeHub")).length;
  item.text = count > 0 ? `$(terminal) CodeHub (${count})` : "$(terminal) CodeHub";
  item.tooltip = count > 0 ? tt("statusTooltipCount", { count }) : t("statusTooltip");
}

// ── Activate ──

export function activate(context: vscode.ExtensionContext) {
  // Profile Tree View
  const treeProvider = new ProfileTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("codehubProfiles", treeProvider),
  );

  // Side Panel
  const sideProvider = new SidePanelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("codehub.sidePanel", sideProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // ── Commands ──

  context.subscriptions.push(
    vscode.commands.registerCommand("codehub.addProfile", async () => {
      const profile = await showProfileDialog();
      if (!profile) return;
      const profiles = getProfiles();
      profiles.push(profile);
      setProfiles(profiles);
      treeProvider.refresh();
      sideProvider.refresh();
      vscode.window.showInformationMessage(t("profileCreated") + ": " + profile.name);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codehub.editProfile", async (item?: ProfileTreeItem) => {
      const profile = item?.profile;
      if (!profile) return;
      const updated = await showProfileDialog(profile);
      if (!updated) return;
      const profiles = getProfiles();
      const idx = profiles.findIndex((p) => p.id === profile.id);
      if (idx === -1) return;
      profiles[idx] = updated;
      setProfiles(profiles);
      treeProvider.refresh();
      sideProvider.refresh();
      vscode.window.showInformationMessage(t("profileUpdated"));
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codehub.deleteProfile", async (item?: ProfileTreeItem) => {
      const profile = item?.profile;
      if (!profile) return;
      const confirm = await vscode.window.showQuickPick(
        [t("save"), t("cancel")],
        { placeHolder: t("confirmDelete") + " " + profile.name },
      );
      if (confirm !== t("save")) return;
      const profiles = getProfiles().filter((p) => p.id !== profile.id);
      setProfiles(profiles);
      if (getDefaultProfileId() === profile.id) setDefaultProfileId("");
      treeProvider.refresh();
      sideProvider.refresh();
      vscode.window.showInformationMessage(t("profileDeleted"));
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codehub.setDefaultProfile", async (item?: ProfileTreeItem) => {
      const profile = item?.profile;
      if (!profile) return;
      setDefaultProfileId(profile.id);
      treeProvider.refresh();
      sideProvider.refresh();
      vscode.window.showInformationMessage(t("defaultSet") + ": " + profile.name);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codehub.runProfile", async (id?: string) => {
      const profileId = id || getDefaultProfileId();
      const profile = getProfiles().find((p) => p.id === profileId);
      if (!profile) {
        vscode.window.showWarningMessage(t("noProfiles"));
        return;
      }
      await runProfile(profile);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codehub.runDefaultProfile", async () => {
      const id = getDefaultProfileId();
      if (!id) {
        vscode.window.showWarningMessage(t("noProfiles"));
        return;
      }
      const profile = getProfiles().find((p) => p.id === id);
      if (profile) await runProfile(profile);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codehub.openSettings", () => {
      vscode.commands.executeCommand("workbench.action.openSettings", "codehub");
    }),
  );

  // Status Bar
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "codehub.runDefaultProfile";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  updateStatusBar(statusBarItem);

  context.subscriptions.push(
    vscode.window.onDidOpenTerminal(() => updateStatusBar(statusBarItem)),
  );
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal(() => {
      updateStatusBar(statusBarItem);
      treeProvider.refresh();
      sideProvider.refresh();
    }),
  );

  // Config change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("codehub")) {
        treeProvider.refresh();
        sideProvider.refresh();
      }
    }),
  );

  // Startup — varsayılan profili çalıştır
  const startupMode = vscode.workspace.getConfiguration("codehub").get<string>("startupMode", "defaultProfile");
  if (startupMode === "defaultProfile") {
    setTimeout(() => {
      vscode.commands.executeCommand("codehub.runDefaultProfile");
    }, 1000);
  }
}

export function deactivate() {}
