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
  addProfile: _("Profil Ekle", "Add Profile"), noProfiles: _("Henüz profil yok.", "No profiles yet."),
  created: _("Profil oluşturuldu", "Profile created"), deleted: _("Profil silindi", "Profile deleted"),
  updated: _("Profil güncellendi", "Profile updated"), closeAll: _("Tümünü Kapat", "Close All"),
  profileList: _("Profiller", "Profiles"), first: _("En üstteki (ilk)", "Topmost (first)"),
  profileName: _("Profil adı", "Profile name"), shellType: _("Shell", "Shell"),
  exec: _("Çalıştır", "Executable"), args: _("Argümanlar", "Arguments"),
  edit: _("Düzenle", "Edit"), del: _("Sil", "Delete"), close: _("Kapat", "Close"),
  up: _("Yukarı", "Up"), down: _("Aşağı", "Down"),
  searchLib: _("Ara veya seç...", "Search or select..."),
  openIn: _("Açılacağı yer", "Open location"),
  cliOpt: _("Tam ekran terminal", "Fullscreen terminal"),
  desktopOpt: _("OpenCode Desktop (web)", "OpenCode Desktop (web)"),
  vscodeOpt: _("VSCode terminal paneli", "VSCode terminal panel"),
  serverWait: _("OpenCode sunucu başlatılıyor...", "Starting OpenCode server..."),
  serverErr: _("OpenCode CLI bulunamadı.", "OpenCode CLI not found."),
  exportTitle: _("Dışa Aktar", "Export"), importTitle: _("İçe Aktar", "Import"),
  exported: _("Profiller dışa aktarıldı", "Profiles exported"),
  imported: _("Profiller içe aktarıldı", "Profiles imported"),
  statusTip: _("CodeHub - En üstteki profili çalıştır", "CodeHub - Run top profile"),
  terminalCount: _("{n} terminal", "{n} terminals"),
  groups: { tr: "Yapay Zeka|Diller & Araçlar|Shell'ler", en: "AI Agents|Languages & Tools|Shells" },
};

function t(k: string): string {
  const l = vscode.workspace.getConfiguration("codehub").get<string>("language", "tr") === "en" ? "en" : "tr";
  return T[k]?.[l] ?? k;
}
function tg(k: string, i: number): string {
  const l = vscode.workspace.getConfiguration("codehub").get<string>("language", "tr") === "en" ? "en" : "tr";
  const v = T[k]?.[l] ?? k; return (v.split("|")[i] || v).trim();
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
function findP(id: string): Profile | undefined { return getP().find((x) => x.id === id); }
function profName(id: string): string { return id === "first" ? t("first") : findP(id)?.name || t("first"); }

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
  { group: "tools", name: "Rust (Cargo)", icon: "symbol-key", executable: "cargo", arguments: "", shell: "cmd", openIn: "vscode", category: "langs", checkCommand: "cargo --version", desc: "Rust build tool" },
  { group: "tools", name: "npm", icon: "package", executable: "npm", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "npm --version", desc: "Node package manager" },
  { group: "tools", name: "pnpm", icon: "package", executable: "pnpm", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "pnpm --version", desc: "Fast npm alternative" },
  { group: "tools", name: "yarn", icon: "package", executable: "yarn", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "yarn --version", desc: "Alternative npm client" },
  { group: "tools", name: "bun", icon: "zap", executable: "bun", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "bun --version", desc: "All-in-one JS/TS runtime" },
  { group: "tools", name: "pip", icon: "symbol-ruler", executable: "pip", arguments: "", shell: "cmd", openIn: "vscode", category: "pkgs", checkCommand: "pip --version", desc: "Python package installer" },
  { group: "tools", name: "Git", icon: "git-branch", executable: "git", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "git --version", desc: "Version control" },
  { group: "tools", name: "GitHub CLI", icon: "github", executable: "gh", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "gh --version", desc: "GitHub from terminal" },
  { group: "tools", name: "Docker", icon: "server-process", executable: "docker", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "docker --version", desc: "Container runtime" },
  { group: "tools", name: "kubectl", icon: "server", executable: "kubectl", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "kubectl version --client", desc: "Kubernetes CLI" },
  { group: "tools", name: "AWS CLI", icon: "cloud", executable: "aws", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "aws --version", desc: "Amazon Web Services CLI" },
  { group: "tools", name: "Azure CLI", icon: "cloud", executable: "az", arguments: "", shell: "cmd", openIn: "vscode", category: "tools", checkCommand: "az --version", desc: "Microsoft Azure CLI" },
  { group: "shells", name: "CMD Prompt", icon: "terminal-cmd", executable: "cmd.exe", arguments: "", shell: "cmd", openIn: "vscode", category: "shells", desc: "Windows Command Prompt" },
  { group: "shells", name: "PowerShell", icon: "terminal-powershell", executable: "powershell.exe", arguments: "", shell: "powershell", openIn: "vscode", category: "shells", desc: "Windows PowerShell" },
  { group: "shells", name: "PowerShell 7", icon: "terminal-powershell", executable: "pwsh.exe", arguments: "", shell: "powershell", openIn: "vscode", category: "shells", desc: "PowerShell 7 (cross-plat)" },
  { group: "shells", name: "Git Bash", icon: "terminal-bash", executable: "bash.exe", arguments: "", shell: "bash", openIn: "vscode", category: "shells", desc: "Git for Windows Bash" },
  { group: "shells", name: "WSL Ubuntu", icon: "terminal-linux", executable: "wsl.exe", arguments: "-d Ubuntu", shell: "wsl", openIn: "vscode", category: "shells", desc: "WSL Ubuntu Linux" },
];

