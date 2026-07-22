import * as vscode from "vscode";
import { execSync } from "child_process";

// ── Types ──

interface Profile {
  id: string; name: string; icon?: string;
  executable: string; arguments: string;
  shell: "powershell" | "cmd" | "wsl" | "bash" | "zsh" | "custom";
  shellPath?: string; category?: string; checkCommand?: string;
}

interface LibEntry {
  name: string; icon: string; executable: string; arguments: string;
  shell: Profile["shell"]; category: string; checkCommand?: string;
  desc: string;
}

// ── I18n ──

const _ = (tr: string, en: string) => ({ tr, en });
const T: Record<string, Record<string, string>> = {
  appName: _("CodeHub", "CodeHub"), settings: _("Ayarlar", "Settings"),
  library: _("Kütüphane", "Library"), addFromLib: _("Kütüphaneden Ekle", "Add from Library"),
  addProfile: _("Profil Ekle", "Add Profile"), noProfiles: _("Henüz profil yok.", "No profiles yet."),
  created: _("Profil oluşturuldu", "Profile created"), deleted: _("Profil silindi", "Profile deleted"),
  updated: _("Profil güncellendi", "Profile updated"), closeAll: _("Tümünü Kapat", "Close All"),
  profileList: _("Profiller", "Profiles"), first: _("En üstteki", "Topmost"),
  profileName: _("Profil adı", "Profile name"), shellType: _("Kabuk", "Shell"),
  exec: _("Çalıştırılacak", "Executable"), args: _("Argümanlar", "Arguments"),
  edit: _("Düzenle", "Edit"), del: _("Sil", "Delete"), close: _("Kapat", "Close"),
  up: _("Yukarı", "Up"), down: _("Aşağı", "Down"),
  searchLib: _("Ara veya seç...", "Search or select..."),
  exportTitle: _("Dışa Aktar", "Export"), importTitle: _("İçe Aktar", "Import"),
  exported: _("Profiller dışa aktarıldı", "Profiles exported"),
  imported: _("Profiller içe aktarıldı", "Profiles imported"),
  statusTip: _("CodeHub - En üstteki profili çalıştır", "CodeHub - Run top profile"),
  terminalCount: _("{n} terminal", "{n} terminals"),
  defaultCleared: _("Varsayılan profil sıfırlandı", "Default profile cleared"),
  noDefault: _("Varsayılan yok — en üstteki profili kullan", "No default — uses topmost"),
};

function t(k: string): string {
  return T[k]?.[vscode.workspace.getConfiguration("codehub").get<string>("language","tr")==="en"?"en":"tr"]??k;
}

// ── Config ──

const K = "codehub";
function c() { return vscode.workspace.getConfiguration(K); }
function getP(): Profile[] { return c().get<Profile[]>("terminalProfiles", []); }
function setP(p: Profile[]) { c().update("terminalProfiles", p, vscode.ConfigurationTarget.Global); }
function gid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function defId(): string { const d = c().get<string>("defaultProfile", ""); if (d) return d; const l = getP(); return l.length > 0 ? l[0].id : ""; }
function findP(id: string): Profile | undefined { return getP().find((x) => x.id === id); }
function pName(id: string): string { return id === "first" ? t("first") : findP(id)?.name || t("first"); }

// ── Library (sadece AI coding CLI'ları) ──

