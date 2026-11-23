/* ============================================================
 *  QUADRO DE TAREFAS, RECOMPENSAS E MESADA — FRONT-END
 *  HTML/CSS/JS puro · PWA · Optimistic UI
 *
 *  API_URL abaixo = URL /exec da implantação do Apps Script.
 * ============================================================ */
const API_URL = 'https://script.google.com/macros/s/AKfycbyp7NOpGvkna3RvDMlQFsYMwv1Oz6Pgq7Ef6cJgTg6vk9aNENvifaRR_UKlrUIhb1z4/exec';

/* ------------------------------------------------------------
 *  Constantes
 * ---------------------------------------------------------- */
const K = {
  cache:    'qt.cache.v1',
  visual:   'qt.visual.v1',     // avatar + tema escolhidos neste aparelho
  marcos:   'qt.marcos.v1',     // metas já comemoradas (para não repetir o som)
  fila:     'qt.fila.v1',
  pin:      'qt.pin.v1',
  destrava: 'qt.destrava.v1'
};

/* Rotas por hash — permitem salvar um link direto para a área dos pais. */
const ROTAS = {
  '':               ['crianca', 'abaTarefas'],
  '#tarefas':       ['crianca', 'abaTarefas'],
  '#loja':          ['crianca', 'abaLoja'],
  '#eu':            ['crianca', 'abaPerfil'],
  '#pais':          ['pais',    'abaAprovacoes'],
  '#pais/aprovar':  ['pais',    'abaAprovacoes'],
  '#pais/tarefas':  ['pais',    'abaCrudTarefas'],
  '#pais/premios':  ['pais',    'abaCrudRecompensas'],
  '#pais/cofre':    ['pais',    'abaCofre'],
  '#pais/mesada':   ['pais',    'abaMesada']
};
const HASH_DA_ABA = {
  abaTarefas: '#tarefas', abaLoja: '#loja', abaPerfil: '#eu', abaCofre: '#pais/cofre',
  abaAprovacoes: '#pais', abaCrudTarefas: '#pais/tarefas',
  abaCrudRecompensas: '#pais/premios', abaMesada: '#pais/mesada'
};
const DIAS_DESTRAVA = 30;

const PERIODOS = [
  { id: 'manha',    rotulo: 'Manhã',        emoji: '🌅' },
  { id: 'tarde',    rotulo: 'Tarde',        emoji: '☀️' },
  { id: 'noite',    rotulo: 'Noite',        emoji: '🌙' },
  { id: 'qualquer', rotulo: 'Qualquer hora', emoji: '🕐' }
];

const NOMES_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const AVATARES = ['🦊', '🐱', '🐶', '🐼', '🐨', '🦄', '🐯', '🐸', '🐧', '🦉', '🐰', '🦋',
  '🌟', '🚀', '🎸', '⚽', '🧚', '🦕'];
const TEMAS = [
  { id: 'lilas',  nome: 'Lilás',  cor: 'linear-gradient(135deg,#6d4bd8,#4f32ad)' },
  { id: 'oceano', nome: 'Azul',   cor: 'linear-gradient(135deg,#1f7ae0,#14559e)' },
  { id: 'menta',  nome: 'Verde',  cor: 'linear-gradient(135deg,#12a07a,#0b6d53)' },
  { id: 'rosa',   nome: 'Rosa',   cor: 'linear-gradient(135deg,#e0397f,#ab2460)' },
  { id: 'escuro', nome: 'Escuro', cor: 'linear-gradient(135deg,#2a2440,#15121f)' }
];
const PREFIXO_RESGATE = 'rec:';

const CACHE_VAZIO = {
  hoje: null,
  config: { nome_crianca: 'Oi!', valor_mesada_base: 0, valor_por_ponto: 0 },
  tarefas: [],
  recompensas: [],
  registros: [],
  pendentes: [],
  saldo_servidor: 0,
  mesada: {},
  aviso_foto: '',
  extrato: [],
  sonhos: [],
  pausas: {},
  medalhas: [],
  saldo_cofre: 0,
  escudos: 0,
  atualizado_em: 0
};

/* ------------------------------------------------------------
 *  Estado
 * ---------------------------------------------------------- */
let cache = carregar(K.cache, CACHE_VAZIO);
let fila  = carregar(K.fila, []);
let pinLocal = carregar(K.pin, null);
if (pinLocal !== null && pinLocal !== undefined) pinLocal = String(pinLocal);

let vista = 'crianca';
let abaCrianca = 'abaTarefas';
let abaPais = 'abaAprovacoes';
let periodoMesada = 'semana';
let sincronizando = false;
let timerRetry = null;
let tentativas = 0;
let pinDigitado = '';
let aoValidarPin = null;
let visual = carregar(K.visual, { avatar: '🦊', tema: 'lilas' });
let marcos = carregar(K.marcos, {});
let mesCalendario = null;        // 'AAAA-MM' exibido no calendário (null = mês atual)
let sessaoPais = false;
let destravaAte = Number(carregar(K.destrava, 0)) || 0;
let aplicandoRota = false;

/* ------------------------------------------------------------
 *  Utilitários de armazenamento
 * ---------------------------------------------------------- */
function carregar(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return estruturaClonada(padrao);
    const v = JSON.parse(bruto);
    if (v && typeof v === 'object' && padrao && typeof padrao === 'object' && !Array.isArray(padrao)) {
      return Object.assign(estruturaClonada(padrao), v);
    }
    return v;
  } catch (e) {
    return estruturaClonada(padrao);
  }
}

function salvar(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* cota cheia: ignora */ }
}

function estruturaClonada(o) { return o === undefined ? o : JSON.parse(JSON.stringify(o)); }

/** Este aparelho já tem avatar/tema escolhidos? */
function temVisualLocal() {
  try { return !!localStorage.getItem(K.visual); } catch (e) { return false; }
}

function persistirCache() { salvar(K.cache, cache); }
function persistirFila()  { salvar(K.fila, fila); }

/* ------------------------------------------------------------
 *  Datas
 * ---------------------------------------------------------- */
function hojeISO(d) {
  const x = d || new Date();
  return x.getFullYear() + '-' + dois(x.getMonth() + 1) + '-' + dois(x.getDate());
}
function dois(n) { return String(n).padStart(2, '0'); }
function parseISO(s) {
  const p = String(s).split('-');
  return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0);
}
function somarDias(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return hojeISO(d);
}
function dataCurta(iso) {
  const d = parseISO(iso);
  return dois(d.getDate()) + '/' + dois(d.getMonth() + 1);
}
function uid() {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function dinheiro(v) {
  return 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ',');
}

/* ------------------------------------------------------------
 *  FOTO: compressão no navegador (canvas)
 *  Reduz para no máximo 640px no maior lado e exporta JPEG 0.6,
 *  o que costuma dar entre 25 KB e 60 KB por foto.
 * ---------------------------------------------------------- */
const FOTO_MAX_LADO = 640;
const FOTO_QUALIDADE = 0.6;

function comprimirImagem(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo || !/^image\//.test(arquivo.type || '')) return reject(new Error('Arquivo não é uma imagem'));
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      try {
        const escala = Math.min(1, FOTO_MAX_LADO / Math.max(img.naturalWidth, img.naturalHeight));
        const largura = Math.max(1, Math.round(img.naturalWidth * escala));
        const altura = Math.max(1, Math.round(img.naturalHeight * escala));
        const c = document.createElement('canvas');
        c.width = largura;
        c.height = altura;
        const cx = c.getContext('2d');
        cx.fillStyle = '#ffffff';            // JPEG não tem transparência
        cx.fillRect(0, 0, largura, altura);
        cx.drawImage(img, 0, 0, largura, altura);
        const dataUrl = c.toDataURL('image/jpeg', FOTO_QUALIDADE);
        URL.revokeObjectURL(url);
        resolve({ dataUrl, largura, altura, bytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75) });
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não deu para ler a imagem')); };
    img.src = url;
  });
}

function tamanhoLegivel(bytes) {
  return bytes >= 1024 * 1024
    ? (bytes / 1024 / 1024).toFixed(1) + ' MB'
    : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

/* ------------------------------------------------------------
 *  API (CORS-safe)
 *   - GET  : querystring
 *   - POST : Content-Type text/plain  → requisição "simples", sem preflight
 *   - fallback JSONP para GET quando o fetch falha por CORS
 * ---------------------------------------------------------- */
function apiConfigurada() {
  return API_URL && API_URL.indexOf('http') === 0;
}

async function apiGet(action, params = {}) {
  if (!apiConfigurada()) throw new Error('API_URL não configurada no app.js');
  const qs = new URLSearchParams(Object.assign({ action }, params));
  const url = API_URL + '?' + qs.toString();
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return conferir(await r.json());
  } catch (e) {
    // Resposta válida com erro de regra não é problema de rede: não tenta JSONP.
    if (e.doServidor) throw e;
    return conferir(await jsonp(url));
  }
}

async function apiPost(action, payload = {}) {
  if (!apiConfigurada()) throw new Error('API_URL não configurada no app.js');
  const r = await fetch(API_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload })
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return conferir(await r.json());
}

function conferir(resp) {
  if (!resp || resp.ok !== true) {
    const err = new Error((resp && resp.erro) || 'Resposta inválida do servidor');
    err.doServidor = true;
    throw err;
  }
  return resp;
}

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const nome = '__qt_cb_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    const limpar = () => { delete window[nome]; script.remove(); };
    const t = setTimeout(() => { limpar(); reject(new Error('Tempo esgotado')); }, 20000);
    window[nome] = (dados) => { clearTimeout(t); limpar(); resolve(dados); };
    script.onerror = () => { clearTimeout(t); limpar(); reject(new Error('Falha de rede')); };
    script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + nome;
    document.head.appendChild(script);
  });
}

/* ------------------------------------------------------------
 *  FILA DE SINCRONIZAÇÃO (silenciosa, em segundo plano)
 * ---------------------------------------------------------- */
function enfileirar(action, payload, delta) {
  fila.push({
    key: uid(),
    action,
    payload,
    delta: Number(delta) || 0,
    tentativas: 0,
    criado_em: Date.now()
  });
  persistirFila();
  agendarFlush(80);
}

function agendarFlush(ms) {
  clearTimeout(timerRetry);
  timerRetry = setTimeout(flush, ms);
}

async function flush() {
  if (sincronizando || !fila.length || !navigator.onLine || !apiConfigurada()) {
    atualizarStatusSync();
    return;
  }
  sincronizando = true;
  atualizarStatusSync();

  while (fila.length) {
    const item = fila[0];
    try {
      const resp = await apiPost(item.action, item.payload);
      fila.shift();
      persistirFila();
      tentativas = 0;
      // O servidor aceitou a tarefa mas não conseguiu guardar a foto.
      if (resp.foto_erro) {
        cache.aviso_foto = String(resp.foto_erro);
        toast('⚠️ A foto não foi salva — veja o aviso na área dos pais');
      } else if (resp.registro && resp.registro.foto_url) {
        cache.aviso_foto = '';
      }
      if (typeof resp.saldo === 'number') cache.saldo_servidor = resp.saldo - deltaFila();
      persistirCache();
    } catch (e) {
      if (e.doServidor) {
        // Erro de regra de negócio: descarta o item e ressincroniza (rollback).
        fila.shift();
        persistirFila();
        toast('⚠️ ' + e.message);
        sincronizando = false;
        atualizarStatusSync();
        await atualizarDoServidor(true);
        return;
      }
      // Erro de rede: mantém na fila e tenta de novo com backoff.
      item.tentativas++;
      persistirFila();
      tentativas++;
      sincronizando = false;
      atualizarStatusSync();
      agendarFlush(Math.min(30000, 1500 * Math.pow(2, Math.min(tentativas, 4))));
      return;
    }
  }

  sincronizando = false;
  atualizarStatusSync();
  await atualizarDoServidor(true);
}

function deltaFila() {
  return fila.reduce((s, i) => s + (Number(i.delta) || 0), 0);
}

