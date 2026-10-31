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

// ---------- Visitante (só leitura) ----------

// "Entrar como visitante" não faz login: só marca o navegador. O visitante lê pelas vitrines
// do banco (artigos_publico, revisoes_publico) e o banco não deixa ele mudar nada.
// A classe "visitante" no <html> esconde os botões de edição (css/style.css).
const CHAVE_VISITANTE = 'luminus-visitante';
let ehVisitante = false;
try {
  ehVisitante = localStorage.getItem(CHAVE_VISITANTE) === '1';
} catch {
  // Sem armazenamento: não dá para ser visitante (precisa entrar com conta)
}
if (ehVisitante) document.documentElement.classList.add('visitante');

async function entrarComoVisitante() {
  if (sb) await sb.auth.signOut();
  localStorage.setItem(CHAVE_VISITANTE, '1');
}

function deixarDeSerVisitante() {
  try {
    localStorage.removeItem(CHAVE_VISITANTE);
  } catch {
    // Nada a fazer
  }
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
  deixarDeSerVisitante();
}

// Chamar no topo de toda página que precisa de login (visitante também passa)
function exigirLogin() {
  sessaoPronta.then(sessao => {
    if (!sessao && !ehVisitante) window.location.href = 'index.html';
  });
}

// Membros saem da conta; o visitante volta para a tela de login (para entrar com conta)
async function sair() {
  deixarDeSerVisitante();
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
    if (error.code === '23505') return 'Já existe um texto com esse título (só um país e um outro texto podem ter o mesmo nome)';
    if (error.code === '23514' && /secao_check/.test(error.message || '')) {
      return 'O banco ainda não conhece esta seção: rode o arquivo supabase/schema.sql de novo no SQL Editor do Supabase.';
    }
    if (error.code === '23514') return 'Preencha os campos obrigatórios';
    if (error.code === '42501') return 'Sem permissão. Saia e entre de novo.';
    // Coluna que o site usa mas o banco não tem: o schema.sql novo ainda não foi rodado
    if (error.code === '42703' || error.code === 'PGRST204') {
      return 'O banco está desatualizado: rode o arquivo supabase/schema.sql de novo no SQL Editor do Supabase.';
    }
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

  // O visitante lê pelas vitrines (sem os e-mails); as tabelas de verdade nem respondem para ele
  const VITRINE = { artigos: 'artigos_publico', revisoes: 'revisoes_publico' };

  function de(tabela) {
    if (!sb) throw new Error('Supabase não configurado (js/config.js)');
    return sb.from(ehVisitante ? VITRINE[tabela] || tabela : tabela);
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
      if (!valor) continue;
      if (campo.numero && !Number.isFinite(Number(valor.replace(',', '.')))) throw new Error(`${campo.rotulo} precisa ser um número`);
      detalhes[campo.chave] = campo.numero ? String(Number(valor.replace(',', '.'))) : valor;
    }
    // Campo que só vale com outro valor (ex.: Inventário só para personagem de jogador) não é guardado à toa
    for (const campo of SECOES[secao].campos) {
      if (!campoVisivel(campo, detalhes)) delete detalhes[campo.chave];
    }
    const dados = {
      secao,
      titulo: texto(b.titulo).replace(/\s+/g, ' '),
      subtitulo: texto(b.subtitulo),
      conteudo: String(b.conteudo ?? '').replace(/\s+$/, ''),
      detalhes,
      pais_id: b.paisId ? String(b.paisId) : null, // texto do país a que pertence (null = região neutra)
      // "imagem" e o ponto no mapa ficam de fora: são trocados pelas funções deles
    };
    if (!dados.titulo) throw new Error('Título é obrigatório');
    if (/[[\]|]/.test(dados.titulo)) throw new Error('O título não pode ter [ ] ou |');
    return dados;
  }

  // Todos os títulos, para montar os links [[Título]]: mapa "como se escreve no link" (em minúsculas)
  // -> { id, titulo, secao, pais, link }. Um país pode ter o mesmo nome de outro texto (ex.: a capital):
  //   [[Azraq]]        o outro texto (ou o país, se não tiver outro com esse nome)
  //   [[Azraq (país)]] sempre o país
  // "link" é o que vai entre [[ ]] para chegar neste texto.
  async function titulos() {
    const linhas = await rodar(de('artigos').select('id, titulo, secao, mapa_icone'));
    const mapa = new Map();
    const comuns = new Set(linhas.filter(l => l.mapa_icone !== ICONE_PAIS).map(l => l.titulo.toLowerCase()));
    for (const l of linhas) {
      const nome = l.titulo.toLowerCase();
      const pais = l.mapa_icone === ICONE_PAIS;
      const homonimo = pais && comuns.has(nome);
      const item = { id: l.id, titulo: l.titulo, secao: l.secao, pais, link: homonimo ? `${l.titulo} (país)` : l.titulo };
      if (pais) mapa.set(`${nome} (país)`, item);
      if (!homonimo) mapa.set(nome, item);
    }
    return mapa;
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

  // Texto de apresentação de uma seção (ver "introducao" em secoes.js): endereço fixo intro-<seção>
  const idIntroducao = secao => `intro-${secao}`;
  async function criarIntroducao(secao, titulo) {
    const id = idIntroducao(secao);
    await rodar(de('artigos').insert({ ...limparArtigo({ secao, titulo, detalhes: {} }), id }));
    return id;
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

  // O banco guarda uma cópia completa no histórico antes de excluir, e o histórico fica.
  // A imagem também fica no Storage, para voltar junto se o texto for restaurado.
  async function excluirArtigo(id) {
    await rodar(de('artigos').delete().eq('id', id));
  }

  // Textos excluídos de uma seção (a cópia mais recente de cada um), para restaurar
  async function excluidos(secao) {
    if (ehVisitante) return []; // visitante não restaura nada
    const [linhas, existentes] = await Promise.all([
      rodar(de('revisoes').select('id, artigo_id, titulo, excluido_por, excluido_em, linha')
        .eq('excluido', true).order('excluido_em', { ascending: false })),
      titulos(),
    ]);
    const ids = new Set([...existentes.values()].map(t => t.id));
    const vistos = new Set();
    return linhas.map(doBanco).filter(r => {
      if (r.linha?.secao !== secao || ids.has(r.artigoId) || vistos.has(r.artigoId)) return false;
      vistos.add(r.artigoId);
      return true;
    });
  }

  // Devolve o id do texto restaurado
  async function restaurarExcluido(revisaoId) {
    if (!sb) throw new Error('Supabase não configurado (js/config.js)');
    return rodar(sb.rpc('restaurar_texto', { revisao: revisaoId }));
  }

  // Versões anteriores de um texto, da mais nova para a mais antiga
  async function revisoes(artigoId) {
    const linhas = await rodar(de('revisoes').select('*').eq('artigo_id', artigoId).order('editado_em', { ascending: false }));
    return linhas.map(doBanco);
  }

  // Outros textos que têm um link para este. "jeitos" são as formas de escrever o link que chegam
  // neste texto (as chaves de titulos() com o id dele, ex.: ["azraq (país)", "azraq"]).
  async function mencoes(titulo, id, jeitos) {
    const busca = titulo.replace(/[\\%_]/g, c => '\\' + c);
    const linhas = await rodar(de('artigos').select('id, titulo, secao, conteudo')
      .ilike('conteudo', `%${busca}%`).neq('id', id).order('titulo'));
    const alvos = (jeitos?.length ? jeitos : [titulo]).map(j => j.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const link = new RegExp(`\\[\\[\\s*(${alvos.join('|')})\\s*(\\||\\]\\])`, 'i');
    return linhas.filter(l => link.test(l.conteudo));
  }

  // ---------- Mapa ----------

  // Textos que têm ponto no mapa (de qualquer seção)
  async function pontosDoMapa() {
    const linhas = await rodar(de('artigos').select('id, titulo, subtitulo, secao, pais_id, mapa_x, mapa_y, mapa_cor, mapa_icone')
      .not('mapa_x', 'is', null).not('mapa_y', 'is', null));
    return linhas.map(doBanco);
  }

  // Países: os textos cujo ponto no mapa tem o ícone de estrela. "cor" já é a cor que os pontos herdam.
  async function paises() {
    const linhas = await rodar(de('artigos').select('id, titulo, secao, mapa_cor')
      .eq('mapa_icone', 'estrela').not('mapa_x', 'is', null).order('titulo'));
    return linhas.map(l => ({ id: l.id, titulo: l.titulo, cor: l.mapa_cor || SECOES[l.secao].cor }));
  }

  // ---------- Líderes ----------

  // A busca vai ao banco (com tantos personagens, não dá para carregar a lista toda)
  const padraoBusca = termo => `%${termo.trim().replace(/[\\%_]/g, c => '\\' + c)}%`;

  // Personagens cujo nome tem o termo (para o campo "Líder")
  async function buscarPersonagens(termo) {
    const linhas = await rodar(de('artigos').select('id, titulo, subtitulo')
      .eq('secao', 'personagens').ilike('titulo', padraoBusca(termo)).order('titulo').limit(8));
    return linhas.map(doBanco);
  }

  // Países, cidades, vilas e organizações cujo nome tem o termo (para o "Líder de" do personagem)
  async function buscarLideraveis(termo) {
    const linhas = await rodar(de('artigos').select('id, titulo, secao, detalhes, mapa_icone, lider_id')
      .in('secao', ['mundo', 'organizacoes']).ilike('titulo', padraoBusca(termo)).order('titulo').limit(30));
    return linhas.map(doBanco).filter(cargoDeLider).slice(0, 8);
  }

  // O que este personagem lidera
  async function liderados(personagemId) {
    const linhas = await rodar(de('artigos').select('id, titulo, secao, detalhes, mapa_icone')
      .eq('lider_id', personagemId).order('titulo'));
    return linhas.map(doBanco);
  }

  // Põe (ou, com null, tira) o líder de um lugar/organização. Não conta como edição do texto.
  async function definirLider(id, personagemId) {
    await rodar(de('artigos').update({ lider_id: personagemId || null }).eq('id', id));
  }

  // Textos que pertencem a um país (para a ficha do país)
  async function lugaresDoPais(paisId) {
    const linhas = await rodar(de('artigos').select('id, titulo, secao, detalhes, mapa_icone').eq('pais_id', paisId).order('titulo'));
    return linhas.map(doBanco);
  }

  // ---------- Capital ----------

  // Põe (ou, com null, tira) a capital de um país. Não conta como edição do texto.
  async function definirCapital(paisId, capitalId) {
    await rodar(de('artigos').update({ capital_id: capitalId || null }).eq('id', paisId));
  }

  // Países de que este texto é a capital (normalmente um só)
  async function capitalDe(id) {
    return (await rodar(de('artigos').select('id, titulo').eq('capital_id', id).order('titulo'))).map(doBanco);
  }

  // Coloca, move ou (com x/y null) tira o texto do mapa. x/y em fração da imagem (0 a 1).
  async function posicionar(id, x, y) {
    const dentro = v => (v === null ? null : Math.min(1, Math.max(0, Number(v))));
    await rodar(de('artigos').update({ mapa_x: dentro(x), mapa_y: dentro(y) }).eq('id', id));
  }

  // Cor (#rrggbb, ou '' para a cor da seção) e ícone (ou '' para só o ponto) do ponto no mapa
  async function estilizarPonto(id, cor, icone) {
    await rodar(de('artigos').update({
      mapa_cor: /^#[0-9a-fA-F]{6}$/.test(cor) ? cor.toLowerCase() : '',
      mapa_icone: /^[a-z]{1,20}$/.test(icone) ? icone : '',
    }).eq('id', id));
  }

  // ---------- Membros ----------

  // Nome de cada membro, para mostrar quem escreveu: mapa e-mail -> nome
  let nomesCarregando = null;
  function nomes() {
    // Visitante não vê a lista de membros: as vitrines já trazem os nomes no lugar dos e-mails
    if (ehVisitante) return Promise.resolve(new Map());
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

  // Envia uma imagem (data URL, já reduzida no navegador) e devolve o nome do arquivo.
  // O nome muda a cada envio, então o navegador nunca mostra uma imagem antiga do cache.
  async function enviarArquivo(prefixo, dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const arquivo = `${prefixo}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    await rodar(sb.storage.from('imagens').upload(arquivo, blob, { contentType: blob.type, cacheControl: '31536000' }));
    return arquivo;
  }

  // Grava as imagens de um texto, na ordem: a primeira é a principal (imagem, imagem_x, imagem_y),
  // as outras vão para imagens_extras. Cada item é { arquivo } (já enviada) ou { dataUrl } (nova),
  // com a posição { x, y } em %. Arquivos que saíram da lista são apagados do Storage.
  // Não conta como edição do texto.
  async function salvarImagens(id, lista) {
    const antes = await buscarArtigo(id);
    const arquivosAntes = [antes.imagem, ...(antes.imagensExtras || []).map(i => i.arquivo)].filter(Boolean);
    const pct = v => Math.round(Math.min(100, Math.max(0, Number(v) || 0)) * 10) / 10;
    const final = [];
    for (const item of lista) {
      const arquivo = item.arquivo || await enviarArquivo(id, item.dataUrl);
      final.push({ arquivo, x: pct(item.x ?? 50), y: pct(item.y ?? 50) });
    }
    const [principal, ...extras] = final;
    await rodar(de('artigos').update({
      imagem: principal?.arquivo || '',
      imagem_x: principal?.x ?? 50,
      imagem_y: principal?.y ?? 50,
      imagens_extras: extras,
    }).eq('id', id));
    await apagarArquivos(arquivosAntes.filter(a => !final.some(f => f.arquivo === a)));
  }

  // Imagem posta no meio do texto (![](endereço)): só envia e devolve o endereço público.
  // Se a imagem sair do texto depois, o arquivo fica no Storage (não atrapalha nada).
  async function enviarImagemDoTexto(dataUrl) {
    if (!sb) throw new Error('Supabase não configurado (js/config.js)');
    return urlImagem(await enviarArquivo('texto', dataUrl));
  }

  return {
    titulos, listarArtigos, buscarArtigo, criarArtigo, salvarArtigo, excluirArtigo, excluidos, restaurarExcluido,
    revisoes, mencoes, pontosDoMapa, paises, lugaresDoPais, posicionar, estilizarPonto, nomes, urlImagem, salvarImagens,
    enviarImagemDoTexto, buscarPersonagens, buscarLideraveis, liderados, definirLider, definirCapital, capitalDe,
    idIntroducao, criarIntroducao,
  };
})();

// ---------- Quem está editando (ao vivo) ----------

// Usa a "presença" do Realtime do Supabase: cada aba com o editor aberto avisa qual texto está
// editando, e o aviso some sozinho quando a aba fecha ou perde a conexão. Não grava nada no banco
// e não bloqueia ninguém: é só para avisar.
const edicao = (() => {
  const minhaChave = crypto.randomUUID(); // cada aba conta como uma presença
  const ouvintes = new Set();
  let canal = null;
  let iniciando = null;
  let editando = null;     // o que esta aba está editando: { artigo, desde }, ou null
  let estado = new Map();  // id do texto -> [{ email, desde }] (das outras abas)

  function atualizar() {
    estado = new Map();
    for (const [chave, metas] of Object.entries(canal.presenceState())) {
      if (chave === minhaChave) continue;
      for (const m of metas) {
        if (!m.artigo) continue;
        estado.set(m.artigo, [...(estado.get(m.artigo) || []), { email: m.email, desde: m.desde }]);
      }
    }
    ouvintes.forEach(fn => fn(estado));
  }

  async function enviar() {
    if (canal?.state !== 'joined') return; // ao conectar, envia o que estiver valendo
    if (editando) await canal.track({ ...editando, email: await emailAtual() });
    else await canal.untrack();
  }

  function iniciar() {
    iniciando ||= (async () => {
      if (!sb || !(await sessaoPronta)) return;
      canal = sb.channel('luminus-edicao', { config: { presence: { key: minhaChave } } });
      canal.on('presence', { event: 'sync' }, atualizar);
      canal.subscribe(status => {
        if (status === 'SUBSCRIBED') enviar();
      });
    })();
    return iniciando;
  }

  return {
    // fn(mapa) é chamada sempre que muda quem está editando o quê
    ouvir(fn) {
      ouvintes.add(fn);
      iniciar();
    },
    // Esta aba começou a editar o texto (id) ou parou (null)
    marcar(artigoId) {
      if ((artigoId || null) === (editando?.artigo || null)) return;
      editando = artigoId ? { artigo: artigoId, desde: new Date().toISOString() } : null;
      iniciar().then(enviar);
    },
    // Quem (das outras abas) está editando este texto agora
    agora: id => estado.get(id) || [],
  };
})();
