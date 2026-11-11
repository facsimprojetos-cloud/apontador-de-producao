/* FACSIM Apontador — cliente Supabase. Somente a chave PUBLICÁVEL é usada aqui.
 * As políticas RLS e a lista de usuários autorizados protegem os registros.
 */
(() => {
  'use strict';
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    window.GUT_API_ERROR = 'Biblioteca Supabase não carregou. Verifique sua conexão com a internet.';
    return;
  }
  const client = window.supabase.createClient(
    'https://swledaccsxcqpffjvtdh.supabase.co',
    "sb_publishable_CP90sN-553zB3BfUW05NTA_S5ZVPNrP",
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
  );
  const unwrap = ({data,error}) => {
    if (error) throw new Error(error.message || 'Falha de comunicação com o Supabase.');
    return data;
  };
  window.GUT_API = {
    async session() { return unwrap(await client.auth.getSession()).session; },
    async login(email, password) { return unwrap(await client.auth.signInWithPassword({email,password})); },
    async logout() { return unwrap(await client.auth.signOut()); },
    async load() { return unwrap(await client.rpc('apontador_carregar',{})); },
    async save(type, payload) { return unwrap(await client.rpc('apontador_salvar',{p_tipo:type,p_dados:payload})); },
    async preview(payload) { return unwrap(await client.rpc('apontador_previa',{p_dados:payload})); },
    async bonus(mes) { return unwrap(await client.rpc('apontador_bonificacao',{p_mes:mes})); },
    async bonusSave(type, payload) { return unwrap(await client.rpc('apontador_bonificacao_salvar',{p_tipo:type,p_dados:payload})); },
    async ausencia(type, payload) { return unwrap(await client.rpc('apontador_ausencia_salvar',{p_tipo:type,p_dados:payload})); },
    /* sessão única por login: a primeira máquina fica, a segunda é recusada */
    async sessaoIniciar(info) { return unwrap(await client.rpc('apontador_sessao_iniciar',{p_info:info||null})); },
    async sessaoPing() { return unwrap(await client.rpc('apontador_sessao_ping',{})); },
    async sessaoEncerrar() { return unwrap(await client.rpc('apontador_sessao_encerrar',{})); },
    async acessos() { return unwrap(await client.rpc('apontador_acessos_listar',{})); },
    async empresaSave(payload) { return unwrap(await client.rpc('apontador_empresa_salvar',{p_dados:payload})); },
    async acessoSave(payload) { return unwrap(await client.rpc('apontador_acesso_salvar',{p_dados:payload})); },
    async importar(payload) { return unwrap(await client.rpc('apontador_importar',{p_dados:payload})); },
    /* criação de login e troca de senha: Edge Function (a chave secreta fica só no servidor) */
    async acessoFn(body) {
      const { data, error } = await client.functions.invoke('apontador-acessos', { body });
      if (error) {
        let msg = error.message;
        try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (_) {}
        throw new Error(msg || 'Falha ao falar com o servidor de acessos.');
      }
      if (data?.error) throw new Error(data.error);
      return data;
    }
  };
})();
