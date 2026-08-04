<script lang="ts">
	import HubHome from '$lib/components/HubHome.svelte';

	/**
	 * Legacy path — hub lives at `/` on verimaya.com. Bu sayfa yalnızca prerender
	 * kaynağıdır: build/vitrin/index.html → inject script `hub.html` olarak yazar
	 * (mutlak `/_app` yolları + hydrate olmadan CSR start). Nginx apex `/` → hub.html.
	 *
	 * İstemci `goto('/')` YAPILMAZ (eski blank-page bug). `/vitrin` nginx'te 301 → `/`.
	 */
</script>

<HubHome />