function fromLib(l: LibEntry): Profile {
  return { id: genId(), name: l.name, icon: l.icon, executable: l.executable, arguments: l.arguments, shell: l.shell, openIn: l.openIn, category: l.category, checkCommand: l.checkCommand };
}

// ── Helpers ──

function resolveShell(p: Profile): string | undefined {
  const m: Record<string, string | undefined> = { powershell: "powershell.exe", cmd: "cmd.exe", wsl: "wsl.exe", bash: "bash", zsh: "zsh" };
  return p.shell === "custom" ? p.shellPath || undefined : m[p.shell];
}
function buildCmd(p: Profile): string { return [p.executable, p.arguments].filter(Boolean).join(" "); }
function isInst(exe: string): boolean {
  try { execSync(process.platform === "win32" ? `where ${exe.split(" ")[0]} 2>nul` : `command -v ${exe.split(" ")[0]} 2>/dev/null`, { encoding: "utf-8", timeout: 1500, windowsHide: true, stdio: "pipe" }); return true; } catch { return false; }
}

// Open terminals tracking
const openTerminals = new Map<string, vscode.Terminal>();

async function runProf(p: Profile) {
  const loc = p.openIn === "cli" ? { viewColumn: vscode.ViewColumn.One, preserveFocus: false } as const : undefined;
  const term = vscode.window.createTerminal({
    name: `${p.name} - CodeHub`,
    iconPath: new vscode.ThemeIcon(p.icon || "terminal"),
    location: loc,
    shellPath: resolveShell(p),
  });
  openTerminals.set(p.id, term);
  term.show();
  if (loc) await vscode.commands.executeCommand("workbench.action.closeEditorsInOtherGroups");
  const cmd = buildCmd(p);
  if (cmd.trim()) setTimeout(() => term.sendText(cmd.trim(), true), 800);
  const d = vscode.window.onDidCloseTerminal((t) => { if (t === term) { openTerminals.delete(p.id); d.dispose(); } });
}

function closeProf(id: string) {
  const term = openTerminals.get(id);
  if (term) { term.dispose(); openTerminals.delete(id); }
}

function runDef() { const p = findP(cfg().get<string>("defaultProfile", "") || topId()); if (p) runProf(p); }

