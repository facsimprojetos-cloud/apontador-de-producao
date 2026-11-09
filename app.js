/* GUT Apontador — interface conectada ao Supabase Auth e funções RPC protegidas por RLS. */
(() => {
'use strict';
const NAMES = {tv:'Painel para TV',dashboard:'Visão geral',lancamentos:'Apontamentos',funcionarios:'Funcionários',estrutura:'Estrutura da fábrica',produtos:'Produtos e operações',niveis:'Níveis e tempos',config:'Configurações'};
/* Sub-abas exibidas no cabeçalho de cada página. */
const SUBS = {
 dashboard:[['resumo','Resumo'],['operadores','Operadores'],['setores','Setores e grupos']],
 lancamentos:[['novo','Apontar'],['historico','Histórico'],['horarios','Horários fixos']],
 estrutura:[['setores','Setores e grupos'],['maquinas','Máquinas'],['funcoes','Funções']],
 niveis:[['tempos','Tempos individuais'],['niveis','Níveis']]
};
const sub = {dashboard:'resumo',lancamentos:'novo',estrutura:'setores',niveis:'tempos'};
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
const routeOf=produto=>data.roteiro.filter(r=>r.produto===produto).sort((a,b)=>(a.etapa||0)-(b.etapa||0));
function getTime(funcionario,produto,processo){const t=timeItem(funcionario,produto,processo),r=routeItem(produto,processo);if(!r)return null;return {segundos:Number(t?.segundos??r.tempo),nivel:t?.nivel??null,fonte:t?'individual':'padrão',vinculo:t?.id??null}}
const EMPTY=()=>({setores:[],grupos:[],maquinas:[],funcoes:[],funcionarios:[],produtos:[],processos:[],roteiro:[],niveis:[],tempos:[],horarios:[],lancamentos:[]});
let data=EMPTY();
let authenticated=false;
let authorizedEmail='';
const $main=$('#content');let page=(window.location?.hash==='#tv'?'tv':'dashboard'), search='', filters=emptyFilters();
let filtersOpen=false;
const canEdit=()=>data.perfil!=='leitor';
function sums(rows){const realizado=rows.reduce((a,r)=>a+(Number(r.realizado)||0),0),meta=rows.reduce((a,r)=>a+(Number(r.metaSnapshot)||0),0);return {realizado,meta,eff:meta?realizado*100/meta:null,total:rows.length}}
function pct(value){return value==null?'—':fNum(value,2)+'%'}
function effPill(value){return `<span class="pill ${value==null?'grey':value>=100?'green':value>=85?'amber':'grey'}">${pct(value)}</span>`}
function title(text,subtitle,right=''){return `<div class="page-head"><div><div class="eyebrow">GUT • CHÃO DE FÁBRICA</div><h1 class="page-title">${esc(text)}</h1><p class="page-subtitle">${esc(subtitle)}</p></div>${right?`<div class="toolbar">${right}</div>`:''}</div>`}
function subtabs(){const list=SUBS[page];if(!list)return '';return `<nav class="subtabs" role="tablist" aria-label="Seções de ${esc(NAMES[page])}">${list.map(([k,l])=>`<button type="button" role="tab" class="subtab ${sub[page]===k?'active':''}" data-sub="${k}" aria-selected="${sub[page]===k}">${l}</button>`).join('')}</nav>`}
const btnNew=(what,label)=>`<button class="btn btn-primary" data-action="${what}" data-edit>＋ ${label}</button>`;
const td=(label,content,cls='')=>`<td data-label="${esc(label)}"${cls?` class="${cls}"`:''}>${content}</td>`;
function pageMarkup(){switch(page){case 'tv':return window.GUT_TV?window.GUT_TV.template(data):'<p>Painel de TV indisponível. Recarregue a página.</p>';case 'dashboard':return dashboard();case 'lancamentos':return lancamentos();case 'funcionarios':return funcionarios();case 'estrutura':return estrutura();case 'produtos':return produtos();case 'niveis':return niveis();case 'config':return config();default:return dashboard()}}

function renderLogin(message=''){
 window.GUT_TV?.stop();document.body.classList.remove('tv-page');
 authenticated=false;
 $('#breadcrumb').textContent='Acesso';
 $main.innerHTML = '<div class="login-layout"><section class="card login-card">' +
 '<div class="eyebrow">GUT • APONTADOR DE PRODUÇÃO</div>' +
 '<h1 class="page-title">Acesse o sistema</h1>' +
 '<p class="page-subtitle">Entre com o e-mail e a senha cadastrados no Supabase Auth. Os dados ficam protegidos e sincronizados.</p>' +
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
 authenticated=false;authorizedEmail='';
 data=EMPTY();
 renderLogin();
 toast('Sessão encerrada.');
}

function render(){
 if(!authenticated){renderLogin();return;}
 window.GUT_TV?.stop();
 document.body.classList.toggle('tv-page',page==='tv');
 document.body.classList.toggle('read-only',!canEdit());
 $main.innerHTML=pageMarkup();
 $('#breadcrumb').textContent=NAMES[page]||'Visão geral';
 document.querySelectorAll('[data-page]').forEach(btn=>btn.classList.toggle('active',btn.dataset.page===page));
 $('#footerDate').textContent='• '+new Date().getFullYear();
 if(page==='lancamentos'&&sub.lancamentos==='novo')afterEntryRender();
 if(page==='tv'&&window.GUT_TV){
   window.GUT_TV.start({
     reload:()=>window.GUT_API.load(),
     onUpdate:incoming=>{data={...EMPTY(),...incoming};},
     onBack:()=>{if(window.location?.hash==='#tv')window.location.hash='';page='dashboard';render();}
   });
 }
}
function goTo(p,s){page=p;if(s)sub[p]=s;if(window.location){if(p==='tv')window.location.hash='tv';else if(window.location.hash==='#tv')window.location.hash='';}render();window.scrollTo?.(0,0)}

/* ===================== VISÃO GERAL ===================== */
function dashboard(){
 const all=filteredRows(filters),tot=sums(all),days=[...new Set(all.map(x=>x.data))].sort();
 const head=title('Visão geral','Acompanhe a produtividade e o desempenho da sua confecção.',`<label class="inline-date">De <input aria-label="Data inicial do painel" type="date" class="input" id="dashInicio" value="${esc(filters.inicio)}"></label><label class="inline-date">Até <input aria-label="Data final do painel" type="date" class="input" id="dashFim" value="${esc(filters.fim)}"></label>${btnNew('novo-apontamento','Apontar')}`)+subtabs();
 if(sub.dashboard==='operadores'){
  const summary=data.funcionarios.map(e=>({...e,...sums(all.filter(l=>l.funcionario===e.id))})).filter(e=>e.total).sort((a,b)=>b.eff-a.eff);
  const daily=days.map(day=>({day,value:sums(all.filter(x=>x.data===day)).realizado}));const maxBar=Math.max(1,...daily.map(x=>x.value));
  return head+`<div class="grid-main">
<section class="card"><div class="section-head"><div><h3 class="section-title">Eficiência por operador</h3><p class="section-sub">Produção total ÷ meta total por funcionário</p></div><span class="pill green">Meta 100%</span></div>
<div class="chart-list">${summary.length?summary.map(e=>`<div class="bar-row"><span class="bar-label" title="${esc(e.nome)}">${esc(first(e.nome))}</span><div class="bar-track"><div class="bar ${e.eff<100?'orange':''}" style="width:${Math.min(100,Math.max(0,e.eff/130*100))}%"></div></div><span class="bar-value">${pct(e.eff)}</span></div>`).join(''):'<p class="muted-small">Sem apontamentos no período.</p>'}</div><div class="section-caption"><span class="legend"><span class="legend-line"></span> Referência: 100% de eficiência</span></div></section>
<section class="card"><div class="section-head"><div><h3 class="section-title">Produção por dia</h3><p class="section-sub">Peças realizadas por data de produção</p></div></div>
<div class="compact-chart">${daily.map(r=>`<div class="compact-bar-group"><div class="compact-bar" style="height:${Math.max(6,r.value/maxBar*115)}px" title="${esc(fDate(r.day))}: ${fNum(r.value)} peças"></div><div class="compact-bar-label">${esc(r.day.slice(8))}/${esc(r.day.slice(5,7))}</div></div>`).join('')}</div>
<div class="mini-split"><div class="mini-card"><div class="mini-num">${all.filter(l=>l.metaSnapshot&&l.realizado/l.metaSnapshot>1).length}</div><div class="mini-lbl">Apontamentos acima de 100%</div></div><div class="mini-card"><div class="mini-num">${all.filter(l=>minutesBetween(l.inicio,l.fim)<60).length}</div><div class="mini-lbl">Períodos parciais registrados</div></div></div></section></div>`;
 }
 if(sub.dashboard==='setores')return head+estruturaResumo(all);
 const prontas=all.filter(isFinished).reduce((n,l)=>n+Number(l.realizado||0),0);
 const rows=[...all].sort((a,b)=>(b.data+b.inicio).localeCompare(a.data+a.inicio)).slice(0,7);
 return head+`<div class="grid-kpis">
${kpi('Eficiência geral',pct(tot.eff),'↗','Média ponderada dos registros',tot.eff>=100)}
${kpi('Peças realizadas',fNum(tot.realizado),'▣',`Meta: ${fNum(tot.meta)} peças`,true)}
${kpi('Peças prontas',fNum(prontas),'✓','Apontadas na operação final',true)}
${kpi('Apontamentos',fNum(tot.total),'▤',`${days.length} dias de produção`,true)}
</div>
<section class="card"><div class="section-head"><div><h3 class="section-title">Últimos apontamentos</h3><p class="section-sub">Resumo das operações registradas</p></div><button class="text-btn" data-action="ver-historico">Ver todos →</button></div>${tableApontamentos(rows)}</section>`;
}
function kpi(label,value,ico,foot,up){return `<article class="card kpi"><div class="kpi-top"><span>${label}</span><span class="kpi-icon">${ico}</span></div><div class="kpi-value">${value}</div><div class="kpi-foot">${up?'<strong>●</strong> ':''}${foot}</div></article>`}
function tableApontamentos(rows){return `<div class="table-wrap"><table class="table table-cards"><thead><tr><th>Data</th><th>Funcionário</th><th>Setor / Grupo</th><th>Produto / Processo</th><th>Período</th><th>Meta</th><th>Realizado</th><th>Eficiência</th></tr></thead><tbody>${rows.length?rows.map(l=>{const person=byId('funcionarios',l.funcionario),product=byId('produtos',l.produto),proc=byId('processos',l.processo),eff=l.metaSnapshot?l.realizado*100/l.metaSnapshot:null;return `<tr>${td('Data',esc(fDate(l.data)))}${td('Funcionário',esc(person?.nome||l.funcionario),'strong card-title')}${td('Setor / Grupo',`<strong>${esc(l.setorNomeHistorico||byId('setores',l.setor)?.nome||'—')}</strong><small class="cell-sub">${esc(l.grupoNomeHistorico||byId('grupos',l.grupo)?.nome||'Sem grupo')}</small>`)}${td('Produto / Processo',`<b>${esc(product?.nome||l.produto)}</b><small class="cell-sub">${esc(proc?.nome||l.processo)}${isFinished(l)?' · <span class="final-flag">FINAL</span>':''}</small>`,'card-wide')}${td('Período',`${esc(l.inicio)}–${esc(l.fim)}`,'num')}${td('Meta',fNum(l.metaSnapshot),'num')}${td('Realizado',fNum(l.realizado),'strong num')}${td('Eficiência',effPill(eff),'num')}</tr>`}).join(''):`<tr><td colspan="8" class="empty-row">Nenhum lançamento no filtro selecionado.</td></tr>`}</tbody></table></div>`}
function selectOpts(collection,sel='',all=false,label='Todos'){const ar=data[collection]||[];return `${all?`<option value="">${label}</option>`:''}${ar.map(o=>`<option value="${esc(o.id)}" ${String(o.id)===String(sel)?'selected':''}>${esc(o.nome)}</option>`).join('')}`}

/* ===================== APONTAMENTOS ===================== */
function lancamentos(){
 const head=title('Apontamentos de produção','Registre a produção por hora e consulte o histórico.')+subtabs();
 if(sub.lancamentos==='historico')return head+historico();
 if(sub.lancamentos==='horarios')return head+horariosFixos();
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

/* --- Apontamento rápido com horários fixos --- */
let entry={data:todayLocal(),funcionario:'',produto:'',roteiro:'',slot:'',inicio:'',fim:'',custom:false,realizado:''};
let lastPreview=null,previewSeq=0,previewTimer=null;
const activeSlots=()=>(data.horarios||[]).filter(h=>h.ativo!==false).sort((a,b)=>toMin(a.inicio)-toMin(b.inicio));
const activeEmployees=()=>data.funcionarios.filter(f=>f.ativo!==false);
const dayEntries=()=>(data.lancamentos||[]).filter(l=>l.funcionario===entry.funcionario&&String(l.data)===entry.data).sort((a,b)=>toMin(a.inicio)-toMin(b.inicio));
const slotDone=s=>dayEntries().some(l=>overlaps(l.inicio,l.fim,s.inicio,s.fim));
function nextFreeSlot(){const list=activeSlots();return list.find(s=>!slotDone(s))||null}
function ensureEntryDefaults(){
 if(!activeEmployees().some(f=>f.id===entry.funcionario))entry.funcionario=activeEmployees()[0]?.id||'';
 if(!byId('produtos',entry.produto))entry.produto=data.produtos[0]?.id||'';
 const rot=routeOf(entry.produto);
 if(!rot.some(r=>r.id===entry.roteiro))entry.roteiro=rot[0]?.id||'';
 if(!entry.custom){
  if(!activeSlots().some(s=>s.id===entry.slot))entry.slot=nextFreeSlot()?.id||activeSlots()[0]?.id||'';
  const s=byId('horarios',entry.slot);
  if(s){entry.inicio=s.inicio;entry.fim=s.fim}else{entry.custom=true}
 }
}
function routeOptions(){return routeOf(entry.produto).map(r=>`<option value="${esc(r.id)}" ${r.id===entry.roteiro?'selected':''}>${esc(r.etapa||'—')}. ${esc(byId('processos',r.processo)?.nome||r.processo)}${r.final?' (final)':''}</option>`).join('')||'<option value="">Produto sem operações no roteiro</option>'}
function slotChips(){
 const slots=activeSlots();
 return slots.map(s=>{const done=slotDone(s),on=!entry.custom&&entry.slot===s.id;return `<button type="button" class="slot-chip${on?' active':''}${done?' done':''}" data-slot="${esc(s.id)}" aria-pressed="${on}" title="${done?'Já existe apontamento neste horário':'Horário livre'}">${hourLabel(s.inicio,s.fim)}${done?' <span aria-hidden="true">✓</span>':''}</button>`}).join('')+
 `<button type="button" class="slot-chip slot-custom${entry.custom?' active':''}" data-slot="custom" aria-pressed="${entry.custom}">✎ Outro horário</button>`;
}
function dayList(){
 const rows=dayEntries();const person=byId('funcionarios',entry.funcionario);const t=sums(rows);
 return `<div class="section-head"><div><h3 class="section-title">${esc(first(person?.nome)||'Funcionário')} · ${esc(fDate(entry.data))}</h3><p class="section-sub">${rows.length} apontamento(s) · ${fNum(t.realizado)} peças · ${pct(t.eff)}</p></div></div>`+
 (rows.length?`<div class="day-list">${rows.map(l=>{const eff=l.metaSnapshot?l.realizado*100/l.metaSnapshot:null;return `<div class="day-row"><span class="day-hour">${esc(l.inicio)}–${esc(l.fim)}</span><span class="day-op">${esc(byId('processos',l.processo)?.nome||'—')}<small>${esc(byId('produtos',l.produto)?.nome||'')}</small></span><span class="day-qty">${fNum(l.realizado)}<small>/ ${fNum(l.metaSnapshot)}</small></span>${effPill(eff)}</div>`}).join('')}</div>`:'<p class="muted-small day-empty">Nenhum apontamento deste funcionário nesta data.</p>');
}
function apontar(){
 if(!canEdit())return '<div class="notice">Seu perfil é somente leitura. Consulte a aba Histórico.</div>';
 if(!activeEmployees().length||!data.produtos.length)return '<div class="notice">Cadastre funcionários e produtos com operações antes de apontar.</div>';
 ensureEntryDefaults();
 return `<section class="card entry-card"><form id="entryForm" class="entry-form" autocomplete="off">
 <div class="entry-grid">
  <div class="field"><label for="entryData">Data</label><input class="input" type="date" id="entryData" value="${esc(entry.data)}" required></div>
  <div class="field"><label for="entryFuncionario">Funcionário</label><select class="select" id="entryFuncionario" required>${activeEmployees().map(f=>`<option value="${esc(f.id)}" ${f.id===entry.funcionario?'selected':''}>${esc(f.nome)}</option>`).join('')}</select></div>
  <div class="field"><label for="entryProduto">Produto</label><select class="select" id="entryProduto" required>${data.produtos.map(p=>`<option value="${esc(p.id)}" ${p.id===entry.produto?'selected':''}>${esc(p.nome)}</option>`).join('')}</select></div>
  <div class="field"><label for="entryRoteiro">Operação</label><select class="select" id="entryRoteiro" required>${routeOptions()}</select></div>
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
 </div>
 </form></section>
 <section class="card" id="entryDay">${dayList()}</section>`;
}
function refreshEntry(opts={}){
 ensureEntryDefaults();
 const chips=$('#slotChips');if(chips)chips.innerHTML=slotChips();
 const ct=$('#customTime');if(ct)ct.classList.toggle('hidden',!entry.custom);
 if(opts.route){const r=$('#entryRoteiro');if(r)r.innerHTML=routeOptions();}
 if(opts.times||!entry.custom){const i=$('#entryInicio'),f=$('#entryFim');if(i)i.value=entry.inicio;if(f)f.value=entry.fim;}
 const day=$('#entryDay');if(day)day.innerHTML=dayList();
 schedulePreview();
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
 el.innerHTML=`<div><strong>Tempo</strong><b>${p?.segundos?fNum(p.segundos,1)+' s':'—'}</b><small>${p?.fonte?(p.fonte==='individual'?'Individual':'Padrão')+(p.nivel?' · nível '+esc(p.nivel):''):'Sem roteiro'}</small></div>`+
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
function afterEntryRender(){schedulePreview()}
async function submitEntry(ev){
 ev.preventDefault();
 const form=ev.target,button=form.querySelector('[type="submit"]');
 const route=byId('roteiro',entry.roteiro);
 entry.realizado=String($('#entryRealizado')?.value||'').trim();
 try{
  if(!route)throw Error('Escolha uma operação do roteiro do produto.');
  if(!entry.inicio||!entry.fim)throw Error('Escolha um horário ou informe início e fim.');
  const min=minutesBetween(entry.inicio,entry.fim);
  if(min<=0||min>720)throw Error('O período deve ser maior que zero e não superar 12 horas.');
  const total=Number(entry.realizado);
  if(entry.realizado===''||!Number.isInteger(total)||total<0)throw Error('Peças realizadas devem ser um número inteiro (0 ou mais).');
  if(button){button.disabled=true;button.textContent='Gravando...'}
  await window.GUT_API.save('entry',{data:entry.data,funcionario:entry.funcionario,produto:entry.produto,processo:route.processo,roteiro:route.id,inicio:entry.inicio,fim:entry.fim,realizado:total});
  const label=hourLabel(entry.inicio,entry.fim);
  entry.realizado='';
  if(!entry.custom)entry.slot='';
  await loadData();
  toast(`Apontamento registrado: ${label} · ${fNum(total)} peças.`);
  $('#entryRealizado')?.focus();
 }catch(err){
  toast('Não foi possível salvar: '+(err.message||String(err)));
  if(button&&button.isConnected){button.disabled=false;button.textContent='Registrar apontamento'}
 }
}

/* --- Horários fixos --- */
function horariosFixos(){
 const list=(data.horarios||[]).slice().sort((a,b)=>toMin(a.inicio)-toMin(b.inicio));
 return `<section class="card"><div class="section-head"><div><h3 class="section-title">Horários fixos de apontamento</h3><p class="section-sub">Aparecem como atalhos na aba Apontar. Inative os que não usa.</p></div></div>
 <div class="slot-admin">${list.length?list.map(h=>`<div class="slot-row${h.ativo===false?' off':''}"><b>${hourLabel(h.inicio,h.fim)}</b><span class="pill ${h.ativo===false?'grey':'green'}">${h.ativo===false?'Inativo':'Ativo'}</span><button class="text-btn" data-edit data-action="toggle-slot" data-id="${esc(h.id)}" data-ativo="${h.ativo===false?'true':'false'}">${h.ativo===false?'Ativar':'Inativar'}</button></div>`).join(''):'<p class="muted-small">Nenhum horário cadastrado.</p>'}</div>
 <form id="slotForm" class="slot-form" data-edit><label class="inline-date">Início <input class="input" type="time" name="inicio" required></label><label class="inline-date">Fim <input class="input" type="time" name="fim" required></label><button class="btn btn-primary" type="submit">＋ Adicionar horário</button></form></section>`;
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
 return title('Funcionários','Cadastre funcionários por setor e grupo, com suas máquinas e funções.',btnNew('novo-funcionario','Cadastrar funcionário'))+
 '<div class="card controls-panel"><input id="employeeSearch" class="input search" placeholder="⌕ Buscar nome, matrícula, setor ou grupo..." aria-label="Buscar funcionário" value="'+esc(search)+'" /><div class="stats-row"><span><b>'+data.funcionarios.length+'</b> funcionários</span><span><b>'+data.setores.length+'</b> setores</span><span><b>'+(data.grupos||[]).length+'</b> grupos</span></div></div>'+
 '<div class="data-grid">'+items.map(f=>
   '<article class="card employee-card"><div class="employee-top"><div class="employee-avatar">'+esc(initials(f.nome))+'</div><div style="flex:1"><div class="employee-name">'+esc(f.nome)+'</div><div class="employee-code">Matrícula '+esc(f.matricula||f.id)+'</div></div>'+effPill(sums(data.lancamentos.filter(l=>l.funcionario===f.id)).eff)+'</div>'+
   '<div class="employee-info"><span>Setor principal</span><strong>'+esc(byId('setores',f.setor)?.nome||'Não definido')+'</strong></div>'+
   '<div class="employee-info"><span>Grupo de produção</span><strong>'+esc(byId('grupos',f.grupo)?.nome||'Sem grupo definido')+'</strong></div>'+
   '<div><div class="eyebrow" style="color:#8998a8;letter-spacing:.7px;margin-bottom:8px">MÁQUINAS HABILITADAS</div><div class="taglist">'+((f.maquinas||[]).length?f.maquinas.map(id=>'<span class="tag">'+esc(byId('maquinas',id)?.nome||id)+'</span>').join(''):'<span class="tag">Nenhuma máquina vinculada</span>')+'</div></div>'+
   '<div><div class="eyebrow" style="color:#8998a8;letter-spacing:.7px;margin-bottom:8px">FUNÇÕES QUE DOMINA</div><div class="taglist">'+((f.funcoes||[]).length?f.funcoes.map(id=>'<span class="tag">'+esc(byId('funcoes',id)?.nome||id)+'</span>').join(''):'<span class="tag">Nenhuma função vinculada</span>')+'</div></div>'+
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
function estruturaResumo(rows){
 const groups=new Map();
 for(const l of rows){
   const k=String(l.setor||'')+'|'+String(l.grupo||'');
   const old=groups.get(k)||{setor:l.setorNomeHistorico||byId('setores',l.setor)?.nome||'Sem setor',
                            grupo:l.grupoNomeHistorico||byId('grupos',l.grupo)?.nome||'Sem grupo',
                            count:0,realizado:0,meta:0};
   old.count++;old.realizado+=Number(l.realizado)||0;old.meta+=Number(l.metaSnapshot)||0;
   groups.set(k,old);
 }
 const grouped=[...groups.values()].sort((a,b)=>b.realizado-a.realizado);
 return '<section class="card"><div class="section-head"><div><h3 class="section-title">Produção por setor e grupo</h3><p class="section-sub">Apuração baseada na classificação histórica de cada lançamento.</p></div></div>'+
 '<div class="table-wrap"><table class="table table-cards"><thead><tr><th>Setor</th><th>Grupo</th><th>Apontamentos</th><th>Realizado</th><th>Meta</th><th>Eficiência</th></tr></thead><tbody>'+
 (grouped.length?grouped.map(r=>'<tr>'+td('Setor',esc(r.setor),'strong card-title')+td('Grupo',esc(r.grupo))+td('Apontamentos',String(r.count))+td('Realizado',fNum(r.realizado))+td('Meta',fNum(r.meta))+td('Eficiência',effPill(r.meta?100*r.realizado/r.meta:null))+'</tr>').join(''):'<tr><td colspan="6" class="empty-row">Ainda não há apontamentos.</td></tr>')+
 '</tbody></table></div></section>';
}

/* ===================== PRODUTOS ===================== */
function produtos(){
 const items=data.produtos;
 return title('Produtos e operações','Defina o roteiro e qual operação representa a peça pronta.',btnNew('novo-processo','Nova operação')+btnNew('novo-produto','Novo produto'))+
 '<div class="info-banner hide-mobile">Os tempos padrão calculam as metas. A operação final define as peças prontas a partir dos próximos apontamentos (o histórico só muda se você pedir).</div>'+
 '<div class="data-grid">'+items.map(p=>{
  const rot=routeOf(p.id);
  const final=rot.find(r=>r.final===true);
  const nomeFinal=final?byId('processos',final.processo)?.nome||'Operação cadastrada':null;
  return '<article class="card product-card"><div class="taglist" style="margin-bottom:13px"><span class="pill blue">'+esc(p.codigo||p.id)+'</span><span class="pill grey">'+rot.length+' operações</span></div>'+
   '<h3>'+esc(p.nome)+'</h3><p>'+esc(p.descricao||'Produto cadastrado')+'</p>'+
   '<div class="product-final-status '+(final?'is-set':'')+'"><span>✓ PEÇAS PRONTAS</span><strong>'+(final?esc(nomeFinal):'Operação final não definida')+'</strong></div>'+
   rot.map(r=>{
    const pr=byId('processos',r.processo);
    return '<div class="process-row"><div><strong>'+esc(pr?.nome||r.processo)+(r.final===true?' <span class="pill green">ETAPA FINAL</span>':'')+'</strong><small>Etapa '+esc(r.etapa||'—')+' · '+fNum(3600/r.tempo)+' peças/h</small></div><div class="process-time">'+fNum(r.tempo)+' s<small>/peça</small></div></div>';
   }).join('')+
   '<div class="product-actions" data-edit><button class="btn" data-action="vincular-processo" data-id="'+esc(p.id)+'">＋ Vincular operação</button><button class="btn btn-primary" data-action="marcar-final" data-id="'+esc(p.id)+'">✓ Definir operação final</button></div></article>';
 }).join('')+'</div>';
}

/* ===================== NÍVEIS ===================== */
function niveis(){
 const head=title('Níveis e tempos individuais','Metas personalizadas por funcionário, produto e operação, com histórico preservado.',btnNew('revisar-tempo','Revisar tempo'))+subtabs();
 if(sub.niveis==='niveis')return head+`<div class="level-cards">${data.niveis.map(n=>`<div class="card level-card"><div class="level-number">${esc(n.id)}</div><h3>Nível ${esc(n.id)} — ${esc(n.nome)}</h3><p>${esc(n.descricao)}</p></div>`).join('')}</div>
<div class="notice"><strong>Metodologia:</strong> ao revisar o tempo, os apontamentos anteriores continuam usando a meta histórica. Apontamentos com data retroativa usam o tempo que valia naquela data e hora.</div>`;
 const withTime=data.lancamentos.filter(l=>l.tempoSnapshot!=null).length;
 return head+`<section class="card"><div class="section-head"><div><h3 class="section-title">Tempos individualizados vigentes</h3><p class="section-sub">${data.tempos.length} configurações de tempo em segundos por peça</p></div></div><div class="table-wrap"><table class="table table-cards"><thead><tr><th>Funcionário</th><th>Produto</th><th>Operação</th><th>Nível</th><th>Tempo/peça</th><th>Meta/hora</th><th>Ação</th></tr></thead><tbody>${data.tempos.map(t=>`<tr>${td('Funcionário',esc(byId('funcionarios',t.funcionario)?.nome||'—'),'strong card-title')}${td('Produto',esc(byId('produtos',t.produto)?.nome||'—'))}${td('Operação',esc(byId('processos',t.processo)?.nome||'—'))}${td('Nível',`<span class="pill blue">Nível ${esc(t.nivel)}</span>`)}${td('Tempo/peça',fNum(t.segundos,1)+' s','strong')}${td('Meta/hora',fNum(3600/t.segundos,1))}${td('Ação',`<button class="text-btn" data-edit data-action="revisar-tempo" data-id="${esc(t.id)}">Revisar</button>`)}</tr>`).join('')}</tbody></table></div><div class="pagination">${withTime} lançamentos possuem tempo histórico registrado</div></section>`;
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

/* ===================== MODAIS DE CADASTRO ===================== */
function selectField(name,label,arr,sel,required=true){return `<div class="field"><label for="${name}">${label}</label><select class="select" id="${name}" name="${name}" ${required?'required':''}>${!required?'<option value="">Selecione...</option>':''}${arr.map(x=>`<option value="${esc(x.id)}" ${String(sel)===String(x.id)?'selected':''}>${esc(x.nome)}</option>`).join('')}</select></div>`}
const inputField=(name,label,type='text',val='',extra='')=>`<div class="field"><label for="${name}">${label}</label><input class="input" type="${type}" name="${name}" id="${name}" value="${esc(val)}" ${extra} required></div>`;
function showModal(head,subtitle,body,submit='Salvar',modalType='generic'){ $('#overlay').classList.remove('hidden');$('#modal').classList.remove('hidden');$('#overlay').setAttribute('aria-hidden','false');$('#modal').innerHTML=`<div class="modal"><div class="modal-top"><div><h2>${head}</h2><p>${subtitle}</p></div><button class="icon-button" data-action="fechar-modal" aria-label="Fechar">×</button></div><form id="modalForm" data-type="${esc(modalType)}" data-submit-label="${esc(submit)}"><div class="modal-body">${body}</div><div class="modal-footer"><button type="button" class="btn" data-action="fechar-modal">Cancelar</button><button type="submit" class="btn btn-primary">${submit}</button></div></form></div>`;$('#modal').querySelector('input,select,button')?.focus() }
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
 if(!data.setores.length){sub.estrutura='setores';goTo('estrutura');toast('Cadastre um setor antes de incluir funcionários.');return;}
 const f=id?byId('funcionarios',id):null;
 if(id&&!f){toast('Funcionário não encontrado.');return;}
 const setor=f?.setor||data.setores[0]?.id;
 const body='<div class="form-grid">'+
 inputField('nome','Nome do funcionário','text',f?.nome||'')+
 inputField('matricula','Matrícula','text',f?.matricula||'')+
 selectField('setor','Setor principal',data.setores,setor)+
 '<div class="field"><label for="employeeGrupo">Grupo de produção (opcional)</label><select id="employeeGrupo" name="grupo" class="select">'+employeeGroupOptions(setor,f?.grupo||'')+'</select></div>'+
 '<div class="field full"><div class="modal-tip">Funcionários podem mudar de setor ou grupo sem alterar os apontamentos históricos.</div></div>'+
 '<div class="field full"><label>Máquinas habilitadas</label><div class="checkbox-grid">'+
 (data.maquinas.length?data.maquinas.map(m=>'<label class="checkbox-line"><input type="checkbox" name="maquinas" value="'+esc(m.id)+'" '+((f?.maquinas||[]).includes(m.id)?'checked':'')+'> '+esc(m.nome)+'</label>').join(''):'<p class="muted-small">Nenhuma máquina cadastrada. Cadastre na aba Estrutura da fábrica.</p>')+
 '</div></div><div class="field full"><label>Funções que sabe realizar</label><div class="checkbox-grid">'+
 (data.funcoes.length?data.funcoes.map(fn=>'<label class="checkbox-line"><input type="checkbox" name="funcoes" value="'+esc(fn.id)+'" '+((f?.funcoes||[]).includes(fn.id)?'checked':'')+'> '+esc(fn.nome)+'</label>').join(''):'<p class="muted-small">Nenhuma função cadastrada.</p>')+
 '</div></div></div>'+
 (f?'<input type="hidden" name="id" value="'+esc(f.id)+'">':'');
 showModal(f?'Editar funcionário':'Cadastrar funcionário','Escolha o setor, grupo e todas as máquinas e funções habilitadas.',body,f?'Salvar alterações':'Cadastrar funcionário',f?'employee_update':'employee');
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
function newProduct(){showModal('Novo produto','Cadastre o produto e depois vincule as operações do roteiro.',`<div class="form-grid">${inputField('codigo','Código do produto')}${inputField('nome','Nome do produto')}<div class="field full"><label for="descricao">Descrição</label><textarea class="input" name="descricao" id="descricao" rows="3" style="min-height:80px"></textarea></div></div>`,'Salvar produto','product')}
function newProcess(){showModal('Nova operação','O cadastro de operação é reutilizável em vários produtos.',`<div class="form-grid">${inputField('codigo','Código da operação')}${inputField('nome','Nome da operação')}${selectField('funcao','Competência relacionada',data.funcoes,data.funcoes[0]?.id,false)}</div>`,'Salvar operação','process')}
function linkProcess(id){const p=byId('produtos',id);showModal('Vincular operação',`Produto: ${esc(p?.nome||id)}`,`<div class="form-grid"><input type="hidden" name="produto" value="${esc(id)}">${selectField('processo','Operação',data.processos,data.processos[0]?.id)}${inputField('tempo','Tempo padrão (segundos/peça)','number',60,'min="0.001" step="0.001"')}</div>`,'Vincular operação','linkprocess')}
function reviseTime(id){const t=data.tempos.find(x=>x.id===id),emp=t?.funcionario||data.funcionarios[0]?.id,product=t?.produto||data.produtos[0]?.id,proc=t?.processo||data.processos[0]?.id;const old=t?.segundos||getTime(emp,product,proc)?.segundos||60;showModal('Revisar tempo individual','Esta mudança não recalcula apontamentos históricos.',`<div class="form-grid"><input type="hidden" name="tempoId" value="${esc(id||'')}">${selectField('funcionario','Funcionário',data.funcionarios,emp)}${selectField('produto','Produto',data.produtos,product)}${selectField('processo','Operação',data.processos,proc)}${selectField('nivel','Nível do operador',data.niveis,t?.nivel||1)}${inputField('segundos','Novo tempo (segundos/peça)','number',old,'min="0.001" step="0.001"')}<div class="field"><label for="motivo">Motivo da revisão</label><input class="input" name="motivo" id="motivo" value="Revisão técnica de desempenho" required /></div></div><div class="info-banner" style="margin-top:18px">O tempo e o nível anteriores são mantidos no histórico.</div>`,'Salvar nova versão','time')}
async function handleSubmit(ev){
 ev.preventDefault();
 if(!authenticated){renderLogin();return}
 const form=ev.target,formType=form.dataset.type,fd=new FormData(form);
 const v=k=>String(fd.get(k)||'').trim();
 const button=form.querySelector('[type="submit"]');
 if(button){button.disabled=true;button.textContent='Gravando no Supabase...'}
 try{
   let payload,msg='Registro salvo com sucesso no Supabase.';
   if(formType==='employee'||formType==='employee_update'){
     if(!v('nome')||!v('matricula')||!v('setor'))throw Error('Informe nome, matrícula e setor.');
     if(v('grupo') && byId('grupos',v('grupo'))?.setor!==v('setor'))throw Error('Grupo diferente do setor informado.');
     payload={id:v('id'),nome:v('nome'),matricula:v('matricula'),setor:v('setor'),grupo:v('grupo'),
        maquinas:fd.getAll('maquinas'),funcoes:fd.getAll('funcoes')};
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
     if(!v('nome')||!v('codigo'))throw Error('Informe o código e o nome do produto.');
     payload={codigo:v('codigo'),nome:v('nome'),descricao:v('descricao')};
     page='produtos';
   }else if(formType==='process'){
     if(!v('nome')||!v('codigo'))throw Error('Informe o código e o nome da operação.');
     payload={codigo:v('codigo'),nome:v('nome'),funcao:v('funcao')};
     page='produtos';
   }else if(formType==='linkprocess'){
     if(!v('produto')||!v('processo')||!(Number(v('tempo'))>0))throw Error('Informe um produto, a operação e o tempo padrão positivo.');
     payload={produto:v('produto'),processo:v('processo'),tempo:Number(v('tempo'))};
     page='produtos';
   }else if(formType==='time'){
     if(!routeItem(v('produto'),v('processo')))throw Error('Essa operação não faz parte do roteiro deste produto.');
     if(!(Number(v('segundos'))>0))throw Error('O tempo deve ser positivo.');
     payload={funcionario:v('funcionario'),produto:v('produto'),processo:v('processo'),
       nivel:v('nivel'),segundos:Number(v('segundos')),motivo:v('motivo')};
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
 case 'revisar-tempo':reviseTime(id);break;
 case 'toggle-slot':toggleSlot(id,el.dataset.ativo);break;
 case 'ver-funcionario':filters={...emptyFilters(),funcionario:id};filtersOpen=true;goTo('lancamentos','historico');break;
 case 'limpar-filtros':filters=emptyFilters();render();break;
 case 'exportar-csv':exportCsv();break;
 case 'sincronizar':loadData().then(()=>toast('Dados atualizados do Supabase.')).catch(e=>toast(e.message));break;
 case 'fechar-modal':closeModal();break;
 default:break;
 }
}
document.addEventListener('click',ev=>{
 const nav=ev.target.closest('[data-page]'),act=ev.target.closest('[data-action]'),tab=ev.target.closest('[data-sub]'),slot=ev.target.closest('[data-slot]');
 if(nav){if(!authenticated){renderLogin();return;}search='';goTo(nav.dataset.page);$('#sidebar').classList.remove('open');return}
 if(tab){sub[page]=tab.dataset.sub;render();return}
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
 if(t.id==='filterInicio'||t.id==='dashInicio'){filters.inicio=t.value;render();}
 if(t.id==='filterFim'||t.id==='dashFim'){filters.fim=t.value;render();}
 if(t.id==='filterFuncionario')filters.funcionario=t.value,render();
 if(t.id==='filterProduto')filters.produto=t.value,render();
 if(t.id==='filterProcesso')filters.processo=t.value,render();
 if(t.id==='filterSetor'){filters.setor=t.value;filters.grupo='';render();}
 if(t.id==='filterGrupo')filters.grupo=t.value,render();
 if(t.id==='entryData'){entry.data=t.value||todayLocal();if(!entry.custom)entry.slot='';refreshEntry();}
 if(t.id==='entryFuncionario'){entry.funcionario=t.value;if(!entry.custom)entry.slot='';refreshEntry();}
 if(t.id==='entryProduto'){entry.produto=t.value;entry.roteiro='';refreshEntry({route:true});}
 if(t.id==='entryRoteiro'){entry.roteiro=t.value;refreshEntry();}
 if(t.id==='entryInicio'||t.id==='entryFim'){entry[t.id==='entryInicio'?'inicio':'fim']=t.value;refreshEntry();}
 if(t.id==='setor'&&$('#employeeGrupo'))updateEmployeeGroups();
});
document.addEventListener('input',ev=>{
 if(ev.target.id==='employeeSearch'){search=ev.target.value;const pos=ev.target.selectionStart;render();const el=$('#employeeSearch');el.focus();el.setSelectionRange(pos,pos)}
 if(ev.target.id==='entryRealizado'){entry.realizado=ev.target.value;paintPreview();}
});
document.addEventListener('submit',ev=>{const id=ev.target.id;if(id==='modalForm')handleSubmit(ev);else if(id==='loginForm')handleLogin(ev);else if(id==='entryForm')submitEntry(ev);else if(id==='slotForm')submitSlot(ev)});
window.addEventListener?.('hashchange',()=>{const target=window.location?.hash==='#tv'?'tv':'dashboard';if(target==='tv'&&page!=='tv'){page='tv';render();}else if(target==='dashboard'&&page==='tv'){page='dashboard';render();}});
$('#overlay').addEventListener('click',closeModal);
$('#openMenu').addEventListener('click',()=>$('#sidebar').classList.add('open'));
$('#closeMenu').addEventListener('click',()=>$('#sidebar').classList.remove('open'));
document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeModal()});
boot();
})();
