import * as vscode from "vscode";
import { execSync } from "child_process";

interface Profile {
  id: string; name: string; icon?: string;
  executable: string; arguments: string;
  shell: "powershell" | "cmd" | "wsl" | "bash" | "zsh" | "custom";
  shellPath?: string; category?: string; checkCommand?: string; cwd?: string;
}

interface LibEntry {
  name: string; icon: string; executable: string; arguments: string;
  shell: Profile["shell"]; category: string; checkCommand?: string; desc: string;
  isDesktop?: boolean;
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
  dir: _("Klasör", "Directory"), edit: _("Düzenle", "Edit"), del: _("Sil", "Delete"),
  close: _("Kapat", "Close"), up: _("Yukarı", "Up"), down: _("Aşağı", "Down"),
  searchLib: _("Ara veya seç...", "Search or select..."),
  exportTitle: _("Dışa Aktar", "Export"), importTitle: _("İçe Aktar", "Import"),
  exported: _("Profiller dışa aktarıldı", "Profiles exported"),
  imported: _("Profiller içe aktarıldı", "Profiles imported"),
  statusTip: _("CodeHub - Varsayılan profili çalıştır", "CodeHub - Run default profile"),
  terminalCount: _("{n} terminal", "{n} terminals"),
  emptyDefault: _("★ ile varsayılan yapın", "Tap ★ to set default"),
  duplicate: _("Kopyala", "Duplicate"), ready: _("Hazır", "Ready"),
  confirmCloseAllQ: _("Tüm terminalleri kapat?", "Close all terminals?"),
  yes: _("Evet", "Yes"), no: _("Hayır", "No"),
  profileDuplicated: _("Kopyalandı: {name}", "Duplicated: {name}"),
  noIcon: _("İkonsuz (Enter)", "No icon (Enter)"),
  iconTheme: _("Tema ikonu seç", "Pick theme icon"),
  cliOpt: _("Tam terminal", "Full terminal"),
  vsOpt: _("VSCode terminal", "VSCode terminal"),
  deskOpt: _("Desktop panel", "Desktop panel"),
  opencodeLaunch: _("OpenCode Aç", "Open OpenCode"),
  serverWait: _("OpenCode sunucu başlatılıyor...", "Starting OpenCode server..."),
  addFile: _("Dosya Ekle", "Add File"),
  fileAdded: _("Dosya eklendi", "File added"),
  opencodeCLI: _("OpenCode CLI (yan panel)", "OpenCode CLI (side panel)"),
  opencodeDesktop: _("OpenCode Desktop (iframe)", "OpenCode Desktop (iframe)"),
  opencodeVSCode: _("OpenCode VSCode (panel)", "OpenCode VSCode (panel)"),
  running: _("Çalışıyor", "Running"), stopped: _("Kapalı", "Stopped"),
  runNow: _("Çalıştır", "Run"),
};

function t(k: string): string {
  const l = vscode.workspace.getConfiguration("codehub").get<string>("language","tr")==="en"?"en":"tr";
  return (T[k]??{})[l]??k;
}

