// Funções de tela compartilhadas por todas as páginas
// (login, consultas e imagens ficam em banco.js)

// Página aberta dentro do painel de texto do mapa (mapa.html)? Aí o topo some.
const embutido = window.self !== window.top;
if (embutido) document.documentElement.classList.add('embutido');

// Conta para o mapa qual texto o painel está mostrando (null = nenhum: lista, texto inexistente...)
function avisarMapa(artigo) {
  if (!embutido) return;
  const dados = artigo ? { id: artigo.id, titulo: artigo.titulo, secao: artigo.secao } : null;
  window.parent.postMessage({ tipo: 'artigo', artigo: dados }, location.origin);
}

// Para onde o link de uma seção leva (o Mundo vai para o mapa)
function paginaDaSecao(s) {
  return s.mapa ? s.mapa.pagina : s.pagina;
}

// Evita que texto digitado vire HTML
function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Para buscar sem ligar para maiúsculas e acentos
function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Evita salvar duas vezes com cliques rápidos: enquanto a ação roda, os botões do
 * formulário ficam desabilitados e novas chamadas para o mesmo formulário são ignoradas.
 */
async function semCliqueDuplo(form, acao) {
  if (form.dataset.salvando) return;
  form.dataset.salvando = 'sim';
  // Só desabilita (e depois reabilita) os botões que estavam habilitados
  const botoes = [...form.querySelectorAll('button')].filter(b => !b.disabled);
  botoes.forEach(b => { b.disabled = true; });
  try {
    return await acao();
  } finally {
    delete form.dataset.salvando;
    botoes.forEach(b => { b.disabled = false; });
  }
}

