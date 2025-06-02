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
	import Button from '$lib/components/Button.svelte'; // Import the new Button component

	let nickname = '';
	let gameMode = ''; // 'speedrun', 'infinite' or 'training'
	let isPlaying = false;
	let currentLevel = 0;
	let timerValue = 0; // Will be in milliseconds
	let timerInterval: number | undefined = undefined; // To store the ID of the timer interval
	let startTime: number = 0; // To store the timestamp when the timer starts

	let currentDifficulty = 0;
	let levelsCount = 15;

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
	let selectedTrainingDifficulty: number = 5; // Default difficulty for training mode (5x5 grid)

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
	let scoreboardPollInterval: number | undefined = undefined; // For polling

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
		const lowerPlayerName = playerName.toLowerCase();
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

	async function handleScoreSavingAndConfetti(playerName: string, timeMs: number) {
		if (playerName && timeMs > 0) {
			try {
				await saveSpeedrunScore(playerName, timeMs); // This updates isNewPersonalBest, ranks, etc.
				await fetchScoreboard(); // Manually refresh scoreboard for the current user
				
				// Now trigger confetti with the updated isNewPersonalBest
				if (typeof confetti === 'function') {
					confetti({
						particleCount: isNewPersonalBest ? 300 : 150,
						spread: isNewPersonalBest ? 100 : 70,
						origin: { y: 0.6 },
						zIndex: 1005 // Ensure confetti is above the modal (modal z-index is 1000)
					});
				}
			} catch (e) {
				console.error("Error during score processing or confetti:", e);
				// Game over screen is already shown. User can interact with it.
				// Log error, but no automatic redirection.
			}
		} else {
			console.warn("Invalid nickname or time for score processing.", "Nickname:", playerName, "Time:", timeMs);
			// Game over screen shown, but score won't be processed or confetti for PB won't be accurate.
		}
	}

	async function saveSpeedrunScore(playerName: string, timeInMilliseconds: number) {
		if (!playerName) {
			console.log('Player name is empty, score not saved.');
			return;
		}
		const lowerPlayerName = playerName.toLowerCase();

		try {
			// 1. Fetch the existing score
			const { data: existingScoreData, error: fetchError } = await supabase
				.from('speedrun_scores')
				.select('time_ms')
				.eq('pseudo', lowerPlayerName)
				.single(); // We expect 0 or 1 result

			// PGRST116 means "Query returned 0 rows", which is normal if the player doesn't have a score yet.
			if (fetchError && fetchError.code !== 'PGRST116') { 
				console.error('Error fetching existing score:', fetchError);
				// Try to get rank of current time even if fetching existing score fails
				finalTimeActualRank = await fetchPlayerRank(lowerPlayerName, timeInMilliseconds);
				return;
			}

			// 1. Always fetch the rank of the time they just got.
			finalTimeActualRank = await fetchPlayerRank(lowerPlayerName, timeInMilliseconds);

			const existingTimeMs = existingScoreData?.time_ms;
			previousPersonalBestMs = existingTimeMs ?? null; // Store previous PB regardless

			// 2. Compare and decide to update/insert
			if (existingTimeMs === undefined || timeInMilliseconds < existingTimeMs) {
				isNewPersonalBest = true;
				const { data, error: upsertError } = await supabase
					.from('speedrun_scores')
					.upsert({ pseudo: lowerPlayerName, time_ms: timeInMilliseconds }, { onConflict: 'pseudo' });

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
				console.log(`New score (${formatTime(timeInMilliseconds)}) is not better than existing score (${formatTime(existingTimeMs)}) for ${lowerPlayerName}. Not updating.`);
				// Score not updated, so PB rank is based on their existing best score
				if (existingTimeMs !== undefined) {
					personalBestRank = await fetchPlayerRank(lowerPlayerName, existingTimeMs);
				} else {
					// This case should ideally not happen if !isNewPersonalBest, means no existing score but also not a new best.
					// For safety, set personalBestRank to the current time's rank, as it's the only score we know.
					personalBestRank = finalTimeActualRank;
				}
			}
		} catch (error) {
			console.error('Exception in saveSpeedrunScore:', error);
			// Attempt to fetch rank for current time even on general exception
			if (timeInMilliseconds > 0 && finalTimeActualRank === null) { // Check if not already set
				finalTimeActualRank = await fetchPlayerRank(lowerPlayerName, timeInMilliseconds);
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
			}
		} catch (error) {
			console.error('Exception fetching scoreboard:', error);
			scoreboardEntries = [];
		}
	}

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
		// Display the nickname request, etc.
		console.log('Play Speedrun');
	}

	function handlePlayInfinite() {
		gameMode = 'infinite';
		// Display the nickname request, etc.
		console.log('Play Infinite');
	}

	function handlePlayTraining() {
		gameMode = 'training';
		selectedTrainingDifficulty = 5; // Reset to default when mode is selected
		nickname = ''; // Not used in training
		console.log('Play Training');
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

	async function confirmSettingsAndStartGame() {
		if (gameMode === 'speedrun') {
			if (!isNicknameValid) {
				console.warn("Attempted to start speedrun with invalid nickname.");
				return;
			}
			console.log('Starting Speedrun. Nickname:', nickname);
		} else if (gameMode === 'training') {
			console.log('Starting Training with difficulty:', selectedTrainingDifficulty);
			// No nickname validation needed. currentDifficulty will be set from selectedTrainingDifficulty.
		} else {
			console.warn("Unknown game mode for starting game:", gameMode);
			return;
		}

		isPlaying = true;
		currentLevel = 0; // Reset level counter for the new game/session

		await tick(); // Wait for DOM update after isPlaying becomes true

		if (gameMode === 'speedrun') {
			startTimer();
			initGrid(5); // Initial difficulty for speedrun is 5
		} else if (gameMode === 'training') {
			// Timer is not used in training mode
			initGrid(selectedTrainingDifficulty);
		}
		// Common logic after mode-specific setup
		await generateGameLogic(); // This will increment currentLevel to 1
	}

	function handleColorSelect(selectedColorValue: string) {
		userCellsColor = selectedColorValue;
	}

	function handleLobbyClick() {
		isPlaying = false;
		gameMode = '';
		nickname = '';
		currentLevel = 0;
		if (timerInterval) { // Ensure timerInterval is not undefined
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
				console.error("Impossible to get the 2D context of the canvas");
				return;
			}
		} else {
			console.error("The canvas element is not available yet for initGrid.");
		}
	}

	async function generateGameLogic() {
		if (!ctx || !canvasElement) {
			console.error("Context or Canvas not initialized for generateGameLogic");
            if (canvasElement && !ctx) {
                console.log("Attempting to initialize the context in generateGameLogic");
                ctx = canvasElement.getContext('2d');
                if (!ctx) {
                    console.error("Failed to initialize the context in generateGameLogic");
                    return;
                }
            } else if (!canvasElement) {
                 console.error("CanvasElement not available in generateGameLogic");
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
				console.log("Speedrun finished! Score:", timerValue, "Pseudo:", nickname);
				stopTimer();
				finalTimeMs = timerValue; // Store final time
				isPlaying = false; // Stop game interactions
				showGameOverScreen = true; // Show the game over UI immediately

				// Perform score saving, ranking, and confetti in the background
				handleScoreSavingAndConfetti(nickname, finalTimeMs);
				return;
			}
		} else if (gameMode === "training") {
			// currentDifficulty is already set by initGrid(selectedTrainingDifficulty)
			// when the game started via confirmSettingsAndStartGame.
			// No need to change it here.
			// finalTimeMs and timer are not relevant.
			// isPlaying is already true.
			// currentLevel has been incremented.
			console.log(`Training mode: Starting attempt ${currentLevel} with difficulty ${currentDifficulty}`);
		} else if (gameMode === "infinite") {
			currentDifficulty = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
			finalTimeMs = 0;

			// Reset game state for a new speedrun with the same nickname
			isPlaying = true;
			// currentLevel = 0; // This will be incremented by generateGameLogic - already handled
			timerValue = 0;
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
		} else if (gameMode === "training") {
			console.log(`Training mode: Failed attempt at difficulty ${currentDifficulty}, attempt ${currentLevel}`);
			currentLevel = 0; // Reset attempt counter, generateGameLogic will increment to 1
			userClickedCells = [];
			levelFinished = false;
			isClicking = false;
			// Regenerate the level (same difficulty, new path)
			generateGameLogic(); // This will use the existing currentDifficulty (selectedTrainingDifficulty)
			return;
		}
		
		userClickedCells = [];
		levelFinished = false;
		isClicking = false;

		resetCellsVisualization(); 
	}

	function handleResetClick() {
		if (!isPlaying) return;
		
		userClickedCells = [];
		levelFinished = false;
		isClicking = false;

		if (gameMode === "speedrun") {
			console.log("Reset Clicked for Speedrun");
			stopTimer();
			startTimer();
			// Reset current level progress, but not currentLevel number itself for speedrun
			resetCellsVisualization();
		} else if (gameMode === "training") {
			console.log("Back to training difficulty selection (from Reset/Back button)");
			isPlaying = false; // This will take the user back to the difficulty selection UI
			// gameMode remains 'training'
			currentLevel = 0; // Reset attempts count for the difficulty level

			// Clear canvas
			if (ctx && canvasElement) {
				ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
			}
		} else if (gameMode === "infinite") {
			console.log("Reset Clicked for Infinite");
			currentLevel = 0; // This will be incremented by generateGameLogic
			generateGameLogic();
		} else {
			// Default for other modes if any
			console.log("Reset Clicked (default case)");
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

	// Function to explicitly handle difficulty selection for training mode
	function selectTrainingDifficulty(size: number) {
		selectedTrainingDifficulty = size;
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
					console.error('Subscription error or timed out:', err, 'Status:', status);
				}
			});

		// Start polling for scoreboard updates
		scoreboardPollInterval = window.setInterval(async () => {
			await fetchScoreboard();
		}, 5000); // 5000 milliseconds = 5 seconds
	});

	onDestroy(() => {
		stopTimer(); 
		if (speedrunScoresChannel) {
			supabase.removeChannel(speedrunScoresChannel)
				.then(() => console.log("Unsubscribed from speedrun_scores_changes"))
				.catch(err => console.error("Error unsubscribing:", err));
		}
		// Clear the polling interval
		if (scoreboardPollInterval !== undefined) {
			window.clearInterval(scoreboardPollInterval);
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
			<Button text="Speedrun" color="green" onClick={handlePlaySpeedrun} />
			<Button text="Training" color="blue" onClick={handlePlayTraining} />
			<!-- <Button text="Infinite" color="green" onClick={handlePlayInfinite} /> -->
			<Button text="Rules" color="blue" onClick={toggleRulesModal} />
			<Button text="Scoreboard" color="orange" href="/scoreboard" />
		</div>
	{/if}

	{#if !isPlaying && gameMode !== ''}
		{#if gameMode === 'speedrun'}
			<div class="nickname-container">
				<input
					type="text"
					class="difficulty-button game-button purple"
					value={nickname}
					on:input={handleNicknameInput}
					placeholder="Enter your nickname"
					maxlength="15"
				/>
			</div>
		{:else if gameMode === 'training'}
			<div class="difficulty-selector-container">
				<span class="difficulty-selector-title color-list-title">Choose difficulty (grid size):</span>
				{#key selectedTrainingDifficulty}
					<div class="difficulty-buttons">
						{#each [5, 6, 8] as size (size)}
							<Button
								text={String(size)}
								color={selectedTrainingDifficulty === size ? 'red' : 'blue'}
								onClick={() => selectTrainingDifficulty(size)}
								additionalClasses="difficulty-choice-button"
								animation=""
							/>
						{/each}
					</div>
				{/key}
			</div>
		{/if}

		<!-- Common elements for Speedrun (after nickname) and Training (after difficulty selection) -->
		<Button text="OK" color="green" onClick={confirmSettingsAndStartGame} disabled={gameMode === 'speedrun' && !isNicknameValid} animation="" />
		
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
		<Button text="Lobby" color="orange" onClick={handleLobbyClick} animation="" /> 
	{/if}

	{#if isPlaying}
		<div class="inGameButtons">
			<!-- <div class="timer game-button purple">{formatTime(timerValue)}</div> -->
			{#if gameMode === 'speedrun'}
				<Button text={formatTime(timerValue)} color="purple" animation="" disableHoverEffect={true} />
			{/if}
			<Button text="Lobby" color="orange" onClick={handleLobbyClick} animation="" /> 
			<Button 
				text={gameMode === 'training' ? "Back" : "Reset"} 
				color={gameMode === 'training' ? "blue" : "red"} 
				onClick={handleResetClick} 
				animation="" 
			/> 
		</div>
	{/if}
</div>

<div class="game-info">
	{#if isPlaying}
		<Button text="Level {currentLevel}" color="yellow" animation="" disableHoverEffect={true} additionalClasses="level difficulty-button" />
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
	<div class="modal {showRulesModal ? 'modal-box-bounce-animation is-visible' : 'modal-leave'}">
		<h2>Game Rules</h2>
		<p>
			The goal of the game is to <span class="rules-text-orange-outline">reproduce the highlighted path</span> on the grid.<br />
			<u>Click and drag</u> your mouse to draw your path.<br />
			- <strong><span class="rules-text-green-outline">Speedrun</span> :</strong> Complete 15 levels as fast as possible. Your time will be recorded on the scoreboard.<br />
			- <strong><span class="rules-text-blue-outline">Training</span> :</strong> Choose your grid size and practice as much as you want. Mistakes reset the current path.<br />
			- <strong><span class="rules-text-purple-outline">Infinite</span> :</strong> Play as many levels as you can. The difficulty increases randomly. <span class="rules-text-red-outline">(Coming soon!)</span><br /><br />
			Be careful, any mistake will make you <span class="rules-text-lightred-outline">restart the game</span> (in Speedrun) or <span class="rules-text-red-outline">end the game</span> (in Infinite).
		</p>
		<Button text="Close" color="orange" onClick={toggleRulesModal} animation="" />
	</div>
{/if}

<!-- Game Over Screen for Speedrun -->
{#if showGameOverScreen && gameMode === 'speedrun'}
	<div class="modal-backdrop" on:click={handleLobbyFromGameOver}></div>
	<div class="modal game-over-modal {showGameOverScreen ? 'modal-box-bounce-animation is-visible' : 'modal-leave'}">
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
			<Button text="Play Again" color="green" onClick={handlePlayAgainFromGameOver} animation="bounceInDown" />
			<Button text="Lobby" color="orange" onClick={handleLobbyFromGameOver} animation="bounceInDown" />
		</div>
	</div>
{/if}

<div class="footer-credit">
	Created by <a href="https://github.com/antaww" target="_blank" rel="noopener noreferrer">antaww</a>
</div>


