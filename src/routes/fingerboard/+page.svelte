<script>
  // onMount：このページが画面に表示された直後に処理をするための仕組み
  import { onMount } from "svelte";

  // 調のデータに関する設定値と関数を読み込む
  import { KEYS, DEFAULT_KEY_ID, getKey, getKeyLabel, getScaleNames } from "#lib/key.js";

  // 作業中の楽譜を読み込む関数を読み込む（最初に表示する調を決めるために使う）
  import { loadCurrentScore } from "#lib/settings.js";

  // 指板の図を描く部品を読み込む
  import Fingerboard from "#lib/Fingerboard.svelte";

  // ===== メニューに並べる調の一覧（長調と短調に分けておく） =====

  // 長調だけを取り出した一覧
  const majorKeys = KEYS.filter((key) => key.mode === "major");

  // 短調だけを取り出した一覧
  const minorKeys = KEYS.filter((key) => key.mode === "minor");

  // ===== 印の中に書くものの選択肢 =====

  //   id   ：選択肢を区別するための名前
  //   name ：画面に表示する名前
  const LABEL_MODES = [
    { id: "name", name: "音名" },
    { id: "finger", name: "指番号" },
  ];

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // 選択中の調の id（最初はハ長調）
  let keyId = $state(DEFAULT_KEY_ID);

  // 印の中に書くもの（"name"：音名、"finger"：指番号）
  let labelMode = $state("name");

  // 選択中の調のデータ
  // $derived を付けると、keyId が変わるたびに自動で探し直される
  let currentKey = $derived(getKey(keyId));

  // 選択中の調の音階（文字の配列）。例：['ラ', 'シ', 'ド♯', 'レ', 'ミ', 'ファ♯', 'ソ♯', 'ラ']
  let scaleNames = $derived(getScaleNames(currentKey));

  // このページが画面に表示された直後に、最初に表示する調を決める
  // 1. アドレスの最後に「?key=A-dur」のように調が付いていれば、その調にする（ほかのページから来たとき）
  // 2. 付いていなければ、作業中の楽譜の調にする
  // 3. どちらもなければ、ハ長調のまま
  onMount(() => {
    // アドレスの「?」より後ろの部分から、key の値を取り出す（付いていないときは null）
    const keyFromAddress = new URLSearchParams(location.search).get("key");

    // その id の調が、調の一覧にあるかどうかを確かめる（でたらめな値が付いていたときに備える）
    const isValidKey = KEYS.some((key) => key.id === keyFromAddress);
    if (isValidKey) {
      keyId = keyFromAddress;
      return;
    }

    // 作業中の楽譜があれば、その調にする（一覧にない id のときは、getKey がハ長調にしてくれる）
    const currentScore = loadCurrentScore();
    if (currentScore !== null) {
      keyId = getKey(currentScore.keyId).id;
    }
  });
</script>

<!-- svelte:head の中に書いたものは、ページの「head」（画面には出ない、ページについての情報を書く場所）に入る -->
<svelte:head>
  <!-- title：ブラウザのタブと、検索結果の見出しに出る -->
  <title>指板の図（ファーストポジション）｜バイオリン音程チェック</title>

  <!-- description：検索結果で、見出しの下に出る説明文 -->
  <meta name="description" content="バイオリンのファーストポジションで、調ごとの音階の音が指板のどこにあるかを図で表示します。音名と指番号を切り替えられます。" />
</svelte:head>