const K = "codehub";
function c() { return vscode.workspace.getConfiguration(K); }
function getP(): Profile[] { return c().get<Profile[]>("terminalProfiles",[]); }
function setP(p: Profile[]) { c().update("terminalProfiles",p,vscode.ConfigurationTarget.Global); }
function gid(): string { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function defId(): string { const d = c().get<string>("defaultProfile",""); if(d&&getP().some((p)=>p.id===d))return d; return ""; }
function findP(id: string): Profile|undefined { return getP().find((x)=>x.id===id); }
function realDef(): Profile|undefined { const d = defId(); if(d)return findP(d); return getP()[0]; }

const LIB: LibEntry[] = [
  { name: "OpenCode CLI", icon: "terminal", executable: "opencode", arguments: "--port", shell: "cmd", category: "ai", desc: "OpenCode AI CLI — yan panelde terminal" },
  { name: "OpenCode Desktop", icon: "browser", executable: "opencode", arguments: "", shell: "cmd", category: "ai", isDesktop: true, desc: "OpenCode web panel (iframe)" },
  { name: "OpenCode VSCode", icon: "terminal-powershell", executable: "opencode", arguments: "", shell: "cmd", category: "ai", desc: "OpenCode VS Code terminal paneli" },
  { name: "Claude Code", icon: "comment-discussion", executable: "claude", arguments: "", shell: "cmd", category: "ai", checkCommand: "claude --version", desc: "Anthropic AI coding agent" },
  { name: "Codex CLI", icon: "symbol-ruler", executable: "codex", arguments: "", shell: "cmd", category: "ai", checkCommand: "codex --version", desc: "OpenAI coding agent CLI" },
  { name: "Kilo CLI", icon: "terminal", executable: "kilo", arguments: "", shell: "cmd", category: "ai", checkCommand: "kilo --version", desc: "500+ model AI agent" },
  { name: "Gemini CLI", icon: "sparkle", executable: "gemini", arguments: "", shell: "cmd", category: "ai", checkCommand: "gemini --version", desc: "Google Gemini CLI" },
  { name: "Aider", icon: "tools", executable: "aider", arguments: "--model sonnet", shell: "cmd", category: "ai", checkCommand: "aider --version", desc: "AI pair programming" },
  { name: "GitHub Copilot CLI", icon: "github", executable: "copilot", arguments: "", shell: "cmd", category: "ai", checkCommand: "copilot --version", desc: "GitHub Copilot in terminal" },
  { name: "Amazon Q", icon: "cloud", executable: "q", arguments: "", shell: "cmd", category: "ai", checkCommand: "q --version", desc: "AWS AI coding agent" },
  { name: "Kiro CLI", icon: "terminal", executable: "kiro-cli", arguments: "chat", shell: "cmd", category: "ai", checkCommand: "kiro-cli --version", desc: "Kiro interactive AI CLI" },
  { name: "Goose", icon: "star", executable: "goose", arguments: "", shell: "cmd", category: "ai", checkCommand: "goose --version", desc: "Block AI coding agent" },
  { name: "Cline", icon: "terminal", executable: "cline", arguments: "", shell: "cmd", category: "ai", desc: "VS Code AI coding agent" },
];

function fromLib(l: LibEntry): Profile {
  return { id: gid(), name: l.name, icon: l.icon, executable: l.executable, arguments: l.arguments, shell: l.shell, category: l.category, checkCommand: l.checkCommand };
}

function shellPath(p: Profile): string|undefined {
  const m: Record<string,string|undefined>={powershell:"powershell.exe",cmd:"cmd.exe",wsl:"wsl.exe",bash:"bash",zsh:"zsh"};
  return p.shell==="custom"?p.shellPath||undefined:m[p.shell];
}
function buildCmd(p: Profile): string { return [p.executable,p.arguments].filter(Boolean).join(" "); }

const _cache = new Map<string,boolean>();
function isInst(exe: string): boolean {
  const k = exe.split(" ")[0]; const h = _cache.get(k); if(h!==undefined)return h;
  try{execSync(process.platform==="win32"?`where ${k} 2>nul`:`command -v ${k} 2>/dev/null`,{encoding:"utf-8",timeout:1500,windowsHide:true,stdio:"pipe"});_cache.set(k,true);return true;}
  catch{_cache.set(k,false);return false;}
}
function clearCache(){_cache.clear();}

const terms = new Map<string,vscode.Terminal>();

// ── OpenCode CLI (official SDK behavior) ──

async function openCLI(ctx: vscode.ExtensionContext) {
  const existing = vscode.window.terminals.find((t)=>t.name==="opencode");
  if (existing) { existing.show(); return; }
  const port = Math.floor(Math.random()*(65535-16384+1))+16384;
  const term = vscode.window.createTerminal({
    name: "opencode",
    iconPath: { light: vscode.Uri.file(ctx.asAbsolutePath("media/mark-dark.svg")), dark: vscode.Uri.file(ctx.asAbsolutePath("media/mark-light.svg")) },
    location: { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
    env: { _EXTENSION_OPENCODE_PORT: port.toString(), OPENCODE_CALLER: "vscode" },
  });
  term.show(); term.sendText(`opencode --port ${port}`);
  terms.set("opencode-cli", term);
  const d = vscode.window.onDidCloseTerminal((t) => { if (t===term) { terms.delete("opencode-cli"); d.dispose(); } });
  let tries=10;
  while (tries-->0) {
    await new Promise((r)=>setTimeout(r,200));
    try{const r=await fetch(`http://localhost:${port}/app`);if(r.ok){break}}catch{}
  }
}

async function addFile() {
  const term = vscode.window.terminals.find((t)=>t.name==="opencode");
  if (!term) return;
  const editor = vscode.window.activeTextEditor; if (!editor) return;
  const rel = vscode.workspace.asRelativePath(editor.document.uri); if (!rel) return;
  let ref = `@${rel}`; const sel = editor.selection;
  if (!sel.isEmpty) { const s=sel.start.line+1,e=sel.end.line+1; ref+=s===e?`#L${s}`:`#L${s}-${e}`; }
  const port = (term as any).creationOptions?.env?.["_EXTENSION_OPENCODE_PORT"];
  if (port) { try{await fetch(`http://localhost:${port}/tui/append-prompt`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:ref})});}catch{} }
  else term.sendText(ref,false);
  term.show(); vscode.window.setStatusBarMessage(`$(check) ${t("fileAdded")}`,2000);
}

