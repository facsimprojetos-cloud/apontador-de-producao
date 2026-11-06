/* GUT Apontador — interface conectada ao Supabase Auth e funções RPC protegidas por RLS. */
(() => {
'use strict';
const STORAGE = 'gut_apontador_demo_v1';
const NAMES = {dashboard:'Visão geral',lancamentos:'Apontamentos',funcionarios:'Funcionários',produtos:'Produtos e operações',niveis:'Níveis e tempos',config:'Configurações'};
const $ = s => document.querySelector(s);
const byId = (collection,id) => (data[collection]||[]).find(x=>String(x.id)===String(id));
const esc = value => String(value??'').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const fNum = (n,d=0)=> Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const fDate = s => s ? String(s).slice(0,10).split('-').reverse().join('/') : '—';
const initials = s=>String(s||'').split(/\s+/).filter(Boolean).slice(0,2).map(t=>t[0]).join('').toUpperCase();
const first = s=>String(s||'').split(' ')[0];
const minutesBetween=(a,b)=>{const [ah,am]=(a||'00:00').split(':').map(Number),[bh,bm]=(b||'00:00').split(':').map(Number);let n=bh*60+bm-ah*60-am; if(n<=0)n+=1440;return n};
const todayLocal=()=>{const d=new Date(),offset=d.getTimezoneOffset();return new Date(d.getTime()-offset*60000).toISOString().slice(0,10)};
const timeItem=(funcionario,produto,processo)=>data.tempos.find(t=>t.funcionario===funcionario&&t.produto===produto&&t.processo===processo);
const routeItem=(produto,processo)=>data.roteiro.find(r=>r.produto===produto&&r.processo===processo);
function getTime(funcionario,produto,processo){const t=timeItem(funcionario,produto,processo),r=routeItem(produto,processo);if(!r)return null;return {segundos:Number(t?.segundos??r.tempo),nivel:t?.nivel??null,fonte:t?'individual':'padrão',vinculo:t?.id??null}}
function augment(l){const t=getTime(l.funcionario,l.produto,l.processo);if(l.tempoSnapshot==null) l.tempoSnapshot=t?.segundos??null;if(l.nivelSnapshot===undefined||l.nivelSnapshot===null)l.nivelSnapshot=t?.nivel??null;if(l.metaSnapshot==null)l.metaSnapshot=l.tempoSnapshot?Math.round(minutesBetween(l.inicio,l.fim)*60/l.tempoSnapshot):0;return l}
let data={setores:[],maquinas:[],funcoes:[],funcionarios:[],produtos:[],processos:[],roteiro:[],niveis:[],tempos:[],lancamentos:[]};
let authenticated=false;
let authorizedEmail='';
function persist() {} // Persistência é feita exclusivamente no Supabase; sem dados locais.
const $main=$('#content');let page='dashboard', search='', filters={data:'',funcionario:'',produto:''},selectedProduct='';
function sums(rows){const realizado=rows.reduce((a,r)=>a+(Number(r.realizado)||0),0),meta=rows.reduce((a,r)=>a+(Number(r.metaSnapshot)||0),0);return {realizado,meta,eff:meta?realizado*100/meta:null,total:rows.length}}
function pct(value){return value==null?'—':fNum(value,2)+'%'}
function effPill(value){return `<span class="pill ${value==null?'grey':value>=100?'green':value>=85?'amber':'grey'}">${pct(value)}</span>`}
function title(text,sub,right=''){return `<div class="page-head"><div><div class="eyebrow">GUT • CHÃO DE FÁBRICA</div><h1 class="page-title">${esc(text)}</h1><p class="page-subtitle">${esc(sub)}</p></div>${right?`<div class="toolbar">${right}</div>`:''}</div>`}
const btnNew=(what,label)=>`<button class="btn btn-primary" data-action="${what}">＋ ${label}</button>`;
function pageMarkup(){switch(page){case 'dashboard':return dashboard();case 'lancamentos':return lancamentos();case 'funcionarios':return funcionarios();case 'produtos':return produtos();case 'niveis':return niveis();case 'config':return config();default:return dashboard()}}

function renderLogin(message=''){
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
 data=response;
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
 data={setores:[],maquinas:[],funcoes:[],funcionarios:[],produtos:[],processos:[],roteiro:[],niveis:[],tempos:[],lancamentos:[]};
 renderLogin();
 toast('Sessão encerrada.');
}

function render(){ if(!authenticated){renderLogin();return;} $main.innerHTML=pageMarkup(); $('#breadcrumb').textContent=NAMES[page];document.querySelectorAll('[data-page]').forEach(btn=>btn.classList.toggle('active',btn.dataset.page===page));$('#footerDate').textContent='• '+new Date().getFullYear() }
function dashboard(){const all=data.lancamentos,tot=sums(all),people=data.funcionarios.length,days=[...new Set(all.map(x=>x.data))].sort(),summary=data.funcionarios.map(e=>({...e,...sums(all.filter(l=>l.funcionario===e.id))})).filter(e=>e.total).sort((a,b)=>b.eff-a.eff);
const rows=[...all].sort((a,b)=>(b.data+b.inicio).localeCompare(a.data+a.inicio)).slice(0,7);
const daily=days.map(day=>({day,value:sums(all.filter(x=>x.data===day)).realizado}));const maxBar=Math.max(1,...daily.map(x=>x.value));
return `${title('Visão geral','Acompanhe a produtividade e o desempenho da sua confecção.',btnNew('novo-apontamento','Novo apontamento'))}
<section class="hero"><div class="hero-content"><div class="hero-overline">▰ CONTROLE DA PRODUÇÃO</div><h2>Mais visibilidade para produzir melhor, hora a hora.</h2><p>Indicadores, metas individualizadas e evolução dos operadores em um único lugar. Dados sincronizados com Supabase, incluindo cadastros, metas e apontamentos em tempo real.</p></div><div class="hero-actions"><button class="btn" data-page="lancamentos">Ver apontamentos →</button></div></section>
<div class="grid-kpis">
${kpi('Eficiência geral',pct(tot.eff),'↗','Média ponderada dos registros',tot.eff>=100)}
${kpi('Peças realizadas',fNum(tot.realizado),'▣',`Meta: ${fNum(tot.meta)} peças`,true)}
${kpi('Apontamentos',fNum(tot.total),'▤',`${days.length} dias de produção`,true)}
${kpi('Funcionários',fNum(people),'♙',`${data.setores.length} setores cadastrados`,true)}
</div>
<div class="grid-main">
<section class="card"><div class="section-head"><div><h3 class="section-title">Eficiência por operador</h3><p class="section-sub">Produção total ÷ meta total por funcionário</p></div><span class="pill green">Meta 100%</span></div>
<div class="chart-list">${summary.map(e=>`<div class="bar-row"><span class="bar-label" title="${esc(e.nome)}">${esc(first(e.nome))}</span><div class="bar-track"><div class="bar ${e.eff<100?'orange':''}" style="width:${Math.min(100,Math.max(0,e.eff/130*100))}%"></div></div><span class="bar-value">${pct(e.eff)}</span></div>`).join('')}</div><div class="section-caption"><span class="legend"><span class="legend-line"></span> Referência: 100% de eficiência</span></div></section>
<section class="card"><div class="section-head"><div><h3 class="section-title">Produção por dia</h3><p class="section-sub">Peças realizadas por data de produção</p></div></div>
<div class="compact-chart">${daily.map(r=>`<div class="compact-bar-group"><div class="compact-bar" style="height:${Math.max(6,r.value/maxBar*115)}px" title="${esc(fDate(r.day))}: ${fNum(r.value)} peças"></div><div class="compact-bar-label">${esc(r.day.slice(8))}/${esc(r.day.slice(5,7))}</div></div>`).join('')}</div>
<div class="mini-split"><div class="mini-card"><div class="mini-num">${all.filter(l=>l.metaSnapshot&&l.realizado/l.metaSnapshot>1).length}</div><div class="mini-lbl">Apontamentos acima de 100%</div></div><div class="mini-card"><div class="mini-num">${all.filter(l=>minutesBetween(l.inicio,l.fim)<60).length}</div><div class="mini-lbl">Períodos parciais registrados</div></div></div></section>
</div>
<section class="card"><div class="section-head"><div><h3 class="section-title">Últimos apontamentos</h3><p class="section-sub">Resumo das operações registradas</p></div><button class="text-btn" data-page="lancamentos">Ver todos →</button></div>${tableApontamentos(rows)}</section>`}
function kpi(label,value,ico,foot,up){return `<article class="card kpi"><div class="kpi-top"><span>${label}</span><span class="kpi-icon">${ico}</span></div><div class="kpi-value">${value}</div><div class="kpi-foot">${up?'<strong>●</strong> ':''}${foot}</div></article>`}
function tableApontamentos(rows){return `<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Funcionário</th><th>Produto / Processo</th><th>Período</th><th>Meta</th><th>Realizado</th><th>Eficiência</th></tr></thead><tbody>${rows.length?rows.map(l=>{const person=byId('funcionarios',l.funcionario),product=byId('produtos',l.produto),proc=byId('processos',l.processo),eff=l.metaSnapshot?l.realizado*100/l.metaSnapshot:null;return `<tr><td>${esc(fDate(l.data))}</td><td class="strong">${esc(person?.nome||l.funcionario)}</td><td><b>${esc(product?.nome||l.produto)}</b><small style="display:block;color:#94a1ad;margin-top:4px">${esc(proc?.nome||l.processo)}</small></td><td>${esc(l.inicio)}–${esc(l.fim)}</td><td>${fNum(l.metaSnapshot)}</td><td class="strong">${fNum(l.realizado)}</td><td>${effPill(eff)}</td></tr>`}).join(''):`<tr><td colspan="7" class="empty-row">Nenhum lançamento no filtro selecionado.</td></tr>`}</tbody></table></div>`}
function selectOpts(collection,sel='',all=false,label='Todos'){const ar=data[collection]||[];return `${all?`<option value="">${label}</option>`:''}${ar.map(o=>`<option value="${esc(o.id)}" ${String(o.id)===String(sel)?'selected':''}>${esc(o.nome)}</option>`).join('')}`}
function lancamentos(){let rows=[...data.lancamentos];if(filters.data)rows=rows.filter(l=>l.data===filters.data);if(filters.funcionario)rows=rows.filter(l=>l.funcionario===filters.funcionario);if(filters.produto)rows=rows.filter(l=>l.produto===filters.produto);rows.sort((a,b)=>(b.data+b.inicio).localeCompare(a.data+a.inicio));const total=sums(rows);
return `${title('Apontamentos de produção','Registros por período, funcionário, produto e operação.',`<button class="btn" data-action="exportar-csv">⇩ Exportar CSV</button>${btnNew('novo-apontamento','Novo apontamento')}`)}
<div class="card controls-panel"><div class="filters"><input class="input" aria-label="Filtrar data" type="date" id="filterData" value="${esc(filters.data)}"><select class="select" id="filterFuncionario" aria-label="Filtrar funcionário">${selectOpts('funcionarios',filters.funcionario,true,'Todos os funcionários')}</select><select class="select" id="filterProduto" aria-label="Filtrar produto">${selectOpts('produtos',filters.produto,true,'Todos os produtos')}</select><button class="btn btn-ghost" data-action="limpar-filtros">Limpar</button></div><div class="stats-row"><span><b>${total.total}</b> registros</span><span><b>${fNum(total.realizado)}</b> peças</span><span><b>${pct(total.eff)}</b> eficiência</span></div></div>
<section class="card">${tableApontamentos(rows)}<div class="pagination">${rows.length} registro(s) exibido(s) • valores calculados pela meta histórica de cada lançamento</div></section>`}
function funcionarios(){let items=data.funcionarios.filter(f=>!search||`${f.nome} ${byId('setores',f.setor)?.nome||''} ${f.id}`.toLowerCase().includes(search.toLowerCase()));return `${title('Funcionários','Equipe, setores, máquinas habilitadas e funções que cada operador domina.',btnNew('novo-funcionario','Cadastrar funcionário'))}
<div class="card controls-panel"><input id="employeeSearch" class="input search" placeholder="⌕ Buscar funcionário..." aria-label="Buscar funcionário" value="${esc(search)}" /><div class="stats-row"><span><b>${data.funcionarios.length}</b> funcionários</span><span><b>${data.setores.length}</b> setores</span></div></div>
<div class="data-grid">${items.map(f=>`<article class="card employee-card"><div class="employee-top"><div class="employee-avatar">${esc(initials(f.nome))}</div><div style="flex:1"><div class="employee-name">${esc(f.nome)}</div><div class="employee-code">Matrícula ${esc(f.matricula||f.id)}</div></div>${effPill(sums(data.lancamentos.filter(l=>l.funcionario===f.id)).eff)}</div><div class="employee-info"><span>Setor principal</span><strong>${esc(byId('setores',f.setor)?.nome||'Não definido')}</strong></div><div><div class="eyebrow" style="color:#8998a8;letter-spacing:.7px;margin-bottom:8px">MÁQUINAS</div><div class="taglist">${f.maquinas.length?f.maquinas.map(id=>`<span class="tag">${esc(byId('maquinas',id)?.nome||id)}</span>`).join(''):'<span class="tag">Não cadastradas</span>'}</div></div><div><div class="eyebrow" style="color:#8998a8;letter-spacing:.7px;margin-bottom:8px">COMPETÊNCIAS</div><div class="taglist">${f.funcoes.length?f.funcoes.map(id=>`<span class="tag">${esc(byId('funcoes',id)?.nome||id)}</span>`).join(''):'<span class="tag">Não cadastradas</span>'}</div></div><div class="employee-bottom"><span class="pill green"><span class="badge-dot"></span>Ativo</span><button class="text-btn" data-action="ver-funcionario" data-id="${esc(f.id)}">Ver desempenho →</button></div></article>`).join('')||'<div class="card placeholder"><h3>Não encontramos funcionários</h3><p>Experimente outro termo.</p></div>'}</div>`}
function produtos(){let items=data.produtos;return `${title('Produtos e operações','Roteiros produtivos com tempo padrão de cada operação, em segundos por peça.',`${btnNew('novo-processo','Nova operação')}${btnNew('novo-produto','Novo produto')}`)}
<div class="info-banner">As metas individuais são baseadas no tempo de cada operador. Quando não existe um tempo individual cadastrado, o sistema utiliza o tempo padrão do roteiro.</div>
<div class="data-grid">${items.map(p=>{const rot=data.roteiro.filter(x=>x.produto===p.id);return `<article class="card product-card"><div class="taglist" style="margin-bottom:13px"><span class="pill blue">${esc(p.codigo||p.id)}</span><span class="pill grey">${rot.length} operações</span></div><h3>${esc(p.nome)}</h3><p>${esc(p.descricao||'Produto cadastrado')}</p>${rot.map(r=>{const pr=byId('processos',r.processo);return `<div class="process-row"><div><strong>${esc(pr?.nome||r.processo)}</strong><small>${esc(pr?.id||'')} • ${fNum(3600/r.tempo)} peças/h</small></div><div class="process-time">${fNum(r.tempo)} s<small>/peça</small></div></div>`}).join('')||'<div class="placeholder">Nenhuma operação vinculada.</div>'}<button class="btn" style="margin-top:16px;width:100%" data-action="vincular-processo" data-id="${esc(p.id)}">＋ Vincular operação</button></article>`}).join('')}</div>`}
function niveis(){const percent=data.lancamentos.filter(l=>l.tempoSnapshot!=null).length;return `${title('Níveis e tempos individuais','Metas personalizadas por funcionário, produto e operação, com histórico preservado.',btnNew('revisar-tempo','Revisar tempo individual'))}
<div class="level-cards">${data.niveis.map(n=>`<div class="card level-card"><div class="level-number">${esc(n.id)}</div><h3>Nível ${esc(n.id)} — ${esc(n.nome)}</h3><p>${esc(n.descricao)}</p></div>`).join('')}</div>
<div class="notice"><strong>Metodologia:</strong> ao revisar o tempo, os apontamentos anteriores continuam usando a meta histórica. Nesta versão, a revisão é manual e salva no Supabase; nenhuma alteração salarial é executada.</div>
<section class="card"><div class="section-head"><div><h3 class="section-title">Tempos individualizados vigentes</h3><p class="section-sub">${data.tempos.length} configurações de tempo em segundos por peça</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Funcionário</th><th>Produto</th><th>Operação</th><th>Nível</th><th>Tempo/peça</th><th>Meta/hora</th><th>Ação</th></tr></thead><tbody>${data.tempos.map(t=>`<tr><td class="strong">${esc(byId('funcionarios',t.funcionario)?.nome||'—')}</td><td>${esc(byId('produtos',t.produto)?.nome||'—')}</td><td>${esc(byId('processos',t.processo)?.nome||'—')}</td><td><span class="pill blue">Nível ${esc(t.nivel)}</span></td><td class="strong">${fNum(t.segundos,1)} s</td><td>${fNum(3600/t.segundos,1)}</td><td><button class="text-btn" data-action="revisar-tempo" data-id="${esc(t.id)}">Revisar</button></td></tr>`).join('')}</tbody></table></div><div class="pagination">${percent} lançamentos possuem tempo histórico registrado</div></section>`}
function config(){return title('Configurações','Integração com Supabase, segurança e sincronização.')+
 '<div class="notice"><b>Conectado ao Supabase:</b> cadastros e apontamentos são gravados no banco de dados, não no armazenamento local. Contas sem autorização não podem ler ou modificar os registros.</div>'+
 '<section class="card config-block"><h3>Ambiente conectado</h3><div class="config-grid">'+
 '<div class="config-fact"><span>Projeto</span><b>PROJETOS</b></div>'+
 '<div class="config-fact"><span>Schema de produção</span><b>APONTADOR DE PRODUÇÃO</b></div>'+
 '<div class="config-fact"><span>Usuário</span><b>'+esc(authorizedEmail||'Autenticado')+'</b></div>'+
 '<div class="config-fact"><span>Banco de dados</span><b>Conectado com RLS</b></div></div>'+
 '<div class="separator"></div><p>Use o botão abaixo para sincronizar todos os cadastros e apontamentos.</p>'+
 '<button class="btn btn-primary" data-action="sincronizar">↻ Atualizar dados do Supabase</button></section>';
}
function selectField(name,label,arr,sel,required=true){return `<div class="field"><label for="${name}">${label}</label><select class="select" id="${name}" name="${name}" ${required?'required':''}>${!required?'<option value="">Selecione...</option>':''}${arr.map(x=>`<option value="${esc(x.id)}" ${String(sel)===String(x.id)?'selected':''}>${esc(x.nome)}</option>`).join('')}</select></div>`}
const inputField=(name,label,type='text',val='',extra='')=>`<div class="field"><label for="${name}">${label}</label><input class="input" type="${type}" name="${name}" id="${name}" value="${esc(val)}" ${extra} required></div>`;
function showModal(head,sub,body,submit='Salvar',modalType='generic'){ $('#overlay').classList.remove('hidden');$('#modal').classList.remove('hidden');$('#overlay').setAttribute('aria-hidden','false');$('#modal').innerHTML=`<div class="modal"><div class="modal-top"><div><h2>${head}</h2><p>${sub}</p></div><button class="icon-button" data-action="fechar-modal" aria-label="Fechar">×</button></div><form id="modalForm" data-type="${esc(modalType)}"><div class="modal-body">${body}</div><div class="modal-footer"><button type="button" class="btn" data-action="fechar-modal">Cancelar</button><button type="submit" class="btn btn-primary">${submit}</button></div></form></div>`;$('#modal').querySelector('input,select,button')?.focus() }
function closeModal(){$('#overlay').classList.add('hidden');$('#modal').classList.add('hidden');$('#overlay').setAttribute('aria-hidden','true');$('#modal').innerHTML=''}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._timer);toast._timer=setTimeout(()=>t.classList.remove('show'),3600)}
function updateOptions(){const prod=$('#novoProduto')?.value,p=$('#novoProcesso');if(!p)return;let items=data.roteiro.filter(r=>r.produto===prod).map(r=>byId('processos',r.processo)).filter(Boolean);p.innerHTML=items.map(o=>`<option value="${esc(o.id)}">${esc(o.nome)}</option>`).join('');updatePreview()}
function updatePreview(){const e=$('#novoFuncionario'),p=$('#novoProduto'),pr=$('#novoProcesso');if(!e||!p||!pr)return;const v=getTime(e.value,p.value,pr.value),start=$('#novoInicio')?.value,end=$('#novoFim')?.value,done=Number($('#novoRealizado')?.value||0);let min=minutesBetween(start,end);const valid=v&&min>0&&min<=720;const meta=valid?Math.round(min*60/v.segundos):0;const eff=meta?done/meta*100:null;const preview=$('#entryPreview');if(!preview)return;preview.innerHTML=`<div><strong>Tempo aplicado</strong><b>${v?fNum(v.segundos,1)+' s':'—'}</b><small>${v?`Fonte ${v.fonte}`:'Sem roteiro'}</small></div><div><strong>Meta ajustada</strong><b>${valid?fNum(meta):'—'}</b><small>${valid?min+' minutos':'Verifique o período'}</small></div><div><strong>Eficiência</strong><b>${valid?pct(eff):'—'}</b><small>${v?.nivel?'Nível '+v.nivel:'Tempo padrão'}</small></div>`}
function newEntry(){const body=`<div class="form-grid">${inputField('novoData','Data do apontamento','date',todayLocal())}${selectField('novoFuncionario','Funcionário',data.funcionarios,data.funcionarios[0]?.id)}${selectField('novoProduto','Produto',data.produtos,data.produtos[0]?.id)}${selectField('novoProcesso','Operação',[],null)}${inputField('novoInicio','Hora de início','time','08:00')}${inputField('novoFim','Hora de fim','time','09:00')}${inputField('novoRealizado','Peças realizadas','number',60,'min="0" step="1"')}<div class="field"><label>Origem da meta</label><div style="padding:11px 0;font-size:12px;color:#168468;font-weight:700">Automática — tempo individual</div></div></div><div class="modal-callout" id="entryPreview"></div>`;showModal('Novo apontamento','O sistema calcula a meta automaticamente com base no tempo e no período.',body,'Registrar apontamento','entry');updateOptions()}
function newEmployee(){const body=`<div class="form-grid">${inputField('nome','Nome do funcionário')}${inputField('matricula','Matrícula')}${selectField('setor','Setor principal',data.setores,data.setores[0]?.id)}<div class="field"><label>Status</label><div style="padding:10px 0;color:#168468;font-weight:700">Ativo</div></div><div class="field full"><label>Máquinas habilitadas</label><div class="checkbox-grid">${data.maquinas.map(m=>`<label class="checkbox-line"><input type="checkbox" name="maquinas" value="${esc(m.id)}"> ${esc(m.nome)}</label>`).join('')}</div></div><div class="field full"><label>Funções que sabe realizar</label><div class="checkbox-grid">${data.funcoes.map(f=>`<label class="checkbox-line"><input type="checkbox" name="funcoes" value="${esc(f.id)}"> ${esc(f.nome)}</label>`).join('')}</div></div></div>`;showModal('Cadastrar funcionário','Defina o setor e todas as máquinas e funções habilitadas.',body,'Cadastrar funcionário','employee')}
function newProduct(){showModal('Novo produto','Cadastre o produto e depois vincule as operações do roteiro.',`<div class="form-grid">${inputField('codigo','Código do produto')}${inputField('nome','Nome do produto')}<div class="field full"><label for="descricao">Descrição</label><textarea class="input" name="descricao" id="descricao" rows="3" style="min-height:80px"></textarea></div></div>`,'Salvar produto','product')}
function newProcess(){showModal('Nova operação','O cadastro de operação é reutilizável em vários produtos.',`<div class="form-grid">${inputField('codigo','Código da operação')}${inputField('nome','Nome da operação')}${selectField('funcao','Competência relacionada',data.funcoes,data.funcoes[0]?.id,false)}</div>`,'Salvar operação','process')}
function linkProcess(id){const p=byId('produtos',id);showModal('Vincular operação',`Produto: ${esc(p?.nome||id)}`,`<div class="form-grid"><input type="hidden" name="produto" value="${esc(id)}">${selectField('processo','Operação',data.processos,data.processos[0]?.id)}${inputField('tempo','Tempo padrão (segundos/peça)','number',60,'min="0.001" step="0.001"')}</div>`,'Vincular operação','linkprocess')}
function reviseTime(id){const t=data.tempos.find(x=>x.id===id),emp=t?.funcionario||data.funcionarios[0]?.id,product=t?.produto||data.produtos[0]?.id,proc=t?.processo||data.processos[0]?.id;const old=t?.segundos||getTime(emp,product,proc)?.segundos||60;showModal('Revisar tempo individual','Esta mudança não recalcula apontamentos históricos.',`<div class="form-grid"><input type="hidden" name="tempoId" value="${esc(id||'')}">${selectField('funcionario','Funcionário',data.funcionarios,emp)}${selectField('produto','Produto',data.produtos,product)}${selectField('processo','Operação',data.processos,proc)}${selectField('nivel','Nível do operador',data.niveis,t?.nivel||1)}${inputField('segundos','Novo tempo (segundos/peça)','number',old,'min="0.001" step="0.001"')}<div class="field"><label for="motivo">Motivo da revisão</label><input class="input" name="motivo" id="motivo" value="Revisão técnica de desempenho" required /></div></div><div class="info-banner" style="margin-top:18px">O tempo e o nível anteriores serão mantidos no histórico da demonstração.</div>`,'Salvar nova versão','time')}
async function handleSubmit(ev){
 ev.preventDefault();
 if(!authenticated){renderLogin();return}
 const form=ev.target,formType=form.dataset.type,fd=new FormData(form);
 const v=k=>String(fd.get(k)||'').trim();
 const button=form.querySelector('[type="submit"]');
 if(button){button.disabled=true;button.textContent='Gravando no Supabase...'}
 try{
   let payload;
   if(formType==='entry'){
     const total=Number(v('novoRealizado'));
     const min=minutesBetween(v('novoInicio'),v('novoFim'));
     if(!getTime(v('novoFuncionario'),v('novoProduto'),v('novoProcesso')))throw Error('Escolha uma operação existente no roteiro.');
     if(min<=0||min>720)throw Error('O período deve ser maior que zero e não superar 12 horas.');
     if(!Number.isInteger(total)||total<0)throw Error('Peças realizadas devem ser um inteiro não negativo.');
     payload={data:v('novoData'),funcionario:v('novoFuncionario'),produto:v('novoProduto'),processo:v('novoProcesso'),inicio:v('novoInicio'),fim:v('novoFim'),realizado:total};
     page='lancamentos';filters={data:'',funcionario:'',produto:''};
   }else if(formType==='employee'){
     if(!v('nome')||!v('matricula')||!v('setor'))throw Error('Informe nome, matrícula e setor.');
     payload={nome:v('nome'),matricula:v('matricula'),setor:v('setor'),maquinas:fd.getAll('maquinas'),funcoes:fd.getAll('funcoes')};
     page='funcionarios';
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
     page='niveis';
   }else throw Error('Tipo de cadastro não reconhecido.');
   await window.GUT_API.save(formType,payload);
   await loadData();
   closeModal();
   render();
   toast('Registro salvo com sucesso no Supabase.');
 }catch(err){
   toast('Não foi possível salvar: '+(err.message||String(err)));
 }finally{
   if(button && button.isConnected){button.disabled=false;button.textContent='Salvar'}
 }
}
function exportCsv(){const rows=[['Data','Funcionário','Produto','Operação','Início','Fim','Minutos','Tempo por peça (s)','Meta (peças)','Realizado (peças)','Eficiência (%)'],...data.lancamentos.map(l=>[l.data,byId('funcionarios',l.funcionario)?.nome||l.funcionario,byId('produtos',l.produto)?.nome||l.produto,byId('processos',l.processo)?.nome||l.processo,l.inicio,l.fim,minutesBetween(l.inicio,l.fim),l.tempoSnapshot,l.metaSnapshot,l.realizado,l.metaSnapshot?(100*l.realizado/l.metaSnapshot).toFixed(2):''])];const s='\uFEFF'+rows.map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');const blob=new Blob([s],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='gut-apontamentos-supabase.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV dos apontamentos exportado.')}
function action(name,id){
 if(name==='sair'){logout();return}
 if(!authenticated){renderLogin();return}
 switch(name){
 case 'novo-apontamento':newEntry();break;
 case 'novo-funcionario':newEmployee();break;
 case 'novo-produto':newProduct();break;
 case 'novo-processo':newProcess();break;
 case 'vincular-processo':linkProcess(id);break;
 case 'revisar-tempo':reviseTime(id);break;
 case 'ver-funcionario':filters={data:'',funcionario:id,produto:''};page='lancamentos';render();break;
 case 'limpar-filtros':filters={data:'',funcionario:'',produto:''};render();break;
 case 'exportar-csv':exportCsv();break;
 case 'sincronizar':loadData().then(()=>toast('Dados atualizados do Supabase.')).catch(e=>toast(e.message));break;
 case 'fechar-modal':closeModal();break;
 default:break;
 }
}
document.addEventListener('click',ev=>{let nav=ev.target.closest('[data-page]'),act=ev.target.closest('[data-action]');if(nav){if(!authenticated){renderLogin();return;}page=nav.dataset.page;search='';render();$('#sidebar').classList.remove('open');return}if(act)action(act.dataset.action,act.dataset.id)});
document.addEventListener('change',ev=>{const t=ev.target;if(t.id==='filterData')filters.data=t.value,render();if(t.id==='filterFuncionario')filters.funcionario=t.value,render();if(t.id==='filterProduto')filters.produto=t.value,render();if(t.id==='novoProduto')updateOptions();if(['novoFuncionario','novoProcesso','novoInicio','novoFim','novoRealizado'].includes(t.id))updatePreview()});
document.addEventListener('input',ev=>{if(ev.target.id==='employeeSearch'){search=ev.target.value;const pos=ev.target.selectionStart;render();const el=$('#employeeSearch');el.focus();el.setSelectionRange(pos,pos)}if(['novoRealizado','novoInicio','novoFim'].includes(ev.target.id))updatePreview()});
document.addEventListener('submit',ev=>{if(ev.target.id==='modalForm')handleSubmit(ev);else if(ev.target.id==='loginForm')handleLogin(ev)});
$('#overlay').addEventListener('click',closeModal);
$('#openMenu').addEventListener('click',()=>$('#sidebar').classList.add('open'));
$('#closeMenu').addEventListener('click',()=>$('#sidebar').classList.remove('open'));
document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeModal()});
boot();
})();