<main>
  <!-- 画面の上の行：ホームへ戻るリンク・ページのタイトル・ポジションの名前を横に並べる -->
  <div class="header-row">
    <a class="back-link" href="/">← ホーム</a>
    <h1>指板の図</h1>
    <span class="position">ファーストポジション</span>
  </div>

  <!-- 調のメニューと、印の中に書くものの切り替えを横に並べる -->
  <div class="control-row">
    <!-- 調のメニュー。aria-label は、読み上げで操作する人のための、メニューの説明 -->
    <!-- bind:value を付けると、選んだ調の id が keyId に自動で入る -->
    <select class="key-select" aria-label="調" bind:value={keyId}>
      <!-- optgroup は、メニューの中の見出し付きのグループ -->
      <optgroup label="長調">
        {#each majorKeys as key (key.id)}
          <option value={key.id}>{getKeyLabel(key)}</option>
        {/each}
      </optgroup>
      <optgroup label="短調">
        {#each minorKeys as key (key.id)}
          <option value={key.id}>{getKeyLabel(key)}</option>
        {/each}
      </optgroup>
    </select>

    <!-- 印の中に書くものの切り替え（音名・指番号） -->
    {#each LABEL_MODES as mode (mode.id)}
      <!-- 選択中のほうに selected クラスを付けて色を変える -->
      <button class="choice" class:selected={labelMode === mode.id} onclick={() => (labelMode = mode.id)}>
        {mode.name}
      </button>
    {/each}
  </div>

  <!-- 選択中の調の音階 -->
  <p class="scale">{scaleNames.join(" ")}</p>

  <!-- 指板の図（調と、印の中に書くものを渡す） -->
  <Fingerboard key={currentKey} {labelMode} />

  <!-- 図の見方 -->
  <ul class="legend">
    <li><span class="sample tonic"></span>主音（音階の最初の音）</li>
    <li><span class="sample"></span>音階の音</li>
    <li><span class="sample open"></span>開放弦（指で押さえない）</li>
  </ul>

  <p class="note">
    印の位置は、半音ごとの目安です（実際の指の間隔は、高い音ほど少しずつ狭くなります）。<br />
    指番号の 0 は開放弦です。♯や♭の多い調では、指番号は目安として見てください。<br />
    短調は、調号どおりの音（自然短音階）を表示しています。
  </p>
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
    flex-shrink: 0;
    color: #1976d2;
    font-size: 0.9rem;
    text-decoration: none;
  }

  /* タイトル */
  h1 {
    font-size: 1.1rem;
    margin: 0;
  }

  /* ポジションの名前：小さくグレーで表示する */
  .position {
    font-size: 0.8rem;
    color: #616161;
  }

  /* 調のメニューと、切り替えのボタンを横に並べる */
  .control-row {
    display: flex;
    gap: 6px;
  }

  /* 調のメニュー：残りの横幅を使う。指で押しやすい大きさにする */
  .key-select {
    flex: 1;
    /* min-width: 0 を付けると、中の文字が長くても、ボタンを押し出さずに縮む */
    min-width: 0;
    padding: 8px 4px;
    font-size: 0.95rem;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
    background-color: white;
  }

  /* 切り替えのボタン（選択前）：白地に青い枠 */
  button.choice {
    flex-shrink: 0;
    padding: 8px 12px;
    font-size: 0.9rem;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 切り替えのボタン（選択中）：青く塗る */
  button.choice.selected {
    color: white;
    background-color: #1976d2;
  }

  /* 選択中の調の音階：小さくグレーで表示する */
  .scale {
    margin: 6px 0 10px 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 図の見方：横に並べて、入りきらないときは折り返す */
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin: 12px 0 0 0;
    padding: 0;
    font-size: 0.8rem;
    color: #424242;
    /* リストの先頭の「・」を消す */
    list-style: none;
  }

  /* 図の見方の1つぶん：見本の丸と文字を横に並べる */
  .legend li {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* 見本の丸（音階の音）：青 */
  .sample {
    display: inline-block;
    width: 14px;
    height: 14px;
    background-color: #1976d2;
    border: 2px solid #1976d2;
    border-radius: 50%;
    /* 枠の太さを、幅と高さの中に含める（丸の大きさが変わらないようにする） */
    box-sizing: border-box;
  }

  /* 見本の丸（主音）：オレンジ */
  .sample.tonic {
    background-color: #ef6c00;
    border-color: #ef6c00;
  }

  /* 見本の丸（開放弦）：白地に青い枠 */
  .sample.open {
    background-color: white;
  }

  /* 注意書き：小さくグレーで表示する */
  .note {
    margin: 10px 0 0 0;
    font-size: 0.75rem;
    line-height: 1.6;
    color: #757575;
  }
</style>
