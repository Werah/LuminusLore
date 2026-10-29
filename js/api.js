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

// Capa do card: a imagem do texto ou o emblema da seção
function capaArtigo(a) {
  if (a.imagem) return `<div class="capa"><img src="${banco.urlImagem(a.imagem)}" alt="" loading="lazy" style="${posicaoDaImagem(a)}"></div>`;
  return `<div class="capa">${emblemaSecao(a.secao)}</div>`;
}

// ---------- Pontos do mapa: ícones ----------

// Ícones que dá para escolher para um ponto (desenhos 24x24). '' = só o ponto redondo.
// Para adicionar um: chave só com letras minúsculas, um rótulo e o desenho em SVG.
const ICONES_MAPA = {
  '': { rotulo: 'Ponto', svg: '' },
  cidade: { rotulo: 'Cidade', svg: '<path d="M2 22V12h4V8h3v14zm8 0V3h6v19zm7 0V10h5v12z"/>' },
  vila: { rotulo: 'Vila', svg: '<path d="M12 3 2 11h3v10h5v-6h4v6h5V11h3z"/>' },
  castelo: { rotulo: 'Castelo', svg: '<path d="M3 21V7h3v2h2V7h3v2h2V7h3v2h2V7h3v14h-7v-5a2 2 0 0 0-4 0v5z"/>' },
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
  templo: { rotulo: 'Templo', svg: '<path d="M12 2 2 7v2h20V7zM4 10h3v8H4zm6.5 0h3v8h-3zM17 10h3v8h-3zM2 19h20v3H2z"/>' },
  porto: {
    rotulo: 'Porto',
    svg: '<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="4.5" r="2"/><path d="M12 6.5V21M8 10h8M4 13a8 8 0 0 0 16 0"/></g>',
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

/**
 * Liga um bloco de escolher imagem dentro de um formulário:
 *   <div class="campo-imagem">
 *     <div class="preview-imagem"></div>
 *     <label class="botao">Escolher imagem <input type="file" accept="image/*" hidden></label>
 *     <button type="button" class="pequeno btn-ajustar-imagem">Ajustar posição</button>
 *     <button type="button" class="pequeno perigo btn-remover-imagem">Remover</button>
 *   </div>
 * "semImagem" devolve o HTML mostrado quando não tem imagem; "molduras" devolve os formatos em que
 * a imagem aparece (para o popup de escolher a posição; é uma função porque o tipo do texto pode
 * mudar no editor, ex.: virar país).
 */
function ligarCampoImagem(raiz, semImagem, molduras) {
  const preview = raiz.querySelector('.preview-imagem');
  const input = raiz.querySelector('input[type="file"]');
  const btnRemover = raiz.querySelector('.btn-remover-imagem');
  const btnAjustar = raiz.querySelector('.btn-ajustar-imagem');
  let atual = '';              // arquivo que o texto já tinha
  let nova;                    // undefined = não mexeu, string = nova imagem, null = remover
  let pos = { x: 50, y: 50 };  // parte à vista
  let posInicial = { ...pos };

  const srcAtual = () => (typeof nova === 'string' ? nova : nova === undefined && atual ? banco.urlImagem(atual) : '');

  function desenhar() {
    const src = srcAtual();
    preview.innerHTML = src ? `<img src="${src}" alt="" style="object-position: ${pos.x}% ${pos.y}%">` : semImagem();
    btnRemover.style.display = src ? '' : 'none';
    if (btnAjustar) btnAjustar.style.display = src ? '' : 'none';
  }

  input.addEventListener('change', async () => {
    const arquivo = input.files[0];
    input.value = ''; // deixa escolher o mesmo arquivo de novo depois
    if (!arquivo) return;
    try {
      const dataUrl = await redimensionarImagem(arquivo);
      const escolha = await escolherPosicaoImagem(dataUrl, molduras(), { x: 50, y: 50 });
      if (!escolha) return; // cancelou: fica como estava
      nova = dataUrl;
      pos = escolha;
      desenhar();
    } catch (e) {
      alert(e.message);
    }
  });

  btnAjustar?.addEventListener('click', async () => {
    const src = srcAtual();
    if (!src) return;
    const escolha = await escolherPosicaoImagem(src, molduras(), pos);
    if (!escolha) return;
    pos = escolha;
    desenhar();
  });

  btnRemover.addEventListener('click', () => {
    nova = null;
    desenhar();
  });

  const posMudou = () => pos.x !== posInicial.x || pos.y !== posInicial.y;

  return {
    iniciar(arquivoAtual, x = 50, y = 50) {
      atual = arquivoAtual || '';
      nova = undefined;
      pos = { x, y };
      posInicial = { ...pos };
      desenhar();
    },
    mudou: () => nova !== undefined || posMudou(),
    // Envia a troca (ou remoção) da imagem e a posição depois que o texto foi salvo
    async salvar(id) {
      if (typeof nova === 'string') await banco.trocarImagem(id, nova);
      else if (nova === null && atual) await banco.removerImagem(id);
      if (srcAtual() && (typeof nova === 'string' || posMudou())) await banco.posicionarImagem(id, pos.x, pos.y);
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
