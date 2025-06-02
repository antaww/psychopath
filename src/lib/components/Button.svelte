<script lang="ts">
	export let text: string = 'Button';
	export let color: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'yellow' | 'neutral' | 'lightorange' | 'flashy-pink' | 'medium-blue' = 'neutral';
	export let onClick: (() => void) | null = null;
	export let href: string | null = null;
	export let disabled: boolean = false;
	export let animation: string | null = 'bounceInDown'; // Default animation
	export let additionalClasses: string = '';
	export let disableHoverEffect: boolean = false;

	// Base classes
	let klasses = 'game-button';

	// Add color class
	if (color !== 'neutral') {
		klasses += ` ${color}`;
	}

	// Add animation class
	if (animation) {
		klasses += ` ${animation}`;
	}

	// Add any additional custom classes
	if (additionalClasses) {
		klasses += ` ${additionalClasses}`;
	}

	if (disableHoverEffect) {
		klasses += ' disable-hover-effect';
	}

	function handleClick(event: MouseEvent) {
		if (onClick && !disabled) {
			onClick();
		}
		// If it's an anchor tag, default behavior (navigation) will occur unless prevented.
		// If it's a button type, and we called onClick, that's its action.
	}

	// Combine local style with passed style from $$restProps
	let finalStyle: string | undefined;
	$: {
		let baseStyle = disabled && href ? 'pointer-events: none;' : '';
		const restStyle = $$restProps.style as string | undefined;
		finalStyle = baseStyle && restStyle ? `${baseStyle} ${restStyle}` : baseStyle || restStyle;
	}
</script>

{#if href}
	<a
		{...$$restProps}
		{href}
		class="{klasses}"
		aria-disabled={disabled}
		style="{finalStyle}"
		rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
		on:click={handleClick}
	>
		<slot>{text}</slot>
	</a>
{:else}
	<button
		{...$$restProps}
		class="{klasses}"
		{disabled}
		on:click={handleClick}
		style="{finalStyle}"
	>
		<slot>{text}</slot>
	</button>
{/if}