function atualizarStatusSync() {
  const el = document.getElementById('statusSync');
  if (!el) return;
  if (!apiConfigurada()) {
    el.textContent = '⚙️ API não configurada';
    el.classList.add('visivel');
    return;
  }
  if (!navigator.onLine) {
    el.textContent = '📴 Offline — salvo no aparelho';
    el.classList.add('visivel');
  } else if (fila.length) {
    el.textContent = '🔄 Sincronizando (' + fila.length + ')';
    el.classList.add('visivel');
  } else {
    el.classList.remove('visivel');
  }
  document.querySelectorAll('[data-sync-badge]').forEach(n => n.remove());
}

/* ------------------------------------------------------------
 *  Atualização a partir do servidor (background refresh)
 * ---------------------------------------------------------- */
async function atualizarDoServidor(silencioso) {
  if (!apiConfigurada() || !navigator.onLine) { atualizarStatusSync(); return; }
  try {
    const d = await apiGet('bootstrap', { data: hojeISO() });
    cache.hoje = d.hoje;
    cache.config = d.config || cache.config;
    cache.tarefas = d.tarefas || [];
    cache.recompensas = d.recompensas || [];
    const registrosLocais = cache.registros.filter(r => r._local && filaTem(r.id));
    const pendentesLocais = cache.pendentes.filter(r => r._local && filaTem(r.id));
    cache.registros = d.registros_recentes || d.registros_hoje || [];
    cache.pendentes = d.pendentes || [];
    // ainda não sincronizados (ex.: foto subindo): mantém a versão local
    registrosLocais.forEach(r => { if (!cache.registros.some(x => x.id === r.id)) cache.registros.push(r); });
    pendentesLocais.forEach(r => { if (!cache.pendentes.some(x => x.id === r.id)) cache.pendentes.unshift(r); });
    cache.saldo_servidor = Number(d.saldo) || 0;
    cache.extrato = d.extrato || [];
    cache.sonhos = d.sonhos || [];
    cache.pausas = d.pausas || {};
    cache.medalhas = d.medalhas || [];
    cache.saldo_cofre = Number(d.saldo_cofre) || 0;
    cache.escudos = Number(d.escudos) || 0;
    cache.escudos_usados = d.escudos_usados || [];
    if (d.config && d.config.avatar_crianca && !temVisualLocal()) {
      visual = { avatar: d.config.avatar_crianca, tema: d.config.tema_app || 'lilas' };
      salvar(K.visual, visual);
      aplicarVisual();
    }
    cache.atualizado_em = Date.now();
    persistirCache();
    renderTudo();
    verificarMarcos();
    if (fila.length) agendarFlush(500);
  } catch (e) {
    if (!silencioso) toast('Não deu para atualizar agora 🙈');
  }
  atualizarStatusSync();
}

/* ------------------------------------------------------------
 *  Regras de negócio (espelho do backend, para a UI otimista)
 * ---------------------------------------------------------- */
function ehResgate(tarefaId) { return String(tarefaId).indexOf(PREFIXO_RESGATE) === 0; }

function tarefaNoDia(t, dow, iso) {
  switch (t.recorrencia) {
    case 'diaria': return true;
    case 'semana': return dow >= 1 && dow <= 5;
    case 'fimdesemana': return dow === 0 || dow === 6;
    case 'unica': return !!iso && String(t.dias || '').trim() === iso;   // missão relâmpago
    case 'dias':
      return String(t.dias || '').split(/[^0-9]+/).filter(Boolean).map(Number).includes(dow);
    default: return true;
  }
}

function tarefasDoDia(iso) {
  const dow = parseISO(iso).getDay();
  return cache.tarefas.filter(t => t.ativa === 'sim' && tarefaNoDia(t, dow, iso));
}

function diaPausado(iso) { return !!(cache.pausas && cache.pausas[iso]); }

function saldoCofre() {
  return (cache.extrato || []).reduce(
    (s, m) => s + (m.tipo === 'saida' ? -Math.abs(m.valor) : Math.abs(m.valor)), 0);
}

function registrosDoDia(iso) {
  return cache.registros.filter(r => r.data === iso);
}

function registroDaTarefa(tarefaId, iso) {
  return registrosDoDia(iso).filter(r => r.tarefa_id === tarefaId && r.status !== 'rejeitada')[0]
      || registrosDoDia(iso).filter(r => r.tarefa_id === tarefaId)[0]
      || null;
}

function saldoAtual() {
  return (Number(cache.saldo_servidor) || 0) + deltaFila();
}

function streakAtual(iso) {
  const feitos = {};
  cache.registros.forEach(r => {
    if (r.status === 'rejeitada' || ehResgate(r.tarefa_id)) return;
    (feitos[r.data] = feitos[r.data] || {})[r.tarefa_id] = true;
  });
  const completo = (dia) => {
    const basicas = tarefasDoDia(dia).filter(t => t.tipo === 'basica');
    if (!basicas.length) return false;
    const f = feitos[dia] || {};
    return basicas.every(t => f[t.id]);
  };
  const escudados = {};
  (cache.escudos_usados || []).forEach(d => { escudados[d] = true; });

  let s = 0;
  let cursor = completo(iso) ? iso : somarDias(iso, -1);
  let guard = 0;
  while (guard++ < 400) {
    if (diaPausado(cursor) || escudados[cursor]) { cursor = somarDias(cursor, -1); continue; }
    if (!completo(cursor)) break;
    s++;
    cursor = somarDias(cursor, -1);
  }
  return s;
}

/* ------------------------------------------------------------
 *  AÇÕES DA CRIANÇA (optimistic)
 * ---------------------------------------------------------- */
function concluirTarefa(tarefa, elemento, foto) {
  const hoje = hojeISO();
  if (registroDaTarefa(tarefa.id, hoje)) return;

  const precisa = tarefa.precisa_aprova === 'sim';
  const pontos = tarefa.tipo === 'extra' ? Number(tarefa.pontos) || 0 : 0;
  const id = uid();

  const registro = {
    id,
    data: hoje,
    tarefa_id: tarefa.id,
    status: precisa ? 'pendente_aprovacao' : 'aprovada',
    pontos_ganhos: precisa ? 0 : pontos,
    aprovado_em: precisa ? '' : new Date().toISOString(),
    foto_url: foto || '',          // prévia local até o upload terminar
    _foto_local: !!foto,
    _local: true
  };
  cache.registros.push(registro);
  if (precisa) {
    cache.pendentes.unshift(Object.assign({}, registro, {
      kind: 'tarefa', titulo: tarefa.titulo, icone: tarefa.icone, tipo: tarefa.tipo,
      pontos, precisa_foto: tarefa.precisa_foto
    }));
  }
  persistirCache();

  const payload = { id, tarefa_id: tarefa.id, data: hoje };
  if (foto) payload.foto = foto;
  enfileirar('concluir', payload, precisa ? 0 : pontos);

  renderCrianca();
  if (precisa) {
    Som.tocar('enviado');                                  // 2 notas subindo
    toast(foto ? '📸 Foto enviada para aprovação!' : '👏 Enviado para aprovação!');
  } else {
    Som.tocar(tarefa.conta_mesada === 'sim' ? 'moeda' : 'pop');
    confete(elemento);
    animarSaldo();
    toast(pontos > 0 ? ('🎉 +' + pontos + ' pontos!') : '🎉 Muito bem!');
  }
  verificarMarcos();
}

/* Fluxo da foto: abre a câmera, comprime, mostra a prévia e só então conclui. */
let fotoPendente = null;   // { tarefa, elemento, dataUrl, bytes, largura, altura }

function pedirFoto(tarefa, elemento) {
  fotoPendente = { tarefa, elemento, dataUrl: null };
  const input = document.getElementById('inputFoto');
  input.value = '';
  input.click();
}

async function aoEscolherFoto(arquivo) {
  if (!arquivo || !fotoPendente) return;
  toast('🗜️ Preparando a foto...');
  try {
    const r = await comprimirImagem(arquivo);
    fotoPendente.dataUrl = r.dataUrl;
    fotoPendente.bytes = r.bytes;
    document.getElementById('previaImg').src = r.dataUrl;
    document.getElementById('previaTarefa').textContent =
      (fotoPendente.tarefa.icone || '') + ' ' + fotoPendente.tarefa.titulo;
    document.getElementById('previaInfo').textContent =
      r.largura + '×' + r.altura + ' · ' + tamanhoLegivel(r.bytes);
    document.getElementById('modalPrevia').classList.remove('oculto');
  } catch (e) {
    toast('😕 Não deu para usar essa foto');
    fotoPendente = null;
  }
}

function fecharPrevia() {
  document.getElementById('modalPrevia').classList.add('oculto');
  document.getElementById('previaImg').removeAttribute('src');
  fotoPendente = null;
}

function enviarComprovacao() {
  if (!fotoPendente || !fotoPendente.dataUrl) return;
  const { tarefa, elemento, dataUrl } = fotoPendente;
  document.getElementById('modalPrevia').classList.add('oculto');
  document.getElementById('previaImg').removeAttribute('src');
  fotoPendente = null;
  concluirTarefa(tarefa, elemento, dataUrl);   // UI responde na hora; upload vai na fila
}

function ampliarFoto(url) {
  if (!url) return;
  document.getElementById('fotoGrandeImg').src = url;
  document.getElementById('modalFoto').classList.remove('oculto');
}

function fecharFotoGrande() {
  document.getElementById('modalFoto').classList.add('oculto');
  document.getElementById('fotoGrandeImg').removeAttribute('src');
}

function desfazerTarefa(tarefa) {
  const hoje = hojeISO();
  const reg = registroDaTarefa(tarefa.id, hoje);
  if (!reg) return;
  if (reg.status === 'aprovada' && tarefa.precisa_aprova === 'sim') {
    toast('Essa já foi aprovada 😊');
    return;
  }
  cache.registros = cache.registros.filter(r => r.id !== reg.id);
  cache.pendentes = cache.pendentes.filter(r => r.id !== reg.id);
  persistirCache();
  enfileirar('desfazer', { id: reg.id, tarefa_id: tarefa.id, data: hoje }, -(Number(reg.pontos_ganhos) || 0));
  renderCrianca();
  Som.vibrar(10);
}

function pedirResgate(rec) {
  if (saldoAtual() < rec.custo_pontos) { toast('Faltam pontos 😅'); return; }
  const id = uid();
  const hoje = hojeISO();
  const registro = {
    id, data: hoje,
    tarefa_id: PREFIXO_RESGATE + rec.id,
    status: 'pendente_aprovacao',
    pontos_ganhos: -rec.custo_pontos,
    aprovado_em: '',
    _local: true
  };
  cache.registros.push(registro);
  cache.pendentes.unshift(Object.assign({}, registro, {
    kind: 'resgate', titulo: rec.titulo, icone: rec.icone, custo_pontos: rec.custo_pontos
  }));
  persistirCache();
  enfileirar('resgatar', { id, recompensa_id: rec.id, data: hoje }, -rec.custo_pontos);
  renderCrianca();
  Som.tocar('levelup');                                    // resgate é meta alcançada
  confete();
  toast('🎁 Pedido enviado! Espere a autorização.');
}

/* ------------------------------------------------------------
 *  AÇÕES DOS PAIS (optimistic)
 * ---------------------------------------------------------- */
function decidir(registroId, aprovar) {
  const pend = cache.pendentes.filter(p => p.id === registroId)[0];
  if (!pend) return;
  const reg = cache.registros.filter(r => r.id === registroId)[0];

  let delta = 0;
  if (aprovar) {
    if (pend.kind === 'resgate') delta = 0;            // pontos já reservados no pedido
    else delta = Number(pend.pontos) || 0;
  } else {
    if (pend.kind === 'resgate') delta = Math.abs(Number(pend.custo_pontos) || 0); // devolve
    else delta = 0;
  }

  const novoStatus = aprovar ? 'aprovada' : 'rejeitada';
  if (reg) {
    reg.status = novoStatus;
    if (aprovar && pend.kind !== 'resgate') reg.pontos_ganhos = Number(pend.pontos) || 0;
    if (!aprovar) reg.pontos_ganhos = 0;
  }
  cache.pendentes = cache.pendentes.filter(p => p.id !== registroId);
  persistirCache();

  enfileirar(aprovar ? 'aprovar' : 'rejeitar', { id: registroId, pin: pinLocal }, delta);
  renderPais();
  Som.tocar(aprovar ? 'aprovado' : 'recusado');
  toast(aprovar ? '✅ Aprovado' : '🚫 Recusado');
}

