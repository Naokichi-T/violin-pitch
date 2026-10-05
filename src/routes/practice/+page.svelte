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

  // ズレ（セント）を「+3」「−8」のような表示用の文字にする関数を読み込む
  import { formatCents } from "#lib/note.js";

  // 五線譜を描く部品を読み込む
  import Staff from "#lib/Staff.svelte";

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
    }

    // 読み込みが終わった
    isLoaded = true;
  });

  // このページが画面から消えるときに、鳴っている音を止める
  onDestroy(() => {
    stopTone();
  });

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
  }

  /**
   * 目標の音を鳴らす関数
   * 「目標の音を聴く」ボタンを押したときに呼ばれる。
   * お手本として、選択中の音律での高さの音を1秒間鳴らす。
   */
  function playTarget() {
    // 目標の音がないときは、何もしない
    if (targetFrequency === null) {
      return;
    }

    playTone(targetFrequency, 1);
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
    <!-- 音符をタップすると、その音を目標にする -->
    <Staff {notes} signature={currentKey.signature} selectedIndex={targetIndex} onselect={setTarget} />

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

  /* 「前の音」「次の音」ボタンを横に並べる */
  .move-row {
    display: flex;
    gap: 8px;
    margin-top: 16px;
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
