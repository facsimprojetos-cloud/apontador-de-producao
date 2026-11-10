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
  return '<tr class="'+cls(e)+'"><td class="tv-nw" title="'+escapeHtml(dateLabel(l.data))+'">'+escapeHtml(shortDate(l.data))+'</td>'+
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
/* ===== Painéis 2 (gargalos) e 3 (peças prontas) e rodízio ===== */
const PANELS=[[1,'PRODUÇÃO'],[2,'GARGALOS'],[3,'PEÇAS PRONTAS']];
const CFG_KEY='gut_tv_cfg';
const cfg={panel:1,rotate:false,secs:30,metric:'pecas'};
try{Object.assign(cfg,JSON.parse(localStorage.getItem(CFG_KEY)||'{}'))}catch(_){/* armazenamento indisponível */}
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
function kpiBox(label,value,clsName,sub){return `<article class="tvg-kpi ${clsName||''}"><small>${label}</small><strong>${value}</strong>${sub?`<span>${sub}</span>`:''}</article>`}
function panel2(){
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
function panel3(){
 const rows=rowsFlow(),all=sums(rows),finals=rows.filter(isFinished),fin=sums(finals);
 const dias=[...new Set(finals.map(l=>l.data))].sort();
 const porDia=dias.map(d=>{const s=sums(finals.filter(l=>l.data===d));return {label:shortDate(d),value:s.feito,marker:s.meta,text:fmt(s.feito),cls:'tvp-'+cls(s.eff),title:`${dateLabel(d)}: ${fmt(s.feito)} prontas de ${fmt(s.meta)} (${pct(s.eff)})`}});
 const prods=(filters.produto?[byId('produtos',filters.produto)]:(data.produtos||[])).filter(Boolean).map(p=>{
  const pr=rows.filter(l=>l.produto===p.id);if(!pr.length)return null;
  const f=sums(pr.filter(isFinished)),temFinal=(data.roteiro||[]).some(r=>r.produto===p.id&&r.final);
  const saved=filters.produto;filters.produto=p.id;const st=opStats(pr);filters.produto=saved;
  const asc=[...st].sort((a,b)=>a.pecas-b.pecas),med=st.length?st.reduce((n,o)=>n+o.pecas,0)/st.length:0;
  return {p,f,temFinal,g:asc[0],perda:st.length>1?med-asc[0].pecas:0};
 }).filter(Boolean).sort((a,b)=>b.f.feito-a.f.feito);
 const mediaDia=dias.length?fin.feito/dias.length:0;
 return `<section class="tvg-kpis tvg-kpis5">
  ${kpiBox('PEÇAS PRONTAS',fmt(fin.feito),'tvg-yellow','saíram da operação final')}
  ${kpiBox('META DE PRONTAS',fmt(fin.meta),'','meta da operação final')}
  ${kpiBox('EFICIÊNCIA COLETIVA',pct(fin.eff).replace(',00',''),'tvg-'+cls(fin.eff),'= eficiência da peça pronta')}
  ${kpiBox('PRONTAS/DIA',fmt(mediaDia),'tvg-yellow',dias.length+' dia(s) com produção')}
  ${kpiBox('GLOBAL',pct(all.eff).replace(',00',''),'tvg-'+cls(all.eff),'todas as operações')}
 </section>
 <div class="tvg-grid"><section class="tvg-box"><div class="tv-panel-header"><div><b>PEÇAS PRONTAS POR DIA</b><small>Barra = prontas · traço = meta da operação final</small></div></div>
  ${porDia.length?barChart(porDia,[{value:mediaDia,label:`MÉDIA (${fmt(mediaDia)})`,cls:'l-media'}]):'<div class="tvg-empty tvg-empty-big">Nenhuma peça pronta no período. Confira a operação final dos produtos.</div>'}
 </section><aside class="tvg-box tvg-side"><div class="tv-panel-header"><div><b>POR PRODUTO</b><small>Peças prontas e onde está travando</small></div></div><div class="tvg-sug-list">
  ${prods.length?prods.map(x=>`<div class="tvp-prod"><div class="tvp-prod-top"><b>${escapeHtml(x.p.nome)}</b><span class="tvp-eff ${cls(x.f.eff)}">${x.temFinal?pct(x.f.eff).replace(',00',''):'—'}</span></div>
   ${x.temFinal?`<div class="tvp-line"><span>Prontas</span><b>${fmt(x.f.feito)}</b><span>de ${fmt(x.f.meta)}</span></div>`:'<div class="tvp-line warn">Defina a operação final do produto</div>'}
   ${x.g&&x.perda>0?`<div class="tvp-line"><span>Gargalo</span><b>${escapeHtml(x.g.nome)}</b><span>−${fmt(x.perda)} pç vs média</span></div>`:''}</div>`).join('')
   :'<div class="tvg-empty">Sem produção no período.</div>'}</div></aside></div>`;
}
function panelTabs(){return `<div class="tv-panels">${PANELS.map(([n,l])=>`<button type="button" class="tv-panel-tab${cfg.panel===n?' on':''}" data-tv-panel="${n}">${n}. ${l}</button>`).join('')}
 <label class="tv-rotate"><input type="checkbox" id="tvRotOn" ${cfg.rotate?'checked':''}> RODÍZIO</label><label class="tv-rotate">A CADA <input type="number" id="tvRotSecs" min="10" max="600" step="5" value="${cfg.secs}"> S</label></div>`}
function applyPanel(){
 const ws=document.getElementById('tvWorkspace');if(!ws)return;
 ws.dataset.panel=String(cfg.panel);
 document.querySelectorAll('[data-tv-panel]').forEach(b=>b.classList.toggle('on',Number(b.dataset.tvPanel)===cfg.panel));
 const name=document.getElementById('tvPanelName');if(name)name.textContent=(PANELS.find(p=>p[0]===cfg.panel)||[])[1]||'';
 const dots=document.getElementById('tvDots');if(dots)dots.innerHTML=PANELS.map(([n])=>`<i class="${n===cfg.panel?'on':''}"></i>`).join('');
}
function rotTick(){
 if(!active||!cfg.rotate)return;
 rotElapsed++;
 const bar=document.getElementById('tvRotBar');if(bar)bar.style.width=Math.min(100,rotElapsed/cfg.secs*100)+'%';
 if(rotElapsed>=cfg.secs){rotElapsed=0;cfg.panel=cfg.panel%PANELS.length+1;saveCfg();applyPanel();updateUi();}
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
 if(rank)rank.innerHTML=rankings(rows);
 if(count)count.textContent=fmt(rows.length)+' apontamento(s)';
 const rc=document.getElementById('tvRankCount');if(rc)rc.textContent=new Set(rows.map(l=>l.funcionario)).size+' pessoa(s)';
 const fs=document.getElementById('tvFilterSummary');if(fs)fs.textContent=filterSummary();
 if(sync)sync.textContent=lastError?lastError:lastUpdated?'Atualizado às '+lastUpdated.toLocaleTimeString('pt-BR'):'Sincronizando com o Supabase';
 const p2=document.getElementById('tvP2');if(p2)p2.innerHTML=cfg.panel===2?panel2():'';
 const p3=document.getElementById('tvP3');if(p3)p3.innerHTML=cfg.panel===3?panel3():'';
 updateClock();
}
function template(incoming){
 data=incoming;active=true;
 const rows=rowsFor();
 return '<section id="tvWorkspace" class="tv-workspace'+(cfg.rotate?' tv-rotating':'')+'" data-panel="'+cfg.panel+'">'+
 '<header class="tv-header"><div class="tv-brand"><div class="tv-fx"><img src="facsim-mark-tv.svg" alt="" /><b>FACSIM</b></div><div class="tv-title"><span>PAINEL AO VIVO</span><h1>APONTADOR <em>DE PRODUÇÃO</em></h1></div></div>'+
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
 '<div class="tv-content-grid"><section class="tv-table-box"><div class="tv-panel-header"><div><b>LANÇAMENTOS DE PRODUÇÃO</b><small>Indicadores por apontamento no intervalo selecionado</small></div><span id="tvRowCount">'+fmt(rows.length)+' apontamento(s)</span></div>'+
 '<div class="tv-table-scroll"><table class="tv-data-table"><thead><tr><th>DATA</th><th>HORA</th><th>PRODUTO</th><th>FUNCIONÁRIO</th><th>PROCESSO</th><th>INÍCIO</th><th>FIM</th><th>META</th><th>REALIZADO</th><th>EFICIÊNCIA</th></tr></thead><tbody id="tvRows">'+rowsHtml(rows)+'</tbody></table></div></section>'+
 '<aside class="tv-ranking-box"><div class="tv-panel-header"><div><b>FUNCIONÁRIOS</b><small>Eficiência acumulada no período</small></div><span id="tvRankCount"></span></div><div id="tvRanking" class="tv-ranking-scroll">'+rankings(rows)+'</div></aside></div></div>'+
 '<div class="tv-p tv-p2" id="tvP2">'+(cfg.panel===2?panel2():'')+'</div><div class="tv-p tv-p3" id="tvP3">'+(cfg.panel===3?panel3():'')+'</div>'+
 '<footer class="tv-bottom"><span>FACSIM • GESTÃO INDUSTRIAL</span><span>Peça pronta = apontamento da operação final do produto · Gargalos e Peças prontas usam o fluxo inteiro (ignoram filtro de funcionário e processo)</span><span id="tvLastSync">Sincronizando com o Supabase</span></footer></section>';
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
 if(ev.target?.id==='tvRotOn'){cfg.rotate=ev.target.checked;saveCfg();setRotation();return;}
 if(ev.target?.id==='tvRotSecs'){cfg.secs=Math.max(10,Math.min(600,Math.round(Number(ev.target.value)||30)));ev.target.value=cfg.secs;saveCfg();setRotation();return;}
 if(ev.target?.id?.startsWith('tv'))setFilter(ev.target);
});
document.addEventListener('click',ev=>{
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
document.addEventListener('pointerover',ev=>{if(ev.target.closest?.('#tvRanking'))scrollHold=true;});
document.addEventListener('pointerout',ev=>{if(ev.target.closest?.('#tvRanking')&&!ev.relatedTarget?.closest?.('#tvRanking'))scrollHold=false;});
document.addEventListener('keydown',ev=>{if(active&&ev.key==='Escape'){if(document.fullscreenElement)document.exitFullscreen?.();setFull(false);}});
document.addEventListener('visibilitychange',()=>{if(active&&document.visibilityState==='visible')refresh();});
window.GUT_TV={template,start,stop,refresh,updateUi};
})();