function salvarTarefa(dados) {
  const existente = cache.tarefas.filter(t => t.id === dados.id)[0];
  if (existente) Object.assign(existente, dados);
  else cache.tarefas.push(Object.assign({ criada_em: new Date().toISOString() }, dados));
  persistirCache();
  enfileirar('salvar_tarefa', Object.assign({ pin: pinLocal }, dados), 0);
  renderPais();
  toast('💾 Tarefa salva');
}

function excluirTarefa(id) {
  cache.tarefas = cache.tarefas.filter(t => t.id !== id);
  persistirCache();
  enfileirar('excluir_tarefa', { id, pin: pinLocal }, 0);
  renderPais();
  toast('🗑️ Tarefa excluída');
}

function salvarRecompensa(dados) {
  const existente = cache.recompensas.filter(r => r.id === dados.id)[0];
  if (existente) Object.assign(existente, dados);
  else cache.recompensas.push(dados);
  persistirCache();
  enfileirar('salvar_recompensa', Object.assign({ pin: pinLocal }, dados), 0);
  renderPais();
  toast('💾 Recompensa salva');
}

function excluirRecompensa(id) {
  cache.recompensas = cache.recompensas.filter(r => r.id !== id);
  persistirCache();
  enfileirar('excluir_recompensa', { id, pin: pinLocal }, 0);
  renderPais();
  toast('🗑️ Recompensa excluída');
}

function salvarConfig(itens) {
  cache.config = Object.assign({}, cache.config, itens);
  if (itens.pin_pais) { pinLocal = String(itens.pin_pais); salvar(K.pin, pinLocal); }
  delete cache.config.pin_pais;
  persistirCache();
  enfileirar('salvar_config', { pin: pinLocal, config: itens }, 0);
  renderPais();
  toast('💾 Configurações salvas');
}

/* ------------------------------------------------------------
 *  Visual: avatar e tema
 * ---------------------------------------------------------- */
function aplicarVisual() {
  const tema = TEMAS.some(t => t.id === visual.tema) ? visual.tema : 'lilas';
  document.documentElement.setAttribute('data-tema', tema);
  const cor = tema === 'escuro' ? '#15121f'
    : getComputedStyle(document.documentElement).getPropertyValue('--roxo').trim() || '#6d4bd8';
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', cor);
  ['avatarEmoji', 'avatarEmoji2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = visual.avatar || '🦊';
  });
}

function salvarVisual(avatar, tema) {
  visual = { avatar: avatar || visual.avatar, tema: tema || visual.tema };
  salvar(K.visual, visual);
  aplicarVisual();
  cache.config = Object.assign({}, cache.config, { avatar_crianca: visual.avatar, tema_app: visual.tema });
  persistirCache();
  enfileirar('salvar_personalizacao', { avatar_crianca: visual.avatar, tema_app: visual.tema }, 0);
}

/* ------------------------------------------------------------
 *  Comemorações (som de "level up" sem repetir)
 * ---------------------------------------------------------- */
function comemorar(chave, elemento) {
  if (marcos[chave]) return false;
  marcos[chave] = Date.now();
  // guarda no máximo os 80 marcos mais recentes
  const chaves = Object.keys(marcos);
  if (chaves.length > 80) {
    chaves.sort((a, b) => marcos[a] - marcos[b]).slice(0, chaves.length - 80)
      .forEach(k => { delete marcos[k]; });
  }
  salvar(K.marcos, marcos);
  Som.tocar('levelup');
  confete(elemento);
  return true;
}

/** Olha o estado atual e comemora o que for novidade. */
function verificarMarcos() {
  const hoje = hojeISO();
  const basicas = tarefasDoDia(hoje).filter(t => t.tipo === 'basica');
  const feitas = basicas.filter(t => {
    const r = registroDaTarefa(t.id, hoje);
    return r && r.status !== 'rejeitada';
  }).length;

  if (basicas.length && feitas === basicas.length) {
    if (comemorar('dia:' + hoje)) toast('🏆 Tudo pronto hoje! Mandou bem!');
  }
  (cache.medalhas || []).forEach(m => {
    if (m.desbloqueada && comemorar('medalha:' + m.id)) toast(m.icone + ' Nova medalha: ' + m.titulo + '!');
  });
  (cache.sonhos || []).forEach(s => {
    const atual = s.tipo_meta === 'pontos' ? saldoAtual() : saldoCofre();
    if (s.valor_alvo > 0 && atual >= s.valor_alvo && comemorar('sonho:' + s.id)) {
      toast(s.icone + ' Você juntou o suficiente para: ' + s.titulo + '!');
    }
  });
}

/* ------------------------------------------------------------
 *  RENDER — criança
 * ---------------------------------------------------------- */
function renderTudo() {
  renderCrianca();
  if (vista === 'pais') renderPais();
  atualizarStatusSync();
}

function renderCrianca() {
  const hoje = hojeISO();
  const nome = cache.config.nome_crianca || 'Oi!';
  const hora = new Date().getHours();
  document.getElementById('saudacaoTexto').textContent =
    hora < 12 ? 'Bom dia,' : hora < 18 ? 'Boa tarde,' : 'Boa noite,';
  document.getElementById('nomeCrianca').textContent = nome;

  document.getElementById('statSaldo').textContent = saldoAtual();
  const streak = streakAtual(hoje);
  document.getElementById('statStreak').textContent = streak;
  document.getElementById('statStreakLabel').textContent = streak === 1 ? 'dia seguido' : 'dias seguidos';
  const elEscudos = document.getElementById('statEscudos');
  elEscudos.textContent = '🛡️ ' + (cache.escudos || 0);
  elEscudos.classList.toggle('oculto', !cache.escudos);
  document.getElementById('lojaSaldo').textContent = saldoAtual();

  // progresso das básicas do dia
  const doDia = tarefasDoDia(hoje);
  const basicas = doDia.filter(t => t.tipo === 'basica');
  const feitas = basicas.filter(t => {
    const r = registroDaTarefa(t.id, hoje);
    return r && r.status !== 'rejeitada';
  }).length;
  const pct = basicas.length ? Math.round((feitas / basicas.length) * 100) : 0;

  document.getElementById('progressoTexto').textContent = feitas + ' / ' + basicas.length;
  document.getElementById('barraFill').style.width = pct + '%';
  document.getElementById('barraProgresso').setAttribute('aria-valuenow', String(pct));
  document.getElementById('progressoMsg').textContent =
    !basicas.length ? 'Hoje é dia livre! 🎈' :
    pct === 100 ? 'Tudo pronto hoje! Você arrasou! 🏆' :
    pct >= 50 ? 'Já passou da metade, continua! 💪' :
    feitas > 0 ? 'Bom começo! 🌟' : 'Vamos começar! 🚀';

  renderListaTarefas(doDia, hoje);
  renderLoja(hoje);
  renderPerfil();
}

function renderListaTarefas(doDia, hoje) {
  const alvo = document.getElementById('listaTarefas');
  alvo.innerHTML = '';

  if (!cache.tarefas.length) {
    alvo.appendChild(vazio('📋', apiConfigurada()
      ? 'Nenhuma tarefa cadastrada ainda. Peça para o papai ou a mamãe criar na área dos pais.'
      : 'Configure a URL da API no app.js para carregar as tarefas.'));
    return;
  }
  if (!doDia.length) {
    alvo.appendChild(vazio('🎈', 'Nenhuma tarefa para hoje. Aproveite!'));
    return;
  }

  PERIODOS.forEach(p => {
    const lista = doDia.filter(t => (t.periodo || 'qualquer') === p.id);
    if (!lista.length) return;

    const feitasGrupo = lista.filter(t => {
      const r = registroDaTarefa(t.id, hoje);
      return r && r.status !== 'rejeitada';
    }).length;

    const grupo = document.createElement('div');
    grupo.innerHTML =
      '<div class="grupo-titulo"><span aria-hidden="true">' + p.emoji + '</span>' + p.rotulo +
      '<span class="contador">' + feitasGrupo + '/' + lista.length + '</span></div>';

    const ul = document.createElement('div');
    ul.className = 'lista';
    lista
      .sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'basica' ? -1 : 1))
      .forEach(t => ul.appendChild(cartaoTarefa(t, hoje)));
    grupo.appendChild(ul);
    alvo.appendChild(grupo);
  });
}

function cartaoTarefa(t, hoje) {
  const reg = registroDaTarefa(t.id, hoje);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tarefa';

  let marca = '';
  if (reg) {
    if (reg.status === 'aprovada') { btn.classList.add('feita'); marca = '✓'; }
    else if (reg.status === 'pendente_aprovacao') { btn.classList.add('pendente'); marca = '⏳'; }
    else { btn.classList.add('rejeitada'); marca = '✕'; }
    if (reg._local && filaTem(reg.id)) btn.classList.add('sync');
  }

  const metas = [];
  if (t.tipo === 'extra' && t.pontos > 0) metas.push('<span class="pts">+' + t.pontos + ' pts</span>');
  if (t.precisa_foto === 'sim') metas.push('<span class="camera" title="Precisa de foto">📷 foto</span>');
  if (t.precisa_aprova === 'sim') metas.push('precisa de autorização');
  if (reg && reg.status === 'pendente_aprovacao') metas.push('aguardando aprovação');
  if (reg && reg.status === 'rejeitada') metas.push('não foi aprovada');

  const foto = reg && reg.foto_url ? reg.foto_url : '';

  btn.innerHTML =
    '<span class="icone" aria-hidden="true">' + escapar(t.icone || '⭐') + '</span>' +
    '<span class="corpo">' +
      '<span class="titulo">' + escapar(t.titulo) + '</span>' +
      '<span class="meta">' + metas.map(m => m.indexOf('<span') === 0 ? m : '<span>' + m + '</span>').join('') + '</span>' +
    '</span>' +
    (foto ? '<img class="miniatura" src="' + escapar(foto) + '" alt="Foto" loading="lazy">' : '') +
    '<span class="marca" aria-hidden="true">' + marca + '</span>';

  btn.setAttribute('aria-label', t.titulo + (reg ? ' — concluída' : ''));

  const mini = btn.querySelector('.miniatura');
  if (mini) mini.addEventListener('click', ev => { ev.stopPropagation(); ampliarFoto(foto); });

  btn.addEventListener('click', () => {
    if (!reg) {
      if (t.precisa_foto === 'sim') pedirFoto(t, btn);
      else concluirTarefa(t, btn);
    } else if (reg.status === 'rejeitada') {
      cache.registros = cache.registros.filter(r => r.id !== reg.id);
      persistirCache();
      renderCrianca();
    } else {
      desfazerTarefa(t);
    }
  });
  return btn;
}

function filaTem(registroId) {
  return fila.some(i => i.payload && i.payload.id === registroId);
}

function renderLoja(hoje) {
  const alvo = document.getElementById('listaRecompensas');
  alvo.innerHTML = '';
  const ativas = cache.recompensas.filter(r => r.ativa === 'sim');

  if (!ativas.length) {
    alvo.appendChild(vazio('🎁', 'A lojinha está sendo montada...'));
  } else {
    const saldo = saldoAtual();
    ativas.sort((a, b) => a.custo_pontos - b.custo_pontos).forEach(r => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'recompensa' + (saldo >= r.custo_pontos ? ' resgatavel' : '');
      b.disabled = saldo < r.custo_pontos;
      b.innerHTML =
        '<span class="icone" aria-hidden="true">' + escapar(r.icone || '🎁') + '</span>' +
        '<span class="titulo">' + escapar(r.titulo) + '</span>' +
        '<span class="custo">' + r.custo_pontos + ' pts</span>';
      b.addEventListener('click', () => pedirResgate(r));
      alvo.appendChild(b);
    });
  }

  // Meus pedidos (resgates dos últimos 30 dias)
  const pedidos = cache.registros
    .filter(r => ehResgate(r.tarefa_id) && r.data >= somarDias(hoje, -30))
    .sort((a, b) => (a.data < b.data ? 1 : -1));
  const alvoPedidos = document.getElementById('listaMeusPedidos');
  alvoPedidos.innerHTML = '';
  if (!pedidos.length) {
    alvoPedidos.appendChild(vazio('🛒', 'Você ainda não pediu nenhum prêmio.'));
    return;
  }
  pedidos.forEach(p => {
    const rec = cache.recompensas.filter(r => PREFIXO_RESGATE + r.id === p.tarefa_id)[0];
    const div = document.createElement('div');
    div.className = 'pedido';
    const tag = p.status === 'aprovada' ? 'aprovada' : p.status === 'rejeitada' ? 'rejeitada' : 'pendente';
    const rotulo = { aprovada: 'liberado', rejeitada: 'não liberado', pendente: 'aguardando' }[tag];
    div.innerHTML =
      '<span class="icone" aria-hidden="true">' + escapar(rec ? rec.icone : '🎁') + '</span>' +
      '<span>' + escapar(rec ? rec.titulo : 'Prêmio') + '<br><small>' + dataCurta(p.data) + '</small></span>' +
      '<span class="tag ' + tag + '">' + rotulo + '</span>';
    alvoPedidos.appendChild(div);
  });
}