// ── Desktop ──

let deskPanel: vscode.WebviewPanel|undefined;
const srvP = new Set<number>(); const SRV="oc-srv";
function openCmd(): string { return c().get<string>("opencodePath","opencode"); }
function startSrv(port:number) {
  const t=vscode.window.createTerminal({name:SRV,iconPath:new vscode.ThemeIcon("server"),hideFromUser:true,env:{_CH_PORT:port.toString()}as any});
  t.sendText(`${openCmd()} --port ${port}`);srvP.add(port);
  const d=vscode.window.onDidCloseTerminal((x)=>{if(x===t){srvP.delete(port);d.dispose();}});
}
async function openDesk(ctx:vscode.ExtensionContext) {
  if(deskPanel){deskPanel.reveal(vscode.ViewColumn.Active,false);return;}
  try{execSync(process.platform==="win32"?`where ${openCmd().split(" ")[0]} 2>nul`:`command -v ${openCmd().split(" ")[0]} 2>/dev/null`,{encoding:"utf-8",timeout:2000,windowsHide:true,stdio:"pipe"});}
  catch{vscode.window.showWarningMessage(`$(error) ${t("exec")}`);return;}
  deskPanel=vscode.window.createWebviewPanel("ch.desk","$(browser) OpenCode Desktop",vscode.ViewColumn.Beside,{enableScripts:true,retainContextWhenHidden:true});
  deskPanel.webview.html=`<html><body style="display:flex;align-items:center;justify-content:center;height:100%"><div style="text-align:center"><div class="sp" style="width:28px;height:28px;border:3px solid rgba(128,128,128,.3);border-top-color:var(--vscode-foreground);border-radius:50%;animation:spin .8s infinite;margin:0 auto 12px"></div><div style="opacity:.6">${t("serverWait")}</div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style></body></html>`;
  deskPanel.onDidDispose(()=>{deskPanel=undefined;});
  const port=Math.floor(Math.random()*50000)+1024;startSrv(port);
  for(let i=0;i<40;i++){try{const r=await fetch(`http://localhost:${port}/app`);if(r.ok||r.status===404)break}catch{}try{const r=await fetch(`http://localhost:${port}`);if(r.ok||r.status===404)break}catch{}await new Promise((r)=>setTimeout(r,500));}
  if(!deskPanel)return;
  deskPanel.webview.html=`<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';frame-src http://localhost:${port} https:"><style>*{margin:0;padding:0}html,body{height:100%;overflow:hidden}iframe{width:100%;height:100%;border:none}</style></head><body><iframe src="http://localhost:${port}"></iframe></body></html>`;
}

// ── Profile Runner ──

