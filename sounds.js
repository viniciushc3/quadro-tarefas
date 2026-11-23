/* ============================================================
 *  SOM + VIBRAÇÃO
 *  Tons sintetizados com Web Audio API (sem MP3: funciona offline,
 *  responde na hora e não pesa no cache do PWA), sincronizados com
 *  a Vibration API quando o aparelho tiver.
 *
 *  Uso:  Som.tocar('moeda');   Som.alternar();   Som.ativo
 * ============================================================ */
const Som = (function () {
  const CHAVE = 'qt.som.v1';

  let ligado = true;
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo !== null) ligado = JSON.parse(salvo) === true;
  } catch (e) { /* modo privado: segue ligado */ }

  let ctx = null;
  let suportaAudio = typeof window !== 'undefined' &&
                     !!(window.AudioContext || window.webkitAudioContext);

  /** O contexto só nasce (ou acorda) dentro de um gesto do usuário. */
  function contexto() {
    if (!suportaAudio) return null;
    try {
      if (!ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        ctx = new C();
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    } catch (e) {
      suportaAudio = false;      // navegador bloqueou o áudio: segue só com vibração
      return null;
    }
  }

  /** Uma nota simples com envelope suave (sem cliques). */
  function nota(freq, inicio, duracao, volume, forma) {
    const c = contexto();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const ganho = c.createGain();
      osc.type = forma || 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime + inicio);
      ganho.gain.setValueAtTime(0.0001, c.currentTime + inicio);
      ganho.gain.exponentialRampToValueAtTime(volume, c.currentTime + inicio + 0.012);
      ganho.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + inicio + duracao);
      osc.connect(ganho);
      ganho.connect(c.destination);
      osc.start(c.currentTime + inicio);
      osc.stop(c.currentTime + inicio + duracao + 0.03);
    } catch (e) { /* silencia qualquer falha de áudio */ }
  }

  /** Glissando curto, usado no "pop". */
  function deslizar(de, para, inicio, duracao, volume) {
    const c = contexto();
    if (!c) return;
    try {
      const osc = c.createOscillator();
      const ganho = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(de, c.currentTime + inicio);
      osc.frequency.exponentialRampToValueAtTime(para, c.currentTime + inicio + duracao);
      ganho.gain.setValueAtTime(0.0001, c.currentTime + inicio);
      ganho.gain.exponentialRampToValueAtTime(volume, c.currentTime + inicio + 0.01);
      ganho.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + inicio + duracao);
      osc.connect(ganho);
      ganho.connect(c.destination);
      osc.start(c.currentTime + inicio);
      osc.stop(c.currentTime + inicio + duracao + 0.03);
    } catch (e) { /* idem */ }
  }

  /* ---- receitas: som + padrão de vibração ---- */
  const EFEITOS = {
    // 1. tarefa que conta para a mesada: "moeda"
    moeda: {
      vibrar: [40, 30, 40],
      tocar() {
        nota(1046.50, 0,    0.10, 0.22, 'triangle');   // dó6
        nota(1396.91, 0.07, 0.16, 0.20, 'triangle');   // fá6
        nota(2093.00, 0.13, 0.22, 0.10, 'sine');       // brilho
      }
    },
    // 2. tarefa sem mesada: "plim" leve
    pop: {
      vibrar: [30],
      tocar() { deslizar(620, 980, 0, 0.11, 0.16); }
    },
    // 3. enviado para aprovação: duas notas subindo
    enviado: {
      vibrar: [25, 40, 25],
      tocar() {
        nota(659.25, 0,    0.09, 0.15, 'sine');        // mi5
        nota(880.00, 0.10, 0.14, 0.15, 'sine');        // lá5
      }
    },
    // 4. aprovado pelos pais: acorde maior
    aprovado: {
      vibrar: [50, 40, 80],
      tocar() {
        nota(523.25, 0, 0.42, 0.14, 'triangle');       // dó5
        nota(659.25, 0, 0.42, 0.12, 'triangle');       // mi5
        nota(783.99, 0, 0.46, 0.12, 'triangle');       // sol5
        nota(1046.50, 0.10, 0.34, 0.07, 'sine');
      }
    },
    // 5. recusado: dois tons descendo, discretos
    recusado: {
      vibrar: [80],
      tocar() {
        nota(392.00, 0,    0.14, 0.12, 'triangle');    // sol4
        nota(311.13, 0.14, 0.20, 0.11, 'triangle');    // mi♭4
      }
    },
    // 6. meta batida: fanfarra de "level up"
    levelup: {
      vibrar: [60, 40, 60, 40, 120],
      tocar() {
        nota(523.25, 0,    0.11, 0.16, 'triangle');
        nota(659.25, 0.10, 0.11, 0.16, 'triangle');
        nota(783.99, 0.20, 0.13, 0.17, 'triangle');
        nota(1046.50, 0.31, 0.34, 0.19, 'triangle');
        nota(1318.51, 0.34, 0.32, 0.10, 'sine');
      }
    }
  };

  function vibrar(padrao) {
    try {
      if (navigator.vibrate) navigator.vibrate(padrao);   // iOS simplesmente não tem: segue sem erro
    } catch (e) { /* alguns navegadores lançam em iframes */ }
  }

  function tocar(nome) {
    const efeito = EFEITOS[nome];
    if (!efeito || !ligado) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      efeito.tocar();            // sem vibração para quem pediu menos movimento
      return;
    }
    efeito.tocar();
    vibrar(efeito.vibrar);
  }

  function alternar() {
    ligado = !ligado;
    try { localStorage.setItem(CHAVE, JSON.stringify(ligado)); } catch (e) {}
    if (ligado) tocar('pop');
    return ligado;
  }

  /** Destrava o áudio no primeiro toque da tela (exigência do iOS/Chrome). */
  function destravar() {
    contexto();
    document.removeEventListener('pointerdown', destravar);
    document.removeEventListener('touchstart', destravar);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', destravar, { once: true, passive: true });
    document.addEventListener('touchstart', destravar, { once: true, passive: true });
  }

  return {
    tocar: tocar,
    alternar: alternar,
    vibrar: vibrar,
    get ativo() { return ligado; },
    get temVibracao() { return typeof navigator !== 'undefined' && !!navigator.vibrate; },
    efeitos: Object.keys(EFEITOS)
  };
})();
