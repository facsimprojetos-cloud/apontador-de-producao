/* FACSIM | Painel de TV. Consulta autenticada ao Supabase a cada 15 segundos. */
(() => {
'use strict';
const fmt = (v,d=0) => Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const pct = v => v==null?'—':fmt(v,2)+'%';
const shortDate = value => value ? String(value).slice(8,10)+'/'+String(value).slice(5,7) : '—';
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
 if(typeof nk==='function')return nk('meta','META',fmt(total.meta),'yellow','peças previstas')+nk('bars','REALIZADO',fmt(total.feito),'green','peças apontadas')+nk('box','PRONTAS',fmt(total.prontas),'cyan','operação final')+nk('scale','SALDO',(total.saldo>0?'+':'')+fmt(total.saldo),total.saldo<0?'red':'green','realizado − meta')+nk('bolt','EFICIÊNCIA',p1(total.eff),tone(total.eff),'realizado / meta');
 const readySet=data.roteiro.filter(r=>r.final===true).length;
 return '<article class="tv-kpi"><small>META</small><strong>'+fmt(total.meta)+'</strong><span>peças previstas no período</span></article>'+
 '<article class="tv-kpi"><small>REALIZADO</small><strong>'+fmt(total.feito)+'</strong><span>peças apontadas</span></article>'+
 '<article class="tv-kpi tv-kpi-ready"><small>PRONTAS</small><strong>'+fmt(total.prontas)+'</strong><span>'+(readySet?readySet+' produto(s) com etapa final':'Defina a operação final dos produtos')+'</span></article>'+
 '<article class="tv-kpi '+(total.saldo<0?'tv-kpi-negative':'tv-kpi-positive')+'"><small>SALDO</small><strong>'+(total.saldo>0?'+':'')+fmt(total.saldo)+'</strong><span>realizado − meta</span></article>'+
 '<article class="tv-kpi tv-kpi-eff"><small>EFICIÊNCIA</small><strong>'+pct(total.eff)+'</strong><span>realizado / meta total</span></article>';
}
function cls(eff){return eff===null?'tv-neutral':eff>=100?'tv-good':eff>=85?'tv-mid':'tv-bad'}
/* grau de dificuldade (nível) do funcionário na operação: vem do tempo individual cadastrado */
function nivelDe(funcId,roteiroId){
 const t=(data.tempos||[]).find(x=>x.funcionario===funcId&&x.roteiro===roteiroId&&x.nivel);
 return t?(data.niveis||[]).find(n=>String(n.id)===String(t.nivel))||{id:t.nivel,nome:'Nível '+t.nivel,ordem:t.nivel}:null;
}
function nivelMaxFunc(funcId){
 let best=null;for(const t of (data.tempos||[]))if(t.funcionario===funcId&&t.nivel){const n=(data.niveis||[]).find(x=>String(x.id)===String(t.nivel))||{nome:'Nível '+t.nivel,ordem:t.nivel};if(!best||Number(n.ordem)>Number(best.ordem))best=n;}
 return best;
}
const gdBadge=n=>n?' <span class="tv-gd" title="Grau de dificuldade: '+escapeHtml(n.nome||'')+' — meta individualizada">GD '+escapeHtml(String(n.ordem??n.nome))+'</span>':'';
function headHtml(){
 return cfg.p1.agrupar?'<tr><th>PRODUTO</th><th>OPERAÇÃO</th><th>APONTAMENTOS</th><th>PESSOAS</th><th>META</th><th>REALIZADO</th><th>EFICIÊNCIA</th></tr>'
  :'<tr><th>DATA</th><th>HORA</th><th>PRODUTO</th><th>FUNCIONÁRIO</th><th>PROCESSO</th><th>INÍCIO</th><th>FIM</th><th>META</th><th>REALIZADO</th><th>EFICIÊNCIA</th></tr>';
}
/* visão agrupada: produto × operação, eficiência ponderada pelos lançamentos (soma realizado ÷ soma meta) */
function groupedHtml(rows){
 if(!rows.length)return '<tr class="tv-empty"><td colspan="7">Nenhum apontamento nesse período.</td></tr>';
 const m=new Map();
 for(const l of rows){const k=l.produto+'|'+(l.roteiro||l.processo);let g=m.get(k);if(!g){const r=byId('roteiro',l.roteiro);g={produto:l.produto,processo:l.processo,etapa:r?.etapa||0,final:isFinished(l),qt:0,pessoas:new Set(),meta:0,feito:0};m.set(k,g);}
  g.qt++;if(l.funcionario)g.pessoas.add(l.funcionario);g.meta+=Number(l.metaSnapshot||0);g.feito+=Number(l.realizado||0);}
 const nm=(c,id)=>byId(c,id)?.nome||'—';
 return [...m.values()].sort((a,b)=>nm('produtos',a.produto).localeCompare(nm('produtos',b.produto))||a.etapa-b.etapa).map(g=>{const e=g.meta?100*g.feito/g.meta:null;
  return '<tr class="'+cls(e)+' nx-row-'+tone(e)+'"><td class="tv-product tv-text">'+escapeHtml(nm('produtos',g.produto))+'</td><td class="tv-text">'+escapeHtml(nm('processos',g.processo))+(g.final?' <span class="tv-finish">FINAL</span>':'')+'</td>'+
  '<td class="tv-nw">'+fmt(g.qt)+'</td><td class="tv-nw">'+fmt(g.pessoas.size)+'</td><td class="tv-nw">'+fmt(g.meta)+'</td><td class="tv-nw">'+fmt(g.feito)+'</td><td class="tv-eff-num">'+pill(e)+'</td></tr>';}).join('');
}
function optsHtml(){
 const b=(k,l,t)=>`<button type="button" class="tv-opt${cfg.p1[k]?' on':''}" data-tv-opt="${k}" aria-pressed="${!!cfg.p1[k]}" title="${t}">${cfg.p1[k]?'✓ ':''}${l}</button>`;
 return `<div class="tv-opts">${b('nivel','Mostrar nível (GD)','Mostra o grau de dificuldade (nível) de quem tem meta individualizada')}${b('agrupar','Agrupar por operação','Esconde os nomes e mostra a eficiência coletiva por produto e operação')}${b('semRanking','Ocultar funcionários','Esconde a lista de funcionários ao lado')}</div>`;
}
function rowsHtml(rows){
 if(cfg.p1.agrupar)return groupedHtml(rows);
 if(!rows.length)return '<tr class="tv-empty"><td colspan="10">Nenhum apontamento nesse período. Altere os filtros para visualizar os dados.</td></tr>';
 return rows.map(l=>{
  const e=l.metaSnapshot?100*Number(l.realizado||0)/Number(l.metaSnapshot):null;
  const fin=isFinished(l);
  return '<tr class="'+cls(e)+' nx-row-'+tone(e)+'"><td class="tv-nw" title="'+escapeHtml(dateLabel(l.data))+'">'+escapeHtml(shortDate(l.data))+'</td>'+
  '<td class="tv-nw">'+escapeHtml(l.fim||'—')+'</td>'+
  '<td class="tv-product tv-text">'+escapeHtml(byId('produtos',l.produto)?.nome||'—')+'</td>'+
  '<td class="tv-text">'+escapeHtml(byId('funcionarios',l.funcionario)?.nome||'—')+(cfg.p1.nivel?gdBadge(nivelDe(l.funcionario,l.roteiro)):'')+'</td>'+
  '<td class="tv-text">'+escapeHtml(byId('processos',l.processo)?.nome||'—')+(fin?' <span class="tv-finish">FINAL</span>':'')+'</td>'+
  '<td class="tv-nw">'+escapeHtml(l.inicio||'—')+'</td><td class="tv-nw">'+escapeHtml(l.fim||'—')+'</td>'+
  '<td class="tv-nw">'+fmt(l.metaSnapshot)+'</td><td class="tv-nw">'+fmt(l.realizado)+'</td>'+
  '<td class="tv-eff-num">'+pill(e)+'</td></tr>';
 }).join('');
}
function rankings(rows){
 const map=new Map();
 for(const l of rows){
  const id=l.funcionario||'';
  let x=map.get(id);
  if(!x){x={id,nome:byId('funcionarios',id)?.nome||'—',meta:0,feito:0,qt:0};map.set(id,x);}
  x.meta+=Number(l.metaSnapshot||0);x.feito+=Number(l.realizado||0);x.qt++;
 }
 const sorted=[...map.values()].sort((a,b)=>(b.meta?100*b.feito/b.meta:0)-(a.meta?100*a.feito/a.meta:0));
 if(!sorted.length)return '<div class="tv-rank-empty">Sem funcionários com registros no período.</div>';
 return sorted.map((v,i)=>{
  const e=v.meta?100*v.feito/v.meta:null;
  const w=e==null?0:Math.max(2,Math.min(100,e/1.2));
  return '<div class="tv-rank-row"><div class="tv-rank-index">'+(i+1)+'</div><div class="tv-rank-name"><b>'+escapeHtml(v.nome)+(cfg.p1.nivel?gdBadge(nivelMaxFunc(v.id)):'')+'</b><span class="tv-rank-bar"><i class="'+cls(e)+'" style="width:'+w+'%"></i></span></div><div class="tv-rank-eff '+cls(e)+'">'+pct(e)+'</div></div>';
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
/* ===== Painéis 2 (gargalos) e 3 (peças prontas) e rodízio ===== */
const PANELS=[[1,'PRODUÇÃO','bars'],[2,'PROCESSOS','gear'],[3,'GARGALOS','alert'],[4,'PEÇAS PRONTAS','box'],[5,'TENDÊNCIAS','trend'],[6,'QUALIDADE','meta']];
const PANEL_FN={2:()=>panelProcessos(),3:()=>panelGargalos(),4:()=>panelProntas(),5:()=>panelTendencias(),6:()=>panelQualidade()};
const CFG_KEY='gut_tv_cfg';
const cfg={panel:1,rotate:false,secs:30,metric:'pecas',panels:[1,2,3,4,5,6],v:3,p1:{nivel:false,agrupar:false,semRanking:false},scroll:{1:true,2:true,3:true,4:true,5:true,6:true}};
try{Object.assign(cfg,JSON.parse(localStorage.getItem(CFG_KEY)||'{}'))}catch(_){/* armazenamento indisponível */}
if(cfg.v===2){cfg.v=3;if(Array.isArray(cfg.panels)&&!cfg.panels.includes(6))cfg.panels.push(6);if(cfg.scroll&&cfg.scroll[6]==null)cfg.scroll[6]=true;}
if(cfg.v!==2&&cfg.v!==3){cfg.v=2;cfg.panels=[1,2,3,4,5,6];if(cfg.panel===3)cfg.panel=4;}
if(!cfg.scroll||typeof cfg.scroll!=='object')cfg.scroll={1:true,2:true,3:true,4:true,5:true};
if(!cfg.p1||typeof cfg.p1!=='object')cfg.p1={nivel:false,agrupar:false,semRanking:false};
if(!Array.isArray(cfg.panels)||!cfg.panels.length)cfg.panels=[1,2,3,4,5,6];
if(!PANELS_OK(cfg.panel))cfg.panel=1;
function PANELS_OK(n){return [1,2,3,4,5,6].includes(Number(n))}
const saveCfg=()=>{try{localStorage.setItem(CFG_KEY,JSON.stringify(cfg))}catch(_){}};
let rotTimer=null,rotElapsed=0;
const toMin=t=>{const [h,m]=String(t||'0:0').split(':').map(Number);return (h||0)*60+(m||0)};
const durMin=l=>{let m=toMin(l.fim)-toMin(l.inicio);if(m<=0)m+=1440;return m};
// Gargalos e prontas ignoram filtro de funcionário/processo (precisam do fluxo inteiro do produto)
const rowsFlow=()=>data.lancamentos.filter(l=>
 (!filters.inicio||l.data>=filters.inicio)&&(!filters.fim||l.data<=filters.fim)&&(!filters.produto||l.produto===filters.produto)&&
 (!filters.setor||l.setor===filters.setor)&&(!filters.grupo||l.grupo===filters.grupo));
function opStats(rows){
 const byRoute=!!filters.produto,map=new Map();
 for(const l of rows){
  const key=byRoute?(l.roteiro||l.processo):l.processo;if(!key)continue;
  let o=map.get(key);
  if(!o){const r=byRoute?byId('roteiro',key):null;o={key,nome:byId('processos',r?r.processo:key)?.nome||'Operação',etapa:r?.etapa||0,final:!!r?.final,pecas:0,min:0,meta:0,pessoas:new Set()};map.set(key,o);}
  o.pecas+=Number(l.realizado||0);o.min+=durMin(l);o.meta+=Number(l.metaSnapshot||0);o.pessoas.add(l.funcionario);
 }
 for(const o of map.values()){o.pph=o.min?o.pecas/(o.min/60):0;o.metaPph=o.min?o.meta/(o.min/60):0;o.eff=o.meta?100*o.pecas/o.meta:null;}
 return [...map.values()];
}
const metricVal=o=>cfg.metric==='pph'?o.pph:o.pecas;
const metricMeta=o=>cfg.metric==='pph'?o.metaPph:o.meta;
const unit=()=>cfg.metric==='pph'?'pç/h':'peças';
const fmtM=v=>cfg.metric==='pph'?fmt(v,1):fmt(v);
function canDo(func,key){
 const ops=new Set(func?.operacoes||[]);
 if(filters.produto)return ops.has(key);
 return (data.roteiro||[]).some(r=>ops.has(r.id)&&r.processo===key);
}
function tempoEm(funcId,key){
 const cands=filters.produto?[byId('roteiro',key)].filter(Boolean):(data.roteiro||[]).filter(r=>r.processo===key&&(byId('funcionarios',funcId)?.operacoes||[]).includes(r.id));
 let best=null;
 for(const r of cands){const t=(data.tempos||[]).find(x=>x.funcionario===funcId&&x.roteiro===r.id);const seg=Number(t?.segundos??r.tempo);if(seg>0&&(!best||seg<best.seg))best={seg,ind:!!t,nivel:t?.nivel};}
 return best;
}
function sugestoes(stats,rows){
 if(stats.length<2)return '<div class="tvg-empty">Escolha um período com pelo menos duas operações apontadas.</div>';
 const asc=[...stats].sort((a,b)=>metricVal(a)-metricVal(b)),g=asc[0],media=stats.reduce((n,o)=>n+metricVal(o),0)/stats.length;
 const byKey=new Map(stats.map(o=>[o.key,o]));
 // operação principal (mais minutos) e eficiência de cada pessoa no período
 const pess=new Map();
 for(const l of rows){const id=l.funcionario;if(!id)continue;let p=pess.get(id);if(!p){p={id,min:new Map(),feito:0,meta:0};pess.set(id,p);}
  const key=filters.produto?(l.roteiro||l.processo):l.processo;p.min.set(key,(p.min.get(key)||0)+durMin(l));p.feito+=Number(l.realizado||0);p.meta+=Number(l.metaSnapshot||0);}
 const cand=[];
 for(const f of (data.funcionarios||[]).filter(x=>x.ativo!==false)){
  if(!canDo(f,g.key))continue;
  const p=pess.get(f.id);const main=p?[...p.min.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]:null;
  if(main===g.key)continue;
  const src=main?byKey.get(main):null,sobra=src?metricVal(src)-media:null;
  const t=tempoEm(f.id,g.key);const eff=p&&p.meta?p.feito/p.meta:0.9;
  const ganho=t?3600/t.seg*Math.min(1.2,Math.max(0.5,eff)):null;
  cand.push({f,src,sobra,t,ganho});
 }
 const mover=cand.filter(c=>c.src&&c.sobra>0).sort((a,b)=>(b.sobra-a.sobra)||((b.ganho||0)-(a.ganho||0))).slice(0,4);
 const outros=cand.filter(c=>!mover.includes(c)).slice(0,6);
 const nivel=id=>id?((data.niveis||[]).find(n=>String(n.id)===String(id))?.nome||'Nível '+id):'sem nível';
 let h=`<div class="tvg-alvo"><small>OPERAÇÃO GARGALO</small><b>${escapeHtml(g.nome)}</b><span>${fmtM(metricVal(g))} ${unit()} · ${fmtM(media-metricVal(g))} abaixo da média</span></div>`;
 if(!cand.length)return h+`<div class="tvg-empty">Ninguém tem <b>${escapeHtml(g.nome)}</b> marcado nas operações do cadastro. Marque em Funcionários → Operações que executa.</div>`;
 if(mover.length)h+=mover.map((c,i)=>`<div class="tvg-sug"><i>${i+1}</i><div><b>${escapeHtml(c.f.nome)}</b><span>de <em>${escapeHtml(c.src.nome)}</em> (+${fmtM(c.sobra)} acima da média) → <em>${escapeHtml(g.nome)}</em></span><small>Sabe fazer · ${c.t?fmt(c.t.seg,0)+' s/peça '+(c.t.ind?'('+escapeHtml(nivel(c.t.nivel))+')':'(tempo padrão)'):''}${c.ganho?' · rende ~'+fmt(c.ganho,0)+' pç/h':''}</small></div></div>`).join('');
 else h+='<div class="tvg-empty">Nenhuma pessoa habilitada está em operação com sobra no período.</div>';
 if(outros.length)h+=`<div class="tvg-outros"><small>TAMBÉM SABEM FAZER</small>${outros.map(c=>`<span>${escapeHtml(c.f.nome.split(' ')[0])}${c.ganho?' · ~'+fmt(c.ganho,0)+' pç/h':''}</span>`).join('')}</div>`;
 return h;
}
function barChart(items,lines,opts={}){
 // items: [{label,value,cls,title}] ; lines: [{value,label,cls}]
 const max=Math.max(1,...items.map(i=>i.value),...lines.map(l=>l.value))*1.08;
 const pctH=v=>Math.max(0,Math.min(100,v/max*100));
 return `<div class="tvg-plot" style="--n:${items.length||1}"><div class="tvg-area">
  ${lines.filter(l=>l.value>0).map(l=>`<div class="tvg-line ${l.cls}" style="bottom:${pctH(l.value)}%"><em>${escapeHtml(l.label)}</em></div>`).join('')}
  <div class="tvg-bars">${items.map(i=>`<div class="tvg-bar ${i.cls||''}" style="height:${pctH(i.value)}%" title="${escapeHtml(i.title||'')}"><span>${escapeHtml(i.text??fmt(i.value))}</span>${i.marker!=null?`<b class="tvg-marker" style="bottom:${pctH(i.marker)/pctH(i.value||1e-9)*100}%"></b>`:''}</div>`).join('')}</div></div>
  <div class="tvg-labels">${items.map(i=>`<span title="${escapeHtml(i.label)}">${escapeHtml(i.label)}</span>`).join('')}</div></div>`;
}
function kpiBox(label,value,clsName,sub){const t=/good/.test(clsName)?'green':/bad/.test(clsName)?'red':/yellow|mid/.test(clsName)?'yellow':'cyan';return nk(label==='GARGALO'?'alert':label==='GLOBAL'?'bolt':label==='FINALIZADOS'?'box':'meta',label,value,t,sub)}
/* ===== Visual v2: ícones, cartões e gráficos ===== */
const ICO={
 meta:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12l7-7M16 5h3v3"/>',
 bars:'<path d="M5 20V12M10 20V8M15 20V4M20 20v-6"/>',
 box:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
 scale:'<path d="M12 4v16M7 20h10M5 7h14"/><path d="M5 7l-3 6h6zM19 7l-3 6h6z"/>',
 bolt:'<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
 trophy:'<path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 6H4a3 3 0 003 4M16 6h4a3 3 0 01-3 4M12 13v4M8 20h8"/>',
 clock:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M10 2h4"/>',
 alert:'<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/>',
 layers:'<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
 gear:'<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
 trend:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
 users:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0112 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14a5 5 0 016 6"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
 wrench:'<path d="M14 6a4 4 0 005 5l-8 8a2 2 0 01-3-3z"/>'
};
const ico=(k,c='')=>`<svg class="nx-ico ${c}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICO[k]||''}</svg>`;
const p1=v=>v==null?'—':fmt(v,1).replace(/,0$/,'')+'%';
const tone=eff=>eff==null?'cyan':eff>=100?'green':eff>=85?'yellow':'red';
const pill=eff=>`<span class="nx-pill nx-${tone(eff)}">${pct(eff)}</span>`;
function nk(icon,label,value,t,sub,nome){return `<article class="nx-kpi nx-${t}${nome?' has-nome':''}">${icon?ico(icon):'<i></i>'}<div class="nx-kpi-txt"><small>${label}</small>${nome?`<b class="nx-k-nome" title="${escapeHtml(nome)}">${escapeHtml(nome)}</b>`:''}${sub?`<span>${sub}</span>`:''}</div><strong>${value}</strong></article>`}
const box=(icon,title,extra,body,cls='')=>`<section class="nx-box ${cls}"><header class="nx-box-h">${ico(icon)}<b>${title}</b>${extra?`<span class="nx-chip">${extra}</span>`:''}</header><div class="nx-box-b">${body}</div></section>`;
const empty=t=>`<div class="nx-empty">${t}</div>`;

/* gráfico de linha em SVG (pontos rotulados, ponto crítico em vermelho) */
function lineChart(pts,o={}){
 if(!pts.length)return empty('Sem dados no período.');
 const W=1000,H=330,L=92,R=40,T=40,B=46,vals=pts.map(p=>p.value).concat(o.ref!=null?[o.ref]:[]);
 let mn=o.min??Math.min(...vals),mx=o.max??Math.max(...vals);if(mx===mn){mx+=1;mn=Math.max(0,mn-1);}const pad=(mx-mn)*.15;mn=Math.max(o.floor??-Infinity,mn-pad);mx+=pad;
 const x=i=>pts.length===1?(L+W-R)/2:L+i*(W-L-R)/(pts.length-1),y=v=>T+(1-(v-mn)/(mx-mn))*(H-T-B);
 const ticks=[0,1,2,3,4].map(i=>mn+i*(mx-mn)/4);
 const path=pts.map((p,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(p.value).toFixed(1)).join(' ');
 const area=path+` L${x(pts.length-1).toFixed(1)} ${H-B} L${x(0).toFixed(1)} ${H-B} Z`;
 const fmtv=o.fmt||(v=>fmt(v,1));
 const step=Math.ceil(pts.length/14);
 const esp=pts.length>1?(W-L-R)/(pts.length-1)*step:W,maxCh=Math.max(4,Math.floor(esp/10));
 const corta=t=>{t=String(t);return t.length>maxCh?t.slice(0,maxCh-1)+'…':t};
 return `<svg class="nx-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(o.aria||'Gráfico')}">
 <defs><linearGradient id="nxArea${o.id||''}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee" stop-opacity=".35"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></linearGradient></defs>
 ${ticks.map(t=>`<line x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}" class="nx-grid"/><text x="${L-10}" y="${y(t)+5}" class="nx-axis" text-anchor="end">${fmtv(t)}</text>`).join('')}
 ${o.ref!=null&&o.ref>mn&&o.ref<mx?`<line x1="${L}" x2="${W-R}" y1="${y(o.ref)}" y2="${y(o.ref)}" class="nx-ref"/><text x="${W-R}" y="${y(o.ref)-7}" class="nx-ref-t" text-anchor="end">${escapeHtml(o.refLabel||'')}</text>`:''}
 <path d="${area}" fill="url(#nxArea${o.id||''})"/><path d="${path}" class="nx-line"/>
 ${pts.map((p,i)=>{const t=p.tone||'cyan',cy=y(p.value),lab=fmtv(p.value),w=Math.max(46,lab.length*12+16),ly=cy-16<T?cy+30:cy-16,tx=Math.min(W-R-w/2+20,Math.max(L+w/2-10,x(i)));return `<circle cx="${x(i)}" cy="${cy}" r="7" class="nx-dot nx-dot-${t}"/>`+((i%step===0||t==='red'||i===pts.length-1)?`<g class="nx-tag nx-tag-${t}"><rect x="${tx-w/2}" y="${ly-20}" width="${w}" height="26" rx="6"/><text x="${tx}" y="${ly-2}" text-anchor="middle">${lab}</text></g>`:'')+(i%step===0||i===pts.length-1?`<text x="${x(i)}" y="${H-14}" class="nx-axis nx-axis-x" text-anchor="middle"><title>${escapeHtml(p.full||p.label)}</title>${escapeHtml(corta(p.label))}</text>`:'')}).join('')}
 </svg>`;
}
/* barras agrupadas (ex.: prontas × meta) */
function groupBars(items,o={}){
 if(!items.length)return empty('Sem dados no período.');
 const W=1000,H=330,L=64,R=16,T=34,B=46,mx=Math.max(1,...items.flatMap(i=>[i.a,i.b]))*1.12;
 const gw=(W-L-R)/items.length,bw=Math.min(70,gw*.32),y=v=>T+(1-v/mx)*(H-T-B);
 const ticks=[0,1,2,3,4].map(i=>i*mx/4);
 return `<svg class="nx-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(o.aria||'Gráfico de barras')}">
 <defs><linearGradient id="nxGa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3cf08f"/><stop offset="1" stop-color="#14a856"/></linearGradient><linearGradient id="nxGb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fe3ff"/><stop offset="1" stop-color="#0aa5c4"/></linearGradient><linearGradient id="nxGr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7b7f"/><stop offset="1" stop-color="#d83a40"/></linearGradient></defs>
 ${ticks.map(t=>`<line x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}" class="nx-grid"/><text x="${L-10}" y="${y(t)+5}" class="nx-axis" text-anchor="end">${fmt(t)}</text>`).join('')}
 ${items.map((it,i)=>{const cx=L+gw*i+gw/2,ax=cx-bw-3,bx=cx+3,fillA=o.redWhenBelow&&it.a<it.b?'url(#nxGr)':'url(#nxGa)';return `<rect x="${ax}" y="${y(it.a)}" width="${bw}" height="${H-B-y(it.a)}" rx="4" fill="${fillA}"/><rect x="${bx}" y="${y(it.b)}" width="${bw}" height="${H-B-y(it.b)}" rx="4" fill="url(#nxGb)"/>
  <text x="${ax+bw/2}" y="${y(it.a)-8}" class="nx-val" text-anchor="middle">${fmt(it.a)}</text><text x="${bx+bw/2}" y="${y(it.b)-8}" class="nx-val nx-val-b" text-anchor="middle">${fmt(it.b)}</text>
  <text x="${cx}" y="${H-14}" class="nx-axis nx-axis-x" text-anchor="middle">${escapeHtml(String(it.label).slice(0,18))}</text>`}).join('')}
 <line x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" class="nx-base"/></svg>`;
}
const legend=(a,b)=>`<span class="nx-legend"><i class="nx-lg-a"></i>${a}<i class="nx-lg-b"></i>${b}</span>`;

/* ---------- Tela 2: PROCESSOS ---------- */
function panelProcessos(){
 const rows=rowsFlow(),all=sums(rows),st=opStats(rows).filter(o=>o.pecas>0);
 if(!st.length)return empty('Sem apontamentos no período. Ajuste os filtros.');
 st.forEach(o=>{o.ciclo=o.min/o.pecas;});
 const byPph=[...st].sort((a,b)=>b.pph-a.pph),ordem=filters.produto?[...st].sort((a,b)=>a.etapa-b.etapa):[...st].sort((a,b)=>a.nome.localeCompare(b.nome));
 const g=[...st].sort((a,b)=>a.pecas-b.pecas)[0],lenta=[...st].sort((a,b)=>b.ciclo-a.ciclo)[0];
 const melhor=[...st].sort((a,b)=>(b.eff??0)-(a.eff??0))[0];
 const tMedio=st.reduce((n,o)=>n+o.ciclo,0)/st.length,maxPph=byPph[0].pph||1;
 const status=o=>o===g?['red','Gargalo','alert']:o.eff>=100?['green','Dentro da meta','ok']:o.eff>=85?['yellow','Atenção','warn']:['red','Abaixo da meta','alert'];
 const bars=byPph.map((o,i)=>`<div class="nx-hrow"><span class="nx-hn">${i+1}</span><b class="nx-hname">${escapeHtml(o.nome)}</b><div class="nx-htrack"><i class="nx-hbar nx-${o===g?'red':tone(o.eff)}" style="width:${Math.max(3,o.pph/maxPph*100)}%"></i></div><span class="nx-hval">${fmt(o.pph,0)}</span>${pill(o.eff)}</div>`).join('');
 const tabela=`<table class="nx-table"><thead><tr><th>OPERAÇÃO</th><th>META/H</th><th>REALIZADO/H</th><th>EFICIÊNCIA</th><th>SITUAÇÃO</th></tr></thead><tbody>${byPph.map(o=>{const s=status(o);return `<tr><td>${escapeHtml(o.nome)}</td><td>${fmt(o.metaPph,0)}</td><td>${fmt(o.pph,0)}</td><td>${pill(o.eff)}</td><td class="nx-st nx-st-${s[0]}"><i></i>${s[1]}</td></tr>`}).join('')}</tbody></table>`;
 // fila estimada: o que a operação imediatamente antes do gargalo produziu a mais que ele
 const ant=filters.produto?ordem.filter(o=>o.etapa<g.etapa).pop():null; // só faz sentido dentro do roteiro de um produto
 const fila=ant&&ant!==g?Math.max(0,ant.pecas-g.pecas):0;
 const alertas=`<div class="nx-alert nx-alert-red">${ico('gear')}<div><small>OPERAÇÃO GARGALO (MENOR PRODUÇÃO)</small><b>${escapeHtml(g.nome)}</b></div><div class="nx-alert-v"><b>${fmt(g.ciclo,2)} min/peça</b><span>${p1(g.eff)} de eficiência</span></div></div>
  ${fila?`<div class="nx-alert nx-alert-red">${ico('layers')}<div><small>ACÚMULO ESTIMADO ANTES DO GARGALO</small><b>${escapeHtml(g.nome)}</b></div><div class="nx-alert-v"><b>${fmt(fila)} peças</b><span>${escapeHtml(ant.nome)} produziu a mais</span></div></div>`:''}
  ${lenta!==g?`<div class="nx-alert nx-alert-yellow">${ico('clock')}<div><small>MAIOR TEMPO POR PEÇA</small><b>${escapeHtml(lenta.nome)}</b></div><div class="nx-alert-v"><b>${fmt(lenta.ciclo,2)} min/peça</b><span>${p1(lenta.eff)} de eficiência</span></div></div>`:''}
  <div class="nx-alert nx-alert-amber">${ico('wrench')}<div><small>INTERVENÇÃO SUGERIDA</small><b>${escapeHtml(g.nome)}</b></div><div class="nx-alert-v"><span>Aumentar capacidade ou realocar pessoas — veja a tela Gargalos.</span></div></div>`;
 return `<section class="nx-kpis">
  ${nk('layers','OPERAÇÕES APONTADAS',fmt(st.length),'yellow')}
  ${nk('trophy','MELHOR EFICIÊNCIA',p1(melhor.eff),'green','',melhor.nome)}
  ${nk('clock','TEMPO MÉDIO',`${fmt(tMedio,2)}<em>min/pç</em>`,'cyan','por operação')}
  ${nk('alert','GARGALO',`${fmt(g.ciclo,2)}<em>min/pç</em>`,'red','',g.nome)}
  ${nk('bolt','EFICIÊNCIA MÉDIA',p1(all.eff),tone(all.eff))}</section>
 <div class="nx-grid2">${box('bars','DESEMPENHO POR OPERAÇÃO','Peças por hora trabalhada e eficiência',`<div class="nx-hbars">${bars}</div>`)}
  ${box('clock','TEMPO REAL POR PEÇA','Minutos por peça · '+(filters.produto?'na ordem do roteiro':'por operação'),lineChart(ordem.map(o=>({label:o.nome,full:o.nome,value:o.ciclo,tone:o===lenta?'red':'cyan'})),{fmt:v=>fmt(v,2),floor:0,id:'c',aria:'Tempo por peça por operação'}))}
  ${box('layers','OPERAÇÕES — DETALHAMENTO','',tabela,'nx-scroll')}
  ${box('alert','GARGALOS E ALERTAS','',`<div class="nx-alerts">${alertas}</div>`,'nx-scroll')}</div>`;
}

/* ---------- Tela 4: PEÇAS PRONTAS ---------- */
function rotInfo(pid){
 const rot=(data.roteiro||[]).filter(r=>r.produto===pid&&Number(r.tempo)>0);
 const tot=rot.reduce((n,r)=>n+Number(r.tempo),0),mx=Math.max(0,...rot.map(r=>Number(r.tempo)));
 return {segundos:tot,bal:rot.length&&mx?100*tot/(rot.length*mx):null,temFinal:rot.some(r=>r.final)};
}
function panelProntas(){
 const rows=rowsFlow(),fin=sums(rows.filter(isFinished));
 const prods=(filters.produto?[byId('produtos',filters.produto)]:(data.produtos||[])).filter(Boolean).map(p=>{
  const pr=rows.filter(l=>l.produto===p.id);if(!pr.length)return null;
  const f=sums(pr.filter(isFinished)),ri=rotInfo(p.id),min=pr.reduce((n,l)=>n+durMin(l),0);
  const metaAuto=ri.segundos?Math.floor(min*(ri.bal||100)/100/(ri.segundos/60)):null;
  return {p,f,ri,min,metaAuto};
 }).filter(Boolean).sort((a,b)=>b.f.feito-a.f.feito);
 const saldo=fin.feito-fin.meta;
 const comFinal=prods.filter(x=>x.ri.temFinal);
 const balMed=comFinal.length?comFinal.reduce((n,x)=>n+(x.ri.bal||0),0)/comFinal.length:null;
 const linhas=prods.map(x=>{const s=x.f.feito-x.f.meta,t=tone(x.f.eff);return `<tr class="nx-row-${x.ri.temFinal?t:'cyan'}"><td><b>${escapeHtml(x.p.nome)}</b></td><td>${x.ri.temFinal?fmt(x.f.feito):'—'}</td><td>${x.ri.temFinal?fmt(x.f.meta):'—'}</td><td class="nx-saldo ${s<0?'neg':'pos'}">${x.ri.temFinal?(s>0?'+':'')+fmt(s):'—'}</td><td>${x.ri.segundos?fmt(x.ri.segundos/60,2)+' min':'—'}</td><td>${x.ri.bal!=null?p1(x.ri.bal):'—'}</td><td>${x.ri.temFinal?pill(x.f.eff):'<span class="nx-pill nx-cyan">sem op. final</span>'}</td></tr>`}).join('');
 const total=`<tr class="nx-total"><td>TOTAL</td><td>${fmt(fin.feito)}</td><td>${fmt(fin.meta)}</td><td class="nx-saldo ${saldo<0?'neg':'pos'}">${(saldo>0?'+':'')+fmt(saldo)}</td><td>—</td><td>${balMed!=null?p1(balMed):'—'}</td><td>${pill(fin.eff)}</td></tr>`;
 const rank=[...comFinal].filter(x=>x.f.meta).sort((a,b)=>b.f.eff-a.f.eff).slice(0,6).map((x,i)=>`<div class="nx-rank nx-rank-${tone(x.f.eff)}"><span>${i+1}º</span><b>${escapeHtml(x.p.nome)}</b><em>${p1(x.f.eff)}</em></div>`).join('');
 const auto=comFinal.filter(x=>x.metaAuto!=null).slice(0,3).map(x=>`<div class="nx-auto-row"><b>${escapeHtml(x.p.nome)}</b><span>${fmt(x.min/60,1)} h × ${p1(x.ri.bal)} ÷ ${fmt(x.ri.segundos/60,2)} min</span><em>${fmt(x.metaAuto)} pç</em></div>`).join('');
 return `<section class="nx-kpis">
  ${nk('box','PEÇAS PRONTAS',fmt(fin.feito),'yellow')}
  ${nk('meta','META DE PRONTAS',fmt(fin.meta),'green')}
  ${nk('scale','SALDO',(saldo>0?'+':'')+fmt(saldo),saldo<0?'red':'cyan')}
  ${nk('bolt','EFICIÊNCIA COLETIVA',p1(fin.eff),tone(fin.eff),'peça pronta')}
  ${nk('trend','PRODUTOS NA META',`${fmt(comFinal.filter(x=>x.f.eff>=100).length)}<em>/${fmt(comFinal.length)}</em>`,'green')}</section>
 <div class="nx-grid-prontas">${box('box','PRODUÇÃO FINAL POR PRODUTO',`${fmt(prods.length)} produto(s)`,prods.length?`<table class="nx-table nx-table-big"><thead><tr><th>PRODUTO</th><th>PRONTAS</th><th>META</th><th>SALDO</th><th>TEMPO PADRÃO</th><th>BALANCEAMENTO</th><th>EFICIÊNCIA</th></tr></thead><tbody>${linhas}</tbody><tfoot>${total}</tfoot></table>`:empty('Sem produção no período.'),'nx-scroll nx-span-rows')}
  ${box('bars','PRONTAS POR PRODUTO',legend('Prontas','Meta'),groupBars(comFinal.slice(0,8).map(x=>({label:x.p.nome,a:x.f.feito,b:x.f.meta})),{aria:'Prontas e meta por produto',redWhenBelow:true}))}
  <div class="nx-pair">${box('gear','META AUTOMÁTICA DA PEÇA','',`<p class="nx-auto-txt">Meta calculada pelo <em>tempo trabalhado</em> no produto, o <em>balanceamento</em> do roteiro e o <em>tempo padrão</em> da peça.</p><div class="nx-formula">${ico('calendar')}<b>META =</b><div><span>Tempo trabalhado × Balanceamento</span><span>Tempo padrão da peça</span></div></div>${auto||empty('Cadastre os tempos do roteiro.')}`,'nx-scroll')}
  ${box('trophy','RANKING DOS PRODUTOS','',rank||empty('Sem produtos com operação final.'),'nx-scroll')}</div></div>`;
}


/* ---------- Tela 6: QUALIDADE ---------- */
function paretoChart(items){
 if(!items.length)return empty('Nenhum defeito registrado no período.');
 const W=1000,H=330,L=64,R=64,T=34,B=56,tot=items.reduce((n,i)=>n+i.value,0),mx=Math.max(1,...items.map(i=>i.value))*1.12;
 const gw=(W-L-R)/items.length,bw=Math.min(90,gw*.62),y=v=>T+(1-v/mx)*(H-T-B),yp=p=>T+(1-p/100)*(H-T-B);
 let acc=0;const pts=items.map((it,i)=>{acc+=it.value;return {x:L+gw*i+gw/2,p:100*acc/tot};});
 const maxCh=Math.max(4,Math.floor(gw/10)),corta=t=>t.length>maxCh?t.slice(0,maxCh-1)+'…':t;
 return `<svg class="nx-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Pareto de defeitos">
 <defs><linearGradient id="nxPq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7b7f"/><stop offset="1" stop-color="#d83a40"/></linearGradient><linearGradient id="nxPq2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#d9a91a"/></linearGradient></defs>
 ${[0,25,50,75,100].map(t=>`<line x1="${L}" x2="${W-R}" y1="${yp(t)}" y2="${yp(t)}" class="nx-grid"/><text x="${W-R+8}" y="${yp(t)+5}" class="nx-axis">${t}%</text>`).join('')}
 <line x1="${L}" x2="${W-R}" y1="${yp(80)}" y2="${yp(80)}" class="nx-ref"/><text x="${L+4}" y="${yp(80)-7}" class="nx-ref-t">80%</text>
 ${items.map((it,i)=>{const cx=L+gw*i+gw/2;return `<rect x="${cx-bw/2}" y="${y(it.value)}" width="${bw}" height="${H-B-y(it.value)}" rx="5" fill="${pts[i].p<=80||i===0?'url(#nxPq)':'url(#nxPq2)'}"/><text x="${cx}" y="${y(it.value)-8}" class="nx-val" text-anchor="middle">${fmt(it.value)}</text><text x="${cx}" y="${H-30}" class="nx-axis nx-axis-x" text-anchor="middle"><title>${escapeHtml(it.label)}</title>${escapeHtml(corta(it.label))}</text>`}).join('')}
 <path d="${pts.map((q,i)=>(i?'L':'M')+q.x.toFixed(1)+' '+yp(q.p).toFixed(1)).join(' ')}" class="nx-line"/>
 ${pts.map(q=>`<circle cx="${q.x}" cy="${yp(q.p)}" r="6" class="nx-dot nx-dot-cyan"/>`).join('')}
 <line x1="${L}" x2="${W-R}" y1="${H-B}" y2="${H-B}" class="nx-base"/></svg>`;
}
function panelQualidade(){
 const rows=rowsFlow(),byL=new Map(rows.map(l=>[String(l.id),l]));
 const regs=(data.qualidade||[]).map(q=>({q,l:byL.get(String(q.lancamento))})).filter(x=>x.l);
 const pontos=(data.roteiro||[]).filter(r=>r.qualidade).length;
 if(!pontos)return empty('Nenhuma operação marcada como ponto de inspeção. Marque em Produtos e operações → Tempos por produto → Inspeção de qualidade.');
 const num=v=>Number(v)||0,defDe=q=>q.defeituosas!=null?num(q.defeituosas):(q.defeitos||[]).reduce((n,d)=>n+num(d.quantidade),0);
 const insp=regs.reduce((n,x)=>n+(x.q.inspecionadas!=null?num(x.q.inspecionadas):num(x.l.realizado)),0);
 const def=regs.reduce((n,x)=>n+defDe(x.q),0),ret=regs.reduce((n,x)=>n+num(x.q.retrabalho),0),ref=regs.reduce((n,x)=>n+num(x.q.refugo),0);
 const idx=insp?100*def/insp:null,tq=v=>v==null?'cyan':v<=2?'green':v<=5?'yellow':'red';
 const apont=rows.filter(l=>byId('roteiro',l.roteiro)?.qualidade),cobertura=apont.length?100*regs.length/apont.length:null;
 // pareto
 const porDef=new Map();regs.forEach(x=>(x.q.defeitos||[]).forEach(d=>porDef.set(d.defeito,(porDef.get(d.defeito)||0)+num(d.quantidade))));
 const pareto=[...porDef.entries()].map(([id,v])=>({label:byId('defeitos',id)?.nome||'Defeito',value:v})).filter(i=>i.value>0).sort((a,b)=>b.value-a.value).slice(0,10);
 // por dia
 const dias=[...new Set(regs.map(x=>x.l.data))].sort();
 const ptsD=dias.map(d=>{const r=regs.filter(x=>x.l.data===d),i=r.reduce((n,x)=>n+(x.q.inspecionadas!=null?num(x.q.inspecionadas):num(x.l.realizado)),0),f=r.reduce((n,x)=>n+defDe(x.q),0),v=i?100*f/i:0;return {label:shortDate(d),value:v,tone:v<=2?'green':v<=5?'cyan':'red'}});
 // por ponto de inspeção (produto × operação)
 const pp=new Map();regs.forEach(x=>{const k=x.l.produto+'|'+(x.l.roteiro||x.l.processo);let g=pp.get(k);if(!g){g={nome:(byId('processos',x.l.processo)?.nome||'')+' · '+(byId('produtos',x.l.produto)?.nome||''),insp:0,def:0};pp.set(k,g);}g.insp+=x.q.inspecionadas!=null?num(x.q.inspecionadas):num(x.l.realizado);g.def+=defDe(x.q);});
 const pontosL=[...pp.values()].map(g=>({...g,idx:g.insp?100*g.def/g.insp:0})).sort((a,b)=>b.idx-a.idx);
 const mxI=Math.max(1,...pontosL.map(g=>g.idx));
 const barsP=pontosL.map((g,i)=>`<div class="nx-hrow"><span class="nx-hn">${i+1}</span><b class="nx-hname" title="${escapeHtml(g.nome)}">${escapeHtml(g.nome)}</b><div class="nx-htrack"><i class="nx-hbar nx-${tq(g.idx)==='yellow'?'yellow':tq(g.idx)}" style="width:${Math.max(3,g.idx/mxI*100)}%"></i></div><span class="nx-hval">${fmt(g.def)}</span><span class="nx-pill nx-${tq(g.idx)}">${fmt(g.idx,1)}%</span></div>`).join('');
 // por produto
 const pr=new Map();regs.forEach(x=>{let g=pr.get(x.l.produto);if(!g){g={nome:byId('produtos',x.l.produto)?.nome||'—',insp:0,def:0,ret:0,ref:0};pr.set(x.l.produto,g);}g.insp+=x.q.inspecionadas!=null?num(x.q.inspecionadas):num(x.l.realizado);g.def+=defDe(x.q);g.ret+=num(x.q.retrabalho);g.ref+=num(x.q.refugo);});
 const tab=[...pr.values()].sort((a,b)=>b.insp-a.insp).map(g=>{const i=g.insp?100*g.def/g.insp:null;return `<tr class="nx-row-${tq(i)==='yellow'?'yellow':tq(i)}"><td><b>${escapeHtml(g.nome)}</b></td><td>${fmt(g.insp)}</td><td>${fmt(g.def)}</td><td><span class="nx-pill nx-${tq(i)}">${i==null?'—':fmt(i,1)+'%'}</span></td><td>${fmt(g.ret)}</td><td>${fmt(g.ref)}</td></tr>`}).join('');
 return `<section class="nx-kpis">
  ${nk('box','INSPECIONADAS',fmt(insp),'cyan',fmt(regs.length)+' inspeção(ões)')}
  ${nk('alert','COM DEFEITO',fmt(def),def?'red':'green')}
  ${nk('meta','ÍNDICE DE DEFEITO',idx==null?'—':fmt(idx,1)+'%',tq(idx),'defeito ÷ inspecionadas')}
  ${nk('gear','RETRABALHO / REFUGO',`${fmt(ret)}<em>/ ${fmt(ref)}</em>`,'yellow')}
  ${nk('layers','COBERTURA',cobertura==null?'—':p1(cobertura),cobertura==null?'cyan':cobertura>=90?'green':cobertura>=60?'yellow':'red','apontamentos inspecionados')}</section>
 <div class="nx-grid2">${box('alert','PARETO DE DEFEITOS','Quantidade e % acumulado',paretoChart(pareto))}
  ${box('trend','ÍNDICE DE DEFEITO POR DIA',filterSummary(),lineChart(ptsD,{fmt:v=>fmt(v,1)+'%',floor:0,id:'q',aria:'Índice de defeito por dia'}))}
  ${box('layers','POR PONTO DE INSPEÇÃO','Peças com defeito e índice',pontosL.length?`<div class="nx-hbars">${barsP}</div>`:empty('Sem inspeções registradas no período.'))}
  ${box('box','QUALIDADE POR PRODUTO','',tab?`<table class="nx-table"><thead><tr><th>PRODUTO</th><th>INSPEC.</th><th>DEFEITO</th><th>ÍNDICE</th><th>RETRAB.</th><th>REFUGO</th></tr></thead><tbody>${tab}</tbody></table>`:empty('Sem inspeções registradas no período.'),'nx-scroll')}</div>`;
}
/* ---------- Tela 5: TENDÊNCIAS ---------- */
function panelTendencias(){
 const rows=rowsFor(),flow=rowsFlow(),dia=filters.fim||nowDate();
 const doDia=rows.filter(l=>l.data===dia),horas=new Map();
 for(const l of doDia){const h=String(l.fim||'00:00').slice(0,2)+':00';const x=horas.get(h)||{meta:0,feito:0};x.meta+=Number(l.metaSnapshot||0);x.feito+=Number(l.realizado||0);horas.set(h,x);}
 const ptsH=[...horas.entries()].sort((a,b)=>a[0].localeCompare(b[0])).filter(([,x])=>x.meta).map(([h,x])=>{const e=100*x.feito/x.meta;return {label:h,value:e,tone:e>=100?'green':e>=85?'cyan':'red'}});
 let acc={meta:0,feito:0};const ptsAcc=[...horas.entries()].sort((a,b)=>a[0].localeCompare(b[0])).filter(([,x])=>x.meta).map(([h,x])=>{acc.meta+=x.meta;acc.feito+=x.feito;const e=100*acc.feito/acc.meta;return {label:h,value:e,tone:e>=100?'green':e>=85?'cyan':'red'}});
 const dias=[...new Set(rows.map(l=>l.data))].sort();
 const ptsD=dias.map(d=>{const s=sums(rows.filter(l=>l.data===d));return {label:shortDate(d),value:s.eff||0,tone:(s.eff||0)>=100?'green':(s.eff||0)>=85?'cyan':'red'}});
 const finD=[...new Set(flow.filter(isFinished).map(l=>l.data))].sort().map(d=>{const s=sums(flow.filter(l=>l.data===d&&isFinished(l)));return {label:shortDate(d),a:s.feito,b:s.meta}});
 const sDia=sums(doDia),sPer=sums(rows),melhor=[...ptsD].sort((a,b)=>b.value-a.value)[0];
 return `<section class="nx-kpis nx-kpis4">
  ${nk('bolt','EFICIÊNCIA DO DIA',p1(sDia.eff),tone(sDia.eff),dateLabel(dia))}
  ${nk('trend','EFICIÊNCIA NO PERÍODO',p1(sPer.eff),tone(sPer.eff),dias.length+' dia(s)')}
  ${nk('box','PRONTAS NO DIA',fmt(sums(flow.filter(l=>l.data===dia&&isFinished(l))).feito),'yellow')}
  ${nk('trophy','MELHOR DIA',melhor?p1(melhor.value):'—','green','',melhor?melhor.label:'')}</section>
 <div class="nx-grid2">${box('clock','EFICIÊNCIA HORA A HORA',dateLabel(dia),lineChart(ptsH,{ref:100,refLabel:'META 100%',fmt:v=>fmt(v,1)+'%',floor:0,id:'h',aria:'Eficiência por hora'}))}
  ${box('trend','EFICIÊNCIA ACUMULADA NO DIA',dateLabel(dia),lineChart(ptsAcc,{ref:100,refLabel:'META 100%',fmt:v=>fmt(v,1)+'%',floor:0,id:'a',aria:'Eficiência acumulada no dia'}))}
  ${box('calendar','EFICIÊNCIA DIA A DIA',filterSummary(),lineChart(ptsD,{ref:100,refLabel:'META 100%',fmt:v=>fmt(v,1)+'%',floor:0,id:'d',aria:'Eficiência por dia'}))}
  ${box('box','PEÇAS PRONTAS POR DIA',legend('Prontas','Meta'),groupBars(finD.slice(-10),{aria:'Prontas por dia',redWhenBelow:true}))}</div>`;
}

function panelGargalos(){
 const rows=rowsFlow(),stats=opStats(rows),all=sums(rows);
 const finals=rows.filter(isFinished),fin=sums(finals);
 const sorted=[...stats].sort((a,b)=>metricVal(b)-metricVal(a));
 const media=stats.length?stats.reduce((n,o)=>n+metricVal(o),0)/stats.length:0;
 const g=sorted[sorted.length-1],metaMedia=stats.length?stats.reduce((n,o)=>n+metricMeta(o),0)/stats.length:0;
 const prodName=filters.produto?byId('produtos',filters.produto)?.nome:'Todos os produtos (por operação)';
 const items=sorted.map(o=>({label:o.nome+(filters.produto&&o.etapa?'':''),value:metricVal(o),text:fmtM(metricVal(o)),cls:(o===g?'is-gargalo':metricVal(o)<media?'is-abaixo':'')+(o.final?' is-final':''),
   title:`${o.nome}: ${fmt(o.pecas)} peças · ${fmt(o.min/60,1)} h · ${fmt(o.pph,1)} pç/h · ${o.pessoas.size} pessoa(s)`}));
 return `<section class="tvg-kpis">
  ${kpiBox('GARGALO',stats.length>1?fmtM(media-metricVal(g)):'—','tvg-yellow',stats.length>1?'média − '+escapeHtml(g.nome).toLowerCase():'')}
  ${kpiBox('GLOBAL',pct(all.eff).replace(',00',''),'tvg-'+cls(all.eff),'eficiência de todas as operações')}
  ${kpiBox('FINALIZADOS',fmt(fin.feito),'tvg-yellow','peças prontas')}
  ${kpiBox('FINAL',pct(fin.eff).replace(',00',''),'tvg-'+cls(fin.eff),'eficiência da operação final')}
 </section>
 <div class="tvg-grid"><section class="tvg-box"><div class="tv-panel-header"><div><b>IDENTIFICADOR DE GARGALOS</b><small>${escapeHtml(prodName)} · ${cfg.metric==='pph'?'velocidade: peças por hora trabalhada':'peças produzidas no período'}</small></div>
  <div class="tvg-toggle"><button type="button" data-tv-metric="pecas" class="${cfg.metric==='pecas'?'on':''}">PEÇAS</button><button type="button" data-tv-metric="pph" class="${cfg.metric==='pph'?'on':''}">PEÇAS/HORA</button></div></div>
  ${stats.length?barChart(items,[{value:media,label:`MÉDIA DE OPERAÇÕES (${fmtM(media)})`,cls:'l-media'},{value:metaMedia,label:`META MÉDIA (${fmtM(metaMedia)})`,cls:'l-meta'},{value:g?metricVal(g):0,label:`OPERAÇÃO GARGALO (${g?fmtM(metricVal(g)):'—'})`,cls:'l-gargalo'}])
   :'<div class="tvg-empty tvg-empty-big">Sem apontamentos no período. Ajuste os filtros.</div>'}
 </section><aside class="tvg-box tvg-side"><div class="tv-panel-header"><div><b>SUGESTÕES DE MOVIMENTAÇÃO</b><small>Quem sabe fazer o gargalo e está em operação com sobra</small></div></div><div class="tvg-sug-list">${sugestoes(stats,rows)}</div></aside></div>`;
}
function scrollBtnTxt(){return '↕ ROLAGEM '+(cfg.scroll[cfg.panel]?'LIGADA':'DESLIGADA')}
function panelTabs(){return `<div class="tv-panels">${PANELS.map(([n,l,ic])=>`<button type="button" class="tv-panel-tab${cfg.panel===n?' on':''}${cfg.panels.includes(n)?'':' off-rot'}" data-tv-panel="${n}">${ico(ic)}${n}. ${l}</button>`).join('')}<button type="button" id="tvScrollBtn" class="tv-scroll-btn${cfg.scroll[cfg.panel]?' on':''}" data-tv-scroll title="Rola sozinho as listas desta tela, de cima para baixo e de volta">${scrollBtnTxt()}</button></div>
 <div class="tv-rot-ctrl"><label class="tv-rotate"><input type="checkbox" id="tvRotOn" ${cfg.rotate?'checked':''}> RODÍZIO</label><label class="tv-rotate">A CADA <input type="number" id="tvRotSecs" min="10" max="600" step="5" value="${cfg.secs}"> S</label>
 <span class="tv-rot-pick" title="Telas que entram no rodízio">NO RODÍZIO ${PANELS.map(([n])=>`<label><input type="checkbox" data-rot-panel="${n}" ${cfg.panels.includes(n)?'checked':''}>${n}</label>`).join('')}</span></div>`}
function applyPanel(){
 const ws=document.getElementById('tvWorkspace');if(!ws)return;
 ws.dataset.panel=String(cfg.panel);
 document.querySelectorAll('[data-tv-panel]').forEach(b=>b.classList.toggle('on',Number(b.dataset.tvPanel)===cfg.panel));
 const sb=document.getElementById('tvScrollBtn');if(sb){sb.classList.toggle('on',!!cfg.scroll[cfg.panel]);sb.textContent=scrollBtnTxt();}
 const name=document.getElementById('tvPanelName');if(name)name.textContent=(PANELS.find(p=>p[0]===cfg.panel)||[])[1]||'';
 const dots=document.getElementById('tvDots');if(dots)dots.innerHTML=PANELS.filter(([n])=>cfg.panels.includes(n)||n===cfg.panel).map(([n])=>`<i class="${n===cfg.panel?'on':''}"></i>`).join('');
}
function rotTick(){
 if(!active||!cfg.rotate)return;
 rotElapsed++;
 const bar=document.getElementById('tvRotBar');if(bar)bar.style.width=Math.min(100,rotElapsed/cfg.secs*100)+'%';
 if(rotElapsed>=cfg.secs){rotElapsed=0;const lst=PANELS.map(p=>p[0]).filter(n=>cfg.panels.includes(n));if(lst.length){const i=lst.indexOf(cfg.panel);cfg.panel=lst[(i+1)%lst.length];}saveCfg();applyPanel();updateUi();}
}
function setRotation(){
 rotElapsed=0;if(rotTimer){clearInterval(rotTimer);rotTimer=null;}
 const bar=document.getElementById('tvRotBar');if(bar)bar.style.width='0%';
 const ws=document.getElementById('tvWorkspace');if(ws)ws.classList.toggle('tv-rotating',!!cfg.rotate);
 if(cfg.rotate)rotTimer=setInterval(rotTick,1000);
}
function updateUi(){
 if(!active)return;
 const rows=rowsFor();
 const k=document.getElementById('tvKpis'),r=document.getElementById('tvRows'),rank=document.getElementById('tvRanking'),count=document.getElementById('tvRowCount'),sync=document.getElementById('tvLastSync');
 if(k)k.innerHTML=kpiHtml(rows);
 if(r)r.innerHTML=rowsHtml(rows);
 const hd=document.getElementById('tvHead');if(hd)hd.innerHTML=headHtml();
 const g1=document.getElementById('tvGrid1');if(g1)g1.classList.toggle('no-rank',!!cfg.p1.semRanking);
 const op=document.getElementById('tvOpts');if(op)op.innerHTML=optsHtml();
 const tt=document.getElementById('tvTblTitle');if(tt)tt.textContent=cfg.p1.agrupar?'PRODUÇÃO POR OPERAÇÃO':'LANÇAMENTOS DE PRODUÇÃO';
 const ts=document.getElementById('tvTblSub');if(ts)ts.textContent=cfg.p1.agrupar?'Eficiência coletiva ponderada pelos lançamentos':'Indicadores por apontamento no intervalo selecionado';
 if(rank)rank.innerHTML=rankings(rows);
 if(count)count.textContent=fmt(rows.length)+' apontamento(s)';
 const rc=document.getElementById('tvRankCount');if(rc)rc.textContent=new Set(rows.map(l=>l.funcionario)).size+' pessoa(s)';
 const fs=document.getElementById('tvFilterSummary');if(fs)fs.textContent=filterSummary();
 if(sync)sync.textContent=lastError?lastError:lastUpdated?'Atualizado às '+lastUpdated.toLocaleTimeString('pt-BR'):'Sincronizando com o Supabase';
 guardarRolagem();
 for(const n of [2,3,4,5,6]){const el=document.getElementById('tvP'+n);if(el)el.innerHTML=cfg.panel===n?PANEL_FN[n]():'';}
 restaurarRolagem();
 updateClock();
 requestAnimationFrame(fitKpis);
}
/* nenhum número pode cobrir o texto: reduz a fonte do valor até caber no cartão */
function fitKpis(){
 document.querySelectorAll('#tvWorkspace .nx-kpi').forEach(k=>{
  const st=k.querySelector('strong'),tx=k.querySelector('.nx-kpi-txt');if(!st||!tx||!k.offsetWidth)return;
  st.style.fontSize='';const nm=k.querySelector('.nx-k-nome');if(nm)nm.style.fontSize='';
  let f=parseFloat(getComputedStyle(st).fontSize),i=0;
  const cruza=()=>{const a=st.getBoundingClientRect(),b=tx.getBoundingClientRect();return a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;};
  const estoura=()=>k.scrollWidth>k.clientWidth+1||tx.scrollWidth>tx.clientWidth+1||st.scrollWidth>st.clientWidth+1||cruza();
  while(estoura()&&f>11&&i++<40){f*=.93;st.style.fontSize=f+'px';if(nm&&i>12)nm.style.fontSize=Math.max(10,parseFloat(getComputedStyle(nm).fontSize)*.95)+'px';}
 });
}
window.addEventListener('resize',()=>{if(active)requestAnimationFrame(fitKpis);});
try{document.fonts?.ready?.then(()=>{if(active)fitKpis();});document.fonts?.addEventListener?.('loadingdone',()=>{if(active)fitKpis();});}catch(_){}
try{const ro=new ResizeObserver(()=>{if(active)requestAnimationFrame(fitKpis);});document.addEventListener('DOMContentLoaded',()=>{});window.__fxRO=ro;}catch(_){}
function template(incoming){
 data=incoming;active=true;
 const rows=rowsFor();
 return '<section id="tvWorkspace" class="tv-workspace'+(cfg.rotate?' tv-rotating':'')+'" data-panel="'+cfg.panel+'">'+
 '<header class="tv-header"><div class="tv-brand"><div class="tv-fx"><img src="facsim-mark-tv.svg" alt="" /><b>FACSIM</b></div><div class="tv-title"><h1>APONTADOR DE <em>PRODUÇÃO</em></h1><span>VISUALIZAÇÃO DE CHÃO DE FÁBRICA</span></div></div>'+
 '<div class="tv-header-actions"><span class="tv-filter-summary" id="tvFilterSummary">'+escapeHtml(filterSummary())+'</span><span class="tv-live"><span></span> ATUALIZAÇÃO AUTOMÁTICA · 15 S</span><span class="tv-clock" id="tvClock"></span>'+
 '<button type="button" class="tv-button" data-tv-action="refresh">↻ Atualizar</button>'+
 '<button type="button" class="tv-button" data-tv-action="fullscreen">⛶ Tela cheia</button>'+
 '<button type="button" class="tv-button tv-button-close" data-tv-action="back">← Voltar</button></div></header>'+
 '<section class="tv-panelbar">'+panelTabs()+'<span class="tv-panel-now"><span id="tvPanelName"></span><span id="tvDots" class="tv-dots"></span></span><div class="tv-rot-track"><i id="tvRotBar"></i></div></section>'+
 '<section class="tv-filterbar">'+
 '<label><span>DATA INICIAL</span><input type="date" id="tvInicio" value="'+escapeHtml(filters.inicio)+'"></label>'+
 '<label><span>DATA FINAL</span><input type="date" id="tvFim" value="'+escapeHtml(filters.fim)+'"></label>'+
 '<label><span>FUNCIONÁRIO</span><select id="tvFuncionario">'+options(data.funcionarios,filters.funcionario,'Todos os funcionários')+'</select></label>'+
 '<label><span>PRODUTO</span><select id="tvProduto">'+options(data.produtos,filters.produto,'Todos os produtos')+'</select></label>'+
 '<label><span>PROCESSO</span><select id="tvProcesso">'+options(data.processos,filters.processo,'Todas as operações')+'</select></label>'+
 '<label><span>SETOR</span><select id="tvSetor">'+options(data.setores,filters.setor,'Todos os setores')+'</select></label>'+
 '<label><span>GRUPO</span><select id="tvGrupo">'+options(data.grupos.filter(g=>!filters.setor||g.setor===filters.setor),filters.grupo,'Todos os grupos')+'</select></label>'+
 '<button type="button" class="tv-reset" data-tv-action="reset">Limpar filtros</button></section>'+
 '<div class="tv-p tv-p1"><section class="tv-kpis" id="tvKpis">'+kpiHtml(rows)+'</section>'+
 '<div class="tv-content-grid'+(cfg.p1.semRanking?' no-rank':'')+'" id="tvGrid1"><section class="tv-table-box"><div class="tv-panel-header"><div><b id="tvTblTitle">'+(cfg.p1.agrupar?'PRODUÇÃO POR OPERAÇÃO':'LANÇAMENTOS DE PRODUÇÃO')+'</b><small id="tvTblSub">'+(cfg.p1.agrupar?'Eficiência coletiva ponderada pelos lançamentos':'Indicadores por apontamento no intervalo selecionado')+'</small></div><span id="tvRowCount">'+fmt(rows.length)+' apontamento(s)</span></div><div id="tvOpts">'+optsHtml()+'</div>'+
 '<div class="tv-table-scroll"><table class="tv-data-table"><thead id="tvHead">'+headHtml()+'</thead><tbody id="tvRows">'+rowsHtml(rows)+'</tbody></table></div></section>'+
 '<aside class="tv-ranking-box"><div class="tv-panel-header"><div><b>FUNCIONÁRIOS</b><small>Eficiência acumulada no período</small></div><span id="tvRankCount"></span></div><div id="tvRanking" class="tv-ranking-scroll">'+rankings(rows)+'</div></aside></div></div>'+
 [2,3,4,5,6].map(n=>'<div class="tv-p tv-p'+n+'" id="tvP'+n+'">'+(cfg.panel===n?PANEL_FN[n]():'')+'</div>').join('')+
 '<footer class="tv-bottom"><span>FACSIM • GESTÃO INDUSTRIAL</span><span>Peça pronta = apontamento da operação final · Processos, Gargalos e Peças prontas usam o fluxo inteiro (ignoram filtro de funcionário e processo)</span><span id="tvLastSync">Sincronizando com o Supabase</span></footer></section>';
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
let scrollTimer=null;
/* rolagem automática de todas as listas da tela atual (liga/desliga por tela) */
const SCROLL_SEL='.tv-table-scroll,#tvRanking,.nx-hbars,.nx-scroll .nx-box-b,.tvg-sug-list';
const scrollState=new Map(); // chave -> {dir,pause,top}
let scrollHoverEl=null;
const scrollKey=(el,i)=>cfg.panel+':'+i;
function scrollEls(){const p=document.querySelector('#tvWorkspace .tv-p'+cfg.panel);return p?[...p.querySelectorAll(SCROLL_SEL)]:[];}
function guardarRolagem(){scrollEls().forEach((el,i)=>{const st=scrollState.get(scrollKey(el,i));if(st)st.top=el.scrollTop;});}
function restaurarRolagem(){scrollEls().forEach((el,i)=>{const st=scrollState.get(scrollKey(el,i));if(st&&st.top)el.scrollTop=st.top;});}
function autoScrollTick(){
 if(!active||!cfg.scroll?.[cfg.panel])return;
 scrollEls().forEach((el,i)=>{
  if(el===scrollHoverEl||el.contains(scrollHoverEl))return;
  const k=scrollKey(el,i);let st=scrollState.get(k);if(!st){st={dir:1,pause:60,top:0};scrollState.set(k,st);}
  const max=el.scrollHeight-el.clientHeight;
  if(max<=2){return;}
  if(st.pause>0){st.pause--;return;}
  el.scrollTop=Math.max(0,Math.min(max,el.scrollTop+st.dir));st.top=el.scrollTop;
  if(st.dir>0&&el.scrollTop>=max-1){st.dir=-1;st.pause=80;}      // ~4 s parado no fim
  else if(st.dir<0&&el.scrollTop<=0){st.dir=1;st.pause=80;}       // ~4 s parado no topo
 });
}
function setFull(on){
 const el=document.getElementById('tvWorkspace');if(!el)return;
 el.classList.toggle('tv-full',on);
 const b=el.querySelector('[data-tv-action=fullscreen]');if(b)b.textContent=on?'✕ Sair da tela cheia':'⛶ Tela cheia';
 requestAnimationFrame(()=>requestAnimationFrame(fitKpis));
}
function start(opts){
 stop();
 active=true;
 reload=opts.reload;onBack=opts.onBack;onUpdate=opts.onUpdate;
 lastUpdated=new Date();lastError='';
 updateUi();
 timer=setInterval(refresh,15000);
 clockTimer=setInterval(updateClock,1000);
 scrollTimer=setInterval(autoScrollTick,50);
 try{const ws=document.getElementById('tvWorkspace');if(ws&&window.__fxRO)window.__fxRO.observe(ws);}catch(_){}
 applyPanel();setRotation();
}
function stop(){
 active=false;
 if(timer){clearInterval(timer);timer=null;}
 if(clockTimer){clearInterval(clockTimer);clockTimer=null;}
 if(scrollTimer){clearInterval(scrollTimer);scrollTimer=null;}
 if(rotTimer){clearInterval(rotTimer);rotTimer=null;}
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
 if(!active)return;
 if(ev.target?.dataset?.rotPanel){const n=Number(ev.target.dataset.rotPanel);cfg.panels=ev.target.checked?[...new Set([...cfg.panels,n])].sort():cfg.panels.filter(x=>x!==n);if(!cfg.panels.length){cfg.panels=[n];ev.target.checked=true;}saveCfg();document.querySelectorAll('[data-tv-panel]').forEach(b=>b.classList.toggle('off-rot',!cfg.panels.includes(Number(b.dataset.tvPanel))));applyPanel();return;}
 if(ev.target?.id==='tvRotOn'){cfg.rotate=ev.target.checked;saveCfg();setRotation();return;}
 if(ev.target?.id==='tvRotSecs'){cfg.secs=Math.max(10,Math.min(600,Math.round(Number(ev.target.value)||30)));ev.target.value=cfg.secs;saveCfg();setRotation();return;}
 if(ev.target?.id?.startsWith('tv'))setFilter(ev.target);
});
document.addEventListener('click',ev=>{
 if(ev.target.closest('[data-tv-scroll]')&&active){cfg.scroll[cfg.panel]=!cfg.scroll[cfg.panel];saveCfg();applyPanel();if(!cfg.scroll[cfg.panel])scrollEls().forEach(el=>el.scrollTop=0);return;}
 const ob=ev.target.closest('[data-tv-opt]');
 if(ob&&active){const k=ob.dataset.tvOpt;cfg.p1[k]=!cfg.p1[k];saveCfg();updateUi();return;}
 const pb=ev.target.closest('[data-tv-panel],[data-tv-metric]');
 if(pb&&active){
  if(pb.dataset.tvPanel){cfg.panel=Number(pb.dataset.tvPanel);rotElapsed=0;}else cfg.metric=pb.dataset.tvMetric;
  saveCfg();applyPanel();updateUi();return;
 }
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
document.addEventListener('pointerover',ev=>{scrollHoverEl=ev.target.closest?.(SCROLL_SEL)||null;});
document.addEventListener('pointerout',ev=>{if(!ev.relatedTarget?.closest?.(SCROLL_SEL))scrollHoverEl=null;});
document.addEventListener('keydown',ev=>{if(active&&ev.key==='Escape'){if(document.fullscreenElement)document.exitFullscreen?.();setFull(false);}});
document.addEventListener('visibilitychange',()=>{if(active&&document.visibilityState==='visible')refresh();});
window.GUT_TV={template,start,stop,refresh,updateUi};
})();