/* ------------------------------------------------------------
 *  RENDER — pais
 * ---------------------------------------------------------- */
function renderPais() {
  renderResumoPais();
  renderPendentes();
  renderHistoricoFotos();
  renderCofre();
  renderPausas();
  renderCalendario('calendarioPais', true);
  renderCrudTarefas();
  renderCrudRecompensas();
  renderMesada();
  preencherFormConfig();

  const badge = document.getElementById('badgePendentes');
  const n = cache.pendentes.length;
  badge.textContent = n;
  badge.classList.toggle('oculto', n === 0);
}

function renderResumoPais() {
  const alvo = document.getElementById('resumoPais');
  if (!alvo) return;
  const hoje = hojeISO();
  const basicas = tarefasDoDia(hoje).filter(t => t.tipo === 'basica');
  const feitas = basicas.filter(t => {
    const r = registroDaTarefa(t.id, hoje);
    return r && r.status !== 'rejeitada';
  }).length;
  const pct = basicas.length ? Math.round((feitas / basicas.length) * 100) : 0;
  const nPend = cache.pendentes.length;
  const m = cache.mesada.semana;

  alvo.innerHTML =
    (cache.aviso_foto
      ? '<div class="resumo-item alerta destaque-aviso"><strong>⚠️ Fotos não estão sendo salvas</strong>' +
        '<small>' + escapar(cache.aviso_foto) + '</small></div>'
      : '') +
    '<div class="resumo-item destaque">' +
      '<div class="linha"><small>Tarefas de hoje</small>' +
      '<span class="valor">' + feitas + '/' + basicas.length + '</span></div>' +
      '<div class="resumo-barra"><div style="width:' + pct + '%"></div></div>' +
      '<small>' + escapar(cache.config.nome_crianca || '') +
      ' · ' + saldoAtual() + (saldoAtual() === 1 ? ' ponto' : ' pontos') +
      ' · ' + streakAtual(hoje) + (streakAtual(hoje) === 1 ? ' dia seguido' : ' dias seguidos') + '</small>' +
    '</div>' +
    '<div class="resumo-item' + (nPend ? ' alerta' : '') + '">' +
      '<strong>' + nPend + '</strong><small>' +
      (nPend === 1 ? 'pedido aguardando você' : 'pedidos aguardando você') + '</small>' +
    '</div>' +
    '<div class="resumo-item"><strong>' + (m ? dinheiro(m.valor_total) : '—') + '</strong>' +
      '<small>mesada da semana' + (m ? ' · ' + m.pct_basicas + '% das obrigações' : '') + '</small></div>';
}

function renderPendentes() {
  const alvo = document.getElementById('listaPendentes');
  alvo.innerHTML = '';
  if (!cache.pendentes.length) {
    alvo.appendChild(vazio('🎉', 'Nada pendente por aqui!'));
    return;
  }
  cache.pendentes.forEach(p => {
    const div = document.createElement('div');
    div.className = 'cartao';
    const detalhe = p.kind === 'resgate'
      ? 'Resgate · ' + (p.custo_pontos || 0) + ' pontos'
      : 'Tarefa · ' + (p.pontos ? '+' + p.pontos + ' pontos' : 'sem pontos');
    const semFoto = p.precisa_foto === 'sim' && !p.foto_url;
    div.innerHTML =
      '<div class="cartao-linha">' +
        (p.foto_url
          ? '<img class="miniatura" src="' + escapar(p.foto_url) + '" alt="Foto" loading="lazy">'
          : (semFoto ? '<span class="sem-foto" aria-hidden="true">⏳</span>'
                     : '<span class="icone" aria-hidden="true">' + escapar(p.icone || '✅') + '</span>')) +
        '<span class="corpo">' +
          '<span class="titulo">' + escapar(p.titulo) + '</span>' +
          '<span class="meta">' + detalhe + ' · ' + dataCurta(p.data) +
          (p.foto_url ? ' · toque na foto para ampliar' : (semFoto ? ' · foto subindo...' : '')) + '</span>' +
        '</span>' +
      '</div>' +
      '<div class="cartao-acoes">' +
        '<button class="btn-primario pequeno" data-ok="1">Aprovar</button>' +
        '<button class="btn-perigo" data-no="1">Recusar</button>' +
      '</div>';
    const mini = div.querySelector('.miniatura');
    if (mini) mini.addEventListener('click', () => ampliarFoto(p.foto_url));
    div.querySelector('[data-ok]').addEventListener('click', () => decidir(p.id, true));
    div.querySelector('[data-no]').addEventListener('click', () => decidir(p.id, false));
    alvo.appendChild(div);
  });
}

/** Fotos já decididas nos últimos 10 dias, para conferência depois. */
function renderHistoricoFotos() {
  const alvo = document.getElementById('listaHistorico');
  const titulo = document.getElementById('tituloHistorico');
  if (!alvo) return;
  const desde = somarDias(hojeISO(), -10);
  const itens = cache.registros
    .filter(r => r.foto_url && r.data >= desde && r.status !== 'pendente_aprovacao')
    .sort((a, b) => (a.data < b.data ? 1 : -1))
    .slice(0, 12);

  titulo.classList.toggle('oculto', itens.length === 0);
  alvo.innerHTML = '';
  if (!itens.length) return;

  itens.forEach(r => {
    const t = cache.tarefas.filter(x => x.id === r.tarefa_id)[0];
    const div = document.createElement('div');
    div.className = 'cartao';
    div.innerHTML =
      '<div class="cartao-linha">' +
        '<img class="miniatura" src="' + escapar(r.foto_url) + '" alt="Foto" loading="lazy">' +
        '<span class="corpo">' +
          '<span class="titulo">' + escapar(t ? t.titulo : 'Tarefa removida') + '</span>' +
          '<span class="meta">' + dataCurta(r.data) + ' · ' +
          (r.status === 'aprovada' ? '✅ aprovada' : '🚫 recusada') + '</span>' +
        '</span>' +
      '</div>';
    div.querySelector('.miniatura').addEventListener('click', () => ampliarFoto(r.foto_url));
    alvo.appendChild(div);
  });
}

function descricaoRecorrencia(t) {
  switch (t.recorrencia) {
    case 'diaria': return 'todos os dias';
    case 'semana': return 'seg a sex';
    case 'fimdesemana': return 'fim de semana';
    case 'dias':
      return String(t.dias || '').split(/[^0-9]+/).filter(Boolean)
        .map(n => NOMES_DIAS[Number(n)] || '?').join(', ') || 'dias não definidos';
    default: return t.recorrencia;
  }
}

function renderCrudTarefas() {
  const alvo = document.getElementById('listaCrudTarefas');
  alvo.innerHTML = '';
  if (!cache.tarefas.length) {
    alvo.appendChild(vazio('📋', 'Nenhuma tarefa cadastrada. Toque em “+ Nova”.'));
    return;
  }
  cache.tarefas.slice().sort((a, b) => a.titulo.localeCompare(b.titulo)).forEach(t => {
    const div = document.createElement('div');
    div.className = 'cartao' + (t.ativa === 'sim' ? '' : ' inativa');
    const meta = [
      t.tipo === 'extra' ? '+' + t.pontos + ' pts' : 'básica',
      (PERIODOS.filter(p => p.id === t.periodo)[0] || { rotulo: t.periodo }).rotulo,
      descricaoRecorrencia(t),
      t.precisa_aprova === 'sim' ? 'aprova' : null,
      t.precisa_foto === 'sim' ? '📷 foto' : null,
      t.conta_mesada === 'sim' ? 'mesada' : null,
      t.ativa === 'sim' ? null : 'inativa'
    ].filter(Boolean).join(' · ');
    div.innerHTML =
      '<div class="cartao-linha">' +
        '<span class="icone" aria-hidden="true">' + escapar(t.icone) + '</span>' +
        '<span class="corpo"><span class="titulo">' + escapar(t.titulo) + '</span>' +
        '<span class="meta">' + meta + '</span></span>' +
      '</div>' +
      '<div class="cartao-acoes">' +
        '<button class="btn-secundario" data-ed="1">Editar</button>' +
        '<button class="btn-perigo" data-del="1">Excluir</button>' +
      '</div>';
    div.querySelector('[data-ed]').addEventListener('click', () => abrirFormTarefa(t));
    div.querySelector('[data-del]').addEventListener('click', () => {
      if (confirm('Excluir a tarefa "' + t.titulo + '"?')) excluirTarefa(t.id);
    });
    alvo.appendChild(div);
  });
}

function renderCrudRecompensas() {
  const alvo = document.getElementById('listaCrudRecompensas');
  alvo.innerHTML = '';
  if (!cache.recompensas.length) {
    alvo.appendChild(vazio('🎁', 'Nenhuma recompensa cadastrada.'));
    return;
  }
  cache.recompensas.slice().sort((a, b) => a.custo_pontos - b.custo_pontos).forEach(r => {
    const div = document.createElement('div');
    div.className = 'cartao' + (r.ativa === 'sim' ? '' : ' inativa');
    div.innerHTML =
      '<div class="cartao-linha">' +
        '<span class="icone" aria-hidden="true">' + escapar(r.icone) + '</span>' +
        '<span class="corpo"><span class="titulo">' + escapar(r.titulo) + '</span>' +
        '<span class="meta">' + r.custo_pontos + ' pontos' + (r.ativa === 'sim' ? '' : ' · inativa') + '</span></span>' +
      '</div>' +
      '<div class="cartao-acoes">' +
        '<button class="btn-secundario" data-ed="1">Editar</button>' +
        '<button class="btn-perigo" data-del="1">Excluir</button>' +
      '</div>';
    div.querySelector('[data-ed]').addEventListener('click', () => abrirFormRecompensa(r));
    div.querySelector('[data-del]').addEventListener('click', () => {
      if (confirm('Excluir "' + r.titulo + '"?')) excluirRecompensa(r.id);
    });
    alvo.appendChild(div);
  });
}

async function renderMesada() {
  const alvo = document.getElementById('painelMesada');
  const d = cache.mesada[periodoMesada];

  if (!d) {
    alvo.innerHTML = !apiConfigurada()
      ? '<div class="vazio"><span class="emoji">⚙️</span>Configure a API_URL no app.js para calcular a mesada.</div>'
      : (!navigator.onLine
        ? '<div class="vazio"><span class="emoji">📴</span>Sem conexão — abra de novo quando estiver online.</div>'
        : '<div class="vazio"><span class="emoji">⏳</span>Calculando...</div>');
  } else {
    alvo.innerHTML =
      '<div class="mesada-destaque">' +
        '<small>Mesada ' + (periodoMesada === 'mes' ? 'do mês' : 'da semana') +
        ' (' + dataCurta(d.de) + ' a ' + dataCurta(d.ate) + ')</small>' +
        '<span class="valor">' + dinheiro(d.valor_total) + '</span>' +
        '<small>' + dinheiro(d.valor_parte_basicas) + ' das obrigações + ' +
        dinheiro(d.valor_parte_extra) + ' dos extras</small>' +
      '</div>' +
      '<div class="mesada-grid">' +
        '<div class="mesada-item"><strong>' + d.pct_basicas + '%</strong>' +
          '<small>tarefas básicas que contam para a mesada (' + d.basicas_feitas + ' de ' + d.basicas_esperadas + ')</small>' +
          '<div class="mesada-barra"><div style="width:' + d.pct_basicas + '%"></div></div>' +
        '</div>' +
        '<div class="mesada-item"><strong>' + d.pontos_extra + '</strong>' +
          '<small>pontos extras acumulados em ' + d.tarefas_extra_feitas + ' tarefas</small>' +
        '</div>' +
        '<div class="mesada-item"><strong>' + saldoAtual() + '</strong><small>saldo de pontos atual</small></div>' +
        '<div class="mesada-item"><strong>' + dinheiro(d.valor_base_periodo) + '</strong><small>base do período (100%)</small></div>' +
      '</div>' +
      '<div class="dias-grid">' +
        d.por_dia.map(x =>
          '<div class="dia-chip"><b>' + NOMES_DIAS[parseISO(x.data).getDay()] + '</b>' +
          (x.pct === null ? '—' : x.pct + '%') + '</div>').join('') +
      '</div>';
  }

  buscarMesada(periodoMesada);
}