async function runP(p: Profile) {
  if (terms.has(p.id) && c().get<boolean>("reuseTerminal",true)) { terms.get(p.id)!.show(true); return; }
  try {
    const t = vscode.window.createTerminal({
      name: `${p.name}`, iconPath: new vscode.ThemeIcon(p.icon||"terminal"),
      location: { viewColumn: vscode.ViewColumn.One, preserveFocus: false } as const, shellPath: shellPath(p),
      env: { CODEHUB_VSCODE: "1", CODEHUB_PROFILE: p.id } as any,
    });
    if (p.cwd) (t as any)._cwd = vscode.Uri.file(p.cwd);
    terms.set(p.id, t); t.show();
    await vscode.commands.executeCommand("workbench.action.closeEditorsInOtherGroups");
    const cmd = buildCmd(p);
    if (cmd.trim()) setTimeout(() => t.sendText(cmd.trim(), true), 800);
    const d = vscode.window.onDidCloseTerminal((x) => { if (x===t) { terms.delete(p.id); d.dispose(); } });
  } catch {}
}

function closeP(id:string) { const t=terms.get(id); if(t){t.dispose();terms.delete(id);} }

async function pickProf(title:string,sk:string) {
  const cur=c().get<string>(sk,"first");
  const items=[{label:`$(chevron-up) ${t("first")}`,id:"first"},...getP().map((p)=>({label:`$(${p.icon||"terminal"}) ${p.name}`,description:`${buildCmd(p)}`,id:p.id}))];
  const pick=await vscode.window.showQuickPick(items,{placeHolder:title});if(pick)c().update(sk,pick.id,vscode.ConfigurationTarget.Global);
}

async function expP() {
  const u=await vscode.window.showSaveDialog({filters:{"CodeHub Profiles":["json"]},defaultUri:vscode.Uri.file(`codehub-${new Date().toISOString().slice(0,10)}.json`)});
  if(!u)return;try{vscode.workspace.fs.writeFile(u,Buffer.from(JSON.stringify(getP(),null,2),"utf-8"));vscode.window.showInformationMessage(`$(save) ${t("exported")}`);}catch{vscode.window.showErrorMessage("Export failed");}
}
async function impP() {
  const u=await vscode.window.showOpenDialog({filters:{"CodeHub Profiles":["json"]},canSelectMany:false});
  if(!u||!u.length)return;
  try{const d=JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(u[0])));if(!Array.isArray(d))throw Error();const ps=d.map((p:any)=>{if(!p.id)p.id=gid();if(!p.executable&&p.commands?.length){const parts=p.commands[0].split(" ");p.executable=parts[0];p.arguments=parts.slice(1).join(" ");}if(!p.executable)p.executable="opencode";if(!p.arguments)p.arguments="";return p as Profile;});setP(ps);vscode.window.showInformationMessage(`$(folder) ${t("imported")} (${ps.length})`);}catch{vscode.window.showErrorMessage("Import failed");}
}

async function pickIcon(existing?:string):Promise<string|undefined>{
  const ch=await vscode.window.showQuickPick([
    {label:`$(close) ${t("noIcon")}`,id:"none"},{label:`$(symbol-color) ${t("iconTheme")}`,id:"theme"},
  ],{placeHolder:t("searchLib")});
  if(!ch)return;if(ch.id==="none")return existing!==undefined?existing:"";
  const icons=["terminal","terminal-powershell","terminal-cmd","terminal-bash","terminal-linux","browser","comment-discussion","git-branch","github","symbol-variable","symbol-ruler","symbol-key","server","server-process","database","cloud","tools","beaker","light-bulb","flame","star","rocket","zap","sync","play","debug","package","code","sparkle","wand","shield","hubot","organization","link","extensions","globe"];
  const p=await vscode.window.showQuickPick(icons.map((i)=>({label:`$(${i}) ${i}`,id:i})),{placeHolder:t("searchLib")});return p?.id;
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
  ],{placeHolder:t("searchLib"),ignoreFocusOut:true});if(!openPick)return;
  return{id:existing?.id||gid(),name,icon:icon||undefined,executable:exec,arguments:args,shell,shellPath,cwd:cwd||undefined};
}

async function pickLib():Promise<Profile|undefined>{
  const items:any[]=[{label:"AI Kodlama Araçları / AI Coding Agents",kind:vscode.QuickPickItemKind.Separator},...LIB.map((l)=>({label:`$(${l.icon}) ${l.name}`,description:`${l.executable}`.trim(),detail:l.desc,lib:l}))];
  const pick=await vscode.window.showQuickPick(items,{placeHolder:t("searchLib"),matchOnDescription:true,matchOnDetail:true});
  return pick?fromLib(pick.lib):undefined;
}