const LIB: LibEntry[] = [
  { name: "Claude Code", icon: "comment-discussion", executable: "claude", arguments: "", shell: "cmd", category: "ai", checkCommand: "claude --version", desc: "Anthropic AI coding agent" },
  { name: "OpenCode", icon: "terminal", executable: "opencode", arguments: "", shell: "cmd", category: "ai", checkCommand: "opencode --version", desc: "Multi-provider AI coding agent" },
  { name: "Codex CLI", icon: "symbol-ruler", executable: "codex", arguments: "", shell: "cmd", category: "ai", checkCommand: "codex --version", desc: "OpenAI coding agent CLI" },
  { name: "Kilo CLI", icon: "terminal", executable: "kilo", arguments: "", shell: "cmd", category: "ai", checkCommand: "kilo --version", desc: "500+ model AI agent CLI" },
  { name: "Antigravity CLI", icon: "sparkle", executable: "agy", arguments: "", shell: "cmd", category: "ai", checkCommand: "agy --version", desc: "Google Antigravity 2.0 terminal agent" },
  { name: "Gemini CLI", icon: "sparkle", executable: "gemini", arguments: "", shell: "cmd", category: "ai", checkCommand: "gemini --version", desc: "Google Gemini CLI" },
  { name: "Qwen Code", icon: "symbol-misc", executable: "qwen", arguments: "", shell: "cmd", category: "ai", checkCommand: "qwen --version", desc: "Alibaba Qwen coding agent" },
  { name: "Aider", icon: "tools", executable: "aider", arguments: "--model sonnet", shell: "cmd", category: "ai", checkCommand: "aider --version", desc: "AI pair programming CLI" },
  { name: "GitHub Copilot CLI", icon: "github", executable: "copilot", arguments: "", shell: "cmd", category: "ai", checkCommand: "copilot --version", desc: "GitHub Copilot in your terminal" },
  { name: "Amazon Q", icon: "cloud", executable: "q", arguments: "", shell: "cmd", category: "ai", checkCommand: "q --version", desc: "AWS AI coding agent CLI" },
  { name: "Goose", icon: "star", executable: "goose", arguments: "", shell: "cmd", category: "ai", checkCommand: "goose --version", desc: "Block AI coding agent" },
  { name: "Kiro CLI", icon: "terminal", executable: "kiro-cli", arguments: "chat", shell: "cmd", category: "ai", checkCommand: "kiro-cli --version", desc: "Kiro interactive AI CLI" },
  { name: "Cline", icon: "terminal", executable: "cline", arguments: "", shell: "cmd", category: "ai", desc: "VS Code AI coding agent (Cline)" },
  { name: "Roo Code", icon: "terminal", executable: "roo", arguments: "", shell: "cmd", category: "ai", desc: "VS Code AI coding agent (Roo)" },
];

function fromLib(l: LibEntry): Profile {
  return { id: gid(), name: l.name, icon: l.icon, executable: l.executable, arguments: l.arguments, shell: l.shell, category: l.category, checkCommand: l.checkCommand };
}

// ── Helpers ──

function shellPath(p: Profile): string | undefined {
  const m: Record<string, string | undefined> = { powershell: "powershell.exe", cmd: "cmd.exe", wsl: "wsl.exe", bash: "bash", zsh: "zsh" };
  return p.shell === "custom" ? p.shellPath || undefined : m[p.shell];
}
function buildCmd(p: Profile): string { return [p.executable, p.arguments].filter(Boolean).join(" "); }
function fallbackIcon(name: string): string { return name.charAt(0).toUpperCase(); }

// Install check with caching
const _instCache = new Map<string, boolean>();
function isInst(exe: string): boolean {
  const cached = _instCache.get(exe); if (cached !== undefined) return cached;
  try {
    execSync(process.platform === "win32" ? `where ${exe.split(" ")[0]} 2>nul` : `command -v ${exe.split(" ")[0]} 2>/dev/null`, { encoding: "utf-8", timeout: 1500, windowsHide: true, stdio: "pipe" });
    _instCache.set(exe, true); return true;
  } catch { _instCache.set(exe, false); return false; }
}
function clearInstCache() { _instCache.clear(); }

// Terminal tracking
const openTerms = new Map<string, vscode.Terminal>();

async function runProf(p: Profile) {
  const existing = openTerms.get(p.id);
  if (existing && c().get<boolean>("reuseTerminal", true) && !c().get<boolean>("alwaysNewTerminal", false)) {
    existing.show(true); return;
  }
  try {
    const term = vscode.window.createTerminal({
      name: `${p.name} - CodeHub`, iconPath: new vscode.ThemeIcon(p.icon || "terminal"),
      location: { viewColumn: vscode.ViewColumn.One, preserveFocus: false } as const, shellPath: shellPath(p),
    });
    openTerms.set(p.id, term); term.show();
    await vscode.commands.executeCommand("workbench.action.closeEditorsInOtherGroups");
    const cmd = buildCmd(p);
    if (cmd.trim()) setTimeout(() => term.sendText(cmd.trim(), true), 800);
    const d = vscode.window.onDidCloseTerminal((t) => { if (t === term) { openTerms.delete(p.id); d.dispose(); } });
  } catch (e) { vscode.window.showErrorMessage(`CodeHub: ${p.name} başlatılamadı: ${e instanceof Error ? e.message : String(e)}`); }
}

function closeProf(id: string) { const t = openTerms.get(id); if (t) { t.dispose(); openTerms.delete(id); } }
function runDef() { const id = defId(); const p = findP(id); if (p) runProf(p); }