async function buscarMesada(periodo) {
  if (!apiConfigurada() || !navigator.onLine) return;
  try {
    const novo = await apiGet('resumo_mesada', { periodo, hoje: hojeISO() });
    cache.mesada[periodo] = novo;
    persistirCache();
    if (vista !== 'pais') return;
    renderResumoPais();
    if (abaPais === 'abaMesada' && periodo === periodoMesada) renderMesada();
  } catch (e) { /* mantém o cache */ }
}

function preencherFormConfig() {
  const el = document.getElementById('linkPais');
  if (el) el.textContent = linkDosPais();
  const f = document.getElementById('formConfig');
  f.nome_crianca.value = cache.config.nome_crianca || '';
  f.valor_mesada_base.value = cache.config.valor_mesada_base || '';
  f.valor_por_ponto.value = cache.config.valor_por_ponto || '';
  f.email_relatorio.value = cache.config.email_relatorio || '';
  f.valor_semanada_base.value = cache.config.valor_semanada_base || '';
  f.valor_desconto_falta.value = cache.config.valor_desconto_falta || '';
  f.modo_desconto.value = ['fixo', 'proporcional', 'nenhum'].includes(cache.config.modo_desconto)
    ? cache.config.modo_desconto : 'fixo';
}


/* ------------------------------------------------------------
 *  RENDER — perfil da criança (cofrinho, sonhos, medalhas)
 * ---------------------------------------------------------- */
function renderPerfil() {
  const nome = cache.config.nome_crianca || 'Oi!';
  const elNome = document.getElementById('perfilNome');
  if (elNome) elNome.textContent = nome;

  const cofre = saldoCofre();
  const elSaldo = document.getElementById('cofreCriancaSaldo');
  if (elSaldo) elSaldo.textContent = dinheiro(cofre);
  const dica = document.getElementById('cofreCriancaDica');
  if (dica) {
    const ultima = (cache.extrato || []).slice().sort((a, b) => (a.data < b.data ? 1 : -1))[0];
    dica.textContent = ultima
      ? 'Última movimentação: ' + ultima.descricao + ' · ' + dataCurta(ultima.data)
      : 'Quando a semanada for lançada, ela aparece aqui';
  }

  renderSonhos();
  renderMedalhas();
  renderCalendario('calendarioCrianca', false);
}

function renderSonhos() {
  const alvo = document.getElementById('listaSonhos');
  if (!alvo) return;
  alvo.innerHTML = '';
  const lista = cache.sonhos || [];
  if (!lista.length) {
    alvo.appendChild(vazio('🌟', 'Nenhum sonho ainda. Toque em “+ Novo sonho” e escolha uma meta!'));
    return;
  }
  lista.forEach(s => {
    const emPontos = s.tipo_meta === 'pontos';
    const atual = emPontos ? saldoAtual() : saldoCofre();
    const pct = s.valor_alvo > 0 ? Math.max(0, Math.min(100, Math.round((atual / s.valor_alvo) * 100))) : 0;
    const falta = Math.max(0, s.valor_alvo - atual);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sonho' + (pct >= 100 ? ' completo' : '');
    btn.innerHTML =
      '<span class="icone" aria-hidden="true">' + escapar(s.icone || '🌟') + '</span>' +
      '<span class="corpo">' +
        '<span class="titulo">' + escapar(s.titulo) + '</span>' +
        '<span class="meta">' +
          (emPontos ? atual + ' de ' + s.valor_alvo + ' pontos' : dinheiro(atual) + ' de ' + dinheiro(s.valor_alvo)) +
          ' · ' + (pct >= 100 ? '🎉 conquistado!' : 'faltam ' + (emPontos ? falta + ' pts' : dinheiro(falta))) +
        '</span>' +
        '<span class="barra-sonho"><div style="width:' + pct + '%"></div></span>' +
      '</span>';
    btn.addEventListener('click', () => abrirFormSonho(s));
    alvo.appendChild(btn);
  });
}

function renderMedalhas() {
  const alvo = document.getElementById('listaMedalhas');
  if (!alvo) return;
  alvo.innerHTML = '';
  const lista = cache.medalhas || [];
  if (!lista.length) {
    alvo.appendChild(vazio('🏅', 'As medalhas aparecem quando o app sincronizar.'));
    return;
  }
  lista.forEach(m => {
    const pct = Math.round((m.progresso || 0) * 100);
    const div = document.createElement('div');
    div.className = 'medalha' + (m.desbloqueada ? ' ganha' : '');
    div.innerHTML =
      '<span class="icone" aria-hidden="true">' + escapar(m.icone) + '</span>' +
      '<span class="titulo">' + escapar(m.titulo) + '</span>' +
      '<span class="desc">' + escapar(m.descricao) + '</span>' +
      (m.desbloqueada ? '' : '<span class="barra-sonho"><div style="width:' + pct + '%"></div></span>');
    alvo.appendChild(div);
  });
}

/* ------------------------------------------------------------
 *  Calendário de constância
 * ---------------------------------------------------------- */
function renderCalendario(elementoId, comControles) {
  const alvo = document.getElementById(elementoId);
  if (!alvo) return;

  const hoje = hojeISO();
  const base = mesCalendario || hoje.slice(0, 7);
  const [ano, mes] = base.split('-').map(Number);
  const primeiro = new Date(ano, mes - 1, 1, 12);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const vazios = primeiro.getDay();

  const feitosPorDia = {};
  let inicio = null;                       // antes do primeiro registro, o quadro nem existia
  cache.registros.forEach(r => {
    if (!inicio || r.data < inicio) inicio = r.data;
    if (r.status === 'rejeitada' || ehResgate(r.tarefa_id)) return;
    (feitosPorDia[r.data] = feitosPorDia[r.data] || {})[r.tarefa_id] = true;
  });

  let celulas = '';
  for (let i = 0; i < vazios; i++) celulas += '<div class="cal-dia vazio"></div>';

  for (let d = 1; d <= diasNoMes; d++) {
    const iso = base + '-' + dois(d);
    let classe = '';
    let titulo = dataCurta(iso);

    if (diaPausado(iso)) {
      classe = 'azul';
      titulo += ' · ' + cache.pausas[iso];
    } else if (iso > hoje) {
      classe = '';
      titulo += ' · ainda vai chegar';
    } else if (inicio && iso < inicio) {
      classe = '';
      titulo += ' · antes de começar';
    } else {
      const basicas = tarefasDoDia(iso).filter(t => t.tipo === 'basica');
      if (!basicas.length) {
        titulo += ' · sem tarefas';
      } else {
        const f = feitosPorDia[iso] || {};
        const feitas = basicas.filter(t => f[t.id]).length;
        classe = feitas === basicas.length ? 'verde' : 'amarelo';
        titulo += ' · ' + feitas + ' de ' + basicas.length;
      }
    }
    celulas += '<div class="cal-dia ' + classe + (iso === hoje ? ' hoje' : '') +
      '" title="' + escapar(titulo) + '">' + d + '</div>';
  }

  alvo.innerHTML =
    '<div class="cal-topo">' +
      (comControles ? '<button type="button" data-mes="-1" aria-label="Mês anterior">‹</button>' : '<span></span>') +
      '<strong>' + MESES[mes - 1][0].toUpperCase() + MESES[mes - 1].slice(1) + ' de ' + ano + '</strong>' +
      (comControles ? '<button type="button" data-mes="1" aria-label="Próximo mês">›</button>' : '<span></span>') +
    '</div>' +
    '<div class="cal-grade">' + NOMES_DIAS.map(d => '<div class="cal-cab">' + d[0] + '</div>').join('') + celulas + '</div>' +
    '<div class="cal-legenda">' +
      '<span class="l-verde">tudo feito</span>' +
      '<span class="l-amarelo">faltou algo</span>' +
      '<span class="l-azul">pausa</span>' +
      '<span class="l-cinza">sem registro</span>' +
    '</div>';

  if (comControles) {
    alvo.querySelectorAll('[data-mes]').forEach(b => {
      b.addEventListener('click', () => {
        const passo = Number(b.dataset.mes);
        const d = new Date(ano, mes - 1 + passo, 1, 12);
        mesCalendario = d.getFullYear() + '-' + dois(d.getMonth() + 1);
        renderCalendario(elementoId, true);
      });
    });
  }
}

/* ------------------------------------------------------------
 *  RENDER — cofrinho e pausas (pais)
 * ---------------------------------------------------------- */
function renderCofre() {
  const saldo = saldoCofre();
  const elSaldo = document.getElementById('cofreSaldo');
  if (!elSaldo) return;
  elSaldo.textContent = dinheiro(saldo);

  const movs = (cache.extrato || []).slice().sort((a, b) => (a.data < b.data ? 1 : -1));
  const entradas = movs.filter(m => m.tipo === 'entrada').reduce((s, m) => s + Math.abs(m.valor), 0);
  const saidas = movs.filter(m => m.tipo === 'saida').reduce((s, m) => s + Math.abs(m.valor), 0);
  const rend = movs.filter(m => m.tipo === 'rendimento').reduce((s, m) => s + Math.abs(m.valor), 0);
  document.getElementById('cofreResumo').textContent =
    'Entradas ' + dinheiro(entradas) + ' · Gastos ' + dinheiro(saidas) + ' · Rendimentos ' + dinheiro(rend);

  const alvo = document.getElementById('listaExtrato');
  alvo.innerHTML = '';
  if (!movs.length) {
    alvo.appendChild(vazio('🐷', 'Nenhuma movimentação ainda. Use “Lançar semanada” depois do fechamento da semana.'));
    return;
  }
  const icones = { entrada: '💰', saida: '🛒', rendimento: '📈' };
  const sinais = { entrada: '+', saida: '−', rendimento: '+' };
  movs.slice(0, 40).forEach(m => {
    const div = document.createElement('div');
    div.className = 'mov';
    div.innerHTML =
      '<span class="icone" aria-hidden="true">' + (icones[m.tipo] || '•') + '</span>' +
      '<span class="corpo">' +
        '<span class="titulo">' + escapar(m.descricao) + '</span>' +
        '<span class="meta">' + dataCurta(m.data) + ' · ' + m.tipo + '</span>' +
      '</span>' +
      '<span class="valor ' + m.tipo + '">' + sinais[m.tipo] + ' ' + dinheiro(Math.abs(m.valor)) + '</span>' +
      '<button class="btn-perigo" data-del="1" aria-label="Excluir lançamento">✕</button>';
    div.querySelector('[data-del]').addEventListener('click', () => {
      if (!confirm('Excluir "' + m.descricao + '" (' + dinheiro(Math.abs(m.valor)) + ')?')) return;
      cache.extrato = cache.extrato.filter(x => x.id !== m.id);
      persistirCache();
      enfileirar('excluir_extrato', { id: m.id, pin: pinLocal }, 0);
      renderPais();
      toast('🗑️ Lançamento excluído');
    });
    alvo.appendChild(div);
  });
}