// ── Side Panel ──

class Panel implements vscode.WebviewViewProvider {
  static vt="codehub.sidePanel";private v?:vscode.WebviewView;
  constructor(private ctx:vscode.ExtensionContext){}

  resolveWebviewView(vw:vscode.WebviewView){this.v=vw;vw.webview.options={enableScripts:true};this.render();
    vw.onDidDispose(()=>{this.v=undefined;});
    vw.webview.onDidReceiveMessage(async(m)=>{
      if(m.type==="run"){const p=findP(m.id);if(p)await runP(p);this.render();return;}
      if(m.type==="closeP"){closeP(m.id);this.render();return;}
      if(m.type==="closeAll"){vscode.window.terminals.forEach((t)=>{if(t.name.includes("CodeHub")||t.name==="opencode"||t.name==="oc-srv")t.dispose()});terms.clear();srvP.clear();this.render();return;}
      if(m.type==="add"){const r=await profDlg();if(!r){this.render();return;}const l=getP();l.push(r);setP(l);this.render();vscode.window.showInformationMessage(`$(check) ${t("created")}: ${r.name}`);return;}
      if(m.type==="addLib"){const l=await pickLib();if(!l){this.render();return;}if(l.name==="OpenCode CLI"){await openCLI(this.ctx);this.render();return;}const list=getP();list.push(l);setP(list);this.render();vscode.window.showInformationMessage(`$(check) ${t("created")}: ${l.name}`);return;}
      if(m.type==="edit"){const l=getP();const i=l.findIndex((x)=>x.id===m.id);if(i<0)return;const u=await profDlg(l[i]);if(!u){this.render();return;}l[i]=u;setP(l);this.render();vscode.window.showInformationMessage(`$(check) ${t("updated")}`);return;}
      if(m.type==="delete"){const p=findP(m.id);if(!p)return;setP(getP().filter((x)=>x.id!==m.id));if(c().get<string>("defaultProfile","")===m.id)c().update("defaultProfile","",vscode.ConfigurationTarget.Global);this.render();vscode.window.showInformationMessage(`$(trash) ${t("deleted")}: ${p.name}`);return;}
      if(m.type==="setDef"){c().update("defaultProfile",m.id,vscode.ConfigurationTarget.Global);this.render();return;}
      if(m.type==="up"||m.type==="down"){const l=getP();const i=l.findIndex((x)=>x.id===m.id);if(i<0)return;const j=m.type==="up"?i-1:i+1;if(j<0||j>=l.length)return;[l[i],l[j]]=[l[j],l[i]];setP(l);this.render();return;}
      if(m.type==="reorder"){const l=getP();const i=l.findIndex((x)=>x.id===m.id);if(i<0)return;const to=Math.max(0,Math.min(l.length-1,(parseInt(m.value)||1)-1));const item=l.splice(i,1)[0];l.splice(to,0,item);setP(l);this.render();return;}
      if(m.type==="dup"){const p=findP(m.id);if(!p)return;const c2={...p,id:gid(),name:p.name+" (2)"};const l=getP();l.push(c2);setP(l);this.render();vscode.window.showInformationMessage(`$(copy) ${t("profileDuplicated").replace("{name}",p.name)}`);return;}
      if(m.type==="oc"){const p=await vscode.window.showQuickPick([
        {label:`$(terminal) ${t("opencodeCLI")}`,id:"cli"},{label:`$(browser) ${t("opencodeDesktop")}`,id:"desktop"},{label:`$(terminal-powershell) ${t("opencodeVSCode")}`,id:"vscode"},
      ],{placeHolder:t("opencodeLaunch")});if(!p)return;
      if(p.id==="cli")await openCLI(this.ctx);else if(p.id==="desktop")openDesk(this.ctx);else{const t=vscode.window.createTerminal({name:"opencode",iconPath:new vscode.ThemeIcon("terminal")});t.show();t.sendText("opencode");}this.render();return;}
      if(m.type==="addFile"){addFile();return;}
      if(m.type==="settings"){vscode.commands.executeCommand("workbench.action.openSettings",K);return;}
      if(m.type==="exp"){await expP();return;}if(m.type==="imp"){await impP();clearCache();this.render();return;}
    });
  }

