<script lang="ts">
	import HomePageD from '$lib/components/HomePageD.svelte';

	/**
	 * Production hub source — hub lives at `/` on verimaya.com. Bu sayfa yalnızca prerender
	 * kaynağıdır: build/vitrin/index.html → inject script static `hub.html` yazar
	 * (mutlak `/_app` CSS, SvelteKit client YOK — CSR remount apex’i blank yapıyordu).
	 * Nginx apex `/` → hub.html. `/vitrin` nginx’te 301 → `/`.
	 */
</script>

<HomePageD />