function renderPausas() {
  const alvo = document.getElementById('listaPausas');
  if (!alvo) return;
  alvo.innerHTML = '';
  const dias = Object.keys(cache.pausas || {}).sort().reverse().slice(0, 30);
  if (!dias.length) {
    alvo.appendChild(vazio('🏖️', 'Nenhum dia pausado. Use isto em viagens ou quando ela estiver doente.'));
    return;
  }
  // agrupa dias seguidos com o mesmo motivo
  const blocos = [];
  dias.slice().sort().forEach(d => {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.motivo === cache.pausas[d] && somarDias(ultimo.ate, 1) === d) ultimo.ate = d;
    else blocos.push({ de: d, ate: d, motivo: cache.pausas[d] });
  });

  blocos.reverse().forEach(b => {
    const div = document.createElement('div');
    div.className = 'pausa';
    const intervalo = b.de === b.ate ? dataCurta(b.de) : dataCurta(b.de) + ' a ' + dataCurta(b.ate);
    div.innerHTML =
      '<span aria-hidden="true">🏖️</span>' +
      '<span class="corpo"><strong>' + escapar(b.motivo) + '</strong>' +
      '<span class="meta">' + intervalo + '</span></span>' +
      '<button class="btn-perigo" data-del="1">Remover</button>';
    div.querySelector('[data-del]').addEventListener('click', () => {
      const novas = Object.assign({}, cache.pausas);
      let d = b.de, g = 0;
      while (d <= b.ate && g++ < 90) { delete novas[d]; d = somarDias(d, 1); }
      cache.pausas = novas;
      persistirCache();
      enfileirar('excluir_pausa', { de: b.de, ate: b.ate, pin: pinLocal }, 0);
      renderPais();
      renderCrianca();
      toast('🗑️ Pausa removida');
    });
    alvo.appendChild(div);
  });
}

/* ------------------------------------------------------------
 *  Formulários (modal)
 * ---------------------------------------------------------- */
function abrirFormTarefa(t) {
  const nova = !t;
  t = t || {
    id: uid(), titulo: '', icone: '⭐', tipo: 'basica', pontos: 0,
    periodo: 'manha', recorrencia: 'diaria', dias: '',
    precisa_aprova: 'nao', conta_mesada: 'sim', ativa: 'sim', precisa_foto: 'nao'
  };
  document.getElementById('formTitulo').textContent = nova ? 'Nova tarefa' : 'Editar tarefa';
  const f = document.getElementById('formEdicao');
  f.innerHTML =
    '<div class="linha-campos">' +
      '<label>Ícone<input name="icone" maxlength="4" value="' + escapar(t.icone) + '"></label>' +
      '<label>Tipo<select name="tipo">' +
        opt('basica', 'Básica (obrigação)', t.tipo) + opt('extra', 'Extra (dá pontos)', t.tipo) +
      '</select></label>' +
    '</div>' +
    '<label>Título<input name="titulo" required value="' + escapar(t.titulo) + '"></label>' +
    '<div class="linha-campos">' +
      '<label>Pontos<input name="pontos" type="number" min="0" step="1" inputmode="numeric" value="' + (t.pontos || 0) + '"></label>' +
      '<label>Período<select name="periodo">' +
        PERIODOS.map(p => opt(p.id, p.rotulo, t.periodo)).join('') +
      '</select></label>' +
    '</div>' +
    '<label>Repetição<select name="recorrencia">' +
      opt('diaria', 'Todos os dias', t.recorrencia) +
      opt('semana', 'Segunda a sexta', t.recorrencia) +
      opt('fimdesemana', 'Fim de semana', t.recorrencia) +
      opt('dias', 'Dias escolhidos', t.recorrencia) +
    '</select></label>' +
    '<label id="campoDias">Dias da semana' +
      '<span class="dias-grid">' + NOMES_DIAS.map((d, i) =>
        '<label class="dia-chip"><input type="checkbox" name="dia" value="' + i + '"' +
        (String(t.dias || '').split(/[^0-9]+/).includes(String(i)) ? ' checked' : '') + '> ' + d + '</label>').join('') +
      '</span>' +
    '</label>' +
    '<label>Exigir foto?<select name="precisa_foto">' +
      opt('nao', 'Não precisa de foto', t.precisa_foto === 'sim' ? 'sim' : 'nao') +
      opt('sim', '📷 Sim — abrir a câmera', t.precisa_foto === 'sim' ? 'sim' : 'nao') +
    '</select></label>' +
    '<label class="check-linha"><input type="checkbox" name="precisa_aprova"' + (t.precisa_aprova === 'sim' ? ' checked' : '') + '> Precisa de aprovação dos pais</label>' +
    '<label class="check-linha"><input type="checkbox" name="conta_mesada"' + (t.conta_mesada === 'sim' ? ' checked' : '') + '> Conta para a mesada</label>' +
    '<label class="check-linha"><input type="checkbox" name="ativa"' + (t.ativa === 'sim' ? ' checked' : '') + '> Tarefa ativa</label>' +
    '<div class="form-acoes">' +
      '<button type="button" class="btn-secundario" data-cancel="1">Cancelar</button>' +
      '<button type="submit" class="btn-primario">Salvar</button>' +
    '</div>';

  const sel = f.recorrencia;
  const mostrarDias = () => { f.querySelector('#campoDias').style.display = sel.value === 'dias' ? '' : 'none'; };
  sel.addEventListener('change', mostrarDias); mostrarDias();

  f.querySelector('[data-cancel]').onclick = fecharForm;
  f.onsubmit = (ev) => {
    ev.preventDefault();
    const dias = Array.from(f.querySelectorAll('input[name=dia]:checked')).map(i => i.value).join(',');
    const tipo = f.tipo.value;
    salvarTarefa({
      id: t.id,
      titulo: f.titulo.value.trim(),
      icone: f.icone.value.trim() || '⭐',
      tipo,
      pontos: tipo === 'extra' ? (Number(f.pontos.value) || 0) : 0,
      periodo: f.periodo.value,
      recorrencia: f.recorrencia.value,
      dias: f.recorrencia.value === 'dias' ? dias : '',
      precisa_aprova: f.precisa_aprova.checked ? 'sim' : 'nao',
      precisa_foto: f.precisa_foto.value === 'sim' ? 'sim' : 'nao',
      conta_mesada: f.conta_mesada.checked ? 'sim' : 'nao',
      ativa: f.ativa.checked ? 'sim' : 'nao',
      criada_em: t.criada_em || new Date().toISOString()
    });
    fecharForm();
  };
  document.getElementById('modalForm').classList.remove('oculto');
}


function abrirFormSonho(s) {
  const novo = !s;
  s = s || { id: uid(), titulo: '', icone: '🌟', tipo_meta: 'dinheiro', valor_alvo: 50, concluido: 'nao' };
  document.getElementById('formTitulo').textContent = novo ? 'Novo sonho' : 'Editar sonho';
  const f = document.getElementById('formEdicao');
  f.innerHTML =
    '<div class="linha-campos">' +
      '<label>Ícone<input name="icone" maxlength="4" value="' + escapar(s.icone) + '"></label>' +
      '<label>Meta em<select name="tipo_meta">' +
        opt('dinheiro', 'Reais (cofrinho)', s.tipo_meta) + opt('pontos', 'Pontos', s.tipo_meta) +
      '</select></label>' +
    '</div>' +
    '<label>O que você quer?<input name="titulo" required value="' + escapar(s.titulo) + '" placeholder="Ex.: patins novos"></label>' +
    '<label>Quanto precisa juntar<input name="valor_alvo" type="number" min="1" step="0.01" inputmode="decimal" value="' + s.valor_alvo + '"></label>' +
    '<div class="form-acoes">' +
      (novo ? '' : '<button type="button" class="btn-perigo" data-del="1">Excluir</button>') +
      '<button type="button" class="btn-secundario" data-cancel="1">Cancelar</button>' +
      '<button type="submit" class="btn-primario">Salvar</button>' +
    '</div>';

  f.querySelector('[data-cancel]').onclick = fecharForm;
  const del = f.querySelector('[data-del]');
  if (del) del.onclick = () => {
    if (!confirm('Excluir o sonho "' + s.titulo + '"?')) return;
    cache.sonhos = cache.sonhos.filter(x => x.id !== s.id);
    persistirCache();
    enfileirar('excluir_sonho', { id: s.id }, 0);
    fecharForm();
    renderCrianca();
    toast('🗑️ Sonho excluído');
  };
  f.onsubmit = ev => {
    ev.preventDefault();
    const dados = {
      id: s.id,
      titulo: f.titulo.value.trim(),
      icone: f.icone.value.trim() || '🌟',
      tipo_meta: f.tipo_meta.value,
      valor_alvo: Number(f.valor_alvo.value) || 0,
      concluido: s.concluido || 'nao'
    };
    if (!dados.titulo || !dados.valor_alvo) { toast('Preencha o nome e o valor'); return; }
    const existente = (cache.sonhos || []).filter(x => x.id === dados.id)[0];
    if (existente) Object.assign(existente, dados);
    else (cache.sonhos = cache.sonhos || []).push(dados);
    persistirCache();
    enfileirar('salvar_sonho', dados, 0);
    fecharForm();
    renderCrianca();
    Som.tocar('pop');
    toast('🌟 Sonho salvo!');
  };
  document.getElementById('modalForm').classList.remove('oculto');
}

function abrirFormPausa() {
  const hoje = hojeISO();
  document.getElementById('formTitulo').textContent = 'Dias de pausa';
  const f = document.getElementById('formEdicao');
  f.innerHTML =
    '<p class="modal-sub">Nestes dias nada conta como falta, a semanada não é descontada e a sequência não quebra.</p>' +
    '<div class="linha-campos">' +
      '<label>De<input name="de" type="date" value="' + hoje + '" required></label>' +
      '<label>Até<input name="ate" type="date" value="' + hoje + '" required></label>' +
    '</div>' +
    '<label>Motivo<input name="motivo" value="Viagem" maxlength="40" required></label>' +
    '<div class="form-acoes">' +
      '<button type="button" class="btn-secundario" data-cancel="1">Cancelar</button>' +
      '<button type="submit" class="btn-primario">Marcar pausa</button>' +
    '</div>';
  f.querySelector('[data-cancel]').onclick = fecharForm;
  f.onsubmit = ev => {
    ev.preventDefault();
    let de = f.de.value, ate = f.ate.value || f.de.value;
    if (!de) { toast('Escolha a data'); return; }
    if (ate < de) { const t = de; de = ate; ate = t; }
    const motivo = f.motivo.value.trim() || 'Pausa';
    const novas = Object.assign({}, cache.pausas);
    let d = de, g = 0;
    while (d <= ate && g++ < 90) { novas[d] = motivo; d = somarDias(d, 1); }
    cache.pausas = novas;
    persistirCache();
    enfileirar('salvar_pausa', { de, ate, motivo, pin: pinLocal }, 0);
    fecharForm();
    renderPais();
    renderCrianca();
    toast('🏖️ Pausa marcada');
  };
  document.getElementById('modalForm').classList.remove('oculto');
}

function abrirFormGasto() {
  document.getElementById('formTitulo').textContent = 'Registrar gasto';
  const f = document.getElementById('formEdicao');
  f.innerHTML =
    '<p class="modal-sub">Saldo no cofrinho: <strong>' + dinheiro(saldoCofre()) + '</strong></p>' +
    '<label>No que gastou?<input name="descricao" required placeholder="Ex.: comprou um livro" maxlength="60"></label>' +
    '<label>Valor (R$)<input name="valor" type="number" min="0.01" step="0.01" inputmode="decimal" required></label>' +
    '<div class="form-acoes">' +
      '<button type="button" class="btn-secundario" data-cancel="1">Cancelar</button>' +
      '<button type="submit" class="btn-primario">Registrar saída</button>' +
    '</div>';
  f.querySelector('[data-cancel]').onclick = fecharForm;
  f.onsubmit = ev => {
    ev.preventDefault();
    const valor = Number(f.valor.value) || 0;
    const descricao = f.descricao.value.trim();
    if (!valor || !descricao) { toast('Preencha a descrição e o valor'); return; }
    if (valor > saldoCofre() + 0.001) { toast('💸 Isso é mais do que tem guardado'); return; }
    lancarNoCofre('saida', valor, descricao);
    fecharForm();
  };
  document.getElementById('modalForm').classList.remove('oculto');
}