async function pickProf(title: string, sk: string) {
  const items = [{ label: `$(chevron-up) ${t("first")}`, id: "first" }, ...getP().map((p) => ({ label: `$(${p.icon||"terminal"}) ${p.name}  ${buildCmd(p)}`,description: p.shell, id: p.id }))];
  const pick = await vscode.window.showQuickPick(items, { placeHolder: title, matchOnDescription: true }); if (pick) c().update(sk, pick.id, vscode.ConfigurationTarget.Global);
}

// ── Import/Export ──

async function expProf() {
  const uri = await vscode.window.showSaveDialog({ filters: { "CodeHub Profiles": ["json"] }, defaultUri: vscode.Uri.file(`codehub-${new Date().toISOString().slice(0,10)}.json`) });
  if (!uri) return; try { vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(getP(), null, 2), "utf-8")); vscode.window.showInformationMessage(t("exported")); } catch { vscode.window.showErrorMessage("Export failed"); }
}
async function impProf() {
  const uri = await vscode.window.showOpenDialog({ filters: { "CodeHub Profiles": ["json"] }, canSelectMany: false });
  if (!uri || !uri.length) return;
  try { const d = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri[0]))) as Profile[]; if (!Array.isArray(d)) throw Error(); d.forEach((p) => { if (!p.id) p.id = gid(); }); setP(d); vscode.window.showInformationMessage(`${t("imported")} (${d.length})`); } catch { vscode.window.showErrorMessage("Import failed: invalid file"); }
}

// ── Dialogs ──

async function pickIcon(existing?: string): Promise<string | undefined> {
  const ch = await vscode.window.showQuickPick([
    { label: `$(close) ${t("exec")} ${t("settings")} (Enter)`, id: "none" },
    { label: `$(symbol-color) Tema ikonu seç`, id: "theme" },
  ], { placeHolder: t("searchLib") });
  if (!ch) return; if (ch.id === "none") return existing !== undefined ? existing : "";
  const icons = ["terminal","terminal-powershell","terminal-cmd","terminal-bash","terminal-linux","browser","comment-discussion","git-branch","github","symbol-variable","symbol-ruler","symbol-key","server","server-process","database","cloud","tools","beaker","light-bulb","flame","star","rocket","zap","sync","play","debug","package","code","sparkle","wand","shield","hubot"];
  const pick = await vscode.window.showQuickPick(icons.map((i) => ({ label: `$(${i}) ${i}`, id: i })), { placeHolder: t("searchLib") }); return pick?.id;
}

async function profDlg(existing?: Profile): Promise<Profile | undefined> {
  const name = await vscode.window.showInputBox({ prompt: t("profileName"), value: existing?.name || "", placeHolder: "Claude Code" }); if (name === undefined) return;
  const icon = await pickIcon(existing?.icon); if (icon === undefined) return;
  const exec = await vscode.window.showInputBox({ prompt: t("exec"), value: existing?.executable || "", placeHolder: "claude, node, git" }); if (exec === undefined) return;
  const args = await vscode.window.showInputBox({ prompt: t("args"), value: existing?.arguments || "", placeHolder: "--model sonnet, run dev" }); if (args === undefined) return;
  const sp = await vscode.window.showQuickPick([
    { label: "$(terminal-cmd) CMD", id: "cmd" }, { label: "$(terminal-powershell) PowerShell", id: "powershell" },
    { label: "$(terminal-linux) WSL", id: "wsl" }, { label: "$(terminal-bash) Bash", id: "bash" },
    { label: "$(terminal-bash) Zsh", id: "zsh" }, { label: "$(tools) Custom", id: "custom" },
  ], { placeHolder: t("shellType") }); if (!sp) return;
  const shell = sp.id as Profile["shell"]; let shellPath: string | undefined;
  if (shell === "custom") { const p = await vscode.window.showInputBox({ prompt: "Custom shell path", value: existing?.shellPath || "" }); if (p === undefined) return; shellPath = p || undefined; }
  return { id: existing?.id || gid(), name, icon: icon || undefined, executable: exec, arguments: args, shell, shellPath };
}

async function pickLib(): Promise<Profile | undefined> {
  const items = LIB.map((l) => ({ label: `$(${l.icon}) ${l.name}`, description: `${l.executable} ${l.arguments}`.trim(), detail: l.desc, lib: l }));
  const pick = await vscode.window.showQuickPick(items, { placeHolder: t("searchLib"), matchOnDescription: true, matchOnDetail: true });
  return pick ? fromLib(pick.lib) : undefined;
}

// ── Side Panel ──

