<script>
  // 読み込んだ楽譜の五線譜を描く部品（ステップA-2）
  // 楽譜作成アプリ（string-score）からコピーした描画の関数（musicxml/render.js の renderScore）を使って、VexFlow で描く。
  // 枠の幅に合わせて改行し、幅が変わったら（スマホを縦向き⇔横向きにしたときなど）描き直す。

  // onMount：この部品が画面に表示されたときに1回だけ処理をするための仕組み
  import { onMount } from "svelte";

  // 楽譜データを五線譜に描く関数を読み込む（楽譜作成アプリからコピーしたもの）
  import { renderScore } from "#lib/musicxml/render.js";

  // この部品を使う側から受け取る値
  // score     ：楽譜作成アプリの形の楽譜データ（imported.js の toRenderScore で作ったもの。パートは1つ）
  // noteColors：音符ごとの色の表（imported.js の getExcludedNoteColors で作ったもの）。色を付けないときは省略
  let { score, noteColors = new Map() } = $props();

  // ===== 描き方の設定値 =====

  // 楽譜の最低限の幅（ピクセル）。画面がこれより狭いときは、この幅で描いて横にスクロールする
  // （楽譜作成アプリは 600。スマホの縦向き（幅 360 くらい）でも改行して収まるように小さくする）
  const MIN_WIDTH = 280;

  // ===== 描くのに使う値 =====

  // VexFlow の部品一式（読み込みが終わるまでは null）
  // $state を付けると、読み込みが終わって値が入ったときに、下の $effect がもう一度動いて描く
  let VF = $state(null);

  // 枠の幅（ピクセル）。幅が変わったときに入れ直す（$state なので、変わると描き直す）
  let width = $state(0);

  // 五線譜を入れる枠（bind:this で、部品そのものが入る）
  let wrapper = $state(null);

  // 五線譜（SVG）を描き込む場所
  let container = $state(null);

  // 描く関数を呼ぶ係：VexFlow の読み込み・枠の幅・楽譜・色のどれかが変わるたびに描き直す
  // （$effect の中で使っている $state・$props の値が変わると、自動でもう一度動く）
  $effect(() => {
    // まだ準備ができていないとき（VexFlow を読み込み中・幅がまだ分からないとき）は描かない
    if (VF === null || container === null || width === 0) {
      return;
    }

    // 楽譜を描く（選択・範囲・再生中の音符・拍の線は使わないので、null・null・[]・false を渡す）
    renderScore(VF, container, score, width, null, null, [], false, {
      minWidth: MIN_WIDTH, // スマホの幅で改行する
      hideNames: true, // パート名は描かない（ページの上に出しているので）
      noteColors: noteColors, // 判定から外す音を灰色にする
    });
  });

  // この部品が画面に表示されたら、枠の幅を見張り始めて、VexFlow を読み込む
  // （VexFlow はブラウザの中でしか動かないので、ここで読み込む）
  onMount(() => {
    // 枠の幅が変わったら、width に入れ直す（→ 上の $effect で描き直される）
    // ResizeObserver は、要素の大きさが変わったことを教えてくれる仕組み
    const observer = new ResizeObserver(() => {
      // clientWidth は、枠の内側の幅（左右の余白 padding も含む）。余白のぶんを引いて、描ける幅にする
      const style = getComputedStyle(wrapper);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      // 小数を切り捨てる（同じ幅で何度も描き直さないように、整数にそろえる）
      const newWidth = Math.floor(wrapper.clientWidth - padding);
      if (newWidth !== width) {
        width = newWidth;
      }
    });
    observer.observe(wrapper);

    // VexFlow を読み込んで、楽譜用のフォントの準備ができたら VF に入れる（→ 上の $effect で描かれる）
    (async () => {
      // VexFlow を読み込む（読み込むと、楽譜用のフォントの読み込みも始まる）
      const loaded = (await import("vexflow")).default;
      // 楽譜用のフォント（Bravura）の読み込みが終わるのを待つ（終わる前に描くと、記号が正しく出ない）
      await document.fonts.ready;
      VF = loaded;
    })();

    // この部品が画面から消えるときの後片付け（幅の見張りをやめる）
    return () => {
      observer.disconnect();
    };
  });
</script>

<!-- 五線譜が入る枠 -->
<div class="staff-view" bind:this={wrapper}>
  <!-- VexFlow の読み込み中だけ、案内を出す -->
  {#if VF === null}
    <p class="loading">楽譜を準備しています…</p>
  {/if}

  <!-- ここに五線譜（SVG）が描かれる -->
  <div bind:this={container}></div>
</div>

<style>
  /* 五線譜の枠：白い地にうすい枠線。最低限の幅より狭い画面では、横にスクロールする */
  .staff-view {
    overflow-x: auto;
    padding: 4px;
    background-color: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
  }

  /* 読み込み中の案内 */
  .loading {
    margin: 12px 0;
    text-align: center;
    font-size: 0.9rem;
    color: #757575;
  }
</style>
