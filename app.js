/* FACSIM Apontador — interface conectada ao Supabase Auth e funções RPC protegidas por RLS. */
(() => {
'use strict';
const NAMES = {tv:'Painel para TV',bonificacao:'Bonificação',lancamentos:'Apontamentos',funcionarios:'Funcionários',estrutura:'Estrutura da fábrica',produtos:'Produtos e operações',niveis:'Níveis e tempos',config:'Configurações',acessos:'Gestão de acessos',importar:'Importar planilha'};
/* Sub-abas exibidas no cabeçalho de cada página. */
const SUBS = {
 lancamentos:[['novo','Apontar'],['historico','Histórico'],['ausencias','Ausências'],['horarios','Horários e jornada']],
 bonificacao:[['mes','Fechamento do mês'],['faltas','Faltas'],['salarios','Salários'],['regras','Regras']],
 produtos:[['produtos','Produtos'],['operacoes','Operações'],['tempos','Tempos por produto']],
 estrutura:[['setores','Setores e grupos'],['maquinas','Máquinas'],['funcoes','Funções']],
 niveis:[['tempos','Por funcionário'],['niveis','Níveis']]
};
const sub = {acessos:'usuarios',bonificacao:'mes',produtos:'produtos',lancamentos:'novo',estrutura:'setores',niveis:'tempos'};
const $ = s => document.querySelector(s);
const byId = (collection,id) => (data[collection]||[]).find(x=>String(x.id)===String(id));
const esc = value => String(value??'').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const fNum = (n,d=0)=> Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const fDate = s => s ? String(s).slice(0,10).split('-').reverse().join('/') : '—';
const initials = s=>String(s||'').split(/\s+/).filter(Boolean).slice(0,2).map(t=>t[0]).join('').toUpperCase();
const first = s=>String(s||'').split(' ')[0];
const toMin = t=>{const [h,m]=String(t||'00:00').split(':').map(Number);return (h||0)*60+(m||0)};
const minutesBetween=(a,b)=>{let n=toMin(b)-toMin(a); if(n<=0)n+=1440;return n};
const overlaps=(a1,a2,b1,b2)=>{const A1=toMin(a1),B1=toMin(b1);let A2=toMin(a2),B2=toMin(b2);if(A2<=A1)A2+=1440;if(B2<=B1)B2+=1440;return A1<B2&&B1<A2};
const hourLabel=(i,f)=>`${String(i).slice(0,5)}–${String(f).slice(0,5)}`;
const todayLocal=()=>{const d=new Date(),offset=d.getTimezoneOffset();return new Date(d.getTime()-offset*60000).toISOString().slice(0,10)};
const emptyFilters=()=>({inicio:'',fim:'',funcionario:'',produto:'',processo:'',setor:'',grupo:''});
function filteredRows(opts){
 return (data.lancamentos||[]).filter(l=>
  (!opts.inicio||String(l.data)>=opts.inicio)&&(!opts.fim||String(l.data)<=opts.fim)&&
  (!opts.funcionario||l.funcionario===opts.funcionario)&&(!opts.produto||l.produto===opts.produto)&&
  (!opts.processo||l.processo===opts.processo)&&(!opts.setor||l.setor===opts.setor)&&(!opts.grupo||l.grupo===opts.grupo));
}
/* Peças prontas: usa a classificação gravada no momento do apontamento (histórico preservado). */
const isFinished=(l)=>l.finalSnapshot===true;
const timeItem=(funcionario,produto,processo)=>data.tempos.find(t=>t.funcionario===funcionario&&t.produto===produto&&t.processo===processo);
const routeItem=(produto,processo)=>data.roteiro.find(r=>r.produto===produto&&r.processo===processo);
const empOps=f=>(f?.operacoes||[]).map(id=>data.roteiro.find(r=>r.id===id)).filter(Boolean);
const timeFor=(fid,rid)=>data.tempos.find(t=>t.funcionario===fid&&t.roteiro===rid);
const opLabel=r=>`${byId('produtos',r.produto)?.nome||'Produto'} · ${byId('processos',r.processo)?.nome||'Operação'}`;
const nivelNome=id=>byId('niveis',id)?.nome||('Nível '+id);
const routeOf=produto=>data.roteiro.filter(r=>r.produto===produto).sort((a,b)=>(a.etapa||0)-(b.etapa||0));
function getTime(funcionario,produto,processo){const t=timeItem(funcionario,produto,processo),r=routeItem(produto,processo);if(!r)return null;return {segundos:Number(t?.segundos??r.tempo),nivel:t?.nivel??null,fonte:t?'individual':'padrão',vinculo:t?.id??null}}
const EMPTY=()=>({setores:[],grupos:[],maquinas:[],funcoes:[],funcionarios:[],produtos:[],processos:[],roteiro:[],niveis:[],tempos:[],horarios:[],jornada:[],ausencias:[],lancamentos:[]});
let data=EMPTY();
let authenticated=false;
let authorizedEmail='';
const $main=$('#content');let page=(window.location?.hash==='#tv'?'tv':'lancamentos'), search='', filters=emptyFilters();
let filtersOpen=false,nivFunc='',rotProd='';
const canEdit=()=>data.perfil!=='leitor';
function sums(rows){const realizado=rows.reduce((a,r)=>a+(Number(r.realizado)||0),0),meta=rows.reduce((a,r)=>a+(Number(r.metaSnapshot)||0),0);return {realizado,meta,eff:meta?realizado*100/meta:null,total:rows.length}}
function pct(value){return value==null?'—':fNum(value,2)+'%'}
function effPill(value){return `<span class="pill ${value==null?'grey':value>=100?'green':value>=85?'amber':'grey'}">${pct(value)}</span>`}
function title(text,subtitle,right=''){return `<div class="page-head"><div><div class="eyebrow">FACSIM • CHÃO DE FÁBRICA</div><h1 class="page-title">${esc(text)}</h1><p class="page-subtitle">${esc(subtitle)}</p></div>${right?`<div class="toolbar">${right}</div>`:''}</div>`}
function subtabs(){const list=SUBS[page];if(!list)return '';return `<nav class="subtabs" role="tablist" aria-label="Seções de ${esc(NAMES[page])}">${list.map(([k,l])=>`<button type="button" role="tab" class="subtab ${sub[page]===k?'active':''}" data-sub="${k}" aria-selected="${sub[page]===k}">${l}</button>`).join('')}</nav>`}
const btnNew=(what,label)=>`<button class="btn btn-primary" data-action="${what}" data-edit>＋ ${label}</button>`;
const td=(label,content,cls='')=>`<td data-label="${esc(label)}"${cls?` class="${cls}"`:''}>${content}</td>`;
function pageMarkup(){switch(page){case 'tv':return window.GUT_TV?window.GUT_TV.template(data):'<p>Painel de TV indisponível. Recarregue a página.</p>';case 'lancamentos':return lancamentos();case 'funcionarios':return funcionarios();case 'estrutura':return estrutura();case 'produtos':return produtos();case 'niveis':return niveis();case 'config':return config();case 'bonificacao':return bonificacao();case 'acessos':return acessos();case 'importar':return importar();default:return lancamentos()}}

function renderLogin(message=''){
 window.GUT_TV?.stop();document.body.classList.remove('tv-page');
 authenticated=false;
 $('#breadcrumb').textContent='Acesso';
 $main.innerHTML = '<div class="login-layout"><section class="card login-card">' +
 '<div class="fx-brand fx-login"><img class="fx-mark" src="facsim-mark.svg" alt="" /><span class="fx-word"><b>FACSIM</b><small>APONTADOR DE PRODUÇÃO</small></span></div>' +
 '<h1 class="page-title">Acesse o sistema</h1>' +
 '<p class="page-subtitle">Entre com o e-mail e a senha fornecidos pelo administrador da sua empresa.</p>' +
 (message ? '<div class="login-error" role="alert">'+esc(message)+'</div>' : '') +
 '<form id="loginForm" class="login-form">' +
 '<div class="field"><label for="loginEmail">E-mail</label><input class="input" id="loginEmail" name="email" type="email" autocomplete="username" required /></div>' +
 '<div class="field"><label for="loginPassword">Senha</label><input class="input" id="loginPassword" name="password" type="password" autocomplete="current-password" required /></div>' +
 '<button type="submit" class="btn btn-primary">Entrar com segurança</button>' +
 '</form><p class="login-help">Primeiro acesso? Um administrador precisa criar seu usuário em <strong>Supabase → Authentication → Users</strong> e autorizá-lo neste aplicativo.</p></section></div>';
}
async function loadData(){
 if(!window.GUT_API)throw Error(window.GUT_API_ERROR||'Não foi possível carregar a biblioteca de autenticação.');
 const response=await window.GUT_API.load();
 if(!response||!Array.isArray(response.lancamentos)||!Array.isArray(response.produtos))throw Error('O Supabase retornou dados incompletos.');
 data={...EMPTY(),...response};
 authenticated=true;
 render();
}
async function boot(){
 if(!window.GUT_API){renderLogin(window.GUT_API_ERROR||'Falha no carregamento do Supabase.');return}
 try{
  const session=await window.GUT_API.session();
  if(session){authorizedEmail=session.user?.email||'';await loadData()}
  else renderLogin();
 }catch(err){renderLogin('Não foi possível abrir o banco: '+(err.message||String(err)))}
}
async function handleLogin(ev){
 ev.preventDefault();
 const form=ev.target,button=form.querySelector('button[type="submit"]');
 if(button){button.disabled=true;button.textContent='Validando acesso...'}
 try{
  const email=String(new FormData(form).get('email')||'').trim();
  const password=String(new FormData(form).get('password')||'');
  const session=await window.GUT_API.login(email,password);
  authorizedEmail=session.user?.email||email;
  await loadData();
  toast('Conectado ao Supabase. Dados atualizados.');
 }catch(err){renderLogin(err.message||'Não foi possível autenticar. Confira as credenciais e autorização.')}
}
async function logout(){
 try{if(window.GUT_API)await window.GUT_API.logout()}catch(_){}
 authenticated=false;authorizedEmail='';bonusData=null;rulesDraft=null;rulesDirty=false;
 data=EMPTY();
 renderLogin();
 toast('Sessão encerrada.');
}

function render(){
 if(!authenticated){renderLogin();return;}
 window.GUT_TV?.stop();
 document.body.classList.toggle('tv-page',page==='tv');
 document.body.classList.toggle('read-only',!canEdit());
 document.body.classList.toggle('is-admin',data.perfil==='admin');
 $main.innerHTML=pageMarkup();
 $('#breadcrumb').textContent=NAMES[page]||'Apontamentos';
 const bc=$('#bcEmpresa');if(bc)bc.textContent=data.empresa?.nome||'FACSIM';
 document.body.classList.toggle('is-dono',!!data.donoPlataforma);
 document.querySelectorAll('[data-page]').forEach(btn=>btn.classList.toggle('active',btn.dataset.page===page));
 $('#footerDate').textContent='• '+new Date().getFullYear();
 if(page==='lancamentos'&&sub.lancamentos==='novo')afterEntryRender();
 if(page==='tv'&&window.GUT_TV){
   window.GUT_TV.start({
     reload:()=>window.GUT_API.load(),
     onUpdate:incoming=>{data={...EMPTY(),...incoming};},
     onBack:()=>{if(window.location?.hash==='#tv')window.location.hash='';page='lancamentos';render();}
   });
 }
}
function goTo(p,s){page=p;if(s)sub[p]=s;if(window.location){if(p==='tv')window.location.hash='tv';else if(window.location.hash==='#tv')window.location.hash='';}render();window.scrollTo?.(0,0)}

function tableApontamentos(rows){return `<div class="table-wrap"><table class="table table-cards"><thead><tr><th>Data</th><th>Funcionário</th><th>Setor / Grupo</th><th>Produto / Processo</th><th>Período</th><th>Meta</th><th>Realizado</th><th>Eficiência</th></tr></thead><tbody>${rows.length?rows.map(l=>{const person=byId('funcionarios',l.funcionario),product=byId('produtos',l.produto),proc=byId('processos',l.processo),eff=l.metaSnapshot?l.realizado*100/l.metaSnapshot:null;return `<tr>${td('Data',esc(fDate(l.data)))}${td('Funcionário',esc(person?.nome||l.funcionario),'strong card-title')}${td('Setor / Grupo',`<strong>${esc(l.setorNomeHistorico||byId('setores',l.setor)?.nome||'—')}</strong><small class="cell-sub">${esc(l.grupoNomeHistorico||byId('grupos',l.grupo)?.nome||'Sem grupo')}</small>`)}${td('Produto / Processo',`<b>${esc(product?.nome||l.produto)}</b><small class="cell-sub">${esc(proc?.nome||l.processo)}${isFinished(l)?' · <span class="final-flag">FINAL</span>':''}</small>`,'card-wide')}${td('Período',`${esc(l.inicio)}–${esc(l.fim)}`,'num')}${td('Meta',fNum(l.metaSnapshot),'num')}${td('Realizado',fNum(l.realizado),'strong num')}${td('Eficiência',effPill(eff),'num')}</tr>`}).join(''):`<tr><td colspan="8" class="empty-row">Nenhum lançamento no filtro selecionado.</td></tr>`}</tbody></table></div>`}
function selectOpts(collection,sel='',all=false,label='Todos'){const ar=data[collection]||[];return `${all?`<option value="">${label}</option>`:''}${ar.map(o=>`<option value="${esc(o.id)}" ${String(o.id)===String(sel)?'selected':''}>${esc(o.nome)}</option>`).join('')}`}

/* ===================== GESTÃO DE ACESSOS ===================== */
let accData=null,accLoading=false,accErr='',accEmpresa='',accBusy=false;
const PERFIL_TXT={admin:'Administrador',editor:'Editor',leitor:'Leitor'};
const PERFIL_DESC={admin:'Tudo, inclusive bonificação, salários e usuários da empresa',editor:'Cadastra e aponta produção',leitor:'Só visualiza'};
async function loadAcessos(force){
 if(accLoading||(accData&&!force))return;
 accLoading=true;accErr='';
 try{accData=await window.GUT_API.acessos();if(!accEmpresa||!accData.empresas.some(e=>e.id===accEmpresa))accEmpresa=accData.minhaEmpresa||accData.empresas[0]?.id||'';}
 catch(e){accErr=e.message||String(e);}
 accLoading=false;if(page==='acessos')render();
}
const accAtivos=e=>Number(e.ativos??(e.usuarios||[]).filter(u=>u.ativo).length);
const accCheio=e=>!!e.limite&&accAtivos(e)>=Number(e.limite);
const accUsoTxt=e=>e.limite?`<b>${fNum(accAtivos(e))}</b> de <b>${fNum(e.limite)}</b> acessos ativos em uso`:`<b>${fNum(accAtivos(e))}</b> acesso(s) ativo(s) · sem limite definido`;
function senhaForte(){const c='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';let s='';const r=new Uint32Array(10);(window.crypto||{}).getRandomValues?.(r);for(let i=0;i<10;i++)s+=c[(r[i]||Math.floor(Math.random()*1e9))%c.length];return s+'!'+(r[0]%90+10)}
function acessos(){
 const head=title('Gestão de acessos','Empresas, usuários e perfis de acesso ao sistema.');
 if(data.perfil!=='admin'&&!data.donoPlataforma)return head+'<div class="notice">Somente administradores gerenciam acessos.</div>';
 if(!accData){loadAcessos();return head+`<div class="card"><p class="muted">${accErr?esc(accErr):'Carregando acessos…'}</p>${accErr?'<button class="btn" data-action="acc-recarregar">Tentar de novo</button>':''}</div>`;}
 const dono=accData.dono,emps=accData.empresas||[];
 const s=dono?(sub.acessos||'usuarios'):'usuarios';
 const tabs=dono?`<nav class="subtabs" role="tablist" aria-label="Seções de acessos">${[['usuarios','Usuários'],['empresas','Empresas']].map(([k,l])=>`<button type="button" role="tab" class="subtab ${s===k?'active':''}" data-sub="${k}" aria-selected="${s===k}">${l}</button>`).join('')}</nav>`:'';
 return head+tabs+(s==='empresas'?accEmpresasView(emps):accUsuariosView(emps,dono));
}
function accEmpresasView(emps){
 return `<div class="acc-grid"><section class="card"><h3 class="card-title">Nova empresa</h3><p class="muted-small">A empresa nasce zerada, só com as regras padrão (faixas de bonificação, níveis, horários e jornada). Depois cadastre o administrador dela em Usuários.</p>
  <form id="accEmpresaForm" class="acc-form"><div class="field"><label for="accEmpNome">Nome da empresa</label><input class="input" id="accEmpNome" name="nome" required maxlength="120" autocomplete="organization"></div>
  <div class="field"><label for="accEmpDoc">CNPJ (opcional)</label><input class="input" id="accEmpDoc" name="documento" maxlength="20" inputmode="numeric"></div>
  <div class="field"><label for="accEmpLim">Limite de acessos</label><input class="input" id="accEmpLim" name="limite" type="number" min="1" step="1" inputmode="numeric" placeholder="Sem limite"><small class="muted-small">Quantos logins ativos a empresa pode ter. Em branco = sem limite.</small></div>
  <button type="submit" class="btn btn-primary">Criar empresa</button></form></section>
  <section class="acc-list">${emps.map(e=>`<article class="card acc-emp ${e.ativo?'':'is-off'}"><div class="acc-emp-top"><div><h3>${esc(e.nome)}${e.plataforma?' <span class="pill">plataforma</span>':''}${e.id===accData.minhaEmpresa?' <span class="pill">sua empresa</span>':''}</h3><small>${e.documento?esc(e.documento)+' · ':''}desde ${esc(fDate(e.criadaEm))}</small></div>
   <span class="acc-status ${e.ativo?'on':'off'}">${e.ativo?'Ativa':'Bloqueada'}</span></div>
   <div class="acc-nums"><span class="${accCheio(e)?'acc-cheio':''}"><b>${fNum(e.ativos??e.usuarios.filter(u=>u.ativo).length)}</b>${e.limite?' de <b>'+fNum(e.limite)+'</b>':''} acesso(s) ativo(s)${e.limite?'':' · sem limite'}</span><span><b>${fNum(e.funcionarios)}</b> funcionário(s)</span><span><b>${fNum(e.lancamentos)}</b> apontamento(s)</span></div>
   <div class="acc-actions"><button class="btn btn-sm" data-action="acc-ver-usuarios" data-id="${esc(e.id)}">Usuários</button><button class="btn btn-sm" data-action="acc-renomear" data-id="${esc(e.id)}">Editar dados e limite</button>
   ${e.plataforma||e.id===accData.minhaEmpresa?'':`<button class="btn btn-sm ${e.ativo?'btn-danger-soft':''}" data-action="acc-empresa-ativo" data-id="${esc(e.id)}" data-on="${e.ativo?'0':'1'}">${e.ativo?'Bloquear acesso':'Reativar'}</button>`}</div></article>`).join('')}</section></div>`;
}
function accUsuariosView(emps,dono){
 const emp=emps.find(e=>e.id===accEmpresa)||emps[0];if(!emp)return '<div class="notice">Nenhuma empresa encontrada.</div>';
 const eu=String(authorizedEmail||'').toLowerCase();
 const sel=dono?`<div class="field acc-emp-sel"><label for="accEmpSel">Empresa</label><select class="select" id="accEmpSel">${emps.map(e=>`<option value="${esc(e.id)}" ${e.id===emp.id?'selected':''}>${esc(e.nome)}${e.ativo?'':' (bloqueada)'}</option>`).join('')}</select></div>`:'';
 const rows=emp.usuarios.map(u=>{const me=u.email===eu;return `<div class="acc-user ${u.ativo?'':'row-off'}"><div class="acc-u-id"><b>${esc(u.nome||u.email.split('@')[0])}</b>${u.dono?' <span class="pill">dono da plataforma</span>':''}${me?' <span class="pill">você</span>':''}<small class="muted-small">${esc(u.email)}</small></div>
  <div class="acc-u-perfil"><select class="select acc-perfil" data-email="${esc(u.email)}" ${me||u.dono?'disabled':''} aria-label="Perfil de ${esc(u.email)}">${Object.entries(PERFIL_TXT).map(([k,l])=>`<option value="${k}" ${u.perfil===k?'selected':''}>${l}</option>`).join('')}</select></div>
  <div class="acc-u-sit"><span class="acc-status ${u.ativo?'on':'off'}">${u.ativo?'Ativo':'Bloqueado'}</span></div>
  <div class="acc-row-actions">${me||u.dono?'':`<button class="btn btn-sm" data-action="acc-usuario-ativo" data-email="${esc(u.email)}" data-on="${u.ativo?'0':'1'}" ${!u.ativo&&accCheio(emp)?'disabled title="Limite de acessos atingido"':''}>${u.ativo?'Bloquear':'Reativar'}</button>`}${u.dono&&!me?'':`<button class="btn btn-sm" data-action="acc-senha" data-email="${esc(u.email)}">Trocar senha</button>`}</div></div>`}).join('');
 return `${sel}<div class="acc-grid"><section class="card"><h3 class="card-title">Novo usuário${dono?' em '+esc(emp.nome):''}</h3>
  <p class="acc-uso ${accCheio(emp)?'acc-cheio':''}">${accUsoTxt(emp)}</p>
  ${accCheio(emp)?`<div class="notice">Limite de acessos atingido. ${dono?'Aumente o limite em Empresas → Editar dados e limite, ou bloqueie':'Bloqueie'} um usuário para liberar uma vaga${dono?'':', ou peça à FACSIM para ampliar o limite'}.</div>`:''}
  <form id="accUserForm" class="acc-form"><input type="hidden" name="empresa" value="${esc(emp.id)}">
  <div class="field"><label for="accNome">Nome</label><input class="input" id="accNome" name="nome" maxlength="80" autocomplete="off"></div>
  <div class="field"><label for="accEmail">E-mail de login</label><input class="input" id="accEmail" name="email" type="email" required autocomplete="off"></div>
  <div class="field"><label for="accPerfil">Perfil</label><select class="select" id="accPerfil" name="perfil">${Object.entries(PERFIL_TXT).map(([k,l])=>`<option value="${k}" ${k==='editor'?'selected':''}>${l} — ${PERFIL_DESC[k]}</option>`).join('')}</select></div>
  <div class="field"><label for="accSenha">Senha inicial</label><div class="acc-pass"><input class="input" id="accSenha" name="senha" type="text" minlength="8" required autocomplete="new-password" value="${senhaForte()}"><button type="button" class="btn btn-sm" data-action="acc-gerar-senha">Gerar outra</button></div><small class="muted-small">Mínimo de 8 caracteres. Passe a senha para a pessoa por um canal seguro.</small></div>
  <button type="submit" class="btn btn-primary" ${accBusy||accCheio(emp)?'disabled':''}>Criar login</button></form></section>
  <section class="card"><div class="acc-head"><h3 class="card-title">Usuários de ${esc(emp.nome)}</h3><span class="muted-small">${fNum(emp.usuarios.length)} cadastrado(s)</span></div>
  ${emp.usuarios.length?`<div class="acc-users">${rows}</div>`:'<p class="muted">Nenhum usuário ainda. Cadastre o primeiro administrador ao lado.</p>'}
  <div class="notice acc-note"><b>Perfis:</b> ${Object.entries(PERFIL_TXT).map(([k,l])=>`${l} — ${PERFIL_DESC[k].toLowerCase()}`).join(' · ')}.</div></section></div>`;
}
async function accRun(fn,msg){
 if(accBusy)return;accBusy=true;
 try{const r=await fn();toast(r?.aviso||msg);await loadAcessos(true);}
 catch(e){toast(e.message||String(e));}
 finally{accBusy=false;if(page==='acessos')render();}
}
function accCriarUsuario(form){
 const fd=new FormData(form),v=k=>String(fd.get(k)||'').trim();
 if(v('senha').length<8){toast('A senha precisa ter pelo menos 8 caracteres.');return;}
 const payload={acao:'criar',empresa:v('empresa'),nome:v('nome'),email:v('email').toLowerCase(),perfil:v('perfil'),senha:v('senha')};
 accRun(()=>window.GUT_API.acessoFn(payload),'Login criado. Passe o e-mail e a senha inicial para '+(payload.nome||payload.email)+'.');
}
function accCriarEmpresa(form){
 const fd=new FormData(form),nome=String(fd.get('nome')||'').trim();if(!nome)return;
 accRun(async()=>{const r=await window.GUT_API.empresaSave({nome,documento:String(fd.get('documento')||'').trim(),limite:String(fd.get('limite')||'').trim()});accEmpresa=r.id;sub.acessos='usuarios';return r;},'Empresa '+nome+' criada. Agora cadastre o administrador dela.');
}
function accClick(action,el){
 switch(action){
  case 'imp-baixar-dados':impBaixar(true);return true;
  case 'imp-baixar-modelo':impBaixar(false);return true;
  case 'imp-gravar':impGravar();return true;
  case 'acc-recarregar':accData=null;accErr='';loadAcessos(true);render();return true;
  case 'acc-gerar-senha':{const i=$('#accSenha');if(i)i.value=senhaForte();return true;}
  case 'acc-ver-usuarios':accEmpresa=el.dataset.id;sub.acessos='usuarios';render();return true;
  case 'acc-empresa-ativo':{const on=el.dataset.on==='1',e=accData.empresas.find(x=>x.id===el.dataset.id);
   if(!on&&!confirmar(`Bloquear o acesso de ${e?.nome}? Os usuários dela deixam de entrar, mas nenhum dado é apagado.`))return true;
   accRun(()=>window.GUT_API.empresaSave({id:el.dataset.id,ativo:on}),on?'Empresa reativada.':'Acesso da empresa bloqueado.');return true;}
  case 'acc-renomear':{const e=accData.empresas.find(x=>x.id===el.dataset.id);
   showModal('Editar empresa',esc(e?.nome||''),`<input type="hidden" name="id" value="${esc(el.dataset.id)}"><div class="field"><label for="accRen">Nome</label><input class="input" id="accRen" name="nome" required value="${esc(e?.nome||'')}"></div><div class="field"><label for="accRenDoc">CNPJ</label><input class="input" id="accRenDoc" name="documento" value="${esc(e?.documento||'')}"></div><div class="field"><label for="accRenLim">Limite de acessos ativos</label><input class="input" id="accRenLim" name="limite" type="number" min="1" step="1" placeholder="Sem limite" value="${e?.limite?esc(e.limite):''}"><small class="muted-small">Hoje em uso: ${fNum(accAtivos(e||{usuarios:[]}))}. Em branco = sem limite.</small></div>`,'Salvar','acc_empresa');return true;}
  case 'acc-usuario-ativo':{const on=el.dataset.on==='1';
   if(!on&&!confirmar(`Bloquear ${el.dataset.email}? A pessoa não consegue mais entrar até ser reativada.`))return true;
   accRun(()=>window.GUT_API.acessoSave({email:el.dataset.email,ativo:on}),on?'Usuário reativado.':'Usuário bloqueado.');return true;}
  case 'acc-senha':
   showModal('Trocar senha',esc(el.dataset.email),`<input type="hidden" name="email" value="${esc(el.dataset.email)}"><div class="field"><label for="accNova">Nova senha</label><input class="input" id="accNova" name="senha" type="text" minlength="8" required autocomplete="new-password" value="${senhaForte()}"></div><p class="muted-small">A senha antiga deixa de valer na hora. Passe a nova por um canal seguro.</p>`,'Trocar senha','acc_senha');return true;
 }
 return false;
}
function confirmar(msg){try{return window.confirm(msg)}catch(_){return true}}

/* ===================== IMPORTAR PLANILHA ===================== */
let impState={arquivo:'',dados:null,previa:null,resultado:null,busy:false,erro:''};
const IMP_ABAS=[
 {aba:'Setores',chave:'setores',cols:[['setor','Setor']],larg:[30]},
 {aba:'Grupos',chave:'grupos',cols:[['setor','Setor'],['grupo','Grupo'],['codigo','Código']],larg:[26,26,14]},
 {aba:'Operações',chave:'operacoes',cols:[['operacao','Operação'],['codigo','Código']],larg:[34,14]},
 {aba:'Produtos',chave:'produtos',cols:[['produto','Produto'],['codigo','Código']],larg:[40,14]},
 {aba:'Roteiro',chave:'roteiro',cols:[['produto','Produto (nome ou código)'],['etapa','Etapa'],['operacao','Operação (nome ou código)'],['tempo','Tempo padrão (segundos)'],['final','Operação final (Sim/Não)']],larg:[34,8,32,22,22]},
 {aba:'Funcionários',chave:'funcionarios',cols:[['nome','Nome'],['matricula','Matrícula'],['setor','Setor'],['grupo','Grupo'],['admissao','Admissão (dd/mm/aaaa)']],larg:[34,14,24,24,20]},
 {aba:'Operações por funcionário',chave:'habilidades',cols:[['funcionario','Funcionário (nome ou matrícula)'],['produto','Produto (nome ou código)'],['operacao','Operação (nome ou código)']],larg:[34,34,32]}
];
const IMP_ROTULO={setores:'setores',grupos:'grupos',operacoes:'operações',produtos:'produtos',roteiro:'etapas de roteiro',finais:'operações finais',funcionarios:'funcionários',habilidades:'operações por funcionário'};
function impLinhasAtuais(chave){
 const nm=(c,id)=>byId(c,id)?.nome||'';
 switch(chave){
  case 'setores':return (data.setores||[]).map(s=>[s.nome]);
  case 'grupos':return (data.grupos||[]).map(g=>[nm('setores',g.setor),g.nome,g.codigo||'']);
  case 'operacoes':return (data.processos||[]).map(p=>[p.nome,p.codigo||'']);
  case 'produtos':return (data.produtos||[]).map(p=>[p.nome,p.codigo||'']);
  case 'roteiro':return (data.roteiro||[]).map(r=>[nm('produtos',r.produto),Number(r.etapa)||'',nm('processos',r.processo),Number(r.tempo)||'',r.final?'Sim':'']);
  case 'funcionarios':return (data.funcionarios||[]).map(f=>[f.nome,f.matricula||'',nm('setores',f.setor),nm('grupos',f.grupo),f.admissao?fDate(f.admissao):'']);
  case 'habilidades':{const out=[];(data.funcionarios||[]).forEach(f=>(f.operacoes||[]).forEach(rid=>{const r=byId('roteiro',rid);if(r)out.push([f.matricula||f.nome,nm('produtos',r.produto),nm('processos',r.processo)]);}));return out;}
 }
 return [];
}
function impBaixar(comDados){
 if(!window.GUT_XLSX){toast('Gerador de planilha não carregou. Recarregue a página.');return;}
 const exemplo={setores:[['Costura'],['Acabamento']],grupos:[['Costura','Célula 1','C1']],operacoes:[['Fechar ombro','OP01'],['Embalar','OP09']],produtos:[['Camiseta básica','CAM01']],
  roteiro:[['Camiseta básica',1,'Fechar ombro',40,''],['Camiseta básica',2,'Embalar',25,'Sim']],funcionarios:[['Maria da Silva','001','Costura','Célula 1','10/03/2025']],habilidades:[['001','Camiseta básica','Fechar ombro']]};
 const inst=[['Como preencher'],
  ['1. Preencha as abas na ordem: Setores, Grupos, Operações, Produtos, Roteiro, Funcionários, Operações por funcionário.'],
  ['2. Não mude os nomes das abas nem a primeira linha (cabeçalho). Uma informação por linha.'],
  ['3. Roteiro: cada linha é uma etapa do produto, com o tempo padrão em segundos por peça. Marque "Sim" na última operação (peça pronta).'],
  ['4. Funcionários: a matrícula é opcional, mas evita confusão entre nomes iguais.'],
  ['5. Operações por funcionário: diga o que cada pessoa sabe fazer. Isso alimenta os tempos individuais e as sugestões do painel de gargalos.'],
  ['6. A importação só ACRESCENTA o que ainda não existe. Nada já cadastrado é alterado ou apagado.'],
  ['7. Antes de gravar, o sistema mostra uma prévia com o que será criado e os avisos por linha.'],
  [''],[comDados?'Esta planilha já vem com os cadastros atuais da empresa '+(data.empresa?.nome||'')+'. Acrescente as linhas novas e importe de volta.':'Modelo em branco com exemplos. Apague os exemplos antes de importar.']];
 const sheets=[{name:'Instruções',rows:inst,widths:[120],freeze:false},...IMP_ABAS.map(a=>({name:a.aba,widths:a.larg,rows:[a.cols.map(c=>c[1]),...(comDados?impLinhasAtuais(a.chave):exemplo[a.chave])]}))];
 const blob=window.GUT_XLSX.write(sheets),url=URL.createObjectURL(blob),a=document.createElement('a');
 const nome=(data.empresa?.nome||'empresa').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]+/g,'-').toLowerCase();
 a.href=url;a.download=comDados?`cadastros-${nome}-${new Date().toISOString().slice(0,10)}.xlsx`:'modelo-cadastro-facsim.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
 toast(comDados?'Planilha com os cadastros atuais baixada.':'Modelo em branco baixado.');
}
const impNorm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
function impValor(v,campo){
 if(v===null||v===undefined)return '';
 if(campo==='admissao'){
  if(typeof v==='number'&&v>20000&&v<80000){const d=new Date(Math.round((v-25569)*864e5));return d.toISOString().slice(0,10);}
  const m=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(String(v).trim());if(m){const y=m[3].length===2?'20'+m[3]:m[3];return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}
  return /^\d{4}-\d{2}-\d{2}/.test(String(v))?String(v).slice(0,10):'';
 }
 if(typeof v==='number')return String(+v.toFixed(4));
 return String(v).trim();
}
async function impLerArquivo(file){
 impState={arquivo:file.name,dados:null,previa:null,resultado:null,busy:true,erro:''};render();
 try{
  if(!/\.xlsx$/i.test(file.name))throw new Error('Envie o arquivo no formato .xlsx (no Excel: Salvar como → Pasta de Trabalho do Excel).');
  if(file.size>8*1024*1024)throw new Error('Arquivo muito grande (máximo 8 MB).');
  const abas=await window.GUT_XLSX.read(await file.arrayBuffer());
  const porNome={};Object.keys(abas).forEach(k=>porNome[impNorm(k)]=abas[k]);
  const dados={},faltando=[];
  for(const a of IMP_ABAS){
   const rows=porNome[impNorm(a.aba)];if(!rows){faltando.push(a.aba);dados[a.chave]=[];continue;}
   const head=(rows[0]||[]).map(impNorm);
   const idx=a.cols.map(([k,l])=>{const want=impNorm(l),short=impNorm(l.split('(')[0]);let i=head.indexOf(want);if(i<0)i=head.findIndex(h=>h&&h.startsWith(short));return i;});
   dados[a.chave]=rows.slice(1).map((r,i)=>{const o={linha:i+2};a.cols.forEach(([k],j)=>{o[k]=idx[j]>=0?impValor(r[idx[j]],k):'';});return o;})
    .filter(o=>a.cols.some(([k])=>o[k]!==''));
  }
  if(IMP_ABAS.every(a=>!dados[a.chave].length))throw new Error('Não encontrei dados nas abas do modelo. Use a planilha baixada aqui, sem renomear as abas.');
  impState.dados=dados;impState.faltando=faltando;
  impState.previa=await window.GUT_API.importar({...dados,simular:true});
 }catch(e){impState.erro=e.message||String(e);}
 impState.busy=false;render();
}
async function impGravar(){
 if(!impState.dados||impState.busy)return;
 impState.busy=true;render();
 try{impState.resultado=await window.GUT_API.importar(impState.dados);impState.previa=null;await loadData();toast('Importação concluída.');}
 catch(e){impState.erro=e.message||String(e);}
 impState.busy=false;render();
}
function impResumo(r,titulo){
 const c=r.contagem||{},chaves=Object.keys(IMP_ROTULO),novos=chaves.filter(k=>c[k]),exist=chaves.filter(k=>c[k+'_existentes']);
 return `<section class="card imp-card"><h3 class="card-title">${titulo}</h3>
  ${novos.length?`<div class="imp-nums">${novos.map(k=>`<div><b>${fNum(c[k])}</b><span>${IMP_ROTULO[k]}</span></div>`).join('')}</div>`:'<p class="muted">Nada novo para cadastrar.</p>'}
  ${exist.length?`<p class="muted-small">Já existiam e foram mantidos como estão: ${exist.map(k=>fNum(c[k+'_existentes'])+' '+IMP_ROTULO[k]).join(' · ')}.</p>`:''}
  ${(r.avisos||[]).length?`<div class="imp-avisos"><b>${fNum(r.avisos.length)} aviso(s) — essas linhas ${r.simulado?'não serão':'não foram'} importadas:</b><ul>${r.avisos.slice(0,60).map(a=>`<li>${esc(a)}</li>`).join('')}</ul>${r.avisos.length>60?'<small>…e mais '+(r.avisos.length-60)+'.</small>':''}</div>`:''}</section>`;
}
function importar(){
 const head=title('Importar planilha','Cadastro em massa para começar a usar o sistema: estrutura, operações, produtos, roteiros e funcionários.');
 if(data.perfil!=='admin')return head+'<div class="notice">Somente administradores importam planilhas.</div>';
 const s=impState;
 return head+`<div class="imp-steps">
  <section class="card imp-card"><span class="imp-n">1</span><h3 class="card-title">Baixe a planilha</h3><p class="muted-small">Use a planilha com os cadastros atuais para acrescentar linhas, ou o modelo em branco com exemplos.</p>
   <div class="imp-btns"><button class="btn btn-primary" data-action="imp-baixar-dados">Planilha com os dados atuais</button><button class="btn" data-action="imp-baixar-modelo">Modelo em branco</button></div></section>
  <section class="card imp-card"><span class="imp-n">2</span><h3 class="card-title">Preencha e envie</h3><p class="muted-small">Abas: ${IMP_ABAS.map(a=>esc(a.aba)).join(', ')}. Formato .xlsx.</p>
   <label class="imp-drop ${s.busy?'is-busy':''}" for="impFile"><input type="file" id="impFile" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ${s.busy?'disabled':''}><b>${s.busy?'Processando…':s.arquivo?esc(s.arquivo):'Escolher arquivo .xlsx'}</b><small>${s.arquivo&&!s.busy?'Clique para escolher outro':'ou arraste para cá'}</small></label></section>
  <section class="card imp-card"><span class="imp-n">3</span><h3 class="card-title">Confira e grave</h3><p class="muted-small">A prévia mostra o que será criado. Só acrescenta o que falta: nada existente é alterado ou apagado.</p>
   <button class="btn btn-primary" data-action="imp-gravar" ${s.previa&&!s.busy?'':'disabled'}>Gravar no sistema</button></section></div>
  ${s.erro?`<div class="login-error" role="alert">${esc(s.erro)}</div>`:''}
  ${s.faltando?.length&&s.previa?`<div class="notice">Abas não encontradas no arquivo (ignoradas): ${s.faltando.map(esc).join(', ')}.</div>`:''}
  ${s.previa?impResumo(s.previa,'Prévia da importação'):''}
  ${s.resultado?impResumo(s.resultado,'Importação concluída'):''}`;
}

