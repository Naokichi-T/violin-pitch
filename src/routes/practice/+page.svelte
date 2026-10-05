<script>
  // onMount：このページが画面に表示された直後に処理をするための仕組み
  // onDestroy：このページが画面から消えるときに後片付けをするための仕組み
  import { onMount, onDestroy } from "svelte";

  // 音のデータを表示用の文字にする関数を読み込む
  import { noteToText } from "#lib/score.js";

  // 調のデータに関する設定値と関数を読み込む
  import { DEFAULT_KEY_ID, getKey, getKeyLabel } from "#lib/key.js";

  // 音律のデータと、周波数や平均律からのズレを計算する関数を読み込む
  import { DEFAULT_TEMPERAMENT_ID, getTemperament, getFrequency, getCentsFromEqual } from "#lib/tuning.js";

  // 保存された音律と、作業中の楽譜を、ブラウザから読み込む関数を読み込む
  import { loadTemperamentId, loadCurrentScore } from "#lib/settings.js";

  // 指定した周波数の音を鳴らす関数と、鳴っている音を止める関数を読み込む
  import { playTone, stopTone } from "#lib/audio.js";

  // マイクの音の高さを調べはじめる関数と、やめる関数を読み込む
  import { startMicrophone, stopMicrophone } from "#lib/microphone.js";

  // ズレ（セント）を「+3」「−8」のような表示用の文字にする関数と、
  // 周波数から一番近い音名を求める関数を読み込む
  import { formatCents, frequencyToNote } from "#lib/note.js";

  // 五線譜を描く部品を読み込む
  import Staff from "#lib/Staff.svelte";

  // ズレを表示するメーターの部品を読み込む
  import Meter from "#lib/Meter.svelte";

  // ===== 判定に関する設定値 =====

  // 「OK」とする範囲（セント）。目標の音とのズレがこの範囲に入っていれば OK
  // 今はノーマルの値だけ。あとで、ノーマルとイージーを切り替えられるようにする
  const TOLERANCE = 10;

  // メーターに表示する範囲（セント）。ズレがこれを超えたら「もっと高い」「もっと低い」と表示する
  const METER_RANGE = 50;

  // OK を何ミリ秒保てたら、次の音へ進むか（500ミリ秒 ＝ 0.5秒）
  const HOLD_MILLISECONDS = 500;

  // OK から外れても、この時間（ミリ秒）以内に OK に戻れば、保てていることにする
  // 弓を返すときなどの、ごく短い途切れでやり直しにならないようにするため
  const GRACE_MILLISECONDS = 150;

  // 次の音へ進んだ直後に、判定を待つ時間（ミリ秒）
  // 前の音の響きを拾って、次の音の判定を始めてしまうのを防ぐため
  const WAIT_AFTER_ADVANCE_MILLISECONDS = 300;

  // 2つの音が「同じ高さ」かどうかを見分けるための幅（セント）
  // 次の音が同じ高さのときは、いったん音が途切れるまで判定を待つ
  const SAME_PITCH_CENTS = 30;

  // お手本の音を鳴らす長さ（秒）
  const LISTEN_SECONDS = 1;

  // お手本の音を鳴らしたあと、判定を止めておく時間（ミリ秒）
  // お手本の音をマイクが拾って「OK」になってしまうのを防ぐため、鳴らす長さより少し長くする
  const MUTE_MILLISECONDS = LISTEN_SECONDS * 1000 + 200;

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // 練習する楽譜の音の並び（音のデータの配列）。画面に表示された後で、保存された楽譜を読み込む
  let notes = $state([]);

  // 楽譜の調の id
  let keyId = $state(DEFAULT_KEY_ID);

  // 音律の id
  let temperamentId = $state(DEFAULT_TEMPERAMENT_ID);

  // 保存された楽譜の読み込みが終わったかどうか（true：終わった、false：まだ）
  // 読み込む前に「楽譜がありません」と表示されてしまうのを防ぐための目印
  let isLoaded = $state(false);

  // 今の目標の音が何番目か（0から始まる）
  let targetIndex = $state(0);

  // 調のデータ
  // $derived を付けると、keyId が変わるたびに自動で探し直される
  let currentKey = $derived(getKey(keyId));

  // 音律のデータ（名前を表示するために使う）
  let currentTemperament = $derived(getTemperament(temperamentId));

  // マイクで音を聴いているかどうか（true：聴いている、false：止まっている）
  let isListening = $state(false);

  // マイクで検出した、今弾いている音の周波数（Hz）。音が出ていないときは null
  let detectedFrequency = $state(null);

  // エラーメッセージ（エラーがないときは空文字）
  let errorMessage = $state("");

  // OK をどのくらい保てているか（0〜1）。0 は保てていない、1 は必要な時間を保てた
  // ゲージの長さに使う
  let holdProgress = $state(0);

  // それぞれの音を通過したかどうか（notes と同じ順番で、true か false が並ぶ配列）
  // 例：[true, true, false, false] は、1番目と2番目を通過した状態
  let passed = $state([]);

  // 最後の音まで通過したかどうか（true：最後まで弾けた、false：まだ途中）
  let isFinished = $state(false);

  // ===== 判定のために覚えておく値（画面には表示しないので $state は付けない） =====

  // この時刻（ページを開いてからのミリ秒）までは、判定を止めておく
  // お手本の音を鳴らしている間、その音をマイクが拾ってしまうため
  let muteUntil = 0;

  // OK になりはじめた時刻（ミリ秒）。OK を保てていないときは null
  let holdStartTime = null;

  // 最後に OK だった時刻（ミリ秒）。短い途切れを見逃すために使う
  let lastOkTime = 0;

  // この時刻（ミリ秒）までは、次の音の判定を始めない（次の音へ進んだ直後の待ち時間）
  let waitUntil = 0;

  // 音がいったん途切れるのを待っているかどうか
  // 同じ高さの音が続くときに、前の音を弾き続けているだけで通過してしまうのを防ぐ
  let needRelease = false;

  // 今の目標の音のデータ（音が1つもないときは null）
  let targetNote = $derived(notes.length > 0 ? notes[targetIndex] : null);

  // 今の目標の音の、選択中の音律での周波数（Hz）。目標の音がないときは null
  let targetFrequency = $derived(targetNote !== null ? getFrequency(targetNote, currentKey, temperamentId) : null);

  // このページが画面に表示された直後に、保存された音律と楽譜をブラウザから読み込む
  // （ブラウザの保存領域は、画面に表示された後でないと使えないため、ここで読み込む）
  onMount(() => {
    temperamentId = loadTemperamentId();

    // 作業中の楽譜を読み込む（保存されていないときは null が入り、何もしない）
    const savedScore = loadCurrentScore();
    if (savedScore !== null) {
      // 調（一覧にない id が保存されていた場合は、getKey がハ長調にしてくれる）
      keyId = getKey(savedScore.keyId).id;

      // 音の並び
      notes = savedScore.notes;

      // 「通過したかどうか」を、音の数だけ用意する（最初は、どの音も通過していない）
      passed = notes.map(() => false);
    }

    // 読み込みが終わった
    isLoaded = true;
  });

  // 今弾いている音が、目標の音から何セントずれているか。プラスは高い、マイナスは低い
  // 音が出ていないときや、目標の音がないときは null
  let cents = $derived(
    detectedFrequency !== null && targetFrequency !== null
      ? // 周波数の比を、セントに変換する（周波数が2倍で1200セント）
        1200 * Math.log2(detectedFrequency / targetFrequency)
      : null,
  );

  // 判定の結果。次の4つのどれかが入る
  //   'none'：音が出ていない
  //   'ok'  ：OK（ズレが OK の範囲に入っている）
  //   'low' ：低い
  //   'high'：高い
  let judgement = $derived(getJudgement(cents));

  // ズレがメーターの範囲を超えているかどうか（別の音を弾いている可能性が高い）
  let isFar = $derived(cents !== null && Math.abs(cents) > METER_RANGE);

  // 今弾いている音に一番近い音名（平均律で調べたもの）。音が出ていないときは null
  // ズレが大きいときに、「今は〇〇の音が出ています」と案内するために使う
  let detectedNote = $derived(detectedFrequency !== null ? frequencyToNote(detectedFrequency) : null);

  // このページが画面から消えるときに、マイクと、鳴っている音を止める
  onDestroy(() => {
    stopMicrophone();
    stopTone();
  });

  /**
   * ズレ（セント）から、判定の結果を決める関数
   * @param {number|null} centsValue - 目標の音からのズレ（セント）。音が出ていないときは null
   * @returns {string} 'none'（音が出ていない）・'ok'・'low'（低い）・'high'（高い）のどれか
   */
  function getJudgement(centsValue) {
    if (centsValue === null) {
      // 音が出ていない
      return "none";
    } else if (centsValue < -TOLERANCE) {
      // OK の範囲より下
      return "low";
    } else if (centsValue > TOLERANCE) {
      // OK の範囲より上
      return "high";
    } else {
      // OK の範囲の中
      return "ok";
    }
  }

  /**
   * マイクで音を聴きはじめる関数
   * 「練習を始める」ボタンを押したときに呼ばれる。
   * マイクの使用許可を取り、弾いている音の高さを調べつづける。
   */
  async function startListening() {
    // 前回のエラーメッセージを消す
    errorMessage = "";

    try {
      // マイクを開始する。音の高さが分かるたびに、handlePitch が呼ばれる
      await startMicrophone(handlePitch);

      // 聴いている状態にする
      isListening = true;
    } catch (error) {
      // 許可を拒否された場合や、マイクが見つからない場合はここに来る
      // どんなエラーかは、microphone.js が日本語のメッセージにしてくれている
      errorMessage = error.message;
    }
  }

  /**
   * マイクで音の高さが分かるたびに呼ばれる関数（1秒に約60回）
   * 検出した音を画面に反映し、OK を保てている時間を数えて、十分に保てたら次の音へ進む。
   * @param {number|null} frequency - 検出した周波数（Hz）。音が出ていないときは null
   */
  function handlePitch(frequency) {
    // 今の時刻（ページを開いてからのミリ秒）
    const now = performance.now();

    // お手本の音を鳴らしている間は、音が出ていないことにして、何も数えない
    if (now < muteUntil) {
      detectedFrequency = null;
      resetHold();
      return;
    }

    // 検出した周波数を入れる（これで、ズレと判定の結果も自動で計算し直される）
    detectedFrequency = frequency;

    // 最後まで弾けたあとは、メーターを動かすだけで、通過の判定はしない
    if (isFinished) {
      return;
    }

    // 次の音へ進んだ直後の待ち時間の間は、何も数えない
    if (now < waitUntil) {
      resetHold();
      return;
    }

    // 音が途切れるのを待っているとき
    if (needRelease) {
      if (judgement === "ok") {
        // まだ前の音が鳴りつづけているので、何も数えない
        resetHold();
        return;
      }

      // 音が途切れた（または別の高さになった）ので、ここから先はふつうに判定する
      needRelease = false;
    }

    if (judgement === "ok") {
      // OK のとき：OK になりはじめた時刻を覚える（すでに覚えていれば、そのまま）
      if (holdStartTime === null) {
        holdStartTime = now;
      }

      // 最後に OK だった時刻を更新する
      lastOkTime = now;

      // OK を保てている時間を、必要な時間で割って、0〜1 の割合にする
      holdProgress = Math.min(1, (now - holdStartTime) / HOLD_MILLISECONDS);

      // 必要な時間を保てたら、この音を通過して次へ進む
      if (holdProgress >= 1) {
        passTarget();
      }
    } else if (holdStartTime !== null && now - lastOkTime > GRACE_MILLISECONDS) {
      // OK から外れて、見逃す時間も過ぎたとき：最初から数え直す
      resetHold();
    }
  }

  /**
   * OK を保てている時間の記録を、最初に戻す関数
   */
  function resetHold() {
    holdStartTime = null;
    holdProgress = 0;
  }

  /**
   * 今の目標の音を通過して、次の音へ進む関数
   * OK を必要な時間だけ保てたときに呼ばれる。
   */
  function passTarget() {
    // 今の音に、通過した印を付ける（五線譜の音符が緑になる）
    passed[targetIndex] = true;

    // 数えていた時間を最初に戻す
    resetHold();

    // 最後の音だったときは、ここで終わる
    if (targetIndex === notes.length - 1) {
      isFinished = true;
      return;
    }

    // 通過した音の周波数を覚えておく（次の音と同じ高さかどうかを調べるため）
    const previousFrequency = targetFrequency;

    // 次の音を目標にする（これで、目標の音の周波数も自動で計算し直される）
    targetIndex = targetIndex + 1;

    // 前の音の響きを拾わないように、少しの間、判定を待つ
    waitUntil = performance.now() + WAIT_AFTER_ADVANCE_MILLISECONDS;

    // 次の音が前の音とほぼ同じ高さのときは、いったん音が途切れるまで判定を待つ
    // （前の音を弾き続けているだけで、次の音も通過してしまうのを防ぐため）
    const centsBetween = 1200 * Math.log2(targetFrequency / previousFrequency);
    needRelease = Math.abs(centsBetween) < SAME_PITCH_CENTS;
  }

  /**
   * 最初の音からやり直す関数
   * 「最初からもう一度」ボタンを押したときに呼ばれる。
   */
  function restart() {
    // どの音も通過していない状態に戻す
    passed = notes.map(() => false);
    isFinished = false;

    // 最初の音を目標にする
    targetIndex = 0;
    needRelease = false;
    resetHold();
  }

  /**
   * マイクで音を聴くのをやめる関数
   * 「やめる」ボタンを押したときに呼ばれる。
   */
  function stopListening() {
    stopMicrophone();

    // 止まっている状態に戻し、検出した音も消す
    isListening = false;
    detectedFrequency = null;

    // 数えていた時間も最初に戻す
    resetHold();
  }

  /**
   * 目標の音を、指定した位置に動かす関数
   * 五線譜の音符をタップしたときと、「前の音」「次の音」ボタンを押したときに使う。
   * @param {number} index - 新しく目標にする音が何番目か（0から始まる）
   */
  function setTarget(index) {
    // 楽譜の範囲の外（最初より前、最後より後）には動かさない
    if (index < 0 || index >= notes.length) {
      return;
    }

    targetIndex = index;

    // 目標を手動で動かしたので、数えていた時間を最初に戻す
    resetHold();
    needRelease = false;

    // 最後まで弾けたあとに動かした場合は、また通過の判定をするようにする
    isFinished = false;
  }

  /**
   * 目標の音を鳴らす関数
   * 「目標の音を聴く」ボタンを押したときに呼ばれる。
   * お手本として、選択中の音律での高さの音を鳴らす。
   * マイクで聴いているときは、お手本の音を拾わないように、鳴っている間だけ判定を止める。
   */
  function playTarget() {
    // 目標の音がないときは、何もしない
    if (targetFrequency === null) {
      return;
    }

    playTone(targetFrequency, LISTEN_SECONDS);

    // お手本の音が鳴っている間は、判定を止めておく
    muteUntil = performance.now() + MUTE_MILLISECONDS;
    detectedFrequency = null;
  }
