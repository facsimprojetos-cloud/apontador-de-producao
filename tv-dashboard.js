/* GUT | Painel de TV. Consulta autenticada ao Supabase a cada 15 segundos. */
(() => {
'use strict';
const fmt = (v,d=0) => Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const pct = v => v==null?'—':fmt(v,2)+'%';
const dateLabel = value => value ? String(value).slice(0,10).split('-').reverse().join('/') : '—';
const escapeHtml = value => String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const dayOffset = days => {const d=new Date();d.setDate(d.getDate()-days);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const nowDate = () => dayOffset(0);
const filters={inicio:dayOffset(6),fim:nowDate(),funcionario:'',produto:'',processo:'',setor:'',grupo:''};
let data={funcionarios:[],produtos:[],processos:[],setores:[],grupos:[],roteiro:[],lancamentos:[]};
let reload=null,onBack=null,onUpdate=null,timer=null,clockTimer=null,busy=false,active=false,lastUpdated=null,lastError='';
const byId=(collection,id)=>(data[collection]||[]).find(x=>String(x.id)===String(id));
const rowsFor=()=>data.lancamentos.filter(l=>
 (!filters.inicio||l.data>=filters.inicio)&&(!filters.fim||l.data<=filters.fim)&&
 (!filters.funcionario||l.funcionario===filters.funcionario)&&(!filters.produto||l.produto===filters.produto)&&
 (!filters.processo||l.processo===filters.processo)&&(!filters.setor||l.setor===filters.setor)&&(!filters.grupo||l.grupo===filters.grupo)
).sort((a,b)=>((b.data||'')+(b.fim||'')).localeCompare((a.data||'')+(a.fim||''))||Number(b.id)-Number(a.id));
// Usa a classificação gravada no apontamento: mudar a operação final não altera o histórico.
function isFinished(l){
 return l.finalSnapshot===true;
}
function sums(rows){
 const meta=rows.reduce((n,l)=>n+Number(l.metaSnapshot||0),0);
 const feito=rows.reduce((n,l)=>n+Number(l.realizado||0),0);
 const prontas=rows.reduce((n,l)=>n+(isFinished(l)?Number(l.realizado||0):0),0);
 return {meta,feito,prontas,saldo:feito-meta,eff:meta?100*feito/meta:null};
}
function options(arr,sel,allLabel){
 return '<option value="">'+escapeHtml(allLabel)+'</option>'+arr.map(v=>
 '<option value="'+escapeHtml(v.id)+'" '+(String(v.id)===String(sel)?'selected':'')+'>'+escapeHtml(v.nome)+'</option>').join('');
}
function kpiHtml(rows){
 const total=sums(rows);
 const readySet=data.roteiro.filter(r=>r.final===true).length;
 return '<article class="tv-kpi"><small>META</small><strong>'+fmt(total.meta)+'</strong><span>peças previstas no período</span></article>'+
 '<article class="tv-kpi"><small>REALIZADO</small><strong>'+fmt(total.feito)+'</strong><span>peças apontadas</span></article>'+
 '<article class="tv-kpi tv-kpi-ready"><small>PRONTAS</small><strong>'+fmt(total.prontas)+'</strong><span>'+(readySet?readySet+' produto(s) com etapa final':'Defina a operação final dos produtos')+'</span></article>'+
 '<article class="tv-kpi '+(total.saldo<0?'tv-kpi-negative':'tv-kpi-positive')+'"><small>SALDO</small><strong>'+(total.saldo>0?'+':'')+fmt(total.saldo)+'</strong><span>realizado − meta</span></article>'+
 '<article class="tv-kpi tv-kpi-eff"><small>EFICIÊNCIA</small><strong>'+pct(total.eff)+'</strong><span>realizado / meta total</span></article>';
}
function cls(eff){return eff===null?'tv-neutral':eff>=100?'tv-good':eff>=85?'tv-mid':'tv-bad'}
function rowsHtml(rows){
 if(!rows.length)return '<tr class="tv-empty"><td colspan="10">Nenhum apontamento nesse período. Altere os filtros para visualizar os dados.</td></tr>';
 return rows.map(l=>{
  const e=l.metaSnapshot?100*Number(l.realizado||0)/Number(l.metaSnapshot):null;
  const fin=isFinished(l);
  return '<tr class="'+cls(e)+'"><td class="tv-nw">'+escapeHtml(dateLabel(l.data))+'</td>'+
  '<td class="tv-nw">'+escapeHtml(l.fim||'—')+'</td>'+
  '<td class="tv-product tv-text">'+escapeHtml(byId('produtos',l.produto)?.nome||'—')+'</td>'+
  '<td class="tv-text">'+escapeHtml(byId('funcionarios',l.funcionario)?.nome||'—')+'</td>'+
  '<td class="tv-text">'+escapeHtml(byId('processos',l.processo)?.nome||'—')+(fin?' <span class="tv-finish">FINAL</span>':'')+'</td>'+
  '<td class="tv-nw">'+escapeHtml(l.inicio||'—')+'</td><td class="tv-nw">'+escapeHtml(l.fim||'—')+'</td>'+
  '<td class="tv-nw">'+fmt(l.metaSnapshot)+'</td><td class="tv-nw">'+fmt(l.realizado)+'</td>'+
  '<td class="tv-eff-num">'+pct(e)+'</td></tr>';
 }).join('');
}
function rankings(rows){
 const map=new Map();
 for(const l of rows){
  const id=l.funcionario||'';
  let x=map.get(id);
  if(!x){x={nome:byId('funcionarios',id)?.nome||'—',meta:0,feito:0,qt:0};map.set(id,x);}
  x.meta+=Number(l.metaSnapshot||0);x.feito+=Number(l.realizado||0);x.qt++;
 }
 const sorted=[...map.values()].sort((a,b)=>(b.meta?100*b.feito/b.meta:0)-(a.meta?100*a.feito/a.meta:0));
 if(!sorted.length)return '<div class="tv-rank-empty">Sem funcionários com registros no período.</div>';
 return sorted.map((v,i)=>{
  const e=v.meta?100*v.feito/v.meta:null;
  const w=e==null?0:Math.max(2,Math.min(100,e/1.2));
  return '<div class="tv-rank-row"><div class="tv-rank-index">'+(i+1)+'</div><div class="tv-rank-name"><b>'+escapeHtml(v.nome)+'</b><span class="tv-rank-bar"><i class="'+cls(e)+'" style="width:'+w+'%"></i></span></div><div class="tv-rank-eff '+cls(e)+'">'+pct(e)+'</div></div>';
 }).join('');
}
function filterSummary(){
 const d=s=>s?String(s).slice(8,10)+'/'+String(s).slice(5,7):'…';
 const parts=[d(filters.inicio)+' a '+d(filters.fim)];
 const add=(col,id)=>{if(id){const x=byId(col,id);if(x)parts.push(x.nome)}};
 add('funcionarios',filters.funcionario);add('produtos',filters.produto);add('processos',filters.processo);add('setores',filters.setor);add('grupos',filters.grupo);
 return parts.join(' · ');
}
function updateClock(){
 const node=document.getElementById('tvClock');
 if(node)node.textContent=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
function updateUi(){
 if(!active)return;
 const rows=rowsFor();
 const k=document.getElementById('tvKpis'),r=document.getElementById('tvRows'),rank=document.getElementById('tvRanking'),count=document.getElementById('tvRowCount'),sync=document.getElementById('tvLastSync');
 if(k)k.innerHTML=kpiHtml(rows);
 if(r)r.innerHTML=rowsHtml(rows);
 if(rank)rank.innerHTML=rankings(rows);
 if(count)count.textContent=fmt(rows.length)+' apontamento(s)';
 const rc=document.getElementById('tvRankCount');if(rc)rc.textContent=new Set(rows.map(l=>l.funcionario)).size+' pessoa(s)';
 const fs=document.getElementById('tvFilterSummary');if(fs)fs.textContent=filterSummary();
 if(sync)sync.textContent=lastError?lastError:lastUpdated?'Atualizado às '+lastUpdated.toLocaleTimeString('pt-BR'):'Sincronizando com o Supabase';
 updateClock();
}
function template(incoming){
 data=incoming;active=true;
 const rows=rowsFor();
 return '<section id="tvWorkspace" class="tv-workspace">'+
 '<header class="tv-header"><div class="tv-brand"><img src="gut-logo.svg" alt="GUT Consultoria e Treinamentos" /><div class="tv-title"><span>PAINEL AO VIVO</span><h1>APONTADOR <em>DE PRODUÇÃO</em></h1></div></div>'+
 '<div class="tv-header-actions"><span class="tv-filter-summary" id="tvFilterSummary">'+escapeHtml(filterSummary())+'</span><span class="tv-live"><span></span> ATUALIZAÇÃO AUTOMÁTICA · 15 S</span><span class="tv-clock" id="tvClock"></span>'+
 '<button type="button" class="tv-button" data-tv-action="refresh">↻ Atualizar</button>'+
 '<button type="button" class="tv-button" data-tv-action="fullscreen">⛶ Tela cheia</button>'+
 '<button type="button" class="tv-button tv-button-close" data-tv-action="back">← Voltar</button></div></header>'+
 '<section class="tv-filterbar">'+
 '<label><span>DATA INICIAL</span><input type="date" id="tvInicio" value="'+escapeHtml(filters.inicio)+'"></label>'+
 '<label><span>DATA FINAL</span><input type="date" id="tvFim" value="'+escapeHtml(filters.fim)+'"></label>'+
 '<label><span>FUNCIONÁRIO</span><select id="tvFuncionario">'+options(data.funcionarios,filters.funcionario,'Todos os funcionários')+'</select></label>'+
 '<label><span>PRODUTO</span><select id="tvProduto">'+options(data.produtos,filters.produto,'Todos os produtos')+'</select></label>'+
 '<label><span>PROCESSO</span><select id="tvProcesso">'+options(data.processos,filters.processo,'Todas as operações')+'</select></label>'+
 '<label><span>SETOR</span><select id="tvSetor">'+options(data.setores,filters.setor,'Todos os setores')+'</select></label>'+
 '<label><span>GRUPO</span><select id="tvGrupo">'+options(data.grupos.filter(g=>!filters.setor||g.setor===filters.setor),filters.grupo,'Todos os grupos')+'</select></label>'+
 '<button type="button" class="tv-reset" data-tv-action="reset">Limpar filtros</button></section>'+
 '<section class="tv-kpis" id="tvKpis">'+kpiHtml(rows)+'</section>'+
 '<div class="tv-content-grid"><section class="tv-table-box"><div class="tv-panel-header"><div><b>LANÇAMENTOS DE PRODUÇÃO</b><small>Indicadores por apontamento no intervalo selecionado</small></div><span id="tvRowCount">'+fmt(rows.length)+' apontamento(s)</span></div>'+
 '<div class="tv-table-scroll"><table class="tv-data-table"><thead><tr><th>DATA</th><th>HORA</th><th>PRODUTO</th><th>FUNCIONÁRIO</th><th>PROCESSO</th><th>INÍCIO</th><th>FIM</th><th>META</th><th>REALIZADO</th><th>EFICIÊNCIA</th></tr></thead><tbody id="tvRows">'+rowsHtml(rows)+'</tbody></table></div></section>'+
 '<aside class="tv-ranking-box"><div class="tv-panel-header"><div><b>FUNCIONÁRIOS</b><small>Eficiência acumulada no período</small></div><span id="tvRankCount"></span></div><div id="tvRanking" class="tv-ranking-scroll">'+rankings(rows)+'</div></aside></div>'+
 '<footer class="tv-bottom"><span>GUT • GESTÃO INDUSTRIAL</span><span>Produção pronta = apontamentos da operação final definida no cadastro do produto</span><span id="tvLastSync">Sincronizando com o Supabase</span></footer></section>';
}
async function refresh(){
 if(!active||busy||typeof reload!=='function'||document.visibilityState==='hidden')return;
 busy=true;
 try{
  const latest=await reload();
  if(!active)return;
  if(!latest||!Array.isArray(latest.lancamentos)||!Array.isArray(latest.roteiro))throw Error('Dados incompletos.');
  data=latest;
  if(typeof onUpdate==='function')onUpdate(latest);
  lastUpdated=new Date();lastError='';
  updateUi();
 }catch(err){
  lastError='Sem conexão · nova tentativa em 15 s';
  updateUi();
 }finally{busy=false}
}
let scrollTimer=null,scrollDir=1,scrollPause=0,scrollHold=false;
function autoScrollTick(){
 const box=document.getElementById('tvRanking');
 if(!box||scrollHold)return;
 const max=box.scrollHeight-box.clientHeight;
 if(max<=2){box.scrollTop=0;return;}
 if(scrollPause>0){scrollPause--;return;}
 box.scrollTop=Math.max(0,Math.min(max,box.scrollTop+scrollDir));
 if(scrollDir>0&&box.scrollTop>=max-1){scrollDir=-1;scrollPause=80;}       // ~4 s parado no fim
 else if(scrollDir<0&&box.scrollTop<=0){scrollDir=1;scrollPause=80;}       // ~4 s parado no topo
}
function setFull(on){
 const el=document.getElementById('tvWorkspace');if(!el)return;
 el.classList.toggle('tv-full',on);
 const b=el.querySelector('[data-tv-action=fullscreen]');if(b)b.textContent=on?'✕ Sair da tela cheia':'⛶ Tela cheia';
}
function start(opts){
 stop();
 active=true;
 reload=opts.reload;onBack=opts.onBack;onUpdate=opts.onUpdate;
 lastUpdated=new Date();lastError='';
 updateUi();
 timer=setInterval(refresh,15000);
 clockTimer=setInterval(updateClock,1000);
 scrollDir=1;scrollPause=60;scrollTimer=setInterval(autoScrollTick,50);
}
function stop(){
 active=false;
 if(timer){clearInterval(timer);timer=null;}
 if(clockTimer){clearInterval(clockTimer);clockTimer=null;}
 if(scrollTimer){clearInterval(scrollTimer);scrollTimer=null;}
}
function setFilter(target){
 const key=target.id.slice(2).toLowerCase();
 const names={inicio:'inicio',fim:'fim',funcionario:'funcionario',produto:'produto',processo:'processo',setor:'setor',grupo:'grupo'};
 if(!names[key])return;
 filters[names[key]]=target.value;
 if(key==='setor'){
  filters.grupo='';
  const select=document.getElementById('tvGrupo');
  if(select)select.innerHTML=options(data.grupos.filter(g=>!filters.setor||g.setor===filters.setor),'','Todos os grupos');
 }
 updateUi();
}
document.addEventListener('change',ev=>{
 if(active&&ev.target?.id?.startsWith('tv'))setFilter(ev.target);
});
document.addEventListener('click',ev=>{
 const button=ev.target.closest('[data-tv-action]');
 if(!button||!active)return;
 const action=button.dataset.tvAction;
 if(action==='back'){if(typeof onBack==='function')onBack();return;}
 if(action==='refresh'){refresh();return;}
 if(action==='reset'){
  Object.assign(filters,{inicio:dayOffset(6),fim:nowDate(),funcionario:'',produto:'',processo:'',setor:'',grupo:''});
  const optionsIds=['Inicio','Fim','Funcionario','Produto','Processo','Setor','Grupo'];
  for(const suffix of optionsIds){
   const el=document.getElementById('tv'+suffix);if(!el)continue;
   if(suffix==='Grupo')el.innerHTML=options(data.grupos,'','Todos os grupos');
   el.value=filters[suffix.toLowerCase()];
  }
  updateUi();return;
 }
 if(action==='fullscreen'){
  const el=document.getElementById('tvWorkspace');
  if(document.fullscreenElement){document.exitFullscreen?.();setFull(false);return;}
  if(el?.classList.contains('tv-full')){setFull(false);return;}
  setFull(true); // modo TV mesmo em navegadores de TV sem suporte a tela cheia
  if(el?.requestFullscreen)el.requestFullscreen().catch(()=>{});
 }
});
document.addEventListener('fullscreenchange',()=>{if(active&&!document.fullscreenElement)setFull(false);});
document.addEventListener('pointerover',ev=>{if(ev.target.closest?.('#tvRanking'))scrollHold=true;});
document.addEventListener('pointerout',ev=>{if(ev.target.closest?.('#tvRanking')&&!ev.relatedTarget?.closest?.('#tvRanking'))scrollHold=false;});
document.addEventListener('keydown',ev=>{if(active&&ev.key==='Escape'){if(document.fullscreenElement)document.exitFullscreen?.();setFull(false);}});
document.addEventListener('visibilitychange',()=>{if(active&&document.visibilityState==='visible')refresh();});
window.GUT_TV={template,start,stop,refresh,updateUi};
})();