/* ===================== APONTAMENTOS ===================== */
function lancamentos(){
 const head=title('Apontamentos','Registre produção e ausências e consulte o histórico.')+subtabs();
 if(sub.lancamentos==='historico')return head+historico();
 if(sub.lancamentos==='ausencias')return head+ausenciasLista();
 if(sub.lancamentos==='horarios')return head+horariosJornada();
 return head+apontar();
}
function historico(){
 const rows=filteredRows(filters).sort((a,b)=>(b.data+b.fim+String(b.id).padStart(10,'0')).localeCompare(a.data+a.fim+String(a.id).padStart(10,'0')));
 const total=sums(rows);
 const active=Object.values(filters).filter(Boolean).length;
 return '<div class="card controls-panel"><details class="filter-box" id="filterBox"'+(filtersOpen?' open':'')+'><summary>Filtros'+(active?' <span class="pill blue">'+active+' ativo(s)</span>':'')+'</summary><div class="filters">'+
 '<label class="inline-date">De <input class="input" aria-label="Data inicial" type="date" id="filterInicio" value="'+esc(filters.inicio)+'"></label>'+
 '<label class="inline-date">Até <input class="input" aria-label="Data final" type="date" id="filterFim" value="'+esc(filters.fim)+'"></label>'+
 '<select class="select" id="filterFuncionario" aria-label="Filtrar funcionário">'+selectOpts('funcionarios',filters.funcionario,true,'Todos os funcionários')+'</select>'+
 '<select class="select" id="filterProduto" aria-label="Filtrar produto">'+selectOpts('produtos',filters.produto,true,'Todos os produtos')+'</select>'+
 '<select class="select" id="filterProcesso" aria-label="Filtrar operação">'+selectOpts('processos',filters.processo,true,'Todas as operações')+'</select>'+
 '<select class="select" id="filterSetor" aria-label="Filtrar setor">'+selectOpts('setores',filters.setor,true,'Todos os setores')+'</select>'+
 '<select class="select" id="filterGrupo" aria-label="Filtrar grupo"><option value="">Todos os grupos</option>'+(data.grupos||[]).filter(g=>!filters.setor||g.setor===filters.setor).map(g=>'<option value="'+esc(g.id)+'" '+(g.id===filters.grupo?'selected':'')+'>'+esc(g.nome)+'</option>').join('')+'</select>'+
 '<button class="btn btn-ghost" data-action="limpar-filtros">Limpar filtros</button></div></details>'+
 '<button class="btn btn-sm" data-action="exportar-csv">⇩ CSV</button>'+
 '<div class="stats-row"><span><b>'+total.total+'</b> registros</span><span><b>'+fNum(total.realizado)+'</b> peças</span><span><b>'+pct(total.eff)+'</b> eficiência</span><span><b>'+fNum(rows.filter(isFinished).reduce((n,l)=>n+Number(l.realizado||0),0))+'</b> prontas</span></div></div>'+
 '<section class="card">'+tableApontamentos(rows)+'<div class="pagination">'+rows.length+' registro(s) • meta histórica preservada</div></section>';
}

