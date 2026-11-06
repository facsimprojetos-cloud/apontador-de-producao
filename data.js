// Os registros abaixo replicam um cenário FICTÍCIO de confecção; não contêm dados pessoais reais.
window.GUT_SEED = {
  setores: [
    {id:'s1',nome:'Costura'}, {id:'s2',nome:'Corte'},
    {id:'s3',nome:'Acabamento'}, {id:'s4',nome:'Expedição'}
  ],
  maquinas: [
    {id:'m1',nome:'Reta industrial',setor:'s1'}, {id:'m2',nome:'Overloque industrial',setor:'s1'},
    {id:'m3',nome:'Galoneira',setor:'s1'}, {id:'m4',nome:'Mesa de corte elétrica',setor:'s2'},
    {id:'m5',nome:'Seladora de embalagem',setor:'s4'}
  ],
  funcoes: [
    {id:'f1',nome:'Costura reta'}, {id:'f2',nome:'Overloque'},
    {id:'f3',nome:'Galoneira'}, {id:'f4',nome:'Corte'},
    {id:'f5',nome:'Revisão'}, {id:'f6',nome:'Embalagem'}
  ],
  funcionarios: [
    {id:'SIM-F001',nome:'Ana Paula Souza',setor:'s1',maquinas:['m1','m2','m3'],funcoes:['f1','f2','f3'],nivel:1,ativo:true},
    {id:'SIM-F002',nome:'Bruno Costa',setor:'s1',maquinas:['m1','m2','m3'],funcoes:['f1','f2','f3'],nivel:2,ativo:true},
    {id:'SIM-F003',nome:'Carla Mendes',setor:'s1',maquinas:['m1','m2','m3'],funcoes:['f1','f2','f3'],nivel:3,ativo:true},
    {id:'SIM-F004',nome:'Diego Santos',setor:'s2',maquinas:['m4'],funcoes:['f4'],nivel:2,ativo:true},
    {id:'SIM-F005',nome:'Elisa Rocha',setor:'s3',maquinas:['m1'],funcoes:['f5'],nivel:2,ativo:true},
    {id:'SIM-F006',nome:'Fábio Lima',setor:'s4',maquinas:['m5'],funcoes:['f6'],nivel:3,ativo:true}
  ],
  produtos: [
    {id:'SIM-CAM',nome:'Camiseta básica de algodão',descricao:'Malha penteada'},
    {id:'SIM-POL',nome:'Camisa polo piquet',descricao:'Gola e vista'},
    {id:'SIM-CAL',nome:'Calça de moletom',descricao:'Moletom com elástico'}
  ],
  processos: [
    {id:'SIM-CT',nome:'Cortar componentes',funcao:'f4'},
    {id:'SIM-FL',nome:'Fechar laterais',funcao:'f2'},
    {id:'SIM-PM',nome:'Pregar mangas',funcao:'f2'},
    {id:'SIM-BR',nome:'Fazer barras',funcao:'f3'},
    {id:'SIM-RV',nome:'Revisar peças',funcao:'f5'},
    {id:'SIM-EM',nome:'Embalar peças',funcao:'f6'}
  ],
  roteiro: [
    ['SIM-CAM','SIM-CT',90],['SIM-CAM','SIM-FL',60],['SIM-CAM','SIM-PM',72],['SIM-CAM','SIM-BR',45],['SIM-CAM','SIM-RV',30],['SIM-CAM','SIM-EM',25],
    ['SIM-POL','SIM-CT',105],['SIM-POL','SIM-FL',75],['SIM-POL','SIM-PM',90],['SIM-POL','SIM-BR',55],['SIM-POL','SIM-RV',40],['SIM-POL','SIM-EM',30],
    ['SIM-CAL','SIM-CT',125],['SIM-CAL','SIM-FL',110],['SIM-CAL','SIM-BR',65],['SIM-CAL','SIM-RV',38],['SIM-CAL','SIM-EM',27]
  ].map(([produto,processo,tempo],i,arr)=>({id:'r'+(i+1),produto,processo,tempo,etapa:arr.slice(0,i+1).filter(x=>x[0]===produto).length})),
  niveis: [{id:1,nome:'Inicial',descricao:'Aprendizagem e adaptação'},{id:2,nome:'Intermediário',descricao:'Domínio operacional'},{id:3,nome:'Avançado',descricao:'Alta competência técnica'}],
  tempos: [
    ['SIM-F001','SIM-CAM','SIM-FL',60,1],['SIM-F001','SIM-CAM','SIM-PM',72,1],['SIM-F001','SIM-CAM','SIM-BR',52,1],['SIM-F001','SIM-POL','SIM-FL',82,1],
    ['SIM-F002','SIM-CAM','SIM-FL',48,2],['SIM-F002','SIM-CAM','SIM-PM',60,2],['SIM-F002','SIM-CAM','SIM-BR',45,2],['SIM-F002','SIM-POL','SIM-FL',68,2],
    ['SIM-F003','SIM-CAM','SIM-FL',40,3],['SIM-F003','SIM-CAM','SIM-PM',54,3],['SIM-F003','SIM-CAM','SIM-BR',37,3],['SIM-F003','SIM-POL','SIM-FL',60,3],
    ['SIM-F004','SIM-CAM','SIM-CT',90,2],['SIM-F004','SIM-POL','SIM-CT',108,1],['SIM-F004','SIM-CAL','SIM-CT',110,2],
    ['SIM-F005','SIM-CAM','SIM-RV',30,2],['SIM-F005','SIM-POL','SIM-RV',38,2],['SIM-F005','SIM-CAL','SIM-RV',34,3],
    ['SIM-F006','SIM-CAM','SIM-EM',24,3],['SIM-F006','SIM-POL','SIM-EM',28,2],['SIM-F006','SIM-CAL','SIM-EM',27,2]
  ].map(([funcionario,produto,processo,segundos,nivel],i)=>({id:'t'+(i+1),funcionario,produto,processo,segundos,nivel,alteradoEm:'2026-11-01'})),
  lancamentos: [
    ['2026-11-03','SIM-F001','SIM-CAM','SIM-FL','08:00','09:00',68],
    ['2026-11-03','SIM-F002','SIM-CAM','SIM-FL','08:00','09:00',72],
    ['2026-11-03','SIM-F003','SIM-CAM','SIM-FL','08:00','09:00',84],
    ['2026-11-03','SIM-F004','SIM-CAM','SIM-CT','08:00','09:00',39],
    ['2026-11-03','SIM-F005','SIM-CAM','SIM-RV','08:00','09:00',115],
    ['2026-11-03','SIM-F006','SIM-CAM','SIM-EM','08:00','09:00',148],
    ['2026-11-04','SIM-F001','SIM-CAM','SIM-PM','08:00','09:00',48],
    ['2026-11-04','SIM-F002','SIM-CAM','SIM-PM','09:00','10:00',59],
    ['2026-11-04','SIM-F003','SIM-CAM','SIM-PM','09:00','10:00',69],
    ['2026-11-04','SIM-F004','SIM-POL','SIM-CT','08:00','09:00',35],
    ['2026-11-04','SIM-F005','SIM-CAM','SIM-RV','10:00','11:00',124],
    ['2026-11-04','SIM-F006','SIM-CAM','SIM-EM','10:00','10:45',120],
    ['2026-11-04','SIM-F001','SIM-CAL','SIM-BR','10:00','11:00',52],
    ['2026-11-05','SIM-F001','SIM-CAM','SIM-FL','08:00','09:00',75],
    ['2026-11-05','SIM-F002','SIM-CAM','SIM-FL','08:00','09:00',76],
    ['2026-11-05','SIM-F003','SIM-CAM','SIM-FL','08:00','09:00',95],
    ['2026-11-05','SIM-F004','SIM-CAL','SIM-CT','08:00','09:00',31],
    ['2026-11-05','SIM-F005','SIM-CAL','SIM-RV','08:00','09:00',108],
    ['2026-11-05','SIM-F006','SIM-CAL','SIM-EM','09:00','10:00',128],
    ['2026-11-05','SIM-F002','SIM-POL','SIM-FL','09:00','10:00',54],
    ['2026-11-06','SIM-F001','SIM-CAM','SIM-FL','08:00','08:40',54],
    ['2026-11-06','SIM-F002','SIM-CAM','SIM-FL','08:00','08:45',57],
    ['2026-11-06','SIM-F003','SIM-CAM','SIM-FL','08:00','09:00',95],
    ['2026-11-06','SIM-F004','SIM-CAM','SIM-CT','08:00','09:00',43],
    ['2026-11-06','SIM-F005','SIM-CAM','SIM-RV','08:00','09:00',126],
    ['2026-11-06','SIM-F006','SIM-CAM','SIM-EM','08:00','09:00',160],
    ['2026-11-06','SIM-F003','SIM-POL','SIM-FL','09:00','10:00',58]
  ].map(([data,funcionario,produto,processo,inicio,fim,realizado],i)=>({id:i+1,data,funcionario,produto,processo,inicio,fim,realizado,metaSnapshot:null,tempoSnapshot:null,nivelSnapshot:null}))
};
