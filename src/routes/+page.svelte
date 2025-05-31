<script lang="ts">
	import '$lib/logger';
	import { onMount, onDestroy, tick } from 'svelte';
	import { supabase } from '$lib/supabaseClient'; // Importer le client Supabase
	import type { RealtimeChannel } from '@supabase/supabase-js';

	// La logique JavaScript viendra ici plus tard
	// par exemple, l'initialisation de Supabase, les états du jeu, les fonctions, etc.

	// Exemple de variables d'état Svelte (juste pour illustration pour l'instant)
	let nickname = '';
	let gameMode = ''; // 'speedrun' or 'infinite'
	let isPlaying = false;
	let currentLevel = 0;
	let timerValue = 0; // Sera en millisecondes
	let timerInterval: number | undefined = undefined; // Pour stocker l'ID de l'intervalle du timer
	let startTime: number = 0; // To store the timestamp when the timer starts

	let currentDifficulty = 0; 
	let levelsCount = 15;
	
	let cellPathColor = "rgba(252,225,18,0.3)"; 
	let userCellsColor = "rgba(243,75,47,0.2)"; 

	let canvasElement: HTMLCanvasElement; 
	let ctx: CanvasRenderingContext2D | null = null;

	let drawnCells: number[][] = []; 
	let userClickedCells: number[][] = []; 

	let isClicking = false;
	let levelFinished = false;

	let isNicknameValid = false;

	interface ScoreEntry {
		id: number;
		pseudo: string;
		time_ms: number; // Anciennement time_seconds, stocke toujours des millisecondes
		created_at: string;
	}
	let scoreboardEntries: ScoreEntry[] = [];
	let speedrunScoresChannel: RealtimeChannel | null = null;

	// --- Flashlight Effect Logic ---
	let titleElement: HTMLHeadingElement | null = null;
	let flashlightStyle = '';
	const flashlightRadius = 75; // px, adjust for desired "beam" size

	function handleTitleMouseMove(event: MouseEvent) {
		if (!titleElement) return;
		const rect = titleElement.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		flashlightStyle = `clip-path: circle(${flashlightRadius}px at ${x}px ${y}px);`;
	}

	function handleTitleMouseEnter() {
		// The mousemove event will immediately set the clip-path.
		// If you want a default position on enter before first move, you could set it here.
		// For now, relying on immediate mousemove.
	}

	function handleTitleMouseLeave() {
		// Reset to a 0px radius circle to hide the lit effect
		flashlightStyle = `clip-path: circle(0px at 0px 0px);`;
	}
	// --- End Flashlight Effect Logic ---

	// --- Fonctions Supabase pour les scores ---
	async function saveSpeedrunScore(playerName: string, timeInMilliseconds: number) {
		if (!playerName) {
			console.log('Player name is empty, score not saved.');
			return;
		}

		try {
			// 1. Récupérer le score existant
			const { data: existingScoreData, error: fetchError } = await supabase
				.from('speedrun_scores')
				.select('time_ms')
				.eq('pseudo', playerName)
				.single(); // On s'attend à 0 ou 1 résultat

			// PGRST116 signifie "Query returned 0 rows", ce qui est normal si le joueur n'a pas encore de score.
			if (fetchError && fetchError.code !== 'PGRST116') { 
				console.error('Error fetching existing score:', fetchError);
				return;
			}

			const existingTimeMs = existingScoreData?.time_ms;

			// 2. Comparer et décider de mettre à jour/insérer
			if (existingTimeMs === undefined || timeInMilliseconds < existingTimeMs) {
				const { data, error: upsertError } = await supabase
					.from('speedrun_scores')
					.upsert({ pseudo: playerName, time_ms: timeInMilliseconds }, { onConflict: 'pseudo' });

				if (upsertError) {
					console.error('Error saving/updating speedrun score:', upsertError);
				} else {
					console.log('Speedrun score saved/updated:', data);
					// Le fetchScoreboard sera appelé par la souscription realtime
				}
			} else {
				console.log(`New score (${formatTime(timeInMilliseconds)}) is not better than existing score (${formatTime(existingTimeMs)}) for ${playerName}. Not updating.`);
			}
		} catch (error) {
			console.error('Exception in saveSpeedrunScore:', error);
		}
	}

	async function fetchScoreboard() {
		try {
			const { data, error } = await supabase
				.from('speedrun_scores')
				.select('id, pseudo, time_ms, created_at')
				.order('time_ms', { ascending: true })
				.limit(5);

			if (error) {
				console.error('Error fetching scoreboard:', error);
				scoreboardEntries = [];
			} else {
				scoreboardEntries = data as ScoreEntry[];
				console.log('Scoreboard fetched:', scoreboardEntries);
			}
		} catch (error) {
			console.error('Exception fetching scoreboard:', error);
			scoreboardEntries = [];
		}
	}

	// Fonctions (seront migrées/adaptées depuis votre index.js)
	function formatTime(ms: number): string {
		const totalCentiseconds = Math.floor(ms / 10);
		const seconds = Math.floor(totalCentiseconds / 100);
		const centiseconds = totalCentiseconds % 100;
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = seconds % 60;

		const paddedMinutes = String(minutes).padStart(2, '0');
		const paddedSeconds = String(remainingSeconds).padStart(2, '0');
		const paddedCentiseconds = String(centiseconds).padStart(2, '0');

		return `${paddedMinutes}:${paddedSeconds}:${paddedCentiseconds}`;
	}

	function startTimer() {
		startTime = performance.now();
		timerValue = 0; // Reset display, first interval will set it based on startTime

		if (timerInterval !== undefined) {
			window.clearInterval(timerInterval);
		}
		timerInterval = window.setInterval(() => {
			timerValue = Math.floor(performance.now() - startTime);
		}, 10); // Update display every 10ms
	}

	function stopTimer() {
		if (timerInterval !== undefined) {
			window.clearInterval(timerInterval);
			timerInterval = undefined;
			// Ensure timerValue has the most up-to-date value based on when stopTimer was called
			// and if startTime was initialized (i.e., timer was actually started)
			if (startTime > 0) {
				timerValue = Math.floor(performance.now() - startTime);
			}
		}
	}

	function handlePlaySpeedrun() {
		gameMode = 'speedrun';
		// Afficher la demande de pseudo, etc.
		console.log('Play Speedrun');
	}

	function handlePlayInfinite() {
		gameMode = 'infinite';
		// Afficher la demande de pseudo, etc.
		console.log('Play Infinite');
	}

	function sanitizeNickname(value: string): string {
		return value.replace(/[^a-zA-Z0-9_]/g, '');
	}

	function handleNicknameInput(event: Event) {
		const inputElement = event.target as HTMLInputElement;
		const originalValue = inputElement.value;
		const sanitizedValue = sanitizeNickname(originalValue);

		if (originalValue !== sanitizedValue) {
			inputElement.value = sanitizedValue; // Directly update the input field
		}
		nickname = sanitizedValue;
	}

	$: isNicknameValid = nickname.trim() !== '';

	async function handleValidateNickname() {
		if (!isNicknameValid) { // Safety check, button should be disabled
			console.warn("Attempted to validate nickname when invalid.");
			return;
		}
		// nickname is already sanitized and confirmed not empty by isNicknameValid
		console.log('Nickname:', nickname);
		isPlaying = true;
		
		await tick(); // Wait for DOM update after isPlaying becomes true

		if (gameMode === 'speedrun') {
			startTimer();
		}
		initGrid(5); 
		await generateGameLogic(); 
	}

	function handleLobbyClick() {
		isPlaying = false;
		gameMode = '';
		nickname = '';
		currentLevel = 0;
		if (timerInterval) { // S'assurer que timerInterval n'est pas undefined
			stopTimer();
		}
		timerValue = 0;
		if (ctx && canvasElement) {
			ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
		}
	}

	function initGrid(difficulty: number) {
		currentDifficulty = difficulty;
		currentLevel = 0; 
		
		if (canvasElement) { 
			ctx = canvasElement.getContext('2d');
			if (!ctx) {
				console.error("Impossible d'obtenir le contexte 2D du canvas");
				return;
			}
		} else {
			console.error("L'élément Canvas n'est pas encore disponible pour initGrid.");
		}
	}

	async function generateGameLogic() {
		if (!ctx || !canvasElement) {
			console.error("Contexte ou Canvas non initialisé pour generateGameLogic");
            if (canvasElement && !ctx) {
                console.log("Tentative d'initialisation du contexte dans generateGameLogic");
                ctx = canvasElement.getContext('2d');
                if (!ctx) {
                    console.error("Échec de l'initialisation du contexte dans generateGameLogic");
                    return;
                }
            } else if (!canvasElement) {
                 console.error("CanvasElement non disponible dans generateGameLogic");
                 return;
            }
		}
		userClickedCells = [];
		currentLevel += 1;

		if (gameMode === "speedrun") {
			if (levelsCount > 1) { 
				if (currentLevel <= 5) {
					currentDifficulty = 5;
				} else if (currentLevel > 5 && currentLevel <= 10) {
					currentDifficulty = 6;
				} else if (currentLevel > 10 && currentLevel <= levelsCount) { 
					currentDifficulty = 8;
				}
			}

			if (currentLevel > levelsCount) { 
				console.log("Speedrun terminé ! Score:", timerValue, "Pseudo:", nickname);
				stopTimer(); 
				if (nickname && timerValue > 0) { 
					console.log(`[DEBUG] Avant sauvegarde: timerValue=${timerValue}, nickname=${nickname}, currentLevel=${currentLevel}, levelsCount=${levelsCount}`);
					try {
						await saveSpeedrunScore(nickname, timerValue);
					} catch (e) {
						console.error("Erreur lors de l\'appel à saveSpeedrunScore depuis generateGameLogic:", e);
					}
				} else {
					console.warn("Pseudo ou temps invalide, score non sauvegardé.", "Pseudo:", nickname, "Temps:", timerValue);
				}
				handleLobbyClick(); 
				return;
			}
		} else if (gameMode === "infinite") {
			currentDifficulty = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
		}

		if (gameMode === "speedrun" && levelsCount === 1 && currentLevel === 1) {
			currentDifficulty = 5; 
		}

		fillCanvas("#fff");
		drawGrid("#000", currentDifficulty, currentDifficulty, 1);
		randomPath();
	}

	function fillCanvas(color: string) {
		if (!ctx || !canvasElement) return;
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
	}

	function drawGrid(color: string, rows: number, columns: number, borderSize: number) {
		if (!ctx || !canvasElement) return;
		ctx.strokeStyle = color;
		ctx.lineWidth = borderSize;
		let width = canvasElement.width / columns;
		let height = canvasElement.height / rows;
		for (let i = 0; i <= rows; i++) { 
			ctx.beginPath();
			ctx.moveTo(0, i * height);
			ctx.lineTo(canvasElement.width, i * height);
			ctx.stroke();
		}
		for (let i = 0; i <= columns; i++) { 
			ctx.beginPath();
			ctx.moveTo(i * width, 0);
			ctx.lineTo(i * width, canvasElement.height);
			ctx.stroke();
		}
	}
	
	function getRandomCell(): [number, number] {
		let row = Math.floor(Math.random() * currentDifficulty);
		let column = Math.floor(Math.random() * currentDifficulty);
		return [row, column];
	}

	function colorCell(row: number, column: number, color: string) {
		if (!ctx || !canvasElement) return;
		let cellWidth = canvasElement.width / currentDifficulty;
		let cellHeight = canvasElement.height / currentDifficulty;
		ctx.fillStyle = color;
		ctx.fillRect(column * cellWidth, row * cellHeight, cellWidth, cellHeight);
	}

	function randomPath() {
		if (!ctx || !canvasElement) return;
		drawnCells = [];
		let pathCount = Math.max(3, Math.floor(currentDifficulty * currentDifficulty / 3)); 

		let startCell = getRandomCell();
		colorCell(startCell[0], startCell[1], cellPathColor);
		drawnCells.push(startCell);

		let n = 0;
		const maxAttempts = pathCount * 4; // Increased attempts

		while (drawnCells.length < pathCount) {
			n++;
			if (n > maxAttempts) { 
				console.warn("randomPath: Max attempts reached, trying to reset path generation.");
				drawnCells = []; 
				fillCanvas("#fff"); 
				drawGrid("#000", currentDifficulty, currentDifficulty, 1); 
				startCell = getRandomCell();
				colorCell(startCell[0], startCell[1], cellPathColor);
				drawnCells.push(startCell);
				n = 0; 
				if (n > maxAttempts) { // Second attempt failed
					console.error("Could not generate a valid path after retry.");
					return;
				}
			}

			let currentC = drawnCells[drawnCells.length - 1];
			let neighbors = checkNeighbors(currentC[0], currentC[1]);
			
			let availableNeighbors = neighbors.filter(n => !drawnCells.some(dc => dc[0] === n[0] && dc[1] === n[1]));

			if (availableNeighbors.length === 0) { 
				// Backtrack or reset logic more robustly
				// For now, if stuck, try to restart the path generation from scratch once
				// This will be caught by the maxAttempts in the next iteration if it keeps failing.
				console.warn("Path generation stuck, trying to pick a new starting for segment or full reset via maxAttempts");
				// Simple strategy: remove last cell and try to find other neighbors from previous one
				// This can be complex, for now, we rely on the n > maxAttempts for a full reset.
				continue; // Try to find a new path from the current set of drawnCells or trigger reset by attempts
			}

			let neighbor = availableNeighbors[Math.floor(Math.random() * availableNeighbors.length)];
			drawnCells.push(neighbor);
			colorCell(neighbor[0], neighbor[1], cellPathColor);
		}
	}

	function checkNeighbors(row: number, column: number): [number, number][] {
		let neighbors: [number, number][] = [];
		if (row > 0) neighbors.push([row - 1, column]);
		if (row < currentDifficulty - 1) neighbors.push([row + 1, column]);
		if (column > 0) neighbors.push([row, column - 1]);
		if (column < currentDifficulty - 1) neighbors.push([row, column + 1]);
		return neighbors;
	}
	
	function handleCanvasMouseDown(event: MouseEvent) {
		if (!isPlaying) return;
		isClicking = true;
		handleCanvasMouseMove(event); 
	}

	function handleCanvasMouseUp() {
		if (!isPlaying || !isClicking) return;
		isClicking = false;

		if (levelFinished) {
			levelFinished = false; 
			generateGameLogic(); 
		} else {
			// If mouse up and path is not complete and correct, it's a fail on the current attempt
			// Check if they drew anything, and if it's not the full correct path
			if (userClickedCells.length > 0 && !areArraysEqual(userClickedCells, drawnCells)) {
				console.log("Mouse up, path incorrect or incomplete -> fail");
				failedTryLogic();
			}
		}
	}
	
	function handleCanvasMouseMove(event: MouseEvent) {
		if (!isPlaying || !isClicking || !ctx || !canvasElement) return;

		const rect = canvasElement.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;

		let cellWidth = canvasElement.width / currentDifficulty;
		let cellHeight = canvasElement.height / currentDifficulty;
		let col = Math.floor(x / cellWidth);
		let row = Math.floor(y / cellHeight);

		if (row < 0 || row >= currentDifficulty || col < 0 || col >= currentDifficulty) {
			return;
		}
		
		const currentCellClicked: [number, number] = [row, col];

		if (!drawnCells.some(cell => cell[0] === row && cell[1] === col)) {
			console.log("Clicked outside path - fail");
			failedTryLogic(); 
            isClicking = false; // Stop current click sequence on fail
			return; 
		}

		if (!userClickedCells.some(cell => cell[0] === row && cell[1] === col)) {
			// Check if this new cell is adjacent to the previous userClickedCell (if any)
			if (userClickedCells.length > 0) {
				const lastCell = userClickedCells[userClickedCells.length - 1];
				const dx = Math.abs(lastCell[1] - col);
				const dy = Math.abs(lastCell[0] - row);
				// Allow only adjacent cells (not diagonal, distance of 1)
				if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) {
					console.log("Skipped a cell - fail");
					failedTryLogic();
                    isClicking = false;
					return;
				}
			}
			ctx.fillStyle = userCellsColor;
			ctx.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
			userClickedCells.push(currentCellClicked);
		} 

		if (userClickedCells.length === drawnCells.length) {
			if (areArraysEqual(userClickedCells, drawnCells)) {
				console.log("Level Finished!");
				levelFinished = true; 
			} else {
				console.log("Path complete but incorrect - fail");
				failedTryLogic();
                isClicking = false;
			}
		}
	}

	function handleCanvasMouseOut() {
		if (isPlaying && isClicking) {
			console.log("Mouse out while clicking - fail");
			failedTryLogic(); 
            isClicking = false; 
		}
	}

	function areArraysEqual(arr1: number[][], arr2: number[][]): boolean {
		if (arr1.length !== arr2.length) return false;
		const sortFn = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1];
		const sortedArr1 = [...arr1].sort(sortFn);
		const sortedArr2 = [...arr2].sort(sortFn);
		for (let i = 0; i < sortedArr1.length; i++) {
			if (sortedArr1[i][0] !== sortedArr2[i][0] || sortedArr1[i][1] !== sortedArr2[i][1]) {
				return false;
			}
		}
		return true;
	}

	function resetCellsVisualization() {
		if (!ctx || !canvasElement) return;
		fillCanvas("#fff");
		drawGrid("#000", currentDifficulty, currentDifficulty, 1);
		for (let i = 0; i < drawnCells.length; i++) {
			colorCell(drawnCells[i][0], drawnCells[i][1], cellPathColor);
		}
	}
	
	function failedTryLogic() {
		console.log("Attempt Failed!");

		if (gameMode === "infinite") {
			console.log("Infinite mode: Total level completed:", currentLevel > 0 ? currentLevel -1 : 0); 
			// await saveInfiniteScore(nickname, currentLevel > 0 ? currentLevel -1 : 0); // A faire plus tard
			// For infinite, a fail means game over, go to lobby
			handleLobbyClick();
			return; // Important to stop further execution after fail in infinite
		} else if (gameMode === "speedrun") {
			console.log("Speedrun mode: Failed attempt at level", currentLevel);
			// In speedrun, a fail on a level means you have to retry that level.
			// Timer continues.
			stopTimer(); // Reset timer
			startTimer(); // Restart timer
			currentLevel = 0; // Reset to level 0, generateGameLogic will increment to 1
			
			userClickedCells = []; 
			levelFinished = false; 
			isClicking = false; 

			generateGameLogic(); // Regenerate level (will be level 1)
			return; // Stop further execution for speedrun fail case
		}
		
		userClickedCells = []; 
		levelFinished = false; 
		isClicking = false; 

		resetCellsVisualization(); 
	}

	function handleResetClick() {
		if (!isPlaying) return;
		console.log("Reset Clicked");
		
		if (gameMode === "speedrun") {
			stopTimer();
			startTimer();
		}
		userClickedCells = [];
		levelFinished = false;
		isClicking = false; 
		// Reset current level progress, but not currentLevel number itself for speedrun
		// For infinite, reset would mean starting from level 1 again.
		if (gameMode === "infinite") {
			currentLevel = 0; // This will be incremented by generateGameLogic
			generateGameLogic();
		} else {
			resetCellsVisualization(); 
		}
	}

	onMount(async () => {
		await fetchScoreboard(); // Fetch initial scoreboard data

		speedrunScoresChannel = supabase
			.channel('speedrun_scores_changes')
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'speedrun_scores' },
				(payload) => {
					console.log('Change received!', payload);
					fetchScoreboard(); // Re-fetch scoreboard on any change
				}
			)
			.subscribe((status, err) => {
				if (status === 'SUBSCRIBED') {
					console.log('Subscribed to speedrun_scores changes!');
				} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
					// console.error('Subscription error or timed out:', err, 'Status:', status);
				}
			});
	});

	onDestroy(() => {
		stopTimer(); 
		if (speedrunScoresChannel) {
			supabase.removeChannel(speedrunScoresChannel)
				.then(() => console.log("Unsubscribed from speedrun_scores_changes"))
				.catch(err => console.error("Error unsubscribing:", err));
		}
	});
