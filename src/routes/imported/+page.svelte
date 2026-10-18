<script>
  // 「読み込んだ楽譜」のページ（ステップA-1a）
  // ［MusicXMLを読み込む］でファイルを選ぶと、読み込むときの窓を出し、［読み込む］で保存して一覧に足す。
  // 読み込んだ楽譜は練習専用（編集ページでは直さない）。手で入力した楽譜（「保存した楽譜」のページ）とは別に並べる。

  // onMount：このページが画面に表示された直後に処理をするための仕組み
  import { onMount } from "svelte";

  // MusicXML のファイルを読む関数・楽譜データにする関数・ファイル名からタイトルを作る関数を読み込む（楽譜作成アプリからコピーしたもの）
  import { readMusicXMLFile, musicXMLToScore, titleFromFileName } from "#lib/musicxml/musicxmlImport.js";

  // 読み込んだ楽譜の一覧を読み込む関数と、新しく足す関数を読み込む
  import { loadImportedScores, addImportedScore } from "#lib/imported.js";

  // 調のデータを探す関数と、調の名前を作る関数を読み込む
  import { getKey, getKeyLabel } from "#lib/key.js";

  // 読み込むときの窓の部品を読み込む
  import ImportDialog from "#lib/ImportDialog.svelte";

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // 読み込んだ楽譜の一覧。画面に表示された後で、ブラウザから読み込む
  let scores = $state([]);

  // 一覧の読み込みが終わったかどうか（true：終わった）
  // 読み込む前に「まだありません」と表示されてしまうのを防ぐための目印
  let isLoaded = $state(false);

  // 窓に渡す、ファイルから読み込んだ楽譜の情報 { score, warnings }。窓を出していないときは null
  let pending = $state(null);

  // ファイルを読んでいる最中かどうか（true：読んでいる。大きいファイルだと少し時間がかかるため）
  let isReading = $state(false);

  // エラーメッセージ（ファイルが読めなかったときなどに表示する）
  let errorMessage = $state("");

  // 読み込みが終わったときのメッセージ（「○○を読み込みました」）
  let doneMessage = $state("");

  // ファイルを選ぶための部品（画面には出さず、ボタンを押したときに、この部品を押したことにする）
  // bind:this を付けると、この変数に部品そのものが入る
  let fileInput = $state(null);

  // 新しい順に並べた一覧（並び替えのメニューは、次のステップ A-1b で付ける）
  // $derived.by を付けると、scores が変わるたびに、自動で並べ替え直される
  let sortedScores = $derived.by(() => {
    // 元の配列を変えないように、コピーしてから並べ替える（読み込んだ日時の大きいほうを前にする）
    return [...scores].sort((a, b) => b.importedAt - a.importedAt);
  });

  // このページが画面に表示された直後に、読み込んだ楽譜の一覧をブラウザから読み込む
  // （ブラウザの保存領域は、画面に表示された後でないと使えないため、ここで読み込む）
  onMount(() => {
    scores = loadImportedScores();
    isLoaded = true;
  });

  /**
   * 読み込んだ日時を、表示用の文字にする関数
   * @param {number} importedAt - 読み込んだ日時（ミリ秒の数字）
   * @returns {string} 表示用の文字（例：'2026/10/18 05:07'）。日時が入っていないときは空の文字
   */
  function formatDate(importedAt) {
    // 数字でないとき（日時が入っていないとき）は、何も表示しない
    if (typeof importedAt !== "number") {
      return "";
    }

    const date = new Date(importedAt);

    // 月・日・時・分は、1けたのときに頭に 0 を付けて2けたにする（padStart は、足りない分を埋める命令）
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return year + "/" + month + "/" + day + " " + hours + ":" + minutes;
  }

  /**
   * ［MusicXMLを読み込む］ボタンを押したときに呼ばれる関数
   * 画面に出していない「ファイルを選ぶ部品」を押したことにして、ファイルを選ぶ画面を出す。
   */
  function chooseFile() {
    errorMessage = "";
    doneMessage = "";
    fileInput.click();
  }

  /**
   * ファイルが選ばれたときに呼ばれる関数
   * ファイルを読んで楽譜データにし、読み込むときの窓を出す。
   * @param {Event} event - ファイルを選んだときの出来事（どのファイルを選んだかが入っている）
   */
  async function handleFileChange(event) {
    // 選ばれたファイル（選ばずに閉じたときは、何もしない）
    const file = event.currentTarget.files[0];
    if (!file) {
      return;
    }

    // 同じファイルをもう一度選んでも「選ばれた」と分かるように、選んだ記録を消しておく
    event.currentTarget.value = "";

    isReading = true;
    try {
      // ファイルから MusicXML の文字を取り出す（.mxl なら解凍する）
      // await は「終わるまで待つ」という意味
      const text = await readMusicXMLFile(file);

      // MusicXML の文字を、楽譜作成アプリの形の楽譜データにする（タイトルがなければ、ファイル名をタイトルにする）
      const { score, warnings } = musicXMLToScore(text, titleFromFileName(file.name));

      // 窓を出す
      pending = { score: score, warnings: warnings };
    } catch (error) {
      // 読めなかったとき（MusicXML ではないファイルなど）。メッセージは読み込みの関数が日本語にしてくれている
      errorMessage = error.message;
    } finally {
      // うまくいっても、いかなくても、読んでいる最中の印を消す
      isReading = false;
    }
  }

  /**
   * 窓で［読み込む］を押したときに呼ばれる関数
   * 楽譜を保存して、一覧を読み込み直す。
   * @param {object} record - 保存する楽譜の形（窓が作ったもの）
   */
  function handleConfirm(record) {
    const saved = addImportedScore(record);

    // 窓を閉じる
    pending = null;

    // 保存できなかったとき（保存領域がいっぱいのときなど）
    if (saved === null) {
      errorMessage = "保存できませんでした。ブラウザの保存領域がいっぱいかもしれません。";
      return;
    }

    // 一覧を読み込み直して、終わったことを知らせる
    scores = loadImportedScores();
    doneMessage = "「" + saved.name + "」を読み込みました。";
  }

  /**
   * 窓で［やめる］を押したときに呼ばれる関数
   * 何も保存せずに、窓を閉じる。
   */
  function handleCancel() {
    pending = null;
  }
