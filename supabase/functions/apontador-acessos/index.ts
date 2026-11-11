// FACSIM Apontador — criação de logins e troca de senha.
// A chave service-role existe só aqui, como variável de ambiente da própria Supabase (nunca no navegador).
// Quem pode: o dono da plataforma (qualquer empresa) ou o administrador da empresa (só a dele).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const PERFIS = ["admin", "editor", "leitor"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") ?? "";
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    const { data: me, error: meErr } = await caller.auth.getUser();
    if (meErr || !me?.user?.email) return json({ error: "Sessão inválida. Entre novamente." }, 401);
    // A mesma regra do banco decide o que essa pessoa pode gerenciar
    const { data: escopo, error: escErr } = await caller.rpc("apontador_acessos_listar");
    if (escErr) return json({ error: escErr.message }, 403);
    const dono = !!escopo?.dono;
    const permitidas = new Set<string>((escopo?.empresas ?? []).map((e: { id: string }) => String(e.id)));

    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao ?? "");
    const email = String(body.email ?? "").trim().toLowerCase();
    const senha = String(body.senha ?? "");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Informe um e-mail válido." }, 400);
    if (senha && senha.length < 8) return json({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);

    const { data: atual } = await admin.from("apontador_acessos").select("email,empresa_id,dono_plataforma").eq("email", email).maybeSingle();

    if (acao === "criar") {
      const empresa = String(body.empresa ?? escopo?.minhaEmpresa ?? "");
      const perfil = PERFIS.includes(body.perfil) ? body.perfil : "leitor";
      const nome = String(body.nome ?? "").trim() || null;
      if (!permitidas.has(empresa)) return json({ error: "Sem permissão para cadastrar nesta empresa." }, 403);
      if (!senha) return json({ error: "Defina uma senha inicial." }, 400);
      if (atual && String(atual.empresa_id) !== empresa) return json({ error: "Este e-mail já tem acesso em outra empresa." }, 409);

      let novo = true;
      const { error: cErr } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
      if (cErr) {
        if (!/already|registered|exists/i.test(cErr.message)) return json({ error: cErr.message }, 400);
        novo = false; // conta já existia no Auth: só libera o acesso, sem trocar a senha
      }
      const { error: aErr } = await admin.from("apontador_acessos")
        .upsert({ email, empresa_id: Number(empresa), perfil, nome, ativo: true }, { onConflict: "email" });
      if (aErr) return json({ error: aErr.message }, 400);
      return json({ ok: true, novo, aviso: novo ? null : "O e-mail já tinha conta: o acesso foi liberado e a senha antiga foi mantida." });
    }

    if (acao === "senha") {
      if (!senha) return json({ error: "Informe a nova senha." }, 400);
      if (!atual || !permitidas.has(String(atual.empresa_id))) return json({ error: "Usuário fora da sua gestão." }, 403);
      if (atual.dono_plataforma && email !== me.user.email.toLowerCase()) return json({ error: "A senha do dono da plataforma só ele mesmo troca." }, 403);
      if (!dono && !permitidas.has(String(atual.empresa_id))) return json({ error: "Sem permissão." }, 403);
      let id: string | null = null;
      for (let page = 1; page <= 20 && !id; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) return json({ error: error.message }, 400);
        id = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
        if (data.users.length < 200) break;
      }
      if (!id) return json({ error: "Este e-mail ainda não tem conta. Use “Novo usuário”." }, 404);
      const { error: uErr } = await admin.auth.admin.updateUserById(id, { password: senha });
      if (uErr) return json({ error: uErr.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? "Erro inesperado." }, 500);
  }
});
