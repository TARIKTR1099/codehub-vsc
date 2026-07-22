import * as vscode from "vscode";
import { execSync } from "child_process";

// ── Types ──

interface Profile {
  id: string; name: string; icon?: string;
  executable: string; arguments: string;
  shell: "powershell" | "cmd" | "wsl" | "bash" | "zsh" | "custom";
  shellPath?: string; category?: string; checkCommand?: string; cwd?: string;
}

interface LibEntry {
  name: string; icon: string; executable: string; arguments: string;
  shell: Profile["shell"]; category: string; checkCommand?: string; desc: string;
  isDesktop?: boolean; isOpencode?: boolean;
}

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
  dir: _("Klasör", "Directory"),
  edit: _("Düzenle", "Edit"), del: _("Sil", "Delete"), close: _("Kapat", "Close"),
  up: _("Yukarı", "Up"), down: _("Aşağı", "Down"),
  searchLib: _("Ara veya seç...", "Search or select..."),
  exportTitle: _("Dışa Aktar", "Export"), importTitle: _("İçe Aktar", "Import"),
  exported: _("Profiller dışa aktarıldı", "Profiles exported"),
  imported: _("Profiller içe aktarıldı", "Profiles imported"),
  statusTip: _("CodeHub - En üstteki profili çalıştır", "CodeHub - Run topmost profile"),
  terminalCount: _("{n} terminal", "{n} terminals"),
  defaultCleared: _("Varsayılan sıfırlandı", "Default cleared"),
  noDefault: _("Varsayılan yok — en üstteki kullanılır", "No default — topmost used"),
  emptyDefault: _("★ ile varsayılan yapın", "Tap ★ to set default"),
  duplicate: _("Kopyala", "Duplicate"),
  ready: _("Hazır", "Ready"),
  confirmCloseAllQ: _("Tüm terminalleri kapat?", "Close all terminals?"),
  yes: _("Evet", "Yes"), no: _("Hayır", "No"),
  profileDuplicated: _("Kopyalandı: {name}", "Duplicated: {name}"),
  pickIconTitle: _("İkon seçin (Enter=atla)", "Pick icon (Enter=skip)"),
  noIconChosen: _("İkonsuz devam", "No icon"),
  searchLibIcon: _("Tema ikonu seç", "Pick theme icon"),
  openInEdit: _("Açılış şekli", "Open mode"),
  cliOpt: _("Tam terminal", "Full terminal"),
  vsOpt: _("VSCode terminal", "VSCode terminal"),
  deskOpt: _("Desktop panel", "Desktop panel"),
  addFile: _("Dosya ekle", "Add file"),
  opencodeLaunch: _("OpenCode başlatılıyor...", "Launching OpenCode..."),
  serverWait: _("OpenCode sunucu başlatılıyor...", "Starting OpenCode server..."),
  serverErr: _("OpenCode CLI bulunamadı", "OpenCode CLI not found"),
  fileAdded: _("Dosya eklendi", "File added"),
};

function t(k: string): string {
  return T[k]?.[vscode.workspace.getConfiguration("codehub").get<string>("language","tr")==="en"?"en":"tr"]??k;
}

const K = "codehub";
function c() { return vscode.workspace.getConfiguration(K); }
function getP(): Profile[] { return c().get<Profile[]>("terminalProfiles", []); }
function setP(p: Profile[]) { c().update("terminalProfiles", p, vscode.ConfigurationTarget.Global); }
function gid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function defId(): string { const d = c().get<string>("defaultProfile",""); if(d&&getP().some((p)=>p.id===d))return d;return""; }
function topId(): string { const l = getP(); return l.length?l[0].id:""; }
function findP(id:string): Profile|undefined { return getP().find((x)=>x.id===id); }
function realDefId(): string { return defId()||topId(); }

// ── Library ──