class SidePanel implements vscode.WebviewViewProvider {
  static vt = "codehub.sidePanel"; private v?: vscode.WebviewView;
  constructor(private ctx: vscode.ExtensionContext) {}

  resolveWebviewView(vw: vscode.WebviewView) {
    this.v = vw; vw.webview.options = { enableScripts: true }; this.render();
    vw.onDidDispose(() => { this.v = undefined; });
    vw.webview.onDidReceiveMessage(async (m) => {
      if (m.type === "run") { const p = findP(m.id); if (p) await runProf(p); this.render(); return; }
      if (m.type === "closeProf") { closeProf(m.id); this.render(); return; }
      if (m.type === "closeAll") { vscode.window.terminals.forEach((t) => { if (t.name.includes("CodeHub")) t.dispose(); }); openTerms.clear(); this.render(); return; }
      if (m.type === "addLib") { const l = await pickLib(); if (!l) { this.render(); return; } const list = getP(); list.push(l); setP(list); this.render(); vscode.window.showInformationMessage(`${t("created")}: ${l.name}`); return; }
      if (m.type === "add") { const r = await profDlg(); if (!r) { this.render(); return; } const list = getP(); list.push(r); setP(list); this.render(); vscode.window.showInformationMessage(`${t("created")}: ${r.name}`); return; }
      if (m.type === "edit") { const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return; const u = await profDlg(list[i]); if (!u) { this.render(); return; } list[i] = u; setP(list); this.render(); vscode.window.showInformationMessage(t("updated")); return; }
      if (m.type === "delete") { setP(getP().filter((x) => x.id !== m.id)); if (c().get<string>("defaultProfile", "") === m.id) { c().update("defaultProfile", "", vscode.ConfigurationTarget.Global); vscode.window.showInformationMessage(t("defaultCleared")); } this.render(); vscode.window.showInformationMessage(t("deleted")); return; }
      if (m.type === "up" || m.type === "down") { const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return; const j = m.type === "up" ? i - 1 : i + 1; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; setP(list); this.render(); return; }
      if (m.type === "reorder") { const list = getP(); const i = list.findIndex((x) => x.id === m.id); if (i < 0) return; const to = Math.max(0, Math.min(list.length - 1, (parseInt(m.value) || 1) - 1)); const item = list.splice(i, 1)[0]; list.splice(to, 0, item); setP(list); this.render(); return; }
      if (m.type === "searchLib") { const l = await pickLib(); if (!l) { this.render(); return; } const list = getP(); list.push(l); setP(list); this.render(); vscode.window.showInformationMessage(`${t("created")}: ${l.name}`); return; }
      if (m.type === "settings") { vscode.commands.executeCommand("workbench.action.openSettings", K); return; }
      if (m.type === "clearDefault") { c().update("defaultProfile", "", vscode.ConfigurationTarget.Global); this.render(); vscode.window.showInformationMessage(t("defaultCleared")); return; }
      if (m.type === "exportI") { await expProf(); return; } if (m.type === "importI") { await impProf(); clearInstCache(); this.render(); return; }
    });
  }

  render() { if (this.v) this.v.webview.html = this.html(); }

  private html(): string {
    const list = getP(); const lang = c().get<string>("language", "tr") === "en" ? "en" : "tr";
    const tc = vscode.window.terminals.filter((t) => t.name.includes("CodeHub")).length;
    const def = c().get<string>("defaultProfile", "");
    const hasDef = !!def && list.some((p) => p.id === def);
    const n = () => { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; let r = ""; for (let i = 0; i < 32; i++) r += c[Math.floor(Math.random() * c.length)]; return r; };
    const esc = (s: string) => s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m] || m);

    const rows = list.map((p, idx) => {
      const isDef = p.id === def;
      const first = idx === 0; const last = idx === list.length - 1;
      const isOpen = openTerms.has(p.id);
      const installed = isInst(p.executable);
      const hasIcon = p.icon && p.icon.length > 0;
      const iconHtml = hasIcon ? `<span class="ic codicon codicon-${esc(p.icon!)}"></span>` : `<span class="ic-f">${esc(fallbackIcon(p.name))}</span>`;
      return `<div class="cr ${isDef?"def":""}">
        <input class="on" type="number" value="${idx+1}" min="1" max="${list.length}" onchange="p('reorder','${p.id}',this.value)">
        <span class="cb ${installed?"play":"na"}" onclick="p('run','${p.id}')">${iconHtml}${!installed?`<span class="ndot"></span>`:""}${isOpen?`<span class="odot"></span>`:""}</span>
        <div class="cn" onclick="p('run','${p.id}')">
          <span class="cn-t">${esc(p.name)}${isDef?` <span class="star">\u2605</span>`:""}</span>
          <span class="cn-s">${esc(buildCmd(p))}</span>
        </div>
        <div class="ca">
          ${isOpen?`<button class="b b-cls" onclick="p('closeProf','${p.id}')" title="${t("close")}">\u2716</button>`:""}
          <button class="b" onclick="p('edit','${p.id}')" title="${t("edit")}">\u270F</button>
          <button class="b b-del" onclick="p('delete','${p.id}')" title="${t("del")}">\u{1F5D1}</button>
          <button class="b b-up ${first?"lim":""}" onclick="p('up','${p.id}')" ${first?"disabled":""} title="${t("up")}">\u25B2</button>
          <button class="b b-dn ${last?"lim":""}" onclick="p('down','${p.id}')" ${last?"disabled":""} title="${t("down")}">\u25BC</button>
        </div>
      </div>`;
    }).join("");

    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"/><style>
