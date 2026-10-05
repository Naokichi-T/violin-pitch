// ===== 音を鳴らすための設定値 =====

// 音の大きさ（0〜1）。大きすぎると音が割れるので、ひかえめにしておく
const VOLUME = 0.2;

// 音の出はじめに、音量を 0 から上げていく時間（秒）
// いきなり鳴らすと「プツッ」という雑音が出るので、短い時間をかけて上げる
const ATTACK_TIME = 0.03;

// 音の終わりに、音量を 0 まで下げていく時間（秒）
const RELEASE_TIME = 0.1;

// 鳴っている音を途中で止めるときに、音量を 0 まで下げる時間（秒）
const QUICK_STOP_TIME = 0.03;

// 高い倍音をどこから弱めるか（Hz）。小さくするほど、やわらかい（こもった）音になる
const FILTER_FREQUENCY = 2500;

// ===== 音を鳴らすための部品 =====

// AudioContext：ブラウザで音を扱うための土台になる部品
// 最初に音を鳴らすときに1回だけ作り、そのあとは同じものを使い回す
let audioContext = null;

// 今鳴っている音の部品（鳴っていないときは null）
// 次の音を鳴らす前に、前の音を止めるために覚えておく
let currentOscillator = null;
let currentGain = null;

/**
 * 音を扱う土台（AudioContext）を用意する関数
 * まだ作っていなければ作り、止まっていれば動かす。
 * ブラウザの決まりで、ボタンを押すなどの操作をきっかけにしないと音を出せないので、
 * この関数は、ボタンを押したときの処理の中から呼ぶこと。
 * @returns {AudioContext} 音を扱う土台
 */
function getAudioContext() {
  // まだ作っていないときだけ作る
  if (audioContext === null) {
    audioContext = new AudioContext();
  }

  // ブラウザが土台を一時停止していることがあるので、そのときは動かす
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

/**
 * 今鳴っている音を止める関数
 * 音量をすばやく 0 まで下げてから止める（急に止めると雑音が出るため）。
 * 何も鳴っていないときは、何もしない。
 */
export function stopTone() {
  // 何も鳴っていないとき
  if (currentOscillator === null) {
    return;
  }

  // 今の時刻（AudioContext が動きはじめてからの秒数）
  const now = audioContext.currentTime;

  // 予定していた音量の変化を取り消して、今の音量から 0 まで下げる
  currentGain.gain.cancelScheduledValues(now);
  currentGain.gain.setValueAtTime(currentGain.gain.value, now);
  currentGain.gain.linearRampToValueAtTime(0, now + QUICK_STOP_TIME);

  // 音量が 0 になった時点で、音を作る部品を止める
  currentOscillator.stop(now + QUICK_STOP_TIME);

  // 「何も鳴っていない」状態に戻す
  currentOscillator = null;
  currentGain = null;
}

/**
 * 指定した周波数の音を、決まった長さだけ鳴らす関数
 * 前の音が鳴っている途中なら、それを止めてから鳴らす。
 * @param {number} frequency - 鳴らす音の周波数（Hz）
 * @param {number} duration - 鳴らす長さ（秒）。指定しないときは 0.8 秒
 */
export function playTone(frequency, duration = 0.8) {
  // 音を扱う土台を用意する
  const context = getAudioContext();

  // 前の音が鳴っていれば止める（音が重なって濁るのを防ぐ）
  stopTone();

  // 今の時刻（AudioContext が動きはじめてからの秒数）
  const now = context.currentTime;

  // ----- 音を作る部品（OscillatorNode） -----
  const oscillator = context.createOscillator();

  // 波の形を「のこぎり波」にする。倍音をたくさん含んでいて、弦楽器に少し近い音になる
  oscillator.type = "sawtooth";

  // 音の高さ（周波数）を決める
  oscillator.frequency.value = frequency;

  // ----- 音をやわらかくする部品（BiquadFilterNode） -----
  const filter = context.createBiquadFilter();

  // 「lowpass」は、決めた周波数より高い成分を弱めるフィルター
  // のこぎり波はそのままだときつい音なので、高い倍音を弱めてやわらかくする
  filter.type = "lowpass";
  filter.frequency.value = FILTER_FREQUENCY;

  // ----- 音量を決める部品（GainNode） -----
  const gain = context.createGain();

  // 音量を 0 からはじめて、短い時間で決めた大きさまで上げる
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(VOLUME, now + ATTACK_TIME);

  // 終わりの少し前まで音量を保ち、最後に 0 まで下げる
  gain.gain.setValueAtTime(VOLUME, now + duration - RELEASE_TIME);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  // ----- 部品をつなぐ：音を作る → やわらかくする → 音量を決める → スピーカー -----
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);

  // 鳴らしはじめる時刻と、止める時刻を予約する
  oscillator.start(now);
  oscillator.stop(now + duration);

  // 今鳴っている音として覚えておく
  currentOscillator = oscillator;
  currentGain = gain;

  // 音が最後まで鳴り終わったら、「何も鳴っていない」状態に戻す
  // （途中で次の音に切り替わっていた場合は、次の音の情報を消さないように何もしない）
  oscillator.onended = () => {
    if (currentOscillator === oscillator) {
      currentOscillator = null;
      currentGain = null;
    }
  };
}