const LIB: LibEntry[] = [
  { name: "OpenCode CLI", icon: "terminal", executable: "opencode", arguments: "--port", shell: "cmd", category: "ai", isOpencode: true, desc: "OpenCode AI CLI (resmi)" },
  { name: "OpenCode Desktop", icon: "browser", executable: "opencode", arguments: "", shell: "cmd", category: "ai", isDesktop: true, desc: "OpenCode web panel (iframe)" },
  { name: "OpenCode VSCode", icon: "terminal-powershell", executable: "opencode", arguments: "", shell: "cmd", category: "ai", desc: "OpenCode VS Code terminal" },
  { name: "Claude Code", icon: "comment-discussion", executable: "claude", arguments: "", shell: "cmd", category: "ai", checkCommand: "claude --version", desc: "Anthropic AI coding agent" },
  { name: "Codex CLI", icon: "symbol-ruler", executable: "codex", arguments: "", shell: "cmd", category: "ai", checkCommand: "codex --version", desc: "OpenAI coding agent CLI" },
  { name: "Kilo CLI", icon: "terminal", executable: "kilo", arguments: "", shell: "cmd", category: "ai", checkCommand: "kilo --version", desc: "500+ model AI agent CLI" },
  { name: "Gemini CLI", icon: "sparkle", executable: "gemini", arguments: "", shell: "cmd", category: "ai", checkCommand: "gemini --version", desc: "Google Gemini CLI" },
  { name: "Aider", icon: "tools", executable: "aider", arguments: "--model sonnet", shell: "cmd", category: "ai", checkCommand: "aider --version", desc: "AI pair programming CLI" },
  { name: "GitHub Copilot CLI", icon: "github", executable: "copilot", arguments: "", shell: "cmd", category: "ai", checkCommand: "copilot --version", desc: "GitHub Copilot in terminal" },
  { name: "Amazon Q", icon: "cloud", executable: "q", arguments: "", shell: "cmd", category: "ai", checkCommand: "q --version", desc: "AWS AI coding agent CLI" },
  { name: "Goose", icon: "star", executable: "goose", arguments: "", shell: "cmd", category: "ai", checkCommand: "goose --version", desc: "Block AI coding agent" },
  { name: "Kiro CLI", icon: "terminal", executable: "kiro-cli", arguments: "chat", shell: "cmd", category: "ai", checkCommand: "kiro-cli --version", desc: "Kiro interactive AI CLI" },
  { name: "Cline", icon: "terminal", executable: "cline", arguments: "", shell: "cmd", category: "ai", desc: "VS Code AI coding agent" },
  { name: "Roo Code", icon: "terminal", executable: "roo", arguments: "", shell: "cmd", category: "ai", desc: "VS Code AI coding agent" },
];

function fromLib(l: LibEntry): Profile {
  return { id: gid(), name: l.name, icon: l.icon, executable: l.executable, arguments: l.arguments, shell: l.shell, category: l.category, checkCommand: l.checkCommand };
}

// ── Helpers ──

function shellPath(p: Profile): string|undefined {
  const m: Record<string,string|undefined>={powershell:"powershell.exe",cmd:"cmd.exe",wsl:"wsl.exe",bash:"bash",zsh:"zsh"};
  return p.shell==="custom"?p.shellPath||undefined:m[p.shell];
}
function buildCmd(p: Profile): string { return [p.executable, p.arguments].filter(Boolean).join(" "); }
function fallbackIcon(name: string): string { return name.charAt(0).toUpperCase(); }

const _instCache = new Map<string,boolean>();
function isInst(exe:string):boolean{
  const c=_instCache.get(exe);if(c!==undefined)return c;
  try{execSync(process.platform==="win32"?`where ${exe.split(" ")[0]} 2>nul`:`command -v ${exe.split(" ")[0]} 2>/dev/null`,{encoding:"utf-8",timeout:1500,windowsHide:true,stdio:"pipe"});_instCache.set(exe,true);return true;}catch{_instCache.set(exe,false);return false;}
}
function clearInstCache(){_instCache.clear();}

const openTerms = new Map<string,vscode.Terminal>();

// ── Official OpenCode Terminal (replicating SDK behavior) ──