</script>

<h1
	class="game-title {isPlaying ? 'in-game' : (gameMode === '' ? 'lobby lobby-title-slide-bounce' : 'lobby')}"
	bind:this={titleElement}
	on:mousemove={handleTitleMouseMove}
	on:mouseenter={handleTitleMouseEnter}
	on:mouseleave={handleTitleMouseLeave}
>
	Psychopath
	<span class="title-lit" style={flashlightStyle}>Psychopath</span>
</h1>

<!-- Structure HTML reprise de votre index.html original -->
<div class="scoreboard rubberBand">
	<h2>Scoreboard (Speedrun)</h2>
	{#if scoreboardEntries.length > 0}
		<ol>
			{#each scoreboardEntries as entry (entry.id)}
				<li>{entry.pseudo} : {formatTime(entry.time_ms)}</li>
			{/each}
		</ol>
	{:else}
		<p>No scores yet. Be the first!</p>
	{/if}
</div>

<div class="difficulty">
	{#if !isPlaying && gameMode === ''}
		<div class="buttons-container">
			<button class="difficulty-button game-button green bounceInDown" on:click={handlePlaySpeedrun}>Speedrun</button>
			<!-- <button class="difficulty-button game-button green bounceInDown" on:click={handlePlayInfinite}>Infinite</button> -->
		</div>
	{/if}

	{#if !isPlaying && gameMode !== ''}
		<div class="nickname-container"> 
			<input 
				type="text" 
				class="difficulty-button game-button purple" 
				value={nickname} 
				on:input={handleNicknameInput}
				placeholder="Enter your nickname" 
				maxlength="15"
			>
			<button class="difficulty-button game-button green" on:click={handleValidateNickname} disabled={!isNicknameValid}>OK</button>
		</div>
		
		<div class="color-list"> 
			<span class="color-list-title">Choose your color</span>
			<div class="swatch unselected" data-color="#DE3F3FD1" style="background: #DE3F3FD9"></div>
            <div class="swatch selected" data-color="#F34B2F33" style="background: rgba(243,75,47,0.87)"></div>
            <div class="swatch unselected" data-color="#E8BF1FD1" style="background: #E8BF1FD9"></div>
            <div class="swatch unselected" data-color="#A0563D83" style="background: #A0563DD9"></div>
            <div class="swatch unselected" data-color="#88CE6ED1" style="background: #88CE6ED9"></div>
            <div class="swatch unselected" data-color="#21460CD1" style="background: #21460CD9"></div>
            <div class="swatch unselected" data-color="#B5F2EDD1" style="background: #B5F2EDD9"></div>
            <div class="swatch unselected" data-color="#2841B4D1" style="background: #2841B4D9"></div>
            <div class="swatch unselected" data-color="#7645BBD1" style="background: #7645BBD9"></div>
            <div class="swatch unselected" data-color="#D247CBD1" style="background: #D247CBD9"></div>
            <div class="swatch unselected" data-color="#F2D7B5D1" style="background: #F2D7B5D9"></div>
            <div class="swatch unselected" data-color="#000000D1" style="background: #000000D9"></div>
		</div>
		<button class="difficulty-button game-button orange" on:click={handleLobbyClick}>Lobby</button> 
	{/if}

	{#if isPlaying}
		<div class="inGameButtons">
			<div class="timer difficulty-button game-button purple">{formatTime(timerValue)}</div> 
			<button class="difficulty-button game-button orange" on:click={handleLobbyClick}>Lobby</button> 
			<button class="difficulty-button game-button red" on:click={handleResetClick}>Reset</button> 
		</div>
	{/if}
</div>

<div class="game-info">
	{#if isPlaying}
		<div class="level difficulty-button game-button yellow">Level {currentLevel}</div>
		<canvas 
			class="grid" 
			bind:this={canvasElement} 
			width="400" 
			height="400"
			on:mousedown={handleCanvasMouseDown}
			on:mouseup={handleCanvasMouseUp}
			on:mousemove={handleCanvasMouseMove}
			on:mouseout={handleCanvasMouseOut}
		></canvas> 
	{/if}
</div>

<!-- {#if isPlaying } 
	<div class="cross difficulty-button game-button red" style="display: none"> 
		<div class="cross-content heartBeat">❌</div>
	</div>
{/if} -->

<style>
	.nickname-container,
    .color-list {
        display: flex; /* Ensure they are flex by default when shown */
        /* Add other necessary styles from your original CSS if they were controlling visibility or layout beyond display:none */
    }
	.scoreboard {
		align-items: center;
		background-color: #00000082;
		border-radius: 8px;
		box-shadow: 0px 9px 20px rgba(0, 0, 0, 0.30), 0 15px 12px rgba(0, 0, 0, 0.22);
		color: #fff !important; /* Important pour s'assurer qu'il surcharge d'autres styles potentiels */
		display: flex;
		flex-flow: column;
		font-family: 'Carter One', sans-serif;
		font-size: 20px;
		justify-content: center;
		line-height: 1.5em;
		margin-right: 10px;
		margin-top: 5px;
		max-width: 400px;
		outline: none !important;
		overflow-x: hidden;
		padding: 8px;
		position: absolute;
		right: 0;
		text-decoration: none !important;
		text-overflow: ellipsis;
		text-shadow: 2px 2px 1px #0066a2, -2px 2px 1px #0066a2, 2px -2px 1px #0066a2, -2px -2px 1px #0066a2, 0px 2px 1px #0066a2, 0px -2px 1px #0066a2, 0px 4px 1px #004a87, 2px 4px 1px #004a87, -2px 4px 1px #004a87;
		top: 0;
	}

	.inGameButtons > .difficulty-button {
		min-width: 9ch; /* Assure une largeur minimale pour MM:SS:CC et les autres textes */
		text-align: center;
	}

	/* J'ai enlevé les styles .scoreboard h2, .scoreboard ol, .scoreboard li que j'avais ajoutés
	   car ils n'étaient pas dans votre CSS original et pourraient interférer.
	   Si vous souhaitez un style spécifique pour ces éléments dans le nouveau design, dites-le moi. */

	.nickname-container button:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.game-title {
		/* Base style for the unlit text - now white */
		color: #fff; /* Base text color */
		font-family: 'Carter One', sans-serif;
		position: absolute; /* Still absolute for page layout */
		text-shadow: 2px 2px 1px #030102, -2px 2px 1px #030102, 2px -2px 1px #d7564a, -2px -2px 1px #d7564a, 0px 2px 1px #d7564a, 0px -2px 1px #d7564a, 0px 4px 1px #d7564a, 2px 4px 1px #d7564a, -2px 4px 1px #d7564a;
		white-space: nowrap;
		z-index: 10;
	}

	.title-lit {
		/* Overlay for the "lit" text, clipped by flashlightStyle - now #d84c39 */
		color: #eb7057; /* Flashlight reveal color */
		left: 0;
		pointer-events: none; /* Allows mouse events to pass through to parent h1 */
		position: absolute;
		text-shadow: inherit; /* Inherits from .game-title */
		top: 0;
		white-space: nowrap; /* Consistent with parent */
		z-index: 1; /* Sits on top of the base text color within the parent */
	}

	.game-title.in-game {
		font-size: 2.5rem;
		left: 20px;
		top: 20px;
	}

	.game-title.lobby {
		font-size: 6rem;
		left: 50%;
		text-align: center;
		top: 25%;
		transform: translateX(-50%);
	}

	.lobby-title-slide-bounce {
		animation: slideInFromLeftWithBounce 0.8s forwards; /* Using 'forwards' to keep final state */
	}

	@keyframes slideInFromLeftWithBounce {
		0% {
			opacity: 0;
			transform: translateX(-100vw); /* Start far left */
		}
		60% {
			opacity: 1;
			transform: translateX(-45%); /* Overshoot slightly (target is -50%) */
		}
		80% {
			transform: translateX(-52%); /* Bounce back a bit */
		}
		100% {
			opacity: 1;
			transform: translateX(-50%); /* Settle at center */
		}
	}

	/* Removed custom bounceInDown keyframes and class definition. 
	   Relies on global bounceInDown from animate.css or similar. */
</style>
