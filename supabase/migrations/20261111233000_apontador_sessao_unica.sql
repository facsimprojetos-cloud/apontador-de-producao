-- Um login = uma máquina por vez. Vale a PRIMEIRA sessão: enquanto ela estiver em uso
-- (sinal de vida nos últimos 3 minutos), outra entrada com o mesmo login é recusada.
-- O banco só entrega dados para a sessão registrada (auth.jwt() ->> 'session_id').
ALTER TABLE public.apontador_acessos
  ADD COLUMN IF NOT EXISTS sessao_id text,
  ADD COLUMN IF NOT EXISTS sessao_visto timestamptz,
  ADD COLUMN IF NOT EXISTS sessao_info text;

CREATE OR REPLACE FUNCTION public.apontador_empresa_atual()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT a.empresa_id FROM public.apontador_acessos a JOIN public.empresas e ON e.id=a.empresa_id AND e.ativo
   WHERE a.ativo AND a.email = lower((SELECT auth.jwt()->>'email'))
     AND (SELECT auth.uid()) IS NOT NULL AND coalesce((SELECT auth.jwt()->>'is_anonymous'),'false') <> 'true'
     AND a.sessao_id IS NOT DISTINCT FROM (SELECT auth.jwt()->>'session_id')
   LIMIT 1
$$;

-- Entrar: registra a sessão se o login estiver livre (ou parado há mais de 3 minutos)
CREATE OR REPLACE FUNCTION public.apontador_sessao_iniciar(p_info text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_email text := lower((SELECT auth.jwt()->>'email')); v_sid text := (SELECT auth.jwt()->>'session_id'); v_a public.apontador_acessos;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR v_sid IS NULL THEN RAISE EXCEPTION 'Sessão inválida. Entre novamente.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_a FROM public.apontador_acessos WHERE email = v_email AND ativo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Acesso não autorizado ao Apontador de Produção.' USING ERRCODE='42501'; END IF;
  IF v_a.sessao_id IS NOT NULL AND v_a.sessao_id <> v_sid AND v_a.sessao_visto > now() - interval '3 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'em_uso',
      'mensagem', 'Este acesso já está sendo utilizado em outro dispositivo'||coalesce(' ('||v_a.sessao_info||')','')||
                  '. Saia do outro dispositivo, aguarde alguns minutos ou peça ao administrador para liberar. Cada pessoa precisa do seu próprio acesso.');
  END IF;
  UPDATE public.apontador_acessos SET sessao_id = v_sid, sessao_visto = now(), sessao_info = left(nullif(btrim(p_info),''),80) WHERE email = v_email;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Sinal de vida (a cada minuto). Devolve false se esta sessão não é mais a registrada.
CREATE OR REPLACE FUNCTION public.apontador_sessao_ping() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  UPDATE public.apontador_acessos SET sessao_visto = now()
   WHERE email = lower((SELECT auth.jwt()->>'email')) AND ativo AND sessao_id = (SELECT auth.jwt()->>'session_id');
  RETURN FOUND;
END $$;

-- Sair: libera o login para outra máquina
CREATE OR REPLACE FUNCTION public.apontador_sessao_encerrar() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  UPDATE public.apontador_acessos SET sessao_id = NULL, sessao_visto = NULL, sessao_info = NULL
   WHERE email = lower((SELECT auth.jwt()->>'email')) AND sessao_id = (SELECT auth.jwt()->>'session_id');
$$;

REVOKE ALL ON FUNCTION public.apontador_sessao_iniciar(text), public.apontador_sessao_ping(), public.apontador_sessao_encerrar() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apontador_sessao_iniciar(text), public.apontador_sessao_ping(), public.apontador_sessao_encerrar() TO authenticated;

-- Administrador pode liberar a sessão presa de um usuário (opção "liberarSessao")
CREATE OR REPLACE FUNCTION public.apontador_acesso_salvar(p_dados jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_email text := lower(btrim(p_dados->>'email')); v_eu text := lower((SELECT auth.jwt()->>'email')); v_alvo public.apontador_acessos;
BEGIN
  SELECT * INTO v_alvo FROM public.apontador_acessos WHERE email=v_email;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
  IF NOT (public.apontador_dono_plataforma() OR (public.apontador_eh_admin() AND v_alvo.empresa_id = public.apontador_empresa_atual())) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este usuário.' USING ERRCODE='42501';
  END IF;
  IF v_email = v_eu AND (coalesce(p_dados->>'perfil','admin') <> 'admin' OR (p_dados->>'ativo')::boolean IS FALSE) THEN
    RAISE EXCEPTION 'Você não pode tirar o seu próprio acesso de administrador.';
  END IF;
  IF v_alvo.dono_plataforma AND v_email <> v_eu THEN RAISE EXCEPTION 'O dono da plataforma só pode ser alterado por ele mesmo.'; END IF;
  UPDATE public.apontador_acessos SET
     perfil = CASE WHEN p_dados->>'perfil' IN ('admin','editor','leitor') THEN p_dados->>'perfil' ELSE perfil END,
     nome = CASE WHEN p_dados ? 'nome' THEN nullif(btrim(p_dados->>'nome'),'') ELSE nome END,
     ativo = coalesce((p_dados->>'ativo')::boolean, ativo),
     sessao_id = CASE WHEN coalesce((p_dados->>'liberarSessao')::boolean,false) OR (p_dados->>'ativo')::boolean IS FALSE THEN NULL ELSE sessao_id END,
     sessao_visto = CASE WHEN coalesce((p_dados->>'liberarSessao')::boolean,false) OR (p_dados->>'ativo')::boolean IS FALSE THEN NULL ELSE sessao_visto END
   WHERE email=v_email;
  RETURN jsonb_build_object('ok',true,'email',v_email);
END $$;

-- Listagem mostra se o usuário está conectado agora
CREATE OR REPLACE FUNCTION public.apontador_acessos_listar() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_dono boolean := public.apontador_dono_plataforma(); v_emp bigint := public.apontador_empresa_atual();
BEGIN
  IF NOT v_dono AND NOT public.apontador_eh_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem gerenciar acessos.' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('dono', v_dono, 'minhaEmpresa', v_emp::text, 'empresas', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id::text,'nome',e.nome,'documento',e.documento,'ativo',e.ativo,'criadaEm',e.created_at,
      'plataforma',e.plataforma,'limite',e.limite_usuarios,
      'ativos',(SELECT count(*) FROM public.apontador_acessos a WHERE a.empresa_id=e.id AND a.ativo),
      'funcionarios',(SELECT count(*) FROM "APONTADOR DE PRODUÇÃO".funcionarios f WHERE f.empresa_id=e.id),
      'lancamentos',(SELECT count(*) FROM "APONTADOR DE PRODUÇÃO"."Lançamentos" l WHERE l.empresa_id=e.id),
      'usuarios',(SELECT coalesce(jsonb_agg(jsonb_build_object('email',a.email,'nome',a.nome,'perfil',a.perfil,'ativo',a.ativo,'dono',a.dono_plataforma,
                    'online', a.sessao_id IS NOT NULL AND a.sessao_visto > now() - interval '3 minutes', 'dispositivo', a.sessao_info, 'vistoEm', a.sessao_visto) ORDER BY a.perfil, a.email),'[]'::jsonb)
                  FROM public.apontador_acessos a WHERE a.empresa_id=e.id)) ORDER BY e.plataforma DESC, e.id),'[]'::jsonb)
      FROM public.empresas e WHERE v_dono OR e.id = v_emp));
END $$;
