// Conexão com o Supabase (banco + login + imagens).
// As páginas chamam banco.listarArtigos('mundo'), banco.salvarArtigo(...) etc.,
// e aqui isso vira consultas no Supabase.

const configOk = !!CONFIG.supabaseUrl && !CONFIG.supabaseUrl.includes('SEU-PROJETO')
  && !!CONFIG.supabaseAnonKey && !CONFIG.supabaseAnonKey.includes('COLE-AQUI');

const sb = configOk ? supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey) : null;

// Sessão salva no navegador (o Supabase guarda e renova sozinho)
const sessaoPronta = sb ? sb.auth.getSession().then(r => r.data.session) : Promise.resolve(null);

if (!configOk) {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('afterbegin',
      '<div class="aviso-config">Falta configurar o Supabase em <code>js/config.js</code> (veja o README).</div>');
  });
}

// ---------- Login ----------

// Cada amigo tem o próprio login. Além de existir no Supabase (Authentication → Users),
// o e-mail precisa estar na tabela "membros" (veja o README).
async function entrar(email, senha) {
  if (!sb) throw new Error('Supabase não configurado');
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
  if (error) throw new Error('E-mail ou senha incorretos');
  const { data: membro } = await sb.rpc('eh_membro');
  if (!membro) {
    await sb.auth.signOut();
    throw new Error('Sua conta ainda não foi liberada. Peça para quem cuida do site te adicionar.');
  }
}

// Chamar no topo de toda página que precisa de login
function exigirLogin() {
  sessaoPronta.then(sessao => {
    if (!sessao) window.location.href = 'index.html';
  });
}

async function sair() {
  if (sb) await sb.auth.signOut();
  window.location.href = 'index.html';
}

async function emailAtual() {
  const sessao = await sessaoPronta;
  return (sessao?.user?.email || '').toLowerCase();
}

async function trocarSenha(nova) {
  const { error } = await sb.auth.updateUser({ password: nova });
  if (!error) return;
  if (error.code === 'same_password') throw new Error('A nova senha é igual à atual');
  if (error.code === 'weak_password') throw new Error('Senha fraca demais (use pelo menos 6 caracteres)');
  throw new Error(error.message || 'Não foi possível trocar a senha');
}

