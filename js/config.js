// Configuração do Supabase. Pegue os valores no painel do Supabase:
//   Project Settings → API (ou "Data API" / "API Keys")
//
// A chave aqui é a pública ("anon public" ou "publishable"). Ela pode ficar no código:
// quem protege os dados são as regras de segurança do banco (supabase/schema.sql).
// NUNCA coloque aqui a chave "service_role" / "secret".

const CONFIG = {
  supabaseUrl: 'https://wsxtgrowjoczpiwlppov.supabase.co',
  supabaseAnonKey: 'sb_publishable_MKIvtJT8apxhba1610d-sw_Pd9ro34Y',
};