async function pickProf(title: string, sk: string) {
  const items = [{ label: `$(chevron-up) ${t("first")}`, id: "first" }, ...getP().map((p) => ({ label: `$(${p.icon||"terminal"}) ${p.name}`, description: p.executable, id: p.id }))];
  const pick = await vscode.window.showQuickPick(items, { placeHolder: title }); if (pick) setA(sk, pick.id);
}

// ── Desktop ──

let desktopPanel: vscode.WebviewPanel | undefined;
const srvPorts = new Set<number>(); const SRV = "oc-server";
function getOC(): string { return cfg().get<string>("opencodePath", "opencode"); }
function isOC(): boolean { try { execSync(process.platform==="win32"?`where ${getOC().split(" ")[0]} 2>nul`:`command -v ${getOC().split(" ")[0]} 2>/dev/null`,{encoding:"utf-8",timeout:2000,windowsHide:true,stdio:"pipe"}); return true; } catch { return false; } }
function startSrv(port:number) {
  const t=vscode.window.createTerminal({name:SRV,iconPath:new vscode.ThemeIcon("server"),hideFromUser:true,env:{_CH_PORT:port.toString()}as any});
  t.sendText(`${getOC()} --port ${port}`); srvPorts.add(port);
  const d=vscode.window.onDidCloseTerminal((x)=>{if(x===t){srvPorts.delete(port);d.dispose();}});
}
async function openDesktop(ctx:vscode.ExtensionContext) {
  if(desktopPanel){desktopPanel.reveal(vscode.ViewColumn.Active,false);return;}
  if(!isOC()){const r=await vscode.window.showErrorMessage(t("serverErr"),t("settings"));if(r===t("settings"))vscode.commands.executeCommand("workbench.action.openSettings",`${K}.opencodePath`);return;}
  desktopPanel=vscode.window.createWebviewPanel("ch.desktop","OpenCode Desktop",vscode.ViewColumn.Beside,{enableScripts:true,retainContextWhenHidden:true});
  desktopPanel.webview.html=`<html><body style="display:flex;align-items:center;justify-content:center;height:100%;font-family:var(--vscode-font-family)"><div style="text-align:center"><div style="width:28px;height:28px;border:3px solid rgba(128,128,128,.3);border-top-color:var(--vscode-foreground);border-radius:50%;animation:spin .8s infinite;margin:0 auto 12px"></div><div style="opacity:.6">${t("serverWait")}</div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></body></html>`;
  desktopPanel.onDidDispose(()=>{desktopPanel=undefined;});
  const port=Math.floor(Math.random()*50000)+1024;startSrv(port);
  for(let i=0;i<40;i++){try{const r=await fetch(`http://localhost:${port}/app`);if(r.ok||r.status===404)break}catch{}try{const r=await fetch(`http://localhost:${port}`);if(r.ok||r.status===404)break}catch{}await new Promise((r)=>setTimeout(r,500));}
  if(!desktopPanel)return;
  desktopPanel.webview.html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';frame-src http://localhost:${port} https:"><style>*{margin:0;padding:0}html,body{height:100%;overflow:hidden}iframe{width:100%;height:100%;border:none}</style></head><body><iframe src="http://localhost:${port}"></iframe></body></html>`;
}

// ── Import/Export ──

async function expProf() {
  const uri=await vscode.window.showSaveDialog({filters:{"CodeHub Profiles":["json"]},defaultUri:vscode.Uri.file(`codehub-profiles-${new Date().toISOString().slice(0,10)}.json`)});
  if(!uri)return;try{vscode.workspace.fs.writeFile(uri,Buffer.from(JSON.stringify(getP(),null,2),"utf-8"));vscode.window.showInformationMessage(t("exported"));}catch{vscode.window.showErrorMessage("Export failed");}
}
async function impProf() {
  const uri=await vscode.window.showOpenDialog({filters:{"CodeHub Profiles":["json"]},canSelectMany:false});
  if(!uri||!uri.length)return;
  try{const d=JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri[0])))as Profile[];if(!Array.isArray(d))throw Error();d.forEach((p)=>{if(!p.id)p.id=genId();});setP(d);vscode.window.showInformationMessage(`${t("imported")} (${d.length})`);}catch{vscode.window.showErrorMessage("Import failed");}
}