async function openOpencodeTerminal(ctx: vscode.ExtensionContext) {
  const existing = vscode.window.terminals.find((t) => t.name === "opencode");
  if (existing) { existing.show(); return; }
  const port = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384;
  const term = vscode.window.createTerminal({
    name: "opencode",
    iconPath: {
      light: vscode.Uri.file(ctx.asAbsolutePath("media/mark-dark.svg")),
      dark: vscode.Uri.file(ctx.asAbsolutePath("media/mark-light.svg")),
    },
    location: { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    env: { _EXTENSION_OPENCODE_PORT: port.toString(), OPENCODE_CALLER: "vscode" },
  });
  term.show();
  term.sendText(`opencode --port ${port}`);
  // Track this terminal
  openTerms.set("opencode-cli", term);
  const d = vscode.window.onDidCloseTerminal((t) => { if (t === term) { openTerms.delete("opencode-cli"); d.dispose(); } });
  // Wait for server and add active file reference
  let tries = 10; let connected = false;
  do {
    await new Promise((r) => setTimeout(r, 200));
    try { const r = await fetch(`http://localhost:${port}/app`); if (r.ok) { connected = true; break; } } catch {}
    tries--;
  } while (tries > 0);
  if (connected) {
    const ref = getActiveFileRef();
    if (ref) { await appendPrompt(port, ref); term.show(); }
  }
}

async function appendPrompt(port: number, text: string) {
  try { await fetch(`http://localhost:${port}/tui/append-prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }); } catch {}
}

function getActiveFileRef(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const doc = editor.document;
  const wf = vscode.workspace.getWorkspaceFolder(doc.uri);
  if (!wf) return;
  const rel = vscode.workspace.asRelativePath(doc.uri);
  let ref = `@${rel}`;
  const sel = editor.selection;
  if (!sel.isEmpty) {
    const s = sel.start.line + 1, e = sel.end.line + 1;
    ref += s === e ? `#L${s}` : `#L${s}-${e}`;
  }
  return ref;
}

async function addFileToOpencode() {
  const term = vscode.window.terminals.find((t) => t.name === "opencode");
  if (!term) return;
  const ref = getActiveFileRef();
  if (!ref) return;
  try {
    const port = (term as any).creationOptions?.env?.["_EXTENSION_OPENCODE_PORT"];
    if (port) await appendPrompt(parseInt(port), ref);
    else term.sendText(ref, false);
    term.show();
    vscode.window.showInformationMessage(t("fileAdded"));
  } catch {}
}

// ── Generic Profile Runner ──

async function runProf(p: Profile) {
  const existing = openTerms.get(p.id);
  if (existing && c().get<boolean>("reuseTerminal", true) && !c().get<boolean>("alwaysNewTerminal", false)) { existing.show(true); return; }
  try {
    const opts: vscode.TerminalOptions = {
      name: `${p.name} - CodeHub`, iconPath: new vscode.ThemeIcon(p.icon || "terminal"),
      location: { viewColumn: vscode.ViewColumn.One, preserveFocus: false } as const, shellPath: shellPath(p),
      env: { CODEHUB_VSCODE: "1", CODEHUB_PROFILE: p.id } as any,
    };
    if (p.cwd) opts.cwd = vscode.Uri.file(p.cwd);
    const term = vscode.window.createTerminal(opts); openTerms.set(p.id, term); term.show();
    await vscode.commands.executeCommand("workbench.action.closeEditorsInOtherGroups");
    const cmd = buildCmd(p);
    if (cmd.trim()) setTimeout(() => term.sendText(cmd.trim(), true), 800);
    const d = vscode.window.onDidCloseTerminal((t) => { if (t === term) { openTerms.delete(p.id); d.dispose(); } });
  } catch (e) { vscode.window.showErrorMessage(`CodeHub: ${p.name} başlatılamadı`); }
}

function closeProf(id:string){const t=openTerms.get(id);if(t){t.dispose();openTerms.delete(id);}}
function runDef(){const id=realDefId();const p=findP(id);if(p)runProf(p);}

async function pickProf(title:string,sk:string){
  const cur=c().get<string>(sk,"first");
  const items=[{label:`$(chevron-up) ${t("first")} ${cur==="first"?" \u25C8":""}`,id:"first"},...getP().map((p)=>({label:`$(${p.icon||"terminal"}) ${p.name} ${cur===p.id?"\u25C8":""}`,description:`${buildCmd(p)} \u2022 ${p.shell}`,id:p.id}))];
  const pick=await vscode.window.showQuickPick(items,{placeHolder:title,matchOnDescription:true});if(pick)c().update(sk,pick.id,vscode.ConfigurationTarget.Global);
}

// ── Desktop Panel ──

let desktopPanel: vscode.WebviewPanel|undefined;
const srvPorts = new Set<number>(); const SRV = "oc-server";
function getOC(): string { return c().get<string>("opencodePath","opencode"); }
function isOC(): boolean { try{execSync(process.platform==="win32"?`where ${getOC().split(" ")[0]} 2>nul`:`command -v ${getOC().split(" ")[0]} 2>/dev/null`,{encoding:"utf-8",timeout:2000,windowsHide:true,stdio:"pipe"});return true;}catch{return false;} }
function startSrv(port:number){
  const t=vscode.window.createTerminal({name:SRV,iconPath:new vscode.ThemeIcon("server"),hideFromUser:true,env:{_CH_PORT:port.toString()}as any});
  t.sendText(`${getOC()} --port ${port}`);srvPorts.add(port);
  const d=vscode.window.onDidCloseTerminal((x)=>{if(x===t){srvPorts.delete(port);d.dispose();}});
}
async function openDesktop(ctx:vscode.ExtensionContext){
  if(desktopPanel){desktopPanel.reveal(vscode.ViewColumn.Active,false);return;}
  if(!isOC()){vscode.window.showWarningMessage(t("serverErr"));return;}
  desktopPanel=vscode.window.createWebviewPanel("ch.desktop","OpenCode Desktop",vscode.ViewColumn.Beside,{enableScripts:true,retainContextWhenHidden:true});
  desktopPanel.webview.html=`<html><body style="display:flex;align-items:center;justify-content:center;height:100%"><div style="text-align:center"><div class="sp" style="width:28px;height:28px;border:3px solid rgba(128,128,128,.3);border-top-color:var(--vscode-foreground);border-radius:50%;animation:spin .8s infinite;margin:0 auto 12px"></div><div style="opacity:.6">${t("serverWait")}</div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></body></html>`;
  desktopPanel.onDidDispose(()=>{desktopPanel=undefined;});
  const port=Math.floor(Math.random()*50000)+1024;startSrv(port);
  for(let i=0;i<40;i++){try{const r=await fetch(`http://localhost:${port}/app`);if(r.ok||r.status===404)break}catch{}try{const r=await fetch(`http://localhost:${port}`);if(r.ok||r.status===404)break}catch{}await new Promise((r)=>setTimeout(r,500));}
  if(!desktopPanel)return;
  desktopPanel.webview.html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';frame-src http://localhost:${port} https:"><style>*{margin:0;padding:0}html,body{height:100%;overflow:hidden}iframe{width:100%;height:100%;border:none}</style></head><body><iframe src="http://localhost:${port}"></iframe></body></html>`;
}

// ── Import/Export ──

async function expProf() {
  const uri=await vscode.window.showSaveDialog({filters:{"CodeHub Profiles":["json"]},defaultUri:vscode.Uri.file(`codehub-${new Date().toISOString().slice(0,10)}.json`)});
  if(!uri)return;try{vscode.workspace.fs.writeFile(uri,Buffer.from(JSON.stringify(getP(),null,2),"utf-8"));vscode.window.showInformationMessage(t("exported"));}catch{vscode.window.showErrorMessage("Export failed");}
}
async function impProf() {
  const uri=await vscode.window.showOpenDialog({filters:{"CodeHub Profiles":["json"]},canSelectMany:false});
  if(!uri||!uri.length)return;
  try{
    const d=JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri[0])));
    if(!Array.isArray(d))throw Error();
    const profiles: Profile[]=d.map((p:any)=>{
      if(!p.id)p.id=gid();
      if(!p.executable&&p.commands?.length){const parts=p.commands[0].split(" ");p.executable=parts[0];p.arguments=parts.slice(1).join(" ");}
      if(!p.executable)p.executable="opencode";if(!p.arguments)p.arguments="";
      return p as Profile;
    });
    setP(profiles);vscode.window.showInformationMessage(`${t("imported")} (${profiles.length})`);
  }catch{vscode.window.showErrorMessage("Import failed");}
}

