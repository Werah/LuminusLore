// Configuração do Supabase. Pegue os valores no painel do Supabase:
//   Project Settings → API (ou "Data API" / "API Keys")
//
// A chave aqui é a pública ("anon public" ou "publishable"). Ela pode ficar no código:
// quem protege os dados são as regras de segurança do banco (supabase/schema.sql).
// NUNCA coloque aqui a chave "service_role" / "secret".

// Se algum script do site der erro (ex.: faltou uma vírgula em js/secoes.js), mostra no topo
// da página um aviso com o arquivo e a linha, em vez de deixar a tela vazia.
// (Fica aqui porque este é o primeiro arquivo do site que toda página carrega.)
window.addEventListener('error', e => {
  if (document.querySelector('.aviso-erro')) return; // só o primeiro erro
  const aviso = document.createElement('div');
  aviso.className = 'aviso-config aviso-erro';
  const onde = e.filename ? ` — ${e.filename.split('/').pop()}, linha ${e.lineno}` : '';
  aviso.textContent = `Erro no site: ${e.message}${onde}`;
  if (document.body) document.body.prepend(aviso);
  else document.addEventListener('DOMContentLoaded', () => document.body.prepend(aviso));
});

const CONFIG = {
  supabaseUrl: 'https://wsxtgrowjoczpiwlppov.supabase.co',
  supabaseAnonKey: 'sb_publishable_MKIvtJT8apxhba1610d-sw_Pd9ro34Y',
};