*{margin:0;padding:0;box-sizing:border-box}
body{padding:12px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);line-height:1.4}
.tb{display:flex;align-items:center;gap:6px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid color-mix(in srgb,var(--vscode-foreground) 8%,transparent)}
.tb .ti{font-size:13px;font-weight:600;flex:1;opacity:.9}
.tb .ib{width:26px;height:26px;border:none;border-radius:5px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;background:transparent;color:var(--vscode-foreground);opacity:.5;transition:all .1s}
.tb .ib:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground)}
.def-notice{font-size:10px;opacity:.4;margin-bottom:6px;padding:4px 6px;border-radius:4px;background:color-mix(in srgb,var(--vscode-editorMarkerNavigationWarning-background) 8%,transparent)}
.cr{display:flex;align-items:center;gap:4px;padding:6px 6px;border-radius:7px;margin:3px 0;border:1px solid transparent;transition:border-color .1s}
.cr:hover{border-color:color-mix(in srgb,var(--vscode-foreground) 12%,transparent)}
.cr.def{border-color:color-mix(in srgb,var(--vscode-editorMarkerNavigationWarning-background) 25%,transparent);background:color-mix(in srgb,var(--vscode-editorMarkerNavigationWarning-background) 5%,transparent)}
.on{width:24px;height:20px;border-radius:4px;border:1px solid color-mix(in srgb,var(--vscode-foreground) 15%,transparent);background:transparent;color:var(--vscode-foreground);text-align:center;font-size:10px;font-weight:600;flex-shrink:0}
.on:focus{border-color:var(--vscode-focusBorder);outline:none}
.cb{width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;transition:all .12s;position:relative}
.cb.play{background:color-mix(in srgb,var(--vscode-button-background) 12%,transparent);color:var(--vscode-button-background)}
.cb.play:hover{background:var(--vscode-button-background);color:var(--vscode-button-foreground);transform:scale(1.06)}
.cb.na{opacity:.25}.cb.na:hover{opacity:.5;transform:scale(1.04)}
.ndot,.odot{position:absolute;top:2px;right:2px;width:6px;height:6px;border-radius:50%}
.ndot{background:var(--vscode-errorForeground);opacity:.5}
.odot{background:var(--vscode-testing-iconPassed)}
.ic{font-size:16px;display:flex;align-items:center;justify-content:center}
.ic-f{width:20px;height:20px;border-radius:4px;background:color-mix(in srgb,var(--vscode-button-background) 15%,transparent);color:var(--vscode-button-background);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700}
.cn{flex:1;min-width:0;cursor:pointer;padding:2px 4px;border-radius:4px}
.cn:hover{background:var(--vscode-list-hoverBackground)}
.cn-t{font-size:13px;font-weight:500;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cn-s{font-size:10px;opacity:.35;display:block;margin-top:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.star{color:var(--vscode-editorMarkerNavigationWarning-background);font-size:10px}
.ca{display:flex;gap:2px;flex-shrink:0;align-items:center}
.b{width:20px;height:20px;border:none;border-radius:4px;cursor:pointer;font-size:9px;background:transparent;color:var(--vscode-foreground);opacity:.2;display:flex;align-items:center;justify-content:center;padding:0;transition:all .1s}
.b:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground)}
.b-del:hover{color:var(--vscode-errorForeground);opacity:1}
.b-cls{opacity:.5;color:var(--vscode-testing-iconPassed)}.b-cls:hover{opacity:1;color:var(--vscode-errorForeground)}
.b-up.lim,.b-dn.lim{color:var(--vscode-errorForeground);opacity:.4;cursor:default;pointer-events:none}
.b-up,.b-dn{opacity:.5}.b-up:not(.lim):hover,.b-dn:not(.lim):hover{opacity:1;color:var(--vscode-testing-iconPassed)}
.emp{padding:24px 16px;text-align:center;font-size:12px;opacity:.3;line-height:1.5}
.note{font-size:10px;opacity:.35;text-align:center;margin-top:6px}
</style></head><body>
<div class="tb">
  <span class="ti">CodeHub</span>
  <button class="ib" onclick="p('searchLib')" title="${t("searchLib")}">\u2795</button>
  <button class="ib" onclick="p('settings')" title="${t("settings")}">\u2699</button>