// ── Dialogs ──

async function pickIcon(existing?:string):Promise<string|undefined>{
  const ch=await vscode.window.showQuickPick([{label:`$(close) Ikonsuz (Enter)`,id:"none"},{label:`$(symbol-color) Tema Ikonu`,id:"theme"}],{placeHolder:t("args")});
  if(!ch)return;if(ch.id==="none")return existing!==undefined?existing:"";
  const icons=["terminal","terminal-powershell","terminal-cmd","terminal-bash","terminal-linux","browser","globe","comment-discussion","git-branch","github","symbol-variable","symbol-ruler","symbol-key","symbol-misc","server","server-process","database","vm","cloud","lock","key","plug","tools","wrench","beaker","light-bulb","flame","star","heart","info","warning","error","check","pulse","graph","note","book","mortar-board","code","file-directory","folder","repo","package","rocket","zap","sync","refresh","play","debug","save","edit","trash","add","remove","search","home","pin","bell","mail","calendar","clock","person","organization","link","extensions","window","layout-sidebar-left","layout-panel","screen-full","terminal-view","debug-console","notebook","symbol-class","symbol-function","sparkle","wand","shield","verified","hubot","issue-opened","circuit-board"];
  const pick=await vscode.window.showQuickPick(icons.map((i)=>({label:`$(${i}) ${i}`,id:i})),{placeHolder:t("args")});return pick?.id;
}

async function profDlg(existing?:Profile):Promise<Profile|undefined>{
  const name=await vscode.window.showInputBox({prompt:t("profileName"),value:existing?.name||"",placeHolder:"Claude Code"});if(name===undefined)return;
  const icon=await pickIcon(existing?.icon);if(icon===undefined)return;
  const exec=await vscode.window.showInputBox({prompt:t("exec"),value:existing?.executable||"",placeHolder:"claude, node, git"});if(exec===undefined)return;
  const args=await vscode.window.showInputBox({prompt:t("args"),value:existing?.arguments||"",placeHolder:"--version, run dev"});if(args===undefined)return;
  const sp=await vscode.window.showQuickPick([{label:"$(terminal-cmd) CMD",id:"cmd"},{label:"$(terminal-powershell) PowerShell",id:"powershell"},{label:"$(terminal-linux) WSL",id:"wsl"},{label:"$(terminal-bash) Bash",id:"bash"},{label:"$(terminal-bash) Zsh",id:"zsh"},{label:"$(tools) Custom",id:"custom"}],{placeHolder:t("shellType")});if(!sp)return;
  const shell=sp.id as Profile["shell"];let shellPath:string|undefined;
  if(shell==="custom"){const p=await vscode.window.showInputBox({prompt:"Custom shell path",value:existing?.shellPath||""});if(p===undefined)return;shellPath=p||undefined;}
  const op=await vscode.window.showQuickPick([{label:"$(terminal) "+t("cliOpt"),id:"cli"},{label:"$(browser) "+t("desktopOpt"),id:"desktop"},{label:"$(terminal-powershell) "+t("vscodeOpt"),id:"vscode"}],{placeHolder:t("openIn")});if(!op)return;
  return{id:existing?.id||genId(),name,icon:icon||undefined,executable:exec,arguments:args,shell,shellPath,openIn:op.id as"cli"|"desktop"|"vscode"};
}

async function pickLib():Promise<Profile|undefined>{
  const groups=["ai","tools","shells"];const items:any[]=[];
  groups.forEach((g,i)=>{items.push({label:tg("groups",i),kind:vscode.QuickPickItemKind.Separator});items.push(...LIB.filter((l)=>l.group===g).map((l)=>({label:`$(${l.icon}) ${l.name}`,description:`${l.executable} ${l.arguments}`.trim(),detail:`${l.desc} \u2022 ${l.shell}`,lib:l})));});
  const pick=await vscode.window.showQuickPick(items,{placeHolder:t("searchLib"),matchOnDescription:true,matchOnDetail:true});return pick?fromLib(pick.lib):undefined;
}

