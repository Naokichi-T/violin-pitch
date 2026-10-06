<!-- svelte:head の中に書いたものは、ページの「head」（画面には出ない、ページについての情報を書く場所）に入る -->
<svelte:head>
  <!-- title：ブラウザのタブと、検索結果の見出しに出る -->
  <title>バイオリン音程チェック｜音程を判定する練習アプリ</title>

  <!-- description：検索結果で、見出しの下に出る説明文 -->
  <meta
    name="description"
    content="バイオリンの音程を、マイクで聴いて判定する練習アプリ。楽譜を登録して、1音ずつ合わせる練習や、テンポに合わせて弾いて点数を出す練習ができます。基準音は442Hz（436〜446Hzに変更可）、純正律・ピタゴラス音律・平均律に対応。"
  />

  <!-- canonical：このページの正式なアドレス（同じ内容が別のアドレスで見えても、こちらを正として扱ってもらう） -->
  <link rel="canonical" href="https://violin-pitch.vercel.app/" />

  <!-- ここから下は、LINE や X などにリンクを貼ったときに出る、タイトル・説明・画像の指定（OGP） -->
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="ja_JP" />
  <meta property="og:site_name" content="バイオリン音程チェック" />
  <meta property="og:title" content="バイオリン音程チェック｜音程を判定する練習アプリ" />
  <meta property="og:description" content="バイオリンの音程を、マイクで聴いて判定。1音ずつ合わせる練習や、テンポに合わせて弾いて点数を出す練習ができます。" />
  <meta property="og:url" content="https://violin-pitch.vercel.app/" />
  <!-- 画像は、https:// から始まる完全なアドレスで書く決まり（static フォルダの ogp.png） -->
  <meta property="og:image" content="https://violin-pitch.vercel.app/ogp.png" />

  <!-- X（旧 Twitter）で、大きな画像つきで表示してもらうための指定 -->
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<main>
  <h1>バイオリン音程チェック</h1>

  <!-- ひとことの説明 -->
  <p class="lead">バイオリンの音程を、マイクで聴いて判定する練習アプリです。</p>

  <!-- 各ページへのリンク -->
  <nav>
    <a href="/score">楽譜の編集</a>
    <a href="/library">保存した楽譜</a>
    <a href="/practice">練習</a>
    <a href="/fingerboard">指板の図</a>
    <a href="/tuner">チューナー</a>
  </nav>

  <!-- アプリの説明（初めて来た人と、検索エンジンに、何ができるかを伝える） -->
  <section class="about">
    <h2>できること</h2>
    <ul>
      <li>楽譜を登録して、五線譜で表示・再生できます</li>
      <li>「じっくり」練習：1音ずつ、音程が合うまで次へ進みません</li>
      <li>「通し」練習：テンポに合わせて弾くと、点数が出ます</li>
      <li>区間を指定して、くり返し練習できます</li>
      <li>純正律・ピタゴラス音律・平均律を選べます</li>
      <li>基準音は ラ＝442Hz です。チューナーのページで、436〜446Hz に変えられます</li>
      <li>楽譜は名前を付けて、いくつでも保存できます</li>
      <li>調ごとに、ファーストポジションの音の場所を、指板の図で確認できます</li>
    </ul>

    <h2>使い方</h2>
    <ol>
      <li>「楽譜の編集」で、練習したい音を入れます</li>
      <li>「練習」で、「じっくり」か「通し」を選びます</li>
      <li>マイクの使用を許可して、バイオリンを弾きます</li>
    </ol>

    <p class="note">マイクの音は、この端末の中で音程を調べるためだけに使い、どこにも送信・保存しません。楽譜と設定は、この端末のブラウザの中に保存されます。</p>
  </section>
</main>

<style>
  /* 画面全体：スマホで見やすいように幅を制限して中央に寄せる */
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 24px 16px;
    font-family: sans-serif;
  }

  /* タイトル */
  h1 {
    font-size: 1.4rem;
    margin: 0 0 8px 0;
  }

  /* ひとことの説明 */
  .lead {
    margin: 0 0 20px 0;
    font-size: 0.95rem;
    color: #424242;
  }

  /* アプリの説明のエリア：リンクの下に、少し間を空けて表示する */
  .about {
    margin-top: 32px;
    font-size: 0.9rem;
    line-height: 1.7;
    color: #424242;
  }

  /* 説明の中の見出し（「できること」「使い方」） */
  .about h2 {
    margin: 20px 0 4px 0;
    font-size: 1rem;
    color: #212121;
  }

  /* 説明の中の箇条書き：左の字下げを小さめにする */
  .about ul,
  .about ol {
    margin: 0;
    padding-left: 1.4em;
  }

  /* マイクと保存についての注意書き：薄い青の地に表示する */
  .note {
    margin: 20px 0 0 0;
    padding: 8px 10px;
    font-size: 0.8rem;
    background-color: #e3f2fd;
    border-radius: 8px;
  }

  /* リンクのエリア：リンクを縦に並べる */
  nav {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* 各ページへのリンク：指で押しやすいボタンのような見た目にする */
  nav a {
    display: block;
    padding: 16px;
    font-size: 1.2rem;
    color: white;
    background-color: #1976d2;
    border-radius: 8px;
    text-align: center;
    text-decoration: none;
  }
</style>
