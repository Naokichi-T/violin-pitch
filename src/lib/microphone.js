// 波形から周波数を検出する関数を読み込む
import { detectPitch } from "./pitch.js";

// ===== マイクの音を調べるための設定値 =====

// 一度に取り出す波形データの個数。低い音でも周期を正確に測れるように、多めに取り出す
const FFT_SIZE = 4096;

// 直近の検出値を何回分ためておくか（1秒に約60回検出するので、12回分は約0.2秒分）
// ためた値の中央値を使うことで、たまに大きく外れた値が混ざっても影響を受けないようにする
// 多くすると値が安定するが、弾いた音への反応が遅くなる
const HISTORY_SIZE = 12;

// ===== マイクの音を調べるための部品 =====

// AudioContext：ブラウザで音を扱うための土台になる部品
let audioContext = null;

// AnalyserNode：音の波形データを取り出すための部品
let analyser = null;

// MediaStream：マイクから流れてくる音そのもの
let mediaStream = null;

// マイクの音を AudioContext の中に取り込むための部品
let sourceNode = null;

// 繰り返し処理の番号（停止するときに使う）
let animationId = null;

// 波形データを入れておく入れ物（配列）
let waveform = null;

// 直近の検出値（Hz）をためておく配列。古いものから順に並ぶ
let history = [];

// 音の高さが分かるたびに呼ぶ関数（使う側のページから渡される）
let listener = null;

// マイクを開始した回数。開始の途中で停止されたことに気づくために使う
let requestCount = 0;

/**
 * 中央値を計算する関数
 * 中央値は、値を小さい順に並べたときに真ん中に来る値のこと。
 * たまに大きく外れた値が混ざっても、平均と違って影響を受けにくい。
 * @param {number[]} values - 数値の配列（1個以上入っていること）
 * @returns {number} 中央値
 */
function calculateMedian(values) {
  // 元の配列の順番を変えないように、コピーを作ってから小さい順に並べる
  const sorted = [...values].sort((a, b) => a - b);

  // 真ん中の位置を求める
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    // 個数が奇数のとき：真ん中の1個がそのまま中央値
    return sorted[middle];
  } else {
    // 個数が偶数のとき：真ん中の2個の平均が中央値
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
}

/**
 * マイクの音の高さを調べはじめる関数
 * マイクの使用許可を取り、音の高さが分かるたびに、渡された関数を呼ぶ。
 * ブラウザの決まりで、ボタンを押すなどの操作をきっかけにしないとマイクを使えないので、
 * この関数は、ボタンを押したときの処理の中から呼ぶこと。
 * マイクが使えないときは、理由を日本語で書いたエラーを投げる。
 * @param {(frequency: number|null) => void} onPitch
 *   音の高さが分かるたびに呼ばれる関数。周波数（Hz）が渡される。音が出ていないときは null が渡される
 */
export async function startMicrophone(onPitch) {
  // すでに動いていた場合は、いったん止める
  stopMicrophone();

  // 今回の開始に番号を付けておく（途中で停止されたら、番号が変わる）
  requestCount = requestCount + 1;
  const myRequest = requestCount;

  // マイクが使えない環境（HTTPSではないページなど）かどうかを確認する
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("このブラウザ（またはこのページ）ではマイクが使えません。");
  }

  // マイクの使用許可を求める（ここでブラウザの許可ダイアログが出る）
  let stream;
  try {
    // 楽器の音をそのまま取り込みたいので、通話用の自動補正はすべてオフにする
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false, // エコー除去をオフ
        noiseSuppression: false, // 雑音除去をオフ
        autoGainControl: false, // 音量の自動調整をオフ
      },
    });
  } catch (error) {
    // 許可を拒否された場合や、マイクが見つからない場合はここに来る
    // 画面にそのまま表示できるように、日本語のメッセージにして投げ直す
    if (error.name === "NotAllowedError") {
      throw new Error("マイクの使用が許可されませんでした。ブラウザの設定を確認してください。");
    } else if (error.name === "NotFoundError") {
      throw new Error("マイクが見つかりませんでした。");
    } else {
      throw new Error("マイクの開始に失敗しました：" + error.message);
    }
  }

  // 許可を待っている間に停止されていた場合は、取得したマイクを止めて終わる
  if (myRequest !== requestCount) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }

  // マイクの音を覚えておく
  mediaStream = stream;

  // 音を扱う土台を作る
  audioContext = new AudioContext();

  // マイクの音を土台の中に取り込む
  sourceNode = audioContext.createMediaStreamSource(mediaStream);

  // 波形を取り出す部品を作り、マイクの音をつなぐ
  analyser = audioContext.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  sourceNode.connect(analyser);

  // 波形データを入れる入れ物を、データの個数ぶん用意する
  waveform = new Float32Array(analyser.fftSize);

  // 結果を伝える先の関数を覚えておく
  listener = onPitch;

  // 繰り返し処理を始める
  update();
}

/**
 * 繰り返し処理をする関数
 * 画面の描画に合わせて（1秒に約60回）呼ばれ続ける。
 * 波形データを取り出して周波数を検出し、結果を使う側に伝える。
 */
function update() {
  // 最新の波形データを入れ物に取り出す（値は -1 〜 1 の範囲）
  analyser.getFloatTimeDomainData(waveform);

  // 波形から周波数を検出する（検出できなかったときは null が入る）
  const detected = detectPitch(waveform, audioContext.sampleRate);

  if (detected === null) {
    // 検出できなかったとき：ためた値を消して、「音が出ていない」と伝える
    history = [];
    listener(null);
  } else {
    // 検出できたとき：検出値を配列の最後に追加する
    history.push(detected);

    // ためる個数の上限を超えたら、一番古い値（先頭）を捨てる
    if (history.length > HISTORY_SIZE) {
      history.shift();
    }

    // ためた値の中央値を伝える
    listener(calculateMedian(history));
  }

  // 次の描画のタイミングで、もう一度この関数を呼ぶ
  animationId = requestAnimationFrame(update);
}

/**
 * マイクの音の高さを調べるのをやめる関数
 * 使っていた部品をすべて片付ける。動いていないときに呼んでも問題ない。
 */
export function stopMicrophone() {
  // 開始の途中だった場合に、それを打ち切れるように番号を変える
  requestCount = requestCount + 1;

  // 繰り返し処理を止める
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // マイクと解析用の部品の接続を外す
  if (sourceNode !== null) {
    sourceNode.disconnect();
    sourceNode = null;
  }

  // マイクを止める（ブラウザの「マイク使用中」の表示が消える）
  if (mediaStream !== null) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  // 音を扱う土台を閉じる
  if (audioContext !== null) {
    audioContext.close();
    audioContext = null;
  }

  // 残りの部品を初期状態に戻す
  analyser = null;
  waveform = null;
  history = [];
  listener = null;
}
