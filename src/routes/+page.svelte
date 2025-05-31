<script context="module" lang="ts">
	// Declare confetti function type for TypeScript
	// This ensures it's globally available for the component instance script
	declare function confetti(options?: any): Promise<null> | null;
</script>

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
	let levelsCount = 2;

	let cellPathColor = "rgba(252,225,18,0.3)";

	const availableColors = [
		{ name: 'Red', value: 'rgba(243,75,47,0.55)', display: '#F34B2FD9' }, // Initial selected
		{ name: 'Dark Red', value: 'rgba(222,63,63,0.55)', display: '#DE3F3FD9' },
		{ name: 'Yellow', value: 'rgba(232,191,31,0.55)', display: '#E8BF1FD9' },
		{ name: 'Brown', value: 'rgba(160,86,61,0.55)', display: '#A0563DD9' },
		{ name: 'Light Green', value: 'rgba(136,206,110,0.55)', display: '#88CE6ED9' },
		{ name: 'Dark Green', value: 'rgba(33,70,12,0.55)', display: '#21460CD9' },
		{ name: 'Light Blue', value: 'rgba(181,242,237,0.55)', display: '#B5F2EDD9' },
		{ name: 'Blue', value: 'rgba(40,65,180,0.55)', display: '#2841B4D9' },
		{ name: 'Purple', value: 'rgba(118,69,187,0.55)', display: '#7645BBD9' },
		{ name: 'Pink', value: 'rgba(210,71,203,0.55)', display: '#D247CBD9' },
		{ name: 'Beige', value: 'rgba(242,215,181,0.55)', display: '#F2D7B5D9' },
		{ name: 'Black', value: 'rgba(0,0,0,0.55)', display: '#000000D9' }
	];
	let userCellsColor = availableColors[0].value; // Initialize with the first color

	let canvasElement: HTMLCanvasElement; 
	let ctx: CanvasRenderingContext2D | null = null;

	let drawnCells: number[][] = []; 
	let userClickedCells: number[][] = []; 

	let isClicking = false;
	let levelFinished = false;

	let isNicknameValid = false;

	let showRulesModal = false;

	// Game Over Screen State
	let showGameOverScreen = false;
	let finalTimeMs = 0;
	let personalBestRank: number | null = null; // Rank of the player's overall best
	let finalTimeActualRank: number | null = null; // Rank of the time just achieved in this game
	let isNewPersonalBest = false;
	let previousPersonalBestMs: number | null = null;

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
	let flashlightStyle = 'clip-path: circle(0px at 0px 0px);';
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
	async function fetchPlayerRank(playerName: string, scoreToRankMs: number): Promise<number | null> {
		try {
			const { data, error, count } = await supabase
				.from('speedrun_scores')
				.select('pseudo', { count: 'exact', head: false })
				.lt('time_ms', scoreToRankMs);

			if (error) {
				console.error('Error fetching player rank:', error);
				return null;
			}

			// The count returned by Supabase with .lt() is the number of scores strictly better.
			// So, rank is count + 1.
			return (count ?? 0) + 1;
		} catch (err) {
			console.error('Exception in fetchPlayerRank:', err);
			return null;
		}
	}

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
				// Try to get rank of current time even if fetching existing score fails
				finalTimeActualRank = await fetchPlayerRank(playerName, timeInMilliseconds);
				return;
			}

			// 1. Always fetch the rank of the time they just got.
			finalTimeActualRank = await fetchPlayerRank(playerName, timeInMilliseconds);

			const existingTimeMs = existingScoreData?.time_ms;
			previousPersonalBestMs = existingTimeMs ?? null; // Store previous PB regardless

			// 2. Comparer et décider de mettre à jour/insérer
			if (existingTimeMs === undefined || timeInMilliseconds < existingTimeMs) {
				isNewPersonalBest = true;
				const { data, error: upsertError } = await supabase
					.from('speedrun_scores')
					.upsert({ pseudo: playerName, time_ms: timeInMilliseconds }, { onConflict: 'pseudo' });

				if (upsertError) {
					console.error('Error saving/updating speedrun score:', upsertError);
					// personalBestRank will remain null or its old value if upsert fails, but finalTimeActualRank is set
					return; 
				} else {
					console.log('Speedrun score saved/updated:', data);
					personalBestRank = finalTimeActualRank; // New PB, so its rank is the current time's rank
				}
			} else {
				isNewPersonalBest = false;
				console.log(`New score (${formatTime(timeInMilliseconds)}) is not better than existing score (${formatTime(existingTimeMs)}) for ${playerName}. Not updating.`);
				// Score not updated, so PB rank is based on their existing best score
				if (existingTimeMs !== undefined) {
					personalBestRank = await fetchPlayerRank(playerName, existingTimeMs);
				} else {
					// This case should ideally not happen if !isNewPersonalBest, means no existing score but also not a new best.
					// For safety, set personalBestRank to the current time's rank, as it's the only score we know.
					personalBestRank = finalTimeActualRank;
				}
			}

			// playerRank = await fetchPlayerRank(playerName, timeInMilliseconds); // This line is now handled by finalTimeActualRank and personalBestRank logic above

		} catch (error) {
			console.error('Exception in saveSpeedrunScore:', error);
			// Attempt to fetch rank for current time even on general exception
			if (timeInMilliseconds > 0 && finalTimeActualRank === null) { // Check if not already set
				finalTimeActualRank = await fetchPlayerRank(playerName, timeInMilliseconds);
			}
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

	function handleColorSelect(selectedColorValue: string) {
		userCellsColor = selectedColorValue;
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
		// Ensure game over screen is hidden when returning to lobby
		showGameOverScreen = false;
		personalBestRank = null;
		finalTimeActualRank = null;
		isNewPersonalBest = false;
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
				finalTimeMs = timerValue; // Store final time

				if (nickname && finalTimeMs > 0) { 
					console.log(`[DEBUG] Avant sauvegarde: timerValue=${finalTimeMs}, nickname=${nickname}, currentLevel=${currentLevel}, levelsCount=${levelsCount}`);
					try {
						// saveSpeedrunScore will now also fetch rank and set PB status
						await saveSpeedrunScore(nickname, finalTimeMs);
					} catch (e) {
						console.error("Erreur lors de l'appel à saveSpeedrunScore depuis generateGameLogic:", e);
						// If saving/ranking fails, perhaps a simpler game over or direct to lobby
						handleLobbyClick(); // Fallback
						return;
					}
				} else {
					console.warn("Pseudo ou temps invalide, score non sauvegardé et rang non récupéré.", "Pseudo:", nickname, "Temps:", finalTimeMs);
					handleLobbyClick(); // Fallback: if no nickname/time, can't show proper game over
					return;
				}
				isPlaying = false; // Stop game interactions
				showGameOverScreen = true; // Show the game over UI
				
				// Trigger confetti
				if (typeof confetti === 'function') {
					confetti({
						particleCount: isNewPersonalBest ? 300 : 150, // More confetti for a new PB
						spread: isNewPersonalBest ? 100 : 70,
						origin: { y: 0.6 },
						zIndex: 1005 // Ensure confetti is above the modal (modal z-index is 1000)
					});
				}

				// DO NOT call handleLobbyClick() here anymore
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
			return; // Mouse is outside grid boundaries
		}
		
		const currentCellClicked: [number, number] = [row, col];

		// 1. If mouse is still in the very last cell that was painted, do nothing.
		if (userClickedCells.length > 0) {
			const lastPaintedCell = userClickedCells[userClickedCells.length - 1];
			if (lastPaintedCell[0] === currentCellClicked[0] && lastPaintedCell[1] === currentCellClicked[1]) {
				return; 
			}
		}

		// 2. Check if the current cell is part of the designated path.
		if (!drawnCells.some(cell => cell[0] === currentCellClicked[0] && cell[1] === currentCellClicked[1])) {
			console.log("Clicked outside path - fail");
			failedTryLogic(); 
			isClicking = false;
			return; 
		}

		// 3. Check if the user is trying to re-color a cell they've already colored in this attempt.
		//    (This check is now valid because we've already handled being in the *last* painted cell).
		if (userClickedCells.some(cell => cell[0] === currentCellClicked[0] && cell[1] === currentCellClicked[1])) {
			console.log("Clicked on an already colored cell (revisit) - fail");
			failedTryLogic();
			isClicking = false;
			return;
		}

		// 4. Process the new cell (it's on the path, not yet clicked, and not the same as the immediate last)
		// Adjacency check: Only if it's not the first cell being clicked.
		if (userClickedCells.length > 0) {
			const previousCell = userClickedCells[userClickedCells.length - 1]; // The cell they are coming FROM
			const dx = Math.abs(previousCell[1] - currentCellClicked[1]);
			const dy = Math.abs(previousCell[0] - currentCellClicked[0]);
			if (!((dx === 1 && dy === 0) || (dx === 0 && dy === 1))) {
				console.log("Skipped a cell - fail");
				failedTryLogic();
				isClicking = false;
				return;
			}
		}
		// Note: If it's the first cell (userClickedCells.length === 0),
		// it must be part of drawnCells (checked above), and no adjacency check is needed yet.

		ctx.fillStyle = userCellsColor;
		ctx.fillRect(currentCellClicked[1] * cellWidth, currentCellClicked[0] * cellHeight, cellWidth, cellHeight);
		userClickedCells.push(currentCellClicked);

		// 5. Check for level completion
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

	function toggleRulesModal() {
		showRulesModal = !showRulesModal;
	}

	// --- Game Over Screen Handlers ---
	async function handlePlayAgainFromGameOver() {
		showGameOverScreen = false;
		personalBestRank = null;
		finalTimeActualRank = null;
		isNewPersonalBest = false;
		previousPersonalBestMs = null;
		finalTimeMs = 0;

		// Reset game state for a new speedrun with the same nickname
		isPlaying = true;
		currentLevel = 0; // Will be incremented to 1 by generateGameLogic
		timerValue = 0;

		await tick(); // Ensure DOM is updated if canvas needs to be re-rendered or accessed

		if (gameMode === 'speedrun') {
			startTimer();
		}
		// initGrid might not be strictly necessary if difficulty logic is self-contained in generateGameLogic
		// but good for consistency if it resets any visual state tied to difficulty.
		initGrid(5); // Or determine initial difficulty based on gameMode settings
		await generateGameLogic();
	}

	function handleLobbyFromGameOver() {
		showGameOverScreen = false; // Hide game over screen
		handleLobbyClick(); // Use existing lobby logic to reset fully
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
	<h3>Scoreboard (Speedrun)</h3>
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
			<button class="difficulty-button game-button blue bounceInDown" on:click={toggleRulesModal}>Rules</button>
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
			{#each availableColors as color}
				<div
					class="swatch {userCellsColor === color.value ? 'selected' : 'unselected'}"
					data-color={color.value}
					style="background: {color.display}"
					on:click={() => handleColorSelect(color.value)}
					title={color.name}
				></div>
			{/each}
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

{#if showRulesModal}
	<div class="modal-backdrop" on:click={toggleRulesModal}></div>
	<div class="modal {showRulesModal ? 'bounceInDown is-visible' : 'modal-leave'}">
		<h2>Game Rules</h2>
		<p>
			The goal of the game is to <span style="color: #ffcc00;">reproduce the highlighted path</span> on the grid.<br />
			<u>Click and drag</u> your mouse to draw your path.<br />
			- <strong><span style="color: #33cc33;">Speedrun</span> :</strong> Complete 15 levels as fast as possible. Your time will be recorded on the scoreboard.<br />
			- <strong><span style="color: #cc33ff;">Infinite</span> :</strong> Play as many levels as you can. The difficulty increases randomly. (<span style="color: #ff3333;">Coming soon!</span>)<br /><br />
			Be careful, any mistake will make you <span style="color: #ff6666;">restart the game</span> (in Speedrun) or <span style="color: #ff3333;">end the game</span> (in Infinite).
		</p>
		<button class="difficulty-button game-button orange" on:click={toggleRulesModal}>Close</button>
	</div>
{/if}

<!-- Game Over Screen for Speedrun -->
{#if showGameOverScreen && gameMode === 'speedrun'}
	<div class="modal-backdrop" on:click={handleLobbyFromGameOver}></div>
	<div class="modal game-over-modal bounceInDown is-visible">
		<h2>Speedrun Complete!</h2>
		<p class="final-time">Your Time: {formatTime(finalTimeMs)}</p>
		{#if finalTimeActualRank !== null}
			<p class="final-time-rank">(This time's rank: {finalTimeActualRank})</p>
		{/if}
		
		{#if personalBestRank !== null}
			<p class="player-rank">Your Personal Best Rank: {personalBestRank}</p>
		{/if}

		{#if isNewPersonalBest}
			<p class="personal-best-new">🎉 New Personal Best! 🎉</p>
		{:else if previousPersonalBestMs !== null}
			<p class="personal-best-old">
				Not a new PB. Your best: {formatTime(previousPersonalBestMs)}
			</p>
		{/if}

		<div class="game-over-buttons">
			<button class="difficulty-button game-button green" on:click={handlePlayAgainFromGameOver}>Play Again</button>
			<button class="difficulty-button game-button orange" on:click={handleLobbyFromGameOver}>Lobby</button>
		</div>
	</div>
{/if}

<div class="footer-credit">
	Created by <a href="https://github.com/antaww" target="_blank" rel="noopener noreferrer">antaww</a>
</div>

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

	.color-list {
		align-items: center;
		display: flex;
		flex-wrap: wrap; /* Allow swatches to wrap */
		gap: 8px; /* Spacing between swatches */
		justify-content: center; /* Center swatches if they wrap */
		margin-bottom: 15px; /* Space below the color list */
		margin-top: 15px; /* Space above the color list */
	}

	.color-list-title {
		color: #fff;
		font-family: 'Carter One', sans-serif;
		font-size: 1.2em;
		margin-bottom: 10px; /* Space below title */
		text-align: center;
		text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
		width: 100%; /* Make title span full width */
	}

	.swatch {
		border: 2px solid transparent;
		border-radius: 4px;
		box-shadow: 0 2px 4px rgba(0,0,0,0.2);
		cursor: pointer;
		height: 30px;
		transition: transform 0.2s ease, border-color 0.2s ease;
		width: 30px;
	}

	.swatch:hover {
		transform: scale(1.1);
	}

	.swatch.selected {
		border-color: #fff; /* White border for selected swatch */
		box-shadow: 0 0 8px rgba(255,255,255,0.8); /* Glow effect for selected */
		transform: scale(1.15);
	}

	.swatch.unselected {
		/* Styles for unselected, if different from base, can go here */
		/* For example, a slightly dimmer look or different border */
	}

	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background-color: rgba(0, 0, 0, 0.5);
		z-index: 999; /* Ensure it's above other content but below modal */
	}

	.modal {
		align-items: center;
		background-color: rgba(0, 0, 0, 0.85); /* Darker background for white text */
		border-radius: 10px;
		box-shadow: 0 5px 15px rgba(0,0,0,0.3);
		box-sizing: border-box; /* Added for more predictable sizing */
		display: flex;
		flex-direction: column;
		gap: 15px;
		justify-content: space-between;
		max-width: 500px;
		opacity: 0;
		padding: 25px;
		position: fixed;
		transform: translate(-50%, -50%) scale(0.9);
		transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
		width: 90%;
		z-index: 1000;
	}

	.modal.is-visible {
		opacity: 1;
		transform: translate(-50%, -50%) scale(1);
	}

	.modal h2 {
		/* color: #333; */
		color: #fff; /* White text */
		font-family: 'Carter One', sans-serif;
		margin-bottom: 10px;
		text-align: center;
	}

	.modal p {
		/* color: #555; */
		color: #fff; /* White text */
		font-family: 'Carter One', sans-serif; /* Apply Carter One font */
		line-height: 1.6;
		margin-bottom: 20px;
		text-align: justify;
	}

	.modal-enter {
		opacity: 1;
		transform: translate(-50%, -50%) scale(1);
	}

	.modal-leave {
		opacity: 0;
		transform: translate(-50%, -50%) scale(0.9);
	}

	.footer-credit {
		bottom: 10px;
		color: #fff;
		font-family: 'Carter One', sans-serif;
		font-size: 0.9rem;
		left: 50%;
		position: fixed;
		text-shadow: 1px 1px 2px rgba(0,0,0,0.7);
		transform: translateX(-50%);
		z-index: 100;
	}

	.footer-credit a {
		color: #f0ad4e; /* A warm color that might fit your theme */
		text-decoration: none;
	}

	.footer-credit a:hover {
		text-decoration: underline;
	}

	/* Styles for Game Over Screen */
	.game-over-modal {
		text-align: center;
	}

	.game-over-modal h2 {
		color: #ffcc00; /* Gold color for title */
		margin-bottom: 20px;
	}

	.final-time {
		font-size: 1.4em;
		color: #fff;
		margin-bottom: 5px;
		font-family: 'Carter One', sans-serif;
	}

	.final-time-rank {
		font-size: 0.9em;
		color: #aaa;
		margin-top: -5px;
		margin-bottom: 15px;
		font-family: 'Carter One', sans-serif;
	}

	.player-rank,
	.personal-best-new,
	.personal-best-old {
		font-size: 1.4em;
		color: #fff;
		margin-bottom: 15px;
		font-family: 'Carter One', sans-serif;
	}

	.personal-best-new {
		color: #4CAF50; /* Green for new PB */
		font-weight: bold;
	}

	.personal-best-old {
		color: #f3f0ec; /* Lighter color for old PB info */
	}

	.game-over-buttons {
		display: flex;
		gap: 15px;
		justify-content: center;
		margin-top: 25px;
	}
</style>