// ── Dialogs ──

async function pickIcon(existing?:string):Promise<string|undefined>{
  const ch=await vscode.window.showQuickPick([
    {label:`$(close) ${t("pickIconTitle")}`,id:"none"},
    {label:`$(symbol-color) ${t("searchLibIcon")}`,id:"theme"},
  ],{placeHolder:t("searchLib")});
  if(!ch)return;if(ch.id==="none")return existing!==undefined?existing:"";
  const icons=["terminal","terminal-powershell","terminal-cmd","terminal-bash","terminal-linux","browser","comment-discussion","git-branch","github","symbol-variable","symbol-ruler","symbol-key","server","server-process","database","cloud","tools","beaker","light-bulb","flame","star","rocket","zap","sync","play","debug","package","code","sparkle","wand","shield","hubot","organization","link","extensions","globe"];
  const pick=await vscode.window.showQuickPick(icons.map((i)=>({label:`$(${i}) ${i}`,id:i})),{placeHolder:t("searchLib")});return pick?.id;
}

async function profDlg(existing?:Profile):Promise<Profile|undefined>{
  const name=await vscode.window.showInputBox({prompt:t("profileName"),value:existing?.name||"",placeHolder:"OpenCode CLI",ignoreFocusOut:true});if(name===undefined)return;
  const icon=await pickIcon(existing?.icon);if(icon===undefined)return;
  const exec=await vscode.window.showInputBox({prompt:t("exec"),value:existing?.executable||"",placeHolder:"opencode, claude, node",ignoreFocusOut:true});if(exec===undefined)return;
  const args=await vscode.window.showInputBox({prompt:t("args"),value:existing?.arguments||"",placeHolder:"--port 8080, run dev",ignoreFocusOut:true});if(args===undefined)return;
  const sp=await vscode.window.showQuickPick([
    {label:"$(terminal-cmd) CMD",id:"cmd"},{label:"$(terminal-powershell) PowerShell",id:"powershell"},
    {label:"$(terminal-linux) WSL",id:"wsl"},{label:"$(terminal-bash) Bash",id:"bash"},
    {label:"$(terminal-bash) Zsh",id:"zsh"},{label:"$(tools) Custom",id:"custom"},
  ],{placeHolder:t("shellType"),ignoreFocusOut:true});if(!sp)return;
  const shell=sp.id as Profile["shell"];let shellPath:string|undefined;
  if(shell==="custom"){const p=await vscode.window.showInputBox({prompt:"Custom shell path",value:existing?.shellPath||"",ignoreFocusOut:true});if(p===undefined)return;shellPath=p||undefined;}
  const cwd=await vscode.window.showInputBox({prompt:t("dir")+" (opsiyonel)",value:existing?.cwd||"",placeHolder:"C:\\Projects",ignoreFocusOut:true});if(cwd===undefined)return;
  const openPick=await vscode.window.showQuickPick([
    {label:`$(terminal) ${t("cliOpt")}`,id:"cli"},{label:`$(terminal-powershell) ${t("vsOpt")}`,id:"vscode"},{label:`$(browser) ${t("deskOpt")}`,id:"desktop"},
  ],{placeHolder:t("openInEdit"),ignoreFocusOut:true});if(!openPick)return;
  return{id:existing?.id||gid(),name,icon:icon||undefined,executable:exec,arguments:args,shell,shellPath,cwd:cwd||undefined};
}