</script>

<main>
  <!-- 画面の上の行：ホームへ戻るリンクと、ページのタイトルを横に並べる -->
  <div class="header-row">
    <a class="back-link" href="/">← ホーム</a>
    <h1>練習</h1>
  </div>

  {#if !isLoaded}
    <!-- 楽譜を読み込むまでの、ごく短い間の表示 -->
    <p class="message">読み込み中…</p>
  {:else if notes.length === 0}
    <!-- 楽譜に音が1つもないとき：編集ページへ案内する -->
    <p class="message">楽譜に音がありません。先に音を入れてください。</p>
    <a class="link-button" href="/score">楽譜の編集へ</a>
  {:else}
    <!-- 楽譜の調と音律（編集ページで決めたものを表示するだけで、ここでは変えられない） -->
    <p class="score-info">{getKeyLabel(currentKey)}・{currentTemperament.name}</p>

    <!-- 五線譜（目標の音を、編集ページの「選択中」と同じ青で表示する） -->
    <!-- passed を渡して、通過した音符を緑で表示する -->
    <!-- 音符をタップすると、その音を目標にする -->
    <Staff {notes} signature={currentKey.signature} selectedIndex={targetIndex} {passed} onselect={setTarget} />

    <!-- 目標の音の表示 -->
    <div class="target-area">
      <p class="target-caption">目標の音（{targetIndex + 1} / {notes.length}）</p>

      <!-- 音名を大きく表示する -->
      <p class="target-name">{noteToText(targetNote)}</p>

      <!-- 選択中の音律での周波数と、平均律からのズレ -->
      <p class="target-frequency">
        {targetFrequency.toFixed(1)} Hz（平均律より
        {formatCents(getCentsFromEqual(targetNote, currentKey, temperamentId))} セント）
      </p>
    </div>

    <!-- 判定の表示（マイクで聴いているときだけ表示する） -->
    {#if isListening}
      <!-- メーター（ズレ、OK の範囲、表示する範囲を渡して、針で表示する） -->
      <div class="meter-area">
        <Meter {cents} tolerance={TOLERANCE} range={METER_RANGE} />
      </div>

      <!-- ゲージ：OK を保てている時間を、横に伸びる棒で表示する。いっぱいになると次の音へ進む -->
      <!-- aria-hidden は、読み上げで操作する人に、この図を読み上げないようにする設定 -->
      <div class="hold-track" aria-hidden="true">
        <!-- holdProgress（0〜1）を100倍して、棒の幅（％）にする -->
        <div class="hold-bar" style="width: {holdProgress * 100}%"></div>
      </div>

      <!-- 判定の結果によって、文字の色を変える（OK は緑、低いは青、高いは赤） -->
      <div class="judgement-area {judgement}">
        {#if judgement === "none"}
          <!-- 音が出ていないとき -->
          <p class="judgement-text">音を出してください</p>
          <p class="judgement-detail">　</p>
        {:else}
          <!-- 判定の結果を大きく表示する -->
          <p class="judgement-text">
            {#if judgement === "ok"}
              OK
            {:else if judgement === "low"}
              {isFar ? "もっと低い" : "低い"}
            {:else}
              {isFar ? "もっと高い" : "高い"}
            {/if}
          </p>

          <!-- ズレの数値。大きく外れているときは、今出ている音の音名を案内する -->
          <p class="judgement-detail">
            {#if isFar}
              今の音は {detectedNote.name}{detectedNote.octave} 付近です
            {:else}
              {formatCents(cents)} セント
            {/if}
          </p>
        {/if}
      </div>
    {/if}

    <!-- 最後の音まで通過したときの表示 -->
    {#if isFinished}
      <div class="finished-area">
        <p class="finished-text">最後まで弾けました</p>
        <button class="restart-button" onclick={restart}>最初からもう一度</button>
      </div>
    {/if}

    <!-- エラーがあるときだけメッセージを表示する -->
    {#if errorMessage !== ""}
      <p class="error">{errorMessage}</p>
    {/if}

    <!-- マイクで聴いているときは「やめる」ボタン、止まっているときは「練習を始める」ボタンを表示する -->
    {#if isListening}
      <button class="listening-button stop" onclick={stopListening}>やめる</button>
    {:else}
      <button class="listening-button start" onclick={startListening}>練習を始める（マイクを使います）</button>
    {/if}

    <!-- 目標の音を手動で動かすボタン -->
    <div class="move-row">
      <!-- 最初の音が目標のときは、これより前に動かせないので押せない -->
      <button class="move-button" disabled={targetIndex === 0} onclick={() => setTarget(targetIndex - 1)}> ◀ 前の音 </button>

      <!-- 最後の音が目標のときは、これより後に動かせないので押せない -->
      <button class="move-button" disabled={targetIndex === notes.length - 1} onclick={() => setTarget(targetIndex + 1)}> 次の音 ▶ </button>
    </div>

    <!-- 目標の音をお手本として鳴らすボタン -->
    <button class="listen-button" onclick={playTarget}>♪ 目標の音を聴く</button>

    <!-- 編集ページへのリンク -->
    <a class="edit-link" href="/score">楽譜を編集する</a>
  {/if}
</main>

<style>
  /* 画面全体：スマホで見やすいように幅を制限して中央に寄せる */
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 12px 16px 24px 16px;
    font-family: sans-serif;
  }

  /* 画面の上の行：リンクとタイトルを横に並べる */
  .header-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 8px;
  }

  /* ホームへ戻るリンク */
  .back-link {
    color: #1976d2;
    font-size: 0.9rem;
    text-decoration: none;
  }

  /* タイトル */
  h1 {
    font-size: 1.1rem;
    margin: 0;
  }

  /* 「読み込み中」「楽譜に音がありません」のメッセージ */
  .message {
    margin: 24px 0 12px 0;
    color: #616161;
  }

  /* 編集ページへ案内するリンク（ボタンのような見た目にする） */
  .link-button {
    display: block;
    padding: 12px;
    color: white;
    background-color: #1976d2;
    border-radius: 8px;
    text-align: center;
    text-decoration: none;
  }

  /* 楽譜の調と音律：小さくグレーで表示する */
  .score-info {
    margin: 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 目標の音のエリア：中央に寄せる */
  .target-area {
    margin-top: 4px;
    text-align: center;
  }

  /* 「目標の音（3 / 8）」の小さな見出し */
  .target-caption {
    margin: 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 目標の音名：一番大きく表示する */
  .target-name {
    margin: 0;
    font-size: 3rem;
    font-weight: bold;
    /* 五線譜の目標の音と同じ、濃い青にする */
    color: #0d47a1;
  }

  /* 目標の音の周波数 */
  .target-frequency {
    margin: 0;
    font-size: 0.9rem;
    color: #424242;
    /* 数字の幅をそろえて、値が変わっても表示が左右に揺れないようにする */
    font-variant-numeric: tabular-nums;
  }

  /* メーターのエリア：目標の音の表示から少し離す */
  .meter-area {
    margin-top: 12px;
  }

  /* ゲージの枠（グレー）：OK を保てている時間を表示する棒の、背景になる部分 */
  .hold-track {
    height: 8px;
    margin-top: 4px;
    background-color: #e0e0e0;
    border-radius: 4px;
    /* 中の棒が、角の丸みからはみ出さないようにする */
    overflow: hidden;
  }

  /* ゲージの棒（緑）：OK を保てている間、左から右へ伸びる */
  .hold-bar {
    height: 100%;
    background-color: #2e7d32;
  }

  /* 最後まで弾けたときの表示のエリア：中央に寄せる */
  .finished-area {
    margin-top: 12px;
    text-align: center;
  }

  /* 「最後まで弾けました」の文字：緑で大きく表示する */
  .finished-text {
    margin: 0;
    font-size: 1.4rem;
    font-weight: bold;
    color: #2e7d32;
  }

  /* 「最初からもう一度」ボタン：白地に緑の枠 */
  button.restart-button {
    width: 100%;
    margin-top: 8px;
    color: #2e7d32;
    background-color: white;
    border: 2px solid #2e7d32;
  }

  /* 判定の表示のエリア：中央に寄せる */
  .judgement-area {
    margin-top: 4px;
    text-align: center;
    /* 文字の色は、判定の結果ごとに下で決める。ここは、音が出ていないときのグレー */
    color: #757575;
  }

  /* 判定が OK のとき：緑 */
  .judgement-area.ok {
    color: #2e7d32;
  }

  /* 判定が「低い」のとき：青 */
  .judgement-area.low {
    color: #1565c0;
  }

  /* 判定が「高い」のとき：赤 */
  .judgement-area.high {
    color: #c62828;
  }

  /* 判定の結果（OK・低い・高い）：大きく表示する */
  .judgement-text {
    margin: 0;
    font-size: 1.8rem;
    font-weight: bold;
  }

  /* ズレの数値や、今出ている音の案内 */
  .judgement-detail {
    margin: 0;
    font-size: 1rem;
    /* 数字の幅をそろえて、値が変わっても表示が左右に揺れないようにする */
    font-variant-numeric: tabular-nums;
  }

  /* エラーメッセージ */
  .error {
    margin: 12px 0 0 0;
    color: #c62828;
  }

  /* 「練習を始める」「やめる」ボタン：横幅いっぱいに表示する */
  button.listening-button {
    width: 100%;
    margin-top: 12px;
    color: white;
    border: none;
  }

  /* 「練習を始める」ボタン（青） */
  button.listening-button.start {
    background-color: #1976d2;
  }

  /* 「やめる」ボタン（赤） */
  button.listening-button.stop {
    background-color: #c62828;
  }

  /* 「前の音」「次の音」ボタンを横に並べる */
  .move-row {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  /* ボタン共通：指で押しやすい大きさにする */
  button {
    padding: 12px 0;
    font-size: 1rem;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 押せない状態のボタン：薄く表示する */
  button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* 「前の音」「次の音」ボタン：白地に青い枠。2つで横幅を半分ずつ使う */
  button.move-button {
    flex: 1;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
  }

  /* 「目標の音を聴く」ボタン：緑。横幅いっぱいに表示する */
  button.listen-button {
    width: 100%;
    margin-top: 8px;
    color: white;
    background-color: #2e7d32;
    border: none;
  }

  /* 編集ページへのリンク：小さく、右に寄せて表示する */
  .edit-link {
    display: block;
    margin-top: 16px;
    color: #1976d2;
    font-size: 0.9rem;
    text-align: right;
    text-decoration: none;
  }
</style>
