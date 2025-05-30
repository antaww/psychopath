<script lang="ts">
	import '../app.css'; // Fichier CSS global de SvelteKit, peut être vide ou utilisé pour des styles de base.
</script>

<svelte:head>
	<title>Psychopath</title>
	<meta name="description" content="Psychopath Game" />
	<link rel="stylesheet" href="/styles/index.css" />
	<link rel="stylesheet" href="/styles/buttons.css" />
	<link rel="stylesheet" href="/styles/animations.css" />
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css" />
	<!-- Vous pourrez ajouter vos favicons ici plus tard, par exemple : -->
	<!-- <link rel="icon" href="/favicon.png" /> -->
	<!-- <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"> -->
</svelte:head>

<div class="container">
	<slot />
</div>

<style>
	/* Styles globaux spécifiques au layout si nécessaire, sinon app.css peut être utilisé */
	/* :global(body) {
		margin: 0;
		font-family: Arial, sans-serif;
	} */

	.container {
		/* Si vous aviez des styles pour .container dans votre CSS original,
		   ils s'appliqueront grâce au lien CSS.
		   Sinon, vous pouvez ajouter des styles spécifiques au layout ici.
		   Par exemple, pour centrer le contenu :
		   display: flex;
		   flex-direction: column;
		   align-items: center;
		   min-height: 100vh;
		*/
	}
</style> 