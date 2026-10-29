// Funções de tela compartilhadas por todas as páginas
// (login, consultas e imagens ficam em banco.js)

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

// ---------- Textos: links entre eles e Markdown ----------

// [[Título]] ou [[Título|texto que aparece]]
const LINK_WIKI = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;

// "titulos" é o mapa de banco.titulos(). Link para texto que ainda não existe fica marcado.
function linkWiki(alvo, rotulo, titulos) {
  const nome = alvo.trim();
  const t = titulos.get(nome.toLowerCase());
  const rotuloHtml = esc((rotulo || alvo).trim());
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

// Começo do texto sem a marcação, para mostrar nos cards
function resumoTexto(texto, tamanho = 180) {
  const limpo = String(texto || '')
    .replace(LINK_WIKI, (_, alvo, rotulo) => rotulo || alvo)
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

// Capa do card: a imagem do texto ou o emblema da seção
function capaArtigo(a) {
  if (a.imagem) return `<div class="capa"><img src="${banco.urlImagem(a.imagem)}" alt="" loading="lazy"></div>`;
  return `<div class="capa">${emblemaSecao(a.secao)}</div>`;
}

// ---------- Imagens ----------

// Lê um arquivo de imagem e reduz o tamanho antes de enviar (devolve data URL em JPEG)
function redimensionarImagem(arquivo, maximo = 1200) {
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
 * Liga um bloco de escolher imagem dentro de um formulário:
 *   <div class="campo-imagem">
 *     <div class="preview-imagem"></div>
 *     <label class="botao">Escolher imagem <input type="file" accept="image/*" hidden></label>
 *     <button type="button" class="pequeno perigo btn-remover-imagem">Remover</button>
 *   </div>
 * "semImagem" devolve o HTML mostrado quando não tem imagem.
 */
function ligarCampoImagem(raiz, semImagem) {
  const preview = raiz.querySelector('.preview-imagem');
  const input = raiz.querySelector('input[type="file"]');
  const btnRemover = raiz.querySelector('.btn-remover-imagem');
  let atual = ''; // arquivo que o texto já tinha
  let nova;       // undefined = não mexeu, string = nova imagem, null = remover

  function desenhar() {
    let src = '';
    if (typeof nova === 'string') src = nova;
    else if (nova === undefined && atual) src = banco.urlImagem(atual);
    preview.innerHTML = src ? `<img src="${src}" alt="">` : semImagem();
    btnRemover.style.display = src ? '' : 'none';
  }

  input.addEventListener('change', async () => {
    const arquivo = input.files[0];
    input.value = ''; // deixa escolher o mesmo arquivo de novo depois
    if (!arquivo) return;
    try {
      nova = await redimensionarImagem(arquivo);
      desenhar();
    } catch (e) {
      alert(e.message);
    }
  });

  btnRemover.addEventListener('click', () => {
    nova = null;
    desenhar();
  });

  return {
    iniciar(arquivoAtual) {
      atual = arquivoAtual || '';
      nova = undefined;
      desenhar();
    },
    mudou: () => nova !== undefined,
    // Envia a troca (ou remoção) da imagem depois que o texto foi salvo
    async salvar(id) {
      if (typeof nova === 'string') await banco.trocarImagem(id, nova);
      else if (nova === null && atual) await banco.removerImagem(id);
    },
  };
}

// ---------- Topo e conta ----------

// Monta a barra do topo; "atual" é o nome da seção ativa
function montarTopo(atual) {
  const nav = Object.values(SECOES)
    .map(s => `<a href="${s.pagina}" class="${s.nome === atual ? 'ativo' : ''}">${s.nome}</a>`)
    .join('');
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