/* --- Apontamento: produção, ausência e ausência coletiva --- */
const novoEntry=(d)=>({modo:'producao',data:d||todayLocal(),funcionario:'',produto:'',roteiro:'',slot:'',inicio:'',fim:'',custom:false,realizado:'',
 ausTipo:'falta',ausInicio:'',ausFim:'',motivo:'',colSetor:'',colInicio:'',colFim:''});
let entry=novoEntry();
function resetEntry(){entry=novoEntry(entry.data);lastPreview=null;}
let lastPreview=null,previewSeq=0,previewTimer=null;
const activeSlots=()=>(data.horarios||[]).filter(h=>h.ativo!==false).sort((a,b)=>toMin(a.inicio)-toMin(b.inicio));
const activeEmployees=()=>data.funcionarios.filter(f=>f.ativo!==false);
const dayEntries=()=>(data.lancamentos||[]).filter(l=>l.funcionario===entry.funcionario&&String(l.data)===entry.data).sort((a,b)=>toMin(a.inicio)-toMin(b.inicio));
const dayAbsences=(func,d)=>(data.ausencias||[]).filter(a=>a.funcionario===func&&String(a.data)===d).sort((a,b)=>toMin(a.inicio)-toMin(b.inicio));
const slotDone=s=>entry.funcionario&&(dayEntries().some(l=>overlaps(l.inicio,l.fim,s.inicio,s.fim))||dayAbsences(entry.funcionario,entry.data).some(a=>overlaps(a.inicio,a.fim,s.inicio,s.fim)));
const DIAS=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const dowOf=d=>new Date(String(d)+'T12:00:00').getDay();
const jornadaDo=d=>(data.jornada||[]).find(j=>Number(j.dia)===dowOf(d));
const hhmm=min=>{min=Math.round(Number(min)||0);return Math.floor(min/60)+'h'+String(min%60).padStart(2,'0')};
function minutosAusencia(ini,fim,d){
 if(!ini||!fim||toMin(fim)<=toMin(ini))return 0;
 let m=toMin(fim)-toMin(ini);const j=jornadaDo(d);
 if(j&&j.ativo&&j.intervaloInicio&&j.intervaloFim)m-=Math.max(0,Math.min(toMin(fim),toMin(j.intervaloFim))-Math.max(toMin(ini),toMin(j.intervaloInicio)));
 return Math.max(0,m);
}
function nextFreeSlot(){const list=activeSlots();return list.find(s=>!slotDone(s))||null}
/* Horário sugerido: hoje, a última faixa já encerrada (ex.: após 9h → 08–09).
   Se ela já foi apontada para o funcionário, sugere a faixa encerrada mais recente ainda pendente. */
function defaultSlot(){
 const list=activeSlots();if(!list.length)return null;
 if(entry.data!==todayLocal())return entry.data<todayLocal()?(nextFreeSlot()||list[0]):list[0];
 const now=new Date(),nowMin=now.getHours()*60+now.getMinutes();
 const ended=list.filter(s=>toMin(s.fim)>toMin(s.inicio)&&toMin(s.fim)<=nowMin);
 if(!ended.length)return list[0];
 const pend=ended.filter(s=>!slotDone(s));
 return pend.length?pend[pend.length-1]:ended[ended.length-1];
}
function ensureEntryDefaults(){
 if(entry.funcionario&&!activeEmployees().some(f=>f.id===entry.funcionario))entry.funcionario='';
 if(entry.produto&&!byId('produtos',entry.produto))entry.produto='';
 if(entry.roteiro&&!routeOf(entry.produto).some(r=>r.id===entry.roteiro))entry.roteiro='';
 if(!entry.custom){
  if(!activeSlots().some(s=>s.id===entry.slot))entry.slot=defaultSlot()?.id||'';
  const s=byId('horarios',entry.slot);
  if(s){entry.inicio=s.inicio;entry.fim=s.fim}else{entry.custom=true}
 }
}
function routeOptions(){
 if(!entry.produto)return '<option value="">Escolha o produto primeiro</option>';
 const rot=routeOf(entry.produto);if(!rot.length)return '<option value="">Produto sem operações no roteiro</option>';
 const mine=new Set(byId('funcionarios',entry.funcionario)?.operacoes||[]);
 const opt=r=>`<option value="${esc(r.id)}" ${r.id===entry.roteiro?'selected':''}>${esc(r.etapa||'—')}. ${esc(byId('processos',r.processo)?.nome||r.processo)}${r.final?' (final)':''}</option>`;
 const a=rot.filter(r=>mine.has(r.id)),b=rot.filter(r=>!mine.has(r.id));
 return '<option value="">Selecione a operação</option>'+(!a.length?rot.map(opt).join(''):
  `<optgroup label="Operações do funcionário">${a.map(opt).join('')}</optgroup>`+(b.length?`<optgroup label="Outras operações">${b.map(opt).join('')}</optgroup>`:''));
}
function slotChips(){
 const slots=activeSlots();
 return slots.map(s=>{const done=slotDone(s),on=!entry.custom&&entry.slot===s.id;return `<button type="button" class="slot-chip${on?' active':''}${done?' done':''}" data-slot="${esc(s.id)}" aria-pressed="${on}" title="${done?'Já existe apontamento ou ausência neste horário':'Horário livre'}">${hourLabel(s.inicio,s.fim)}${done?' <span aria-hidden="true">✓</span>':''}</button>`}).join('')+
 `<button type="button" class="slot-chip slot-custom${entry.custom?' active':''}" data-slot="custom" aria-pressed="${entry.custom}">✎ Outro horário</button>`;
}
const AUS_LABEL={falta:'Falta',parcial:'Ausência',coletiva:'Ausência coletiva'};
function dayList(){
 if(entry.modo==='coletiva'){
  const lotes={};(data.ausencias||[]).filter(a=>a.tipo==='coletiva'&&String(a.data)===entry.data).forEach(a=>{(lotes[a.lote]=lotes[a.lote]||{...a,n:0}).n++});
  const L=Object.values(lotes).sort((a,b)=>toMin(a.inicio)-toMin(b.inicio));
  return `<div class="section-head"><div><h3 class="section-title">Ausências coletivas · ${esc(fDate(entry.data))}</h3><p class="section-sub">${L.length} lançamento(s) neste dia</p></div></div>`+
  (L.length?`<div class="day-list">${L.map(a=>`<div class="day-row aus-row"><span class="day-hour">${esc(a.inicio)}–${esc(a.fim)}</span><span class="day-op">${esc(a.motivo||'Ausência coletiva')}<small>${a.n} funcionário(s) · ${hhmm(a.minutos)} cada</small></span><span></span><button type="button" class="text-btn danger-btn" data-edit data-action="aus-excluir-lote" data-id="${esc(a.lote)}">Excluir</button></div>`).join('')}</div>`:'<p class="muted-small day-empty">Nenhuma ausência coletiva nesta data.</p>');
 }
 if(!entry.funcionario)return '<p class="muted-small day-empty day-hint">Escolha um funcionário para ver os apontamentos e ausências dele no dia.</p>';
 const rows=dayEntries(),aus=dayAbsences(entry.funcionario,entry.data);const person=byId('funcionarios',entry.funcionario);const t=sums(rows);
 const minAus=aus.reduce((n,a)=>n+Number(a.minutos||0),0);
 const itens=[...rows.map(l=>({k:'p',ini:l.inicio,l})),...aus.map(a=>({k:'a',ini:a.inicio,a}))].sort((x,y)=>toMin(x.ini)-toMin(y.ini));
 return `<div class="section-head"><div><h3 class="section-title">${esc(first(person?.nome)||'Funcionário')} · ${esc(fDate(entry.data))}</h3><p class="section-sub">${rows.length} apontamento(s) · ${fNum(t.realizado)} peças · ${pct(t.eff)}${minAus?' · ausente '+hhmm(minAus):''}</p></div></div>`+
 (itens.length?`<div class="day-list">${itens.map(it=>{
  if(it.k==='a'){const a=it.a;return `<div class="day-row aus-row"><span class="day-hour">${esc(a.inicio)}–${esc(a.fim)}</span><span class="day-op">${esc(AUS_LABEL[a.tipo]||'Ausência')}${a.motivo&&a.motivo!==AUS_LABEL[a.tipo]?' · '+esc(a.motivo):''}<small>${hhmm(a.minutos)} sem produção${a.tipo==='falta'?' · entrou nas faltas da bonificação':''}</small></span><span></span>${a.tipo==='coletiva'?'<span class="pill grey">coletiva</span>':`<button type="button" class="text-btn danger-btn" data-edit data-action="aus-excluir" data-id="${esc(a.id)}">Excluir</button>`}</div>`}
  const l=it.l,eff=l.metaSnapshot?l.realizado*100/l.metaSnapshot:null;return `<div class="day-row"><span class="day-hour">${esc(l.inicio)}–${esc(l.fim)}</span><span class="day-op">${esc(byId('processos',l.processo)?.nome||'—')}<small>${esc(byId('produtos',l.produto)?.nome||'')}</small></span><span class="day-qty">${fNum(l.realizado)}<small>/ ${fNum(l.metaSnapshot)}</small></span>${effPill(eff)}</div>`}).join('')}</div>`
 :'<p class="muted-small day-empty">Nenhum apontamento deste funcionário nesta data.</p>');
}
function funcOptions(){return '<option value="">Selecione o funcionário</option>'+activeEmployees().map(f=>`<option value="${esc(f.id)}" ${f.id===entry.funcionario?'selected':''}>${esc(f.nome)}</option>`).join('')}
function jornadaTxt(d){
 const j=jornadaDo(d);
 if(!j||!j.ativo)return `<div class="aus-info warn">⚠ ${esc(DIAS[dowOf(d)])} não tem jornada ativa. Ajuste em <b>Horários e jornada</b>.</div>`;
 return `<div class="aus-info">Turno de ${esc(DIAS[dowOf(d)].toLowerCase())}: <b>${esc(j.entrada)}–${esc(j.saida)}</b>${j.intervaloInicio?` · intervalo ${esc(j.intervaloInicio)}–${esc(j.intervaloFim)}`:''} · <b>${hhmm(j.minutos)}</b> de jornada.<br><small>A falta também é registrada em Bonificação → Faltas.</small></div>`;
}
function apontar(){
 if(!canEdit())return '<div class="notice">Seu perfil é somente leitura. Consulte a aba Histórico.</div>';
 if(!activeEmployees().length)return '<div class="notice">Cadastre funcionários antes de apontar.</div>';
 ensureEntryDefaults();
 const modo=entry.modo;
 const tabs=`<div class="modo-tabs" role="tablist">${[['producao','▤ Produção'],['ausencia','⏸ Ausência'],['coletiva','👥 Ausência coletiva']].map(([k,l])=>`<button type="button" role="tab" class="modo-tab${modo===k?' active':''}" data-modo="${k}" aria-selected="${modo===k}">${l}</button>`).join('')}</div>`;
 const dataField=`<div class="field"><label for="entryData">Data</label><input class="input" type="date" id="entryData" value="${esc(entry.data)}" required></div>`;
 const funcField=`<div class="field"><label for="entryFuncionario">Funcionário</label><select class="select" id="entryFuncionario" required>${funcOptions()}</select></div>`;
 let body='';
 if(modo==='producao'){
  if(!data.produtos.length)body='<div class="notice">Cadastre produtos com operações antes de apontar produção.</div>';
  else body=`<div class="entry-grid">${dataField}${funcField}
  <div class="field"><label for="entryProduto">Produto</label><select class="select" id="entryProduto" required><option value="">Selecione o produto</option>${data.produtos.map(p=>`<option value="${esc(p.id)}" ${p.id===entry.produto?'selected':''}>${esc(p.nome)}</option>`).join('')}</select></div>
  <div class="field"><label for="entryRoteiro">Operação</label><select class="select" id="entryRoteiro" required ${entry.produto?'':'disabled'}>${routeOptions()}</select></div>
 </div>
 <div class="field"><label>Horário</label><div class="slot-chips" id="slotChips">${slotChips()}</div>
  <div class="custom-time${entry.custom?'':' hidden'}" id="customTime">
   <label class="inline-date">Início <input class="input" type="time" id="entryInicio" value="${esc(entry.inicio)}"></label>
   <label class="inline-date">Fim <input class="input" type="time" id="entryFim" value="${esc(entry.fim)}"></label>
   <small class="muted-small">Use para períodos quebrados ou duas operações na mesma hora.</small>
  </div></div>
 <div class="entry-bottom">
  <div class="field qty-field"><label for="entryRealizado">Peças realizadas</label><input class="input qty-input" type="number" inputmode="numeric" min="0" step="1" id="entryRealizado" value="${esc(entry.realizado)}" placeholder="0" required></div>
  <div class="entry-preview" id="entryPreview"></div>
  <button type="submit" class="btn btn-primary entry-submit">Registrar apontamento</button>
 </div>`;
 }else if(modo==='ausencia'){
  const min=minutosAusencia(entry.ausInicio,entry.ausFim,entry.data);
  body=`<div class="entry-grid aus-grid">${dataField}${funcField}</div>
 <div class="field"><label>Tipo de ausência</label><div class="aus-tipos">
  <button type="button" class="aus-tipo${entry.ausTipo==='falta'?' active':''}" data-austipo="falta"><b>Falta</b><small>dia inteiro — usa o turno do dia</small></button>
  <button type="button" class="aus-tipo${entry.ausTipo==='parcial'?' active':''}" data-austipo="parcial"><b>Ausência parcial</b><small>saiu cedo, chegou tarde, consulta…</small></button></div></div>
 ${entry.ausTipo==='falta'?jornadaTxt(entry.data):`<div class="custom-time"><label class="inline-date">Início <input class="input" type="time" id="ausInicio" value="${esc(entry.ausInicio)}" required></label><label class="inline-date">Fim <input class="input" type="time" id="ausFim" value="${esc(entry.ausFim)}" required></label><small class="muted-small" id="ausMin">${min?hhmm(min)+' de ausência (sem contar o intervalo)':'Informe o horário em que a pessoa não trabalhou.'}</small></div>`}
 <div class="entry-bottom aus-bottom"><div class="field"><label for="ausMotivo">Motivo (opcional)</label><input class="input" id="ausMotivo" value="${esc(entry.motivo)}" placeholder="${entry.ausTipo==='falta'?'Ex.: atestado, falta sem aviso':'Ex.: saiu mais cedo, consulta médica'}"></div>
 <button type="submit" class="btn btn-primary entry-submit">${entry.ausTipo==='falta'?'Registrar falta':'Registrar ausência'}</button></div>
 <p class="muted-small aus-nota">A ausência não altera a eficiência do funcionário; ela entra na eficiência da empresa.</p>`;
 }else{
  const alvo=activeEmployees().filter(f=>!entry.colSetor||f.setor===entry.colSetor).filter(f=>!dayAbsences(f.id,entry.data).some(a=>a.tipo==='falta')).length;
  const min=minutosAusencia(entry.colInicio,entry.colFim,entry.data);
  body=`<div class="entry-grid">${dataField}
  <div class="field"><label for="colInicio">Início</label><input class="input" type="time" id="colInicio" value="${esc(entry.colInicio)}" required></div>
  <div class="field"><label for="colFim">Fim</label><input class="input" type="time" id="colFim" value="${esc(entry.colFim)}" required></div>
  <div class="field"><label for="colSetor">Para quem</label><select class="select" id="colSetor"><option value="">Todos os funcionários</option>${data.setores.map(s=>`<option value="${esc(s.id)}" ${s.id===entry.colSetor?'selected':''}>Setor ${esc(s.nome)}</option>`).join('')}</select></div></div>
 <div class="entry-bottom aus-bottom"><div class="field"><label for="ausMotivo">Motivo</label><input class="input" id="ausMotivo" value="${esc(entry.motivo)}" placeholder="Ex.: café, reunião, falta de energia"></div>
 <button type="submit" class="btn btn-primary entry-submit" id="colSubmit">Lançar para ${alvo} funcionário(s)</button></div>
 <p class="muted-small aus-nota" id="colInfo">${min?hhmm(min)+' para cada um. ':''}Não altera a eficiência de ninguém; entra só na eficiência da empresa. Quem tem falta no dia fica de fora.</p>`;
 }
 return `<section class="card entry-card">${tabs}<form id="entryForm" class="entry-form" autocomplete="off">${body}</form></section>
 <section class="card" id="entryDay">${dayList()}</section>`;
}
function refreshEntry(opts={}){
 ensureEntryDefaults();
 const chips=$('#slotChips');if(chips)chips.innerHTML=slotChips();
 const ct=$('#customTime');if(ct&&entry.modo==='producao')ct.classList.toggle('hidden',!entry.custom);
 if(opts.route){const r=$('#entryRoteiro');if(r){r.innerHTML=routeOptions();r.disabled=!entry.produto;}}
 if(opts.times||!entry.custom){const i=$('#entryInicio'),f=$('#entryFim');if(i)i.value=entry.inicio;if(f)f.value=entry.fim;}
 const day=$('#entryDay');if(day)day.innerHTML=dayList();
 if(entry.modo==='producao')schedulePreview();
}
function localPreview(){
 const r=byId('roteiro',entry.roteiro);if(!r)return null;
 const t=getTime(entry.funcionario,entry.produto,r.processo);
 const min=entry.inicio&&entry.fim?minutesBetween(entry.inicio,entry.fim):null;
 return {ok:true,segundos:t?.segundos,fonte:t?.fonte,nivel:t?.nivel,minutos:min,meta:min&&min<=720&&t?.segundos?Math.round(min*60/t.segundos):null,final:r.final,estimado:true};
}
function paintPreview(){
 const el=$('#entryPreview');if(!el)return;
 const p=lastPreview,raw=String($('#entryRealizado')?.value??'').trim(),done=Number(raw);
 const meta=p?.meta,eff=meta&&raw!==''?done*100/meta:null;
 el.innerHTML=`<div><strong>Tempo</strong><b>${p?.segundos?fNum(p.segundos,1)+' s':'—'}</b><small>${p?.fonte?(p.fonte==='individual'?'Individual':'Padrão')+(p.nivel?' · nível '+esc(p.nivel):''):'Escolha a operação'}</small></div>`+
 `<div><strong>Meta</strong><b>${meta!=null?fNum(meta):'—'}</b><small>${p?.minutos?fNum(p.minutos)+' min':'Verifique o horário'}</small></div>`+
 `<div><strong>Eficiência</strong><b class="${eff==null?'':eff>=100?'ok':eff>=85?'mid':'low'}">${pct(eff)}</b><small>${p?.final?'Operação final ✓':'&nbsp;'}</small></div>`;
}
function schedulePreview(){
 lastPreview=localPreview();paintPreview();
 clearTimeout(previewTimer);
 if(!window.GUT_API?.preview||!entry.roteiro||!entry.inicio||!entry.fim)return;
 previewTimer=setTimeout(async()=>{
  const seq=++previewSeq;
  try{const r=await window.GUT_API.preview({data:entry.data,funcionario:entry.funcionario,produto:entry.produto,roteiro:entry.roteiro,inicio:entry.inicio,fim:entry.fim});
   if(seq===previewSeq&&r?.ok){lastPreview=r;paintPreview();}}catch(_){/* mantém a estimativa local */}
 },250);
}
function afterEntryRender(){if(entry.modo==='producao')schedulePreview()}
async function submitEntry(ev){
 ev.preventDefault();
 const form=ev.target,button=form.querySelector('[type="submit"]');
 const label0=button?.textContent;
 try{
  let msg;
  if(entry.modo==='producao'){
   const route=byId('roteiro',entry.roteiro);
   entry.realizado=String($('#entryRealizado')?.value||'').trim();
   if(!entry.funcionario)throw Error('Escolha o funcionário.');
   if(!entry.produto)throw Error('Escolha o produto.');
   if(!route)throw Error('Escolha a operação.');
   if(!entry.inicio||!entry.fim)throw Error('Escolha um horário ou informe início e fim.');
   const min=minutesBetween(entry.inicio,entry.fim);
   if(min<=0||min>720)throw Error('O período deve ser maior que zero e não superar 12 horas.');
   const total=Number(entry.realizado);
   if(entry.realizado===''||!Number.isInteger(total)||total<0)throw Error('Peças realizadas devem ser um número inteiro (0 ou mais).');
   if(button){button.disabled=true;button.textContent='Gravando...'}
   await window.GUT_API.save('entry',{data:entry.data,funcionario:entry.funcionario,produto:entry.produto,processo:route.processo,roteiro:route.id,inicio:entry.inicio,fim:entry.fim,realizado:total});
   msg=`Apontamento registrado: ${first(byId('funcionarios',entry.funcionario)?.nome)} · ${hourLabel(entry.inicio,entry.fim)} · ${fNum(total)} peças.`;
  }else if(entry.modo==='ausencia'){
   entry.motivo=String($('#ausMotivo')?.value||'').trim();
   if(!entry.funcionario)throw Error('Escolha o funcionário.');
   const nome=first(byId('funcionarios',entry.funcionario)?.nome);
   if(entry.ausTipo==='falta'){
    const j=jornadaDo(entry.data);if(!j||!j.ativo)throw Error('Este dia da semana não tem jornada ativa. Ajuste em Horários e jornada.');
    if(button){button.disabled=true;button.textContent='Gravando...'}
    await window.GUT_API.ausencia('falta',{funcionario:entry.funcionario,data:entry.data,motivo:entry.motivo});
    msg=`Falta registrada: ${nome} · ${fDate(entry.data)} (${hhmm(j.minutos)}). Também entrou nas faltas da bonificação.`;
   }else{
    if(!entry.ausInicio||!entry.ausFim||toMin(entry.ausFim)<=toMin(entry.ausInicio))throw Error('Informe início e fim da ausência (fim maior que início).');
    if(button){button.disabled=true;button.textContent='Gravando...'}
    await window.GUT_API.ausencia('parcial',{funcionario:entry.funcionario,data:entry.data,inicio:entry.ausInicio,fim:entry.ausFim,motivo:entry.motivo});
    msg=`Ausência registrada: ${nome} · ${hourLabel(entry.ausInicio,entry.ausFim)}.`;
   }
  }else{
   entry.motivo=String($('#ausMotivo')?.value||'').trim();
   if(!entry.colInicio||!entry.colFim||toMin(entry.colFim)<=toMin(entry.colInicio))throw Error('Informe início e fim da ausência coletiva (fim maior que início).');
   if(button){button.disabled=true;button.textContent='Gravando...'}
   const r=await window.GUT_API.ausencia('coletiva',{data:entry.data,inicio:entry.colInicio,fim:entry.colFim,motivo:entry.motivo,setor:entry.colSetor});
   msg=`Ausência coletiva lançada para ${fNum(r?.afetados||0)} funcionário(s): ${hourLabel(entry.colInicio,entry.colFim)}.`;
  }
  resetEntry();
  await loadData();
  toast(msg);
 }catch(err){
  toast('Não foi possível salvar: '+(err.message||String(err)));
  if(button&&button.isConnected){button.disabled=false;button.textContent=label0||'Registrar'}
 }
}
async function excluirAusencia(payload,msg){
 try{await window.GUT_API.ausencia('excluir',payload);await loadData();toast(msg)}
 catch(err){toast('Não foi possível excluir: '+(err.message||String(err)))}
}

