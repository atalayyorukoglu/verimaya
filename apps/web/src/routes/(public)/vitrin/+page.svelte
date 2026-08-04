<script lang="ts">
	import HubHome from '$lib/components/HubHome.svelte';

	/**
	 * Legacy path — hub lives at `/` on verimaya.com. Bu sayfa yalnızca prerender
	 * kaynağıdır: build/vitrin/index.html → nginx `hub.html` olarak `/` adresinde servis edilir.
	 *
	 * Burada istemci tarafı `goto('/')` YAPILMAZ. hub.html apex'te sunulduğu için o
	 * yönlendirme hidrasyon sırasında tetiklenir, prerender edilmiş DOM'u söker ve
	 * apex boş sayfa olarak açılır. `/vitrin` zaten nginx'te 301 ile `/` adresine gider.
	 */
</script>

<HubHome />