function abrirMissaoRelampago() {
  const hoje = hojeISO();
  document.getElementById('formTitulo').textContent = '⚡ Missão Relâmpago';
  const f = document.getElementById('formEdicao');
  f.innerHTML =
    '<p class="modal-sub">Uma tarefa extra válida só para hoje (' + dataCurta(hoje) + '), sem mexer na rotina fixa.</p>' +
    '<div class="linha-campos">' +
      '<label>Ícone<input name="icone" maxlength="4" value="⚡"></label>' +
      '<label>Pontos<input name="pontos" type="number" min="0" step="1" inputmode="numeric" value="5"></label>' +
    '</div>' +
    '<label>O que precisa ser feito?<input name="titulo" required placeholder="Ex.: ajudar a guardar as compras"></label>' +
    '<label>Período<select name="periodo">' +
      PERIODOS.map(p => opt(p.id, p.rotulo, 'qualquer')).join('') +
    '</select></label>' +
    '<label class="check-linha"><input type="checkbox" name="precisa_aprova" checked> Precisa de aprovação dos pais</label>' +
    '<label class="check-linha"><input type="checkbox" name="precisa_foto"> Precisa de foto</label>' +
    '<div class="form-acoes">' +
      '<button type="button" class="btn-secundario" data-cancel="1">Cancelar</button>' +
      '<button type="submit" class="btn-primario">Criar missão</button>' +
    '</div>';
  f.querySelector('[data-cancel]').onclick = fecharForm;
  f.onsubmit = ev => {
    ev.preventDefault();
    const titulo = f.titulo.value.trim();
    if (!titulo) { toast('Dê um nome para a missão'); return; }
    salvarTarefa({
      id: uid(),
      titulo,
      icone: f.icone.value.trim() || '⚡',
      tipo: 'extra',
      pontos: Number(f.pontos.value) || 0,
      periodo: f.periodo.value,
      recorrencia: 'unica',
      dias: hoje,
      precisa_aprova: f.precisa_aprova.checked ? 'sim' : 'nao',
      precisa_foto: f.precisa_foto.checked ? 'sim' : 'nao',
      conta_mesada: 'nao',
      ativa: 'sim',
      criada_em: new Date().toISOString()
    });
    fecharForm();
    Som.tocar('enviado');
    toast('⚡ Missão criada só para hoje!');
  };
  document.getElementById('modalForm').classList.remove('oculto');
}

/* ------------------------------------------------------------
 *  Ações do cofrinho (pais)
 * ---------------------------------------------------------- */
function lancarNoCofre(tipo, valor, descricao, acao, extra) {
  const id = uid();
  const mov = { id, data: hojeISO(), tipo, descricao, valor: Math.abs(Number(valor) || 0) };
  cache.extrato = (cache.extrato || []).concat([mov]);
  cache.saldo_cofre = saldoCofre();
  persistirCache();
  enfileirar(acao || 'lancar_extrato', Object.assign({ pin: pinLocal, id, tipo, valor: mov.valor, descricao, data: mov.data }, extra || {}), 0);
  renderPais();
  renderCrianca();
  Som.tocar(tipo === 'saida' ? 'pop' : 'moeda');
  toast((tipo === 'saida' ? '🛒 ' : '💰 ') + descricao + ' · ' + dinheiro(mov.valor));
  verificarMarcos();
}

async function fecharSemanadaNoCofre() {
  const botao = document.getElementById('btnFecharSemanada');
  if (!navigator.onLine || !apiConfigurada()) { toast('📴 Precisa de internet para fechar a semanada'); return; }
  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = '⏳ Calculando...';
  try {
    await flush();
    const r = await apiPost('fechar_semanada', { pin: pinLocal });
    if (r.extrato) { cache.extrato = r.extrato; cache.saldo_cofre = Number(r.saldo_cofre) || saldoCofre(); persistirCache(); }
    renderPais();
    renderCrianca();
    if (r.duplicado || r.nada_a_pagar) {
      toast('ℹ️ ' + r.msg);
    } else {
      Som.tocar('moeda');
      toast('💰 ' + r.msg);
      verificarMarcos();
    }
  } catch (e) {
    toast('⚠️ ' + (e.message || 'Não deu para fechar a semanada'));
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

async function aplicarBonusPoupanca() {
  const botao = document.getElementById('btnBonusPoupanca');
  if (saldoCofre() <= 0) { toast('🐷 O cofrinho está vazio'); return; }
  if (!navigator.onLine || !apiConfigurada()) { toast('📴 Precisa de internet para aplicar o bônus'); return; }
  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = '⏳...';
  try {
    await flush();
    const r = await apiPost('bonus_poupanca', { pin: pinLocal });
    if (r.extrato) { cache.extrato = r.extrato; cache.saldo_cofre = Number(r.saldo_cofre) || saldoCofre(); persistirCache(); }
    renderPais();
    renderCrianca();
    Som.tocar('levelup');
    toast('📈 ' + r.msg);
    verificarMarcos();
  } catch (e) {
    toast('⚠️ ' + (e.message || 'Não deu para aplicar o bônus'));
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

/* ------------------------------------------------------------
 *  Modal de personalização
 * ---------------------------------------------------------- */
let escolhaVisual = null;

function abrirPersonalizacao() {
  escolhaVisual = { avatar: visual.avatar, tema: visual.tema };
  const gradeA = document.getElementById('gradeAvatares');
  gradeA.innerHTML = AVATARES.map(a =>
    '<button type="button" data-avatar="' + a + '"' + (a === visual.avatar ? ' class="sel"' : '') + '>' + a + '</button>').join('');
  const gradeT = document.getElementById('gradeTemas');
  gradeT.innerHTML = TEMAS.map(t =>
    '<button type="button" data-tema="' + t.id + '" style="background:' + t.cor + '"' +
    (t.id === visual.tema ? ' class="sel"' : '') + '>' + t.nome + '</button>').join('');

  gradeA.querySelectorAll('[data-avatar]').forEach(b => b.addEventListener('click', () => {
    escolhaVisual.avatar = b.dataset.avatar;
    gradeA.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
    Som.tocar('pop');
  }));
  gradeT.querySelectorAll('[data-tema]').forEach(b => b.addEventListener('click', () => {
    escolhaVisual.tema = b.dataset.tema;
    gradeT.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
    document.documentElement.setAttribute('data-tema', escolhaVisual.tema);   // prévia na hora
    Som.tocar('pop');
  }));

  document.getElementById('modalTema').classList.remove('oculto');
}

function fecharPersonalizacao(salvando) {
  document.getElementById('modalTema').classList.add('oculto');
  if (!salvando) aplicarVisual();        // desfaz a prévia
  escolhaVisual = null;
}

function abrirFormRecompensa(r) {
  const nova = !r;
  r = r || { id: uid(), titulo: '', icone: '🎁', custo_pontos: 10, ativa: 'sim' };
  document.getElementById('formTitulo').textContent = nova ? 'Nova recompensa' : 'Editar recompensa';
  const f = document.getElementById('formEdicao');
  f.innerHTML =
    '<div class="linha-campos">' +
      '<label>Ícone<input name="icone" maxlength="4" value="' + escapar(r.icone) + '"></label>' +
      '<label>Custo (pontos)<input name="custo_pontos" type="number" min="0" step="1" inputmode="numeric" value="' + r.custo_pontos + '"></label>' +
    '</div>' +
    '<label>Título<input name="titulo" required value="' + escapar(r.titulo) + '"></label>' +
    '<label class="check-linha"><input type="checkbox" name="ativa"' + (r.ativa === 'sim' ? ' checked' : '') + '> Disponível na lojinha</label>' +
    '<div class="form-acoes">' +
      '<button type="button" class="btn-secundario" data-cancel="1">Cancelar</button>' +
      '<button type="submit" class="btn-primario">Salvar</button>' +
    '</div>';
  f.querySelector('[data-cancel]').onclick = fecharForm;
  f.onsubmit = (ev) => {
    ev.preventDefault();
    salvarRecompensa({
      id: r.id,
      titulo: f.titulo.value.trim(),
      icone: f.icone.value.trim() || '🎁',
      custo_pontos: Number(f.custo_pontos.value) || 0,
      ativa: f.ativa.checked ? 'sim' : 'nao'
    });
    fecharForm();
  };
  document.getElementById('modalForm').classList.remove('oculto');
}

function fecharForm() {
  document.getElementById('modalForm').classList.add('oculto');
  document.getElementById('formEdicao').innerHTML = '';
}

function opt(valor, rotulo, atual) {
  return '<option value="' + valor + '"' + (valor === atual ? ' selected' : '') + '>' + rotulo + '</option>';
}

/* ------------------------------------------------------------
 *  PIN
 * ---------------------------------------------------------- */
let aoCancelarPin = null;

function abrirPin(callback, aoCancelar) {
  pinDigitado = '';
  aoValidarPin = callback;
  aoCancelarPin = aoCancelar || null;
  document.getElementById('pinErro').classList.add('oculto');
  desenharPin();
  document.getElementById('modalPin').classList.remove('oculto');
}

function fecharPin(cancelado) {
  document.getElementById('modalPin').classList.add('oculto');
  pinDigitado = '';
  desenharPin();
  if (cancelado && aoCancelarPin) { const f = aoCancelarPin; aoCancelarPin = null; f(); }
}

function concluirPin() {
  destravarPais(document.getElementById('pinLembrar').checked);
  fecharPin();
  if (aoValidarPin) aoValidarPin();
}

function desenharPin() {
  document.querySelectorAll('#pinPontos span').forEach((s, i) => {
    s.classList.toggle('cheio', i < pinDigitado.length);
  });
}

async function validarPin() {
  const pin = pinDigitado;
  const erro = document.getElementById('pinErro');

  // Verificação otimista: se já validamos esse PIN antes neste aparelho, entra na hora.
  if (pinLocal && pin === String(pinLocal)) { concluirPin(); return; }
  if (!navigator.onLine || !apiConfigurada()) {
    erro.textContent = pinLocal ? 'PIN incorreto' : 'Sem conexão para verificar o PIN';
    erro.classList.remove('oculto');
    pinDigitado = ''; desenharPin();
    return;
  }
  try {
    const r = await apiGet('verificar_pin', { pin });
    if (r.valido) {
      pinLocal = pin;
      salvar(K.pin, pinLocal);
      concluirPin();
    } else {
      erro.textContent = 'PIN incorreto';
      erro.classList.remove('oculto');
      pinDigitado = ''; desenharPin();
      vibrar([30, 40, 30]);
    }
  } catch (e) {
    erro.textContent = 'Não deu para verificar agora';
    erro.classList.remove('oculto');
    pinDigitado = ''; desenharPin();
  }
}

/* ------------------------------------------------------------
 *  Navegação
 * ---------------------------------------------------------- */
function paisDestravado() {
  return sessaoPais || Date.now() < destravaAte;
}

function destravarPais(lembrar) {
  sessaoPais = true;
  if (lembrar) {
    destravaAte = Date.now() + DIAS_DESTRAVA * 86400000;
    salvar(K.destrava, destravaAte);
  }
}

function bloquearPais() {
  sessaoPais = false;
  destravaAte = 0;
  salvar(K.destrava, 0);
}

/** Aplica a rota atual (hash) — é por aqui que o link direto dos pais entra. */
function aplicarRota() {
  const hash = location.hash.replace(/\/$/, '');
  const rota = ROTAS[hash] || ROTAS[''];
  const [alvoVista, alvoAba] = rota;

  if (alvoVista === 'pais' && !paisDestravado()) {
    abrirPin(
      () => aplicarRota(),                                  // destravou: entra
      () => { irPara('#tarefas'); }                         // cancelou: volta
    );
    return;
  }

  aplicandoRota = true;
  mostrarVista(alvoVista);
  trocarAba(alvoVista === 'pais' ? 'tabbarPais' : 'tabbarCrianca', alvoAba);
  aplicandoRota = false;
}

function irPara(hash) {
  if (location.hash === hash) aplicarRota();
  else location.hash = hash;        // dispara hashchange -> aplicarRota()
}

function mostrarVista(qual) {
  vista = qual;
  document.getElementById('appCrianca').classList.toggle('oculto', qual !== 'crianca');
  document.getElementById('appPais').classList.toggle('oculto', qual !== 'pais');
  window.scrollTo(0, 0);
  if (qual === 'pais') { renderPais(); buscarMesada('semana'); } else renderCrianca();
}

function trocarAba(barraId, abaId) {
  const barra = document.getElementById(barraId);
  barra.querySelectorAll('.tab').forEach(b => b.classList.toggle('ativa', b.dataset.aba === abaId));
  const tela = barra.closest('.tela');
  tela.querySelectorAll('main .aba').forEach(s => s.classList.toggle('ativa', s.id === abaId));
  window.scrollTo(0, 0);
  if (barraId === 'tabbarCrianca') abaCrianca = abaId;
  else { abaPais = abaId; if (abaId === 'abaMesada') renderMesada(); }
  if (!aplicandoRota && HASH_DA_ABA[abaId]) {
    const h = HASH_DA_ABA[abaId];
    if (location.hash !== h) { aplicandoRota = true; location.hash = h; setTimeout(() => { aplicandoRota = false; }, 0); }
  }
}

/* ------------------------------------------------------------
 *  Efeitos: confete, toast, vibração
 * ---------------------------------------------------------- */
const canvas = document.getElementById('confete');
const ctx = canvas.getContext('2d');
let particulas = [];
let animando = false;

function confete(origem) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.classList.add('ativo');

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 3;
  if (origem && origem.getBoundingClientRect) {
    const r = origem.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  }
  const cores = ['#6d4bd8', '#ff5c8a', '#ffb43f', '#1faa72', '#2f86e8', '#ffd25c'];
  for (let i = 0; i < 70; i++) {
    const ang = Math.random() * Math.PI * 2;
    const vel = 3 + Math.random() * 7;
    particulas.push({
      x, y,
      vx: Math.cos(ang) * vel,
      vy: Math.sin(ang) * vel - 3,
      g: 0.22 + Math.random() * 0.12,
      tam: 5 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.3,
      cor: cores[(Math.random() * cores.length) | 0],
      vida: 1
    });
  }
  if (!animando) { animando = true; requestAnimationFrame(passoConfete); }
}

function passoConfete() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particulas = particulas.filter(p => p.vida > 0 && p.y < canvas.height + 40);
  particulas.forEach(p => {
    p.vx *= 0.99; p.vy += p.g;
    p.x += p.vx; p.y += p.vy;
    p.rot += p.vrot;
    p.vida -= 0.006;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.max(0, p.vida);
    ctx.fillStyle = p.cor;
    ctx.fillRect(-p.tam / 2, -p.tam / 2, p.tam, p.tam * 0.6);
    ctx.restore();
  });
  if (particulas.length) requestAnimationFrame(passoConfete);
  else { animando = false; canvas.classList.remove('ativo'); ctx.clearRect(0, 0, canvas.width, canvas.height); }
}

let timerToast = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('oculto');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => el.classList.add('oculto'), 2400);
}