// ── Side Panel ──

class SidePanel implements vscode.WebviewViewProvider {
  static vt="codehub.sidePanel";private v?:vscode.WebviewView;
  constructor(private ctx:vscode.ExtensionContext){}

  resolveWebviewView(vw:vscode.WebviewView){this.v=vw;vw.webview.options={enableScripts:true};this.render();vw.onDidDispose(()=>{this.v=undefined;});
    vw.webview.onDidReceiveMessage(async(m)=>{
      if(m.type==="run"){const p=findP(m.id);if(p){if(p.openIn==="desktop")openDesktop(this.ctx);else await runProf(p);}this.render();return;}
      if(m.type==="closeProf"){closeProf(m.id);this.render();return;}
      if(m.type==="closeAll"){vscode.window.terminals.filter((t)=>t.name.includes("CodeHub")||t.name===SRV).forEach((t)=>t.dispose());openTerminals.clear();srvPorts.clear();this.render();return;}
      if(m.type==="addLib"){const l=await pickLib();if(!l){this.render();return;}const list=getP();list.push(l);setP(list);this.render();vscode.window.showInformationMessage(`${t("created")}: ${l.name}`);return;}
      if(m.type==="add"){const r=await profDlg();if(!r){this.render();return;}const list=getP();list.push(r);setP(list);this.render();vscode.window.showInformationMessage(`${t("created")}: ${r.name}`);return;}
      if(m.type==="edit"){const list=getP();const i=list.findIndex((x)=>x.id===m.id);if(i<0)return;const u=await profDlg(list[i]);if(!u){this.render();return;}list[i]=u;setP(list);this.render();vscode.window.showInformationMessage(t("updated"));return;}
      if(m.type==="delete"){setP(getP().filter((x)=>x.id!==m.id));if(cfg().get<string>("defaultProfile","")===m.id)cfg().update("defaultProfile","",vscode.ConfigurationTarget.Global);this.render();vscode.window.showInformationMessage(t("deleted"));return;}
      if(m.type==="up"||m.type==="down"){const list=getP();const i=list.findIndex((x)=>x.id===m.id);if(i<0)return;const j=m.type==="up"?i-1:i+1;if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];setP(list);this.render();return;}
      if(m.type==="reorder"){const list=getP();const i=list.findIndex((x)=>x.id===m.id);if(i<0)return;const to=Math.max(0,Math.min(list.length-1,(parseInt(m.value)||1)-1));const item=list.splice(i,1)[0];list.splice(to,0,item);setP(list);this.render();return;}
      if(m.type==="searchLib"){const l=await pickLib();if(!l){this.render();return;}const list=getP();list.push(l);setP(list);this.render();vscode.window.showInformationMessage(`${t("created")}: ${l.name}`);return;}
      if(m.type==="settings"){vscode.commands.executeCommand("workbench.action.openSettings",K);return;}
      if(m.type==="exportI"){await expProf();return;}if(m.type==="importI"){await impProf();this.render();return;}
    });
  }

  render(){if(this.v)this.v.webview.html=this.html();}

  private html():string{
    const list=getP();const lang=cfg().get<string>("language","tr")==="en"?"en":"tr";
    const tc=vscode.window.terminals.filter((t)=>t.name.includes("CodeHub")).length;
    const n=()=>{const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";let r="";for(let i=0;i<32;i++)r+=c[Math.floor(Math.random()*c.length)];return r;};
    const esc=(s:string)=>s.replace(/[&<>"']/g,(m)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[m]||m);

    const rows=list.map((p,idx)=>{
      const first=idx===0;const last=idx===list.length-1;
      const isOpen=openTerminals.has(p.id);
      const installed=isInst(p.executable);
      const icon=p.icon?`<span class="ic codicon codicon-${esc(p.icon)}"></span>`:`<span class="ic-s">${p.name[0].toUpperCase()}</span>`;
      return `<div class="cr">
        <input class="on" type="number" value="${idx+1}" min="1" max="${list.length}" onchange="p('reorder','${p.id}',this.value)">
        <span class="cb ${installed?"play":"na"}" onclick="p('run','${p.id}')">${icon}${!installed?`<span class="ndot"></span>`:""}${isOpen?`<span class="odot"></span>`:""}</span>
        <div class="cn" onclick="p('run','${p.id}')">
          <span class="cn-t">${esc(p.name)}</span>
          <span class="cn-s">${esc(buildCmd(p))}</span>
        </div>
        <div class="ca">
          ${isOpen?`<button class="b b-cls" onclick="p('closeProf','${p.id}')" title="${t("close")}">\u2716</button>`:""}
          <button class="b" onclick="p('edit','${p.id}')" title="${t("edit")}">\u270E</button>
          <button class="b b-del" onclick="p('delete','${p.id}')" title="${t("del")}">\u2716</button>
          <button class="b b-up ${first?"lim":""}" onclick="p('up','${p.id}')" ${first?"disabled":""} title="${t("up")}">\u25B2</button>
          <button class="b b-dn ${last?"lim":""}" onclick="p('down','${p.id}')" ${last?"disabled":""} title="${t("down")}">\u25BC</button>
        </div>
      </div>`;
    }).join("");

    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"/><style>
*{margin:0;padding:0;box-sizing:border-box}
body{padding:12px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);line-height:1.4}
.tb{display:flex;align-items:center;gap:6px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid color-mix(in srgb,var(--vscode-foreground) 8%,transparent)}
.tb .ti{font-size:13px;font-weight:600;flex:1}
.tb .ib{width:26px;height:26px;border:none;border-radius:5px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;background:transparent;color:var(--vscode-foreground);opacity:.5;transition:all .1s}
.tb .ib:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground);transform:scale(1.1)}
.cr{display:flex;align-items:center;gap:4px;padding:6px 6px;border-radius:7px;margin:3px 0;border:1px solid transparent;transition:border-color .1s}
.cr:hover{border-color:color-mix(in srgb,var(--vscode-foreground) 12%,transparent)}
.on{width:24px;height:20px;border-radius:4px;border:1px solid color-mix(in srgb,var(--vscode-foreground) 15%,transparent);background:transparent;color:var(--vscode-foreground);text-align:center;font-size:10px;font-weight:600;flex-shrink:0}
.on:focus{border-color:var(--vscode-focusBorder);outline:none}
.cb{width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;transition:all .12s;position:relative}
.cb.play{background:color-mix(in srgb,var(--vscode-button-background) 12%,transparent);color:var(--vscode-button-background)}
.cb.play:hover{background:var(--vscode-button-background);color:var(--vscode-button-foreground);transform:scale(1.06)}
.cb.na{opacity:.25}.cb.na:hover{opacity:.5;transform:scale(1.04)}
.ndot,.odot{position:absolute;top:2px;right:2px;width:6px;height:6px;border-radius:50%}
.ndot{background:var(--vscode-errorForeground);opacity:.5}
.odot{background:var(--vscode-testing-iconPassed)}
.ic{font-size:16px}.ic-s{font-size:10px;font-weight:700;opacity:.4}
.cn{flex:1;min-width:0;cursor:pointer;padding:2px 4px;border-radius:4px}
.cn:hover{background:var(--vscode-list-hoverBackground)}
.cn-t{font-size:13px;font-weight:500;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cn-s{font-size:10px;opacity:.35;display:block;margin-top:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ca{display:flex;gap:2px;flex-shrink:0;align-items:center}
.b{width:20px;height:20px;border:none;border-radius:4px;cursor:pointer;font-size:9px;background:transparent;color:var(--vscode-foreground);opacity:.2;display:flex;align-items:center;justify-content:center;padding:0;transition:all .1s}
.b:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground);transform:scale(1.1)}
.b-del:hover{color:var(--vscode-errorForeground);opacity:1}
.b-cls{opacity:.5;color:var(--vscode-testing-iconPassed)}.b-cls:hover{opacity:1;color:var(--vscode-errorForeground)}
.b-up.lim{color:var(--vscode-errorForeground);opacity:.4;cursor:default}
.b-dn.lim{color:var(--vscode-errorForeground);opacity:.4;cursor:default}
.b-up:not(.lim):hover{color:var(--vscode-testing-iconPassed);opacity:1}
.b-dn:not(.lim):hover{color:var(--vscode-testing-iconPassed);opacity:1}
.b:disabled{pointer-events:none}
.emp{padding:24px 16px;text-align:center;font-size:12px;opacity:.3;line-height:1.5}
</style></head><body>
<div class="tb">
  <span class="ti">CodeHub</span>
  <button class="ib" onclick="p('searchLib')" title="${t("searchLib")}">\u2795</button>
  <button class="ib" onclick="p('settings')" title="${t("settings")}">\u2699</button>
</div>

${list.length > 0 ? rows : `<div class="emp">${t("noProfiles")}</div>`}

<div style="display:flex;gap:3px;margin-top:4px">
  <button style="flex:1;padding:5px;border:1px dashed color-mix(in srgb,var(--vscode-foreground) 15%,transparent);border-radius:5px;cursor:pointer;font-size:10px;background:transparent;color:var(--vscode-foreground);opacity:.5;transition:opacity .1s" onclick="p('add')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.5">+ ${t("addProfile")}</button>
  <button style="padding:5px;border:1px dashed color-mix(in srgb,var(--vscode-foreground) 15%,transparent);border-radius:5px;cursor:pointer;font-size:10px;background:transparent;color:var(--vscode-foreground);opacity:.5;transition:opacity .1s" onclick="p('addLib')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.5" title="${t("addFromLib")}">\u{1F4CB}</button>
</div>

<div style="display:flex;gap:3px;margin-top:8px">
  <button style="flex:1;padding:4px;border:none;border-radius:5px;cursor:pointer;font-size:9px;background:color-mix(in srgb,var(--vscode-errorForeground) 8%,transparent);color:var(--vscode-errorForeground);opacity:.6;transition:opacity .1s" onclick="p('closeAll')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.6">${t("closeAll")}</button>
  <button style="flex:1;padding:4px;border:none;border-radius:5px;cursor:pointer;font-size:9px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);opacity:.6;transition:opacity .1s" onclick="p('exportI')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.6">${t("exportTitle")}</button>
  <button style="flex:1;padding:4px;border:none;border-radius:5px;cursor:pointer;font-size:9px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);opacity:.6;transition:opacity .1s" onclick="p('importI')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.6">${t("importTitle")}</button>
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
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setStatusBarProfile", () => pickProf(t("exec"), "statusBarProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setStartupProfile", () => pickProf(t("args"), "startupProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setShortcutProfile", () => pickProf(t("args"), "shortcutProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.exportProfiles", expProf));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.importProfiles", impProf));

  const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  sb.show(); ctx.subscriptions.push(sb);
  const upd = () => { const n = vscode.window.terminals.filter((t) => t.name.includes("CodeHub")).length; sb.text = n > 0 ? `$(terminal) CodeHub (${n})` : "$(terminal) CodeHub"; sb.command = "codehub.runDefault"; };
  upd();
  ctx.subscriptions.push(vscode.window.onDidOpenTerminal(upd));
  ctx.subscriptions.push(vscode.window.onDidCloseTerminal(() => { upd(); side.render(); }));
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(K)) side.render(); }));

  const delay = cfg().get<number>("startupDelay", 1200);
  if (cfg().get<string>("startupMode", "defaultProfile") !== "none") {
    setTimeout(() => { const p = findP(getA("startupProfile") === "first" ? topId() : getA("startupProfile")); if (p) runProf(p); else runDef(); }, delay);
  }
}

export function deactivate() { srvPorts.clear(); }