function formatarData(iso) {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatarDataHora(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Nome de quem escreveu (mapa de banco.nomes()); se não for mais membro, mostra o começo do e-mail
function nomeDe(email, nomes) {
  return nomes.get(email) || (email ? email.split('@')[0] : 'alguém');
}

// Quem está editando (de edicao.agora): "Ana", "Ana e Bia", "você (em outra aba)"
function nomesEditando(editores, nomes, meuEmail) {
  const lista = [...new Set(editores.map(e => (e.email === meuEmail ? 'você (em outra aba)' : nomeDe(e.email, nomes))))];
  return lista.length > 1 ? `${lista.slice(0, -1).join(', ')} e ${lista.at(-1)}` : lista[0] || '';
}

// ---------- Textos: links entre eles e Markdown ----------

// [[Título]] ou [[Título|texto que aparece]]
const LINK_WIKI = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;

// "titulos" é o mapa de banco.titulos(). Link para texto que ainda não existe fica marcado.
// [[Azraq (país)]] aparece só como "Azraq" (o "(país)" serve para escolher o país, não para ler).
function linkWiki(alvo, rotulo, titulos) {
  const nome = alvo.trim();
  const t = titulos.get(nome.toLowerCase());
  const rotuloHtml = esc((rotulo || (t?.pais ? t.titulo : alvo)).trim());
  if (t) return `<a class="wiki" href="artigo.html?id=${encodeURIComponent(t.id)}">${rotuloHtml}</a>`;
  return `<a class="wiki inexistente" href="artigo.html?titulo=${encodeURIComponent(nome)}" title="Esse texto ainda não existe">${rotuloHtml}</a>`;
}

// Texto curto (campos da ficha): escapa tudo e só transforma os [[links]]
function linhaComLinks(texto, titulos) {
  let html = '';
  let ultimo = 0;
  for (const m of texto.matchAll(LINK_WIKI)) {
    html += esc(texto.slice(ultimo, m.index)) + linkWiki(m[1], m[2], titulos);
    ultimo = m.index + m[0].length;
  }
  return html + esc(texto.slice(ultimo));
}

// Texto grande: Markdown (negrito, títulos, listas...) + [[links]], sem deixar passar HTML perigoso.
// Precisa do marked e do DOMPurify carregados na página.
function renderizarTexto(texto, titulos) {
  const comLinks = String(texto || '').replace(LINK_WIKI, (_, alvo, rotulo) => linkWiki(alvo, rotulo, titulos));
  return DOMPurify.sanitize(marked.parse(comLinks, { breaks: true, gfm: true }));
}

// Posição na tela logo abaixo do cursor de um campo de texto.
// No textarea, copia o texto até o cursor numa div invisível com o mesmo estilo e mede onde ele termina.
function posicaoDoCursor(campo) {
  const caixa = campo.getBoundingClientRect();
  let x = caixa.left;
  let y = caixa.bottom;
  if (campo.tagName === 'TEXTAREA') {
    const estilo = getComputedStyle(campo);
    const espelho = document.createElement('div');
    for (const p of ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize']) {
      espelho.style[p] = estilo[p];
    }
    Object.assign(espelho.style, {
      position: 'fixed', top: '0', left: '0', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
    });
    espelho.textContent = campo.value.slice(0, campo.selectionStart);
    const marca = document.createElement('span');
    marca.textContent = '​';
    espelho.appendChild(marca);
    document.body.appendChild(espelho);
    const linha = parseFloat(estilo.lineHeight) || parseFloat(estilo.fontSize) * 1.4;
    x = caixa.left + marca.offsetLeft - campo.scrollLeft;
    y = caixa.top + marca.offsetTop - campo.scrollTop + linha;
    espelho.remove();
  }
  return { x: Math.max(8, Math.min(x, innerWidth - 300)), y: Math.min(y + 4, innerHeight - 60) };
}

/**
 * Ao digitar [[ num campo de texto, mostra os títulos que combinam com o que vem depois.
 * Escolher (clique, Enter ou Tab) completa para [[Título]]. "titulos" é o mapa de banco.titulos().
 */
function ligarSugestaoDeLinks(campo, titulos) {
  const lista = document.createElement('ul');
  lista.className = 'sugestoes-link';
  lista.hidden = true;
  document.body.appendChild(lista);
  let opcoes = [];
  let escolhida = 0;
  let inicio = 0; // onde começa o que foi digitado depois do [[

  function fechar() {
    lista.hidden = true;
    opcoes = [];
  }

  function marcar(i) {
    escolhida = (i + opcoes.length) % opcoes.length;
    lista.querySelectorAll('li').forEach((li, j) => li.classList.toggle('ativa', j === escolhida));
  }

  function atualizar() {
    const antes = campo.value.slice(0, campo.selectionStart);
    const m = antes.match(/\[\[([^[\]|\n]*)$/);
    if (!m || campo.selectionStart !== campo.selectionEnd) return fechar();
    inicio = antes.length - m[1].length;
    const termo = normalizar(m[1].trim());
    const comeca = t => (normalizar(t.titulo).startsWith(termo) ? 0 : 1);
    // Um país aparece no mapa de títulos com dois jeitos de escrever: aqui entra uma vez só
    const unicos = [...new Map([...titulos.values()].map(t => [t.id, t])).values()];
    opcoes = unicos
      .filter(t => normalizar(t.titulo).includes(termo))
      .sort((a, b) => comeca(a) - comeca(b) || a.titulo.localeCompare(b.titulo) || a.pais - b.pais)
      .slice(0, 8);
    if (!opcoes.length) {
      lista.innerHTML = '<li class="nenhuma">Nenhum texto com esse nome (o link fica vermelho até alguém criar)</li>';
    } else {
      lista.innerHTML = opcoes.map((t, i) => `
        <li data-i="${i}">${SECOES[t.secao]?.icone || ''} ${esc(t.titulo)}${t.pais ? ' <small>(país)</small>' : ''}</li>
      `).join('');
      marcar(0);
    }
    const pos = posicaoDoCursor(campo);
    lista.style.left = `${pos.x}px`;
    lista.style.top = `${pos.y}px`;
    lista.hidden = false;
  }

  function escolher(i) {
    const titulo = opcoes[i].link; // "Azraq (país)" quando o país tem o mesmo nome de outro texto
    const fim = campo.selectionStart;
    // Se o cursor estava no meio de um link já fechado ("[[Mar|essa]]"), troca o link inteiro
    const depois = campo.value.slice(fim).replace(/^[^[\]\n]*\]\]/, '');
    campo.value = campo.value.slice(0, inicio) + titulo + ']]' + depois;
    const cursor = inicio + titulo.length + 2;
    campo.setSelectionRange(cursor, cursor);
    fechar();
    campo.focus();
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  }

  campo.addEventListener('input', atualizar);
  campo.addEventListener('click', atualizar);
  campo.addEventListener('blur', () => setTimeout(fechar, 150));
  campo.addEventListener('scroll', fechar);
  window.addEventListener('scroll', fechar, true);
  campo.addEventListener('keydown', e => {
    if (lista.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      fechar();
    } else if (opcoes.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      marcar(escolhida + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (opcoes.length && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault();
      escolher(escolhida);
    }
  });
  // mousedown (e não click) para escolher antes do campo perder o foco
  lista.addEventListener('mousedown', e => {
    e.preventDefault();
    const li = e.target.closest('li[data-i]');
    if (li) escolher(Number(li.dataset.i));
  });
}

/**
 * Campo de texto que busca no banco enquanto a pessoa digita e mostra os resultados embaixo
 * (para escolher um entre muitos, ex.: o líder entre centenas de personagens).
 *   buscar(termo)  devolve a lista (Promise)
 *   mostrar(item)  devolve o HTML de uma linha
 *   escolher(item) chamado quando a pessoa escolhe (clique, Enter ou Tab)
 * Enter neste campo nunca envia o formulário.
 */
function ligarBusca(input, { buscar, mostrar, escolher }) {
  const lista = document.createElement('ul');
  lista.className = 'sugestoes-link';
  lista.hidden = true;
  document.body.appendChild(lista);
  let opcoes = [];
  let escolhida = 0;
  let pausa = null;
  let pedido = 0; // para ignorar respostas que chegaram fora de ordem

  function fechar() {
    lista.hidden = true;
    opcoes = [];
  }

  function marcar(i) {
    escolhida = (i + opcoes.length) % opcoes.length;
    lista.querySelectorAll('li').forEach((li, j) => li.classList.toggle('ativa', j === escolhida));
  }

  async function procurar() {
    const termo = input.value.trim();
    if (!termo) return fechar();
    const meu = ++pedido;
    let achados;
    try {
      achados = await buscar(termo);
    } catch {
      return;
    }
    if (meu !== pedido || document.activeElement !== input) return;
    opcoes = achados;
    lista.innerHTML = opcoes.length
      ? opcoes.map((o, i) => `<li data-i="${i}">${mostrar(o)}</li>`).join('')
      : '<li class="nenhuma">Nada encontrado com esse nome</li>';
    if (opcoes.length) marcar(0);
    const pos = posicaoDoCursor(input);
    lista.style.left = `${pos.x}px`;
    lista.style.top = `${pos.y}px`;
    lista.style.minWidth = `${Math.min(input.offsetWidth, 300)}px`;
    lista.hidden = false;
  }

  function pegar(i) {
    const item = opcoes[i];
    fechar();
    if (item) escolher(item);
  }

  input.setAttribute('autocomplete', 'off');
  input.addEventListener('input', () => {
    clearTimeout(pausa);
    pausa = setTimeout(procurar, 200);
  });
  input.addEventListener('blur', () => setTimeout(fechar, 150));
  window.addEventListener('scroll', fechar, true);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') e.preventDefault();
    if (lista.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      fechar();
    } else if (opcoes.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      marcar(escolhida + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (opcoes.length && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault();
      pegar(escolhida);
    }
  });
  lista.addEventListener('mousedown', e => {
    e.preventDefault();
    const li = e.target.closest('li[data-i]');
    if (li) pegar(Number(li.dataset.i));
  });
}

// Ícone de um texto: o do ponto no mapa, se tiver, ou o da seção
function iconeDoTexto(a) {
  const svg = ICONES_MAPA[a.mapaIcone]?.svg;
  return svg ? `<span class="icone-texto">${desenhoSvg(svg)}</span>` : `<span class="icone-texto">${SECOES[a.secao]?.icone || ''}</span>`;
}

// "país", "cidade", "vila", "organização" (para o "Líder de" do personagem)
function tipoDoLiderado(a) {
  if (a.secao === 'organizacoes') return 'organização';
  if (ehPais(a)) return 'país';
  if (a.detalhes?.categoria === 'Vilarejo' || a.mapaIcone === 'vila') return 'vila';
  return 'cidade';
}

// Começo do texto sem a marcação, para mostrar nos cards
function resumoTexto(texto, tamanho = 180) {
  const limpo = String(texto || '')
    .replace(LINK_WIKI, (_, alvo, rotulo) => rotulo || alvo.replace(/\s*\(país\)\s*$/i, ''))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')       // imagens
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')    // links
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')      // marcadores de lista
    .replace(/[#>*_`~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpo.length > tamanho ? limpo.slice(0, tamanho).replace(/\s+\S*$/, '') + '…' : limpo;
}

// Emblema da seção usado quando o texto não tem imagem
function emblemaSecao(secao) {
  const s = SECOES[secao];
  return `<div class="sem-imagem" style="--cor: ${s.cor}"><span class="emblema">${s.icone}</span></div>`;
}

// Qual parte da imagem fica à vista (escolhida no popup de posicionar a imagem)
const posicaoDaImagem = a => `object-position: ${a.imagemX ?? 50}% ${a.imagemY ?? 50}%`;

// Capa do card: as imagens do texto (carrossel, se tiver mais de uma) ou o emblema da seção
function capaArtigo(a) {
  if (a.imagem) return `<div class="capa">${carrossel(a)}</div>`;
  return `<div class="capa">${emblemaSecao(a.secao)}</div>`;
}

// ---------- Carrossel de imagens ----------

// Todas as imagens de um texto, na ordem (a principal primeiro), cada uma com a sua posição
function imagensDe(a) {
  return [
    ...(a.imagem ? [{ arquivo: a.imagem, x: a.imagemX ?? 50, y: a.imagemY ?? 50 }] : []),
    ...(a.imagensExtras || []),
  ];
}

// Com uma imagem, só a imagem. Com mais: bordas clicáveis (esquerda volta, direita avança),
// bolinhas embaixo, e troca sozinha a cada 10 s com fade (ver o fim desta seção).
function carrossel(a, classe = '') {
  const imgs = imagensDe(a);
  if (!imgs.length) return '';
  const tags = imgs.map((img, i) => `
    <img src="${banco.urlImagem(img.arquivo)}" alt="" loading="lazy"${i === 0 ? ' class="ativa"' : ''}
         style="object-position: ${img.x ?? 50}% ${img.y ?? 50}%">`).join('');
  if (imgs.length === 1) return `<div class="carrossel ${classe}">${tags}</div>`;
  return `
    <div class="carrossel ${classe}" data-carrossel>
      ${tags}
      <span class="carrossel-seta anterior" role="button" aria-label="Imagem anterior" data-passo="-1"></span>
      <span class="carrossel-seta proxima" role="button" aria-label="Próxima imagem" data-passo="1"></span>
      <span class="carrossel-pontos">${imgs.map((_, i) => `<span${i === 0 ? ' class="ativo"' : ''}></span>`).join('')}</span>
    </div>`;
}

const TROCA_CARROSSEL = 10000; // ms entre uma imagem e outra

function mostrarImagem(c, passo) {
  const imgs = [...c.querySelectorAll(':scope > img')];
  const proxima = (imgs.findIndex(i => i.classList.contains('ativa')) + passo + imgs.length) % imgs.length;
  imgs.forEach((img, i) => img.classList.toggle('ativa', i === proxima));
  c.querySelectorAll('.carrossel-pontos span').forEach((p, i) => p.classList.toggle('ativo', i === proxima));
  c.dataset.trocou = Date.now();
}

// Clique nas bordas. Em "captura" e com preventDefault: o card é um link, e clicar na borda só
// troca a imagem, não abre o texto.
document.addEventListener('click', e => {
  const seta = e.target.closest('.carrossel-seta');
  if (!seta) return;
  e.preventDefault();
  e.stopPropagation();
  mostrarImagem(seta.closest('[data-carrossel]'), Number(seta.dataset.passo));
}, true);

// Troca sozinha. Cada carrossel começa num momento diferente, para os cards não trocarem todos juntos;
// depois de um clique, conta os 10 s de novo a partir dele.
setInterval(() => {
  const agora = Date.now();
  document.querySelectorAll('[data-carrossel]').forEach(c => {
    if (!c.dataset.trocou) c.dataset.trocou = agora - Math.random() * 5000;
    if (agora - Number(c.dataset.trocou) >= TROCA_CARROSSEL) mostrarImagem(c, 1);
  });
}, 1000);

// ---------- Pontos do mapa: ícones ----------

// Ícones que dá para escolher para um ponto (desenhos 24x24). '' = só o ponto redondo.
// Para adicionar um: chave só com letras minúsculas, um rótulo e o desenho em SVG.
const ICONES_MAPA = {
  '': { rotulo: 'Ponto', svg: '' },
  cidade: { rotulo: 'Cidade', svg: '<path d="M2 22V12h4V8h3v14zm8 0V3h6v19zm7 0V10h5v12z"/>' },
  vila: { rotulo: 'Vila', svg: '<path d="M12 3 2 11h3v10h5v-6h4v6h5V11h3z"/>' },
  // A chave "castelo" é a da torre antiga (os pontos que já usavam ela continuam iguais);
  // o castelo de verdade ficou com a chave "fortaleza"
  castelo: { rotulo: 'Torre', svg: '<path d="M3 21V7h3v2h2V7h3v2h2V7h3v2h2V7h3v14h-7v-5a2 2 0 0 0-4 0v5z"/>' },
  fortaleza: {
    rotulo: 'Castelo',
    // Duas torres com ameias e janelas, a torre do meio mais alta (com bandeira e janela em arco),
    // muralha com portão. Desenhado entre y 0.8 e 19.5; o "g" aumenta e centraliza no quadro.
    svg: '<g transform="translate(12 12) scale(1.1) translate(-12 -10.15)">' + [
      'M2 9.5V5.8h1.2V7H4V5.8h1.2V7H6V5.8h1.2v3.7h-.6v10h-4v-10zm2.1 2h.8v1.6h-.8zm0 3.5h.8v1.6h-.8z', // torre da esquerda
      'M16.8 9.5V5.8H18V7h.8V5.8H20V7h.8V5.8H22v3.7h-.6v10h-4v-10zm2.2 2h.8v1.6H19zm0 3.5h.8v1.6H19z', // torre da direita
      'M8.6 8.3V4.3h1.6v1.2h1V4.3h1.6v1.2h1V4.3h1.6v4h-.7v5.5h2.1v5.7H7.2v-5.7h2.1V8.3z'
        + 'm2.7 3.7v-1.6a.7.7 0 0 1 1.4 0V12zm-.9 7.5v-2.6a1.6 1.6 0 0 1 3.2 0v2.6z', // torre do meio, muralha e portão
      'M11.7 4.3V.8h.6v3.5z', 'M12.3.8H15l-.8.9.8.9h-2.7z', // bandeira
    ].map(d => `<path fill-rule="evenodd" d="${d}"/>`).join('') + '</g>',
  },
  caveira: {
    rotulo: 'Caveira',
    svg: '<path fill-rule="evenodd" d="M12 2C7 2 3.5 5.6 3.5 10c0 2.6 1.2 4.6 3 5.8V19a1 1 0 0 0 1 1H9v-2h2v2h2v-2h2v2h1.5a1 1 0 0 0 1-1v-3.2c1.8-1.2 3-3.2 3-5.8C20.5 5.6 17 2 12 2zM8.5 13.5a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4zm7 0a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4zM12 13.5l-1.2 2.3h2.4z"/>',
  },
  floresta: { rotulo: 'Floresta', svg: '<path d="M8 2 3 10h3l-4 6h5v5h2v-5h5l-4-6h3zm9 4-3.5 5.5H16L13 16h3v5h2v-5h3l-3-4.5h2.5z"/>' },
  espadas: {
    rotulo: 'Espadas cruzadas',
    // Uma espada em pé (lâmina, guarda, cabo, pomo) desenhada duas vezes, girada para cada lado
    svg: ['45', '-45'].map(giro => `<g transform="rotate(${giro} 12 12)">`
      + '<path d="M12 1.5 13.4 4v11h-2.8V4z"/><rect x="7.5" y="15" width="9" height="2" rx="1"/>'
      + '<rect x="11" y="17" width="2" height="4"/><circle cx="12" cy="22" r="1.4"/></g>').join(''),
  },
  montanha: { rotulo: 'Montanha', svg: '<path d="M1 20 9 6l4.5 7 2.5-3.5L23 20z"/>' },
  agua: {
    rotulo: 'Corpo de Água',
    // Três ondas
    svg: '<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">'
      + ['6.5', '12', '17.5'].map(y => `<path d="M2 ${y}c1.7-1.6 3.3-1.6 5 0s3.3 1.6 5 0 3.3-1.6 5 0 3.3 1.6 5 0"/>`).join('')
      + '</g>',
  },
  templo: { rotulo: 'Templo', svg: '<path d="M12 2 2 7v2h20V7zM4 10h3v8H4zm6.5 0h3v8h-3zM17 10h3v8h-3zM2 19h20v3H2z"/>' },
  porto: {
    rotulo: 'Porto',
    svg: '<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="4.5" r="2"/><path d="M12 6.5V21M8 10h8M4 13a8 8 0 0 0 16 0"/></g>',
  },
  navio: {
    rotulo: 'Navio',
    // Casco, mastro com bandeira e duas velas
    svg: [
      'M1.5 16h21l-2.6 4.3a1.6 1.6 0 0 1-1.4.8h-13a1.6 1.6 0 0 1-1.4-.8z', // casco
      'M11.6 16V1.5h.8V16z', 'M12.4 1.5h3l-.8.9.8.9h-3z', // mastro e bandeira
      'M11 4v10.5H4.2C6.6 11 8.9 7.6 11 4z', // vela grande
      'M13 5.5v9h6.3c-1-3.4-3.1-6.4-6.3-9z', // vela pequena
    ].map(d => `<path d="${d}"/>`).join(''),
  },
  estrela: { rotulo: 'País (estrela)', svg:'<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3l-6.2 3.6 1.6-7L2 9.2l7.1-.6z"/>' },
};

const desenhoSvg = d => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${d}</svg>`;

// Cor clara pede ícone escuro (senão o ícone branco some)
function corClara(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.62;
}

// Ponto com ícone de estrela é um país: os outros textos podem pertencer a ele
const ICONE_PAIS = 'estrela';
const ehPais = p => p.mapaIcone === ICONE_PAIS;

// Botões para escolher o ícone (usados no mapa e no editor); "escolhido" fica marcado
function botoesIcones(escolhido) {
  return Object.entries(ICONES_MAPA).map(([chave, i]) => `
    <button type="button" class="${chave === (escolhido || '') ? 'ativo' : ''}" data-icone="${chave}" title="${i.rotulo}" aria-label="${i.rotulo}">
      ${i.svg ? desenhoSvg(i.svg) : '<span class="gema"></span>'}
    </button>
  `).join('');
}

// ---------- Imagens ----------

// Lê um arquivo de imagem e reduz o tamanho antes de enviar (devolve data URL em JPEG)
function redimensionarImagem(arquivo, maximo = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, maximo / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Não deu pra ler essa imagem'));
    img.src = URL.createObjectURL(arquivo);
  });
}

/**
 * Popup para escolher qual parte da imagem fica à vista. Mostra um quadro para cada formato em que
 * a imagem aparece no site (moldurasDaImagem, em secoes.js): o primeiro grande, os outros menores.
 * Arrastar a imagem em qualquer quadro move a mesma posição, e todos os quadros acompanham.
 * Devolve { x, y } (em %) ou null se a pessoa cancelar.
 */
function escolherPosicaoImagem(src, molduras, inicio = { x: 50, y: 50 }) {
  return new Promise(resolve => {
    const pos = { x: inicio.x ?? 50, y: inicio.y ?? 50 };
    const quadro = m => `
      <figure class="quadro-imagem">
        <div class="janela-imagem" style="--prop: ${m.proporcao}"><img src="${src}" alt="" draggable="false"></div>
        <figcaption>${esc(m.nome)}</figcaption>
      </figure>`;
    const [principal, ...outras] = molduras;
    const dialog = document.createElement('dialog');
    dialog.className = 'posicionar-imagem';
    dialog.innerHTML = `
      <h2>Escolha a parte da imagem</h2>
      <p class="info">Arraste a imagem dentro de qualquer quadro. Cada quadro tem o formato de um lugar do site onde ela aparece.</p>
      <div class="quadro-principal">${quadro(principal)}</div>
      ${outras.length ? `<div class="quadros-menores">${outras.map(quadro).join('')}</div>` : ''}
      <div class="botoes-modal">
        <button type="button" class="esquerda btn-centro">Centralizar</button>
        <button type="button" class="btn-cancelar">Cancelar</button>
        <button type="button" class="primario btn-usar">Usar</button>
      </div>
    `;
    document.body.appendChild(dialog);
    const imagens = [...dialog.querySelectorAll('img')];
    const aplicar = () => imagens.forEach(img => { img.style.objectPosition = `${pos.x}% ${pos.y}%`; });

    function fechar(resultado) {
      dialog.close();
      dialog.remove();
      resolve(resultado);
    }

    // Arrastar: o quanto a imagem "sobra" para fora do quadro é o quanto ela pode andar.
    // Arrastar para a direita mostra mais da esquerda (a posição em % diminui).
    dialog.querySelectorAll('.janela-imagem').forEach(janela => {
      let inicioArraste = null;
      janela.addEventListener('pointerdown', e => {
        e.preventDefault();
        inicioArraste = { cx: e.clientX, cy: e.clientY, x: pos.x, y: pos.y };
        janela.classList.add('arrastando');
        try {
          janela.setPointerCapture(e.pointerId); // continua arrastando mesmo se o mouse sair do quadro
        } catch {
          // Sem captura: o arraste funciona enquanto o mouse estiver dentro do quadro
        }
      });
      janela.addEventListener('pointermove', e => {
        if (!inicioArraste) return;
        const img = janela.querySelector('img');
        const caixa = janela.getBoundingClientRect();
        const escala = Math.max(caixa.width / img.naturalWidth, caixa.height / img.naturalHeight);
        const sobraX = img.naturalWidth * escala - caixa.width;
        const sobraY = img.naturalHeight * escala - caixa.height;
        const limitar = v => Math.min(100, Math.max(0, v));
        if (sobraX > 0.5) pos.x = limitar(inicioArraste.x - ((e.clientX - inicioArraste.cx) / sobraX) * 100);
        if (sobraY > 0.5) pos.y = limitar(inicioArraste.y - ((e.clientY - inicioArraste.cy) / sobraY) * 100);
        aplicar();
      });
      const soltar = () => {
        inicioArraste = null;
        janela.classList.remove('arrastando');
      };
      janela.addEventListener('pointerup', soltar);
      janela.addEventListener('lostpointercapture', soltar);
    });

    imagens[0].onerror = () => {
      alert('Não deu pra ler essa imagem');
      fechar(null);
    };
    dialog.querySelector('.btn-centro').addEventListener('click', () => {
      pos.x = 50;
      pos.y = 50;
      aplicar();
    });
    dialog.querySelector('.btn-cancelar').addEventListener('click', () => fechar(null));
    dialog.addEventListener('cancel', e => { e.preventDefault(); fechar(null); }); // tecla Esc
    dialog.querySelector('.btn-usar').addEventListener('click', () => fechar({ x: pos.x, y: pos.y }));
    aplicar();
    dialog.showModal();
  });
}

// Até quantas imagens um texto pode ter (a primeira é a principal; com mais de uma, vira carrossel)
const MAX_IMAGENS = 10;

/**
 * Liga o bloco de imagens de um formulário:
 *   <div class="campo-imagens">
 *     <div class="lista-imagens"></div>
 *     <label class="botao">+ Adicionar imagem <input type="file" accept="image/*" multiple hidden></label>
 *   </div>
 * Cada imagem aparece como miniatura com ◀ ▶ (mudar a ordem), ⤢ (ajustar a posição) e ✕ (tirar).
 * A primeira é a principal. "semImagem" devolve o HTML mostrado quando não tem nenhuma; "molduras"
 * devolve os formatos em que a imagem aparece (para o popup de posição; é uma função porque o tipo
 * do texto pode mudar no editor, ex.: virar país).
 */
function ligarCampoImagens(raiz, semImagem, molduras) {
  const lista = raiz.querySelector('.lista-imagens');
  const input = raiz.querySelector('input[type="file"]');
  const botaoAdicionar = input.closest('label');
  // Cada item: { arquivo } (já guardada) ou { dataUrl } (nova), mais a posição { x, y }
  let imagens = [];
  let inicial = '[]';

  const srcDe = img => img.dataUrl || banco.urlImagem(img.arquivo);
  const estado = () => JSON.stringify(imagens.map(i => [i.arquivo || i.dataUrl.length, i.x, i.y]));

  function desenhar() {
    lista.innerHTML = imagens.length
      ? imagens.map((img, i) => `
          <div class="miniatura${i === 0 ? ' principal' : ''}">
            <img src="${srcDe(img)}" alt="" style="object-position: ${img.x}% ${img.y}%">
            ${i === 0 ? '<span class="selo-principal">Principal</span>' : ''}
            <div class="acoes-miniatura">
              <button type="button" data-acao="antes" data-i="${i}" title="Mover para a esquerda"${i === 0 ? ' disabled' : ''}>◀</button>
              <button type="button" data-acao="ajustar" data-i="${i}" title="Ajustar a parte que aparece">⤢</button>
              <button type="button" data-acao="depois" data-i="${i}" title="Mover para a direita"${i === imagens.length - 1 ? ' disabled' : ''}>▶</button>
              <button type="button" data-acao="tirar" data-i="${i}" title="Tirar esta imagem" class="perigo">✕</button>
            </div>
          </div>`).join('')
      : `<div class="miniatura vazia">${semImagem()}</div>`;
    botaoAdicionar.hidden = imagens.length >= MAX_IMAGENS;
  }

  // Escolher arquivos (pode ser vários): para cada um abre o popup de posição; cancelar pula aquele
  input.addEventListener('change', async () => {
    const arquivos = [...input.files].slice(0, MAX_IMAGENS - imagens.length);
    input.value = ''; // deixa escolher o mesmo arquivo de novo depois
    for (const arquivo of arquivos) {
      try {
        const dataUrl = await redimensionarImagem(arquivo);
        const escolha = await escolherPosicaoImagem(dataUrl, molduras(), { x: 50, y: 50 });
        if (!escolha) continue;
        imagens.push({ dataUrl, ...escolha });
        desenhar();
      } catch (e) {
        alert(e.message);
      }
    }
  });

  lista.addEventListener('click', async e => {
    const botao = e.target.closest('button[data-acao]');
    if (!botao) return;
    const i = Number(botao.dataset.i);
    const acao = botao.dataset.acao;
    if (acao === 'tirar') imagens.splice(i, 1);
    if (acao === 'antes' && i > 0) [imagens[i - 1], imagens[i]] = [imagens[i], imagens[i - 1]];
    if (acao === 'depois' && i < imagens.length - 1) [imagens[i + 1], imagens[i]] = [imagens[i], imagens[i + 1]];
    if (acao === 'ajustar') {
      // A principal usa os formatos de todos os lugares; as outras só aparecem nos carrosséis
      const escolha = await escolherPosicaoImagem(srcDe(imagens[i]), molduras(), imagens[i]);
      if (escolha) Object.assign(imagens[i], escolha);
    }
    desenhar();
  });

  return {
    // a: o texto (imagem, imagemX, imagemY, imagensExtras)
    iniciar(a) {
      imagens = [
        ...(a.imagem ? [{ arquivo: a.imagem, x: a.imagemX ?? 50, y: a.imagemY ?? 50 }] : []),
        ...(a.imagensExtras || []).map(i => ({ arquivo: i.arquivo, x: i.x ?? 50, y: i.y ?? 50 })),
      ];
      inicial = estado();
      desenhar();
    },
    mudou: () => estado() !== inicial,
    // Grava as imagens depois que o texto foi salvo (só se mudou alguma coisa)
    async salvar(id) {
      if (estado() === inicial) return;
      await banco.salvarImagens(id, imagens);
      inicial = estado();
    },
  };
}

// ---------- Topo e conta ----------

// Monta a barra do topo; "atual" é o nome da seção ativa
function montarTopo(atual) {
  const nav = Object.values(SECOES)
    .map(s => `<a href="${paginaDaSecao(s)}" class="${s.nome === atual ? 'ativo' : ''}">${s.nome}</a>`)
    .join('');
  if (ehVisitante) {
    // Visitante: sem conta; "Entrar com conta" volta para o login
    document.getElementById('topo').innerHTML = `
      <a class="marca" href="home.html">✦ LuminusLore</a>
      <nav>${nav}<span class="conta selo-visitante" title="Só leitura">👁 Visitante</span><a href="#" onclick="sair(); return false;">Entrar com conta</a></nav>
    `;
    return;
  }
  document.getElementById('topo').innerHTML = `
    <a class="marca" href="home.html">✦ LuminusLore</a>
    <nav>${nav}<a href="#" class="conta" id="btn-conta" title="Sua conta">Conta</a><a href="#" onclick="sair(); return false;">Sair</a></nav>
  `;
  const btnConta = document.getElementById('btn-conta');
  btnConta.addEventListener('click', e => {
    e.preventDefault();
    abrirConta();
  });
  // Troca "Conta" pelo nome de quem está logado
  Promise.all([emailAtual(), banco.nomes()])
    .then(([email, nomes]) => { if (nomes.get(email)) btnConta.textContent = nomes.get(email); })
    .catch(() => {});
}

// Popup com os dados da conta e o formulário para trocar a senha
async function abrirConta() {
  const email = await emailAtual();
  const nomes = await banco.nomes().catch(() => new Map());
  const dialog = document.createElement('dialog');
  dialog.innerHTML = `
    <form method="dialog">
      <h2>Sua conta</h2>
      <p class="info-conta"><strong>${esc(nomes.get(email) || '')}</strong><br>${esc(email)}</p>
      <label>Nova senha
        <input type="password" name="nova" minlength="6" autocomplete="new-password" required>
      </label>
      <label>Repita a nova senha
        <input type="password" name="repetida" minlength="6" autocomplete="new-password" required>
      </label>
      <p class="erro"></p>
      <div class="botoes-modal">
        <button type="button" class="btn-fechar">Fechar</button>
        <button type="submit" class="primario">Trocar senha</button>
      </div>
    </form>
  `;
  document.body.appendChild(dialog);
  const form = dialog.querySelector('form');
  const erro = dialog.querySelector('.erro');

  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('.btn-fechar').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', e => {
    e.preventDefault();
    erro.textContent = '';
    if (form.nova.value !== form.repetida.value) {
      erro.textContent = 'As duas senhas não são iguais';
      return;
    }
    semCliqueDuplo(form, async () => {
      try {
        await trocarSenha(form.nova.value);
        alert('Senha trocada!');
        dialog.close();
      } catch (err) {
        erro.textContent = err.message;
      }
    });
  });
  dialog.showModal();
}