function animarSaldo() {
  const el = document.getElementById('statSaldo');
  el.classList.remove('pulsa');
  void el.offsetWidth;
  el.classList.add('pulsa');
}

function vibrar(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

function vazio(emoji, texto) {
  const d = document.createElement('div');
  d.className = 'vazio';
  d.innerHTML = '<span class="emoji" aria-hidden="true">' + emoji + '</span>' + escapar(texto);
  return d;
}

function escapar(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ------------------------------------------------------------
 *  Eventos
 * ---------------------------------------------------------- */
document.getElementById('tabbarCrianca').addEventListener('click', e => {
  const b = e.target.closest('.tab');
  if (b) trocarAba('tabbarCrianca', b.dataset.aba);
});

document.getElementById('tabbarPais').addEventListener('click', e => {
  const b = e.target.closest('.tab');
  if (b) trocarAba('tabbarPais', b.dataset.aba);
});

document.getElementById('btnAbrirPais').addEventListener('click', () => irPara('#pais'));

document.getElementById('btnSairPais').addEventListener('click', () => irPara('#tarefas'));

document.getElementById('btnEnviarRelatorio').addEventListener('click', enviarRelatorioAgora);

/** Salva o que estiver no formulário, espera a fila esvaziar e dispara o e-mail. */
async function enviarRelatorioAgora() {
  const botao = document.getElementById('btnEnviarRelatorio');
  const f = document.getElementById('formConfig');
  const email = f.email_relatorio.value.trim();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    toast('✉️ Preencha um e-mail válido para o relatório');
    f.email_relatorio.focus();
    return;
  }
  if (!navigator.onLine || !apiConfigurada()) {
    toast('📴 Precisa de internet para enviar o relatório');
    return;
  }

  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.textContent = '⏳ Enviando...';
  try {
    // garante que o e-mail e os valores digitados já estejam na planilha
    const mudou = ['email_relatorio', 'valor_semanada_base', 'valor_desconto_falta', 'modo_desconto']
      .some(k => String(cache.config[k] === undefined ? '' : cache.config[k]) !== String(f[k].value).trim());
    if (mudou) {
      salvarConfig({
        nome_crianca: f.nome_crianca.value.trim(),
        valor_mesada_base: f.valor_mesada_base.value,
        valor_por_ponto: f.valor_por_ponto.value,
        email_relatorio: email,
        valor_semanada_base: f.valor_semanada_base.value,
        valor_desconto_falta: f.valor_desconto_falta.value,
        modo_desconto: f.modo_desconto.value
      });
    }
    await flush();

    const r = await apiPost('enviar_relatorio_semanal', { pin: pinLocal });
    const rel = r.relatorio || {};
    const resumo = rel.semanada
      ? ' · semanada ' + dinheiro(rel.semanada.a_pagar) + ' (' + rel.basicas.pct + '% das obrigatórias)'
      : '';
    toast('📧 Enviado para ' + r.destino + resumo);
    document.getElementById('dicaRelatorio').textContent =
      'Último envio manual: ' + (rel.de ? dataCurta(rel.de) + ' a ' + dataCurta(rel.ate) : 'agora') +
      resumo.replace(' · ', ' — ');
  } catch (e) {
    toast('⚠️ ' + (e.message || 'Não deu para enviar o relatório'));
  } finally {
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

document.getElementById('btnEsquecerAparelho').addEventListener('click', () => {
  bloquearPais();
  toast('🔒 Área dos pais bloqueada neste aparelho');
  irPara('#tarefas');
});

document.getElementById('btnCopiarLink').addEventListener('click', async () => {
  const link = linkDosPais();
  try {
    await navigator.clipboard.writeText(link);
    toast('🔗 Link copiado');
  } catch (e) {
    prompt('Copie o link da área dos pais:', link);
  }
});

function linkDosPais() {
  return location.origin + location.pathname + '#pais';
}

window.addEventListener('hashchange', aplicarRota);

document.getElementById('tecladoPin').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const k = b.dataset.k;
  if (k === 'cancel') return fecharPin(true);
  if (k === 'del') { pinDigitado = pinDigitado.slice(0, -1); return desenharPin(); }
  if (pinDigitado.length >= 4) return;
  pinDigitado += k;
  desenharPin();
  if (pinDigitado.length === 4) setTimeout(validarPin, 120);
});

document.getElementById('btnSom').addEventListener('click', () => {
  const ligado = Som.alternar();
  document.getElementById('iconeSom').textContent = ligado ? '🔊' : '🔇';
  toast(ligado
    ? (Som.temVibracao ? '🔊 Som e vibração ligados' : '🔊 Som ligado')
    : '🔇 Som e vibração desligados');
});

document.getElementById('btnAvatar').addEventListener('click', abrirPersonalizacao);
document.getElementById('btnAvatar2').addEventListener('click', abrirPersonalizacao);
document.getElementById('btnPersonalizar').addEventListener('click', abrirPersonalizacao);
document.getElementById('btnFecharTema').addEventListener('click', () => fecharPersonalizacao(false));
document.getElementById('btnSalvarTema').addEventListener('click', () => {
  if (escolhaVisual) salvarVisual(escolhaVisual.avatar, escolhaVisual.tema);
  fecharPersonalizacao(true);
  Som.tocar('levelup');
  toast('🎨 Pronto, ficou com a sua cara!');
});

document.getElementById('btnNovoSonho').addEventListener('click', () => abrirFormSonho(null));
document.getElementById('btnMissaoRelampago').addEventListener('click', abrirMissaoRelampago);
document.getElementById('btnNovaPausa').addEventListener('click', abrirFormPausa);
document.getElementById('btnRegistrarGasto').addEventListener('click', abrirFormGasto);
document.getElementById('btnFecharSemanada').addEventListener('click', fecharSemanadaNoCofre);
document.getElementById('btnBonusPoupanca').addEventListener('click', aplicarBonusPoupanca);

document.getElementById('btnNovaTarefa').addEventListener('click', () => abrirFormTarefa(null));
document.getElementById('btnNovaRecompensa').addEventListener('click', () => abrirFormRecompensa(null));

document.getElementById('segPeriodo').addEventListener('click', e => {
  const b = e.target.closest('.seg-btn');
  if (!b) return;
  document.querySelectorAll('#segPeriodo .seg-btn').forEach(x => x.classList.toggle('ativa', x === b));
  periodoMesada = b.dataset.periodo;
  renderMesada();
});

document.getElementById('formConfig').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  const itens = {
    nome_crianca: f.nome_crianca.value.trim(),
    valor_mesada_base: f.valor_mesada_base.value,
    valor_por_ponto: f.valor_por_ponto.value,
    email_relatorio: f.email_relatorio.value.trim(),
    valor_semanada_base: f.valor_semanada_base.value,
    valor_desconto_falta: f.valor_desconto_falta.value,
    modo_desconto: f.modo_desconto.value
  };
  const novoPin = f.pin_pais.value.trim();
  if (novoPin) {
    if (!/^\d{4}$/.test(novoPin)) { toast('O PIN precisa ter 4 dígitos'); return; }
    itens.pin_pais = novoPin;
  }
  f.pin_pais.value = '';
  salvarConfig(itens);
});

document.getElementById('inputFoto').addEventListener('change', e => {
  const arquivo = e.target.files && e.target.files[0];
  if (arquivo) aoEscolherFoto(arquivo);
  e.target.value = '';
});

document.getElementById('btnEnviarFoto').addEventListener('click', enviarComprovacao);
document.getElementById('btnCancelarFoto').addEventListener('click', fecharPrevia);
document.getElementById('btnFecharFoto').addEventListener('click', fecharFotoGrande);

document.getElementById('btnTirarOutra').addEventListener('click', () => {
  if (!fotoPendente) return fecharPrevia();
  document.getElementById('modalPrevia').classList.add('oculto');
  const input = document.getElementById('inputFoto');
  input.value = '';
  input.click();
});

document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => {
    if (e.target !== m) return;
    if (m.id === 'modalPin') fecharPin(true);
    else if (m.id === 'modalPrevia') fecharPrevia();
    else if (m.id === 'modalFoto') fecharFotoGrande();
    else if (m.id === 'modalTema') fecharPersonalizacao(false);
    else fecharForm();
  });
});

/* Foto que não carrega (sem internet, link do Drive sem permissão) vira
   um espaço neutro em vez do ícone de imagem quebrada do navegador. */
document.addEventListener('error', e => {
  const el = e.target;
  if (!el || el.tagName !== 'IMG') return;
  if (el.classList.contains('miniatura')) {
    const vazio = document.createElement('span');
    vazio.className = 'sem-foto';
    vazio.textContent = '🖼️';
    vazio.title = 'Não deu para carregar a foto';
    el.replaceWith(vazio);
  } else if (el.id === 'fotoGrandeImg') {
    fecharFotoGrande();
    toast('😕 Não deu para carregar a foto');
  }
}, true);

window.addEventListener('online', () => { atualizarStatusSync(); agendarFlush(300); });
window.addEventListener('offline', atualizarStatusSync);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (cache.hoje && cache.hoje !== hojeISO()) renderCrianca(); // virou o dia
  agendarFlush(200);
  atualizarDoServidor(true);
});

/* ------------------------------------------------------------
 *  Boot
 * ---------------------------------------------------------- */
(function boot() {
  // 0) tema, avatar e estado do som antes do primeiro desenho
  aplicarVisual();
  document.getElementById('iconeSom').textContent = Som.ativo ? '🔊' : '🔇';

  // 1) desenha instantaneamente com o cache local e abre a rota pedida no link
  renderTudo();
  aplicarRota();
  // 2) sincroniza em segundo plano
  agendarFlush(300);
  atualizarDoServidor(true);
  // 3) revalida a cada 60s enquanto o app estiver visível
  setInterval(() => {
    if (document.visibilityState === 'visible') atualizarDoServidor(true);
  }, 60000);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