</script>

<!-- svelte:head の中に書いたものは、ページの「head」（画面には出ない、ページについての情報を書く場所）に入る -->
<svelte:head>
  <!-- title：ブラウザのタブに出る -->
  <title>読み込んだ楽譜｜バイオリン音程チェック</title>

  <!-- このページは検索結果に載せない（中身は、使う人それぞれのブラウザに入っている楽譜なので） -->
  <meta name="robots" content="noindex" />
</svelte:head>

<main>
  <!-- 画面の上の行：ホームへ戻るリンクと、ページのタイトルを横に並べる -->
  <div class="header-row">
    <a class="back-link" href="/">← ホーム</a>
    <h1>読み込んだ楽譜</h1>
  </div>

  <!-- 読み込むボタン（ファイルを読んでいる最中は押せない） -->
  <button class="import-button" disabled={isReading} onclick={chooseFile}>
    {isReading ? "読み込み中…" : "MusicXMLを読み込む"}
  </button>

  <!-- ファイルを選ぶ部品（画面には出さない）。accept は付けない -->
  <!-- （iPhone では、accept に .musicxml などを書くと、ファイルが選べない灰色になることがあるため。中身で見分ける） -->
  <input class="file-input" type="file" bind:this={fileInput} onchange={handleFileChange} />

  <!-- 説明：どんなファイルを読み込めるか -->
  <p class="hint">楽譜作成アプリなどで書き出した MusicXML（.musicxml・.xml・.mxl）を選んでください。</p>

  <!-- エラーメッセージ：エラーがあるときだけ表示する -->
  {#if errorMessage !== ""}
    <p class="error">{errorMessage}</p>
  {/if}

  <!-- 読み込みが終わったときのメッセージ -->
  {#if doneMessage !== ""}
    <p class="done">{doneMessage}</p>
  {/if}

  {#if !isLoaded}
    <!-- 一覧を読み込むまでの、ごく短い間の表示 -->
    <p class="message">読み込み中…</p>
  {:else if scores.length === 0}
    <!-- 1つも読み込んでいないとき -->
    <p class="message">読み込んだ楽譜はまだありません。</p>
  {:else}
    <!-- 件数 -->
    <p class="count">{scores.length}件</p>

    <!-- 楽譜の一覧 -->
    <ul class="score-list">
      <!-- 並べ替えた一覧から、楽譜を1つずつ取り出して表示する -->
      {#each sortedScores as score (score.id)}
        <li class="score-item">
          <!-- 楽譜の名前 -->
          <p class="score-name">{score.name}</p>

          <!-- 調・読み込んだ日時 -->
          <p class="score-detail">{getKeyLabel(getKey(score.keyId))}・{formatDate(score.importedAt)}</p>

          <!-- 「通し」の最高点：記録があるときだけ表示する（記録するのは、あとのステップ） -->
          {#if typeof score.bestScore === "number"}
            <p class="score-detail best">最高点 {score.bestScore}点</p>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</main>

<!-- 読み込むときの窓：ファイルを読み終わったら出す -->
{#if pending !== null}
  <ImportDialog score={pending.score} warnings={pending.warnings} onconfirm={handleConfirm} oncancel={handleCancel} />
{/if}

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
    margin-bottom: 12px;
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

  /* 読み込むボタン：横幅いっぱいの青いボタン */
  .import-button {
    display: block;
    width: 100%;
    padding: 14px;
    font-size: 1.1rem;
    color: white;
    background-color: #1976d2;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 押せない状態のボタン：薄く表示する */
  .import-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ファイルを選ぶ部品：画面には出さない */
  .file-input {
    display: none;
  }

  /* 説明：小さくグレーで表示する */
  .hint {
    margin: 6px 0 0 0;
    font-size: 0.8rem;
    color: #757575;
  }

  /* エラーメッセージ：赤い字 */
  .error {
    margin: 12px 0 0 0;
    color: #c62828;
  }

  /* 読み込みが終わったときのメッセージ：緑の字 */
  .done {
    margin: 12px 0 0 0;
    color: #2e7d32;
  }

  /* 「読み込み中」「まだありません」などのメッセージ */
  .message {
    margin: 24px 0 12px 0;
    color: #616161;
  }

  /* 件数 */
  .count {
    margin: 20px 0 0 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 楽譜の一覧：縦に並べる */
  .score-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px 0 0 0;
    padding: 0;
    /* リストの先頭の「・」を消す */
    list-style: none;
  }

  /* 楽譜1つぶん：枠で囲む */
  .score-item {
    padding: 8px 10px;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
  }

  /* 楽譜の名前：太字。長いときは折り返す */
  .score-name {
    margin: 0;
    font-size: 1rem;
    font-weight: bold;
    /* 英数字が長く続く名前でも、枠からはみ出さずに折り返す */
    overflow-wrap: anywhere;
  }

  /* 調・読み込んだ日時：小さくグレーで表示する */
  .score-detail {
    margin: 2px 0 0 0;
    font-size: 0.8rem;
    color: #616161;
    /* 数字の幅をそろえる */
    font-variant-numeric: tabular-nums;
  }

  /* 最高点：緑の字にする */
  .score-detail.best {
    color: #2e7d32;
  }
</style>