</div>

${!hasDef ? `<div class="def-notice">\u26A0 ${t("first")}</div>` : ""}

${list.length > 0 ? rows : `<div class="emp">${t("noProfiles")}\n+ ${t("addProfile")}</div>`}

<div style="display:flex;gap:3px;margin-top:4px">
  <button style="flex:1;padding:5px;border:1px dashed color-mix(in srgb,var(--vscode-foreground) 15%,transparent);border-radius:5px;cursor:pointer;font-size:10px;background:transparent;color:var(--vscode-foreground);opacity:.5;transition:opacity .1s" onclick="p('add')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.5">+ ${t("addProfile")}</button>
  <button style="padding:5px;width:30px;border:1px dashed color-mix(in srgb,var(--vscode-foreground) 15%,transparent);border-radius:5px;cursor:pointer;font-size:13px;background:transparent;color:var(--vscode-foreground);opacity:.5;transition:opacity .1s;display:flex;align-items:center;justify-content:center" onclick="p('addLib')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.5" title="${t("addFromLib")}">\u{1F4CB}</button>
</div>

<div style="display:flex;gap:3px;margin-top:8px">
  <button style="flex:1;padding:4px;border:none;border-radius:5px;cursor:pointer;font-size:9px;background:color-mix(in srgb,var(--vscode-errorForeground) 8%,transparent);color:var(--vscode-errorForeground);opacity:.6;transition:opacity .1s" onclick="p('closeAll')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.6">${t("closeAll")}</button>
  <button style="flex:1;padding:4px;border:none;border-radius:5px;cursor:pointer;font-size:9px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);opacity:.6;transition:opacity .1s" onclick="p('exportI')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.6">${t("exportTitle")}</button>
  <button style="flex:1;padding:4px;border:none;border-radius:5px;cursor:pointer;font-size:9px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);opacity:.6;transition:opacity .1s" onclick="p('importI')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.6">${t("importTitle")}</button>
</div>

<div class="note">${t("noDefault")}</div>

<script nonce="${n()}">const v=acquireVsCodeApi();function p(t,i,v2){v.postMessage({type:t,id:i,value:v2})}<\/script>
</body></html>`;
  }
}

// ── Activate ──

export function activate(ctx: vscode.ExtensionContext) {
  const side = new SidePanel(ctx);
  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider(SidePanel.vt, side, { webviewOptions: { retainContextWhenHidden: true } }));

  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.runDefault", runDef));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openSettings", () => vscode.commands.executeCommand("workbench.action.openSettings", K)));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setStatusBarProfile", () => pickProf(t("exec"), "statusBarProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setStartupProfile", () => pickProf(t("exec"), "startupProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setShortcutProfile", () => pickProf(t("exec"), "shortcutProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.exportProfiles", expProf));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.importProfiles", impProf));

  const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  sb.show(); ctx.subscriptions.push(sb);
  const upd = () => {
    const n = vscode.window.terminals.filter((t) => t.name.includes("CodeHub")).length;
    sb.text = n > 0 ? `$(terminal) CodeHub (${n})` : "$(terminal) CodeHub";
    sb.tooltip = t("statusTip"); sb.command = "codehub.runDefault";
  };
  upd();
  ctx.subscriptions.push(vscode.window.onDidOpenTerminal(upd));
  ctx.subscriptions.push(vscode.window.onDidCloseTerminal(() => { upd(); side.render(); }));
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(K)) { clearInstCache(); side.render(); } }));

  const delay = c().get<number>("startupDelay", 1200);
  if (c().get<string>("startupMode", "defaultProfile") !== "none") {
    setTimeout(() => { const p = findP(defId()); if (p) runProf(p); }, delay);
  }
}

export function deactivate() { openTerms.clear(); }