  render(){if(this.v)this.v.webview.html=this.html();}

  private html():string{
    const list=getP();const lang=c().get<string>("language","tr")==="en"?"en":"tr";
    const tc=vscode.window.terminals.filter((t)=>t.name.includes("CodeHub")||t.name==="opencode"||t.name==="oc-srv").length;
    const def=c().get<string>("defaultProfile","");
    const n=()=>{const c="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";let r="";for(let i=0;i<32;i++)r+=c[Math.floor(Math.random()*c.length)];return r;};
    const esc=(s:string)=>s.replace(/[&<>"']/g,(m)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[m]||m);

    const rows=list.map((p,idx)=>{
      const isDef=p.id===def;const first=idx===0;const last=idx===list.length-1;
      const isOpen=terms.has(p.id);const inst=isInst(p.executable);
      const ic=p.icon?`<span class="ic codicon codicon-${esc(p.icon)}"></span>`:`<span class="icf">${p.name[0].toUpperCase()}</span>`;
      return `<div class="cr ${isDef?"d":""}">
        <input class="on" type="number" value="${idx+1}" min="1" max="${list.length}" onchange="p('reorder','${p.id}',this.value)">
        <span class="cb ${inst?"p":"n"}" onclick="p('run','${p.id}')">${ic}${!inst?`<span class="nd"></span>`:""}${isOpen?`<span class="od"></span>`:""}</span>
        <div class="cn" onclick="p('run','${p.id}')"><span class="cn-t">${esc(p.name)}${isDef?' <span class="s">\u2605</span>':""}</span><span class="cn-s">${esc(buildCmd(p))}</span></div>
        <div class="ca">
          ${isOpen?`<button class="b bc" onclick="p('closeP','${p.id}')">\u2716</button>`:""}
          <button class="b" onclick="p('setDef','${p.id}')" title="${t("emptyDefault")}">\u2605</button>
          <button class="b" onclick="p('dup','${p.id}')" title="${t("duplicate")}">\u{1F4CB}</button>
          <button class="b" onclick="p('edit','${p.id}')" title="${t("edit")}">\u2699</button>
          <button class="b bd" onclick="p('delete','${p.id}')">\u{1F5D1}</button>
          <button class="b bu ${first?"l":""}" onclick="p('up','${p.id}')" ${first?"disabled":""}>&#9650;</button>
          <button class="b bd2 ${last?"l":""}" onclick="p('down','${p.id}')" ${last?"disabled":""}>&#9660;</button>
        </div>
      </div>`;
    }).join("");

    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"/><style>
*{margin:0;padding:0;box-sizing:border-box}body{padding:12px;font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);line-height:1.4;overflow-x:hidden}
.t{display:flex;align-items:center;gap:4px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid color-mix(in srgb,var(--vscode-foreground) 8%,transparent)}
.t .ti{font-size:14px;font-weight:700;flex:1;display:flex;align-items:center;gap:4px}
.t .ti .codicon{font-size:16px;opacity:.7}
.t .sub{font-size:10px;opacity:.3;margin-right:4px}
.t .b{width:24px;height:24px;border:none;border-radius:4px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;background:transparent;color:var(--vscode-foreground);opacity:.4;transition:all .1s}
.t .b:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground)}
.st{display:flex;gap:4px;margin-bottom:8px}
.st-i{flex:1;padding:5px 6px;border-radius:5px;background:color-mix(in srgb,var(--vscode-foreground) 3%,transparent);border:1px solid color-mix(in srgb,var(--vscode-foreground) 5%,transparent);font-size:10px;text-align:center;opacity:.6}
.st-i .n{font-size:15px;font-weight:700;display:block;opacity:.8}
.st-i .l{opacity:.35;font-size:8px;text-transform:uppercase;letter-spacing:.4px}
.cr{display:flex;align-items:center;gap:3px;padding:6px 5px;border-radius:6px;margin:2px 0;border:1px solid transparent;transition:all .08s}
.cr:hover{border-color:color-mix(in srgb,var(--vscode-foreground) 10%,transparent)}
.cr.d{border-color:color-mix(in srgb,var(--vscode-focusBorder) 20%,transparent);background:color-mix(in srgb,var(--vscode-focusBorder) 4%,transparent)}
.on{width:22px;height:18px;border-radius:3px;border:1px solid color-mix(in srgb,var(--vscode-foreground) 12%,transparent);background:transparent;color:var(--vscode-foreground);text-align:center;font-size:9px;font-weight:600;flex-shrink:0}
.on:focus{border-color:var(--vscode-focusBorder);outline:none}
.cb{width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;transition:all .1s;position:relative}
.cb.p{background:color-mix(in srgb,var(--vscode-button-background) 10%,transparent);color:var(--vscode-button-background)}
.cb.p:hover{background:var(--vscode-button-background);color:var(--vscode-button-foreground);transform:scale(1.05)}
.cb.n{opacity:.2}.cb.n:hover{opacity:.35}
.nd,.od{position:absolute;top:1px;right:1px;width:5px;height:5px;border-radius:50%}
.nd{background:var(--vscode-errorForeground);opacity:.4}
.od{background:var(--vscode-testing-iconPassed)}
.ic{font-size:15px;display:flex;align-items:center;justify-content:center}
.icf{width:20px;height:20px;border-radius:4px;background:color-mix(in srgb,var(--vscode-button-background) 12%,transparent);color:var(--vscode-button-background);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700}
.cn{flex:1;min-width:0;cursor:pointer;padding:1px 3px;border-radius:3px}
.cn:hover{background:var(--vscode-list-hoverBackground)}
.cn-t{font-size:12px;font-weight:500;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cn-s{font-size:9px;opacity:.3;display:block;margin-top:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s{color:var(--vscode-editorMarkerNavigationWarning-background);font-size:9px}
.ca{display:flex;gap:1px;flex-shrink:0;align-items:center}
.b{width:18px;height:18px;border:none;border-radius:3px;cursor:pointer;font-size:8px;background:transparent;color:var(--vscode-foreground);opacity:.15;display:flex;align-items:center;justify-content:center;padding:0;transition:all .08s}
.b:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground)}
.bd:hover{color:var(--vscode-errorForeground);opacity:1}
.bc{opacity:.4;color:var(--vscode-testing-iconPassed)}.bc:hover{opacity:1;color:var(--vscode-errorForeground)}
.bu.l,.bd2.l{color:var(--vscode-errorForeground);opacity:.3;cursor:default;pointer-events:none}
.bu:not(.l):hover{opacity:1;color:var(--vscode-testing-iconPassed)}
.bd2:not(.l):hover{opacity:1;color:var(--vscode-testing-iconPassed)}
.emp{padding:24px 16px;text-align:center;font-size:11px;opacity:.3;line-height:1.5}
.emp .bi{font-size:24px;opacity:.15;display:block;margin-bottom:6px}
</style></head><body>
<div class="t"><div class="ti"><span class="codicon codicon-terminal"></span>CodeHub</div><span class="sub">${tc>0?tc+" "+t("terminalCount").replace("{n}",""):""}</span>
  <button class="b" onclick="p('oc')" title="${t("opencodeLaunch")}">\u25B6</button>
  <button class="b" onclick="p('addFile')" title="${t("addFile")}">\u{1F4C4}</button>
  <button class="b" onclick="p('addLib')" title="${t("addFromLib")}">\u2795</button>
  <button class="b" onclick="p('settings')" title="${t("settings")}">\u2699</button>
</div>
<div class="st">
  <div class="st-i"><span class="n">${list.length}</span><span class="l">${t("profileList")}</span></div>
  <div class="st-i"><span class="n">${tc}</span><span class="l">${t("terminalCount").replace("{n}","")}</span></div>
  <div class="st-i"><span class="n">${list.filter((p)=>isInst(p.executable)).length}</span><span class="l">${t("ready")}</span></div>
</div>
${list.length>0?rows:`<div class="emp"><span class="bi">+</span>${t("noProfiles")}</div>`}
<div style="display:flex;gap:3px;margin-top:3px">
  <button style="flex:1;padding:5px;border:1.5px dashed color-mix(in srgb,var(--vscode-foreground) 12%,transparent);border-radius:5px;cursor:pointer;font-size:10px;background:transparent;color:var(--vscode-foreground);opacity:.4;transition:opacity .1s" onclick="p('add')" onmouseover="this.style.opacity=.8" onmouseout="this.style.opacity=.4">+ ${t("addProfile")}</button>
  <button style="width:28px;border:1.5px dashed color-mix(in srgb,var(--vscode-foreground) 12%,transparent);border-radius:5px;cursor:pointer;font-size:12px;background:transparent;color:var(--vscode-foreground);opacity:.4;transition:opacity .1s;display:flex;align-items:center;justify-content:center" onclick="p('addLib')" onmouseover="this.style.opacity=.8" onmouseout="this.style.opacity=.4">\u{1F4CB}</button>
</div>
<div style="display:flex;gap:3px;margin-top:6px">
  <button style="flex:1;padding:4px;border:none;border-radius:5px;cursor:pointer;font-size:9px;background:color-mix(in srgb,var(--vscode-errorForeground) 7%,transparent);color:var(--vscode-errorForeground);opacity:.5;transition:opacity .1s" onclick="p('closeAll')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.5">$(trash) ${t("closeAll")}</button>
  <button style="flex:1;padding:4px;border:none;border-radius:5px;cursor:pointer;font-size:9px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);opacity:.5;transition:opacity .1s" onclick="p('exp')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.5">$(save) ${t("exportTitle")}</button>
  <button style="flex:1;padding:4px;border:none;border-radius:5px;cursor:pointer;font-size:9px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);opacity:.5;transition:opacity .1s" onclick="p('imp')" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.5">$(folder) ${t("importTitle")}</button>
</div>
<script nonce="${n()}">const v=acquireVsCodeApi();function p(t,i,v2){v.postMessage({type:t,id:i,value:v2})}<\/script>
</body></html>`;
  }
}

// ── Activate ──

export function activate(ctx:vscode.ExtensionContext) {
  const panel=new Panel(ctx);
  ctx.subscriptions.push(vscode.window.registerWebviewViewProvider(Panel.vt,panel,{webviewOptions:{retainContextWhenHidden:true}}));

  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.runDefault",()=>{const p=realDef();if(p)runP(p);}));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openOpencodeTerminal",()=>openCLI(ctx)));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openDesktop",()=>openDesk(ctx)));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.addFileToOpencode",addFile));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.openSettings",()=>vscode.commands.executeCommand("workbench.action.openSettings",K)));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setStatusBarProfile",()=>pickProf(t("exec"),"statusBarProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setStartupProfile",()=>pickProf(t("exec"),"startupProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.setShortcutProfile",()=>pickProf(t("exec"),"shortcutProfile")));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.exportProfiles",expP));
  ctx.subscriptions.push(vscode.commands.registerCommand("codehub.importProfiles",impP));

  const sb=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right,100);sb.show();ctx.subscriptions.push(sb);
  const upd=()=>{
    const n=vscode.window.terminals.filter((t)=>t.name.includes("CodeHub")||t.name==="opencode"||t.name==="oc-srv").length;
    const def=realDef();
    sb.text=n>0?`$(terminal) CodeHub (${n})`:"$(terminal) CodeHub";
    sb.tooltip=def?`$(terminal) ${def.name}: ${buildCmd(def)}`:`$(terminal) ${t("statusTip")}`;
    sb.command="codehub.runDefault";
  };
  upd();
  ctx.subscriptions.push(vscode.window.onDidOpenTerminal(upd));
  ctx.subscriptions.push(vscode.window.onDidCloseTerminal(()=>{upd();panel.render();}));
  ctx.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e)=>{if(e.affectsConfiguration(K)){clearCache();panel.render();}}));

  const delay=c().get<number>("startupDelay",1200);
  if(c().get<string>("startupMode","defaultProfile")!=="none"){
    setTimeout(()=>{const p=realDef();if(p)runP(p);},delay);
  }
}

export function deactivate(){terms.clear();srvP.clear();}
