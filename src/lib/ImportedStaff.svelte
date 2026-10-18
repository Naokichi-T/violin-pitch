<script>
  // 読み込んだ楽譜の五線譜を描く部品（ステップA-2）
  // 楽譜作成アプリ（string-score）からコピーした描画の関数（musicxml/render.js の renderScore）を使って、VexFlow で描く。
  // 枠の幅に合わせて改行し、幅が変わったら（スマホを縦向き⇔横向きにしたときなど）描き直す。
  // （ステップB：音符のタップ（onselect）、目標の音への自動スクロール（focus）、高さの決まった枠（maxHeight）を足した）

  // onMount：この部品が画面に表示されたときに1回だけ処理をするための仕組み
  // tick：画面の書き換えが終わるのを待つための仕組み（描いたあとにスクロールするときに使う）
  import { onMount, tick } from "svelte";

  // 楽譜データを五線譜に描く関数を読み込む（楽譜作成アプリからコピーしたもの）
  import { renderScore } from "#lib/musicxml/render.js";

  // この部品を使う側から受け取る値
  // score     ：楽譜作成アプリの形の楽譜データ（imported.js の toRenderScore で作ったもの。パートは1つ）
  // noteColors：音符ごとの色の表（キーは "0-小節-番号"、値は色）。色を付けないときは省略
  // onselect  ：音符をタップしたときに呼ぶ関数。音符の場所 { measure, note } を渡す（ステップB）
  //             省略したときは、タップしても何もしない
  // focus     ：見えるようにしたい音符の場所 { measure, note }（ステップB）
  //             この音符の段が枠の外にあるときは、枠の中を自動でスクロールして見せる。省略したら何もしない
  // maxHeight ：枠の高さの上限（CSS の書き方。例："40vh"）（ステップB）
  //             これより高い楽譜は、枠の中でスクロールする。省略したら上限なし（楽譜の高さのまま）
  let { score, noteColors = new Map(), onselect = null, focus = null, maxHeight = null } = $props();

  // ===== 描き方の設定値 =====

  // 楽譜の最低限の幅（ピクセル）。画面がこれより狭いときは、この幅で描いて横にスクロールする
  // （楽譜作成アプリは 600。スマホの縦向き（幅 360 くらい）でも改行して収まるように小さくする）
  const MIN_WIDTH = 280;

  // 音符のタップの当たりを、音符を囲む四角より、まわりに何ピクセル広くするか（指で押しやすくするため）（ステップB）
  const HIT_MARGIN = 8;

  // 自動スクロールで、段の上に残すすき間（ピクセル）（ステップB）
  const SCROLL_MARGIN = 8;

  // ===== 描くのに使う値 =====

  // VexFlow の部品一式（読み込みが終わるまでは null）
  // $state を付けると、読み込みが終わって値が入ったときに、下の $effect がもう一度動いて描く
  let VF = $state(null);

  // 枠の幅（ピクセル）。幅が変わったときに入れ直す（$state なので、変わると描き直す）
  let width = $state(0);

  // 五線譜を入れる枠（bind:this で、部品そのものが入る）。この枠の中でスクロールする
  let wrapper = $state(null);

  // 五線譜（SVG）を描き込む場所
  let container = $state(null);

  // 最後に描いたときの、音符ごとの当たり判定の四角の一覧（renderScore が返すもの）（ステップB）
  // タップした音符を探すのと、自動スクロールで段の位置を調べるのに使う（画面には出さないので $state は付けない）
  let hitBoxes = [];

  // 描く関数を呼ぶ係：VexFlow の読み込み・枠の幅・楽譜・色・focus のどれかが変わるたびに描き直す
  // （$effect の中で使っている $state・$props の値が変わると、自動でもう一度動く）
  $effect(() => {
    // まだ準備ができていないとき（VexFlow を読み込み中・幅がまだ分からないとき）は描かない
    if (VF === null || container === null || width === 0) {
      return;
    }

    // 楽譜を描く（選択・範囲・再生中の音符・拍の線は使わないので、null・null・[]・false を渡す）
    const result = renderScore(VF, container, score, width, null, null, [], false, {
      minWidth: MIN_WIDTH, // スマホの幅で改行する
      hideNames: true, // パート名は描かない（ページの上に出しているので）
      noteColors: noteColors, // 判定から外す音の灰色・目標の音・通過した音などの色
    });
    hitBoxes = result.hitBoxes;

    // 見せたい音符があれば、その段が見えるようにスクロールする（描き終わって、画面に出てから）
    const target = focus;
    if (target !== null) {
      tick().then(() => scrollToNote(target));
    }
  });

  /**
   * 音符の段が枠の中に見えるように、枠の中をスクロールする関数（ステップB）
   * 段がもう全部見えているときは、動かさない（目標の音が変わるたびに画面が動くと見づらいため）。
   * @param {{measure: number, note: number}} position - 見せたい音符の場所
   */
  function scrollToNote(position) {
    // その音符の当たり判定の四角を探す（パートはいつも 0）
    const box = hitBoxes.find((item) => item.measure === position.measure && item.note === position.note);
    if (box === undefined || wrapper === null) {
      return;
    }

    // 段の上端と下端を、枠の中の位置に直す（container.offsetTop は、枠の上端から SVG の上端までの距離）
    const top = container.offsetTop + box.lineTop;
    const bottom = container.offsetTop + box.lineBottom;

    // 今、枠の中で見えている範囲
    const visibleTop = wrapper.scrollTop;
    const visibleBottom = wrapper.scrollTop + wrapper.clientHeight;

    // 段が見えている範囲からはみ出しているときだけ、段の上端が枠の上に来るようにスクロールする
    if (top < visibleTop || bottom > visibleBottom) {
      wrapper.scrollTo({ top: Math.max(0, top - SCROLL_MARGIN), behavior: "smooth" });
    }
  }

  /**
   * 五線譜をタップ（クリック）したときに呼ばれる関数（ステップB）
   * タップした所にある音符を探して、使う側に場所を伝える。
   * @param {MouseEvent} event - タップしたときの出来事（どこを押したかが入っている）
   */
  function handleClick(event) {
    // タップを使わないとき、まだ描いていないときは、何もしない
    if (onselect === null) {
      return;
    }
    const svg = container.querySelector("svg");
    if (svg === null) {
      return;
    }

    // 押した所を、SVG の左上からの位置に直す（getBoundingClientRect は、画面の上での位置と大きさ）
    const rect = svg.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // 押した所を囲む音符を探す（まわりに HIT_MARGIN だけ広げる。重なっていたら、横のまん中がいちばん近いもの）
    let found = null;
    let bestDistance = Infinity;
    hitBoxes.forEach((box) => {
      const inside = x >= box.x - HIT_MARGIN && x <= box.x + box.w + HIT_MARGIN && y >= box.y - HIT_MARGIN && y <= box.y + box.h + HIT_MARGIN;
      if (!inside) {
        return;
      }
      const distance = Math.abs(x - (box.x + box.w / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        found = box;
      }
    });

    // 見つかったら、使う側に場所を伝える
    if (found !== null) {
      onselect({ measure: found.measure, note: found.note });
    }
  }

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
<!-- maxHeight があるときは、枠の高さに上限を付けて、はみ出した分は枠の中で縦にスクロールする（ステップB） -->
<div class="staff-view" bind:this={wrapper} style:max-height={maxHeight} style:overflow-y={maxHeight !== null ? "auto" : null}>
  <!-- VexFlow の読み込み中だけ、案内を出す -->
  {#if VF === null}
    <p class="loading">楽譜を準備しています…</p>
  {/if}

  <!-- ここに五線譜（SVG）が描かれる。タップすると、その音符を使う側に伝える（ステップB） -->
  <!-- キーボードでの操作は、練習ページの「前の音」「次の音」ボタンで行えるので、ここでは受け取らない -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="staff-canvas" class:tappable={onselect !== null} bind:this={container} onclick={handleClick}></div>
</div>

<style>
  /* 五線譜の枠：白い地にうすい枠線。最低限の幅より狭い画面では、横にスクロールする */
  /* position: relative は、中の SVG の位置（offsetTop）を、この枠から測るため（ステップB） */
  .staff-view {
    position: relative;
    overflow-x: auto;
    padding: 4px;
    background-color: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
  }

  /* 音符をタップできるときは、カーソルを指の形にする（ステップB） */
  .staff-canvas.tappable {
    cursor: pointer;
  }

  /* 読み込み中の案内 */
  .loading {
    margin: 12px 0;
    text-align: center;
    font-size: 0.9rem;
    color: #757575;
  }
</style>
