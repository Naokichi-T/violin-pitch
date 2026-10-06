<script>
  // onMount：画面に表示された直後に処理をするための仕組み
  import { onMount } from "svelte";

  // ブラウザのタブに出る小さな絵（ファビコン）を読み込む
  import favicon from "#lib/assets/favicon.svg";

  // 基準の音（ラ4 の高さ）を変える関数を読み込む
  import { setReferenceFrequency } from "#lib/reference.svelte.js";

  // 保存しておいた基準の音を読み込む関数を読み込む
  import { loadReferenceFrequency } from "#lib/settings.js";

  // このファイルは、全部のページに共通の枠。children は、その中に表示する、それぞれのページの中身
  let { children } = $props();

  // どのページを開いたときも、最初に、保存しておいた基準の音をアプリ全体に反映する
  onMount(() => {
    setReferenceFrequency(loadReferenceFrequency());
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
