-- apontador_eh_admin lê o próprio cadastro (acessos + empresa de origem). Como SECURITY INVOKER,
-- o isolamento por empresa escondia a empresa de origem quando o dono da plataforma visitava
-- outra empresa, bloqueando Bonificação, importação, salários e faltas.
ALTER FUNCTION public.apontador_eh_admin() SECURITY DEFINER;
