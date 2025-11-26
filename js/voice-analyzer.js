(function(){
  const fileInput = document.getElementById('analyzerInput');
  const videoEl = document.getElementById('analyzerVideo');
  const statusEl = document.getElementById('analysisStatus');
  const voiceSummaryEl = document.getElementById('voiceSummary');
  const backgroundSummaryEl = document.getElementById('backgroundSummary');
  const detailedSummaryEl = document.getElementById('analysisSummary');
  const spectrumCanvas = document.getElementById('spectrumCanvas');
  const canvasCtx = spectrumCanvas.getContext('2d');

  let audioContext;
  let analyser;
  let sourceNode;
  let dataArray;
  let animationFrame;
  let samples = [];

  const HUMAN_VOICE_RANGE = { min: 85, max: 255 };
  const MUSIC_RANGE = { min: 400, max: 4000 };
  const BASS_RANGE = { min: 20, max: 80 };

  function createAudioGraph() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (!sourceNode) {
      sourceNode = audioContext.createMediaElementSource(videoEl);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.75;
      dataArray = new Uint8Array(analyser.frequencyBinCount);

      const gainNode = audioContext.createGain();
      gainNode.gain.value = 1;

      sourceNode.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(audioContext.destination);
    }
  }

  function hzForBin(index) {
    return (audioContext.sampleRate / analyser.fftSize) * index;
  }

  function bandEnergy(minHz, maxHz) {
    const start = Math.max(0, Math.floor((minHz / audioContext.sampleRate) * analyser.fftSize));
    const end = Math.min(dataArray.length, Math.ceil((maxHz / audioContext.sampleRate) * analyser.fftSize));

    let total = 0;
    let count = 0;

    for (let i = start; i < end; i++) {
      total += dataArray[i];
      count++;
    }

    return count > 0 ? total / count : 0;
  }

  function drawSpectrum() {
    const { width, height } = spectrumCanvas;
    canvasCtx.clearRect(0, 0, width, height);
    canvasCtx.fillStyle = '#0b1223';
    canvasCtx.fillRect(0, 0, width, height);

    const barWidth = (width / dataArray.length) * 2;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const value = dataArray[i];
      const barHeight = (value / 255) * height;

      canvasCtx.fillStyle = i < (HUMAN_VOICE_RANGE.max / hzForBin(1)) ? '#22c55e' : '#3b82f6';
      canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  }

  function summarize() {
    if (!samples.length) {
      statusEl.textContent = 'Nenhum dado coletado. Toque o vídeo para medir as frequências.';
      return;
    }

    const avg = key => samples.reduce((acc, item) => acc + item[key], 0) / samples.length;
    const avgVoice = avg('voiceEnergy');
    const avgMusic = avg('musicEnergy');
    const avgBass = avg('bassEnergy');
    const avgTotal = avg('totalEnergy');

    const dominant = samples.reduce((prev, curr) => (curr.peakValue > prev.peakValue ? curr : prev), samples[0]);

    const musicLikely = avgMusic > avgVoice * 1.15 && avgBass > avgVoice * 0.5;
    const noiseFloor = avgTotal < 25 ? 'Muito baixo' : avgTotal < 60 ? 'Moderado' : 'Alto';

    voiceSummaryEl.textContent = `${dominant.peakFreq.toFixed(0)} Hz (pico médio da fala)`;
    backgroundSummaryEl.textContent = musicLikely
      ? 'Música/ruído consistente detectado'
      : 'Sem música dominante; ruído moderado';

    detailedSummaryEl.innerHTML = '';

    const items = [
      `Energia média na faixa vocal (85-255 Hz): ${avgVoice.toFixed(1)}%`,
      `Energia média em médios/agudos (400-4000 Hz): ${avgMusic.toFixed(1)}%`,
      `Energia média em graves (20-80 Hz): ${avgBass.toFixed(1)}%`,
      `Frequência de pico mais recorrente: ${dominant.peakFreq.toFixed(0)} Hz`,
      `Ruído de fundo estimado: ${noiseFloor}`,
      musicLikely
        ? 'Possível trilha ou ruído contínuo ocupando médios/agudos. Considere reduzir volume de fundo.'
        : 'Nenhum padrão forte de música detectado; priorize manter a faixa vocal clara.',
    ];

    items.forEach(text => {
      const li = document.createElement('li');
      li.textContent = text;
      detailedSummaryEl.appendChild(li);
    });

    statusEl.textContent = 'Análise concluída.';
  }

  function analyzeFrame() {
    analyser.getByteFrequencyData(dataArray);

    const voiceEnergy = bandEnergy(HUMAN_VOICE_RANGE.min, HUMAN_VOICE_RANGE.max);
    const musicEnergy = bandEnergy(MUSIC_RANGE.min, MUSIC_RANGE.max);
    const bassEnergy = bandEnergy(BASS_RANGE.min, BASS_RANGE.max);
    const totalEnergy = dataArray.reduce((acc, v) => acc + v, 0) / dataArray.length;

    let peakValue = 0;
    let peakIndex = 0;

    dataArray.forEach((value, index) => {
      if (value > peakValue) {
        peakValue = value;
        peakIndex = index;
      }
    });

    samples.push({
      voiceEnergy,
      musicEnergy,
      bassEnergy,
      totalEnergy,
      peakValue,
      peakFreq: hzForBin(peakIndex),
    });

    drawSpectrum();
    animationFrame = requestAnimationFrame(analyzeFrame);
  }

  function resetAnalysis() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
    samples = [];
    detailedSummaryEl.innerHTML = '';
    voiceSummaryEl.textContent = '—';
    backgroundSummaryEl.textContent = '—';
    statusEl.textContent = 'Pronto para iniciar a leitura.';

    if (canvasCtx) {
      canvasCtx.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);
    }
  }

  function handlePlay() {
    if (!audioContext) {
      return;
    }

    audioContext.resume();
    statusEl.textContent = 'Coletando dados de frequência...';
    analyzeFrame();
  }

  function handlePause() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
    summarize();
  }

  fileInput.addEventListener('change', event => {
    const [file] = event.target.files;
    if (!file) return;

    resetAnalysis();
    const objectUrl = URL.createObjectURL(file);
    videoEl.src = objectUrl;
    videoEl.load();

    statusEl.textContent = 'Arquivo carregado. Toque para iniciar a análise.';

    createAudioGraph();
  });

  videoEl.addEventListener('play', handlePlay);
  videoEl.addEventListener('pause', handlePause);
  videoEl.addEventListener('ended', handlePause);
})();