/* --- Lista de ausências --- */
let ausMes=todayLocal().slice(0,7);
function ausenciasLista(){
 const A=(data.ausencias||[]).filter(a=>String(a.data).slice(0,7)===ausMes);
 const lotes={},ind=[];
 A.forEach(a=>{if(a.tipo==='coletiva'){(lotes[a.lote]=lotes[a.lote]||{...a,n:0,total:0}).n++;lotes[a.lote].total+=Number(a.minutos||0);}else ind.push(a)});
 const linhas=[...Object.values(lotes).map(a=>({...a,col:true})),...ind].sort((a,b)=>(String(b.data)+b.inicio).localeCompare(String(a.data)+a.inicio));
 const soma=t=>A.filter(a=>a.tipo===t).reduce((n,a)=>n+Number(a.minutos||0),0);
 return `<div class="card controls-panel"><label class="inline-date">Mês <input type="month" class="input" id="ausMes" value="${esc(ausMes)}"></label>
 <div class="stats-row"><span><b>${A.filter(a=>a.tipo==='falta').length}</b> falta(s) · ${hhmm(soma('falta'))}</span><span><b>${A.filter(a=>a.tipo==='parcial').length}</b> parcial(is) · ${hhmm(soma('parcial'))}</span><span><b>${Object.keys(lotes).length}</b> coletiva(s) · ${hhmm(soma('coletiva'))} somadas</span></div></div>
 <section class="card"><div class="table-wrap"><table class="table table-cards"><thead><tr><th>Quem</th><th>Data</th><th>Tipo</th><th>Horário</th><th>Tempo</th><th>Motivo</th><th></th></tr></thead><tbody>
 ${linhas.length?linhas.map(a=>'<tr>'+td('Quem',a.col?'<b>'+a.n+' funcionário(s)</b>':esc(byId('funcionarios',a.funcionario)?.nome||'—'),'strong card-title')+td('Data',esc(fDate(a.data)),'num')+
  td('Tipo','<span class="pill '+(a.tipo==='falta'?'red-pill':a.tipo==='coletiva'?'blue':'amber')+'">'+esc(AUS_LABEL[a.tipo])+'</span>','num')+td('Horário',esc(a.inicio)+'–'+esc(a.fim),'num')+
  td('Tempo',hhmm(a.minutos)+(a.col?' cada':''),'num')+td('Motivo',esc(a.motivo||'—'))+
  td('Ação',`<button type="button" class="text-btn danger-btn" data-edit data-action="${a.col?'aus-excluir-lote':'aus-excluir'}" data-id="${esc(a.col?a.lote:a.id)}">Excluir</button>`,'num')+'</tr>').join('')
  :'<tr><td colspan="7" class="empty-row">Nenhuma ausência neste mês. Lance em Apontar → Ausência.</td></tr>'}
 </tbody></table></div></section>`;
}

/* --- Horários fixos e jornada --- */
let jornadaDraft=null;
function jornadaRows(){
 if(!jornadaDraft)jornadaDraft=[1,2,3,4,5,6,0].map(d=>{const j=(data.jornada||[]).find(x=>Number(x.dia)===d)||{dia:d,ativo:false,entrada:'07:00',saida:'17:00'};return {dia:d,ativo:!!j.ativo,entrada:j.entrada||'',saida:j.saida||'',intervaloInicio:j.intervaloInicio||'',intervaloFim:j.intervaloFim||''}});
 return jornadaDraft;
}
const jornadaMin=j=>{if(!j.ativo||!j.entrada||!j.saida||toMin(j.saida)<=toMin(j.entrada))return 0;let m=toMin(j.saida)-toMin(j.entrada);if(j.intervaloInicio&&j.intervaloFim&&toMin(j.intervaloFim)>toMin(j.intervaloInicio))m-=toMin(j.intervaloFim)-toMin(j.intervaloInicio);return Math.max(0,m)};
function horariosJornada(){
 const J=jornadaRows(),semana=J.reduce((n,j)=>n+jornadaMin(j),0);
 const list=(data.horarios||[]).slice().sort((a,b)=>toMin(a.inicio)-toMin(b.inicio));
 return `<section class="card"><div class="section-head"><div><h3 class="section-title">Jornada por dia da semana</h3><p class="section-sub">Usada para lançar falta de dia inteiro. Total da semana: <b id="jornadaSemana">${hhmm(semana)}</b></p></div><button type="button" class="btn btn-primary btn-sm" data-edit data-action="jornada-salvar">Salvar jornada</button></div>
 <div class="jornada-grid"><div class="jornada-head"><span>Dia</span><span>Entrada</span><span>Saída</span><span>Intervalo</span><span>Total</span></div>
 ${J.map(j=>`<div class="jornada-row${j.ativo?'':' off'}" data-jrow="${j.dia}"><label class="jornada-dia"><input type="checkbox" data-jd="${j.dia}" data-k="ativo" ${j.ativo?'checked':''}> ${DIAS[j.dia]}</label>
  <input class="input" type="time" data-jd="${j.dia}" data-k="entrada" value="${esc(j.entrada)}"><input class="input" type="time" data-jd="${j.dia}" data-k="saida" value="${esc(j.saida)}">
  <span class="jornada-int"><input class="input" type="time" data-jd="${j.dia}" data-k="intervaloInicio" value="${esc(j.intervaloInicio)}"><i>–</i><input class="input" type="time" data-jd="${j.dia}" data-k="intervaloFim" value="${esc(j.intervaloFim)}"></span>
  <b id="jt-${j.dia}">${j.ativo?hhmm(jornadaMin(j)):'folga'}</b></div>`).join('')}</div></section>
 <section class="card"><div class="section-head"><div><h3 class="section-title">Horários fixos de apontamento</h3><p class="section-sub">Aparecem como atalhos na aba Apontar. Inative os que não usa.</p></div></div>
 <div class="slot-admin">${list.length?list.map(h=>`<div class="slot-row${h.ativo===false?' off':''}"><b>${hourLabel(h.inicio,h.fim)}</b><span class="pill ${h.ativo===false?'grey':'green'}">${h.ativo===false?'Inativo':'Ativo'}</span><button class="text-btn" data-edit data-action="toggle-slot" data-id="${esc(h.id)}" data-ativo="${h.ativo===false?'true':'false'}">${h.ativo===false?'Ativar':'Inativar'}</button></div>`).join(''):'<p class="muted-small">Nenhum horário cadastrado.</p>'}</div>
 <form id="slotForm" class="slot-form" data-edit><label class="inline-date">Início <input class="input" type="time" name="inicio" required></label><label class="inline-date">Fim <input class="input" type="time" name="fim" required></label><button class="btn btn-primary" type="submit">＋ Adicionar horário</button></form></section>`;
}
function jornadaInput(t){
 if(t.dataset.jd===undefined)return false;
 const j=jornadaRows().find(x=>String(x.dia)===t.dataset.jd);if(!j)return true;
 j[t.dataset.k]=t.type==='checkbox'?t.checked:t.value;
 const el=document.getElementById('jt-'+j.dia);if(el)el.textContent=j.ativo?hhmm(jornadaMin(j)):'folga';
 const row=document.querySelector(`[data-jrow="${j.dia}"]`);if(row)row.classList.toggle('off',!j.ativo);
 const s=document.getElementById('jornadaSemana');if(s)s.textContent=hhmm(jornadaRows().reduce((n,x)=>n+jornadaMin(x),0));
 return true;
}
async function saveJornada(){
 const J=jornadaRows();
 try{
  for(const j of J){if(!j.ativo)continue;const n=DIAS[j.dia];
   if(!j.entrada||!j.saida||toMin(j.saida)<=toMin(j.entrada))throw Error(n+': a saída deve ser depois da entrada.');
   if(!!j.intervaloInicio!==!!j.intervaloFim)throw Error(n+': informe início e fim do intervalo, ou deixe os dois vazios.');
   if(j.intervaloInicio&&(toMin(j.intervaloFim)<=toMin(j.intervaloInicio)||toMin(j.intervaloInicio)<toMin(j.entrada)||toMin(j.intervaloFim)>toMin(j.saida)))throw Error(n+': o intervalo deve ficar dentro do expediente.');}
  await window.GUT_API.ausencia('jornada',{dias:J.map(j=>({dia:j.dia,ativo:j.ativo,entrada:j.entrada||'07:00',saida:j.saida||'17:00',intervaloInicio:j.ativo?j.intervaloInicio:'',intervaloFim:j.ativo?j.intervaloFim:''}))});
  jornadaDraft=null;await loadData();toast('Jornada salva.');
 }catch(err){toast('Não foi possível salvar: '+(err.message||String(err)))}
}
async function submitSlot(ev){
 ev.preventDefault();
 const fd=new FormData(ev.target),inicio=String(fd.get('inicio')||''),fim=String(fd.get('fim')||'');
 try{
  if(!inicio||!fim||inicio===fim)throw Error('Informe início e fim diferentes.');
  await window.GUT_API.save('slot',{inicio,fim});
  await loadData();toast('Horário '+hourLabel(inicio,fim)+' salvo.');
 }catch(err){toast('Não foi possível salvar: '+(err.message||String(err)))}
}
async function toggleSlot(id,ativo){
 try{await window.GUT_API.save('slot_toggle',{id,ativo:ativo==='true'});await loadData();toast('Horário atualizado.')}
 catch(err){toast('Não foi possível salvar: '+(err.message||String(err)))}
}

/* ===================== FUNCIONÁRIOS ===================== */
function funcionarios(){
 const items=data.funcionarios.filter(f=>!search||[f.nome,f.matricula,byId('setores',f.setor)?.nome,byId('grupos',f.grupo)?.nome].join(' ').toLowerCase().includes(search.toLowerCase()));
 return title('Funcionários','Cadastre o funcionário e marque as operações que ele executa.',btnNew('novo-funcionario','Cadastrar funcionário'))+
 '<div class="card controls-panel"><input id="employeeSearch" class="input search" placeholder="⌕ Buscar nome, matrícula, setor ou grupo..." aria-label="Buscar funcionário" value="'+esc(search)+'" /><div class="stats-row"><span><b>'+data.funcionarios.length+'</b> funcionários</span><span><b>'+data.setores.length+'</b> setores</span><span><b>'+(data.grupos||[]).length+'</b> grupos</span></div></div>'+
 '<div class="data-grid">'+items.map(f=>
   '<article class="card employee-card"><div class="employee-top"><div class="employee-avatar">'+esc(initials(f.nome))+'</div><div style="flex:1"><div class="employee-name">'+esc(f.nome)+'</div><div class="employee-code">'+(f.matricula?'Matrícula '+esc(f.matricula):'Sem matrícula')+'</div></div>'+effPill(sums(data.lancamentos.filter(l=>l.funcionario===f.id)).eff)+'</div>'+
   ((f.setor||f.grupo)?'<div class="employee-info"><span>Setor / grupo</span><strong>'+esc(byId('setores',f.setor)?.nome||'Sem setor')+(f.grupo?' · '+esc(byId('grupos',f.grupo)?.nome||''):'')+'</strong></div>':'')+
   ((f.maquinas||[]).length?'<div><div class="eyebrow" style="color:#8998a8;letter-spacing:.7px;margin-bottom:8px">MÁQUINAS</div><div class="taglist">'+f.maquinas.map(id=>'<span class="tag">'+esc(byId('maquinas',id)?.nome||id)+'</span>').join('')+'</div></div>':'')+
   '<div><div class="eyebrow" style="color:#8998a8;letter-spacing:.7px;margin-bottom:8px">OPERAÇÕES QUE EXECUTA</div><div class="taglist">'+(empOps(f).length?empOps(f).map(r=>'<span class="tag">'+esc(opLabel(r))+'</span>').join(''):'<span class="tag">Nenhuma operação marcada</span>')+'</div></div>'+
   '<div class="employee-bottom"><span class="pill green"><span class="badge-dot"></span>Ativo</span><div class="card-actions"><button class="text-btn" data-edit data-action="editar-funcionario" data-id="'+esc(f.id)+'">Editar cadastro</button><button class="text-btn" data-action="ver-funcionario" data-id="'+esc(f.id)+'">Ver desempenho →</button></div></div></article>'
 ).join('')+'</div>';
}

