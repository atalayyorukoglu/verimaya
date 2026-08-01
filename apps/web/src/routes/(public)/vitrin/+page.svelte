<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import HubHome from '$lib/components/HubHome.svelte';

	/** Legacy path — hub lives at `/` on verimaya.com. Keep prerender for nginx hub.html. */
	$effect(() => {
		if (browser) {
			void goto('/', { replaceState: true });
		}
	});
</script>

<HubHome />