async function pickLib():Promise<Profile|undefined>{
  const items:any[]=[
    {label:"AI Kodlama Araçları / AI Coding Agents",kind:vscode.QuickPickItemKind.Separator},
    ...LIB.map((l)=>({label:`$(${l.icon}) ${l.name}`,description:`${l.executable} ${l.arguments}`.trim(),detail:l.desc,lib:l})),
  ];
  const pick=await vscode.window.showQuickPick(items,{placeHolder:t("searchLib"),matchOnDescription:true,matchOnDetail:true});
  return pick?fromLib(pick.lib):undefined;
}

// ── Side Panel ──

class SidePanel implements vscode.WebviewViewProvider {
  static vt="codehub.sidePanel";private v?:vscode.WebviewView;
  constructor(private ctx:vscode.ExtensionContext){}

  resolveWebviewView(vw:vscode.WebviewView){this.v=vw;vw.webview.options={enableScripts:true};this.render();vw.onDidDispose(()=>{this.v=undefined;});
    vw.webview.onDidReceiveMessage(async(m)=>{
      if(m.type==="run"){const p=findP(m.id);if(p)await runProf(p);this.render();return;}
      if(m.type==="runOC"){
        const oc=await vscode.window.showQuickPick([
          {label:"$(terminal) OpenCode CLI (yan panel)",id:"cli"},
          {label:"$(browser) OpenCode Desktop (iframe)",id:"desktop"},
          {label:"$(terminal-powershell) OpenCode VSCode (panel)",id:"vscode"},
        ],{placeHolder:t("opencodeLaunch")});
        if(!oc)return;
        if(oc.id==="cli"){await openOpencodeTerminal(this.ctx);}
        else if(oc.id==="desktop"){openDesktop(this.ctx);}
        else if(oc.id==="vscode"){const term=vscode.window.createTerminal({name:"opencode",iconPath:new vscode.ThemeIcon("terminal"),shellPath:"cmd.exe"});term.show();term.sendText("opencode");}
        this.render();return;
      }
      if(m.type==="closeProf"){closeProf(m.id);this.render();return;}
      if(m.type==="closeAll"||m.type==="confirmCloseAll"){
        if(!c().get<boolean>("skipConfirmations",true)){const r=await vscode.window.showQuickPick([t("yes"),t("no")],{placeHolder:t("confirmCloseAllQ")});if(r!==t("yes")){this.render();return;}}
        vscode.window.terminals.forEach((t)=>{if(t.name.includes("CodeHub")||t.name==="opencode"||t.name==="oc-server")t.dispose()});openTerms.clear();srvPorts.clear();this.render();return;
      }
      if(m.type==="addLib"){const l=await pickLib();if(!l){this.render();return;}const list=getP();list.push(l);setP(list);this.render();vscode.window.showInformationMessage(`${t("created")}: ${l.name}`);return;}
      if(m.type==="add"){const r=await profDlg();if(!r){this.render();return;}const list=getP();list.push(r);setP(list);this.render();vscode.window.showInformationMessage(`${t("created")}: ${r.name}`);return;}
      if(m.type==="edit"){const list=getP();const i=list.findIndex((x)=>x.id===m.id);if(i<0)return;const u=await profDlg(list[i]);if(!u){this.render();return;}list[i]=u;setP(list);this.render();vscode.window.showInformationMessage(t("updated"));return;}
      if(m.type==="delete"){const p=findP(m.id);if(!p)return;setP(getP().filter((x)=>x.id!==m.id));if(c().get<string>("defaultProfile","")===m.id)c().update("defaultProfile","",vscode.ConfigurationTarget.Global);this.render();vscode.window.showInformationMessage(`${t("deleted")}: ${p.name}`);return;}
      if(m.type==="setDefault"){c().update("defaultProfile",m.id,vscode.ConfigurationTarget.Global);this.render();const p=findP(m.id);if(p)vscode.window.showInformationMessage(`${p.name} \u2605 ${t("emptyDefault")}`);return;}
      if(m.type==="up"||m.type==="down"){const list=getP();const i=list.findIndex((x)=>x.id===m.id);if(i<0)return;const j=m.type==="up"?i-1:i+1;if(j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];setP(list);this.render();return;}
      if(m.type==="reorder"){const list=getP();const i=list.findIndex((x)=>x.id===m.id);if(i<0)return;const to=Math.max(0,Math.min(list.length-1,(parseInt(m.value)||1)-1));const item=list.splice(i,1)[0];list.splice(to,0,item);setP(list);this.render();return;}
      if(m.type==="searchLib"){const l=await pickLib();if(!l){this.render();return;}const list=getP();list.push(l);setP(list);this.render();vscode.window.showInformationMessage(`${t("created")}: ${l.name}`);return;}
      if(m.type==="settings"){vscode.commands.executeCommand("workbench.action.openSettings",K);return;}
      if(m.type==="exportI"){await expProf();return;}if(m.type==="importI"){await impProf();clearInstCache();this.render();return;}
      if(m.type==="duplicate"){const p=findP(m.id);if(!p)return;const c2={...p,id:gid(),name:p.name+" (2)"};const list=getP();list.push(c2);setP(list);this.render();vscode.window.showInformationMessage(t("profileDuplicated").replace("{name}",p.name));return;}
      if(m.type==="openDesktop"){openDesktop(this.ctx);return;}
      if(m.type==="addFile"){addFileToOpencode();return;}
    });
  }

