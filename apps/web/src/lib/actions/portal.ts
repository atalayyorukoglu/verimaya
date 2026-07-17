/** Moves the node to document.body so fixed overlays aren't clipped by ancestors (e.g. backdrop-blur). */
export function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
}
