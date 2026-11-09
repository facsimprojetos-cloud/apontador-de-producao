/* GUT Apontador — cliente Supabase. Somente a chave PUBLICÁVEL é usada aqui.
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
    async preview(payload) { return unwrap(await client.rpc('apontador_previa',{p_dados:payload})); }
  };
})();