// Tudo daqui pra baixo fica isolado dentro desta função, para os nomes internos
// não colidirem com funções das páginas. Só o objeto "banco" fica visível.
const banco = (() => {
  // ---------- Conversões ----------

  // atualizado_em -> atualizadoEm
  const paraCampo = coluna => coluna.replace(/_([a-z])/g, (_, l) => l.toUpperCase());

  function doBanco(linha) {
    const obj = {};
    for (const [coluna, valor] of Object.entries(linha)) obj[paraCampo(coluna)] = valor;
    return obj;
  }

  // Transforma o erro do Supabase numa mensagem que dá pra mostrar
  function erroAmigavel(error) {
    if (error.code === '23505') return 'Já existe um texto com esse título';
    if (error.code === '23514') return 'Preencha os campos obrigatórios';
    if (error.code === '42501') return 'Sem permissão. Saia e entre de novo.';
    if (/jwt/i.test(error.message || '')) {
      sair();
      return 'Sessão expirada';
    }
    return error.message || 'Erro inesperado';
  }

  // Executa uma consulta do Supabase e já trata o erro
  async function rodar(consulta) {
    const { data, error } = await consulta;
    if (error) throw new Error(erroAmigavel(error));
    return data;
  }

  function de(tabela) {
    if (!sb) throw new Error('Supabase não configurado (js/config.js)');
    return sb.from(tabela);
  }

  // ---------- Textos ----------

  const texto = v => String(v ?? '').trim();

  // Pega só os campos válidos de um texto (os extras de "detalhes" vêm de SECOES)
  function limparArtigo(b) {
    const secao = SECOES[b.secao] ? b.secao : '';
    if (!secao) throw new Error('Seção inválida');
    const detalhes = {};
    for (const campo of SECOES[secao].campos) {
      const valor = texto(b.detalhes?.[campo.chave]);
      if (valor) detalhes[campo.chave] = valor;
    }
    const dados = {
      secao,
      titulo: texto(b.titulo).replace(/\s+/g, ' '),
      subtitulo: texto(b.subtitulo),
      conteudo: String(b.conteudo ?? '').replace(/\s+$/, ''),
      detalhes,
      // "imagem" fica de fora: só é trocada pelas funções de imagem
    };
    if (!dados.titulo) throw new Error('Título é obrigatório');
    if (/[[\]|]/.test(dados.titulo)) throw new Error('O título não pode ter [ ] ou |');
    return dados;
  }

  // Todos os títulos, para montar os links [[Título]]: mapa título em minúsculas -> { id, titulo, secao }
  async function titulos() {
    const linhas = await rodar(de('artigos').select('id, titulo, secao'));
    return new Map(linhas.map(l => [l.titulo.toLowerCase(), l]));
  }

  async function listarArtigos(secao) {
    return (await rodar(de('artigos').select('*').eq('secao', secao).order('titulo'))).map(doBanco);
  }

  async function buscarArtigo(id) {
    const linha = await rodar(de('artigos').select('*').eq('id', id).maybeSingle());
    if (!linha) throw new Error('Esse texto não existe (foi excluído?)');
    return doBanco(linha);
  }

  async function criarArtigo(corpo) {
    const linha = await rodar(de('artigos').insert(limparArtigo(corpo)).select('id').single());
    return buscarArtigo(linha.id);
  }

  // "versao" é o atualizadoEm de quando a pessoa abriu o editor.
  // Se outra pessoa salvou nesse meio-tempo, não sobrescreve o texto dela.
  async function salvarArtigo(id, corpo, versao) {
    const linhas = await rodar(de('artigos').update(limparArtigo(corpo))
      .eq('id', id).eq('atualizado_em', versao).select('id'));
    if (!linhas.length) {
      throw new Error('Alguém salvou este texto enquanto você editava. Copie o que escreveu, recarregue a página e junte as mudanças.');
    }
    return buscarArtigo(id);
  }

  async function excluirArtigo(id) {
    const a = await buscarArtigo(id);
    // O histórico do texto é apagado junto pelo banco
    await rodar(de('artigos').delete().eq('id', id));
    await apagarArquivos([a.imagem]);
  }

  // Versões anteriores de um texto, da mais nova para a mais antiga
  async function revisoes(artigoId) {
    const linhas = await rodar(de('revisoes').select('*').eq('artigo_id', artigoId).order('editado_em', { ascending: false }));
    return linhas.map(doBanco);
  }

  // Outros textos que têm um link [[titulo]] (ou [[titulo|...]]) para este
  async function mencoes(titulo, id) {
    const busca = titulo.replace(/[\\%_]/g, c => '\\' + c);
    const linhas = await rodar(de('artigos').select('id, titulo, secao, conteudo')
      .ilike('conteudo', `%${busca}%`).neq('id', id).order('titulo'));
    const alvo = titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const link = new RegExp(`\\[\\[\\s*${alvo}\\s*(\\||\\]\\])`, 'i');
    return linhas.filter(l => link.test(l.conteudo));
  }

  // ---------- Membros ----------

  // Nome de cada membro, para mostrar quem escreveu: mapa e-mail -> nome
  let nomesCarregando = null;
  function nomes() {
    if (!nomesCarregando) {
      nomesCarregando = rodar(de('membros').select('email, nome'))
        .then(linhas => new Map(linhas.map(m => [m.email.toLowerCase(), m.nome])))
        .catch(e => { nomesCarregando = null; throw e; });
    }
    return nomesCarregando;
  }

  // ---------- Imagens (Supabase Storage, bucket "imagens") ----------

  function urlImagem(arquivo) {
    return `${CONFIG.supabaseUrl}/storage/v1/object/public/imagens/${encodeURIComponent(arquivo)}`;
  }

  async function apagarArquivos(arquivos) {
    const lista = arquivos.filter(Boolean);
    if (lista.length) await sb.storage.from('imagens').remove(lista); // se falhar, só sobra um arquivo solto
  }

  // Recebe a imagem já redimensionada no navegador (data URL)
  async function trocarImagem(id, dataUrl) {
    const item = await buscarArtigo(id);
    const blob = await (await fetch(dataUrl)).blob();
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    // Nome muda a cada envio, então o navegador nunca mostra a imagem antiga do cache
    const arquivo = `${id}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    await rodar(sb.storage.from('imagens').upload(arquivo, blob, { contentType: blob.type, cacheControl: '31536000' }));
    await rodar(de('artigos').update({ imagem: arquivo }).eq('id', id));
    await apagarArquivos([item.imagem]);
  }

  async function removerImagem(id) {
    const item = await buscarArtigo(id);
    await rodar(de('artigos').update({ imagem: '' }).eq('id', id));
    await apagarArquivos([item.imagem]);
  }

  return {
    titulos, listarArtigos, buscarArtigo, criarArtigo, salvarArtigo, excluirArtigo,
    revisoes, mencoes, nomes, urlImagem, trocarImagem, removerImagem,
  };
})();
