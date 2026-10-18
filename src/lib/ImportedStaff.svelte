<script>
  // 読み込んだ楽譜の五線譜を描く部品（ステップA-2）
  // 楽譜作成アプリ（string-score）からコピーした描画の関数（musicxml/render.js の renderScore）を使って、VexFlow で描く。
  // 枠の幅に合わせて改行し、幅が変わったら（スマホを縦向き⇔横向きにしたときなど）描き直す。
  // （ステップB：音符のタップ（onselect）、目標の音への自動スクロール（focus）、高さの決まった枠（maxHeight）を足した）
  // （ステップB-2：音符の後ろに、うすい青の帯（bands）を敷けるようにした。目標の音を見つけやすくするため）
  // （ステップC-1：五線譜の上に、透明な「重ねる層」を足した（overlayBands・overlayMarks）。
  //   「通し」の演奏中は、色が変わるたびに五線譜を全部描き直すと間に合わないので、この層にだけ描く。
  //   そのため、描き直し・自動スクロール・重ねる層を、それぞれ別の $effect に分けた）

  // onMount：この部品が画面に表示されたときに1回だけ処理をするための仕組み
  // tick：画面の書き換えが終わるのを待つための仕組み（描いたあとにスクロールするときに使う）
  // untrack：$effect の中で、値を「読むだけ（変わっても動き直さない）」にするための仕組み
  import { onMount, tick, untrack } from "svelte";

  // 楽譜データを五線譜に描く関数を読み込む（楽譜作成アプリからコピーしたもの）
  import { renderScore } from "#lib/musicxml/render.js";

  // この部品を使う側から受け取る値
  // score       ：楽譜作成アプリの形の楽譜データ（imported.js の toRenderScore で作ったもの。パートは1つ）
  // noteColors  ：音符ごとの色の表（キーは "0-小節-番号"、値は色）。色を付けないときは省略
  // onselect    ：音符をタップしたときに呼ぶ関数。音符の場所 { measure, note } を渡す（ステップB）
  //               省略したときは、タップしても何もしない
  // focus       ：見えるようにしたい音符の場所 { measure, note }（ステップB）
  //               この音符の段が枠の外にあるときは、枠の中を自動でスクロールして見せる。省略したら何もしない
  //               （ステップC-1：focus が変わっても、五線譜は描き直さない（スクロールだけする））
  // maxHeight   ：枠の高さの上限（CSS の書き方。例："40vh"）（ステップB）
  //               これより高い楽譜は、枠の中でスクロールする。省略したら上限なし（楽譜の高さのまま）
  // bands       ：後ろに帯を敷く音符の場所の配列 [{ measure, note }, ...]（ステップB-2）
  //               手入力の楽譜の五線譜（Staff）の「選択中の青い帯」と同じ見せ方。省略したら帯は敷かない
  //               （変わると五線譜を描き直すので、「じっくり」のように、たまにしか変わらないときに使う）
  // overlayBands：重ねる層に描く帯の配列 [{ positions: [{ measure, note }, ...], color: "#e65100" }, ...]（ステップC-1）
  //               変わっても、五線譜は描き直さず、重ねる層だけを描き直す（「通し」の今の音に使う）
  // overlayMarks：重ねる層に描く、音符の下の小さな印の配列 [{ position: { measure, note }, color, text: "●" }, ...]（ステップC-1）
  //               変わっても、五線譜は描き直さない（「通し」の判定の結果に使う）
  let { score, noteColors = new Map(), onselect = null, focus = null, maxHeight = null, bands = [], overlayBands = [], overlayMarks = [] } = $props();

  // ===== 描き方の設定値 =====

  // 楽譜の最低限の幅（ピクセル）。画面がこれより狭いときは、この幅で描いて横にスクロールする
  // （楽譜作成アプリは 600。スマホの縦向き（幅 360 くらい）でも改行して収まるように小さくする）
  const MIN_WIDTH = 280;

  // 音符のタップの当たりを、音符を囲む四角より、まわりに何ピクセル広くするか（指で押しやすくするため）（ステップB）
  const HIT_MARGIN = 8;

  // 自動スクロールで、段の上に残すすき間（ピクセル）（ステップB）
  const SCROLL_MARGIN = 8;

  // 音符の後ろに敷く帯の見た目（ステップB-2。手入力の楽譜の五線譜の「選択中の帯」と同じ色と透け具合）
  const BAND_COLOR = "#1976d2"; // 帯の色（青）
  const BAND_OPACITY = 0.25; // 透け具合（0 は完全に透明、1 はまったく透けない。五線の線が隠れないように透かす）
  const BAND_PADDING_X = 5; // 帯を、音符の左右にどれだけはみ出させるか（ピクセル）
  const BAND_PADDING_Y = 6; // 帯を、五線・音符の上下にどれだけはみ出させるか（ピクセル）

  // 五線の高さ（ピクセル）。VexFlow の五線は、線と線の間が 10 なので、5本の線で 40（ステップB-2）
  const STAFF_HEIGHT = 40;

  // 音符の下の印の見た目（ステップC-1）
  const MARK_FONT_SIZE = 14; // 印の文字の大きさ（ピクセル）
  const MARK_GAP = 14; // 五線（または、五線より下に出た音符）の下端から、印の文字の下端までの間（ピクセル）

  // SVG の部品を作るときに使う決まった名前（createElementNS に渡す）
  const SVG_NS = "http://www.w3.org/2000/svg";

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

  // 重ねる層（透明な SVG）（ステップC-1）
  let overlay = $state(null);

  // 最後に描いたときの、音符ごとの当たり判定の四角の一覧（renderScore が返すもの）（ステップB）
  // タップした音符を探すのと、自動スクロールで段の位置を調べるのに使う（画面には出さないので $state は付けない）
  let hitBoxes = [];

  // 五線譜を描いた回数（ステップC-1）
  // 描き直したら1つ増やす。自動スクロールと重ねる層の $effect は、これが変わったときにも動き直す
  // （描き直すと、音符の位置が変わることがあるため）
  let renderVersion = $state(0);

  // ① 五線譜を描く係：VexFlow の読み込み・枠の幅・楽譜・色・帯のどれかが変わるたびに描き直す
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
      noteColors: noteColors, // 判定から外す音の灰色・目標の音・通過した音・判定の結果などの色
    });
    hitBoxes = result.hitBoxes;

    // 音符の後ろに帯を敷く（ステップB-2）
    drawBands(bands);

    // 描いた回数を1つ増やす（untrack：ここで renderVersion を読んでも、この $effect が動き直さないようにする）
    untrack(() => {
      renderVersion += 1;
    });
  });

  // ② 自動スクロールの係：見せたい音符（focus）か、描いた回数が変わったときに動く（ステップC-1：①から分けた）
  $effect(() => {
    const target = focus;
    renderVersion; // 描き直したときにも動くように、読んでおく
    if (target !== null) {
      // 画面の書き換えが終わってからスクロールする
      tick().then(() => scrollToNote(target));
    }
  });

  // ③ 重ねる層の係：帯・印か、描いた回数が変わったときに、重ねる層だけを描き直す（ステップC-1）
  $effect(() => {
    const bandsToDraw = overlayBands;
    const marksToDraw = overlayMarks;
    renderVersion; // 描き直したときにも動くように、読んでおく
    if (overlay !== null) {
      drawOverlay(bandsToDraw, marksToDraw);
    }
  });

  /**
   * 音符を囲む帯の四角の位置と大きさを求める関数（ステップC-1：drawBands から取り出して、重ねる層でも使えるようにした）
   * 帯は、五線の高さ全体と、その音符（五線の外に出た玉や符尾も）を囲む大きさにする。
   * @param {{measure: number, note: number}} position - 音符の場所
   * @returns {{x: number, y: number, width: number, height: number}|null} 四角（SVG の中の位置）。音符が見つからないときは null
   */
  function bandRectOf(position) {
    // その音符の当たり判定の四角を探す（パートはいつも 0）
    const box = hitBoxes.find((item) => item.measure === position.measure && item.note === position.note);
    if (box === undefined) {
      return null;
    }

    // 帯の上下：「音符を囲む四角」と「その段の五線」の両方を含む高さにする
    // （音符が五線の中だけにあるときも、帯が五線の高さいっぱいになるように）
    const staffTop = staffTopOf(box);
    const top = Math.min(box.y, staffTop) - BAND_PADDING_Y;
    const bottom = Math.max(box.y + box.h, staffTop + STAFF_HEIGHT) + BAND_PADDING_Y;
    return { x: box.x - BAND_PADDING_X, y: top, width: box.w + BAND_PADDING_X * 2, height: bottom - top };
  }

  /**
   * 四角（帯）の SVG の部品を作る関数（ステップC-1）
   * @param {{x: number, y: number, width: number, height: number}} rect - 四角の位置と大きさ
   * @param {string} color - 色
   * @returns {SVGRectElement} 四角の部品
   */
  function createBandElement(rect, color) {
    // createElementNS は、SVG の部品を作るときの決まった書き方
    const element = document.createElementNS(SVG_NS, "rect");
    element.setAttribute("x", String(rect.x));
    element.setAttribute("y", String(rect.y));
    element.setAttribute("width", String(rect.width));
    element.setAttribute("height", String(rect.height));
    element.setAttribute("rx", "4"); // 角を少し丸くする
    element.setAttribute("fill", color);
    element.setAttribute("fill-opacity", String(BAND_OPACITY));
    element.setAttribute("stroke", "none"); // 枠線は付けない（付けないと、VexFlow の SVG の決まりで黒い枠線が付いてしまう）
    return element;
  }

  /**
   * 音符の後ろに、うすい青の帯（縦長の四角）を敷く関数（ステップB-2）
   * 描いた SVG のいちばん最初に入れるので、音符や五線より後ろ（下）に描かれる。
   * @param {{measure: number, note: number}[]} positions - 帯を敷く音符の場所の配列
   */
  function drawBands(positions) {
    const svg = container.querySelector("svg");
    if (svg === null) {
      return;
    }

    positions.forEach((position) => {
      const rect = bandRectOf(position);
      if (rect === null) {
        return;
      }
      // いちばん最初に入れて、音符や五線より後ろに描かれるようにする
      svg.insertBefore(createBandElement(rect, BAND_COLOR), svg.firstChild);
    });
  }

  /**
   * 重ねる層に、帯と印を描く関数（ステップC-1）
   * 前に描いたものを全部消してから描く。五線譜そのものは描き直さないので、すぐに終わる。
   * @param {{positions: object[], color: string}[]} bandsToDraw - 帯の配列
   * @param {{position: object, color: string, text: string}[]} marksToDraw - 印の配列
   */
  function drawOverlay(bandsToDraw, marksToDraw) {
    const svg = container.querySelector("svg");

    // 前に描いたものを消す
    overlay.innerHTML = "";

    // 五線譜がまだないときは、何も描かない
    if (svg === null) {
      return;
    }

    // 重ねる層を、五線譜（SVG）とぴったり同じ位置・大きさにする
    overlay.setAttribute("width", svg.getAttribute("width"));
    overlay.setAttribute("height", svg.getAttribute("height"));
    overlay.style.left = container.offsetLeft + "px";
    overlay.style.top = container.offsetTop + "px";

    // 帯
    bandsToDraw.forEach((band) => {
      band.positions.forEach((position) => {
        const rect = bandRectOf(position);
        if (rect !== null) {
          overlay.appendChild(createBandElement(rect, band.color));
        }
      });
    });

    // 音符の下の印
    marksToDraw.forEach((mark) => {
      const box = hitBoxes.find((item) => item.measure === mark.position.measure && item.note === mark.position.note);
      if (box === undefined) {
        return;
      }
      // 五線の下端か、五線より下に出た音符の下端の、低いほうの下に置く
      const staffBottom = staffTopOf(box) + STAFF_HEIGHT;
      const y = Math.max(staffBottom, box.y + box.h) + MARK_GAP;
      const text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("x", String(box.x + box.w / 2)); // 音符の横のまん中
      text.setAttribute("y", String(y));
      text.setAttribute("text-anchor", "middle"); // x を文字のまん中にする
      text.setAttribute("font-size", String(MARK_FONT_SIZE));
      text.setAttribute("font-weight", "bold");
      text.setAttribute("fill", mark.color);
      text.textContent = mark.text;
      overlay.appendChild(text);
    });
  }

  /**
   * 音符がある段の、五線のいちばん上の線の高さを求める関数（ステップB-2）
   * 描いた SVG の中から、その音符と同じ段・同じ小節の五線を探して、その上端の高さを返す。
   * @param {object} box - 音符の当たり判定の四角（renderScore が返したもの）
   * @returns {number} 五線のいちばん上の線の高さ（見つからないときは、音符の四角の上端）
   */
  function staffTopOf(box) {
    const svg = container.querySelector("svg");

    // VexFlow は、五線を class="vf-stave" のまとまりで描く。その中の線の高さを調べて、
    // この音符の横の位置にあり、段の上端〜下端の間にある五線を探す
    const staves = svg.querySelectorAll(".vf-stave");
    for (const stave of staves) {
      const rect = stave.getBBox(); // 五線のまとまりを囲む四角（SVG の中の位置）
      const centerX = box.x + box.w / 2;
      const inX = centerX >= rect.x && centerX <= rect.x + rect.width;
      const inLine = rect.y >= box.lineTop && rect.y + rect.height <= box.lineBottom;
      if (inX && inLine) {
        return rect.y;
      }
    }
    return box.y;
  }

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

  <!-- 重ねる層：五線譜の上にぴったり重ねる透明な SVG（ステップC-1） -->
  <!-- pointer-events: none（下の style）で、タップは下の五線譜に通す -->
  <svg class="overlay" bind:this={overlay} aria-hidden="true"></svg>
</div>

<style>
  /* 五線譜の枠：白い地にうすい枠線。最低限の幅より狭い画面では、横にスクロールする */
  /* position: relative は、中の SVG の位置（offsetTop）を、この枠から測るため（ステップB） */
  /* （ステップC-1：重ねる層を、この枠を基準に置くためにも使う） */
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

  /* 重ねる層：五線譜の上に重ねて、タップは下に通す（ステップC-1） */
  .overlay {
    position: absolute;
    pointer-events: none;
    overflow: visible;
  }

  /* 読み込み中の案内 */
  .loading {
    margin: 12px 0;
    text-align: center;
    font-size: 0.9rem;
    color: #757575;
  }
</style>