/* ===================== ESTRUTURA ===================== */
function estrutura(){
 const sectors=(data.setores||[]),groups=(data.grupos||[]),machines=(data.maquinas||[]);
 const tb={setores:btnNew('novo-setor','Novo setor')+btnNew('novo-grupo','Novo grupo'),maquinas:btnNew('nova-maquina','Nova máquina'),funcoes:btnNew('nova-funcao','Nova função')}[sub.estrutura];
 const head=title('Estrutura da fábrica','Organize setores, grupos de produção, máquinas e equipes para o BI.',tb)+subtabs();
 if(sub.estrutura==='maquinas')return head+'<section class="card"><div class="section-head"><div><h3 class="section-title">Máquinas cadastradas</h3><p class="section-sub">'+machines.length+' equipamento(s) disponíveis para atribuir aos funcionários.</p></div></div>'+
 '<div class="table-wrap"><table class="table table-cards"><thead><tr><th>Código</th><th>Máquina</th><th>Tipo</th><th>Setor de referência</th><th>Operadores habilitados</th></tr></thead><tbody>'+
 (machines.length?machines.map(m=>'<tr>'+td('Máquina',esc(m.nome),'strong card-title')+td('Código',esc(m.codigo||'—'))+td('Tipo',esc(m.tipo||'—'))+td('Setor',esc(byId('setores',m.setor)?.nome||'Sem setor específico'))+td('Operadores',String(data.funcionarios.filter(f=>(f.maquinas||[]).includes(m.id)).length))+'</tr>').join(''):'<tr><td colspan="5" class="empty-row">Nenhuma máquina cadastrada.</td></tr>')+
 '</tbody></table></div></section>';
 if(sub.estrutura==='funcoes')return head+'<section class="card card-pad"><h3 class="section-title">Funções e competências</h3><p class="section-sub" style="margin-bottom:14px">Habilidades disponíveis para seleção no cadastro dos funcionários.</p>'+
 '<div class="taglist">'+((data.funcoes||[]).map(f=>'<span class="tag">'+esc(f.nome)+'</span>').join('')||'<span class="muted-small">Nenhuma função cadastrada.</span>')+'</div></section>';
 return head+'<div class="notice hide-mobile"><strong>Hierarquia:</strong> cada funcionário tem um setor principal e pode integrar um grupo desse setor. Os lançamentos preservam o setor e grupo do momento da produção, mesmo após transferências.</div>'+
 '<div class="data-grid">'+(sectors.length?sectors.map(sec=>{
   const own=groups.filter(g=>g.setor===sec.id);
   const team=data.funcionarios.filter(f=>f.setor===sec.id);
   return '<article class="card structure-card"><div class="eyebrow">SETOR PRODUTIVO</div><h3>'+esc(sec.nome)+'</h3>'+
    '<p class="muted-small">'+team.length+' funcionários · '+own.length+' grupos</p>'+
    '<div class="group-stack">'+(own.length?own.map(g=>'<div class="group-line"><div><b>'+esc(g.nome)+'</b><small>'+esc(g.codigo||'Grupo de produção')+'</small></div><span class="pill blue">'+data.funcionarios.filter(f=>f.grupo===g.id).length+' pessoas</span></div>').join(''):'<div class="muted-small">Nenhum grupo cadastrado neste setor.</div>')+'</div>'+
    '<button class="btn" data-edit data-action="novo-grupo" data-id="'+esc(sec.id)+'" style="width:100%;margin-top:15px">＋ Criar grupo neste setor</button></article>';
 }).join(''):'<article class="card placeholder">Nenhum setor cadastrado. Comece em “Novo setor”.</article>')+'</div>';
}
/* ===================== PRODUTOS ===================== */
function produtos(){
 const tb={produtos:btnNew('novo-produto','Novo produto'),operacoes:btnNew('novo-processo','Nova operação'),tempos:btnNew('novo-processo','Nova operação')}[sub.produtos];
 const head=title('Produtos e operações','Cadastre produtos e operações e vincule cada operação ao produto com seu tempo padrão.',tb)+subtabs();
 if(sub.produtos==='operacoes')return head+operacoesLista();
 if(sub.produtos==='tempos')return head+temposPorProduto();
 return head+(data.produtos.length?'<div class="data-grid">'+data.produtos.map(p=>{
  const rot=routeOf(p.id),final=rot.find(r=>r.final===true),total=rot.reduce((n,r)=>n+Number(r.tempo||0),0);
  return '<article class="card product-card"><div class="taglist" style="margin-bottom:10px">'+(p.codigo?'<span class="pill blue">'+esc(p.codigo)+'</span>':'')+'<span class="pill grey">'+rot.length+' operações</span>'+(rot.length?'<span class="pill grey">'+fNum(total/60,1)+' min/peça</span>':'')+'</div>'+
   '<h3>'+esc(p.nome)+'</h3><p>'+esc(p.descricao||'')+'</p>'+
   '<div class="product-final-status '+(final?'is-set':'')+'"><span>✓ PEÇAS PRONTAS</span><strong>'+(final?esc(byId('processos',final.processo)?.nome||''):'Operação final não definida')+'</strong></div>'+
   '<div class="product-actions"><button class="btn btn-primary" data-action="ver-tempos" data-id="'+esc(p.id)+'">Operações e tempos →</button><button class="btn" data-edit data-action="marcar-final" data-id="'+esc(p.id)+'">✓ Operação final</button></div></article>';
 }).join('')+'</div>':'<div class="card placeholder"><h3>Nenhum produto cadastrado</h3><p>Comece em “Novo produto”.</p></div>');
}
function operacoesLista(){
 const procs=data.processos||[];
 return '<section class="card"><div class="section-head"><div><h3 class="section-title">Operações cadastradas</h3><p class="section-sub">'+procs.length+' operação(ões). Uma operação pode ser usada em vários produtos.</p></div></div>'+
 '<div class="table-wrap"><table class="table table-cards"><thead><tr><th>Operação</th><th>Código</th><th>Usada em</th></tr></thead><tbody>'+
 (procs.length?procs.map(o=>{const uses=data.roteiro.filter(r=>r.processo===o.id);return '<tr>'+td('Operação',esc(o.nome),'strong card-title')+td('Código',esc(o.codigo||'—'))+td('Usada em',uses.length?uses.map(r=>esc(byId('produtos',r.produto)?.nome||'')).join(', '):'<span class="muted-small">Nenhum produto</span>')+'</tr>'}).join('')
  :'<tr><td colspan="3" class="empty-row">Nenhuma operação cadastrada. Use “Nova operação”.</td></tr>')+'</tbody></table></div></section>';
}
function temposPorProduto(){
 if(!data.produtos.length)return '<div class="card placeholder"><h3>Cadastre um produto primeiro</h3><p>Depois volte aqui para vincular as operações e os tempos.</p></div>';
 if(!byId('produtos',rotProd))rotProd=data.produtos[0].id;
 const p=byId('produtos',rotProd),rot=routeOf(p.id),used=new Set(rot.map(r=>r.processo)),free=(data.processos||[]).filter(o=>!used.has(o.id));
 const total=rot.reduce((n,r)=>n+Number(r.tempo||0),0);
 return '<div class="card controls-panel"><label class="inline-date rot-pick">Produto <select class="select" id="rotProduto">'+data.produtos.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===p.id?'selected':'')+'>'+esc(x.nome)+'</option>').join('')+'</select></label>'+
 '<div class="stats-row"><span><b>'+rot.length+'</b> operações</span><span><b>'+fNum(total,1)+' s</b> por peça ('+fNum(total/60,1)+' min)</span></div></div>'+
 '<section class="card"><div class="section-head"><div><h3 class="section-title">'+esc(p.nome)+' — operações e tempo padrão</h3><p class="section-sub">O tempo padrão vale para todos os funcionários até você definir um tempo individual em Níveis e tempos.</p></div><button class="btn btn-sm" data-edit data-action="marcar-final" data-id="'+esc(p.id)+'">✓ Operação final</button></div>'+
 '<div class="table-wrap"><table class="table table-cards"><thead><tr><th>Operação</th><th>Tempo padrão</th><th>Peças/hora</th><th>Funcionários</th><th></th></tr></thead><tbody>'+
 (rot.length?rot.map(r=>'<tr>'+td('Operação',esc(r.etapa||'—')+'. '+esc(byId('processos',r.processo)?.nome||'')+(r.final?' <span class="final-flag">FINAL</span>':''),'strong card-title')+td('Tempo padrão',fNum(r.tempo,1)+' s','strong num')+td('Peças/hora',fNum(3600/r.tempo,1),'num')+td('Funcionários',String(data.funcionarios.filter(f=>(f.operacoes||[]).includes(r.id)).length),'num')+td('Ação','<button class="text-btn" data-edit data-action="editar-tempo-padrao" data-id="'+esc(r.id)+'">Alterar tempo</button>','num')+'</tr>').join('')
  :'<tr><td colspan="5" class="empty-row">Nenhuma operação vinculada a este produto.</td></tr>')+'</tbody></table></div>'+
 '<form id="linkForm" class="link-form" data-edit><input type="hidden" name="produto" value="'+esc(p.id)+'"><b>Vincular operação</b>'+
 (free.length?'<select class="select" name="processo" required>'+free.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.nome)+'</option>').join('')+'</select><label class="inline-date">Tempo (s/peça) <input class="input" type="number" name="tempo" min="0.001" step="0.001" required placeholder="ex.: 45"></label><button class="btn btn-primary" type="submit">＋ Vincular</button>'
  :'<span class="muted-small">Todas as operações já estão neste produto. Cadastre uma “Nova operação” para vincular.</span>')+
 '</form></section>';
}
async function submitLink(ev){
 ev.preventDefault();
 const fd=new FormData(ev.target),produto=String(fd.get('produto')||''),processo=String(fd.get('processo')||''),tempo=Number(fd.get('tempo'));
 try{
  if(!produto||!processo||!(tempo>0))throw Error('Escolha a operação e informe um tempo positivo.');
  await window.GUT_API.save('linkprocess',{produto,processo,tempo});
  rotProd=produto;await loadData();toast('Operação vinculada ao produto.');
 }catch(err){toast('Não foi possível salvar: '+(err.message||String(err)))}
}

/* ===================== NÍVEIS ===================== */
function niveis(){
 const head=title('Níveis e tempos','Tempo e nível de cada funcionário em cada operação que executa, com histórico preservado.')+subtabs();
 if(sub.niveis==='niveis'){
  const adm=data.perfil==='admin';if(adm&&!bonusData&&!bonusLoading&&!bonusErr)loadBonus();
  const NS={};(bonusData?.niveisSalario||[]).forEach(x=>NS[x.nivel]=x.salario);
  const salBox=n=>!adm?'':!bonusData?'<div class="level-sal muted-small">'+(bonusErr?esc(bonusErr):'Carregando salário…')+'</div>':
   `<div class="level-sal"><label for="nsal-${esc(n.id)}">Salário básico do nível</label><div class="level-sal-row"><input class="input" type="number" min="0" step="0.01" inputmode="decimal" id="nsal-${esc(n.id)}" value="${NS[n.id]!=null?esc(NS[n.id]):''}" placeholder="0,00"><button class="btn btn-sm btn-primary" data-action="salvar-nivel-salario" data-id="${esc(n.id)}">Salvar</button></div><small>${NS[n.id]!=null?'Atual: '+brl(NS[n.id]):'Sem salário definido'}</small></div>`;
  return head+`<div class="level-cards">${data.niveis.map(n=>`<div class="card level-card"><div class="level-number">${esc(n.ordem||n.id)}</div><h3>${esc(n.nome)}</h3><p>${esc(n.descricao)}</p>${salBox(n)}</div>`).join('')}</div>`+
  (adm?'<div class="notice">O salário básico do nível é uma sugestão: em <b>Bonificação → Salários</b>, ao escolher o nível do funcionário o salário vem preenchido e pode ser ajustado antes de salvar. Mudar o valor aqui não altera salários já gravados.</div>':'')+`
<div class="notice"><strong>Metodologia:</strong> ao revisar o tempo ou o nível, os apontamentos anteriores continuam usando a meta histórica. Apontamentos com data retroativa usam o tempo que valia naquela data e hora.</div>`;}
 const all=activeEmployees(),emps=all.filter(f=>!nivFunc||f.id===nivFunc);
 const totalOps=all.reduce((n,f)=>n+empOps(f).length,0);
 const filtro=`<div class="card controls-panel"><select class="select" id="nivFuncionario" aria-label="Filtrar funcionário"><option value="">Todos os funcionários</option>${all.map(f=>`<option value="${esc(f.id)}" ${f.id===nivFunc?'selected':''}>${esc(f.nome)}</option>`).join('')}</select><div class="stats-row"><span><b>${totalOps}</b> operações vinculadas</span><span><b>${data.tempos.length}</b> com tempo individual</span></div></div>`;
 return head+filtro+'<div class="op-people">'+emps.map(f=>{
  const ops=empOps(f).sort((a,b)=>opLabel(a).localeCompare(opLabel(b))||(a.etapa-b.etapa));
  const rows=ops.map(r=>{const t=timeFor(f.id,r.id),seg=Number(t?.segundos??r.tempo);
   return `<div class="op-row"><div class="op-name"><b>${esc(byId('processos',r.processo)?.nome||'Operação')}</b><small>${esc(byId('produtos',r.produto)?.nome||'')} · etapa ${esc(r.etapa||'—')}</small></div>`+
   `<div class="op-time"><b>${fNum(seg,1)} s</b><small>${t?'individual':'padrão'} · ${fNum(3600/seg,1)} pç/h</small></div>`+
   `<span class="pill ${t?.nivel?'blue':'grey'}">${t?.nivel?esc(nivelNome(t.nivel)):'Sem nível'}</span>`+
   `<button class="btn btn-sm" data-edit data-action="revisar-op" data-func="${esc(f.id)}" data-rot="${esc(r.id)}">Revisar</button></div>`}).join('');
  return `<section class="card op-person"><div class="op-head"><div class="employee-avatar">${esc(initials(f.nome))}</div><div class="op-who"><b>${esc(f.nome)}</b><small>${esc(byId('setores',f.setor)?.nome||'Sem setor')} · ${ops.length} operação(ões)</small></div><button class="text-btn" data-edit data-action="editar-funcionario" data-id="${esc(f.id)}">Editar operações</button></div>`+
  (rows||'<p class="muted-small op-empty">Nenhuma operação marcada. Use “Editar operações” para escolher o que este funcionário faz.</p>')+'</section>';
 }).join('')+'</div>';
}
function reviseOp(fid,rid){
 const f=byId('funcionarios',fid),r=byId('roteiro',rid);
 if(!f||!r){toast('Operação não encontrada.');return;}
 const t=timeFor(fid,rid),seg=t?.segundos??r.tempo;
 showModal('Tempo individual e nível',esc(f.nome)+' · '+esc(opLabel(r)),
 `<div class="form-grid"><input type="hidden" name="funcionario" value="${esc(fid)}"><input type="hidden" name="produto" value="${esc(r.produto)}"><input type="hidden" name="processo" value="${esc(r.processo)}"><input type="hidden" name="roteiro" value="${esc(rid)}">`+
 inputField('segundos','Tempo individual (segundos/peça)','number',seg,'min="0.001" step="0.001"')+
 '<div class="field"><label for="nivel">Nível <small>(opcional — pode definir depois)</small></label><select class="select" id="nivel" name="nivel"><option value="">Sem nível definido</option>'+data.niveis.map(n=>'<option value="'+esc(n.id)+'" '+(String(t?.nivel??'')===String(n.id)?'selected':'')+'>'+esc(n.nome)+'</option>').join('')+'</select></div>'+
 `<div class="field full"><label for="motivo">Motivo da revisão</label><input class="input" name="motivo" id="motivo" value="Meta individual" required></div></div>`+
 `<div class="modal-tip" style="margin-top:14px">Tempo padrão do roteiro: ${fNum(r.tempo,1)} s. ${t?'Atual: '+fNum(t.segundos,1)+' s'+(t.nivel?', '+esc(nivelNome(t.nivel)):', sem nível')+' (desde '+esc(fDate(t.alteradoEm))+').':'Hoje usa o tempo padrão.'} A revisão vale para os apontamentos com data de hoje em diante, em qualquer horário do dia. Apontamentos já registrados mantêm a meta com que foram gravados.</div>`,
 'Salvar nova versão','time');
}
function config(){return title('Configurações','Integração com Supabase, segurança e sincronização.')+
 '<div class="notice"><b>Conectado ao Supabase:</b> cadastros e apontamentos são gravados no banco de dados, não no armazenamento local. Contas sem autorização não podem ler ou modificar os registros.</div>'+
 '<section class="card config-block"><h3>Ambiente conectado</h3><div class="config-grid">'+
 '<div class="config-fact"><span>Projeto</span><b>PROJETOS</b></div>'+
 '<div class="config-fact"><span>Schema de produção</span><b>APONTADOR DE PRODUÇÃO</b></div>'+
 '<div class="config-fact"><span>Usuário</span><b>'+esc(authorizedEmail||'Autenticado')+'</b></div>'+
 '<div class="config-fact"><span>Perfil</span><b>'+esc(data.perfil||'—')+'</b></div></div>'+
 '<div class="separator"></div><p>Use o botão abaixo para sincronizar todos os cadastros e apontamentos.</p>'+
 '<button class="btn btn-primary" data-action="sincronizar">↻ Atualizar dados do Supabase</button></section>';
}

