<script>
  // 読み込んだ楽譜の練習ページ（ステップA-2）
  // URL の id（例：/imported/practice?id=xm1x2y3z4-k8f3q2）で、どの楽譜を開くかを決める。
  // A-2 では、楽譜の情報と五線譜を表示するところまで。「じっくり」「通し」は、ステップ B・C で足す。
  // 横向きのスマホやタブレットでも広く使えるように、五線譜はほかのページより広い幅まで広げる。

  // onMount：このページが画面に表示された直後に処理をするための仕組み
  import { onMount } from "svelte";

  // 読み込んだ楽譜を id で探す関数・五線譜に描く形にする関数・灰色にする音符の表を作る関数を読み込む
  import { getImportedScore, toRenderScore, getExcludedNoteColors } from "#lib/imported.js";

  // 調のデータを探す関数と、調の名前を作る関数を読み込む
  import { getKey, getKeyLabel } from "#lib/key.js";

  // 音律のデータを探す関数を読み込む
  import { getTemperament } from "#lib/tuning.js";

  // 読み込んだ楽譜の五線譜を描く部品を読み込む
  import ImportedStaff from "#lib/ImportedStaff.svelte";

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // 開いている楽譜（読み込んだ楽譜）。見つかるまでは null
  let record = $state(null);

  // 楽譜を探し終わったかどうか（true：探し終わった）
  // 探す前に「見つかりません」と表示されてしまうのを防ぐための目印
  let isLoaded = $state(false);

  // 五線譜に描く形の楽譜（楽譜作成アプリの形）。楽譜が見つかったときに1回だけ作る
  // （描く関数は「同じ楽譜か」を === で比べて、測った結果を使い回すので、毎回作り直さないようにする）
  let renderScoreData = $state(null);

  // 判定から外す音を灰色にするための、音符ごとの色の表
  let noteColors = $state(new Map());

  // このページが画面に表示された直後に、URL の id から楽譜を探す
  // （ブラウザの保存領域は、画面に表示された後でないと使えないため、ここで探す）
  onMount(() => {
    // URL の「?id=○○」の部分を取り出す（なければ null）
    const id = new URL(location.href).searchParams.get("id");

    if (id !== null) {
      const found = getImportedScore(id);
      if (found !== null) {
        record = found;
        renderScoreData = toRenderScore(found);
        noteColors = getExcludedNoteColors(found.partMeasures);
      }
    }

    isLoaded = true;
  });
</script>

<!-- svelte:head の中に書いたものは、ページの「head」（画面には出ない、ページについての情報を書く場所）に入る -->
<svelte:head>
  <!-- title：ブラウザのタブに出る（楽譜が見つかったら、楽譜の名前も出す） -->
  <title>{record !== null ? record.name + "｜" : ""}練習（読み込んだ楽譜）｜バイオリン音程チェック</title>

  <!-- このページは検索結果に載せない（中身は、使う人それぞれのブラウザに入っている楽譜なので） -->
  <meta name="robots" content="noindex" />
</svelte:head>

<main>
  <!-- 画面の上の行：一覧へ戻るリンクと、ページのタイトルを横に並べる -->
  <div class="header-row">
    <a class="back-link" href="/imported">← 読み込んだ楽譜</a>
  </div>

  {#if !isLoaded}
    <!-- 楽譜を探すまでの、ごく短い間の表示 -->
    <p class="message">読み込み中…</p>
  {:else if record === null}
    <!-- 楽譜が見つからないとき（削除したあとに、前のアドレスを開いたときなど） -->
    <p class="message">楽譜が見つかりませんでした。一覧から開き直してください。</p>
    <a class="link-button" href="/imported">読み込んだ楽譜の一覧へ</a>
  {:else}
    <!-- 楽譜の情報 -->
    <h1>{record.name}</h1>
    <p class="detail">
      {record.partName}・{getKeyLabel(getKey(record.keyId))}・♩＝{record.tempo}・{getTemperament(record.temperamentId).name}
    </p>

    <!-- 灰色の音の説明（灰色の音があるときだけ出す） -->
    {#if noteColors.size > 0}
      <p class="note">灰色の音は、判定しない音です（音域の外の音・トリルなどの装飾の付いた音など）。</p>
    {/if}

    <!-- 五線譜 -->
    <div class="staff-area">
      <ImportedStaff score={renderScoreData} {noteColors} />
    </div>

    <!-- 練習のモードは、次のステップで足す -->
    <p class="coming">「じっくり」「通し」の練習は、準備中です。</p>
  {/if}
</main>

<style>
  /* 画面全体：横向きのスマホやタブレットでも広く使えるように、ほかのページ（480px）より広い幅まで広げる */
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 12px 16px 24px 16px;
    font-family: sans-serif;
  }

  /* 画面の上の行 */
  .header-row {
    margin-bottom: 8px;
  }

  /* 一覧へ戻るリンク */
  .back-link {
    color: #1976d2;
    font-size: 0.9rem;
    text-decoration: none;
  }

  /* 楽譜の名前：長いときは折り返す */
  h1 {
    margin: 0;
    font-size: 1.1rem;
    overflow-wrap: anywhere;
  }

  /* パート・調・テンポ・音律：小さくグレーで表示する */
  .detail {
    margin: 2px 0 0 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 灰色の音の説明：小さく表示する */
  .note {
    margin: 6px 0 0 0;
    font-size: 0.8rem;
    color: #757575;
  }

  /* 五線譜のエリア：上に少し間をあける */
  .staff-area {
    margin-top: 10px;
  }

  /* 「準備中です」の案内 */
  .coming {
    margin: 16px 0 0 0;
    font-size: 0.85rem;
    color: #9e9e9e;
    text-align: center;
  }

  /* 「読み込み中」「見つかりませんでした」などのメッセージ */
  .message {
    margin: 24px 0 12px 0;
    color: #616161;
  }

  /* 一覧へ案内するリンク（ボタンのような見た目にする） */
  .link-button {
    display: block;
    max-width: 480px;
    padding: 12px;
    color: white;
    background-color: #1976d2;
    border-radius: 8px;
    text-align: center;
    text-decoration: none;
  }
</style>
