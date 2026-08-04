<script lang="ts">
	import HubHome from '$lib/components/HubHome.svelte';

	/**
	 * Legacy path — hub lives at `/` on verimaya.com. Bu sayfa yalnızca prerender
	 * kaynağıdır: build/vitrin/index.html → inject script static `hub.html` yazar
	 * (mutlak `/_app` CSS, SvelteKit client YOK — CSR remount apex’i blank yapıyordu).
	 * Nginx apex `/` → hub.html. `/vitrin` nginx’te 301 → `/`.
	 */
</script>

<HubHome />