/* ===================== BONIFICAÇÃO ===================== */
let bonusMes=todayLocal().slice(0,7),bonusData=null,bonusLoading=false,bonusErr='',bonusErrMes='',rulesDraft=null,rulesDirty=false;
let exemplo={salario:2000,ef:90,efCol:90,faltas:0,funcionario:''};
const brl=n=>n==null||n===''?'—':Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pctTxt=n=>n==null?'—':Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';
const mesLabel=m=>{const [y,mm]=String(m||'').split('-');const n=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][Number(mm)-1];return n?n+' de '+y:m};
function bonusPctFor(ef,faixas){if(ef==null)return 0;const e=Math.floor(Number(ef));let p=0;for(const f of faixas)if(Number(f.min)<=e)p=Number(f.pct);return p}
function lossFor(n,regras){let p=0;for(const r of regras)if(Number(r.min)<=n)p=Number(r.perda);return p}
async function loadBonus(force){
 if(bonusLoading)return;
 if(!force&&bonusData&&bonusData.mes===bonusMes)return;
 bonusLoading=true;bonusErr='';
 try{bonusData=await window.GUT_API.bonus(bonusMes+'-01');if(!rulesDirty)rulesDraft=null;bonusErrMes='';}
 catch(e){bonusErr=e.message||String(e);bonusErrMes=bonusMes;}
 finally{bonusLoading=false;}
 if(page==='bonificacao'||page==='niveis')render();
}
function bonificacao(){
 const mesInput=`<label class="inline-date">Mês <input type="month" class="input" id="bonusMes" value="${esc(bonusMes)}"></label>`;
 const right=sub.bonificacao==='mes'?mesInput+'<button class="btn" data-action="bonus-csv">⇩ CSV</button>':sub.bonificacao==='regras'?'':mesInput;
 const head=title('Bonificação','Prêmio mensal por eficiência sobre o salário base, com desconto por faltas.',right)+subtabs();
 if(data.perfil!=='admin')return head+'<div class="notice">A bonificação é visível apenas para administradores.</div>';
 if(!bonusData||bonusData.mes!==bonusMes){
  if(bonusErrMes===bonusMes)return head+`<div class="notice">Não foi possível carregar a bonificação: ${esc(bonusErr)} <button class="text-btn" data-action="bonus-recarregar">Tentar novamente</button></div>`;
  loadBonus();return head+'<div class="card placeholder"><p>Calculando bonificação de '+esc(mesLabel(bonusMes))+'…</p></div>';
 }
 if(sub.bonificacao==='faltas')return head+bonusFaltas();
 if(sub.bonificacao==='salarios')return head+bonusSalarios();
 if(sub.bonificacao==='regras')return head+bonusRegras();
 return head+bonusMesView();
}
function bonusMesView(){
 const L=bonusData.linhas||[],com=L.filter(l=>l.meta>0),colAtiva=bonusData.config?.coletivaAtiva!==false,colBase=bonusData.config?.coletivaBase||'fabrica',colFab=colBase==='final'?bonusData.coletivas?.final:bonusData.coletivas?.fabrica,emp=bonusData.empresa||{};
 const soma=k=>L.reduce((n,l)=>n+Number(l[k]||0),0);
 const semSal=L.filter(l=>l.salario==null&&l.meta>0).length,brindes=L.filter(l=>l.brinde).length,crono=L.filter(l=>l.cronoanalise).length;
 const tr=l=>{const alerts=[];
  if(l.brinde)alerts.push('<span class="pill green">🎁 Brinde</span>');
  if(l.cronoanalise)alerts.push('<span class="pill amber">⏱ Cronoanálise + avaliar nível</span>');
  else if(l.mesesAcima100>0&&l.eficiencia>100)alerts.push('<span class="pill grey">'+l.mesesAcima100+'/3 meses acima de 100%</span>');
  if(l.salario==null&&l.meta>0)alerts.push('<span class="pill red-pill">Sem salário</span>');
  return '<tr>'+td('Funcionário',esc(l.nome),'strong card-title')+
  td('Eficiência',l.meta>0?effPill(l.eficiencia):'<span class="muted-small">sem apontamentos</span>','num')+
  td('Bônus',pctTxt(l.percentualBonus),'num')+td('Salário base',brl(l.salario),'num')+
  td('Bônus individual',brl(l.bonusBruto),'num')+
  (colAtiva?td('Coletiva',l.meta>0&&l.eficienciaColetiva!=null?pctTxt(+Number(l.eficienciaColetiva).toFixed(1))+' → '+pctTxt(l.percentualColetivo)+'<small class="cell-sub">'+brl(l.bonusColetivoBruto)+'</small>':'—','num'):'')+
  td('Faltas',l.faltas?(l.faltas+' (−'+pctTxt(l.perdaPercentual)+')'):'0','num')+
  td('Ausências',l.minutosAusencia?hhmm(l.minutosAusencia):'—','num')+
  td('Prêmio',brl(l.bonus),'strong num')+td('Total a receber',brl(l.total),'strong num')+
  td('Alertas',alerts.join(' ')||'—','card-wide')+'</tr>'};
 return `<div class="grid-kpis bonus-kpis">
 <article class="card kpi"><div class="kpi-top"><span>Prêmios do mês</span><span class="kpi-icon">R$</span></div><div class="kpi-value">${brl(soma('bonus'))}</div><div class="kpi-foot">${com.length} funcionário(s) com apontamentos</div></article>
 <article class="card kpi"><div class="kpi-top"><span>Folha (salário + prêmio)</span><span class="kpi-icon">Σ</span></div><div class="kpi-value">${brl(L.reduce((n,l)=>n+Number(l.total||0),0))}</div><div class="kpi-foot">${semSal?'<strong style="color:#b43e43">'+semSal+' sem salário cadastrado</strong>':'Todos com salário cadastrado'}</div></article>
 <article class="card kpi"><div class="kpi-top"><span>Brindes (acima de 100%)</span><span class="kpi-icon">🎁</span></div><div class="kpi-value">${brindes}</div><div class="kpi-foot">${crono} alerta(s) de cronoanálise</div></article>
 <article class="card kpi kpi-empresa"><div class="kpi-top"><span>Eficiência da empresa</span><span class="kpi-icon">🏭</span></div><div class="kpi-value">${emp.eficienciaEmpresa!=null?pctTxt(+Number(emp.eficienciaEmpresa).toFixed(1)):'—'}</div><div class="kpi-foot">Considera ${hhmm(emp.minutosAusencia||0)} de ausências${emp.minutosAusenciaColetiva?' ('+hhmm(emp.minutosAusenciaColetiva)+' coletivas)':''}</div></article>
 <article class="card kpi"><div class="kpi-top"><span>Eficiência coletiva (${colBase==='final'?'peças prontas':'fábrica'})</span><span class="kpi-icon">👥</span></div><div class="kpi-value">${colFab!=null?pctTxt(+Number(colFab).toFixed(1)):'—'}</div><div class="kpi-foot">${colAtiva?'Meta coletiva ativa · base '+esc({final:'peças prontas',fabrica:'fábrica',setor:'setor',grupo:'grupo'}[colBase]):'Meta coletiva desativada'}</div></article>
 <article class="card kpi"><div class="kpi-top"><span>Faltas no mês</span><span class="kpi-icon">✕</span></div><div class="kpi-value">${(bonusData.faltas||[]).length}</div><div class="kpi-foot">${L.filter(l=>l.faltas).length} funcionário(s) com desconto</div></article>
 </div>
 <section class="card"><div class="section-head"><div><h3 class="section-title">Fechamento de ${esc(mesLabel(bonusMes))}</h3><p class="section-sub">Eficiência do mês = peças realizadas ÷ meta (tempo individual), só no tempo trabalhado — ausências não reduzem a eficiência do funcionário. Faixa pela eficiência arredondada para baixo.</p></div></div>
 <div class="table-wrap sticky-table"><table class="table table-cards"><thead><tr><th>Funcionário</th><th>Eficiência</th><th>Bônus</th><th>Salário base</th><th>Bônus individual</th>${colAtiva?'<th>Meta coletiva</th>':''}<th>Faltas</th><th>Ausências</th><th>Prêmio</th><th>Total a receber</th><th>Alertas</th></tr></thead><tbody>${L.length?L.map(tr).join(''):'<tr><td colspan="11" class="empty-row">Nenhum funcionário.</td></tr>'}</tbody></table></div></section>`;
}
function bonusFaltas(){
 const F=bonusData.faltas||[],ini=bonusMes+'-01',hoje=todayLocal(),def=hoje.slice(0,7)===bonusMes?hoje:ini;
 const porFunc={};F.forEach(f=>porFunc[f.funcionario]=(porFunc[f.funcionario]||0)+1);
 return `<section class="card"><form id="faltaForm" class="falta-form"><b>Registrar falta</b>
 <select class="select" name="funcionario" required>${activeEmployees().map(f=>`<option value="${esc(f.id)}">${esc(f.nome)}</option>`).join('')}</select>
 <label class="inline-date">Data <input class="input" type="date" name="data" value="${esc(def)}" required></label>
 <input class="input" name="observacao" placeholder="Observação (opcional)">
 <button class="btn btn-primary" type="submit">＋ Registrar</button></form></section>
 <section class="card"><div class="section-head"><div><h3 class="section-title">Faltas de ${esc(mesLabel(bonusMes))}</h3><p class="section-sub">${F.length} falta(s). O desconto segue a regra cadastrada em Regras.</p></div></div>
 <div class="table-wrap"><table class="table table-cards"><thead><tr><th>Funcionário</th><th>Data</th><th>No mês</th><th>Observação</th><th></th></tr></thead><tbody>
 ${F.length?F.map(f=>'<tr>'+td('Funcionário',esc(byId('funcionarios',f.funcionario)?.nome||'—'),'strong card-title')+td('Data',esc(fDate(f.data)),'num')+td('No mês',porFunc[f.funcionario]+' falta(s)','num')+td('Observação',esc(f.observacao||'—'))+td('Ação',`<button class="text-btn danger-btn" data-action="falta-excluir" data-id="${esc(f.id)}">Excluir</button>`,'num')+'</tr>').join(''):'<tr><td colspan="5" class="empty-row">Nenhuma falta registrada neste mês.</td></tr>'}
 </tbody></table></div></section>`;
}
function bonusSalarios(){
 const S={};(bonusData.salarios||[]).forEach(s=>S[s.funcionario]=s);
 const NS={};(bonusData.niveisSalario||[]).forEach(x=>NS[x.nivel]=x.salario);
 return `<div class="notice">O salário salvo aqui vale a partir de <b>${esc(mesLabel(bonusMes))}</b> (mês selecionado acima). Os meses anteriores mantêm o valor que tinham.</div>
 <section class="card"><div class="table-wrap"><table class="table table-cards"><thead><tr><th>Funcionário</th><th>Salário base vigente</th><th>Desde</th><th>Nível</th><th>Novo salário</th><th></th></tr></thead><tbody>
 ${activeEmployees().map(f=>{const s=S[f.id];return '<tr>'+td('Funcionário',esc(f.nome),'strong card-title')+td('Salário vigente',brl(s?.salario),'num')+td('Desde',s?esc(fDate(s.desde).slice(3)):'—','num')+
  td('Nível',`<select class="select sal-nivel" id="snv-${esc(f.id)}" data-func="${esc(f.id)}"><option value="">Sem nível</option>${data.niveis.map(n=>`<option value="${esc(n.id)}" ${String(s?.nivel??'')===String(n.id)?'selected':''}>${esc(n.nome)}${NS[n.id]!=null?' · '+brl(NS[n.id]):''}</option>`).join('')}</select>`)+
  td('Novo salário',`<input class="input sal-input" type="number" min="0" step="0.01" inputmode="decimal" id="sal-${esc(f.id)}" value="${s?esc(s.salario):''}" placeholder="0,00">`)+
  td('Ação',`<button class="btn btn-sm btn-primary" data-action="salvar-salario" data-id="${esc(f.id)}">Salvar</button>`,'num')+'</tr>'}).join('')}
 </tbody></table></div></section>`;
}
/* --- Regras: layout no estilo da tabela de bonificação progressiva --- */
function draft(){
 if(!rulesDraft){
  const cp=a=>(a||[]).map(f=>({min:Number(f.min),pct:Number(f.pct)}));
  const cfg=bonusData.config||{};
  rulesDraft={faixas:cp(bonusData.faixas),faixasColetiva:cp(bonusData.faixasColetiva),
   faltas:(bonusData.regrasFaltas||[]).map(r=>({min:Number(r.min),perda:Number(r.perda)})),
   config:{coletivaAtiva:cfg.coletivaAtiva!==false,coletivaBase:cfg.coletivaBase||'fabrica',coletivaDescontaFaltas:cfg.coletivaDescontaFaltas!==false}};
 }
 return rulesDraft;
}
const sortedBy=kind=>(draft()[kind]||[]).slice().sort((a,b)=>a.min-b.min);
function sortedFaixas(){return sortedBy('faixas')}
const BASES={final:'das peças prontas (operação final)',fabrica:'da fábrica toda',setor:'do setor do funcionário',grupo:'do grupo do funcionário'};
function regraTexto(fx){
 if(!fx.length)return null;
 const steps=fx.slice(1).map((f,i)=>+(f.pct-fx[i].pct).toFixed(3)),linear=steps.length&&steps.every(s=>s===steps[0])&&fx.slice(1).every((f,i)=>f.min-fx[i].min===1);
 return {first:fx[0],last:fx[fx.length-1],linear,step:steps[0]};
}
function comoFunciona(){
 const fx=sortedFaixas(),r=regraTexto(fx);if(!r)return '<li>Nenhuma faixa cadastrada.</li>';
 const ex=fx.find(f=>f.min===90)||fx[Math.floor(fx.length/2)],d=draft(),rc=regraTexto(sortedBy('faixasColetiva'));
 return `<li>A bonificação é calculada sobre o salário base.</li>`+
 (r.linear?`<li>A partir de ${r.first.min}% de eficiência começa em ${pctTxt(r.first.pct)}; a cada 1% a mais, aumenta ${fNum(r.step,r.step%1?1:0)} ponto percentual.</li>`:`<li>Abaixo de ${r.first.min}% de eficiência não há bonificação.</li>`)+
 `<li>Exemplo: ao atingir ${ex.min}% de eficiência, o colaborador recebe ${pctTxt(ex.pct)} de bonificação sobre o salário base.</li>`+
 `<li>${r.last.min}% ou mais de eficiência = ${pctTxt(r.last.pct)} (teto).</li>`+
 (d.config.coletivaAtiva&&rc?`<li>Meta coletiva: soma-se de ${pctTxt(rc.first.pct)} a ${pctTxt(rc.last.pct)} conforme a eficiência ${BASES[d.config.coletivaBase]}.</li>`:'');
}
function exemploCalc(){
 const d=draft(),sal=Number(exemplo.salario||0),nf=Math.max(0,Math.floor(Number(exemplo.faltas||0)));
 const pct=bonusPctFor(exemplo.ef,sortedBy('faixas')),pctC=d.config.coletivaAtiva?bonusPctFor(exemplo.efCol,sortedBy('faixasColetiva')):0;
 const perda=lossFor(nf,d.faltas.slice().sort((a,b)=>a.min-b.min));
 const brutoI=sal*pct/100,brutoC=sal*pctC/100;
 const bonus=brutoI*(1-perda/100),bonusC=brutoC*(1-(d.config.coletivaDescontaFaltas?perda:0)/100);
 return {pct,pctC,sal,nf,perda,brutoI,brutoC,bonus,bonusC,desconto:(brutoI-bonus)+(brutoC-bonusC)};
}
function exemploHtml(){
 const d=draft(),c=exemploCalc();
 const linha=(bonusData?.linhas||[]).find(l=>l.funcionario===exemplo.funcionario);
 return `<div class="bn-ex-row bn-ex-func"><span>Funcionário</span><select class="select" id="exFuncionario"><option value="">Simulação livre</option>${activeEmployees().map(f=>`<option value="${esc(f.id)}" ${f.id===exemplo.funcionario?'selected':''}>${esc(f.nome)}</option>`).join('')}</select></div>
 ${exemplo.funcionario?`<p class="bn-ex-note">${linha?.salario==null?'⚠ Sem salário cadastrado — cadastre na aba Salários. ':''}Eficiência real de ${esc(mesLabel(bonusMes))}: ${linha?.meta>0?pctTxt(+Number(linha.eficiencia).toFixed(2)):'sem apontamentos'}.</p>`:''}
 <div class="bn-ex-row"><span>Salário base</span><i></i><input class="bn-ex-input" type="text" inputmode="decimal" id="exSalario" value="${esc(String(exemplo.salario).replace('.',','))}"></div>
 <div class="bn-ex-row"><span>Eficiência alcançada</span><i></i><input class="bn-ex-input" type="text" inputmode="decimal" id="exEf" value="${esc(String(exemplo.ef).replace('.',','))}"><em>%</em></div>
 <div class="bn-ex-row"><span>Bonificação correspondente</span><i></i><b id="exPct">${pctTxt(c.pct)}</b></div>
 <div class="bn-ex-row"><span>Valor da bonificação</span><i></i><b id="exBonus">${brl(c.bonus)}</b></div>
 ${d.config.coletivaAtiva?`<div class="bn-ex-sep">META COLETIVA</div>
 <div class="bn-ex-row"><span>Eficiência coletiva</span><i></i><input class="bn-ex-input" type="text" inputmode="decimal" id="exEfCol" value="${esc(String(exemplo.efCol).replace('.',','))}"><em>%</em></div>
 <div class="bn-ex-row"><span>Bonificação coletiva</span><i></i><b id="exPctC">${pctTxt(c.pctC)}</b></div>
 <div class="bn-ex-row"><span>Valor coletivo</span><i></i><b id="exBonusC">${brl(c.bonusC)}</b></div>`:''}
 <div class="bn-ex-sep bn-ex-sep-red">FALTAS</div>
 <div class="bn-ex-row"><span>Faltas no mês</span><i></i><input class="bn-ex-input" type="text" inputmode="numeric" id="exFaltas" value="${esc(exemplo.faltas)}"></div>
 <div class="bn-ex-row"><span>Desconto</span><i></i><b id="exDesc" class="${c.desconto>0?'bn-neg':''}">${exFaltasTxt(c)}</b></div>
 <div class="bn-ex-total"><span>TOTAL A RECEBER</span><div><b id="exTotal">${brl(c.sal+c.bonus+c.bonusC)}</b><small id="exConta">${exConta(c)}</small></div></div>`;
}
const exConta=c=>'('+brl(c.sal)+' + '+brl(c.bonus)+(draft().config.coletivaAtiva?' + '+brl(c.bonusC):'')+(c.desconto>0?' · já com −'+brl(c.desconto)+' de faltas':'')+')';
const exFaltasTxt=c=>c.nf?('Perde '+pctTxt(c.perda)+' do prêmio'+(draft().config.coletivaAtiva&&!draft().config.coletivaDescontaFaltas?' individual':'')+' → −'+brl(c.desconto)):'Sem desconto';
function bannerTxt(){
 const fx=sortedFaixas(),last=fx[fx.length-1],d=draft(),fc=sortedBy('faixasColetiva'),lc=fc[fc.length-1];
 return (last?`${last.min}% OU MAIS DE EFICIÊNCIA = ${pctTxt(last.pct)} DE BONIFICAÇÃO SOBRE O SALÁRIO BASE`:'')+(d.config.coletivaAtiva&&lc?` · META COLETIVA ATÉ +${pctTxt(lc.pct)}`:'');
}
function refreshRulesDerived(){
 const c=exemploCalc();
 const set=(id,v)=>{const el=document.getElementById(id);if(el)el.innerHTML=v};
 set('exPct',pctTxt(c.pct));set('exBonus',brl(c.bonus));set('exPctC',pctTxt(c.pctC));set('exBonusC',brl(c.bonusC));
 set('exTotal',brl(c.sal+c.bonus+c.bonusC));set('exConta',exConta(c));
 set('exDesc',exFaltasTxt(c));const de=document.getElementById('exDesc');if(de)de.classList.toggle('bn-neg',c.desconto>0);
 set('bnHow',comoFunciona());set('bnBanner',bannerTxt());
 const bar=document.getElementById('bnSaveBar');if(bar)bar.classList.toggle('dirty',rulesDirty);
}
function bnTable(kind,labelEf,labelPct){
 const d=draft(),fx=sortedBy(kind),last=fx[fx.length-1];
 return `<div class="bn-table-wrap"><div class="bn-table" style="--cols:${fx.length||1}">
  <div class="bn-col bn-col-label"><div class="bn-cell bn-label bn-label-ef">${labelEf}</div><div class="bn-cell bn-label bn-label-pct">${labelPct}</div></div>
  ${fx.map((f,i)=>`<div class="bn-col"><div class="bn-cell bn-ef"><input aria-label="Eficiência da coluna ${i+1}" data-tab="${kind}" data-i="${d[kind].indexOf(f)}" data-k="min" type="text" inputmode="numeric" value="${esc(f.min)}">${i===fx.length-1?'<small>OU MAIS</small>':''}</div><div class="bn-cell bn-pct"><input aria-label="Bonificação para ${esc(f.min)}%" data-tab="${kind}" data-i="${d[kind].indexOf(f)}" data-k="pct" type="text" inputmode="decimal" value="${esc(String(f.pct).replace('.',','))}"><span>%</span></div></div>`).join('')||'<div class="bn-col"><div class="bn-cell bn-ef">—</div><div class="bn-cell bn-pct">sem faixas</div></div>'}
 </div></div>
 <div class="bn-tools"><span>Gerar tabela:</span> começa em <input id="gen-${kind}-ini" type="number" value="${esc(fx[0]?.min??81)}" min="0">% com <input id="gen-${kind}-p0" type="text" inputmode="decimal" value="${esc(String(fx[0]?.pct??0.5).replace('.',','))}">%, somando <input id="gen-${kind}-st" type="text" inputmode="decimal" value="0,5"> ponto a cada 1%, até <input id="gen-${kind}-fim" type="number" value="${esc(last?.min??100)}">% <button type="button" class="bn-mini" data-action="tab-gerar" data-kind="${kind}">Gerar</button>
  <span class="bn-tools-sep"></span><button type="button" class="bn-mini" data-action="tab-add" data-kind="${kind}">＋ Coluna</button><button type="button" class="bn-mini" data-action="tab-del" data-kind="${kind}">− Última coluna</button></div>`;
}
function bonusRegras(){
 const d=draft(),fl=d.faltas.slice().sort((a,b)=>a.min-b.min),cfg=d.config,col=bonusData.coletivas||{};
 const efAtual=(cfg.coletivaBase==='fabrica'||cfg.coletivaBase==='final')?(col[cfg.coletivaBase]!=null?pctTxt(+Number(col[cfg.coletivaBase]).toFixed(1)):'sem apontamentos'):'varia por '+(cfg.coletivaBase==='setor'?'setor':'grupo');
 const ico='<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" stroke-width="3"/><rect x="13" y="27" width="5" height="9" fill="currentColor"/><rect x="21" y="22" width="5" height="14" fill="currentColor"/><rect x="29" y="17" width="5" height="19" fill="currentColor"/><path d="M12 24 L22 15 L27 19 L36 11" fill="none" stroke="currentColor" stroke-width="3"/><path d="M31 11 h5 v5" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
 return `<div class="bn-sheet">
 <header class="bn-hero"><div class="bn-hero-ico">${ico}</div><div><h2>TABELA DE <span>BONIFICAÇÃO PROGRESSIVA</span></h2><p>Mais desempenho, mais resultado, mais reconhecimento!</p></div></header>
 <div class="bn-section-title"><b>META INDIVIDUAL</b><small>eficiência do próprio funcionário no mês</small></div>
 ${bnTable('faixas','EFICIÊNCIA<br>(%)','BONIFICAÇÃO SOBRE O SALÁRIO<br>(SALÁRIO BASE)')}
 <div class="bn-section-title bn-section-col"><b>META COLETIVA</b><small>eficiência ${esc(BASES[cfg.coletivaBase])} · ${esc(mesLabel(bonusMes))}: ${esc(efAtual)}</small>
  <label class="bn-switch"><input type="checkbox" id="cfgColAtiva" ${cfg.coletivaAtiva?'checked':''}> Pagar meta coletiva</label>
  <label class="bn-switch">Base <select id="cfgColBase">${Object.entries({final:'Peças prontas (operação final)',fabrica:'Fábrica toda',setor:'Setor do funcionário',grupo:'Grupo do funcionário'}).map(([k,v])=>`<option value="${k}" ${cfg.coletivaBase===k?'selected':''}>${v}</option>`).join('')}</select></label>
  <label class="bn-switch"><input type="checkbox" id="cfgColFaltas" ${cfg.coletivaDescontaFaltas?'checked':''}> Faltas descontam também</label></div>
 <div class="${cfg.coletivaAtiva?'':'bn-off'}">${bnTable('faixasColetiva','EFICIÊNCIA<br>COLETIVA (%)','BONIFICAÇÃO<br>COLETIVA')}</div>
 <div class="bn-cards">
  <section class="bn-card"><h3 class="bn-card-h navy"><span>☑</span> COMO FUNCIONA?</h3><ul class="bn-how" id="bnHow">${comoFunciona()}</ul></section>
  <section class="bn-card bn-motto"><div class="bn-target">◎</div><p>DESEMPENHO<br>QUE GERA VALOR.<br><b>RESULTADO QUE<br>TRANSFORMA.</b><br>E RECONHECIMENTO<br><b>QUE MOTIVA!</b></p></section>
  <section class="bn-card"><h3 class="bn-card-h red"><span>▦</span> EXEMPLO PRÁTICO</h3><div class="bn-ex">${exemploHtml()}</div></section>
  <section class="bn-card"><h3 class="bn-card-h red"><span>▦</span> DESCONTO POR FALTAS</h3>
   <div class="bn-faltas">${fl.map(r=>`<div class="bn-fl-row"><div><input aria-label="Quantidade de faltas" data-fl="${d.faltas.indexOf(r)}" data-k="min" type="text" inputmode="numeric" value="${esc(r.min)}"> ${r===fl[fl.length-1]?'falta(s) ou mais':(r.min===1?'falta':'faltas')}</div><div>Perde <input aria-label="Percentual perdido" data-fl="${d.faltas.indexOf(r)}" data-k="perda" type="text" inputmode="decimal" value="${esc(String(r.perda).replace('.',','))}">% do prêmio${Number(r.perda)>=100?' <small>(sem bonificação)</small>':''}</div></div>`).join('')||'<p class="muted-small" style="padding:12px">Sem desconto por faltas.</p>'}</div>
   <div class="bn-fl-tools"><button type="button" class="bn-mini" data-action="fl-add">＋ Linha</button><button type="button" class="bn-mini" data-action="fl-del">− Última</button></div></section>
 </div>
 <div class="bn-banner"><span class="bn-star">★</span><b id="bnBanner">${bannerTxt()}</b></div>
 <section class="bn-rules"><h3><span>🏆</span> REGRAS DE EVOLUÇÃO E RECONHECIMENTO</h3><ol>
  <li>Ao atingir 3 meses consecutivos acima de 100% de eficiência, o colaborador passará por uma nova cronoanálise. <em>O sistema sinaliza no Fechamento do mês.</em></li>
  <li>Após a cronoanálise, o padrão de eficiência será readequado, retornando à faixa de 80% a 100%, conforme o novo tempo padrão definido. <em>Revise em Níveis e tempos.</em></li>
  <li>Toda vez que ultrapassar 100% de eficiência, o colaborador receberá um brinde especial da empresa, em comemoração ao resultado acima de 100%. <em>Marcado como 🎁 no fechamento.</em></li>
  <li>Após a nova cronoanálise, o colaborador será avaliado para progressão de nível. A empresa terá 5 níveis profissionais, definidos conforme as competências de cada colaborador.</li>
 </ol></section>
 <div class="bn-save${rulesDirty?' dirty':''}" id="bnSaveBar"><span>Alterações não salvas nas regras</span><button type="button" class="btn" data-action="regras-descartar">Descartar</button><button type="button" class="btn btn-primary" data-action="regras-salvar">Salvar regras</button></div>
 </div>`;
}
const num=v=>{const t=String(v??'').trim().replace(/\./g,'').replace(',','.');return t===''?NaN:Number(String(v).includes(',')?t:String(v).trim())};
function rulesInput(t){
 const d=draft();
 if(t.dataset.tab){const f=d[t.dataset.tab]?.[Number(t.dataset.i)];if(f){f[t.dataset.k]=num(t.value);rulesDirty=true;}}
 else if(t.dataset.fl!==undefined){const r=d.faltas[Number(t.dataset.fl)];if(r){r[t.dataset.k]=num(t.value);rulesDirty=true;}}
 else if(t.id==='exSalario')exemplo.salario=num(t.value)||0;
 else if(t.id==='exEf')exemplo.ef=num(t.value)||0;
 else if(t.id==='exEfCol')exemplo.efCol=num(t.value)||0;
 else if(t.id==='exFaltas')exemplo.faltas=Math.max(0,Math.floor(num(t.value)||0));
 else return false;
 refreshRulesDerived();return true;
}
function rulesConfig(t){
 const c=draft().config;
 if(t.id==='cfgColAtiva')c.coletivaAtiva=t.checked;
 else if(t.id==='cfgColBase')c.coletivaBase=t.value;
 else if(t.id==='cfgColFaltas')c.coletivaDescontaFaltas=t.checked;
 else return false;
 rulesDirty=true;render();return true;
}
function rulesAction(name,kind){
 const d=draft();
 if(name.startsWith('tab-')){
  const fx=sortedBy(kind);
  if(name==='tab-add'){const l=fx[fx.length-1];d[kind].push({min:l?l.min+1:81,pct:l?+(l.pct+0.5).toFixed(2):0.5});}
  else if(name==='tab-del'){if(fx.length)d[kind].splice(d[kind].indexOf(fx[fx.length-1]),1);}
  else if(name==='tab-gerar'){const g=s=>document.getElementById('gen-'+kind+'-'+s)?.value;
   const ini=Math.round(Number(g('ini'))),fim=Math.round(Number(g('fim'))),p0=num(g('p0')),st=num(g('st'));
   if(!(fim>=ini)||fim-ini>200||!(p0>=0)||!(st>=0)){toast('Confira os valores para gerar a tabela.');return;}
   d[kind]=[];for(let e=ini;e<=fim;e++)d[kind].push({min:e,pct:+(p0+(e-ini)*st).toFixed(2)});}
 }
 else if(name==='fl-add'){const fl=d.faltas.slice().sort((a,b)=>a.min-b.min),l=fl[fl.length-1];d.faltas.push({min:l?l.min+1:1,perda:l?Math.min(100,l.perda+25):10});}
 else if(name==='fl-del'){const fl=d.faltas.slice().sort((a,b)=>a.min-b.min);if(fl.length)d.faltas.splice(d.faltas.indexOf(fl[fl.length-1]),1);}
 rulesDirty=true;render();
}
async function saveRules(){
 const d=draft(),fx=sortedBy('faixas'),fc=sortedBy('faixasColetiva'),fl=d.faltas.slice().sort((a,b)=>a.min-b.min);
 try{
  for(const [nome,t] of [['individual',fx],['coletiva',fc]]){
   if(t.some(f=>!Number.isInteger(f.min)||f.min<0||!(f.pct>=0)))throw Error('Tabela '+nome+': cada coluna precisa de eficiência inteira e bonificação válida.');
   if(new Set(t.map(f=>f.min)).size!==t.length)throw Error('Tabela '+nome+': há eficiências repetidas.');
  }
  if(fl.some(r=>!Number.isInteger(r.min)||r.min<1||!(r.perda>=0&&r.perda<=100)))throw Error('Faltas: quantidade a partir de 1 e perda entre 0% e 100%.');
  if(new Set(fl.map(r=>r.min)).size!==fl.length)throw Error('Há quantidades de faltas repetidas.');
  await window.GUT_API.bonusSave('regras',{faixas:fx,faixasColetiva:fc,faltas:fl,config:d.config});
  rulesDirty=false;rulesDraft=null;await loadBonus(true);toast('Regras de bonificação salvas.');
 }catch(err){toast('Não foi possível salvar: '+(err.message||String(err)))}
}
async function bonusSaveAndReload(tipo,dados,msg){
 try{await window.GUT_API.bonusSave(tipo,dados);await loadBonus(true);toast(msg)}catch(err){toast('Não foi possível salvar: '+(err.message||String(err)))}
}
function bonusCsv(){
 const L=bonusData?.linhas||[];
 const rows=[['Mês','Funcionário','Matrícula','Realizado','Meta','Eficiência (%)','Faixa (%)','Bônus (%)','Salário base','Bônus individual','Eficiência coletiva (%)','Bônus coletivo (%)','Bônus coletivo','Faltas','Perda (%)','Desconto','Prêmio','Total a receber','Brinde','Cronoanálise'],
  ...L.map(l=>[bonusMes,l.nome,l.matricula||'',l.realizado,l.meta,l.eficiencia??'',l.eficienciaFaixa??'',l.percentualBonus,l.salario??'',l.bonusBruto,l.eficienciaColetiva??'',l.percentualColetivo??0,l.bonusColetivoBruto??0,l.faltas,l.perdaPercentual,l.desconto,l.bonus,l.total??'',l.brinde?'Sim':'Não',l.cronoanalise?'Sim':'Não'])];
 const s='﻿'+rows.map(r=>r.map(x=>'"'+(typeof x==='number'?String(x).replace('.',','):String(x??'')).replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const blob=new Blob([s],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='gut-bonificacao-'+bonusMes+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV da bonificação exportado.');
}

/* ===================== MODAIS DE CADASTRO ===================== */
function selectField(name,label,arr,sel,required=true){return `<div class="field"><label for="${name}">${label}</label><select class="select" id="${name}" name="${name}" ${required?'required':''}>${!required?'<option value="">Selecione...</option>':''}${arr.map(x=>`<option value="${esc(x.id)}" ${String(sel)===String(x.id)?'selected':''}>${esc(x.nome)}</option>`).join('')}</select></div>`}
const inputField=(name,label,type='text',val='',extra='')=>`<div class="field"><label for="${name}">${label}</label><input class="input" type="${type}" name="${name}" id="${name}" value="${esc(val)}" ${extra} required></div>`;
function showModal(head,subtitle,body,submit='Salvar',modalType='generic',size=''){ $('#overlay').classList.remove('hidden');$('#modal').classList.remove('hidden');$('#overlay').setAttribute('aria-hidden','false');$('#modal').innerHTML=`<div class="modal ${size}"><div class="modal-top"><div><h2>${head}</h2><p>${subtitle}</p></div><button class="icon-button" data-action="fechar-modal" aria-label="Fechar">×</button></div><form id="modalForm" data-type="${esc(modalType)}" data-submit-label="${esc(submit)}"><div class="modal-body">${body}</div><div class="modal-footer"><button type="button" class="btn" data-action="fechar-modal">Cancelar</button><button type="submit" class="btn btn-primary">${submit}</button></div></form></div>`;$('#modal').querySelector('input,select,button')?.focus() }
function closeModal(){$('#overlay').classList.add('hidden');$('#modal').classList.add('hidden');$('#overlay').setAttribute('aria-hidden','true');$('#modal').innerHTML=''}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._timer);toast._timer=setTimeout(()=>t.classList.remove('show'),3600)}

function employeeGroupOptions(setor,sel=''){
 return '<option value="">Sem grupo específico</option>'+
 (data.grupos||[]).filter(g=>g.ativo!==false&&g.setor===setor).map(g=>
  '<option value="'+esc(g.id)+'" '+(String(g.id)===String(sel)?'selected':'')+'>'+esc(g.nome)+'</option>').join('');
}
function updateEmployeeGroups(){
 const select=$('#employeeGrupo'),sector=$('#setor');
 if(!select||!sector)return;
 const prev=select.value;
 select.innerHTML=employeeGroupOptions(sector.value,prev);
}
function optionalInput(name,label,value='',placeholder=''){
 return '<div class="field"><label for="'+esc(name)+'">'+esc(label)+'</label><input class="input" type="text" name="'+esc(name)+'" id="'+esc(name)+'" value="'+esc(value)+'" placeholder="'+esc(placeholder)+'"></div>';
}
function newEmployee(id){
 const f=id?byId('funcionarios',id):null;
 if(id&&!f){toast('Funcionário não encontrado.');return;}
 const has=new Set(f?.operacoes||[]),setor=f?.setor||'';
 const prods=data.produtos.filter(p=>routeOf(p.id).length);
 const body='<div class="emp-layout"><div class="emp-basic">'+
 inputField('nome','Nome do funcionário','text',f?.nome||'','autocomplete="off"')+
 optionalInput('matricula','Matrícula (opcional)',f?.matricula||'')+
 '<details class="opt-box"><summary>Estrutura da fábrica <small>(opcional'+(f?.setor?' · '+esc(byId('setores',f.setor)?.nome||''):'')+')</small></summary>'+
 '<div class="field"><label for="setor">Setor</label><select class="select" id="setor" name="setor"><option value="">Sem setor</option>'+data.setores.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===setor?'selected':'')+'>'+esc(x.nome)+'</option>').join('')+'</select></div>'+
 '<div class="field"><label for="employeeGrupo">Grupo</label><select id="employeeGrupo" name="grupo" class="select">'+employeeGroupOptions(setor,f?.grupo||'')+'</select></div>'+
 '<div class="field"><label>Máquinas</label><div class="checkbox-grid">'+(data.maquinas.length?data.maquinas.map(m=>'<label class="checkbox-line"><input type="checkbox" name="maquinas" value="'+esc(m.id)+'" '+((f?.maquinas||[]).includes(m.id)?'checked':'')+'> '+esc(m.nome)+'</label>').join(''):'<p class="muted-small">Nenhuma máquina cadastrada.</p>')+'</div></div>'+
 '<div class="field"><label>Funções</label><div class="checkbox-grid">'+(data.funcoes.length?data.funcoes.map(fn=>'<label class="checkbox-line"><input type="checkbox" name="funcoes" value="'+esc(fn.id)+'" '+((f?.funcoes||[]).includes(fn.id)?'checked':'')+'> '+esc(fn.nome)+'</label>').join(''):'<p class="muted-small">Nenhuma função cadastrada.</p>')+'</div></div>'+
 '</details></div>'+
 '<div class="emp-ops"><div class="emp-ops-head"><div><b>Operações que executa</b><small id="opsCount">'+has.size+' selecionada(s)</small></div><input class="input" id="opsSearch" placeholder="⌕ Filtrar produto ou operação" autocomplete="off"></div>'+
 (prods.length?'<div class="op-check">'+prods.map(p=>{const rot=routeOf(p.id),sel=rot.filter(r=>has.has(r.id)).length;
  return '<details class="op-group" data-prod="'+esc(p.id)+'"><summary class="op-group-head"><span class="op-toggle" aria-hidden="true"></span><b>'+esc(p.nome)+'</b><span class="pill '+(sel?'green':'grey')+'" data-count>'+sel+' de '+rot.length+'</span></summary><div class="op-body"><div class="op-body-tools"><button type="button" class="text-btn" data-opall="'+esc(p.id)+'">'+(sel===rot.length?'Desmarcar todas':'Marcar todas')+'</button></div><div class="op-items">'+
  rot.map(r=>'<label class="op-item" data-text="'+esc((p.nome+' '+(byId('processos',r.processo)?.nome||'')).toLowerCase())+'"><input type="checkbox" name="operacoes" value="'+esc(r.id)+'" '+(has.has(r.id)?'checked':'')+'><span>'+esc(r.etapa||'—')+'. '+esc(byId('processos',r.processo)?.nome||r.processo)+'</span><small>'+fNum(r.tempo,1)+' s</small></label>').join('')+'</div></div></details>';}).join('')+'</div>'
  :'<p class="notice">Nenhum produto com operações. Cadastre em Produtos e operações → Tempos por produto.</p>')+
 '</div></div>'+(f?'<input type="hidden" name="id" value="'+esc(f.id)+'">':'');
 showModal(f?'Editar funcionário':'Cadastrar funcionário','Marque as operações que ele executa. Em Níveis e tempos cada uma começa com o tempo padrão do produto.',body,f?'Salvar alterações':'Cadastrar funcionário',f?'employee_update':'employee','modal-wide');
}
function updateOpsCounters(){
 const form=$('#modalForm');if(!form)return;
 form.querySelectorAll('.op-group').forEach(g=>{const boxes=[...g.querySelectorAll('input[name=operacoes]')],n=boxes.filter(b=>b.checked).length;
  const pill=g.querySelector('[data-count]');pill.textContent=n+' de '+boxes.length;pill.className='pill '+(n?'green':'grey');
  const btn=g.querySelector('[data-opall]');if(btn)btn.textContent=n===boxes.length?'Desmarcar todas':'Marcar todas';});
 const c=$('#opsCount');if(c)c.textContent=form.querySelectorAll('input[name=operacoes]:checked').length+' selecionada(s)';
}
function newSector(){
 const body='<div class="form-grid">'+inputField('nome','Nome do setor')+optionalInput('descricao','Descrição (opcional)','', 'Ex.: Montagem, Inicialização, Finalização')+'</div>';
 showModal('Cadastrar setor','Os setores organizam a produção e os grupos no BI.',body,'Salvar setor','sector');
}
function newGroup(sectorId){
 if(!data.setores.length){newSector();return}
 const body='<div class="form-grid">'+selectField('setor','Setor do grupo',data.setores,sectorId||data.setores[0]?.id)+
 inputField('nome','Nome do grupo')+optionalInput('codigo','Código (opcional)','', 'Ex.: MONT-01')+
 optionalInput('descricao','Descrição (opcional)')+'</div>';
 showModal('Cadastrar grupo de produção','Ex.: Setor Montagem → Grupo Montagem 1.',body,'Salvar grupo','group');
}
function newMachine(){
 const body='<div class="form-grid">'+inputField('nome','Nome da máquina')+
 optionalInput('codigo','Código da máquina (opcional)','', 'Ex.: RET-01')+
 optionalInput('tipo','Tipo da máquina (opcional)','', 'Ex.: Reta, Overloque, Galoneira')+
 selectField('setor','Setor de referência (opcional)',data.setores,'',false)+
 optionalInput('descricao','Observações (opcional)')+'</div>';
 showModal('Cadastrar máquina','Depois você poderá selecionar esta máquina nos cadastros de funcionários.',body,'Salvar máquina','machine');
}
function newFunction(){
 const body='<div class="form-grid">'+inputField('nome','Nome da função')+optionalInput('descricao','Descrição (opcional)')+'</div>';
 showModal('Cadastrar função','A função ficará disponível como competência no cadastro de funcionários.',body,'Salvar função','function');
}
function setFinalOperation(productId){
 const prod=byId('produtos',productId);
 if(!prod){toast('Produto não encontrado.');return;}
 const rot=routeOf(productId);
 if(!rot.length){toast('Cadastre primeiro uma operação para este produto.');return;}
 const options='<option value="">Nenhuma operação final</option>'+rot.map(r=>'<option value="'+esc(r.id)+'" '+(r.final===true?'selected':'')+'>Etapa '+esc(r.etapa||'—')+' — '+esc(byId('processos',r.processo)?.nome||r.processo)+'</option>').join('');
 const qtd=data.lancamentos.filter(l=>l.produto===productId).length;
 const body='<div class="form-grid"><input type="hidden" name="produto" value="'+esc(productId)+'"><div class="field full"><label for="finalRoteiro">Última operação do produto</label><select id="finalRoteiro" class="select" name="roteiro">'+options+'</select></div>'+
 '<div class="field full"><label class="checkbox-line"><input type="checkbox" name="retroativo"> Aplicar também aos '+qtd+' apontamento(s) já registrados deste produto</label></div>'+
 '<div class="field full"><p class="modal-tip">Peças prontas = peças realizadas nos apontamentos da operação final. Sem marcar a opção acima, a mudança vale apenas para os próximos apontamentos e o histórico fica preservado.</p></div></div>';
 showModal('Definir operação final',esc(prod.nome)+' · Escolha qual operação conclui a peça.',body,'Salvar operação final','final_operation');
}
function newProduct(){showModal('Novo produto','Depois, em Tempos por produto, vincule as operações e o tempo de cada uma.',`<div class="form-grid">${inputField('nome','Nome do produto')}${optionalInput('codigo','Código (opcional)')}<div class="field full"><label for="descricao">Descrição</label><textarea class="input" name="descricao" id="descricao" rows="3" style="min-height:80px"></textarea></div></div>`,'Salvar produto','product')}
function newProcess(){showModal('Nova operação','A operação pode ser usada em vários produtos, cada um com seu tempo.',`<div class="form-grid">${inputField('nome','Nome da operação')}${optionalInput('codigo','Código (opcional)')}${data.funcoes.length?selectField('funcao','Função relacionada (opcional)',data.funcoes,'',false):''}</div>`,'Salvar operação','process')}
function editRouteTime(id){const r=byId('roteiro',id);if(!r){toast('Operação não encontrada.');return;}showModal('Alterar tempo padrão',esc(opLabel(r)),`<div class="form-grid"><input type="hidden" name="id" value="${esc(id)}">${inputField('tempo','Tempo padrão (segundos/peça)','number',r.tempo,'min="0.001" step="0.001"')}</div><p class="modal-tip" style="margin-top:14px">Vale para os próximos apontamentos de quem não tem tempo individual. Apontamentos já registrados mantêm o tempo que usaram.</p>`,'Salvar tempo','route_update')}
function linkProcess(id){const p=byId('produtos',id);showModal('Vincular operação',`Produto: ${esc(p?.nome||id)}`,`<div class="form-grid"><input type="hidden" name="produto" value="${esc(id)}">${selectField('processo','Operação',data.processos,data.processos[0]?.id)}${inputField('tempo','Tempo padrão (segundos/peça)','number',60,'min="0.001" step="0.001"')}</div>`,'Vincular operação','linkprocess')}
async function handleSubmit(ev){
 ev.preventDefault();
 if(!authenticated){renderLogin();return}
 const form=ev.target,formType=form.dataset.type,fd=new FormData(form);
 const v=k=>String(fd.get(k)||'').trim();
 const button=form.querySelector('[type="submit"]');
 if(formType==='acc_empresa'||formType==='acc_senha'){
  closeModal();
  if(formType==='acc_empresa')accRun(()=>window.GUT_API.empresaSave({id:v('id'),nome:v('nome'),documento:v('documento'),limite:v('limite')}),'Empresa atualizada.');
  else{if(v('senha').length<8){toast('A senha precisa ter pelo menos 8 caracteres.');return;}accRun(()=>window.GUT_API.acessoFn({acao:'senha',email:v('email'),senha:v('senha')}),'Senha trocada. Passe a nova senha para a pessoa.');}
  return;
 }
 if(button){button.disabled=true;button.textContent='Gravando no Supabase...'}
 try{
   let payload,msg='Registro salvo com sucesso no Supabase.';
   if(formType==='employee'||formType==='employee_update'){
     if(!v('nome'))throw Error('Informe o nome do funcionário.');
     if(v('grupo') && byId('grupos',v('grupo'))?.setor!==v('setor'))throw Error('O grupo deve pertencer ao setor escolhido.');
     payload={id:v('id'),nome:v('nome'),matricula:v('matricula'),setor:v('setor'),grupo:v('grupo'),
        maquinas:fd.getAll('maquinas'),funcoes:fd.getAll('funcoes'),operacoes:fd.getAll('operacoes')};
     page='funcionarios';
   }else if(formType==='sector'){
     if(!v('nome'))throw Error('Informe o nome do setor.');
     payload={nome:v('nome'),descricao:v('descricao')};page='estrutura';sub.estrutura='setores';
   }else if(formType==='group'){
     if(!v('nome')||!v('setor'))throw Error('Selecione um setor e informe o nome do grupo.');
     payload={nome:v('nome'),codigo:v('codigo'),descricao:v('descricao'),setor:v('setor')};page='estrutura';sub.estrutura='setores';
   }else if(formType==='machine'){
     if(!v('nome'))throw Error('Informe o nome da máquina.');
     payload={nome:v('nome'),codigo:v('codigo'),tipo:v('tipo'),setor:v('setor'),descricao:v('descricao')};page='estrutura';sub.estrutura='maquinas';
   }else if(formType==='function'){
     if(!v('nome'))throw Error('Informe o nome da função.');
     payload={nome:v('nome'),descricao:v('descricao')};page='estrutura';sub.estrutura='funcoes';
   }else if(formType==='final_operation'){
     if(!v('produto'))throw Error('Escolha um produto.');
     if(v('roteiro')&&!data.roteiro.some(r=>r.id===v('roteiro')&&r.produto===v('produto')))throw Error('A operação selecionada não pertence ao produto.');
     payload={produto:v('produto'),roteiro:v('roteiro'),retroativo:fd.get('retroativo')==='on'};
     page='produtos';
   }else if(formType==='product'){
     if(!v('nome'))throw Error('Informe o nome do produto.');
     payload={codigo:v('codigo'),nome:v('nome'),descricao:v('descricao')};
     page='produtos';sub.produtos='produtos';
   }else if(formType==='process'){
     if(!v('nome'))throw Error('Informe o nome da operação.');
     payload={codigo:v('codigo'),nome:v('nome'),funcao:v('funcao')};
     page='produtos';if(sub.produtos==='produtos')sub.produtos='operacoes';
   }else if(formType==='linkprocess'){
     if(!v('produto')||!v('processo')||!(Number(v('tempo'))>0))throw Error('Informe um produto, a operação e o tempo padrão positivo.');
     payload={produto:v('produto'),processo:v('processo'),tempo:Number(v('tempo'))};
     page='produtos';sub.produtos='tempos';rotProd=v('produto');
   }else if(formType==='route_update'){
     if(!(Number(v('tempo'))>0))throw Error('O tempo padrão deve ser positivo.');
     payload={id:v('id'),tempo:Number(v('tempo'))};page='produtos';sub.produtos='tempos';
   }else if(formType==='time'){
     if(v('roteiro')?!byId('roteiro',v('roteiro')):!routeItem(v('produto'),v('processo')))throw Error('Essa operação não faz parte do roteiro deste produto.');
     if(!(Number(v('segundos'))>0))throw Error('O tempo deve ser positivo.');
     payload={funcionario:v('funcionario'),produto:v('produto'),processo:v('processo'),
       nivel:v('nivel'),segundos:Number(v('segundos')),motivo:v('motivo'),roteiro:v('roteiro')};
     page='niveis';sub.niveis='tempos';
   }else throw Error('Tipo de cadastro não reconhecido.');
   const res=await window.GUT_API.save(formType,payload);
   if(formType==='final_operation'&&payload.retroativo)msg='Operação final salva. '+fNum(res?.afetados||0)+' apontamento(s) reclassificado(s).';
   await loadData();
   closeModal();
   render();
   toast(msg);
 }catch(err){
   toast('Não foi possível salvar: '+(err.message||String(err)));
 }finally{
   if(button && button.isConnected){button.disabled=false;button.textContent=form.dataset.submitLabel||'Salvar'}
 }
}
function exportCsv(){const rows=[['Data','Funcionário','Setor','Grupo','Produto','Operação','Início','Fim','Minutos','Tempo por peça (s)','Meta (peças)','Realizado (peças)','Eficiência (%)','Operação final'],...filteredRows(filters).map(l=>[l.data,byId('funcionarios',l.funcionario)?.nome||l.funcionario,l.setorNomeHistorico||byId('setores',l.setor)?.nome||'',l.grupoNomeHistorico||byId('grupos',l.grupo)?.nome||'',byId('produtos',l.produto)?.nome||l.produto,byId('processos',l.processo)?.nome||l.processo,l.inicio,l.fim,minutesBetween(l.inicio,l.fim),l.tempoSnapshot,l.metaSnapshot,l.realizado,l.metaSnapshot?(100*l.realizado/l.metaSnapshot).toFixed(2):'',isFinished(l)?'Sim':'Não'])];const s='﻿'+rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');const blob=new Blob([s],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='gut-apontamentos-supabase.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV dos apontamentos exportado.')}
function action(name,el){
 const id=el?.dataset?.id;
 if(name==='sair'){logout();return}
 if(!authenticated){renderLogin();return}
 switch(name){
 case 'novo-apontamento':goTo('lancamentos','novo');break;
 case 'ver-historico':goTo('lancamentos','historico');break;
 case 'novo-funcionario':newEmployee();break;
 case 'editar-funcionario':newEmployee(id);break;
 case 'novo-setor':newSector();break;
 case 'novo-grupo':newGroup(id);break;
 case 'nova-maquina':newMachine();break;
 case 'nova-funcao':newFunction();break;
 case 'novo-produto':newProduct();break;
 case 'marcar-final':setFinalOperation(id);break;
 case 'novo-processo':newProcess();break;
 case 'vincular-processo':linkProcess(id);break;
 case 'editar-tempo-padrao':editRouteTime(id);break;
 case 'ver-tempos':rotProd=id;sub.produtos='tempos';render();break;
 case 'revisar-op':reviseOp(el.dataset.func,el.dataset.rot);break;
 case 'toggle-slot':toggleSlot(id,el.dataset.ativo);break;
 case 'ver-funcionario':filters={...emptyFilters(),funcionario:id};filtersOpen=true;goTo('lancamentos','historico');break;
 case 'limpar-filtros':filters=emptyFilters();render();break;
 case 'exportar-csv':exportCsv();break;
 case 'sincronizar':loadData().then(()=>toast('Dados atualizados do Supabase.')).catch(e=>toast(e.message));break;
 case 'fechar-modal':closeModal();break;
 case 'bonus-csv':bonusCsv();break;
 case 'jornada-salvar':saveJornada();break;
 case 'aus-excluir':case 'aus-excluir-lote':if(el.dataset.confirm!=='1'){el.dataset.confirm='1';el.textContent='Confirmar exclusão';setTimeout(()=>{if(el.isConnected){el.dataset.confirm='';el.textContent='Excluir'}},4000);break;}
  excluirAusencia(name==='aus-excluir'?{id}:{lote:id},name==='aus-excluir'?'Ausência excluída.':'Ausência coletiva excluída para todos.');break;
 case 'bonus-recarregar':bonusErrMes='';loadBonus(true);render();break;
 case 'tab-add':case 'tab-del':case 'tab-gerar':case 'fl-add':case 'fl-del':rulesAction(name,el.dataset.kind);break;
 case 'regras-salvar':saveRules();break;
 case 'regras-descartar':rulesDraft=null;rulesDirty=false;render();break;
 case 'salvar-nivel-salario':{const v=$('#nsal-'+id)?.value;if(v!==''&&!(Number(v)>=0)){toast('Informe um salário válido.');break;}bonusSaveAndReload('nivel_salario',{nivel:id,salario:v===''?null:Number(v)},v===''?'Salário do nível removido.':'Salário básico do nível salvo.');break;}
 case 'salvar-salario':{const v=$('#sal-'+id)?.value;if(v===''||!(Number(v)>=0)){toast('Informe um salário válido.');break;}bonusSaveAndReload('salario',{funcionario:id,salario:Number(v),desde:bonusMes+'-01',nivel:$('#snv-'+id)?.value||null},'Salário salvo a partir de '+mesLabel(bonusMes)+'.');break;}
 case 'falta-excluir':if(el.dataset.confirm!=='1'){el.dataset.confirm='1';el.textContent='Confirmar exclusão';setTimeout(()=>{if(el.isConnected){el.dataset.confirm='';el.textContent='Excluir'}},4000);break;}bonusSaveAndReload('falta_excluir',{id},'Falta excluída.');break;
 default:accClick(name,el);break;
 }
}
document.addEventListener('click',ev=>{
 const nav=ev.target.closest('[data-page]'),act=ev.target.closest('[data-action]'),tab=ev.target.closest('[data-sub]'),slot=ev.target.closest('[data-slot]');
 if(nav){if(!authenticated){renderLogin();return;}search='';goTo(nav.dataset.page);$('#sidebar').classList.remove('open');return}
 if(tab){sub[page]=tab.dataset.sub;render();return}
 const modoBtn=ev.target.closest('[data-modo]');
 if(modoBtn){const keep=entry.data;resetEntry();entry.data=keep;entry.modo=modoBtn.dataset.modo;render();return}
 const tipoBtn=ev.target.closest('[data-austipo]');
 if(tipoBtn){entry.ausTipo=tipoBtn.dataset.austipo;entry.motivo=String($('#ausMotivo')?.value||entry.motivo);render();return}
 const opall=ev.target.closest('[data-opall]');
 if(opall){const g=opall.closest('.op-group'),boxes=[...g.querySelectorAll('input[name=operacoes]')],all=boxes.every(b=>b.checked);boxes.forEach(b=>b.checked=!all);updateOpsCounters();return}
 if(slot){
  if(slot.dataset.slot==='custom'){entry.custom=true;}
  else{entry.custom=false;entry.slot=slot.dataset.slot;}
  refreshEntry({times:true});
  if(entry.custom)$('#entryInicio')?.focus();else $('#entryRealizado')?.focus();
  return;
 }
 if(act)action(act.dataset.action,act);
});
document.addEventListener('toggle',ev=>{if(ev.target?.id==='filterBox')filtersOpen=ev.target.open},true);
document.addEventListener('change',ev=>{const t=ev.target;
 if(t.id==='impFile'&&t.files?.[0]){impLerArquivo(t.files[0]);return;}
 if(t.id==='accEmpSel'){accEmpresa=t.value;render();return;}
 if(t.classList?.contains('acc-perfil')){accRun(()=>window.GUT_API.acessoSave({email:t.dataset.email,perfil:t.value}),'Perfil alterado para '+PERFIL_TXT[t.value]+'.');return;}
 if(t.classList?.contains('sal-nivel')){const ns=(bonusData?.niveisSalario||[]).find(x=>String(x.nivel)===t.value);const inp=$('#sal-'+t.dataset.func);if(ns&&inp){inp.value=ns.salario;inp.classList.add('flash');setTimeout(()=>inp.classList.remove('flash'),700);}return;}
 if(t.id==='filterInicio'||t.id==='dashInicio'){filters.inicio=t.value;render();}
 if(t.id==='filterFim'||t.id==='dashFim'){filters.fim=t.value;render();}
 if(t.id==='filterFuncionario')filters.funcionario=t.value,render();
 if(t.id==='filterProduto')filters.produto=t.value,render();
 if(t.id==='filterProcesso')filters.processo=t.value,render();
 if(t.id==='filterSetor'){filters.setor=t.value;filters.grupo='';render();}
 if(t.id==='filterGrupo')filters.grupo=t.value,render();
 if(t.id==='entryData'){entry.data=t.value||todayLocal();if(!entry.custom)entry.slot='';if(entry.modo==='producao')refreshEntry();else render();}
 if(t.id==='entryFuncionario'){entry.funcionario=t.value;if(!entry.custom)entry.slot='';entry.roteiro='';if(entry.modo==='producao')refreshEntry({route:true});else render();}
 if(t.id==='colSetor'){entry.colSetor=t.value;render();}
 if(t.id==='ausMes'&&t.value){ausMes=t.value;render();}
 if(jornadaInput(t))return;
 if(t.id==='entryProduto'){entry.produto=t.value;entry.roteiro='';refreshEntry({route:true});}
 if(t.id==='entryRoteiro'){entry.roteiro=t.value;refreshEntry();}
 if(t.id==='entryInicio'||t.id==='entryFim'){entry[t.id==='entryInicio'?'inicio':'fim']=t.value;refreshEntry();}
 if(t.id==='nivFuncionario'){nivFunc=t.value;render();}
 if(t.id==='rotProduto'){rotProd=t.value;render();}
 if(page==='bonificacao'&&rulesConfig(t))return;
 if(t.id==='exFuncionario'){exemplo.funcionario=t.value;const l=(bonusData?.linhas||[]).find(x=>x.funcionario===t.value);if(l){exemplo.salario=l.salario??0;exemplo.ef=l.meta>0?+Number(l.eficiencia).toFixed(2):0;if(l.eficienciaColetiva!=null)exemplo.efCol=+Number(l.eficienciaColetiva).toFixed(2);exemplo.faltas=l.faltas||0;}render();}
 if(t.id==='bonusMes'&&t.value){bonusMes=t.value;loadBonus(true);render();}
 if(t.name==='operacoes')updateOpsCounters();
 if(t.id==='setor'&&$('#employeeGrupo'))updateEmployeeGroups();
});
document.addEventListener('input',ev=>{
 if(ev.target.id==='employeeSearch'){search=ev.target.value;const pos=ev.target.selectionStart;render();const el=$('#employeeSearch');el.focus();el.setSelectionRange(pos,pos)}
 if(ev.target.id==='entryRealizado'){entry.realizado=ev.target.value;paintPreview();}
 if(['ausInicio','ausFim','colInicio','colFim'].includes(ev.target.id)){entry[ev.target.id]=ev.target.value;
   const m=$('#ausMin');if(m){const n=minutosAusencia(entry.ausInicio,entry.ausFim,entry.data);m.textContent=n?hhmm(n)+' de ausência (sem contar o intervalo)':'Informe o horário em que a pessoa não trabalhou.';}
   const c=$('#colInfo');if(c){const n=minutosAusencia(entry.colInicio,entry.colFim,entry.data);c.textContent=(n?hhmm(n)+' para cada um. ':'')+'Não altera a eficiência de ninguém; entra só na eficiência da empresa. Quem tem falta no dia fica de fora.';}}
 if(ev.target.id==='ausMotivo')entry.motivo=ev.target.value;
 if(ev.target.dataset?.jd!==undefined&&ev.target.type!=='checkbox')jornadaInput(ev.target);
 if(page==='bonificacao'&&sub.bonificacao==='regras'&&rulesInput(ev.target))return;
 if(ev.target.id==='opsSearch'){const q=ev.target.value.trim().toLowerCase();document.querySelectorAll('#modalForm .op-group').forEach(g=>{let any=false;g.querySelectorAll('.op-item').forEach(it=>{const ok=!q||it.dataset.text.includes(q);it.classList.toggle('hidden',!ok);any=any||ok});g.classList.toggle('hidden',!any);if(q)g.open=any;})}
});
document.addEventListener('submit',ev=>{const id=ev.target.getAttribute('id');if(id==='accUserForm'||id==='accEmpresaForm'){ev.preventDefault();if(id==='accUserForm')accCriarUsuario(ev.target);else accCriarEmpresa(ev.target);return;} /* getAttribute: um campo chamado "id" sobrescreve form.id */if(id==='modalForm')handleSubmit(ev);else if(id==='loginForm')handleLogin(ev);else if(id==='entryForm')submitEntry(ev);else if(id==='slotForm')submitSlot(ev);else if(id==='linkForm')submitLink(ev);else if(id==='faltaForm'){ev.preventDefault();const fd=new FormData(ev.target);bonusSaveAndReload('falta',{funcionario:fd.get('funcionario'),data:fd.get('data'),observacao:fd.get('observacao')},'Falta registrada.');}});
window.addEventListener?.('hashchange',()=>{const target=window.location?.hash==='#tv'?'tv':'lancamentos';if(target==='tv'&&page!=='tv'){page='tv';render();}else if(target==='lancamentos'&&page==='tv'){page='lancamentos';render();}});
$('#overlay').addEventListener('click',closeModal);
document.addEventListener('dragover',ev=>{const z=ev.target.closest?.('.imp-drop');if(z){ev.preventDefault();z.classList.add('is-over');}});
document.addEventListener('dragleave',ev=>{ev.target.closest?.('.imp-drop')?.classList.remove('is-over');});
document.addEventListener('drop',ev=>{const z=ev.target.closest?.('.imp-drop');if(!z)return;ev.preventDefault();z.classList.remove('is-over');const f=ev.dataTransfer?.files?.[0];if(f&&!impState.busy)impLerArquivo(f);});
$('#openMenu').addEventListener('click',()=>$('#sidebar').classList.add('open'));
/* menu lateral recolhível (computador): lembra a escolha neste navegador */
function setNavCollapsed(on){document.body.classList.toggle('nav-collapsed',on);const b=$('#toggleSidebar');if(b){b.textContent=on?'»':'«';const t=on?'Expandir menu':'Recolher menu';b.title=t;b.setAttribute('aria-label',t);}try{localStorage.setItem('gut_nav_collapsed',on?'1':'0')}catch(_){}}
document.querySelectorAll('.sidebar .nav-link').forEach(b=>{if(!b.title)b.title=b.textContent.replace(/^\S+\s*/,'').trim()});
$('#toggleSidebar').addEventListener('click',()=>setNavCollapsed(!document.body.classList.contains('nav-collapsed')));
try{if(localStorage.getItem('gut_nav_collapsed')==='1')setNavCollapsed(true)}catch(_){}
$('#closeMenu').addEventListener('click',()=>$('#sidebar').classList.remove('open'));
document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeModal()});
boot();
})();