  render(){if(this.v)this.v.webview.html=this.html();}

  private html():string{
    const list=getP();const lang=c().get<string>("language","tr")==="en"?"en":"tr";
    const tc=vscode.window.terminals.filter((t)=>t.name.includes("CodeHub")||t.name==="opencode"||t.name==="oc-server").length;
    const def=c().get<string>("defaultProfile","");
    const n=()=>{const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";let r="";for(let i=0;i<32;i++)r+=c[Math.floor(Math.random()*c.length)];return r;};
    const esc=(s:string)=>s.replace(/[&<>"']/g,(m)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[m]||m);
    const rows=list.map((p,idx)=>{
      const isDef=p.id===def;const first=idx===0;const last=idx===list.length-1;
      const isOpen=openTerms.has(p.id);const installed=isInst(p.executable);
      const hasIcon=p.icon&&p.icon.length>0;
      const iconHtml=hasIcon?`<span class="ic codicon codicon-${esc(p.icon!)}"></span>`:`<span class="ic-f">${esc(fallbackIcon(p.name))}</span>`;
      return `<div class="cr ${isDef?"def":""}">
        <input class="on" type="number" value="${idx+1}" min="1" max="${list.length}" onchange="p('reorder','${p.id}',this.value)">
        <span class="cb ${installed?"play":"na"}" onclick="p('run','${p.id}')">${iconHtml}${!installed?`<span class="ndot"></span>`:""}${isOpen?`<span class="odot"></span>`:""}</span>
        <div class="cn" onclick="p('run','${p.id}')">
          <span class="cn-t">${esc(p.name)}</span>
          <span class="cn-s">${esc(buildCmd(p))}</span>
        </div>
        <div class="ca">
          ${isOpen?`<button class="b b-cls" onclick="p('closeProf','${p.id}')">\u2716</button>`:""}
          <button class="b b-star ${isDef?"on":""}" onclick="p('setDefault','${p.id}')">\u2605</button>
          <button class="b" onclick="p('duplicate','${p.id}')">\u{1F4CB}</button>
          <button class="b" onclick="p('edit','${p.id}')">\u2699</button>
          <button class="b b-del" onclick="p('delete','${p.id}')">\u{1F5D1}</button>
          <button class="b b-up ${first?"lim":""}" onclick="p('up','${p.id}')" ${first?"disabled":""}>▲</button>
          <button class="b b-dn ${last?"lim":""}" onclick="p('down','${p.id}')" ${last?"disabled":""}>▼</button>
        </div>
      </div>`;
    }).join("");

    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"/><style>
*{margin:0;padding:0;box-sizing:border-box}body{padding:14px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);line-height:1.4}
.tb{display:flex;align-items:center;gap:6px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid color-mix(in srgb,var(--vscode-foreground) 8%,transparent)}
.tb .ti{font-size:14px;font-weight:700;flex:1;letter-spacing:-.3px}
.tb .sub{font-size:10px;opacity:.3;margin-right:6px}
.tb .ib{width:26px;height:26px;border:none;border-radius:5px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;background:transparent;color:var(--vscode-foreground);opacity:.4;transition:all .12s}
.tb .ib:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground)}
.st-bar{display:flex;gap:6px;margin-bottom:10px}
.st-item{flex:1;padding:6px 8px;border-radius:6px;background:color-mix(in srgb,var(--vscode-foreground) 4%,transparent);border:1px solid color-mix(in srgb,var(--vscode-foreground) 6%,transparent);font-size:10px;text-align:center;opacity:.6}
.st-item .num{font-size:16px;font-weight:700;display:block;opacity:.8}
.st-item .lbl{opacity:.4;font-size:8px;text-transform:uppercase;letter-spacing:.5px}
.cr{display:flex;align-items:center;gap:4px;padding:7px 6px;border-radius:8px;margin:3px 0;border:1px solid transparent;transition:all .1s}
.cr:hover{border-color:color-mix(in srgb,var(--vscode-foreground) 12%,transparent);background:color-mix(in srgb,var(--vscode-foreground) 2%,transparent)}
.cr.def{border-color:color-mix(in srgb,var(--vscode-editorMarkerNavigationWarning-background) 25%,transparent);background:color-mix(in srgb,var(--vscode-editorMarkerNavigationWarning-background) 5%,transparent)}
.on{width:24px;height:20px;border-radius:4px;border:1px solid color-mix(in srgb,var(--vscode-foreground) 15%,transparent);background:transparent;color:var(--vscode-foreground);text-align:center;font-size:10px;font-weight:600;flex-shrink:0}
.on:focus{border-color:var(--vscode-focusBorder);outline:none}
.cb{width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;transition:all .12s;position:relative}
.cb.play{background:color-mix(in srgb,var(--vscode-button-background) 12%,transparent);color:var(--vscode-button-background)}
.cb.play:hover{background:var(--vscode-button-background);color:var(--vscode-button-foreground);transform:scale(1.06)}
.cb.na{opacity:.2}.cb.na:hover{opacity:.4}
.ndot,.odot{position:absolute;top:2px;right:2px;width:6px;height:6px;border-radius:50%}
.ndot{background:var(--vscode-errorForeground);opacity:.5}
.odot{background:var(--vscode-testing-iconPassed)}
.ic{font-size:16px;display:flex;align-items:center;justify-content:center}
.ic-f{width:22px;height:22px;border-radius:5px;background:color-mix(in srgb,var(--vscode-button-background) 15%,transparent);color:var(--vscode-button-background);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
.cn{flex:1;min-width:0;cursor:pointer;padding:2px 4px;border-radius:4px}
.cn:hover{background:var(--vscode-list-hoverBackground)}
.cn-t{font-size:13px;font-weight:500;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cn-s{font-size:10px;opacity:.35;display:block;margin-top:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ca{display:flex;gap:2px;flex-shrink:0;align-items:center}
.b{width:20px;height:20px;border:none;border-radius:4px;cursor:pointer;font-size:9px;background:transparent;color:var(--vscode-foreground);opacity:.2;display:flex;align-items:center;justify-content:center;padding:0;transition:all .1s}
.b:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground)}
.b-del:hover{color:var(--vscode-errorForeground);opacity:1}
.b-star{font-size:10px;opacity:.3}.b-star.on{color:var(--vscode-editorMarkerNavigationWarning-background);opacity:.7}
.b-star:hover{opacity:1;color:var(--vscode-editorMarkerNavigationWarning-background)}
.b-cls{opacity:.5;color:var(--vscode-testing-iconPassed)}.b-cls:hover{opacity:1;color:var(--vscode-errorForeground)}
.b-up.lim,.b-dn.lim{color:var(--vscode-errorForeground);opacity:.35;cursor:default;pointer-events:none}
.b-up:not(.lim):hover,.b-dn:not(.lim):hover{opacity:1;color:var(--vscode-testing-iconPassed)}
.emp{padding:28px 16px;text-align:center;font-size:12px;opacity:.3;line-height:1.6}
.emp .big{font-size:28px;opacity:.2;display:block;margin-bottom:8px}
</style></head><body>
<div class="tb"><span class="ti">CodeHub</span><span class="sub">${tc>0?tc+" "+t("terminalCount").replace("{n}",""):"0"}</span>
  <button class="ib" onclick="p('runOC')" title="${t("opencodeLaunch")}">\u25B6</button>
  <button class="ib" onclick="p('addFile')" title="${t("addFile")}">\u{1F4C4}</button>
  <button class="ib" onclick="p('searchLib')" title="${t("addFromLib")}">\u2795</button>
  <button class="ib" onclick="p('settings')" title="${t("settings")}">\u2699</button>
</div>
<div class="st-bar">
  <div class="st-item"><span class="num">${list.length}</span><span class="lbl">${t("profileList")}</span></div>
  <div class="st-item"><span class="num">${tc}</span><span class="lbl">${t("terminalCount").replace("{n}","")}</span></div>
  <div class="st-item"><span class="num">${list.filter((p)=>isInst(p.executable)).length}</span><span class="lbl">${t("ready")}</span></div>
</div>
${list.length>0?rows:`<div class="emp"><span class="big">+</span>${t("noProfiles")}</div>`}
<div style="display:flex;gap:3px;margin-top:4px">
  <button style="flex:1;padding:6px;border:1.5px dashed color-mix(in srgb,var(--vscode-foreground) 15%,transparent);border-radius:6px;cursor:pointer;font-size:11px;background:transparent;color:var(--vscode-foreground);opacity:.5;transition:opacity .1s" onclick="p('add')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.5">+ ${t("addProfile")}</button>
  <button style="width:32px;border:1.5px dashed color-mix(in srgb,var(--vscode-foreground) 15%,transparent);border-radius:6px;cursor:pointer;font-size:14px;background:transparent;color:var(--vscode-foreground);opacity:.5;transition:opacity .1s;display:flex;align-items:center;justify-content:center" onclick="p('addLib')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.5" title="${t("addFromLib")}">\u{1F4CB}</button>
</div>
<div style="display:flex;gap:3px;margin-top:8px">
  <button style="flex:1;padding:5px;border:none;border-radius:6px;cursor:pointer;font-size:10px;background:color-mix(in srgb,var(--vscode-errorForeground) 8%,transparent);color:var(--vscode-errorForeground);opacity:.6;transition:opacity .1s" onclick="p('confirmCloseAll')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.6">${t("closeAll")}</button>
  <button style="flex:1;padding:5px;border:none;border-radius:6px;cursor:pointer;font-size:10px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);opacity:.6;transition:opacity .1s" onclick="p('exportI')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.6">${t("exportTitle")}</button>
  <button style="flex:1;padding:5px;border:none;border-radius:6px;cursor:pointer;font-size:10px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);opacity:.6;transition:opacity .1s" onclick="p('importI')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.6">${t("importTitle")}</button>
</div>
<script nonce="${n()}">const v=acquireVsCodeApi();function p(t,i,v2){v.postMessage({type:t,id:i,value:v2})}<\/script>
</body></html>`;
  }
}

// ── Activate ──

export function activate(ctx:vscode.ExtensionContext) {
  const side=new SidePanel(ctx);
  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider(SidePanel.vt,side,{webviewOptions:{retainContextWhenHidden:true}}));

  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.runDefault",runDef));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openDesktop",()=>openDesktop(ctx)));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openOpencodeTerminal",()=>openOpencodeTerminal(ctx)));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.addFileToOpencode",addFileToOpencode));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openSettings",()=>vscode.commands.executeCommand("workbench.action.openSettings",K)));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setStatusBarProfile",()=>pickProf(t("exec"),"statusBarProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setStartupProfile",()=>pickProf(t("exec"),"startupProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setShortcutProfile",()=>pickProf(t("exec"),"shortcutProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.exportProfiles",expProf));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.importProfiles",impProf));

  const sb=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right,100);sb.show();ctx.subscriptions.push(sb);
  const upd=()=>{const n=vscode.window.terminals.filter((t)=>t.name.includes("CodeHub")||t.name==="opencode"||t.name==="oc-server").length;sb.text=n>0?`$(terminal) CodeHub (${n})`:"$(terminal) CodeHub";sb.tooltip=t("statusTip");sb.command="codehub.runDefault";};
  upd();
  ctx.subscriptions.push(vscode.window.onDidOpenTerminal(upd));
  ctx.subscriptions.push(vscode.window.onDidCloseTerminal(()=>{upd();side.render();}));
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e)=>{if(e.affectsConfiguration(K)){clearInstCache();side.render();}}));

  const delay=c().get<number>("startupDelay",1200);
  if(c().get<string>("startupMode","defaultProfile")!=="none"){
    setTimeout(()=>{const p=findP(realDefId());if(p)runProf(p);},delay);
  }
}

export function deactivate(){openTerms.clear();srvPorts.clear();}
